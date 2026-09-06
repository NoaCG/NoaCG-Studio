#!/usr/bin/env node
// THE JOB QUEUE - enqueue heavy work instead of waiting for it.
//
//   node scripts/jobs.mjs add "npm run test:e2e:affected"   # prints an id, exits at once
//   node scripts/jobs.mjs add "npm run build" --after j-0007
//   node scripts/jobs.mjs                                   # running + waiting, with reasons
//   node scripts/jobs.mjs --json
//   node scripts/jobs.mjs wait j-0007                       # bounded: gives up after 30 min
//   node scripts/jobs.mjs log j-0007                        # that job's output
//   node scripts/jobs.mjs cancel j-0007
//   node scripts/jobs.mjs --runner                          # the drain loop (started for you)
//
// WHY (docs/JOB_RUNNER_PLAN.md carries the measurements): a foreground `--wait` outlives the
// shell that started it and is killed at 600 s with the run never started; every waiter wakes
// together when the slot frees; and nothing anywhere shows a QUEUE, so "correctly queued" and
// "died ten minutes ago" look identical. `add` returns immediately and one runner decides what
// starts, which removes all three.
//
// The arithmetic - capacity, dependencies, reaping - lives in jobs-store.mjs and is unit-tested.
// This file is the part that talks to the OS: spawning, killing a process TREE, and electing
// exactly one runner.

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, createWriteStream, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { freemem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeRuns, nodeProcesses, orphanProcesses } from './e2e-runs.mjs';
import { requiresRunningDevServer } from './command-match.mjs';
import { isPortBusy } from './port-probe.mjs';
import { RECLAIM_AFTER_MS, describeReclaim, planReclaim } from './ram-reclaim.mjs';
import { onlyMainIntegrationsBetween } from './safe-merge-preflight.mjs';
import { hasUnread, readRelayText } from './relay.mjs';
import {
  FOREGROUND_WAIT_CAP_MS,
  MAX_LANDING_RETRIES,
  // `auto-merge`'s "CI never answered" and the sentence for it - the one refusal the queue
  // retries by itself. Imported rather than re-declared here (as the exit codes above it are)
  // because the queue is what ACTS on this one, so the store owns it and there is one copy.
  NO_VERDICT_EXIT,
  NO_VERDICT_REASON,
  ORDER_BLOCKED_REFUSAL,
  POLICY,
  addJob,
  adoptOrphanedLandings,
  cancelVerdict,
  classifyRefusal,
  costOf,
  devServerPrecheck,
  ensureJobsDir,
  findRunner,
  finishedSince,
  jobsDir,
  landingRow,
  pending,
  pruneJobs,
  readJobs,
  readReviewStamp,
  stampGap,
  readLandings,
  reapDead,
  refusalGuidance,
  requeueDecision,
  schedule,
  timedOutRecord,
  waitVerdict,
  writeJob,
} from './jobs-store.mjs';

const POLL_MS = 5_000;
/** How long a verified auto-start waits for the runner to appear, and how often it looks. */
const RUNNER_START_WAIT_MS = 3_000;
const RUNNER_START_POLL_MS = 1_000;
/** The runner exits after this long with nothing live, so no daemon outlives the work. */
const IDLE_EXIT_MS = 60_000;
/** `auto-merge`'s "not my turn yet" - blocked by a branch that is itself still waiting. */
const BLOCKED_EXIT = 3;

/** `auto-merge`'s "main itself is red" - a person's fix, never resolved by waiting. */
const RED_MAIN_EXIT = 4;

/**
 * How many times a landing may go to the back of the queue before it is failed.
 *
 * Five branches queued together mostly start out blocked by each other, and each landing frees
 * the next - so a handful of deferrals is normal traffic, not a problem. The bound is what stops
 * a genuinely stuck pair cycling for ever while looking busy.
 */
const MAX_DEFERRALS = 6;

/**
 * The header `spawnJob` writes before each attempt, and the boundary `readRefusal` reads back from.
 *
 * DECLARED ABOVE THE COMMAND DISPATCH, for the reason `auto-merge.mjs` spells out over
 * `DISPATCH_GRACE_TICKS`: the dispatch below runs mid-module-evaluation, so a `const` after it is
 * still in its temporal dead zone when `requeue` reaches `readRefusal` - a crash only direct
 * execution can see, because a test import evaluates the whole module first.
 */
const LOG_ATTEMPT_MARK = '===';

const dir = jobsDir();
if (!dir) {
  console.error('Not inside a git checkout - there is no shared queue to use.');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

// Terminal jobs older than the retention window go here, on the way past. Every entry point
// prunes because every entry point already reads this directory, so the sweep is one extra
// directory read on work somebody asked for - and nothing has to remember to run it. A daemon
// whose whole job is tidying another process's files would be a second thing to crash.
const pruned = pruneJobs(dir);
// `--json` promises machine-readable stdout, so the note goes to stderr there rather than
// nowhere: a prune is worth seeing, and a stray line ahead of the JSON breaks the reader.
if (pruned.length > 0) {
  const note = `Pruned ${pruned.length} finished job(s) older than 14 days (${pruned[0]} to ${pruned[pruned.length - 1]}).`;
  if (flag('--json')) process.stderr.write(`${note}\n`);
  else console.log(note);
}

/**
 * Pick the command and run it. Called at the BOTTOM of this file, and that placement is the point.
 *
 * The dispatch used to sit here, above every `const` in the module. Top-level `await` suspends
 * module evaluation where it stands, so a command that reached a `const` declared below it hit the
 * temporal dead zone and threw before doing anything - and the runner did exactly that from
 * 966f6b96 (2026-09-04 08:05), the commit that added `aheadOfMainCache`, onwards:
 *
 *   ReferenceError: Cannot access 'aheadOfMainCache' before initialization
 *
 * The queue kept draining all day because the runner ALREADY RUNNING had the old module loaded.
 * When that one exited on its idle timeout nothing could replace it: every `add` spawned a runner
 * that died in its first millisecond, with `stdio: 'ignore'` swallowing the stack trace, and the
 * listing said "NO RUNNER (start with --runner)" as a footnote. j-0550 sat in `starting` for four
 * minutes across two reads that afternoon with nothing to say why.
 *
 * A convention comment further down asked future editors to use function declarations rather than
 * `const` arrows for exactly this reason. A rule you have to remember is not a mechanism, and this
 * one was broken within the fortnight. Running the dispatch AFTER the module body removes the trap
 * instead of asking anyone to avoid it.
 */
async function main() {
  if (flag('--runner')) await runner();
  else if (args[0] === 'add') await cmdAdd();
  else if (args[0] === 'add-merge') await cmdAddMerge();
  else if (args[0] === 'requeue') await cmdRequeue();
  else if (args[0] === 'adopt') await cmdAdopt();
  else if (args[0] === 'wait') await cmdWait();
  else if (args[0] === 'log') cmdLog();
  else if (args[0] === 'cancel') cmdCancel();
  else await cmdList();
}

// --- commands --------------------------------------------------------------------------------

async function cmdAdd() {
  const command = args[1];
  if (!command || command.startsWith('-')) {
    console.error('Usage: node scripts/jobs.mjs add "<command>" [--kind gate|merge|sweep] [--after <id>,<id>] [--branch <name>] [--cap <minutes>]');
    process.exit(1);
  }
  ensureJobsDir(dir);
  const job = addJob(dir, {
    command,
    checkout: process.cwd(),
    branch: valueOf('--branch') ?? currentBranch(),
    kind: valueOf('--kind') ?? 'gate',
    after: (valueOf('--after') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    capMinutes: Number(valueOf('--cap') ?? POLICY.capMinutes),
    now: Date.now(),
  });
  await ensureRunner();
  console.log(`${job.id} queued: ${job.command}`);
  const { waiting } = snapshot();
  const mine = waiting.find((w) => w.job.id === job.id);
  console.log(mine ? `  ${mine.reason}` : '  starting now');
  console.log(`  output: node scripts/jobs.mjs log ${job.id}`);
}

/**
 * Put back every landing that died without a verdict, and hand back what was created.
 *
 * `adoptOrphanedLandings` decides; this only writes. Both callers - the drain loop and the
 * `adopt` command - go through here so there is one place a retry is minted, and each says what
 * happened in the voice of its own surface.
 */
function adoptOrphans(now) {
  return adoptOrphanedLandings(readJobs(dir).map(rememberRefusal), gitFacts())
    .map((orphan) => {
      // RUN THE RECOVERY, then queue the landing that needs it. The only one so far is a full CI
      // run for a branch whose gate skipped every shard, and the order matters: the retry pushes
      // and starts waiting within seconds, so a dispatch made afterwards would be a second run
      // racing the one the landing is already watching.
      // AND ONLY CLAIM IT IF IT HAPPENED. `ciDispatched` is what disqualifies the branch from a
      // second attempt, so writing it after a dispatch that failed - no `gh`, no token, an offline
      // laptop - would spend the recovery on nothing and then tell the session it had been used.
      const asked = orphan.recovery?.dispatchCi ? runRecovery(orphan.recovery) : false;
      return [orphan, addJob(dir, { ...orphan, ciDispatched: asked, now })];
    });
}

/**
 * Ask GitHub for a full CI run on a branch, and say whether it took.
 *
 * NEVER FATAL. A recovery that cannot be made - no `gh`, no token, an offline laptop - must not
 * stop the retry being queued: the landing waits for CI itself and dispatches its own replacement
 * after the webhook grace, so the worst case is the behaviour that existed before this. Saying so
 * out loud is the part that matters, because a silent failure here looks exactly like a recovery
 * that ran and did nothing.
 */
function runRecovery({ dispatchCi, command }) {
  const res = spawnSync('gh', ['workflow', 'run', 'ci.yml', '--ref', dispatchCi], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.status === 0) {
    console.log(`  ${dispatchCi}: asked for a full CI run (${command}) before re-queueing its landing`);
    return true;
  }
  console.log(`  ${dispatchCi}: could NOT ask for a full CI run - run it by hand: ${command}`);
  return false;
}

/**
 * The job, with `refusal` filled in from its own log if it is a dead landing that has none.
 *
 * The runner records the refusal when the process exits, so a job that died under THIS build
 * already carries it. This is for the ones that did not: every landing already in the queue when
 * the field was added, which for a fortnight is most of them, and which includes exactly the jobs
 * the stale-pin carve-out exists to recover. Reading their logs once, when the sweep looks at
 * them, is what makes the fix retroactive instead of a rule that only ever helps the next one -
 * the same argument that made the sweep a sweep rather than a hook.
 */
function rememberRefusal(job) {
  if (job.kind !== 'merge' || job.refusal !== undefined || job.exitCode === 0) return job;
  if (['waiting', 'running', 'done'].includes(job.state)) return job;
  // WRITTEN BACK, not just returned. The sweep runs on every five-second poll and this maps over
  // every job in the queue, so without caching the answer a dozen dead landings would have their
  // whole logs - a build and a CI wait each - read and decoded twelve times a minute for the
  // fourteen days they are kept, on a machine that is short of memory by definition.
  const classified = { ...job, refusal: readRefusal(job) };
  try {
    writeJob(dir, classified);
  } catch {
    // A queue we cannot write to is one we read again next poll. Nothing depends on the cache.
  }
  return classified;
}

/**
 * What the landing said as it refused, read from the tail of its ATTEMPT.
 *
 * The tail, because a landing's log carries a whole build and a CI wait ahead of the refusal, and
 * every refusal is in the last few lines. Only the last 8 KB is read off disk rather than the whole
 * file, for the same reason the answer is cached.
 *
 * The window is cut back to this job's LAST attempt by `classifyRefusal`, which owns that rule and
 * is tested on it - the log is opened for append and a job is re-run under its own id.
 *
 * A missing or unreadable log answers null, which is the same answer as "it did not refuse in a way
 * the queue treats specially" - and the safe one, since every null keeps the old behaviour exactly.
 */
function readRefusal(job) {
  const WINDOW = 8192;
  let fd = null;
  try {
    fd = openSync(job.logPath, 'r');
    const size = fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, WINDOW));
    readSync(fd, buffer, 0, buffer.length, Math.max(0, size - WINDOW));
    return classifyRefusal(buffer.toString('utf8'), { attemptMark: `${LOG_ATTEMPT_MARK} ${job.id} ` });
  } catch {
    return null;
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* already gone */ }
  }
}

/**
 * Adopt every landing that died without a verdict, and say what happened.
 *
 * The runner does this on every poll; this is the door for asking now - the morning report, or a
 * person who reads "LANDING FAILED" in the listing and wants it moving again without waiting for
 * the next poll. Queueing a job starts a runner, so an adoption on a quiet machine revives the
 * drain loop with it.
 */
async function cmdAdopt() {
  ensureJobsDir(dir);
  const adopted = adoptOrphans(Date.now());
  if (adopted.length === 0) {
    console.log('No orphaned landings - every branch that was queued was either judged or is still queued.');
    return;
  }
  for (const [orphan, created] of adopted) {
    console.log(
      `${created.id} queued: land ${orphan.branch} (automatic retry of ${orphan.retryOf}, `
      + `which ${orphan.retryReason}, same commit)`,
    );
  }
  await ensureRunner();
}

/**
 * Queue a LANDING for one branch.
 *
 * `kind: 'merge'` is what makes it safe to queue several at once: a merge never runs beside
 * anything, so they drain strictly one at a time whatever the clock allows. `auto-merge.mjs`
 * refuses anything that is not a `clear` verdict with clean trees and a green gate, so a queue
 * of these lands the boring ones and leaves the interesting ones for a person.
 */
async function cmdAddMerge() {
  // No branch given means THIS worktree's - the overwhelmingly common case, and the safe default.
  // Naming someone else's branch still works, but it has to be deliberate: a session that is
  // still working on a branch must never have it landed out from under the conversation.
  const target = args[1] && !args[1].startsWith('-') ? args[1] : currentBranch();
  if (!target || target === 'main' || target === 'HEAD') {
    console.error('Usage: node scripts/jobs.mjs add-merge [branch] [--after <id>] [--accept <kind>] [--attempts <n>] [--onto-red-main]');
    console.error('  With no branch it queues this worktree\'s. It refuses main and a detached HEAD.');
    process.exit(1);
  }
  ensureJobsDir(dir);
  // A branch with UNREAD relay mail is not finished. A report that reached the orchestrator instead
  // of this session (launch.md) - a review leg, a delegated diff read - is relayed to
  // `relay/<branch>.md`, and queueing PINS the branch as done. On 2026-09-04 row K queued a proposal
  // without its own reviews, which had found its numbers doubled; row J landed without its Codex
  // guard-gap review. Reading the relay (`node scripts/relay.mjs read`) is the acknowledgement, and
  // there is no way past this but to read it - which is the whole point of the gate.
  if (hasUnread(readRelayText(dir, target))) {
    console.error(`add-merge refused: ${target} has UNREAD relay mail - a report reached the orchestrator, not this session.`);
    console.error(`  Read it first:  node scripts/relay.mjs read --branch ${target}`);
    console.error('  Then act on it and queue again. Queueing means "this is finished"; an unread review means it is not.');
    process.exit(1);
  }
  // The `/check` verdict stamp gets its machine consumer here. `/check` writes
  // `checks/<branch>.json` with the EXACT sha it reviewed (.agent-workflows/check.md); 68 such
  // stamps sat on disk on 2026-09-06 and nothing read one. Queueing a tip the stamp does not
  // cover is queueing unreviewed work, so it is refused - with the one honest way past named:
  // `--unreviewed "<reason>"`, which lands with the reason on the job record where the report and
  // the landing ledger can see it, instead of silently.
  const tipForReview = branchTip(target);
  const stamp = readReviewStamp(dir, target);
  const gap = stampGap(stamp, tipForReview);
  const unreviewedReason = valueOf('--unreviewed');
  if (unreviewedReason !== null && (unreviewedReason === '' || unreviewedReason.startsWith('-'))) {
    console.error('add-merge refused: --unreviewed takes a reason in words, e.g. --unreviewed "hotfix for the red main; reviewed by eye".');
    process.exit(1);
  }
  let review;
  if (!gap) {
    review = { stamp: 'reviewed', reviewedSha: stamp.reviewedSha, verdict: stamp.verdict ?? null };
  } else if (unreviewedReason) {
    review = { stamp: 'unreviewed', reason: unreviewedReason, gap };
  } else {
    console.error(`add-merge refused: ${gap} (${target}).`);
    console.error('  Run /check on this tip first (it writes the stamp), then queue again.');
    console.error('  To land without it, say why on the record:  npm run queue:merge -- --unreviewed "<reason>"');
    process.exit(1);
  }
  // Forward the flags auto-merge understands. Dropping one silently is worse than rejecting it:
  // `--accept conflict` went missing here once and the job refused with the very verdict the flag
  // was there to answer, which reads exactly like the policy refusing rather than the queue
  // losing an argument.
  const passthrough = ['--accept', '--attempts'].flatMap((name) => {
    const value = valueOf(name);
    return value ? [name, value] : [];
  });
  // The boolean escape from the red-main gate. It takes no value, so it cannot go through the
  // loop above - and it must reach the job, because the ONE branch that legitimately lands onto a
  // red main is the branch that fixes it, and that branch is queued like any other.
  if (flag('--onto-red-main')) passthrough.push('--onto-red-main');
  // Pin the commit the branch is at RIGHT NOW. Queueing a landing means "this work is finished";
  // if commits arrive afterwards, the job refuses rather than landing something nobody queued.
  const tip = branchTip(target);
  const pin = tip ? ` --expect-sha ${tip}` : '';
  const job = addJob(dir, {
    command: `node scripts/auto-merge.mjs --branch ${target}${passthrough.length ? ` ${passthrough.join(' ')}` : ''}${pin}`,
    checkout: process.cwd(),
    branch: target,
    kind: 'merge',
    after: (valueOf('--after') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    capMinutes: Number(valueOf('--cap') ?? 45),
    review,
    now: Date.now(),
  });
  await ensureRunner();
  console.log(`${job.id} queued: land ${target}${review.stamp === 'unreviewed' ? ` (UNREVIEWED: ${review.reason})` : ''}`);
  console.log(`  output: node scripts/jobs.mjs log ${job.id}`);
}

/**
 * Put a dead landing back - re-running a declaration that was already made.
 *
 * The narrow, allowlistable half of `add-merge` (docs/AGENT_WORKFLOWS.md "Permissions"). It takes
 * a branch name and refuses everything else, including its own flags: no `--accept`, no
 * `--onto-red-main`, nothing that could waive a gate. `requeueDecision` holds the reasoning and
 * the refusals; this only reads the arguments and writes the job.
 */
async function cmdRequeue() {
  const target = args[1] && !args[1].startsWith('-') ? args[1] : currentBranch();
  // A FLAG IS ALWAYS A MISTAKE HERE, and a loud one rather than an ignored one. Every flag
  // `add-merge` takes is a person's judgement about a gate, and silently dropping one would mean a
  // command that reads like it waived something and did not.
  const flags = args.slice(1).filter((a) => a.startsWith('-'));
  if (flags.length > 0) {
    console.error(`requeue takes a branch name and nothing else - it cannot pass ${flags.join(' ')}.`);
    console.error('  It re-runs a declaration exactly as it was made. To weigh a gate yourself, use add-merge.');
    process.exit(1);
  }
  ensureJobsDir(dir);
  const decision = requeueDecision(target, readJobs(dir).map(rememberRefusal), gitFacts());
  if (decision.action === 'refuse') {
    console.error(decision.message);
    process.exit(1);
  }
  const job = addJob(dir, { ...decision.job, now: Date.now() });
  await ensureRunner();
  console.log(`${job.id} queued: land ${target} again (re-running ${decision.job.retryOf}, same declared commit)`);
  console.log(`  output: node scripts/jobs.mjs log ${job.id}`);
}

async function cmdList() {
  const { jobs, start, waiting, dead, running, slots } = snapshot();
  if (flag('--json')) {
    process.stdout.write(`${JSON.stringify({
      running,
      waiting: waiting.map((w) => ({ ...w.job, reason: w.reason })),
      // A job whose dependency died is still `waiting` on disk until a runner writes it off, and
      // leaving it out of both lists made it vanish from the listing entirely.
      dead: dead.map((d) => ({ ...d.job, reason: d.reason })),
      starting: start,
      slots,
    })}\n`);
    return;
  }
  // WHAT IS RED ON MAIN, above everything else, because it frames the rest of this report: the
  // queue below is busy landing branches on top of whatever is already broken, and it is
  // supposed to (it gates on ci.yml alone so an infrastructure fault cannot freeze it). Nothing
  // read the rolling alarms back until this line - scripts/alarm-issues.mjs has the measurement.
  // Silent when nothing is open, and never able to fail this report.
  try {
    const { formatAlarms, readAlarms } = await import('./alarm-issues.mjs');
    const { alarms, asOfMinutes } = readAlarms();
    const lines = formatAlarms(alarms, { asOfMinutes });
    if (lines.length > 0) {
      for (const line of lines) console.log(line);
      console.log('');
    }
  } catch {
    // A report about the queue must not depend on GitHub answering.
  }
  // Landings first, and shown even when the queue is empty: "which branches are in, and therefore
  // which sessions are finished?" is the question automating the merge quietly took away, and an
  // empty queue is exactly when it gets asked.
  const landed = readLandings(dir).slice(-6);
  if (landed.length > 0) {
    console.log('Landed through the queue (newest last):');
    for (const l of landed) {
      const where = String(l.worktree ?? '').split('/').pop();
      console.log(`  ${String(l.sha).slice(0, 8)}  ${l.branch}${where ? `   session: ${where}` : ''}`);
    }
    console.log('  Those sessions have nothing left to merge - /handoff tells you which are done.');
    console.log('');
  }

  if (pending(jobs).length === 0) {
    console.log('Job queue empty.');
    printOutstanding(jobs);
    return;
  }
  const spent = running.reduce((sum, j) => sum + costOf(j), 0);
  // A QUEUE WITH WORK AND NO RUNNER IS A DEFECT, not a footnote. It used to read as
  // "NO RUNNER (start with --runner)" at the end of the header line, which is a state and not a
  // problem - and on 2026-09-04 j-0550 sat in `starting` for four minutes across two reads with
  // that note on screen and nobody acting on it. So the listing says what is wrong, and then fixes
  // it: reading the queue is exactly the moment somebody notices, and a self-healing read costs
  // one process where a missed one costs the night.
  const live = runnerPid();
  console.log(`Job queue - budget ${Math.round(spent * 100) / 100}/${slots} suite-equivalents in use, ${
    live ? 'runner live' : 'NO RUNNER - nothing is draining this queue'}`);
  if (!live) {
    console.log('  Starting one now; every job below is stalled until it comes up.');
    if (await ensureRunner()) console.log('  Runner started.');
  }
  for (const job of running) {
    console.log(`  running  ${job.id}  ${elapsed(job.startedAt)}  [${costOf(job)}]  ${job.command}`);
  }
  // A job the scheduler has picked but the runner has not spawned yet is neither running nor
  // waiting. Leaving it out made it vanish from the listing entirely, which is precisely the
  // "nothing is happening and I cannot tell why" this command exists to prevent.
  for (const job of start) {
    console.log(`  starting ${job.id}  [${costOf(job)}]  ${job.command}`);
  }
  waiting.forEach(({ job, reason }, i) => {
    console.log(`  #${i + 1}       ${job.id}  ${reason}  ${job.command}`);
  });
  // Written off at the next runner poll, and shown NOW - a job in neither list is a job that
  // vanished, which is the failure this listing exists to prevent.
  for (const { job, reason } of dead) {
    console.log(`  DEAD     ${job.id}  ${reason}  ${job.command}`);
  }
  printOutstanding(jobs);
}

/**
 * What is still ahead of main, cheapest first, and whether anyone has queued it.
 *
 * The third of the three questions this command exists to answer - what landed, what is running,
 * and what is still OUT there. Without it, "which branch should go next" meant running a second
 * tool and holding both answers in your head, which is precisely the tracking cost that
 * automating the merge was supposed to remove rather than move.
 *
 * A branch with no job is not idle by accident: only its own session queues it (`/queue-merge`),
 * so "not queued" means that work is not finished yet, which is a different thing from stuck.
 */
function printOutstanding(jobs) {
  // ENUMERATE THE BRANCHES HERE, do not inherit merge-order's list. It finds candidates with
  // `git branch --no-merged`, which sees LOCAL branches only - so a branch that exists solely as
  // `origin/<name>`, which is what a closed session's pushed work looks like once its local ref
  // is gone, is invisible to it. `claude/html-graphics-course-form-a55q31` sat unmerged and
  // unmentioned for seven weeks that way, and this view reported "2 ahead of main" when there
  // were 5. A summary whose whole promise is completeness must not delegate the question of what
  // EXISTS to a tool with a narrower view; it may delegate only the ranking.
  const ahead = refsAheadOfMain();
  if (ahead.length === 0) {
    console.log('');
    console.log('Nothing is ahead of main.');
    return;
  }

  const res = spawnSync('node', ['scripts/merge-order.mjs', '--json'], { encoding: 'utf8', windowsHide: true });
  let ranked = [];
  let notReady = [];
  try {
    const result = JSON.parse(res.stdout);
    ranked = result.order ?? [];
    notReady = result.notReady ?? [];
  } catch {
    // merge-order could not answer - list everything unranked rather than listing nothing.
  }
  const rank = new Map(ranked.map((entry, i) => [entry.branch, { ...entry, position: i + 1 }]));
  const notReadyByBranch = new Map(notReady.map((entry) => [entry.branch, entry]));

  // Ranked first, in the order it gave; anything it could not see goes after, flagged.
  const ordered = [...ahead].sort((a, b) => (rank.get(a.branch)?.position ?? 1e9) - (rank.get(b.branch)?.position ?? 1e9));
  const git = gitFacts();

  console.log('');
  console.log(`Ahead of main, cheapest to land first (${ordered.length}):`);
  // Stamped because this output gets READ ALOUD - pasted into a chat, relayed to the owner,
  // quoted back hours later. Every one of those is a snapshot that keeps looking authoritative
  // while branches are queued and landed underneath it. Three times in one day someone acted on
  // a picture that had aged in transit, including the owner being told a branch was not queued
  // twenty minutes after its session queued it. A timestamp does not stop that; it makes it
  // visible, which is the most a report can do about its own staleness.
  for (const { branch, commits, age } of ordered) {
    const entry = rank.get(branch);
    const unready = notReadyByBranch.get(branch);
    // "Not queued" and "its landing died" are opposite situations - one needs its session to
    // finish, the other needs a person to read a log - and they used to print identically,
    // which made an exhausted landing vanish. `landingRow` keeps the dead one loud: what
    // happened, and the command that puts it back.
    // Merge-order already knows why a local branch is not ready. Dropping its `notReady` row here
    // made a dirty worktree print the false remote-only diagnosis below, so retain both the
    // location and reason it supplied.
    // The last arm is still not ONLY the remote-only case: this file counts `origin/main..<ref>`
    // and merge-order enumerates against LOCAL main, so a branch merged locally but not yet
    // pushed is in neither list and reads wrong here too. Narrow, and its own change.
    const worktree = String((entry ?? unready)?.worktree ?? '').split('/').pop() || 'no worktree';
    const where = entry
      ? worktree
      : unready
        ? `${worktree} - ${unready.reason}`
        : 'NOT RANKED - no local branch';
    console.log(`  ${branch}`);
    // The metadata FIRST, then the landing state - a failed landing's row runs to two lines, and
    // appending the commit count to the second of them read as part of the re-queue command.
    console.log(`      ${commits} commit(s)  ·  last commit ${age}  ·  ${where}`);
    console.log(`      ${landingRow(branch, jobs, git)}`);
  }
  console.log('  Only a branch\'s own session queues it - "not queued" means that work is not finished yet.');
  console.log(`  Read at ${new Date().toISOString().slice(11, 16)} UTC - re-run rather than trusting a copy of this.`);
}

/**
 * Every ref ahead of origin/main, local or remote-only, with how far ahead and how stale.
 *
 * REMOTE-ONLY REFS ARE INCLUDED HERE AND NOT IN `scripts/merge-order.mjs`, on purpose. This list
 * answers "what work exists that has not landed?", and a branch pushed from a closed session is
 * work whether or not this machine has a local ref for it - one sat unmentioned for seven weeks
 * before this site started looking. The ranking in merge-order answers "which of the branches
 * somebody can land RIGHT NOW should go first?", and its output is consumed by the landing flow,
 * which needs a local branch in a worktree; it names remote-only branches instead of ranking them.
 * Both sites see the same refs, and each says what it can honestly say about them.
 */
function refsAheadOfMain() {
  const list = (pattern) =>
    spawnSync('git', ['for-each-ref', '--format=%(refname:short)', pattern], { encoding: 'utf8', windowsHide: true })
      .stdout?.split('\n')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const names = new Set([...list('refs/heads/'), ...list('refs/remotes/origin/').map((n) => n.replace(/^origin\//, ''))]);
  const out = [];
  for (const branch of names) {
    if (branch === 'main' || branch === 'HEAD') continue;
    const ref = resolveRef(branch);
    if (!ref) continue;
    const count = spawnSync('git', ['rev-list', '--count', `origin/main..${ref}`], { encoding: 'utf8', windowsHide: true });
    const commits = Number(count.stdout?.trim() ?? 0);
    if (!commits) continue;
    const age = spawnSync('git', ['log', '-1', '--format=%cr', ref], { encoding: 'utf8', windowsHide: true }).stdout?.trim() ?? '';
    out.push({ branch, commits, age });
  }
  return out.sort((a, b) => b.commits - a.commits);
}

/**
 * Wait for one job to finish - with a BOUND, which is the only reason this exists.
 *
 * A gate cannot take a job id for an answer, so "I need this verdict now" is a real need. What is
 * not is waiting for ever: the agent's shell tool dies at 600 s and the wait outlives it, so a
 * long poll is a session sitting on an answer nobody reads. At the cap this says so and points at
 * the handoff, having interrupted nothing.
 */
async function cmdWait() {
  const id = args[1];
  // A non-numeric minute count must not become NaN: `waitedMs >= NaN` is false for ever, which
  // is precisely the unbounded wait this command exists to replace.
  const asked = Number(valueOf('--timeout-min'));
  const capMs = Math.min(Number.isFinite(asked) && asked > 0 ? asked * 60_000 : FOREGROUND_WAIT_CAP_MS, FOREGROUND_WAIT_CAP_MS);
  if (!id || id.startsWith('-')) {
    console.error('Usage: node scripts/jobs.mjs wait <id> [--timeout-min <n, capped at 30>]');
    process.exit(1);
  }
  const startedAt = Date.now();
  for (;;) {
    const job = readJobs(dir).find((j) => j.id === id);
    const verdict = waitVerdict({ job, waitedMs: Date.now() - startedAt, capMs });
    if (verdict.action === 'unknown') {
      console.error(`No such job: ${id}`);
      process.exit(1);
    }
    if (verdict.action === 'finished') {
      console.log(`${id} ${verdict.state}${verdict.exitCode === null ? '' : ` (exit ${verdict.exitCode})`}`);
      console.log(`  output: node scripts/jobs.mjs log ${id}`);
      process.exit(verdict.state === 'done' ? 0 : 1);
    }
    if (verdict.action === 'give-up') {
      console.error(verdict.message);
      process.exit(2);
    }
    await sleep(POLL_MS);
  }
}

function cmdLog() {
  const job = readJobs(dir).find((j) => j.id === args[1]);
  if (!job) {
    console.error(`No such job: ${args[1]}`);
    process.exit(1);
  }
  if (!existsSync(job.logPath)) {
    console.log(`${job.id} is ${job.state} and has written nothing yet.`);
    return;
  }
  process.stdout.write(readFileSync(job.logPath, 'utf8'));
}

function cmdCancel() {
  const job = readJobs(dir).find((j) => j.id === args[1]);
  if (!job) {
    console.error(`No such job: ${args[1]}`);
    process.exit(1);
  }
  // Only a live job has anything left to stop, and only a live job may be written over:
  // cancelling a finished landing used to make the queue call a landed branch withdrawn.
  const verdict = cancelVerdict(job);
  if (verdict.action === 'no-op') {
    console.log(verdict.message);
    return;
  }
  if (job.state === 'running' && job.pid) killTree(job.pid);
  writeJob(dir, { ...job, state: 'cancelled', finishedAt: Date.now() });
  console.log(verdict.message);
}

// --- the drain loop --------------------------------------------------------------------------

/**
 * Drain the queue until it is empty.
 *
 * NOTE FOR ANYONE CHANGING THE SCHEDULER: a live runner keeps the code and the environment it
 * started with, so an edit to `jobs-store.mjs` (or to `NOACG_JOBS_FREE_MB`) does nothing until
 * the runner is restarted. The symptom is a queue that will not move for reasons the current
 * source says it should - stop the runner and let the next `add` start a fresh one.
 */
async function runner() {
  const other = runnerPid();
  if (other && other !== process.pid) {
    // Not an error: two `add` calls racing to start a runner is normal, and the loser exiting
    // costs one process. There is no lock to leave behind if either dies.
    console.log(`A runner is already live (pid ${other}). Nothing to do.`);
    return;
  }
  ensureJobsDir(dir);
  console.log(`Runner ${process.pid} draining ${dir}`);
  let idleSince = null;
  let starvedSince = null;

  for (;;) {
    const now = Date.now();
    // One pass, one answer per branch. Held landings ask `aheadOfMain` on every poll and nothing
    // about a branch changes between two jobs read from the same snapshot.
    aheadOfMainCache.clear();
    let jobs = readJobs(dir, { onUnreadable: (n) => console.log(`  skipping unreadable ${n}`) });

    // A runner that died mid-job leaves `running` rows nothing will ever finish. Reap them
    // first, or the queue stays permanently full of phantom work.
    for (const dead of reapDead(jobs, isAlive, now, gitFacts())) {
      writeJob(dir, dead);
      console.log(dead.landedBeforeItEnded
        ? `  ${dead.id} reaped - its process is gone, but it had already landed ${dead.branch} on main`
        : `  ${dead.id} reaped - its process is gone`);
    }

    jobs = readJobs(dir);
    for (const job of jobs.filter((j) => j.state === 'running')) {
      if (now - (job.startedAt ?? now) < job.capMinutes * 60_000) continue;
      if (job.pid) killTree(job.pid);
      const record = timedOutRecord(job, now, gitFacts());
      writeJob(dir, record);
      console.log(record.landedBeforeItEnded
        ? `  ${job.id} killed at its ${job.capMinutes} min cap - it had already landed ${job.branch} on main`
        : `  ${job.id} timed out after ${job.capMinutes} min - killed`);
    }

    // ADOPT anything whose landing died without a verdict - the one this poll just killed, and
    // equally one that died last night while no runner was watching. A sweep and not a hook on
    // each of those writes, because a hook only ever saves the NEXT victim, and the branches
    // this was written for were already stuck when it was written.
    for (const [orphan, created] of adoptOrphans(now)) {
      console.log(
        `  ${orphan.branch}: landing ${orphan.retryOf} ${orphan.retryReason} - re-queued as ${created.id} `
        + `(automatic retry ${created.retryCount} of ${MAX_LANDING_RETRIES}, same commit`
        + `${created.orderHold ? ', held until a blocker moves' : ''})`,
      );
    }

    jobs = readJobs(dir);
    const { start, dead, released, waiting, running } = schedule(jobs, {
      hour: new Date(now).getHours(),
      freeMemMb: freeMb(),
      outsideRuns: outsideRuns(jobs),
      aheadOfMain,
      now,
    });
    // A job whose dependency can never be met is written off HERE rather than left in the queue
    // saying so on every poll. It stays visible as a failed job with the reason on it, which is
    // what the outstanding listing and the SessionStart summary read.
    for (const { job, reason } of dead) {
      writeJob(dir, { ...job, state: 'failed', finishedAt: now, exitCode: null, giveUpReason: reason });
      console.log(`  ${job.id} written off - ${reason}`);
    }
    for (const { reason, job } of released) console.log(`  ${job.id} released - ${reason}`);
    for (const job of start) {
      // A job that measures the app through a dev server nobody started fails in its first
      // second with the sentence that fixes it, rather than spending its whole slot on
      // ERR_CONNECTION_REFUSED and reporting what reads like a broken app.
      const check = devServerPrecheck(job, await devServerFacts(job));
      if (check.action === 'fail') {
        writeJob(dir, { ...job, state: 'failed', finishedAt: Date.now(), exitCode: null, giveUpReason: check.reason });
        console.log(`  ${job.id} NOT STARTED - ${check.reason}`);
        continue;
      }
      spawnJob(job);
    }

    // RAM STARVATION IS A STATE, NOT A MOMENT. Waiting jobs whose only complaint is memory, with
    // nothing running, means the machine is full of something the queue did not start. After a
    // quarter of an hour that is worth looking at - see scripts/ram-reclaim.mjs for what may be
    // closed and why the rest is only named.
    // `some`, not `every`: one job waiting on a dependency (or on another landing) must not hide
    // a queue that is otherwise pinned against the memory floor - that is the same job sitting
    // there for hours, which is what starvation looks like from outside.
    const starved = start.length === 0 && running.length === 0
      && waiting.some(({ reason }) => /RAM free/.test(reason));
    starvedSince = starved ? (starvedSince ?? now) : null;
    if (starved) starvedSince = reclaimIfStarved(starvedSince, now);

    const live = pending(readJobs(dir)).length;
    if (live === 0) {
      idleSince ??= now;
      if (now - idleSince >= IDLE_EXIT_MS) {
        console.log('Queue empty - runner exiting.');
        return;
      }
    } else {
      idleSince = null;
    }
    await sleep(POLL_MS);
  }
}

/** Start one job, wire its output to its log, and record the outcome when it finishes. */
function spawnJob(job) {
  const out = createWriteStream(job.logPath, { flags: 'a' });
  out.write(`${LOG_ATTEMPT_MARK} ${job.id} ${job.command}\n=== cwd ${job.checkout}\n`);
  const child = spawn(job.command, {
    cwd: existsSync(job.checkout) ? job.checkout : process.cwd(),
    shell: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // `{ end: false }`, and the stream is closed once below. Two sources piping into one destination
  // otherwise means the FIRST of them to finish calls `out.end()`, and whatever the other writes
  // after that is lost or throws write-after-end. It has always been wrong; it matters now that
  // the outcome is read back out of this file.
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  // `orderHold` is dropped as the job STARTS, and `blockedSince` is what remembers. A parked job
  // that is running is not parked any more, and leaving the field on it made `landingComing` read
  // an actively-deferring landing as held - so anything waiting behind THAT branch stayed parked
  // for a blocker that was in flight the whole time. The clock survives in `blockedSince` so a
  // re-park measures how long this landing has been blocked in total.
  const unparked = { ...job };
  delete unparked.orderHold;
  writeJob(dir, { ...unparked, state: 'running', startedAt: Date.now(), pid: child.pid });
  console.log(`  ${job.id} started (pid ${child.pid})`);

  // `close` rather than `exit`, and the log stream closed before anything reads it. `exit` fires
  // while the stdio pipes are still draining and the file stream still holds a buffer - and the
  // REFUSAL-KIND line is the last thing a landing writes, so reading on `exit` would miss exactly
  // the ordering block this is all for, intermittently and with no sign that it had.
  child.on('close', (code) => out.end(() => finishJob(job, code)));
}

/**
 * WHY a job stopped, in the words of the fact that stopped it - recorded on the job, not only
 * printed. The listing reads it back (`landingRow`), and a landing that gave up hours ago must be
 * able to say what happened without anyone opening a log first.
 */
function giveUpReasonFor(code, refusal, branch = '<branch>') {
  if (code === 0) return null;
  if (code === BLOCKED_EXIT) return `still blocked by another branch after ${MAX_DEFERRALS} turns`;
  // NOT this branch. Deliberately not a deferral like exit 3: a red main is fixed by a person, not
  // by the queue draining, so waiting cannot resolve it and a job that sat there cycling would hide
  // the very fault it detected.
  if (code === RED_MAIN_EXIT) return 'main itself is red - fix main first, then queue again (node scripts/main-health.mjs)';
  // The machine failed to answer - the run was still going, every run was a cancelled shell, none
  // appeared, or one did its work and a job hit its own timeout. None of those is about the branch,
  // and the sweep puts it straight back.
  if (code === NO_VERDICT_EXIT) return NO_VERDICT_REASON;
  // WHAT THE REFUSAL WAS, in the words of the thing that refused, with the one command that
  // answers it when there is one. The old sentence here - "read the log for which check said no" -
  // was written on 37 of the 51 merge jobs that did not exit 0 in the week to 2026-09-04, which is
  // a queue handing back a guess and a file path. `refusalGuidance` owns the wording so the
  // listing, this line and a session's own start banner cannot say three different things.
  const said = refusalGuidance(refusal, branch);
  if (said) return said.recovery ? `${said.summary} - ${said.recovery}` : said.summary;
  return `auto-merge refused it (exit ${code}) - read the log for which check said no`;
}

/** Record what a finished job did: park it, defer it, or write the verdict down. */
function finishJob(job, code) {
  const current = readJobs(dir).find((j) => j.id === job.id);
  // Cancelled or timed out while running: that verdict wins, do not overwrite it.
  if (!current || current.state !== 'running') return;

  // NOT MY TURN YET (auto-merge exit 3): the branch is blocked by another that is itself still
  // waiting, so this resolves the moment that one lands. Send it to the BACK of the queue
  // rather than failing it - queueing five branches at once means most start out blocked by
  // each other, and each landing frees the next. Bounded, so a genuinely stuck job still
  // surfaces instead of cycling for ever.
  if (code === BLOCKED_EXIT && (current.deferrals ?? 0) < MAX_DEFERRALS) {
    const deferrals = (current.deferrals ?? 0) + 1;
    writeJob(dir, { ...current, state: 'waiting', startedAt: null, pid: null, enqueuedAt: Date.now(), deferrals });
    console.log(`  ${job.id} not its turn yet - back of the queue (deferral ${deferrals}/${MAX_DEFERRALS})`);
    return;
  }

  // WHICH refusal, for the two the queue does something other than fail. Read once, here, from
  // the log the process just finished writing; every later decision reads the field this stores.
  const refusal = code === 0 || current.kind !== 'merge' ? null : readRefusal(current);

  // AN ORDERING BLOCK IS A WAIT. The branch is behind one that is still ahead of main with no
  // landing queued for it, which is not this branch's fault and not a permanent state - it ends
  // the moment that blocker lands or its own session queues it. Park the job on those branch
  // names and let the scheduler decide when re-running could come out differently
  // (`orderHoldDecision`); failing it here is what left `claude/j-fields-step-per-field` and
  // `claude/p-alignment-across-corpus` unlanded all night on 2026-09-03, both of which landed
  // unchanged the next morning as soon as a person queued them again.
  //
  // `blockedSince` is set once and never cleared, so the twelve-hour deadline measures how long
  // this landing has been blocked in TOTAL rather than restarting each time it is released and
  // blocked again. This is not a second declaration: the job is the one the session queued,
  // waiting for its turn rather than dying of it.
  if (refusal?.kind === ORDER_BLOCKED_REFUSAL && refusal.blockers.length > 0) {
    writeJob(dir, {
      ...current,
      state: 'waiting',
      startedAt: null,
      pid: null,
      enqueuedAt: Date.now(),
      refusal,
      blockedSince: current.blockedSince ?? Date.now(),
      orderHold: { blockers: refusal.blockers },
    });
    console.log(`  ${job.id} blocked by ${refusal.blockers.join(', ')} - held until one lands or is queued`);
    return;
  }

  const giveUpReason = giveUpReasonFor(code, refusal, current.branch ?? '<branch>');
  writeJob(dir, {
    ...current,
    state: code === 0 ? 'done' : 'failed',
    exitCode: code,
    finishedAt: Date.now(),
    ...(refusal ? { refusal } : {}),
    ...(giveUpReason ? { giveUpReason } : {}),
  });
  console.log(`  ${job.id} ${code === 0 ? 'done' : `FAILED - ${giveUpReason}`}`);
  // A landing nobody JUDGED is adopted by the sweep on the next poll, seconds from now. This
  // line is for the rest - a red gate, a conflict - where a person has to read why first.
  // `requeue` and not `add-merge`: the work was already declared finished, and re-running that
  // declaration cannot land anything committed since (scripts/jobs-store.mjs `requeueDecision`).
  if (code !== 0 && code !== NO_VERDICT_EXIT && current.kind === 'merge' && current.branch) {
    console.log(`      re-queue with: node scripts/jobs.mjs requeue ${current.branch}`);
  }
}

// --- OS-facing helpers -------------------------------------------------------------------------

/**
 * Kill the whole process TREE, not just the shell.
 *
 * Killing only the shell is a documented way to leave a bench running as an orphan that holds a
 * concurrency slot invisibly for hours (e2e/AGENTS.md). On Windows only `taskkill /T` walks the
 * tree; on posix the child was started detached so it leads its own process group.
 */
function killTree(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone - the outcome we wanted.
    }
  }
}

/**
 * Look for reclaimable memory when the queue has been starved long enough, and say what it found.
 *
 * Returns the starvation clock to keep: reset after a reclaim, so the next one is another
 * fifteen minutes away rather than every poll. The DECISION is in `ram-reclaim.mjs`; the process
 * facts come from `e2e-runs.mjs`, whose orphan detector only answers at all when no Playwright
 * CLI is running anywhere - which is the safety argument for killing any of this.
 */
function reclaimIfStarved(starvedSince, now) {
  // THE CLOCK IS CHECKED BEFORE THE PROCESS TABLE, not after. Gathering the facts costs several
  // full `Get-CimInstance` enumerations, and this runs every five-second poll - so asking first
  // and gathering second is the difference between one heavy query per quarter of an hour and
  // nine hundred of them thrown away, on a machine that is short of memory by definition.
  if (!starvedSince || now - starvedSince < RECLAIM_AFTER_MS) return starvedSince;
  const plan = planReclaim({ starvedSince, now, candidates: reclaimCandidates(), holders: reclaimHolders() });
  if (plan.action !== 'reclaim') return starvedSince;
  for (const line of describeReclaim(plan)) console.log(line);
  for (const { candidate } of plan.kill) killTree(candidate.pid);
  return null;
}

/** Leftovers, each already PROVED orphaned by the detector that found it. */
function reclaimCandidates() {
  const { workers, shells, servers } = orphanProcesses();
  return [
    ...workers.map((p) => ({ pid: p.pid, kind: 'playwright-worker' })),
    ...shells.map((p) => ({ pid: p.pid, kind: 'headless-browser-shell' })),
    // A server's chain is children-first, so the shims cannot outlive what they were shimming.
    ...servers.flatMap((s) => s.chain.map((pid) => ({ pid, kind: 'orphaned-dev-server-chain' }))),
  ];
}

/** Who is still using the machine. Named so a person can decide; never touched. */
function reclaimHolders() {
  return activeRuns({}).map((run) => `${run.root ?? 'unknown checkout'} - ${run.kind ?? 'browser work'} (pid ${run.pid})`);
}

/** Signal-0 liveness. Throws only when the pid is gone (or is not ours to signal). */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // alive, just not ours
  }
}

/**
 * The live runner's pid, or null. Read from the OS, so nothing goes stale.
 *
 * Delegates to `findRunner` rather than matching here. An earlier version required the command
 * line to contain this file's ABSOLUTE path, which only matched runners that `ensureRunner`
 * spawned: a runner started by hand as `node scripts/jobs.mjs --runner` was invisible, so the
 * listing said "NO RUNNER" while one was draining the queue - and, far worse, the next `add`
 * would have started a SECOND runner. Two schedulers reading one queue is the collision this
 * whole mechanism exists to prevent, so there is exactly one definition of "is a runner live".
 */
function runnerPid() {
  return findRunner(nodeProcesses(), { excludePid: process.pid });
}

/**
 * Start a runner in the background if none is live, and SAY SO IF IT DID NOT START.
 *
 * A duplicate start wastes a process, never a job - but a start that silently fails wastes the
 * whole queue. On 2026-09-04 the runner died with j-0550 queued and this function had already run:
 * the job sat in `starting` across reads four minutes apart while the listing carried
 * "NO RUNNER (start with --runner)" as an inline note nothing escalates. From outside, a dead
 * runner and a slow landing are identical, and that is the entire defect - the queue reported a
 * STATE and not whether the state was PROGRESSING.
 *
 * So the spawn is VERIFIED rather than fired and forgotten. Reading the process table costs about
 * three quarters of a second, which is why this waits rather than polling hard, and why only the
 * commands that queue work pay for it. The answer is returned as well as printed, so a caller can
 * decide what a failed start means to it.
 */
async function ensureRunner() {
  if (runnerPid()) return true;
  let spawnError = null;
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--runner'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', (err) => { spawnError = err; });
  child.unref();
  for (let waited = 0; waited < RUNNER_START_WAIT_MS; waited += RUNNER_START_POLL_MS) {
    await sleep(RUNNER_START_POLL_MS);
    if (spawnError) break;
    if (runnerPid()) return true;
  }
  console.error(
    `  NO RUNNER: the queue has work and nothing is draining it. The automatic start ${
      spawnError ? `failed - ${spawnError.message}` : `did not appear within ${RUNNER_START_WAIT_MS / 1000}s`}.`,
  );
  console.error('  Nothing will run until one is live. Start it in the foreground to see why:');
  console.error('    node scripts/jobs.mjs --runner');
  return false;
}

/**
 * Browser-driving work this queue did not start.
 *
 * `activeRuns()` sees every Playwright CLI on the machine, including the ones OUR jobs started.
 * We attribute a run to the queue when its checkout matches a running job's, and treat the rest
 * as outside work to subtract from capacity. That is an approximation - it errs towards counting
 * an ambiguous run as outside, which costs a slot rather than overloading the box.
 */
function outsideRuns(jobs) {
  const ours = new Set(jobs.filter((j) => j.state === 'running').map((j) => normalize(j.checkout)));
  return activeRuns({}).filter((run) => !ours.has(normalize(run.root))).length;
}

// Function declarations, not const arrows. The dispatch runs after the whole module body now, so
// a `const` here is initialised by the time any command reads it - but a declaration still reads
// better beside its siblings, and the habit costs nothing.
function normalize(p) {
  return String(p ?? '').replaceAll('\\', '/').toLowerCase().replace(/\/$/, '');
}
function freeMb() {
  return Math.round(freemem() / (1024 * 1024));
}

/**
 * The dev-server facts for one job: which port its CHECKOUT uses, and whether anything answers.
 *
 * Read from that checkout's generated `.claude/dev-port.json` rather than this process's own
 * reservation - the runner lives in one worktree and starts jobs in all of them, and the port is
 * per-checkout. A missing file means "cannot tell", which `devServerPrecheck` treats as go.
 */
async function devServerFacts(job) {
  if (!requiresRunningDevServer(job.command ?? '')) return {};
  let port;
  try {
    port = JSON.parse(readFileSync(join(job.checkout, '.claude', 'dev-port.json'), 'utf8')).port ?? null;
  } catch {
    return {}; // no generated record - fail open rather than refusing a job over a missing file
  }
  if (port === null) return {};
  return { port, busy: await isPortBusy(port, 750) };
}
function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function snapshot() {
  const jobs = readJobs(dir);
  return {
    jobs,
    ...schedule(jobs, {
      hour: new Date().getHours(), freeMemMb: freeMb(), outsideRuns: outsideRuns(jobs), aheadOfMain,
    }),
  };
}

/** A branch name as the ref that actually exists - the remote copy first, since a landing pushes. */
function resolveRef(branch) {
  return ['origin/' + branch, branch].find(
    (r) => spawnSync('git', ['rev-parse', '--verify', '-q', r], { encoding: 'utf8', windowsHide: true }).status === 0,
  ) ?? null;
}

/**
 * Is `branch` still unmerged - is the branch blocking a held landing actually still in the running?
 *
 * The same question `auto-merge.mjs` asks, asked here because the queue is what holds the job.
 * `origin/main` rather than local main: the landing pushes, so a branch that has landed is behind
 * the remote whether or not this checkout has fetched. Answering "yes, still ahead" when git cannot
 * say is the safe direction - it keeps a landing held rather than releasing it on an unanswered
 * question, and the hold's own deadline stops that becoming forever.
 *
 * MEMOIZED FOR ONE POLL. Only a held landing asks this, but a held landing asks it every five
 * seconds for up to twelve hours, and each answer is two git processes - about thirty thousand of
 * them over a night, for a fact that cannot change between two jobs read from the same snapshot.
 * The runner clears the cache each pass, so the answer is never older than one poll.
 *
 * IT LIVES HERE, beside its only other user, and that is safe again. It was moved above the
 * dispatch for a fortnight because the dispatch ran at module load and reached this const before
 * it was initialised - which killed every runner. The dispatch is a function called at the bottom
 * of the file now, so the whole module body runs first and a const's position no longer decides
 * whether the queue works.
 */
const aheadOfMainCache = new Map();
function aheadOfMain(branch) {
  if (aheadOfMainCache.has(branch)) return aheadOfMainCache.get(branch);
  // No such ref anywhere: it cannot be ahead of main, so it blocks nobody.
  const at = resolveRef(branch);
  const res = at
    ? spawnSync('git', ['rev-list', '--count', `origin/main..${at}`], { encoding: 'utf8', windowsHide: true })
    : null;
  const answer = at !== null && (res.status !== 0 || res.stdout.trim() !== '0');
  aheadOfMainCache.set(branch, answer);
  return answer;
}

function elapsed(startedAt) {
  if (!startedAt) return '';
  const min = Math.round((Date.now() - startedAt) / 60_000);
  return `${min} min`;
}

/** The commit a branch points at, or null if git cannot say. */
/**
 * The git questions the queue asks about a landing, in one object so every caller asks the same ones.
 *
 * `main` and not `origin/main` for containment, matching `onlyMainIntegrationsBetween`: the landing
 * merged the LOCAL main and pushed from it, that ref is shared by every worktree of this repo, and
 * it only moves forward - so it answers without needing a fetch and can never be behind a landing
 * this queue made.
 */
function gitFacts() {
  return {
    tipOf: branchTip,
    // The queue answers this rather than the landing script, because the landing script a retry
    // runs is the copy in the BRANCH's checkout - which may predate the rule. See
    // `retryLandingFor` for the measurement that made that the deciding argument.
    movedOnlyByItsOwnLanding: (pinned, tip) => onlyMainIntegrationsBetween(pinned, tip),
    inMain: (sha) => spawnSync('git', ['merge-base', '--is-ancestor', sha, 'main'], {
      encoding: 'utf8',
      windowsHide: true,
    }).status === 0,
  };
}

function branchTip(branch) {
  const res = spawnSync('git', ['rev-parse', branch], { encoding: 'utf8', windowsHide: true });
  return res.status === 0 ? res.stdout.trim() : null;
}

function currentBranch() {
  const res = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  return res.status === 0 ? res.stdout.trim() : null;
}

export { finishedSince, readJobs, jobsDir };

await main();
