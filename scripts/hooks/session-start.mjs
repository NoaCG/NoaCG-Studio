// SessionStart hook: sanity-check the session's checkout before any work happens.
//
// The client's "worktree" checkbox sometimes scaffolds .claude/worktrees/<name>/ WITHOUT
// running `git worktree add` - an unregistered stub whose file and git operations silently
// fall through to the primary checkout, where they can collide with other sessions' work
// (this has caused real cross-session clobbering; see the worktree notes in AGENTS.md).
// This hook compares the session cwd against `git worktree list` and warns loudly when
// that is happening; otherwise it prints a one-line orientation (checkout, branch, and
// this checkout's dev/live ports). SessionStart stdout is added to the agent's context.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readHookInput } from './lib.mjs';
import { HOME_RELATIVE_PATH } from '../orchestrator-home.mjs';
import { reattachMainIfSafe } from '../reattach-main.mjs';
import { formatActivity, formatBranches, scanActivity } from '../worktree-activity.mjs';
import { sweepEmptyLeftoverFolders } from '../worktree-cleanup-lib.mjs';

const input = await readHookInput();
const sessionCwd = normalize(input?.cwd ?? process.cwd());

// All registered checkouts, primary first (git worktree list order). Run from the session
// cwd: in an unregistered stub git walks up to the primary checkout, which is exactly the
// fall-through this hook exists to detect.
const roots = gitLines(['worktree', 'list', '--porcelain'], sessionCwd)
  .filter((line) => line.startsWith('worktree '))
  .map((line) => normalize(line.slice('worktree '.length)));
if (roots.length === 0) process.exit(0); // not a git checkout - nothing to check

// Sweep leftover EMPTY worktree folders (shared rule with cleanup-worktrees). `git worktree
// remove` on Windows can't delete the folder while a session is cwd'd inside it, so it
// deregisters the worktree and empties the files but leaves the now-empty directory behind.
// Once that session ends the folder unlocks; the next session removes it here. The helper is
// strictly conservative: only a COMPLETELY EMPTY, git-UNREGISTERED folder that isn't this
// session's own cwd is removed - a still-busy folder stays locked, and any non-empty stub is
// left for the warning below.
const { removed } = sweepEmptyLeftoverFolders({
  primaryRoot: roots[0],
  registeredRoots: roots,
  protect: [sessionCwd],
});
for (const dir of removed) {
  console.log(`Cleaned up an empty leftover worktree folder: ${dir}`);
}

// Keep the primary checkout on `main` - it is our canonical main worktree. The client parks
// it on a detached HEAD (same commit, off the branch) whenever it spins up a linked worktree,
// so `main` drifts off the root. Reattach it whenever that is unambiguously safe; the single
// shared definition of "safe" lives in scripts/reattach-main.mjs (also used by safe-merge).
// This never touches a dirty tree, real detached work, or a main that is checked out elsewhere.
try {
  const { assessment, message } = reattachMainIfSafe(roots[0]);
  if (message) {
    console.log(message);
  } else if (assessment.detached && !assessment.safe) {
    console.log(
      `Note: the primary checkout (${roots[0]}) is on a detached HEAD and was left as-is - ` +
        `${assessment.reason}. Reattach it to main manually once that clears.`,
    );
  }
} catch {
  // Self-heal is best-effort and must never block session start.
}

const isUnder = (path, root) => path.toLowerCase() === root.toLowerCase() || path.toLowerCase().startsWith(root.toLowerCase() + '/');

// An unregistered .claude/worktrees/<name> stub: the cwd names a worktree folder that git
// does not know about.
const stubRoot = sessionCwd.match(/^(.*?\/\.claude\/worktrees\/[^/]+)/i)?.[1];
if (stubRoot && !roots.some((root) => root.toLowerCase() === stubRoot.toLowerCase())) {
  console.log(
    `WARNING - worktree sanity check FAILED. This session's cwd (${sessionCwd}) sits under ` +
      '.claude/worktrees/ but is NOT a registered git worktree, so every file and git operation ' +
      `silently falls through to the primary checkout (${roots[0]}), which other sessions may be ` +
      'using concurrently. Do not edit anything yet. Fix first:\n' +
      "  1. If this session's branch already exists (git branch --list 'claude/*'), register the " +
      `folder onto it: git worktree add "${sessionCwd}" <branch> - this works on an empty directory.\n` +
      '  2. Otherwise create a real worktree with the EnterWorktree tool.\n' +
      '  3. If the folder is unexpectedly non-empty, another session may own it - check before touching it.',
  );
  process.exit(0);
}

// Registered checkout: print a short orientation line. The checkout root is the most
// specific registered root containing the cwd (the primary root contains the linked
// worktrees' paths, so longest match wins).
const root = roots.filter((r) => isUnder(sessionCwd, r)).sort((a, b) => b.length - a.length)[0];
if (!root) process.exit(0); // cwd outside every checkout (shouldn't happen) - stay quiet

const branch = gitLines(['rev-parse', '--abbrev-ref', 'HEAD'], root)[0] ?? 'unknown';
const branchLabel = branch === 'HEAD' ? 'detached HEAD' : `branch ${branch}`;
const orchestratorHome = normalize(join(roots[0], ...HOME_RELATIVE_PATH.split('/')));
const isOrchestratorHome = root.toLowerCase() === orchestratorHome.toLowerCase();
const kind = root.toLowerCase() === roots[0].toLowerCase()
  ? 'primary checkout'
  : isOrchestratorHome
    ? 'orchestrator home'
    : 'linked worktree';
let ports = '';
try {
  // This checkout's copy resolves the port from its own location - correct per-worktree.
  const devPortModule = join(root, 'scripts', 'dev-port.mjs');
  if (existsSync(devPortModule)) {
    const { devPorts, pruneStalePorts } = await import(pathToFileURL(devPortModule));
    // Reservations outlive the worktrees that took them (a removed worktree cannot give its
    // own port back). Session start is where the registry gets swept, same as the folders.
    const released = pruneStalePorts?.() ?? [];
    if (released.length > 0) {
      console.log(`Released dev-port reservations left by removed worktrees: ${released.map((t) => t.port).join(', ')}.`);
    }
    if (isOrchestratorHome) {
      // The orchestrator's permanent home runs no dev server, so it must not mint a ticket
      // from the 5180-5298 block just because a session opened there - and it never gives one
      // back, because it is never removed (docs/DEV_PORTS.md, .agent-workflows/orchestrator.md).
      // `npm run dev` there would still resolve a port on demand; nothing is taken up front.
      ports = ' - no dev port (the orchestrator home runs no server)';
    } else {
      const record = devPorts();
      ports = ` - dev port ${record.port}, live e2e port ${record.livePort}`;
      // Say so when the deterministic preference was taken: the number is still stable, but it
      // is not the one the path hashes to, and that is worth seeing before debugging a URL.
      if (record.preferred !== record.port) ports += ` (preferred ${record.preferred} was taken)`;
    }
  }
} catch {
  // older checkout without the module - skip the port info
}
console.log(`Checkout: ${root} (${kind}, ${branchLabel})${ports}.`);

// A SESSION SERVES THE CHECKOUT IT SITS IN, and that is not always the one it is working on.
// Driving a worktree from the primary checkout by absolute path works for git and for editing,
// and then quietly does not for everything that resolves per-checkout: `preview_start` reads
// THIS checkout's launch.json, the dev port is THIS checkout's, and the sweeps that need a
// running dev server look for it there. On 2026-08-29 that cost one session its SVG sweep
// outright ("a linked worktree cannot get one") and gave another its sweep timings against the
// wrong server. Neither noticed from inside. Said once, at the start, where it is still cheap
// to act on - it is information, not a warning: being on `main` here is what this checkout is
// for, and the merge queue runs from it.
if (kind === 'primary checkout') {
  console.log(
    'This session sits in the PRIMARY checkout. Feature work belongs in a worktree (AGENTS.md ' +
      '"Git"), and everything that resolves per-checkout serves THIS one: preview_start starts ' +
      'the dev server on the port printed above, and the sweeps that need a running dev server ' +
      'look for it there. A worktree driven from here by absolute path gets the wrong server, ' +
      'silently. To work on a branch: git worktree add -b <branch> .claude/worktrees/<name> main, ' +
      'then start the session in that folder.',
  );
}

// Cross-worktree activity awareness: several worktrees are usually being worked in parallel
// (see AGENTS.md), so before the first prompt lands, surface what files are already in flight
// elsewhere - both uncommitted changes and commits already made but not yet merged into main.
// This is a ONE-TIME snapshot taken at session start, not a live watch: a worktree that starts
// touching a file after this session begins won't show up here (the `next` workflow re-runs the
// same scanner live, for exactly that reason). It only ever prints information for the agent to
// reason about - it never blocks or warns definitively, since two sessions touching the same
// file isn't necessarily a problem, just something worth knowing about.
try {
  const { worktrees, branches } = await scanActivity(root);
  if (worktrees.length > 0) {
    console.log('');
    console.log(
      'Other worktrees with files currently uncommitted or committed-but-not-yet-merged there ' +
        '(snapshot at session start - check before touching the same files; re-check live with ' +
        '`node scripts/worktree-activity.mjs`):',
    );
    for (const line of formatActivity(worktrees, { fileLimit: 15 })) console.log(line);
  }
  if (branches.length > 0) {
    console.log('');
    console.log(
      'Unmerged branches with no worktree checked out on them - a closed session leaves its ' +
        'work here, so these files are still in flight even though nobody is in them right now:',
    );
    for (const line of formatBranches(branches, { fileLimit: 15, branchLimit: 5 })) console.log(line);
  }
} catch {
  // Best-effort awareness only - must never block session start.
}

// What the e2e suite is doing to this MACHINE right now, which no per-checkout signal shows.
// Two things are worth knowing before a session starts running specs: someone else's suite is
// live (starting a second one exhausts the box rather than sharing it - see the guard hook's
// rule 4a), or a previous run was killed and left browsers behind holding RAM with nothing
// left to reap them. Both are invisible from inside one worktree and both cost real memory.
try {
  const { activeRuns, orphanProcesses } = await import('../e2e-runs.mjs');
  const runs = activeRuns({ exclude: root });
  if (runs.length > 0) {
    console.log('');
    console.log(
      'Browser-driving work (a suite, a catalog sweep or a bench) is ACTIVE in another checkout ' +
        'of this repo. Starting a second such job is blocked (guard hook rule 4a); use the ' +
        '`:queued` form of any e2e script to wait for it:',
    );
    for (const run of runs) {
      console.log(`  - ${run.root} (pid ${run.pid}, ${run.label}${run.elapsedMin === null ? '' : `, ${run.elapsedMin} min in`})`);
    }
  } else {
    const { workers, shells } = orphanProcesses();
    const heldMb = shells.reduce((sum, s) => sum + s.mb, 0);
    if (workers.length + shells.length > 0) {
      console.log('');
      console.log(
        `Leftover from a killed or crashed Playwright run: ${workers.length} worker(s) and ` +
          `${shells.length} browser shell(s) holding ~${heldMb} MB. No run is active, so nothing ` +
          'will reap them. Clear with `node scripts/e2e-runs.mjs --kill-orphans`.',
      );
    }
  }
} catch {
  // Same contract as above: awareness only, never a reason to fail session start.
}

// --- What is red on main right now -----------------------------------------------------------
//
// The rolling alarms (scripts/alarm-issues.mjs) are filed by five workflows and were read back by
// nobody. The landing queue gates on ci.yml alone, so a break in any other tier slows nothing
// down: issue #56 stood for eight hours and forty-three minutes overnight on 2026-09-05 with
// three landings stacked on top of it, and it was the owner who noticed. This is the cheapest
// place that cannot be skipped, for the same reason the receipts line below is here.
//
// Answered from a cache shared by every worktree, so the ordinary session start pays nothing and
// one fetch every ten minutes serves the whole machine. Silent when nothing is open.
try {
  const { formatAlarms, readAlarms } = await import('../alarm-issues.mjs');
  const { alarms, asOfMinutes } = readAlarms({ cwd: root, timeoutMs: 4000 });
  const lines = formatAlarms(alarms, { asOfMinutes });
  if (lines.length > 0) {
    console.log('');
    for (const line of lines) console.log(line);
  }
} catch {
  // Awareness only. GitHub being unreachable must never stop a session from starting.
}

// --- Owner receipts and the handoff drain ----------------------------------------------------
//
// An owner-raised task must be visible from the repository alone, in every session that could
// plan it (docs/backlog/README.md, "Owner receipts"). One line here is the cheapest place that
// cannot be skipped: it is in context before the first prompt. The handoff drain is the
// orchestrator's own bookkeeping, so it prints only in the orchestrator home.
try {
  const { formatReceipts, isStanding, readReceipts, stillOpen } = await import('../owner-receipts.mjs');
  const receipts = readReceipts(root).filter((receipt) => receipt.receipt && receipt.problems.length === 0);
  // The asks that stand, which is what he is owed. Findings are real work and reach a session
  // through the ordinary backlog drain, never under his name.
  const standing = receipts.filter(isStanding);
  if (standing.length > 0) {
    const oldest = Math.max(...standing.map((receipt) => receipt.ageDays ?? 0));
    console.log('');
    console.log(
      `Owner receipts: ${standing.length} standing ask(s) (oldest ${oldest} day(s)) - ` +
        'node scripts/owner-receipts.mjs lists what the owner asked for and when.',
    );
    // The home gets the slugs, one line each and capped: this is context every turn will carry,
    // and the full listing with the asks is one allowlisted command away.
    if (isOrchestratorHome) {
      const compact = formatReceipts(standing, { compact: true }).slice(1);
      for (const line of compact.slice(0, 12)) console.log(line);
      if (compact.length > 12) console.log(`  ... and ${compact.length - 12} more (node scripts/owner-receipts.mjs)`);
    }
  }
  // Findings are counted separately and never named here: they are our bugs, not his requirements,
  // and no plan has to account for one. But a defect he hit himself must not become invisible
  // just because it stopped being printed as an ask.
  const findings = receipts.filter((receipt) => stillOpen(receipt) && receipt.kind === 'finding');
  if (findings.length > 0) {
    console.log(`  plus ${findings.length} finding(s) raised while serving them - real work, never his requirement.`);
  }
  if (isOrchestratorHome) {
    const { drain, handoffFiles, newestWavePlan, parseHandoffSection } = await import('../handoff-drain.mjs');
    const { readFileSync } = await import('node:fs');
    const plan = newestWavePlan(root);
    const classified = plan ? parseHandoffSection(readFileSync(plan, 'utf8')) : new Map();
    const rows = drain(handoffFiles(root), classified);
    const unclassified = rows.filter((row) => row.flag === 'UNCLASSIFIED');
    if (rows.length > 0) {
      console.log('');
      console.log(
        `Handoff drain: ${rows.length} file(s) in docs/handoffs/, ${unclassified.length} unclassified` +
          `${plan ? ` against ${plan.split(/[\\/]/).pop()}` : ' (no fresh wave plan)'} - node scripts/handoff-drain.mjs lists them.`,
      );
    }
  }
} catch {
  // Awareness only - a receipt that cannot be read must never stop a session from starting.
}

// --- The job queue ---------------------------------------------------------------------------
//
// The queue's whole point is that waiting is VISIBLE (docs/JOB_RUNNER_PLAN.md). Printing it here
// is what turns "I came back and nothing had progressed" into something answerable without
// asking an agent: what is running, what is waiting and why, what finished while you were away,
// and whether the runner is alive to drain any of it.
try {
  const { readJobs, jobsDir } = await import('../jobs-store.mjs');
  const { pending, finishedSince, schedule } = await import('../jobs-store.mjs');
  const dir = jobsDir();
  const jobs = dir ? readJobs(dir) : [];

  if (jobs.length > 0) {
    const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    // PER WORKTREE, not per machine. One shared marker meant the first session to start that day
    // consumed everything terminal and every later session was told nothing - including the
    // session whose own branch had just been refused, which is the one that had to hear it. The
    // marker is small and the queue directory already holds hundreds of files, so a file per
    // checkout costs nothing next to a session that never learns its landing failed.
    const seenPath = join(dir, `last-seen-${seenKey(root)}.json`);
    // NO MARKER MEANS NO LAST SESSION HERE, which is not the same as "tell me everything". A
    // fortnight of retained jobs is 562 rows on this machine, and the first start in a checkout
    // printing eight of somebody else's landings teaches a reader to skip the section - which is
    // the section a refusal now arrives in. An UNREADABLE marker keeps the old answer: something
    // was written and cannot be read, so report the terminal work rather than assume it was seen.
    let since = Date.now();
    if (existsSync(seenPath)) {
      try {
        since = JSON.parse(readFileSync(seenPath, 'utf8')).at ?? 0;
      } catch {
        since = 0;
      }
    }
    const done = finishedSince(jobs, since);
    if (done.length > 0) {
      console.log('');
      console.log(`Queued work that finished since your last session (${done.length}):`);
      for (const job of done.slice(-8)) {
        const mark = job.state === 'done' ? 'green' : job.state.toUpperCase();
        console.log(`  ${mark}  ${job.id}  ${job.command}${job.state === 'done' ? '' : `  -> node scripts/jobs.mjs log ${job.id}`}`);
      }
    }

    // THE ONE LINE THIS WORKTREE'S SESSION MOST NEEDS. Its branch is in main; there is nothing
    // here left to merge, and the work is done unless someone says otherwise. Before the queue,
    // whoever ran the merge saw it happen; now a background runner does it, so it has to be said
    // out loud or the session keeps behaving as though it still has something to land.
    const {
      SHARDS_SKIPPED_REFUSAL, readLandings, landingForWorktree, refusalForWorktree,
    } = await import('../jobs-store.mjs');
    const mine = landingForWorktree(readLandings(dir), root);
    if (mine && (mine.at ?? 0) >= since) {
      console.log('');
      console.log(`THIS WORKTREE'S BRANCH HAS LANDED: ${mine.branch} is in main as ${String(mine.sha).slice(0, 8)}.`);
      console.log('  Merged and pushed - nothing here is waiting to merge.');
      console.log('  If the work is finished, run /handoff so the owner knows this session is done.');
    }

    // THE OTHER HALF OF THAT LINE, and the one that was missing. A landing runs in a background
    // runner, so a refusal is printed into a log in a directory nobody opens - and the session
    // that owns the branch, the only one that can commit a dirty tree or resolve a conflict, was
    // never told. The job record carries `checkout`, so the address was always there; this is what
    // reads it. Held is included on purpose: parked behind another branch is not a failure, but a
    // session that believes it is finished should know why nothing has landed.
    const refused = refusalForWorktree(jobs, root, { since, landedAt: mine?.at ?? 0 });
    if (refused) {
      console.log('');
      console.log(
        refused.held
          ? `THIS WORKTREE'S LANDING IS HELD: ${refused.branch} - ${refused.summary}.`
          : `THIS WORKTREE'S LANDING WAS REFUSED: ${refused.branch} - ${refused.summary}.`,
      );
      console.log(`  ${refused.job.id} (${refused.kind}) - node scripts/jobs.mjs log ${refused.job.id}`);
      // WHO ACTS, said exactly, because getting this wrong costs a whole night either way. A
      // session told the queue will handle a kind the queue never adopts waits for a retry that is
      // not coming; a session told to run a command the queue is about to run asks for a second
      // full suite. `byQueue` answers the first, and `ciDispatched` on the SAME kind answers the
      // second - it is checked against the kind rather than on its own, or a retry minted for a
      // skipped gate would swallow the advice for every later refusal it ever makes.
      if (refused.kind === SHARDS_SKIPPED_REFUSAL && refused.job.ciDispatched) {
        console.log(`  The queue already spent its one recovery on this - it is yours now: ${refused.recovery}`);
      } else if (refused.recovery && refused.byQueue) {
        console.log(`  Answered by: ${refused.recovery} - the queue runs this itself once, so give it a turn first.`);
      } else if (refused.recovery) {
        console.log(`  Nothing will re-run this by itself. When it is settled: ${refused.recovery}`);
      } else if (!refused.held) {
        console.log('  Fix it here, then queue it again from this session.');
      }
    }

    const live = pending(jobs);
    if (live.length > 0) {
      const { freemem } = await import('node:os');
      const plan = schedule(jobs, {
        hour: new Date().getHours(),
        freeMemMb: Math.round(freemem() / (1024 * 1024)),
      });
      console.log('');
      console.log(`Job queue: ${plan.running.length} running, ${plan.waiting.length} waiting (${plan.slots} slot(s) right now).`);
      for (const job of plan.running) console.log(`  running  ${job.id}  ${job.command}`);
      plan.waiting.slice(0, 5).forEach(({ job, reason }, i) => console.log(`  #${i + 1}       ${job.id}  ${reason}`));
      // A job whose dependency died is in neither list until a runner writes it off. Printing it
      // here keeps "queued" and "never going to run" from looking identical at a session start.
      for (const { job, reason } of plan.dead) console.log(`  DEAD     ${job.id}  ${reason}`);
      // A runner that died leaves the queue frozen with no error anywhere. Say so; the fix is
      // one command, and without this line the symptom is indistinguishable from normal waiting.
      const { findRunner } = await import('../jobs-store.mjs');
      const { nodeProcesses } = await import('../e2e-runs.mjs');
      if (!findRunner(nodeProcesses())) {
        console.log('  NO RUNNER is draining this queue - start one: node scripts/jobs.mjs --runner');
      }
    }
    writeFileSync(seenPath, `${JSON.stringify({ at: Date.now() })}\n`);
  }
} catch {
  // Awareness only. A queue we cannot read must never stop a session from starting.
}

process.exit(0);

/** Run git with the given args in `cwd` and return stdout as trimmed lines. */
function gitLines(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0 || typeof res.stdout !== 'string') return [];
  return res.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** Absolute path with forward slashes, for cross-checkout comparison on Windows. */
function normalize(path) {
  return resolve(path).replaceAll('\\', '/');
}

/**
 * A filename-safe name for this checkout, for its own "what have I already been told" marker.
 *
 * The last path segment plus a short hash of the whole path: the segment is what a person reading
 * the queue directory recognises, and the hash is what keeps two checkouts with the same folder
 * name under different parents from sharing one marker - which is the exact bug a per-worktree
 * marker exists to fix, reintroduced one level down.
 */
function seenKey(path) {
  const full = normalize(path).toLowerCase();
  const name = full.replace(/\/$/, '').split('/').pop().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) || 'checkout';
  let hash = 0;
  for (let i = 0; i < full.length; i += 1) hash = (Math.imul(hash, 31) + full.charCodeAt(i)) | 0;
  return `${name}-${(hash >>> 0).toString(36)}`;
}
