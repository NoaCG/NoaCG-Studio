// The dev-server PORT REGISTRY - how a checkout gets a port it can actually start on.
//
// WHY THIS EXISTS. The port is derived from the checkout path (deterministic, so a worktree
// keeps its number across restarts and every tool derives it independently without talking to
// anything). But a hash over 60 slots collides: with six worktrees on one machine, three
// hashed to the same port, and only the first could start - vite runs with strictPort, and the
// repo guards correctly refuse a hand-started server, a hand-picked port, or an edited
// launch.json. So the derived port is a PREFERENCE; this registry turns it into an ASSIGNMENT.
//
// SHAPE. One ticket FILE per reserved port, in the repo's shared git dir
// (<git-common-dir>/noacg-dev-ports/), which every worktree of the repo - and only this repo -
// can see:
//
//   5202.json  ->  { port, livePort, root, preferred, createdAt }
//
// A ticket is created with the exclusive 'wx' flag: the filesystem, not a lock we would have to
// police, decides who won when two WORKTREES start in the same instant. The loser gets EEXIST
// and walks to the next candidate.
//
// That settles "who gets THIS port". It does not settle "which port does THIS checkout get",
// because two tools in one worktree (vite and playwright, say) each run the whole walk and can
// write tickets on two different ports without ever colliding on a single file. Reconciling
// afterwards cannot work: whoever reads the registry first has already returned a port by the
// time the second writes, and the walk wraps, so the second can legitimately decide a LOWER
// port won and delete the one already handed out. So the walk runs under a per-root CLAIM LOCK:
//
//   claim-<hash of the root>.lock  ->  { root, pid, token, at }
//
// Two levels, two different keys, and nothing serialises across them - six worktrees still race
// for ports at full speed, because each holds a different claim lock while it does. A lock names
// the process holding it, so a waiter can tell a killed holder from a slow one and take over.
//
// WHO WRITES A TICKET. Only something about to START A SERVER (`allocatePort`, through
// `claimDevPorts` in dev-port.mjs). Asking which port a checkout has or would get is `peekPort`,
// which writes nothing and never throws. Until 2026-10-08 every question allocated: install,
// session start, `vite build` and every load of a Playwright config each minted a ticket that
// lived as long as the worktree, so 71 worktrees held all 60 ports and a fresh worktree could not
// even install (docs/work-specs/worktree-lifecycle/spec.md).
//
// OWNERSHIP RULES, all in one place:
//   - A ticket naming an ACTIVE worktree is honoured, whether or not its server is running, so
//     its number stays stable across restarts.
//   - ...until every port is held. Then a server start may take back the least recently claimed
//     ticket whose port and live port both answer nothing and which nobody has claimed for
//     RECLAIM_IDLE_MS. Its worktree gets a number again at its own next server start. A claim
//     refreshes the ticket's mtime, and the mtime is what "least recently claimed" reads.
//   - A ticket naming a worktree git no longer knows about is STALE and is reclaimed.
//   - A ticket we cannot parse blocks its slot but is never auto-deleted (a torn read during
//     someone else's write must not cost them their port). `--prune` clears those explicitly.
//   - A port that answers TCP while nobody holds a ticket for it belongs to something outside
//     this repo - a zombie server from a removed worktree, or an unrelated app. We give our
//     claim back and walk on. We never touch the process: killing another session's server is
//     the exact failure this mechanism exists to prevent.

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The approved dev-port block: even ports 5180-5298. Each odd neighbour is that port's live-e2e port. */
export const PORT_RANGE = Object.freeze({ first: 5180, last: 5298, stride: 2 });

/** How many ports the block holds (60). */
export const SLOT_COUNT = (PORT_RANGE.last - PORT_RANGE.first) / PORT_RANGE.stride + 1;

/** The fallback walk's stride in SLOTS. Coprime with SLOT_COUNT, so the walk visits every slot exactly once. */
const WALK_STEP = 7;

/** Human-readable form of the approved range, for error messages. */
export const PORT_RANGE_LABEL = `${PORT_RANGE.first}-${PORT_RANGE.last}`;

/** Absolute path with forward slashes, so tickets compare across Windows/posix spellings. */
export function normalizeRoot(path) {
  return resolve(path).replaceAll('\\', '/');
}

/** Case-insensitive checkout-path equality (Windows filesystems are case-insensitive). */
export function sameRoot(a, b) {
  return normalizeRoot(a).toLowerCase() === normalizeRoot(b).toLowerCase();
}

/** The slot a checkout path prefers: djb2 over the lowercased path - stable across runs. */
export function preferredSlot(root) {
  let h = 5381;
  for (const c of normalizeRoot(root).toLowerCase()) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h % SLOT_COUNT;
}

/** The port a checkout path prefers, before any collision handling. */
export function preferredPort(root) {
  return PORT_RANGE.first + PORT_RANGE.stride * preferredSlot(root);
}

/** The k-th candidate port for a checkout: its preference first, then a full deterministic walk. */
export function candidatePort(root, k) {
  const slot = (preferredSlot(root) + k * WALK_STEP) % SLOT_COUNT;
  return PORT_RANGE.first + PORT_RANGE.stride * slot;
}

/**
 * The reserved (even) port a server port belongs to: itself, or the dev port whose live-e2e
 * neighbour it is. Null outside the approved block - such a port is nobody's reservation.
 */
export function slotPortOf(port) {
  const n = Number(port);
  if (!Number.isInteger(n)) return null;
  const base = (n - PORT_RANGE.first) % PORT_RANGE.stride === 0 ? n : n - 1;
  return base >= PORT_RANGE.first && base <= PORT_RANGE.last ? base : null;
}

/**
 * How long a reservation must have gone unclaimed before a full registry may take it back. Ten
 * minutes covers the gap between a claim and the server answering on it, which is the only time
 * a reservation in use can look idle.
 */
export const RECLAIM_IDLE_MS = 10 * 60_000;

/** How often a waiter re-checks a claim lock it could not take. */
const LOCK_POLL_MS = 5;

/** How long a waiter waits on a LIVE holder before reporting the lock as wedged. */
const LOCK_WAIT_MS = 60_000;

/**
 * A lock this old is taken over even though its holder's pid still exists. Only a recycled pid
 * can get us here - no allocation runs for two minutes - and without it one would wedge a
 * checkout for good.
 */
const LOCK_MAX_AGE_MS = 120_000;

/** How long "access denied" is allowed to mean Windows' delete-pending rather than a real fault. */
const LOCK_DENIED_GRACE_MS = 1_000;

/**
 * Path of the lock that serialises allocation FOR ONE CHECKOUT. Named by a digest of the root
 * rather than the path itself, because a checkout path is longer than a filename may be and
 * contains separators. `listTickets` only matches `<port>.json`, so a lock is never a ticket.
 */
export function claimLockPath(registryDir, root) {
  const digest = createHash('sha1').update(normalizeRoot(root).toLowerCase()).digest('hex').slice(0, 16);
  return join(registryDir, `claim-${digest}.lock`);
}

/** Block this thread for `ms` without spinning - allocation is synchronous, so it cannot await. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Run `work` while holding the claim lock for `root`, so only one process at a time decides that
 * checkout's port.
 *
 * A process killed mid-allocation would otherwise wedge its checkout for good, so a lock names
 * the PID that took it and a waiter takes it over once that process is gone. Liveness, not a
 * timer: a walk that probes sixty candidates spawns a child per candidate and can legitimately
 * run for seconds, and any deadline short enough to reclaim a crash quickly is short enough to
 * rob a slow walk - which would put two allocations for one checkout back inside the very window
 * this lock closes. The lock also carries a one-off token, so a holder can only ever delete the
 * lock that is still its own.
 */
function withClaimLock(registryDir, root, work) {
  const path = claimLockPath(registryDir, root);
  const mine = { root: normalizeRoot(root), pid: process.pid, token: randomUUID(), at: Date.now() };
  const giveUpAt = Date.now() + LOCK_WAIT_MS;
  let deniedSince = 0;

  for (;;) {
    try {
      writeFileSync(path, JSON.stringify(mine) + '\n', { flag: 'wx' });
      break;
    } catch (err) {
      // EEXIST is the ordinary loser. On Windows a file another process is deleting stays
      // un-openable for a moment after the delete is issued and an exclusive create against it
      // fails with access denied instead - measured here with sixteen tools claiming at once.
      // A registry we genuinely may not write to raises the same code and must not be mistaken
      // for that, so it is tolerated only while there is no lock file to blame it on, and only
      // for far longer than that delete window ever lasts.
      const denied = err?.code === 'EPERM' || err?.code === 'EACCES';
      if (err?.code !== 'EEXIST' && !denied) throw err;
      const held = readClaimLock(path);
      if (denied && !held) {
        deniedSince ||= Date.now();
        if (Date.now() - deniedSince > LOCK_DENIED_GRACE_MS) throw err;
      } else {
        deniedSince = 0;
        if (Date.now() > giveUpAt) {
          throw new Error(
            `Waited ${LOCK_WAIT_MS / 1000}s for the dev-port claim lock ${path} and never got it.\n` +
              `Nothing should hold it for more than a moment: delete that file if no dev server is starting up.`,
            { cause: err },
          );
        }
        if (isHolderGone(path, held)) takeOverClaimLock(path);
      }
      sleepSync(LOCK_POLL_MS);
    }
  }

  try {
    return work();
  } finally {
    releaseClaimLock(path, mine.token);
  }
}

/** The lock currently on `path`, or null when there is nothing readable there. */
function readClaimLock(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed?.token === 'string' && Number.isInteger(parsed?.pid) ? parsed : null;
  } catch {
    return null; // gone, or caught mid-write - either way there is nothing to judge yet
  }
}

/** True when the process that took this lock is gone, so a waiter may take it over. */
function isHolderGone(path, held) {
  if (!held) return ageOf(path) > LOCK_MAX_AGE_MS; // unreadable for two minutes: not a torn read
  if (Date.now() - held.at > LOCK_MAX_AGE_MS) return true; // only a recycled pid gets this far
  try {
    process.kill(held.pid, 0); // signal 0 asks "does this process exist?" and sends nothing
    return false;
  } catch (err) {
    return err?.code === 'ESRCH'; // EPERM means it exists and belongs to another user
  }
}

/** How long ago this file was written, or 0 when it is not there to judge. */
function ageOf(path) {
  try {
    return Date.now() - statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Take a dead holder's lock. Renaming it away first is what makes this safe: two waiters can
 * both decide the same lock is abandoned, but only one rename can succeed, so the loser finds
 * nothing to delete rather than deleting the winner's fresh lock.
 */
function takeOverClaimLock(path) {
  const dead = `${path}.${process.pid}.${Date.now()}.dead`;
  try {
    renameSync(path, dead);
  } catch {
    return; // somebody else got there first - just try the exclusive create again
  }
  removeQuietly(dead);
}

/** Give a lock back, but only while it is still ours - never undo somebody else's takeover. */
function releaseClaimLock(path, token) {
  if (readClaimLock(path)?.token !== token) return;
  removeQuietly(path);
}

/** Delete a file, riding out the same Windows delete-pending window that blocks a create. */
function removeQuietly(path) {
  try {
    rmSync(path, { force: true, maxRetries: 10, retryDelay: 10 });
  } catch {
    // Leave it: its holder is gone, so the next allocation for this checkout takes it over.
  }
}

/** Path of the ticket file that reserves `port`. */
export function ticketPath(registryDir, port) {
  return join(registryDir, `${port}.json`);
}

/**
 * The ticket reserving `port`, or null when the slot is free.
 * A file that exists but does not parse into a valid ticket comes back as
 * `{ port, corrupt: true }` - occupied, but never silently reclaimed.
 */
export function readTicket(registryDir, port) {
  const path = ticketPath(registryDir, port);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed?.root !== 'string' || parsed.port !== port) return { port, corrupt: true };
    return { ...parsed, port };
  } catch {
    return { port, corrupt: true };
  }
}

/** Every ticket currently in the registry, lowest port first. */
export function listTickets(registryDir) {
  let names;
  try {
    names = readdirSync(registryDir);
  } catch {
    return []; // no registry yet - nothing is reserved
  }
  return names
    .map((name) => /^(\d+)\.json$/.exec(name))
    .filter(Boolean)
    .map((m) => readTicket(registryDir, Number(m[1])))
    .filter(Boolean)
    .sort((a, b) => a.port - b.port);
}

/**
 * Give back every reservation held by `root`. Only ever removes tickets that name `root`, so
 * one checkout can never release another's port.
 * Returns the ports released.
 */
export function releaseReservation(registryDir, root) {
  const released = [];
  for (const ticket of listTickets(registryDir)) {
    if (ticket.corrupt || !sameRoot(ticket.root, root)) continue;
    rmSync(ticketPath(registryDir, ticket.port), { force: true });
    released.push(ticket.port);
  }
  return released;
}

/**
 * Drop reservations whose worktree is gone (and, with `includeCorrupt`, tickets that no longer
 * parse). Never touches a ticket belonging to an active checkout, and never touches a process.
 * Returns the removed tickets.
 */
export function pruneStaleReservations({ registryDir, isRootActive, includeCorrupt = false }) {
  const removed = [];
  for (const ticket of listTickets(registryDir)) {
    const stale = ticket.corrupt ? includeCorrupt : !isRootActive(ticket.root);
    if (!stale) continue;
    rmSync(ticketPath(registryDir, ticket.port), { force: true });
    removed.push(ticket);
  }
  return removed;
}

/**
 * RESERVE a port for `root`, because a server is about to start there: its existing reservation,
 * or a fresh one taken from the approved range starting at its preference, or - when every port
 * is held - one taken back from an idle worktree (see the ownership rules at the top).
 *
 * Nothing that does not start a server may call this; `peekPort` answers the same question
 * without writing.
 *
 * @param root          checkout path the port belongs to
 * @param registryDir   the shared ticket directory
 * @param isRootActive  (path) => boolean - is that checkout still a live worktree?
 * @param isPortBusy    (port) => boolean - is something already listening there?
 * @param now           () => ISO string, injectable so tests stay deterministic
 * @param port          the port the server was TOLD to use (`vite --port`), or null. It must be
 *                      this checkout's reservation or become it; a server never quietly moves.
 * @param nowMs         () => epoch ms, for the idle test
 * @returns { port, livePort, root, preferred, createdAt, reused, reclaimedFrom? }
 * @throws when every port is held and none is idle, or `port` cannot be this checkout's
 */
export function allocatePort({
  root,
  registryDir,
  isRootActive,
  isPortBusy = () => false,
  now = () => new Date().toISOString(),
  port: wanted = null,
  nowMs = Date.now,
}) {
  const me = normalizeRoot(root);
  const exact = wanted == null ? null : slotPortOf(wanted);
  if (wanted != null && exact === null) {
    throw new Error(
      `Port ${wanted} is outside the approved range ${PORT_RANGE_LABEL}, so no reservation can back it. ` +
        `Set DEV_PORT=${wanted} to run on it without one.`,
    );
  }
  mkdirSync(registryDir, { recursive: true });
  // Everything below is ONE decision for this checkout - read the registry, pick a port, write
  // the ticket - and it has to be indivisible. Two tools in this worktree that each ran it
  // concurrently would each see no ticket for us and each claim a port, and no after-the-fact
  // reconciliation can repair that: by then the first has already returned its number.
  return withClaimLock(registryDir, me, () =>
    allocateUnderClaim({ me, registryDir, isRootActive, isPortBusy, now, exact, nowMs }),
  );
}

/** The allocation itself. Only ever called with this checkout's claim lock held. */
function allocateUnderClaim({ me, registryDir, isRootActive, isPortBusy, now, exact, nowMs }) {
  // 1. Already assigned? The ticket IS the assignment - that is what makes the number survive
  //    restarts, and what every other tool reads instead of re-deciding. More than one ticket
  //    can only be left over from a version of this file that allocated without the lock;
  //    keep the lowest and give the rest back.
  const existing = ticketsFor(registryDir, me);
  if (existing.length > 0) {
    const held = collapseToLowest(registryDir, existing);
    if (exact !== null && held.port !== exact) {
      throw new Error(
        `${me} holds dev port ${held.port}, but this server was told to use ${exact}. ` +
          'Something resolved the port without reading the reservation - start it with ' +
          '`npm run dev:worktree`, or check `node scripts/dev-port.mjs --json`.',
      );
    }
    // The claim refreshes the ticket's mtime, which is what keeps it from looking idle to a
    // full registry. A ticket that vanished between the read and the touch WAS taken back just
    // now - fall through and claim afresh.
    if (touchTicket(ticketPath(registryDir, held.port), nowMs())) return { ...held, reused: true };
  }

  // 2. Walk the range from this checkout's preference - or only the port the server was told.
  const candidates = exact !== null ? [exact] : Array.from({ length: SLOT_COUNT }, (_, k) => candidatePort(me, k));
  const blocked = [];
  for (const port of candidates) {
    const held = readTicket(registryDir, port);
    if (held) {
      if (held.corrupt) {
        blocked.push(`${port} - unreadable reservation (clear it with \`node scripts/dev-port.mjs --prune\`)`);
        continue;
      }
      if (isRootActive(held.root)) {
        blocked.push(`${port} - reserved by ${held.root}`);
        continue;
      }
      // Its worktree is gone: the reservation is stale, so take the slot back.
      rmSync(ticketPath(registryDir, port), { force: true });
    }

    const ticket = { port, livePort: port + 1, root: me, preferred: preferredPort(me), createdAt: now() };
    try {
      writeFileSync(ticketPath(registryDir, port), JSON.stringify(ticket, null, 2) + '\n', { flag: 'wx' });
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
      // Another checkout claimed this port between our read and our write. It won; walk on.
      blocked.push(`${port} - claimed by another checkout while starting up`);
      continue;
    }

    // We hold the claim. A listener now means a process outside this registry owns the port.
    // Hand the claim back and keep walking - we never kill what we did not start.
    if (isPortBusy(port) || isPortBusy(port + 1)) {
      rmSync(ticketPath(registryDir, port), { force: true });
      blocked.push(`${port} - a process outside this repo is listening on ${port} or ${port + 1}`);
      continue;
    }

    // This is the only ticket this checkout can hold: step 1 found none, and the claim lock
    // keeps any other tool in this worktree out until we have returned.
    return { ...ticket, reused: false };
  }

  // 3. Every candidate is held. Take back the reservation nobody is using.
  for (const victim of idleReservations({ registryDir, me, nowMs, only: exact })) {
    const ticket = takeBack({ registryDir, victim, me, isPortBusy, now, nowMs });
    if (ticket) return { ...ticket, reused: false, reclaimedFrom: victim.root };
  }

  throw new Error(
    `No dev-server port is available for ${me}.\n` +
      `${exact !== null ? `Port ${exact} is` : `All ${SLOT_COUNT} ports in the approved range ${PORT_RANGE_LABEL} are`} ` +
      `taken, and none is idle (idle means nothing listening and unclaimed for ${RECLAIM_IDLE_MS / 60_000} minutes):\n` +
      blocked.map((line) => `  ${line}`).join('\n') +
      '\nRun `node scripts/dev-port.mjs --list` to see who holds what. Nothing here stops a build ' +
      'or a test that starts no server - only a server start needs a reservation.',
  );
}

/**
 * Which port `root` HAS, or WOULD GET if a server started there now - without writing anything
 * and without throwing. This is what every config file, test, hook and sweep asks.
 *
 * Returns `{ port, livePort, root, preferred, reserved, reclaims?, exhausted? }`: `reserved` says
 * whether a ticket backs the number, `reclaims` names the idle worktree a claim would take it
 * from, and `exhausted` means even that found nothing, so the answer is just the preference.
 */
export function peekPort({ root, registryDir, isRootActive, isPortBusy = () => false, nowMs = Date.now }) {
  const me = normalizeRoot(root);
  const preferred = preferredPort(me);
  const answer = (port, extra = {}) => ({ port, livePort: port + 1, root: me, preferred, reserved: false, ...extra });
  try {
    const existing = ticketsFor(registryDir, me);
    if (existing.length > 0) return { ...existing[0], preferred: existing[0].preferred ?? preferred, reserved: true };
    for (let k = 0; k < SLOT_COUNT; k++) {
      const port = candidatePort(me, k);
      const held = readTicket(registryDir, port);
      if (held && (held.corrupt || isRootActive(held.root))) continue;
      if (isPortBusy(port) || isPortBusy(port + 1)) continue;
      return answer(port);
    }
    const victim = idleReservations({ registryDir, me, nowMs }).find(
      (ticket) => !isPortBusy(ticket.port) && !isPortBusy(ticket.port + 1),
    );
    if (victim) return answer(victim.port, { reclaims: victim.root });
  } catch {
    // A registry we cannot read answers with the preference: a question must never fail.
  }
  return answer(preferred, { exhausted: true });
}

/** When a ticket was last claimed (its mtime), or null when it is not there. */
function claimedAtOf(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/** Mark a ticket claimed now. False only when the ticket is gone. */
function touchTicket(path, atMs) {
  try {
    utimesSync(path, atMs / 1000, atMs / 1000);
    return true;
  } catch (err) {
    return err?.code !== 'ENOENT';
  }
}

/**
 * Reservations of OTHER checkouts that nobody has claimed for RECLAIM_IDLE_MS, oldest claim
 * first. Whether something listens on them is asked only when one is actually taken, because each
 * probe spawns a process.
 */
function idleReservations({ registryDir, me, nowMs, only = null }) {
  const now = nowMs();
  return listTickets(registryDir)
    .filter((ticket) => !ticket.corrupt && !sameRoot(ticket.root, me) && (only === null || ticket.port === only))
    .map((ticket) => ({ ...ticket, claimedAt: claimedAtOf(ticketPath(registryDir, ticket.port)) }))
    .filter((ticket) => ticket.claimedAt !== null && now - ticket.claimedAt >= RECLAIM_IDLE_MS)
    .sort((a, b) => a.claimedAt - b.claimedAt);
}

/**
 * Take an idle reservation for `me`. The ticket is RENAMED away first, so two claimants cannot
 * both take it, and its mtime is read again afterwards: its owner may have claimed it in the
 * instant between, and a fresh claim is put back rather than stolen. Its owner, finding its
 * ticket gone at its next claim, simply walks for a new one. Returns our ticket, or null.
 */
function takeBack({ registryDir, victim, me, isPortBusy, now, nowMs }) {
  const { port } = victim;
  if (isPortBusy(port) || isPortBusy(port + 1)) return null;
  const path = ticketPath(registryDir, port);
  const aside = `${path}.${process.pid}.${Date.now()}.reclaimed`;
  try {
    renameSync(path, aside);
  } catch {
    return null; // somebody else moved it first
  }
  const claimedAt = claimedAtOf(aside);
  if (claimedAt === null || nowMs() - claimedAt < RECLAIM_IDLE_MS) {
    // Its owner claimed it after we judged it idle. Put it back - unless the slot was written
    // meanwhile, in which case the slot is somebody's either way and ours to give up.
    try {
      writeFileSync(path, readFileSync(aside, 'utf8'), { flag: 'wx' });
    } catch {
      // leave the slot to whoever holds it now
    }
    removeQuietly(aside);
    return null;
  }
  const ticket = { port, livePort: port + 1, root: me, preferred: preferredPort(me), createdAt: now() };
  try {
    writeFileSync(path, JSON.stringify(ticket, null, 2) + '\n', { flag: 'wx' });
  } catch {
    removeQuietly(aside);
    return null;
  }
  removeQuietly(aside);
  return ticket;
}

/** Tickets naming `root`, lowest port first. */
function ticketsFor(registryDir, root) {
  return listTickets(registryDir).filter((t) => !t.corrupt && sameRoot(t.root, root));
}

/** Keep the lowest-numbered ticket of a set and release the rest; returns the survivor. */
function collapseToLowest(registryDir, tickets) {
  const [winner, ...rest] = tickets;
  for (const extra of rest) rmSync(ticketPath(registryDir, extra.port), { force: true });
  return winner;
}
