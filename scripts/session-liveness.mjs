// Is anybody SITTING in this worktree right now?
//
// Containment answers "can this deletion lose committed work?" - it cannot, by construction.
// It does not answer the other question an unattended sweep has to get right: whether a session
// is still open in that folder. A session that landed its branch through the merge queue and is
// still mid-conversation has a clean tree and a fully contained branch, so every containment
// rule says "eligible" while pulling the floor out from under it.
//
// THE SIGNAL. Claude Code appends every turn to a JSONL transcript as it happens, under
// ~/.claude/projects/<sanitised-cwd>/, where the directory name is the session's working
// directory with every character outside [A-Za-z0-9-] replaced by a dash (so
// C:\claude\NoaCG-Studio\.claude\worktrees\x becomes
// C--claude-NoaCG-Studio--claude-worktrees-x). The newest mtime under that directory is the
// last moment a session did anything in that worktree. scripts/blocked-sessions.mjs reads the
// same tree for a different question.
//
// TWO LOOKUPS, BECAUSE ONE MISSES THE COMMONEST CASE. A worktree-isolated SUBAGENT does not get
// a directory of its own: its transcript is filed under the PARENT session's directory as
// <session>/subagents/<agent>.jsonl, and the parent's cwd is the primary checkout. Measured on
// this machine: nineteen `agent-*` worktrees existed and exactly three had a directory named
// after them, so the by-name lookup alone reported almost every live agent worktree as idle. So
// this also sweeps the transcripts CHANGED INSIDE THE IDLE WINDOW - a handful of files, since
// mtime filters before anything is opened - and reads each one's tail for the `cwd` its turns
// record. Only that field is taken from the file.
//
// WHAT THIS DOES NOT SEE, stated plainly because the sweep relies on it. A session that is not
// Claude Code writes nothing here: a Codex session, or a plain shell, in a worktree whose branch
// has landed leaves no signal at all, and this reports it as nobody's. Nor is every agent
// worktree locked - measured on this machine, 3 of 23 were, all of them agents running right
// then - so the lock is a real signal but covers only live subagents.
//
// That fail-open is deliberate and is confined to POLITENESS. Nothing here is what makes a
// deletion safe: containment against a fresh origin/main is, and it fails closed, as do the
// uncommitted-changes check, the in-progress-operation check and archive verification. The worst
// this guard can do by missing a session is delete a folder whose work is already on main -
// annoying, never lossy.
//
// THE THIRD SIGNAL, added on top of both lookups: Claude Code's own live-session inventory
// (scripts/claude-agents.mjs), which answers with a PROCESS rather than a file mtime. Only its
// POSITIVE verdict is used here - a live session whose working directory is inside this worktree
// holds it, whatever the transcripts say, and the hold has no idle window to age out of. The
// negative verdict is deliberately ignored: "the inventory does not list one" is evidence a
// session ended, and evidence is not what may authorise a deletion. Containment is.

import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { inventoryIndex, livenessFor, resetInventoryCache } from './claude-agents.mjs';

/** Minutes of transcript silence before a worktree counts as nobody's. */
export const MIN_IDLE_MINUTES_ENV = 'NOACG_CLEANUP_MIN_IDLE_MINUTES';
export const DEFAULT_MIN_IDLE_MINUTES = 120;

export function minIdleMinutes({ env = process.env } = {}) {
  // `Number('')` and `Number('   ')` are 0, finite and >= 0, so an env var set to an empty string
  // - a wrapper expanding an unset variable, a blank line in an env file - used to switch the
  // guard OFF entirely and say nothing, while a typo correctly fell back to the default.
  const configured = env[MIN_IDLE_MINUTES_ENV];
  if (typeof configured !== 'string' || configured.trim() === '') return DEFAULT_MIN_IDLE_MINUTES;
  const raw = Number(configured);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MIN_IDLE_MINUTES;
}

export function transcriptsRoot(home = homedir()) {
  return join(home, '.claude', 'projects');
}

/**
 * The transcript directory name Claude Code derives from a working directory: every character
 * outside [A-Za-z0-9-] becomes a dash, one for one, so path separators and the drive colon each
 * contribute their own.
 */
export function projectDirName(worktreePath) {
  return resolve(worktreePath).replaceAll('\\', '/').replace(/[^A-Za-z0-9-]/g, '-');
}

/**
 * When a session last wrote a turn in `worktreePath`, as
 * `{ available, found, lastActiveMs, idleMinutes }`.
 *
 * `available: false` means there is no transcript tree to read at all. `found: false` means the
 * tree exists but has never held a session for this path.
 */
export function lastSessionActivity(
  worktreePath,
  { root = transcriptsRoot(), now = Date.now(), exists = existsSync } = {},
) {
  if (!exists(root)) return { available: false, found: false, lastActiveMs: null, idleMinutes: null };

  const dir = join(root, projectDirName(worktreePath));
  if (!exists(dir)) return { available: true, found: false, lastActiveMs: null, idleMinutes: null };

  const newest = newestTranscript(dir, 0);
  if (newest === null) return { available: true, found: false, lastActiveMs: null, idleMinutes: null };
  return {
    available: true,
    found: true,
    lastActiveMs: newest,
    idleMinutes: Math.max(0, Math.round((now - newest) / 60_000)),
  };
}

/**
 * When ONE session last wrote a turn: its own transcript, or any of its subagents' (filed under
 * `<session>/subagents/`), so a session whose wave is working reads as working. Null when neither
 * exists. Never throws.
 */
export function sessionLastActiveMs(cwd, sessionId, { root = transcriptsRoot() } = {}) {
  const dir = join(root, projectDirName(cwd));
  let own = null;
  try {
    own = statSync(join(dir, `${sessionId}.jsonl`)).mtimeMs;
  } catch {
    /* no transcript of its own yet */
  }
  const nested = newestTranscript(join(dir, sessionId), 0);
  return own === null ? nested : nested === null ? own : Math.max(own, nested);
}

/** Newest *.jsonl mtime under `dir`, one level of `subagents/` included. Never throws. */
function newestTranscript(dir, depth) {
  if (depth > 2) return null;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  let newest = null;
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = newestTranscript(full, depth + 1);
      if (nested !== null && (newest === null || nested > newest)) newest = nested;
    } else if (entry.name.endsWith('.jsonl')) {
      try {
        const { mtimeMs } = statSync(full);
        if (newest === null || mtimeMs > newest) newest = mtimeMs;
      } catch {
        /* vanished between readdir and stat */
      }
    }
  }
  return newest;
}

/** How much of a transcript's tail to read when looking for the cwd its turns record. */
const TAIL_BYTES = 64 * 1024;

/**
 * Every working directory a transcript touched inside `windowMs`, as `Map(cwd -> newest mtime)`.
 *
 * This is the lookup that sees worktree-isolated subagents, whose transcripts are filed under
 * their PARENT session's directory. mtime filters first, so only the few files written inside
 * the window are opened at all, and only their `cwd` field is used.
 */
export function recentSessionCwds({ root = transcriptsRoot(), now = Date.now(), windowMs } = {}) {
  const cutoff = now - (windowMs ?? DEFAULT_MIN_IDLE_MINUTES * 60_000);
  const seen = new Map();
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.name.endsWith('.jsonl')) continue;
      let mtimeMs;
      try {
        ({ mtimeMs } = statSync(full));
      } catch {
        continue;
      }
      if (mtimeMs < cutoff) continue;
      const cwd = transcriptCwd(full);
      if (!cwd) continue;
      const previous = seen.get(cwd);
      if (previous === undefined || mtimeMs > previous) seen.set(cwd, mtimeMs);
    }
  };
  walk(root, 0);
  return seen;
}

/** The working directory the newest complete turn in a transcript records, or null. */
function transcriptCwd(file) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const { size } = statSync(file);
    const from = Math.max(0, size - TAIL_BYTES);
    const buffer = Buffer.alloc(size - from);
    readSync(fd, buffer, 0, buffer.length, from);
    const lines = buffer.toString('utf8').split('\n');
    if (from > 0) lines.shift(); // the first line is a fragment
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line || line[0] !== '{') continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue; // a partial final line: the session is mid-write
      }
      if (typeof entry?.cwd === 'string' && entry.cwd) {
        return resolve(entry.cwd).replaceAll('\\', '/').toLowerCase();
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * One scan of the transcript tree per process. A sweep asks this question once per worktree and
 * the answer is the same every time; rescanning would be the slowest thing the sweep does.
 */
const scanCache = new Map();
export function resetSessionScanCache() {
  scanCache.clear();
  resetInventoryCache();
}

function scanOnce(options) {
  if (options.recentCwds) return options.recentCwds;
  const key = `${options.root}|${options.windowMs}`;
  if (!scanCache.has(key)) scanCache.set(key, recentSessionCwds(options));
  return scanCache.get(key);
}

/**
 * Should a sweep leave this worktree alone because somebody is in it? Returns
 * `{ busy, why, activity }` - `why` is null when nothing is holding it.
 */
export function sessionHold(worktreePath, options = {}) {
  const minutes = options.minIdleMinutes ?? minIdleMinutes(options);
  const root = options.root ?? transcriptsRoot();
  const exists = options.exists ?? existsSync;

  // The process signal is asked FIRST and answers on its own, because it is the only one of the
  // three that does not age: a running session holds its worktree at minute zero and at hour six
  // alike, and no idle window should ever release it.
  const live = inventoryIndex(options);
  if (live.available) {
    const verdict = livenessFor({ cwd: worktreePath }, live.index, { available: true });
    if (verdict.verdict === 'live') {
      return {
        busy: true,
        why: `a live session is running here (pid ${verdict.row?.pid ?? '?'})`,
        activity: { available: true, found: true, lastActiveMs: options.now ?? Date.now(), idleMinutes: 0 },
      };
    }
  }

  if (!exists(root)) {
    return { busy: false, why: null, activity: { available: false, found: false, idleMinutes: null } };
  }

  const byName = lastSessionActivity(worktreePath, { ...options, root, exists });
  const now = options.now ?? Date.now();
  const scan = scanOnce({ ...options, root, now, windowMs: minutes * 60_000 });
  const here = resolve(worktreePath).replaceAll('\\', '/').toLowerCase();
  let newest = byName.found ? byName.lastActiveMs : null;
  for (const [cwd, mtimeMs] of scan) {
    if (cwd !== here && !cwd.startsWith(`${here}/`)) continue;
    if (newest === null || mtimeMs > newest) newest = mtimeMs;
  }

  if (newest === null) {
    return { busy: false, why: null, activity: { available: true, found: false, idleMinutes: null } };
  }
  const idleMinutes = Math.max(0, Math.round((now - newest) / 60_000));
  const activity = { available: true, found: true, lastActiveMs: newest, idleMinutes };
  if (idleMinutes >= minutes) return { busy: false, why: null, activity };
  return {
    busy: true,
    why: `a session was active here ${idleMinutes} minute(s) ago (quiet for ${minutes} is required)`,
    activity,
  };
}
