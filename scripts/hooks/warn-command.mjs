// PostToolUse notice for shell commands (the Bash and PowerShell tools). Says two things:
//
//   A COMMIT LANDED ON A BRANCH WHOSE LANDING JOB IS ALREADY QUEUED, so the pin that job holds
//   is now stale and it will refuse when its turn comes.
//
//   A PUSH REPLACED A RUN THAT NEVER FINISHED: the branch already had a run for its previous tip
//   and that run was cancelled or still going. This one is BELT-AND-BRACES since 2026-09-06, when
//   ci.yml stopped planning a branch from the previous push (today its pull request run plans
//   from main): the replacement run covers the cancelled one's delta by construction, so the plan
//   is no longer narrowed and the notice no longer points at a hole. What it still says is true and worth saying - the run
//   you were watching is gone, here is its replacement, and the house rule is to read WHICH JOBS
//   RAN rather than the colour. The reasoning sits with the rule below; it costs one
//   `gh run list`, only on a push that updated a remote branch.
//
// WHY THIS IS A NOTICE AND NOT A REFUSAL. Queueing pins the branch at its current commit, because
// queueing IS the declaration that the work is finished (`.agent-workflows/queue-merge.md` §1).
// A commit afterwards is perfectly legitimate - the session found one more thing - as long as it
// re-queues. What is never legitimate is leaving both: on 2026-08-28 one session queued, committed
// more, and queued again, and two of its three landing jobs burned as stale-pin refusals
// (`.agent-workflows/orchestrator/incidents.md`, "the three stacked pins"). Blocking the commit
// would be refusing legitimate work; saying nothing is what cost the two jobs.
//
// WHY IT RUNS AFTER RATHER THAN BEFORE. Two reasons, and they agree. A PreToolUse hook can only
// reach the agent by BLOCKING - an allowed call's reason goes to the user, not to the model - so
// "warn without denying" has no channel there. And the fact this rule needs is whether the branch
// tip actually MOVED, which is only true once the commit has run: a commit that failed, or one
// with nothing staged, leaves the pin valid and must stay silent. So the check is exact rather
// than speculative, and it cannot cry wolf.
//
// COST. This runs after every shell command in every session, so the only thing it does
// unconditionally is a pure text match for a `git commit` INVOCATION. Everything that costs
// anything - resolving the checkout, asking git for the branch and its tip, reading the queue -
// happens only for the handful of commands that pass it, including the module loads.
// Measured 2026-09-02 on this laptop, five runs each: 59 ms on an `ls`, against a 47 ms bare
// `node -e 0` on the same box - so the common case is node starting up and about 12 ms of work.
// A commit costs 195 ms, which is two git calls and a queue read, on the one command per session
// where the answer matters.
// Re-measured 2026-09-05 after the push rule: 57 ms on an `ls` against 45 ms bare, so still node
// starting up; the push matcher is pure string work, and the gh call runs only after a real
// update push, about once per session.

import { readHookInput, warn, gitOutput } from './lib.mjs';
// `command-match.mjs` is pure and imports nothing, so the gate below costs only itself. The two
// modules that answer the rest are loaded LAZILY, after it passes: `command-target.mjs` and
// `jobs-store.mjs` each pull in a chain (git plumbing, the port registry, the worktree lister)
// that is pure overhead on the `ls` this hook mostly sees.
import { commitCheckouts, pushedUpdates, unfinishedRun, pushReplacedNotice } from '../command-match.mjs';
import { spawnSync } from 'node:child_process';

const input = await readHookInput();
const command = input?.tool_input?.command;
if (typeof command !== 'string' || command.length === 0) process.exit(0);
const committing = commitCheckouts(command);
// The branches this command just pushed an update to, off git's own report in the response - so a
// first push, a no-op and a rejection all read as nothing, before anything is asked of anyone.
const pushed = pushedUpdates(command, input.tool_response);

if (committing.length === 0 && pushed.length === 0) process.exit(0);

const { checkoutRoot, commandCheckout } = await import('../command-target.mjs');

// The command belongs to the checkout it ACTS ON, not to wherever this session happens to sit - a
// session driving another worktree by absolute path is ordinary here (command-target.mjs). A
// `git -C <path>` on the commit itself is the most explicit statement of that and wins, the same
// way it does in the branch rule next door; anything else is read off the command line.
const sessionDir = typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
const named = committing.find(Boolean);
const root = (named ? checkoutRoot(named) : null) ?? commandCheckout(command, sessionDir) ?? sessionDir;

// BOTH RULES SPEAK, in one message. `warn` exits, so a hook with two things to say and one exit
// silently drops the second.
const notices = [];

// --- A push that replaced a run that never finished -------------------------------------------
//
// `ci.yml`'s concurrency group cancels the run still going for a branch's previous tip whenever a
// follow-up push arrives. That USED TO leave the earlier delta covered by nothing, because the
// plan was measured from `github.event.before`: sixteen handoffs between 2026-09-01 and
// 2026-09-05 carry a run that reported green having skipped every shard the cancelled one owed.
//
// THE HOLE IS CLOSED IN THE WORKFLOW. Since 2026-09-06 ci.yml plans a branch from main rather
// than from the previous push - from the merge-base for a branch push then, from the pull
// request's base since 2026-10-09, when branch push runs stopped (#851) - so the replacement run
// plans the branch's whole work and cannot plan less than the run it cancelled. Re-measured
// 2026-09-16 over 158 branch push runs: 12 green-after-cancelled, 4 of them shard-free, all 4
// planning `mode: none` off the merge-base over paths that cannot reach the E2E surface. So this
// notice is belt-and-braces, and it is kept for two reasons that survive the fix: it is the one
// place a session is told the run it was watching is gone and which run replaced it, and it would
// speak again if the workflow ever regressed.
//
// A DISPATCH IS NOT CANCELLED BY A PUSH any more: it keys on the branch ref, the pull request run
// on `refs/pull/<n>/merge`, so they sit in different concurrency groups. `unfinishedRun` skips it,
// which is why the runs are fetched with their `event`.
//
// EXACT, so it cannot cry wolf: silent when the earlier run had FINISHED, because then the
// incremental plan is right by design; silent on a first push, a no-op and a rejection, because
// nothing was in flight (`pushedUpdates`); silent when gh cannot answer, because a hook that
// cannot tell must not speak. The cancellation may not be recorded yet in the seconds after the
// push, so a run still `in_progress` or `queued` for the old tip counts the same as one already
// `cancelled` - it is about to be.
//
// The decision and the message both live in command-match.mjs, pure and pinned in its tests.
// `unfinishedRun` carries the two real run sets it was measured on: the first real event this was
// fed (sha 43c9d60b, one cancelled push run beside one green dispatch) must stay silent, and the
// real 2026-09-04 follow-up push (sha a8ce0d1b, one cancelled run and nothing else) must speak.
// `pushReplacedNotice` is there for the same reason this hook cannot be imported - it reads stdin
// at module top level - and because the claim that went wrong here was prose nothing checked.
//
// THE OLD TIP IS LOOKED UP EXACTLY. Git's report abbreviates it, and an abbreviated sha given to
// `gh run list --commit` returns [] with exit 0, so it is resolved to the full sha first - this
// checkout pushed that commit, so it has it - and only a tip git cannot resolve falls back to the
// branch listing with a prefix filter, which `--limit` can truncate. BOUNDED: at most three
// branches per push, eight seconds each, because the harness ends a hook at sixty seconds and a
// hook killed mid-way loses every notice it had collected.
for (const { branch, from, to } of pushed.slice(0, 3)) {
  const earlier = unfinishedRun(ciRuns(root, branch, git(root, ['rev-parse', '--verify', `${from}^{commit}`])), from);
  if (!earlier) continue;
  notices.push(pushReplacedNotice({ branch, from, to, run: earlier }));
}

// --- A commit that staled a queued landing pin ------------------------------------------------

if (committing.length === 0) say();
const { jobsDir, readJobs, landingStateFor } = await import('../jobs-store.mjs');

const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
// A detached HEAD has no branch to have queued, and `main` is never queued for landing.
if (!branch || branch === 'HEAD' || branch === 'main') say();

const dir = jobsDir();
if (!dir) say();
const landing = landingStateFor(branch, readJobs(dir));
if (landing.state !== 'queued') say();

// WHAT THE JOB PINNED, in the job's own words. `jobs.mjs add-merge` records the tip as
// `--expect-sha <sha>` in the queued command, and both `land-watch.mjs` and `requeue` compare it
// there - so reading it back from the same place is what makes this notice agree with the refusal
// it predicts. A job carrying no pin (queued before the pin was written, or git could not answer)
// has nothing to go stale.
const pinned = /--expect-sha\s+([0-9a-f]{7,40})\b/.exec(landing.job.command)?.[1];
const tip = git(root, ['rev-parse', branch]);
if (!pinned || !tip || pinned === tip) say();

const running = landing.job.state === 'running';
notices.push(
  `Heads up: landing job ${landing.job.id} is already ${landing.job.state} for ${branch}, pinned at ` +
    `${pinned.slice(0, 8)}, and this commit moved the branch to ${tip.slice(0, 8)}. That job will refuse ` +
    `("${branch} has moved since it was queued") rather than land anything.\n` +
    'Queueing pins the branch because queueing means the work is finished. Committing afterwards is ' +
    'fine, but the queued job is now dead weight, and QUEUEING A SECOND ONE BESIDE IT is what burned ' +
    'two of three jobs from one branch on 2026-08-28. Queue once, at the true end.\n' +
    (running
      ? `Let ${landing.job.id} refuse (it is mid-flight; ` +
        `\`node scripts/jobs.mjs log ${landing.job.id}\` shows where it got to), then run ` +
        '`npm run queue:merge` once - when this branch is actually finished.'
      : `Withdraw the stale job and re-queue when you are actually finished:\n` +
        `  node scripts/jobs.mjs cancel ${landing.job.id}\n` +
        '  npm run queue:merge'),
);

say();

/**
 * The ONE exit. Everything collected goes out together, because `warn` exits the process and a
 * hook with two rules and two exits delivers whichever fired first and silently drops the other.
 */
function say() {
  if (notices.length > 0) warn(notices.join('\n\n'));
  process.exit(0);
}

/** One git answer from the checkout the command acts on, trimmed, or null when git cannot say. */
function git(cwd, args) {
  return gitOutput(cwd, args)?.trim() || null;
}

/**
 * The `ci.yml` runs for one commit when its full sha is known, else the branch's recent runs,
 * newest first - or null when gh cannot answer: not installed, not logged in, offline, or slow.
 * Bounded, because this runs inside a hook: a `gh` that hung would hold the session's shell tool
 * with it. Run in the checkout so gh resolves the repository the way the push did.
 *
 * This is one more private copy of "spawn `gh run list --json`, parse, fail to null" - review
 * counted five others in scripts/ when it was written, three of which went with the laptop lander.
 * A shared `listCiRuns` beside ci-failure-set.mjs is still the right home; it is filed, not
 * smuggled in here.
 */
function ciRuns(cwd, branch, sha) {
  const scope = sha ? ['--commit', sha] : ['--branch', branch, '--limit', '10'];
  const res = spawnSync(
    'gh',
    // `event` is fetched because a push cancels a pull request run but never a dispatch, which
    // runs in a concurrency group of its own; `unfinishedRun` reads it.
    ['run', 'list', ...scope, '--workflow', 'ci.yml', '--json', 'databaseId,status,conclusion,headSha,event'],
    { cwd, encoding: 'utf8', windowsHide: true, timeout: 8_000 },
  );
  if (res.status !== 0 || typeof res.stdout !== 'string') return null;
  try {
    const runs = JSON.parse(res.stdout);
    return Array.isArray(runs) ? runs : null;
  } catch {
    return null;
  }
}
