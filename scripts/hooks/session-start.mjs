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
import { writeCliCredentialsEnv } from './cli-credentials-env.mjs';
import { readHookInput } from './lib.mjs';
import { HOME_RELATIVE_PATH } from '../orchestrator-home.mjs';
import { reattachMainIfSafe } from '../reattach-main.mjs';
import { formatActivity, formatBranches, scanActivity } from '../worktree-activity.mjs';
import { cleanupStateDir, sweepEmptyLeftoverFolders, triggerUnattendedSweep, worktreeRoots } from '../worktree-cleanup-lib.mjs';

const input = await readHookInput();
const sessionCwd = normalize(input?.cwd ?? process.cwd());

// All registered checkouts, primary first (git worktree list order). Run from the session
// cwd: in an unregistered stub git walks up to the primary checkout, which is exactly the
// fall-through this hook exists to detect.
let roots = worktreeRoots(sessionCwd);
if (roots.length === 0) process.exit(0); // not a git checkout - nothing to check

// Each checkout keeps its own `noacg login`, so one row's logout cannot sign its siblings out.
// The lines resolve the checkout per command, so they need nothing the checks below compute.
try {
  writeCliCredentialsEnv();
} catch {
  // Best effort: without it the CLI uses the per-user store, as it did before.
}

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

// FINISHED WORK CLEANS ITSELF UP. Start the unattended worktree sweep in the background; it
// throttles itself to one run per half hour and removes only what has landed (or has no commits
// of its own) and has been quiet long enough (scripts/cleanup-worktrees.mjs, runUnattended).
// `NOACG_NO_AUTO_CLEANUP=1` switches it off. It never throws.
triggerUnattendedSweep({ primaryRoot: roots[0] });

// Which branches have landed - the ledger the follow-up handling below and the job-queue summary
// further down both read. Synced from GitHub once, here.
let landedBranches = new Set();
let landingsSynced = false;
try {
  const { jobsDir, readLandings } = await import('../jobs-store.mjs');
  const { syncLandings } = await import('../landings.mjs');
  const dir = jobsDir();
  if (dir) {
    syncLandings(dir);
    landingsSynced = true;
    landedBranches = new Set(readLandings(dir).map((entry) => entry?.branch).filter(Boolean));
  }
} catch {
  // No ledger: nothing below treats a branch as landed.
}

// A RESUMED CHAT WHOSE WORKTREE WAS CLEANED UP. The sweep removes a landed desktop chat's
// worktree after a day of quiet, and the owner often comes back to the same chat. When the
// transcript says this session last worked in a worktree that is gone, make a fresh one at the
// same path from origin/main, so the follow-up has somewhere to work with nothing to run.
// Only on a RESUME: a compaction or a cleared conversation is not somebody coming back to it.
try {
  const { recoverRemovedWorktree } = await import('../worktree-followup.mjs');
  const recovered = input?.source === 'resume'
    ? recoverRemovedWorktree({
        sessionCwd,
        primaryRoot: roots[0],
        transcriptPath: input?.transcript_path,
        landed: landedBranches,
        registeredRoots: roots,
      })
    : null;
  if (recovered?.path) {
    roots = [...roots, recovered.path];
    console.log(
      recovered.inside
        ? `This chat's earlier worktree has been removed (finished work is cleaned up automatically). A fresh ` +
            `worktree was made here (${recovered.path}) on branch ${recovered.branch}, cut from origin/main. ` +
            'Dependencies are not installed yet: run `npm ci` before building or testing.'
        : `This chat last worked in ${recovered.path}, which has since been removed (finished work is cleaned ` +
            `up automatically). A fresh worktree is ready at that path on branch ${recovered.branch}, cut from ` +
            `origin/main. Before doing anything else, switch into it with the EnterWorktree tool (path: ` +
            `${recovered.path}) - it is under .claude/worktrees, so no approval is needed - then run \`npm ci\` ` +
            'before building or testing.',
    );
  } else if (recovered?.error) {
    console.log(`Note: this chat's earlier worktree is gone and a fresh one could not be made: ${recovered.error}`);
  }
} catch {
  // Recovery is a convenience; a session that starts without it is no worse off than before.
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

let branch = gitLines(['rev-parse', '--abbrev-ref', 'HEAD'], root)[0] ?? 'unknown';
const orchestratorHome = normalize(join(roots[0], ...HOME_RELATIVE_PATH.split('/')));
const isOrchestratorHome = root.toLowerCase() === orchestratorHome.toLowerCase();
const kind = root.toLowerCase() === roots[0].toLowerCase()
  ? 'primary checkout'
  : isOrchestratorHome
    ? 'orchestrator home'
    : 'linked worktree';

// A FOLLOW-UP IN A WORKTREE WHOSE BRANCH HAS LANDED. New work on that branch would start from an
// old main and re-land what is already in, so a clean worktree with nothing unlanded moves to a
// fresh branch cut from origin/main (scripts/worktree-followup.mjs). Not on a compaction: that is
// the same conversation carrying on, not somebody coming back.
if (kind === 'linked worktree' && input?.source !== 'compact') {
  try {
    const { moveOffLandedBranch } = await import('../worktree-followup.mjs');
    const moved = moveOffLandedBranch({ root, branch, landed: landedBranches });
    if (moved?.to) {
      console.log(
        `This worktree's branch ${moved.from} has landed, so the worktree was moved to a fresh branch ` +
          `${moved.to}, cut from origin/main - follow-up work starts from current main. If ` +
          'package-lock.json changed since, run `npm ci` before building.',
      );
      branch = moved.to;
    }
  } catch {
    // The old branch stays checked out; nothing is lost either way.
  }
}
const branchLabel = branch === 'HEAD' ? 'detached HEAD' : `branch ${branch}`;

let ports = '';
try {
  // This checkout's copy resolves the port from its own location - correct per-worktree.
  const devPortModule = join(root, 'scripts', 'dev-port.mjs');
  if (existsSync(devPortModule)) {
    const { devPorts, pruneStalePorts, reservesPorts } = await import(pathToFileURL(devPortModule));
    // Reservations outlive the worktrees that took them (a removed worktree cannot give its
    // own port back). Session start is where the registry gets swept, same as the folders.
    const released = pruneStalePorts?.() ?? [];
    if (released.length > 0) {
      console.log(`Released dev-port reservations left by removed worktrees: ${released.map((t) => t.port).join(', ')}.`);
    }
    if (isOrchestratorHome) {
      // The orchestrator's permanent home runs no dev server (docs/DEV_PORTS.md,
      // .agent-workflows/orchestrator.md), so there is no port worth printing.
      ports = ' - no dev port (the orchestrator home runs no server)';
    } else {
      // Asking reserves nothing: a server start does (scripts/dev-port.mjs).
      const record = devPorts();
      ports = ` - dev port ${record.port}, live e2e port ${record.livePort}`;
      if (record.port === 0) {
        ports = ' - no dev port free right now: every reservation is in use (node scripts/dev-port.mjs --list)';
      } else if (!record.ticket && reservesPorts?.()) {
        ports += ' (reserved when a server starts)';
      } else if (record.preferred !== record.port) {
        // Say so when the deterministic preference was taken: the number is still stable, but
        // it is not the one the path hashes to, and that is worth seeing before debugging a URL.
        ports += ` (preferred ${record.preferred} was taken)`;
      }
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
      'silently. To work on a branch: git fetch origin, then git worktree add -b <branch> ' +
      '.claude/worktrees/<name> origin/main (local main lags, since landings reach origin only), ' +
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
// place that cannot be skipped: it is in context before the first prompt.
//
// Answered from a cache shared by every worktree, so the ordinary session start pays nothing and
// one fetch every ten minutes serves the whole machine. Silent when nothing is open.
//
// ORCHESTRATOR HOME ONLY (owner-decisions-2026-09-25). An ordinary session is doing one named
// task, and a red alarm printed into it reads as an invitation to widen the task. The orchestrator
// plans from it, the daily morning brief reports it, and `/next` reads it when it looks for work.
if (isOrchestratorHome) {
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
}

// --- What the unattended worktree cleanup could not do on its own ----------------------------
//
// The sweep never acts on anything that needs a person (a dirty landed worktree, a lone secret, an
// output it could not archive); it writes them down. The orchestrator plans from that, so the line
// prints there only, and only when the list is not empty.
if (isOrchestratorHome) {
  try {
    const { readFileSync } = await import('node:fs');
    const stateDir = cleanupStateDir(roots[0]);
    const last = stateDir ? JSON.parse(readFileSync(join(stateDir, 'last.json'), 'utf8')) : null;
    const asks = [...(last?.needsPerson ?? []), ...(last?.errors ?? [])];
    if (last && last.ran === false) {
      console.log('');
      console.log(`Worktree cleanup: the last unattended run (${last.at}) did not run - ${last.why}.`);
    } else if (asks.length > 0) {
      console.log('');
      console.log(
        `Worktree cleanup (last unattended run ${last.at}): ${asks.length} item(s) need a person - ` +
          `${join(stateDir, 'last.txt')} has the full report; run /cleanup-worktrees to act on them.`,
      );
    }
  } catch {
    // No run yet, or an unreadable report: nothing to say.
  }
}

// --- The job queue ---------------------------------------------------------------------------
//
// The queue's whole point is that waiting is VISIBLE (docs/JOB_RUNNER_PLAN.md). Printing it here
// is what turns "I came back and nothing had progressed" into something answerable without
// asking an agent: what is running, what is waiting and why, what finished while you were away,
// and whether the runner is alive to drain any of it.
try {
  const { readJobs, jobsDir } = await import('../jobs-store.mjs');
  const { pending, finishedSince, schedule, readPresence } = await import('../jobs-store.mjs');
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
    // The orchestrator plans from the queue's results; an ordinary session gets only what concerns
    // its own branch (the landed and refused lines below), not every job that finished.
    const done = finishedSince(jobs, since);
    if (isOrchestratorHome && done.length > 0) {
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
    if (!landingsSynced) {
      const { syncLandings } = await import('../landings.mjs');
      syncLandings(dir);
    }
    const mine = landingForWorktree(readLandings(dir), root);
    // Only while the branch that landed is the one checked out: a worktree moved to a fresh branch
    // above (or recreated at this path) has said so already, and has nothing landed on it.
    if (mine && (mine.at ?? 0) >= since && mine.branch === branch) {
      console.log('');
      console.log(`THIS WORKTREE'S BRANCH HAS LANDED: ${mine.branch} is in main as ${String(mine.sha).slice(0, 8)}.`);
      console.log('  Merged and pushed - nothing here is waiting to merge.');
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
      // One read, used for both: the plan must be built on the same declaration this prints, or
      // the summary explains a wait with a floor the scheduler did not use.
      const machine = readPresence(dir);
      const plan = schedule(jobs, {
        hour: new Date().getHours(),
        freeMemMb: Math.round(freemem() / (1024 * 1024)),
        presence: machine.state,
      });
      console.log('');
      // An `away` declaration outlives the night it was set for, so a session starting in the
      // morning is one of the few places it can be caught before it costs somebody their machine.
      if (machine.state === 'away') {
        console.log(`Machine marked AWAY until ${new Date(machine.until).toISOString()} - the queue's RAM floor is lowered.`);
        console.log('  `npm run jobs -- presence present` if somebody is at it.');
      }
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
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
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
