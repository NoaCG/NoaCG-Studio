// THE JOB QUEUE'S STATE AND ARITHMETIC - everything that can be decided without spawning
// anything. `jobs.mjs` is the CLI and the drain loop; this file is what the tests drive.
//
// WHY A QUEUE EXISTS AT ALL (docs/JOB_RUNNER_PLAN.md has the measurements). Browser-driving work
// used to serialize itself by WAITING: `test:e2e:affected:queued` expands to
// `node scripts/e2e-runs.mjs --wait && ...`, a 5-second poll loop with no cap and no tie-break.
// Three things go wrong with that, and together they cost hours a day:
//
//   1. The agent's shell tool is killed at 600 s, so a foreground wait behind a twelve-minute
//      suite dies with the wait still running and the run never starts. Nothing reports it.
//   2. Every waiter wakes within 5 s of the slot freeing and they all launch together - the
//      exact collision the waiting was for.
//   3. Nothing anywhere shows a QUEUE, so "correctly queued" and "dead ten minutes ago" look
//      identical from outside.
//
// Enqueuing instead of waiting removes (1) by construction - no shell command outlives the tool
// that started it - and one runner draining the queue removes (2), because only one process
// decides what starts. This file's `pending()` output removes (3).
//
// SHAPE. One JSON file per job in <git-common-dir>/noacg-jobs/, the same shared directory the
// dev-port registry uses, so every worktree of this repo - and only this repo - sees one queue.
// A file per job rather than one queue file: two sessions enqueuing in the same second cannot
// lose each other's write, and a half-written file is one unreadable job rather than a corrupt
// queue. Ids are minted with the exclusive 'wx' flag, which is the whole concurrency story -
// the filesystem decides who won, exactly as it does for port tickets.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitCommonDir } from './dev-port.mjs';
import { invokesE2e, invokesSweep, requiresRunningDevServer } from './command-match.mjs';

/** Job lifecycle. `waiting` and `running` are live; the rest are terminal. */
export const LIVE_STATES = Object.freeze(['waiting', 'running']);

/** What a job is. `merge` never runs beside anything, whatever the clock says. */
export const KINDS = Object.freeze(['gate', 'merge', 'sweep']);

/**
 * What a job COSTS, in suite-equivalents.
 *
 * Counting jobs was the crude part. A Playwright suite is a dev server plus four browser workers
 * - two of them together were measured at 34 `chrome-headless-shell` processes, 93% CPU and
 * under 2 GB free. A merge job is almost entirely `gh run watch` waiting on GitHub's network,
 * and it used to occupy a whole slot for ten minutes while a suite queued behind it. That is the
 * overnight case exactly: "land these five branches" is five jobs that are nearly all idle.
 *
 * Heavy work is classified by `command-match.mjs`, the repo's ONE named list of what starts
 * browser work - the same authority the guard hook and the process detector read, so a script
 * that is heavy here is heavy everywhere rather than in a second opinion that can drift.
 */
export const COST = Object.freeze({ browser: 1, merge: 0.15, other: 0.4 });

/** Capacity policy. Night is for agents; the day belongs to the person using the laptop. */
export const POLICY = Object.freeze({
  nightFrom: 0, // 00:00 local, inclusive
  nightTo: 7, //  07:00 local, exclusive
  /** Budgets in suite-equivalents, not job counts. */
  byDay: 1,
  byNight: 2,
  /**
   * Below this much free RAM nothing new starts, whatever the clock allows. 4 GB on a 16 GB box
   * is a starting point, not a measurement - `NOACG_JOBS_FREE_MB` retunes it without a code
   * change, which is how it should be set once the logs say what a run actually costs.
   */
  freeMemFloorMb: Number(process.env.NOACG_JOBS_FREE_MB ?? 4096),
  /**
   * A job killed at this age is recorded `timed-out` rather than sitting forever.
   *
   * DO NOT RAISE THIS TO FIT A LANDING THAT DID NOT FINISH. Measured 2026-09-04 over the 211
   * landings this queue has completed: median 7.6 minutes, p90 12.3, slowest ever 21.3. Forty-five
   * is already 2.1x the worst case anything has ever taken, and the two landings that hit it
   * (j-0438, j-0445 - the first two in 213) hit it because they were asking CI for the FULL
   * e2e suite, which no cap short of an hour would have covered. Raising the cap would have
   * turned a visible failure into an hour of invisible waiting per landing and left the real
   * defect in place; the fix was in `auto-merge.mjs` and `.github/workflows/ci.yml`, where the
   * full-suite escalation came from.
   */
  capMinutes: 45,
});

/** The shared queue directory, or null outside a git checkout. */
export function jobsDir() {
  // Tests point a hook at a throwaway store; the live one is shared infrastructure and a test
  // job written there would be picked up by the real runner.
  if (process.env.NOACG_JOBS_DIR) return process.env.NOACG_JOBS_DIR;
  const common = gitCommonDir();
  return common ? join(common, 'noacg-jobs') : null;
}

/** Create the queue directory (and its log folder) if they are not there yet. */
export function ensureJobsDir(dir) {
  mkdirSync(join(dir, 'logs'), { recursive: true });
  return dir;
}

/**
 * Every readable job, oldest first.
 *
 * An unparseable file is SKIPPED and reported rather than throwing: a torn read during someone
 * else's write must not stop the queue, and a job nobody can read is one lost job, not an outage.
 */
export function readJobs(dir, { onUnreadable } = {}) {
  if (!dir || !existsSync(dir)) return [];
  const jobs = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const job = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      // The queue directory also holds SIDECARS - `last-seen.json` is one - and a file that is
      // not a job must not be returned as a job with no id. It reached every consumer of this
      // list as an entry with `undefined` state until it was noticed; a prune deciding what is
      // old enough to delete is not the place to meet it for the first time.
      if (job && typeof job.id === 'string') jobs.push(job);
    } catch {
      onUnreadable?.(name);
    }
  }
  return jobs.sort((a, b) => (a.enqueuedAt ?? 0) - (b.enqueuedAt ?? 0) || String(a.id).localeCompare(String(b.id)));
}

/** Overwrite one job's file. Callers own the whole object; there is no partial update. */
export function writeJob(dir, job) {
  writeFileSync(join(dir, `${job.id}.json`), `${JSON.stringify(job, null, 1)}\n`);
  return job;
}

/**
 * Mint a new job.
 *
 * The id is claimed with 'wx' (create-only), so two sessions adding in the same millisecond
 * cannot land on the same id - the loser gets EEXIST and takes the next number. Same mechanism
 * as the port registry's tickets, for the same reason: the filesystem is the arbiter, and there
 * is no lock left behind if the process dies mid-claim.
 */
/**
 * The `/check` verdict stamp for a branch, or null. The file is per-machine state beside the job
 * store (`checks/<branch-with-slashes-as-dashes>.json`, .agent-workflows/check.md); a stamp that
 * does not parse is the same as no stamp, since a verdict nobody can read proves nothing.
 */
export function readReviewStamp(dir, branch) {
  const file = join(dir, 'checks', `${String(branch).replaceAll('/', '-')}.json`);
  if (!existsSync(file)) return null;
  try {
    const stamp = JSON.parse(readFileSync(file, 'utf8'));
    return stamp && typeof stamp.reviewedSha === 'string' ? stamp : null;
  } catch {
    return null;
  }
}

/** The stamp verdicts that mean "passed". Sessions have written both; anything else is not a pass. */
const PASSING_VERDICTS = new Set(['pass', 'green']);

/**
 * Does a stamp cover a tip? The sha it names must be a prefix of the tip (18 of the 68 stamps
 * on this machine on 2026-09-06 held an abbreviated sha, and a stamp `/check` wrote by hand is
 * not wrong for being short), at least seven hex characters, and the verdict must be a pass.
 * Returns the reason it does not, or null when it does.
 */
export function stampGap(stamp, tip) {
  if (!stamp) return 'no /check stamp exists';
  if (typeof tip !== 'string' || tip.length === 0) return 'the branch tip could not be resolved';
  const reviewed = String(stamp.reviewedSha).toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(reviewed)) return `the stamp's reviewedSha "${stamp.reviewedSha}" is not a sha`;
  if (!tip.toLowerCase().startsWith(reviewed)) return `the stamp reviewed ${reviewed.slice(0, 8)}, but the tip is ${tip.slice(0, 8)}`;
  if (stamp.verdict !== undefined && !PASSING_VERDICTS.has(String(stamp.verdict).toLowerCase())) {
    return `the stamp's verdict is "${stamp.verdict}", not a pass`;
  }
  return null;
}

export function addJob(dir, {
  command, checkout, branch = null, kind = 'gate', after = [], capMinutes = POLICY.capMinutes,
  retryOf = null, retryCount = 0, orderHold = null, blockedSince = null,
  retryReason = null, ciDispatched = false, review = null, now,
}) {
  if (!KINDS.includes(kind)) throw new Error(`unknown job kind: ${kind}`);
  if (typeof command !== 'string' || command.trim() === '') throw new Error('a job needs a command');
  ensureJobsDir(dir);

  const taken = new Set(readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)));
  // Ids continue from the highest one still on disk rather than restarting at the first free
  // number. Pruning (below) frees the oldest ids, and reusing one immediately would give a fresh
  // job the id an old log, an old landing record and somebody's notes already refer to. Scanning
  // from the high-water mark keeps ids moving forward for as long as anything recent is kept,
  // which is always; it also removes the hard stop at 9999, since the scan now wraps into the
  // low numbers the prune has released instead of throwing.
  const highest = [...taken].reduce((max, id) => {
    const n = Number(/^j-(\d{4})$/.exec(id)?.[1]);
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
  for (let step = 0; step < 9999; step += 1) {
    const n = ((highest + step) % 9999) + 1;
    const id = `j-${String(n).padStart(4, '0')}`;
    if (taken.has(id)) continue;
    const job = {
      id,
      kind,
      command,
      checkout,
      branch,
      after,
      capMinutes,
      retryOf,
      retryCount,
      // Set only when the job is born already parked behind another branch - an ordering block the
      // sweep adopted. It is `waiting` like any other job; the scheduler is what holds it.
      ...(orderHold ? { orderHold } : {}),
      ...(blockedSince ? { blockedSince } : {}),
      ...(retryReason ? { retryReason } : {}),
      // This landing has already been handed a full CI run by the queue. Kept on the record so a
      // second gate-proved-nothing refusal escalates rather than asking for another.
      ...(ciDispatched ? { ciDispatched } : {}),
      // What `/check` said about the tip this job pins: `{ stamp: 'reviewed', reviewedSha }` when
      // the stamp matched, `{ stamp: 'unreviewed', reason }` when the session queued past it. The
      // landing reads it the way it reads CI - a verdict with a machine consumer (2026-09-06).
      ...(review ? { review } : {}),
      enqueuedAt: now,
      state: 'waiting',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      pid: null,
      logPath: join(dir, 'logs', `${id}.log`),
    };
    try {
      writeFileSync(join(dir, `${id}.json`), `${JSON.stringify(job, null, 1)}\n`, { flag: 'wx' });
      return job;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Someone else took this id between the listing and the write. Walk on.
    }
  }
  throw new Error('no free job id - the queue directory holds 9999 jobs');
}

/**
 * How long a FINISHED job's record and log are kept.
 *
 * Fourteen days is the window anybody actually reads back over - "what ran while I was away" is a
 * question about last night, and the CI classification work that needs a fortnight reads GitHub,
 * not this directory. Below that the queue grows without limit: 222 job files and 205 logs
 * accumulated in the queue's first four days, at about 55 jobs a day, which reaches the 9999-id
 * ceiling inside six months and makes every listing read the lot.
 */
export const JOB_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/** The ids of terminal jobs past the retention window. Live jobs are never expired, at any age. */
export function expiredJobIds(jobs, now, { retentionMs = JOB_RETENTION_MS } = {}) {
  return jobs
    .filter((job) => !LIVE_STATES.includes(job.state))
    .filter((job) => {
      // A job that finished says when; one that never started is dated by when it was queued.
      const at = job.finishedAt ?? job.enqueuedAt;
      return Number.isFinite(at) && now - at > retentionMs;
    })
    .map((job) => job.id);
}

/**
 * Delete the records and logs of jobs past the retention window. Returns the ids removed.
 *
 * OPPORTUNISTIC, never a daemon: it is called from the queue's own entry points, so the sweep
 * happens exactly when somebody is already using the queue and costs one directory read they were
 * paying for anyway. A second background process to tidy the first one's files would be a new
 * thing to crash, and there is nothing here urgent enough to justify one.
 *
 * A file that cannot be deleted (another process reading it, a lock) is left for next time rather
 * than reported: the caller asked for a job id or a listing, not for a filesystem verdict.
 */
export function pruneJobs(dir, { now = Date.now(), retentionMs = JOB_RETENTION_MS } = {}) {
  if (!dir || !existsSync(dir)) return [];
  const removed = [];
  for (const id of expiredJobIds(readJobs(dir), now, { retentionMs })) {
    try {
      rmSync(join(dir, `${id}.json`));
      removed.push(id);
    } catch {
      continue; // still in use - leave the log alone too, so the pair stays consistent
    }
    try {
      rmSync(join(dir, 'logs', `${id}.log`));
    } catch {
      // no log, or already gone: the record is what the listing reads, and it is gone
    }
  }
  return removed;
}

/**
 * How many jobs may be RUNNING right now.
 *
 * `outsideRuns` is browser-driving work this queue did not start - another coding agent, or a
 * hand-run command. It is invisible to the queue but visible to `e2e-runs.mjs activeRuns()`, so
 * we subtract it before starting anything. Cooperation is an optimisation here; the OS process
 * table stays the source of truth.
 */
export function capacity({ hour, outsideRuns = 0, policy = POLICY }) {
  // The free-RAM floor is deliberately NOT here. It is an admission check on one job, scaled by
  // what that job costs (see `schedule`), because zeroing the whole budget on a suite-sized
  // threshold also stopped the landings - the cheapest jobs there are, and the ones that most
  // need to finish overnight.
  const isNight = hour >= policy.nightFrom && hour < policy.nightTo;
  // An outside run is browser work by definition - `activeRuns` only reports Playwright CLIs and
  // sweeps - so it costs a full suite-equivalent.
  return Math.max(0, (isNight ? policy.byNight : policy.byDay) - outsideRuns * COST.browser);
}

/**
 * Commands we KNOW are cheap: CPU and a little RAM, no dev server, no browser.
 *
 * The list is deliberately short and explicit. Everything it does not recognise is charged as a
 * full suite, because the failure directions are not symmetric: charging a cheap job too much
 * costs some wall clock at night, while charging an expensive one too little puts two dev
 * servers and eight browser workers on a 16 GB laptop and slows everything down at once.
 */
const CHEAP = [/\bnpm\s+run\s+build\b/, /\bnode\s+--test\b/, /\bnpm\s+run\s+lint\b/, /\btsc\b/, /\bnpm\s+run\s+check:/];

/**
 * What one job costs, in suite-equivalents.
 *
 * A job records its cost when it is queued, so the number is visible in the queue and stable for
 * the job's whole life; this is where that default comes from.
 */
export function costOf(job) {
  if (typeof job.cost === 'number') return job.cost;
  if (job.kind === 'merge') return COST.merge;
  const command = job.command ?? '';
  if (invokesE2e(command) || invokesSweep(command)) return COST.browser;
  return CHEAP.some((p) => p.test(command)) ? COST.other : COST.browser;
}

/** Budgets are fractional; print them without floating-point noise. */
function round(n) {
  return Math.round(n * 100) / 100;
}

/** Whether a job's `after:` dependencies have all finished green. */
export function dependenciesMet(job, byId) {
  return (job.after ?? []).every((id) => byId.get(id)?.state === 'done');
}

/** A job whose dependency reached a terminal state that is not `done`. */
export function dependenciesDead(job, byId) {
  return (job.after ?? []).some((id) => {
    const dep = byId.get(id);
    return dep === undefined || ['failed', 'timed-out', 'cancelled'].includes(dep.state);
  });
}

/**
 * What a job's dependencies say it should do now: `go`, `wait`, `release`, or `dead`.
 *
 * WHY `release` EXISTS, AND ONLY FOR LANDINGS. `--after` on a merge job means "not before that
 * one", which is a matter of TURN, not of permission: landings are order-free, each is fully
 * re-verified against whatever main it finds, and the queue already refuses to run two at once.
 * So when the predecessor reaches ANY terminal state, the question the dependency was asking has
 * been answered and this landing may go. It used to sit at "a job it depends on did not finish
 * green" for ever instead - measured 2026-08-28, a landing chained behind a failed one simply
 * never ran and nothing anywhere said it had stopped trying.
 *
 * For every OTHER kind the old reading is right and it is now acted on rather than merely
 * printed: a gate that was to run after a build cannot mean anything once that build failed, so
 * the job is FAILED with the reason on it rather than left waiting for a state that will never
 * arrive.
 */
export function dependencyDecision(job, byId) {
  if (dependenciesMet(job, byId)) return { action: 'go' };
  const spent = (job.after ?? []).filter((id) => byId.get(id)?.state !== 'done');
  if (!dependenciesDead(job, byId)) return { action: 'wait', reason: `waiting on ${spent.join(', ')}` };
  if (job.kind === 'merge') {
    return {
      action: 'release',
      reason: `${spent.join(', ')} did not finish green - landings are order-free, so this one goes anyway`,
    };
  }
  return { action: 'dead', reason: `${spent.join(', ')} did not finish green, so this job can never run` };
}

/**
 * Which jobs should start now, and why each of the rest is waiting.
 *
 * The reason matters as much as the decision: "capacity 1/1" and "waiting on j-0006" and
 * "RAM 3.1 GB free" are three completely different situations that all look like "nothing is
 * happening" from outside, which is the thing this whole mechanism exists to end.
 */
export function schedule(jobs, {
  hour, freeMemMb, outsideRuns = 0, policy = POLICY, aheadOfMain = () => true, now = Date.now(),
}) {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const running = jobs.filter((j) => j.state === 'running');
  const slots = capacity({ hour, freeMemMb, outsideRuns, policy });

  /**
   * Is a landing for `branch` actually COMING, in the sense that waiting behind it can pay?
   *
   * A held job is deliberately not one. Otherwise two landings parked behind each other read as
   * queued to one another, both release, both refuse in seconds and both spend their deferrals -
   * the busy-spin the hold exists to replace. A `running` landing always counts, held or not: it
   * is doing the thing right now.
   */
  const heldBack = (j) => j.state === 'waiting' && (j.orderHold?.blockers ?? []).length > 0;
  const landingComing = (branch) => jobs.some(
    (j) => j.kind === 'merge' && j.branch === branch && LIVE_STATES.includes(j.state) && !heldBack(j),
  );

  const start = [];
  const waiting = [];
  /** Jobs the caller must write off - their dependencies can never be met. Never left waiting. */
  const dead = [];
  /** Landings let through despite a dead dependency, with the reason to print. */
  const released = [];
  let used = running.reduce((sum, j) => sum + costOf(j), 0);
  const mergeLive = () => [...running, ...start].some((j) => j.kind === 'merge');

  for (const job of jobs.filter((j) => j.state === 'waiting')) {
    const deps = dependencyDecision(job, byId);
    if (deps.action === 'wait') {
      waiting.push({ job, reason: deps.reason });
      continue;
    }
    if (deps.action === 'dead') {
      dead.push({ job, reason: deps.reason });
      continue;
    }
    // PARKED BEHIND AN UNQUEUED BRANCH. Checked before every other reason a landing might wait,
    // because it is the only one that can end in the job being written off - and a held job that
    // reported "another landing is in flight" instead would look like ordinary traffic while its
    // twelve hours ran out.
    const hold = orderHoldDecision(job, { queuedForLanding: landingComing, aheadOfMain, now });
    if (hold.action === 'hold') {
      waiting.push({ job, reason: hold.reason });
      continue;
    }
    if (hold.action === 'give-up') {
      dead.push({ job, reason: hold.reason });
      continue;
    }
    // Recorded only if the job actually starts below - a note about a job that is still waiting
    // for a slot would be printed on every poll and mean nothing.
    const releasedBecause = deps.action === 'release' ? deps.reason : hold.reason ?? null;
    // TWO MERGES NEVER OVERLAP. That is what makes "land one branch at a time" structural
    // rather than remembered, and it holds whatever the clock or the budget says.
    if (job.kind === 'merge' && mergeLive()) {
      waiting.push({ job, reason: 'another landing is in flight' });
      continue;
    }
    // A merge rewrites the working tree of the checkout it runs in, so it must not run beside
    // anything IN THAT CHECKOUT - a suite there would have the ground moved under it mid-run.
    // Beside work in a DIFFERENT worktree it is harmless, which is what lets a night drain
    // several landings alongside a suite instead of behind it.
    const sharesCheckout = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
    const live = [...running, ...start];
    if (
      (job.kind === 'merge' && live.some((j) => sharesCheckout(j.checkout, job.checkout))) ||
      live.some((j) => j.kind === 'merge' && sharesCheckout(j.checkout, job.checkout))
    ) {
      waiting.push({ job, reason: 'a landing is using that checkout' });
      continue;
    }
    const cost = costOf(job);
    // THE FLOOR SCALES WITH THE JOB. It exists to stop a dev server and four browser workers
    // starting on a box that is already short - not to stop a landing, which is a few hundred
    // megabytes spending ten minutes in `gh run watch`. Charging a 0.15 job the full 4 GB
    // stalled exactly the work the owner cares most about finishing overnight.
    if (freeMemMb < policy.freeMemFloorMb * cost) {
      waiting.push({
        job,
        reason: `only ${(freeMemMb / 1024).toFixed(1)} GB RAM free, needs ${(policy.freeMemFloorMb * cost / 1024).toFixed(1)}`,
      });
      continue;
    }
    // A LANDING IS NOT CHARGED AGAINST THE SUITE BUDGET. The budget protects RAM and CPU, and a
    // landing uses neither meaningfully - it is a couple of git commands and then ten minutes in
    // `gh run watch`. Its concurrency is governed by its own rules instead, which are stricter
    // where it matters: two never overlap, and none runs in a checkout something else is using.
    // Without this exemption one suite in another worktree consumed the whole day budget and
    // stalled every landing behind it - the opposite of "merge latency is the bottleneck".
    if (job.kind !== 'merge' && used + cost > slots) {
      waiting.push({
        job,
        reason: `budget ${round(used)}/${round(slots)} used${outsideRuns ? `, ${outsideRuns} run(s) outside this queue` : ''}`,
      });
      continue;
    }
    start.push(job);
    if (releasedBecause) released.push({ job, reason: releasedBecause });
    used += cost;
  }
  return { start, waiting, dead, released, running, slots };
}

/**
 * Jobs recorded `running` whose process is gone - a runner that was killed, or a reboot.
 *
 * Without this a crashed runner leaves the queue permanently full of phantom work. With it, the
 * next runner start reaps them, so a dead runner is a delay rather than a stall.
 */
export function reapDead(jobs, isAlive, now, git = {}) {
  const reaped = [];
  for (const job of jobs.filter((j) => j.state === 'running')) {
    if (job.pid && isAlive(job.pid)) continue;
    reaped.push(endedWithoutExitCode(job, { now, killedBy: 'reaper', ...git }));
  }
  return reaped;
}

/**
 * The commit a landing was queued to land, read off its own `--expect-sha` pin. Null if it has none.
 *
 * One parser, because three places ask this question and a second regex would drift: the re-pin,
 * the retry gate, and the containment check that decides whether a dead landing actually died.
 */
export function declaredCommitOf(job) {
  if (!job || job.kind !== 'merge') return null;
  return /--expect-sha\s+([0-9a-f]{7,40})/.exec(job.command ?? '')?.[1] ?? null;
}

/**
 * Did this landing put its branch on main, whatever became of its process?
 *
 * GIT IS THE RECEIPT, and it outranks the job record. The merge queue merges the group and the
 * watcher only then sees it, so a watcher killed between the merge and its own exit has missed a
 * landing that already happened - and the proof is durable, in a ref, long after the process is
 * gone. `inMain` is the one `git merge-base --is-ancestor` call that reads it, and it is the same
 * instrument wave-tick uses, which is why containment reporting stayed correct on 2026-09-04 while
 * job status did not.
 *
 * It answers from a ref this checkout can already see, so a fetch it did not make can leave it
 * saying "not landed" about a branch that landed. That is the safe direction: the fallback is
 * re-running the watcher, which asks GitHub and costs a poll rather than a CI run.
 *
 * An unpinned landing (queued before pinning existed) answers false: with no declared commit there
 * is nothing to look for, and reading the branch tip instead would call a branch landed on the
 * strength of work nobody declared.
 */
export function landedDespiteItsProcess(job, { inMain = () => false } = {}) {
  const sha = declaredCommitOf(job);
  return sha ? inMain(sha) === true : false;
}

/**
 * The record for a landing that ended with no exit code of its own - reaped, or killed at its cap.
 *
 * THE MEASUREMENT. On 2026-09-04 j-0533 ran the landing for `claude/f-contracts-point` to
 * completion: its log ends `auto-merge: landed claude/f-contracts-point on main as 6f7efcfd`, and
 * e5ace753 has been an ancestor of main ever since. The runner never observed the exit, reaped the
 * process, and wrote `state: "failed", exitCode: null, reapedAsDead: true`. The queue then put a
 * branch that was already in main back into the queue, and in a serialised queue that wasted
 * landing delayed every branch behind it.
 *
 * So the WRITER ASKS GIT before it records. A job with no exit code has no verdict of its own, and
 * the only place a verdict can still be found is the ref the landing pushed. Writing it here rather
 * than only correcting it on read is what makes the file on disk mean what it says: a record is
 * read by more than this module - by a person opening `<id>.json`, and by any later tool - and a
 * stale one stays a lie for as long as it is kept. The read side corrects as well, because these
 * two writers are not the only way a record gets written and everything already on disk predates
 * this.
 *
 * `landedBeforeItEnded` says on the record why a job is `done` while carrying no exit code, so a
 * later reader never has to infer it. `reapedAsDead` is kept either way: how the process ended is a
 * separate fact from whether the work landed, and dropping it would hide a dying runner.
 */
function endedWithoutExitCode(job, { now, killedBy, inMain = () => false }) {
  const base = { ...job, finishedAt: now, exitCode: null };
  if (killedBy === 'reaper') base.reapedAsDead = true;
  if (landedDespiteItsProcess(job, { inMain })) return { ...base, state: 'done', landedBeforeItEnded: true };
  return { ...base, state: killedBy === 'reaper' ? 'failed' : 'timed-out' };
}

/**
 * The record for a landing killed at its own cap - `done` if it had already pushed, else timed out.
 *
 * The cap kills the same way the reaper does, and it lies the same way if it does not look: a
 * landing that pushed and then sat in a `gh run watch` nobody needed any more is killed at its 45
 * minutes having already succeeded. Same question, same answer, one function.
 */
export function timedOutRecord(job, now, git = {}) {
  return endedWithoutExitCode(job, { now, killedBy: 'cap', ...git });
}

/**
 * The pid of a live drain loop in `processes`, or null.
 *
 * Read from the OS process list rather than a pidfile, for the same reason `e2e-runs.mjs` reads
 * the process table: a crashed runner leaves no stale claim behind, so the answer is
 * self-cleaning. `excludePid` keeps a runner from finding itself.
 */
export function findRunner(processes, { excludePid = null } = {}) {
  const match = processes.find(
    (p) => p.pid !== excludePid && /jobs\.mjs/.test(p.command ?? '') && /--runner\b/.test(p.command ?? ''),
  );
  return match?.pid ?? null;
}

/**
 * Branches this queue has landed, oldest first.
 *
 * Automating the merge took the ANSWER off the owner's desk along with the decision: with
 * landings happening in a background runner, "which branches are in, and therefore which sessions
 * are finished?" stopped being visible anywhere. This ledger is what puts it back - SessionStart
 * announces it in the worktree whose branch landed, and `npm run jobs` lists it for everyone else.
 */
export function readLandings(dir) {
  if (!dir) return [];
  try {
    return readFileSync(join(dir, 'landed.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null; // one torn line must not hide every landing before it
        }
      })
      .filter(Boolean);
  } catch {
    return []; // nothing has landed through the queue yet
  }
}

/** The most recent landing of the branch checked out at `worktree`, or null. */
export function landingForWorktree(landings, worktree) {
  const want = samePath(worktree);
  if (!want) return null;
  const mine = landings.filter((l) => samePath(l.worktree) === want);
  return mine.length > 0 ? mine[mine.length - 1] : null;
}

/** One path, comparable across Windows separators and case. */
function samePath(path) {
  return String(path ?? '').replaceAll('\\', '/').toLowerCase().replace(/\/$/, '');
}

/**
 * The newest landing REFUSAL belonging to the session in `worktree`, or null.
 *
 * WHY A REFUSAL NEEDS AN ADDRESS AT ALL. A landing runs in a background runner, so the refusal is
 * printed into a log file in a directory nobody opens, and the session that owns the branch - the
 * one party that can act on a dirty tree, a conflict or a red gate - is told nothing. Over the
 * seven days to 2026-09-04 that was 37 refusals with no kind on them, every one of which needed a
 * person to notice unaided. The job record carries `checkout`, so the address was always there.
 *
 * `refused` is what the caller shows: the state as the queue left it, the kind, and the one
 * command that answers it when there is one. A HELD landing is included deliberately - it is not
 * a failure, but a session that thinks it is finished should know its branch is parked behind
 * another and why.
 */
export function refusalForWorktree(jobs, worktree, { since = 0, landedAt = 0 } = {}) {
  const want = samePath(worktree);
  if (!want) return null;
  const at = (j) => j.finishedAt ?? j.enqueuedAt ?? 0;
  const mine = jobs
    .filter((j) => j.kind === 'merge' && samePath(j.checkout) === want && j.refusal?.kind)
    .filter((j) => j.state === 'failed' || j.orderHold)
    // A landing still queued or running has not refused THIS time, whatever it did last time.
    .filter((j) => at(j) >= since)
    // AND THE BRANCH DID NOT GO ON TO LAND. The whole flow this exists for is a refusal at 01:00
    // that the sweep recovers at 02:00, read at 09:00 - and printing both banners would say the
    // branch is on main and then invite the session to re-queue it. `landedAt` is the landing the
    // caller already found for this worktree, so the two lines cannot contradict each other.
    .filter((j) => at(j) > landedAt);
  const last = mine.sort((a, b) => at(a) - at(b)).at(-1);
  if (!last) return null;
  const said = refusalGuidance(last.refusal, last.branch ?? '<branch>');
  return {
    job: last,
    branch: last.branch,
    kind: last.refusal.kind,
    held: Boolean(last.orderHold),
    summary: said?.summary ?? last.giveUpReason ?? 'the landing refused - read its log',
    recovery: said?.recovery ?? null,
    // Who runs it. An unknown kind is nobody's promise, so it reads as the session's.
    byQueue: said?.byQueue === true,
  };
}

/**
 * The longest a session may wait on a queued job in the FOREGROUND.
 *
 * Matched to the cap in `e2e-runs.mjs --wait` and `e2e/_offline-guard.ts`, and for the same
 * reason: the agent's shell tool is killed at 600 s, so from ten minutes on a foreground wait is
 * a process nobody is reading. Thirty minutes is generous for "I need the verdict now" and short
 * enough that the answer to a longer job is what it should always have been - hand off and let
 * the runner finish it.
 */
export const FOREGROUND_WAIT_CAP_MS = 30 * 60_000;

/**
 * May `jobs.mjs cancel` write over this job?
 *
 * Only a LIVE job can be cancelled, because only a live job has anything left to stop. Cancel
 * used to write `state: 'cancelled'` with a fresh `finishedAt` over whatever id it was handed,
 * including a merge job that had already exited 0 - and `landingStateFor` reads `cancelled` as
 * `withdrawn` and sorts terminal jobs by `finishedAt`, so one mistyped id made `npm run jobs`
 * announce "LANDING WITHDRAWN" for a branch already on main and hand back a command to queue
 * it again. Confident, specific, and wrong in the direction that asks for action - over
 * exactly the fact the queue exists to state correctly.
 *
 * A no-op rather than an error: the person meant that work to stop, and it has stopped.
 * Refusing loudly would make an already-satisfied intention read as a failure.
 */
export function cancelVerdict(job) {
  if (!job) return { action: 'no-op', message: 'no such job' };
  if (LIVE_STATES.includes(job.state)) return { action: 'cancel', message: `${job.id} cancelled.` };
  return {
    action: 'no-op',
    message: `${job.id} already finished (${job.state}) - nothing to cancel, and its record is left exactly as it is.`,
  };
}

/**
 * What a foreground wait should do now: report, keep waiting, or give up and hand off.
 *
 * Pure, because the bound is the point. An unbounded version of this ran for five hours on
 * 2026-08-28 and reported nothing at all, which is indistinguishable from a wait that has died.
 */
export function waitVerdict({ job, waitedMs, capMs = FOREGROUND_WAIT_CAP_MS }) {
  if (!job) return { action: 'unknown', message: 'no such job' };
  if (!LIVE_STATES.includes(job.state)) {
    return { action: 'finished', state: job.state, exitCode: job.exitCode ?? null };
  }
  if (waitedMs >= capMs) {
    return {
      action: 'give-up',
      message:
        `${job.id} is still ${job.state} after ${Math.round(capMs / 60_000)} minutes. Nothing was interrupted - ` +
        'it keeps running.\n' +
        `  Hand off rather than waiting longer: the runner finishes it, and \`node scripts/jobs.mjs log ${job.id}\`` +
        ' has the output whenever anyone looks.',
    };
  }
  return { action: 'wait' };
}

/** Everything still live, for the CLI and the SessionStart summary. */
export function pending(jobs) {
  return jobs.filter((j) => LIVE_STATES.includes(j.state));
}

/**
 * Should this job start, given that some jobs MEASURE the app through a dev server they do not
 * start themselves?
 *
 * A sweep whose port answers nothing spends its entire slot collecting ERR_CONNECTION_REFUSED and
 * then reports a failure that reads like the app is broken. Failing it in the first second, with
 * the one sentence that fixes it, costs the queue nothing and the reader nothing.
 *
 * FAILS OPEN when the port cannot be worked out: `.claude/dev-port.json` is generated per
 * checkout and can be missing on a fresh clone, and refusing to run a job because a generated
 * file is absent would be a worse failure than the one this prevents.
 */
export function devServerPrecheck(job, { port = null, busy = false } = {}) {
  if (!requiresRunningDevServer(job.command ?? '')) return { action: 'go' };
  if (port === null || busy) return { action: 'go' };
  return {
    action: 'fail',
    reason:
      `nothing is listening on port ${port}, and this job measures the app through a dev server it does not start. ` +
      `Start the dev server in ${job.checkout} (node scripts/dev-port.mjs prints its port), then queue this again.`,
  };
}

// -- An ordering block is a WAIT, not a death ---------------------------------------------------
//
// The retired laptop lander refused a branch whose blocker was still ahead of main with no landing queued
// for it, on the sound reasoning that deferring is a bet the queue will land that blocker, and a
// bet that cannot pay just burns the deferral budget. The refusal is right. What happened AFTER it
// was not: the job went `failed`, and nothing ever brought it back - so when the blocker was
// queued twenty minutes later, or landed an hour later, the refused branch stayed refused.
//
// Measured on the night of 2026-09-03: `claude/j-fields-step-per-field` and
// `claude/p-alignment-across-corpus` sat unlanded for hours for this reason alone, and both landed
// the next morning the moment a person re-queued them UNCHANGED. Nothing about either branch had
// to change. The queue was treating "I cannot land right now" and "I must never land" as one
// state, and only the second of those is a failure.
//
// So the refusal now parks the job instead of killing it, keyed on the branches that blocked it,
// and the scheduler holds it until re-running could give a DIFFERENT answer - which is exactly:
// a blocker landed, or a blocker's own session queued it. Holding rather than re-running on a
// timer is the point; the exit-3 deferral loop re-runs the landing within seconds against facts
// that have not moved, which is how a branch can spend six deferrals in four minutes.

/**
 * How long a landing may sit held before it is written off and a person is told.
 *
 * Twelve hours, and the number is about the owner's day rather than about git. The whole reason
 * this mechanism exists is a night nobody is watching: work is queued in the evening and read the
 * next morning. A blocker whose session never queues it will not be queued by waiting, so the hold
 * only has to outlast the unattended stretch - evening to the following midday covers it with room
 * to spare. Past that the branch must SURFACE, because by then a person is there to read it, and a
 * job silently waiting is the failure this whole queue exists to end.
 */
export const ORDER_HOLD_MAX_MS = 12 * 60 * 60 * 1000;

/** The refusal kinds the queue acts on differently from a plain "auto-merge said no". */
export const ORDER_BLOCKED_REFUSAL = 'order-blocked';
export const STALE_PIN_REFUSAL = 'stale-pin';
export const SHARDS_SKIPPED_REFUSAL = 'shards-skipped';

/**
 * What a refusal MEANS and what answers it, in one sentence and at most one command.
 *
 * The whole point of naming refusals. Measured over the seven days to 2026-09-04: 37 of the 51
 * merge jobs that did not exit 0 carried no kind at all, and every one of them was reported as
 * "auto-merge refused it (exit 1) - read the log for which check said no". That sentence is true
 * and useless: it hands a person a log and a guess, at the moment they are least able to read
 * either, which is why the owner ended up shepherding merges by hand.
 *
 * `recovery` is the command that answers it, or null when a person has to decide rather than run
 * anything. `byQueue` says WHO runs it, and the two are not interchangeable: the queue adopts a
 * landing for exactly three kinds, and telling a session "the queue will handle it" about any of
 * the others is how a branch sits waiting all night for a retry that was never coming. Only the
 * queue's own recoveries are marked `byQueue`; the rest are commands the session runs itself, and
 * none of them can land work a session never declared finished.
 *
 * Kinds this does not know return null, which is not a gap to fix by guessing. The kinds come from
 * job records, and records outlive the tooling that wrote them - a landing refused by the retired
 * laptop lander carries a kind nothing prints any more, and the generic sentence is the honest
 * answer for it.
 */
export function refusalGuidance(refusal, branch = '<branch>') {
  const kind = refusal?.kind;
  const said = refusalSentence(kind, branch, (refusal?.blockers ?? []).join(', '));
  return said && { ...said, byQueue: QUEUE_RECOVERS.has(kind) };
}

/**
 * The kinds `retryLandingFor` adopts by itself. Everything else is the SESSION's to re-run.
 *
 * One set rather than a flag repeated per case, because the two must agree: a kind listed here
 * that the retry does not adopt tells a session to wait for something that is not coming, which is
 * the exact failure this banner exists to end. `scripts/jobs-store.test.mjs` pins them together.
 */
const QUEUE_RECOVERS = new Set([ORDER_BLOCKED_REFUSAL, SHARDS_SKIPPED_REFUSAL]);

// STALE PIN IS NOT IN THAT SET, although the queue does adopt some of them. It adopts only a stale
// pin on a RETRY - the queue refusing its own edit. A stale pin on a landing a SESSION queued means
// that session pushed after declaring the work finished, which is the pin doing its job, and
// nothing will re-run it but that session. The banner reads a job it cannot tell those apart from,
// so it under-promises: `requeue` is correct advice either way, and a session told to run a command
// the queue also runs loses nothing, while a session told to wait for a retry that never comes
// waits all night.

function refusalSentence(kind, branch, blockers) {
  switch (kind) {
    case ORDER_BLOCKED_REFUSAL:
      return { summary: `blocked by ${blockers || 'another branch'} - held until one lands or is queued`, recovery: null };
    case STALE_PIN_REFUSAL:
      return {
        // NOT `requeue`: that verb re-runs the declaration this branch has already moved past, so
        // it refuses on the same pin. Only the branch's own session can declare the new commits
        // finished, and `/check` has to see them first.
        summary: 'the branch was pushed after it was declared finished, so the queued declaration no longer covers it',
        recovery: `run /check on ${branch}, then npm run queue:merge from its own session`,
      };
    case SHARDS_SKIPPED_REFUSAL:
      return {
        summary: 'CI was green but gated nothing - every E2E shard was skipped, so behaviour is unproved',
        recovery: `gh workflow run ci.yml --ref ${branch}`,
      };
    case 'ci-red':
      return { summary: 'CI said no on the integrated commit - fix the branch, then queue it again', recovery: null };
    case 'order-caution':
      return {
        summary: 'merge-order flagged a collision nobody has weighed - read it, then accept it or land the other branch first',
        recovery: null,
      };
    case 'dirty-tree':
      return { summary: 'a worktree in play has uncommitted changes - commit or stash them, then queue again', recovery: null };
    case 'merge-conflict':
      return { summary: 'integrating main conflicted - resolve it in the branch, then queue again', recovery: null };
    case 'preflight-1':
      return { summary: 'the preflight refused before anything was touched - its output says which check', recovery: null };
    case 'main-churn':
    case 'main-fetch':
    case 'push-failed':
    case 'worktree-unavailable':
    case 'no-main-worktree':
    case 'ff-refused':
    case 'order-no-verdict':
      return {
        summary: 'the landing could not carry on for a reason outside the branch - re-running is honest here',
        recovery: `node scripts/jobs.mjs requeue ${branch}`,
      };
    // Landed locally and not pushed, or main is not the commit that was verified. Both mean main
    // itself is in a state only a person should touch, so neither offers a command.
    case 'main-push-failed':
    case 'sha-mismatch':
      return { summary: 'the merge reached main locally but did not complete - a person resolves this one', recovery: null };
    default:
      return null;
  }
}

/**
 * The line a landing prints so the queue can tell WHICH refusal it just made.
 *
 * An exit code carries one integer and this needs a payload - which branches blocked it - so the
 * landing script states its refusal in one machine-readable line and the runner reads it back out
 * of the job's own log. The alternative was a new exit code per refusal, which still could not
 * carry the branch names, and a third one would have been wanted for the next payload.
 */
export const REFUSAL_MARKER = 'auto-merge REFUSAL-KIND:';

/**
 * What a finished landing's log says about WHY it refused: `{ kind, blockers }`, or null.
 *
 * Read once, by the runner, at the moment the process exits - everything downstream reads the
 * structured field it writes onto the job rather than reading the log again.
 *
 * THE PROSE FALLBACKS ARE NOT BELT AND BRACES. The marker was added to a landing script that ran
 * from the BRANCH's own checkout, so every branch cut before it refused in words and nothing else,
 * and those were the branches queued that fortnight. Both readings are kept because the same is
 * true of any refusal wording: this reads a LOG, and a log is written by whatever tooling that job
 * ran, which is never guaranteed to be the copy standing here.
 */
export function classifyRefusal(logText, { attemptMark = null } = {}) {
  const whole = String(logText ?? '');
  // ONE ATTEMPT, NOT THE FILE. A job's log is opened for append and a job is re-run under its own
  // id - a deferral, or a release from a hold - so one file holds every attempt it has made. A
  // short second run would otherwise be classified by the FIRST run's marker still sitting in the
  // window: a landing released from a hold and then refused for a red main would read as blocked
  // again and be parked for another twelve hours. When the attempt is longer than the window there
  // is no header to find, and everything in the window is that attempt's own output anyway.
  const at = attemptMark ? whole.lastIndexOf(attemptMark) : -1;
  const text = at === -1 ? whole : whole.slice(at);
  const marked = new RegExp(`${REFUSAL_MARKER}\\s+(\\S+)(?:[ \\t]+(\\S+))?`).exec(text);
  if (marked) {
    return { kind: marked[1], blockers: splitBranches(marked[2]) };
  }
  const ordered = /blocked by (.+?) - still ahead of main, and NO landing is queued/.exec(text);
  if (ordered) return { kind: ORDER_BLOCKED_REFUSAL, blockers: splitBranches(ordered[1]) };
  if (/moved after it was declared finished/.test(text)) return { kind: STALE_PIN_REFUSAL, blockers: [] };
  return null;
}

function splitBranches(list) {
  return String(list ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * What the scheduler should do with a job parked behind an unqueued branch: `go`, `hold`, or
 * `give-up`.
 *
 * The release condition is deliberately NOT "is this branch landable now" - the landing script
 * answers that, and answering it twice in two places is how the two answers drift apart. It is the
 * weaker, cheaper question: has anything changed that could make re-running come out differently?
 * Two things can, and only two. The blocker LANDED, so it is no longer ahead of main and no longer
 * blocks anyone. Or the blocker's own session QUEUED it, which turns the refusal into the ordinary
 * deferral the queue already drains. Anything else and re-running prints the same refusal.
 *
 * `aheadOfMain` defaults to saying yes, because a git question that cannot be answered must not
 * release a landing - and the deadline means "cannot answer" still ends in a person being told
 * rather than in a job waiting for ever.
 */
export function orderHoldDecision(job, {
  queuedForLanding = () => false, aheadOfMain = () => true, now = Date.now(),
} = {}) {
  const blockers = job?.orderHold?.blockers ?? [];
  if (blockers.length === 0) return { action: 'go' };
  const live = blockers.filter((b) => aheadOfMain(b));
  if (live.length === 0) return { action: 'go', reason: `${blockers.join(', ')} landed` };
  const queued = live.filter((b) => queuedForLanding(b));
  if (queued.length > 0) return { action: 'go', reason: `${queued.join(', ')} is queued now - it can take its turn behind it` };
  // ONE CLOCK, and it is `blockedSince` rather than a copy inside the hold. `orderHold` is dropped
  // the moment the job starts and written again if it refuses again, so a `since` living inside it
  // would restart on every release - and the deadline is meant to measure how long this landing has
  // been blocked in TOTAL. `blockedSince` is set once and never cleared.
  const waited = now - (job.blockedSince ?? now);
  if (waited >= ORDER_HOLD_MAX_MS) {
    return {
      action: 'give-up',
      reason:
        `blocked by ${live.join(', ')} for ${Math.round(waited / 3_600_000)}h, and no landing was ever queued for `
        + `${live.length === 1 ? 'it' : 'them'} - waiting has stopped being worth anything. Queue the blocker from `
        + 'its own session, then queue this one again.',
    };
  }
  return {
    action: 'hold',
    reason: `held for ${live.join(', ')} to land or be queued (${Math.round(waited / 60_000)} min so far)`,
  };
}

/**
 * The queue's answer for one branch in the outstanding listing: queued, landed, gave up, withdrawn,
 * or never queued.
 *
 * "Not queued" used to be the answer for BOTH a branch nobody declared finished and a branch
 * whose landing died - deferrals exhausted, a refusal, a timeout - because a terminal job is
 * invisible to `pending`. Those are opposite situations: one needs its session to finish, the
 * other needs a person to read a log. A landing that fails must stay visible as a failed
 * LANDING, so `gave-up` names the newest dead merge job, carries the reason it gave up, and
 * hands back the exact command that queues it again. A cancelled job reads as `withdrawn` for the
 * same reason: "not queued" may never describe a branch that WAS queued, whatever became of it.
 *
 * And SUCCESS is a state of its own, because for a while it was not: every terminal non-cancelled
 * job fell through to `gave-up`, so a landing that exited 0 was described as
 * "auto-merge refused it (exit 0)" and handed the reader a command to queue an already-landed
 * branch. That is the worst shape a status line can take - confident, specific, and wrong in the
 * direction that asks for action. `landed` therefore carries NO requeue command and NO reason:
 * there is nothing to put back and nothing to explain, and a null requeue is what makes every
 * downstream caller structurally unable to offer one.
 */
/**
 * The one spelling of each command a landing row hands back - each is built twice, so both live here.
 *
 * TWO COMMANDS, NOT ONE, and the difference is who is declaring what. `add-merge` makes a fresh
 * declaration: this branch, at whatever commit it is at now, is finished. Only the branch's own
 * session may say that. `requeue` re-runs a declaration that was already made and re-verified: it
 * refuses any commit that arrived after the pin, so it cannot land work nobody declared, which is
 * what makes it safe for a session to run on a branch whose landing died (see `requeueDecision`).
 * A landing that gave up wants the second, every time.
 */
const requeueCommand = (branch) => `node scripts/jobs.mjs requeue ${branch}`;
const declareCommand = (branch) => `node scripts/jobs.mjs add-merge ${branch}`;
const logCommand = (id) => `node scripts/jobs.mjs log ${id}`;

export function landingStateFor(branch, jobs, git = {}) {
  const requeue = requeueCommand(branch);
  const mine = jobs.filter((j) => j.kind === 'merge' && j.branch === branch);
  const live = mine.filter((j) => LIVE_STATES.includes(j.state));
  if (live.length > 0) return { state: 'queued', job: live[live.length - 1], reason: null, requeue: null };
  const terminal = [...mine].sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  const last = terminal[terminal.length - 1];
  if (!last) return { state: 'not-queued', job: null, reason: null, requeue: null };
  // A WITHDRAWN landing is not a branch nobody queued. It reads differently from a failure - a
  // person did it on purpose - but printing it as "not queued" made a deliberate act look like
  // unfinished work, which is the same lie in the other direction.
  // A withdrawal is a person saying no, so putting it back is a fresh declaration and wants
  // `add-merge`. `requeue` would be wrong here in the one way that matters: it re-runs a
  // declaration, and this one was taken back.
  if (last.state === 'cancelled') {
    return { state: 'withdrawn', job: last, reason: 'a person cancelled it', requeue: declareCommand(branch) };
  }
  // `done` is written for exit 0 and nothing else (scripts/jobs.mjs), and auto-merge exits 0 only
  // after the --ff-only push succeeded - so this IS the branch being on main, not a hopeful read
  // of it. Keyed on the state rather than the exit code because the state is the verdict the
  // runner recorded; a `done` job carrying some other exit code would be a contradiction, and
  // trusting the exit code over it would be the same class of guess this whole function avoids.
  if (last.state === 'done') return { state: 'landed', job: last, reason: null, requeue: null };
  // AND THE SAME ANSWER FOR A JOB THAT LANDED AND LOST ITS RECEIPT. `endedWithoutExitCode` asks
  // git before it records, so a record written by this build is already right - but records on disk
  // predate it, and a job killed by anything that does not go through those two writers still
  // arrives here with no exit code. Asking git once more when a record claims failure and carries
  // no exit code costs one `merge-base` call and settles it: a branch main already contains has
  // nothing left to land, whoever wrote the row.
  //
  // NARROW ON PURPOSE - only where the record has no verdict of its own. An exit code IS a verdict,
  // and a red gate on a branch that main happens to contain by some other route must stay a
  // failure, not be talked out of it by a ref.
  if (last.exitCode == null && landedDespiteItsProcess(last, git)) {
    return { state: 'landed', job: last, reason: null, requeue: null };
  }
  return { state: 'gave-up', job: last, reason: giveUpReason(last), requeue };
}

/**
 * `auto-merge.mjs`'s exit code for "CI never gave a verdict on the integrated commit".
 *
 * Duplicated rather than imported because importing it would pull the whole landing script - and
 * its module-evaluation side effects - into every reader of the queue. The two are pinned
 * together by `scripts/jobs-store.test.mjs`, which reads the constant out of auto-merge's source.
 */
export const NO_VERDICT_EXIT = 5;

/**
 * The one spelling of what exit 5 means, written onto the job and read back by the listing.
 *
 * One constant because the runner records it and `giveUpReason` falls back to it, and two copies
 * of a sentence drift into two different answers to the same question.
 */
export const NO_VERDICT_REASON = 'CI gave no verdict on the integrated commit - not this branch\'s fault';

/**
 * How many times the queue re-runs a landing that reached no verdict, on its own.
 *
 * One. A retry is for the machine failing to answer - a run still going when the wait ran out, a
 * shard killed by its own timeout, a runner that died with the laptop. Those clear on a second
 * try or they are not flakes at all, and a second retry only delays the moment a person looks.
 */
export const MAX_LANDING_RETRIES = 1;

/**
 * Should the queue re-run this dead landing by itself? The new job's fields, or null.
 *
 * THE PROBLEM THIS SOLVES. On 2026-09-03 two landings were killed at their 45-minute cap
 * (j-0438 and j-0445, the first two to time out in 213 landings). Both owning sessions had
 * already finished, and only a branch's own session may queue it - so two finished, green,
 * conflict-free branches became unlandable with nobody left to say so. Six branches were behind
 * them. That is a missing mechanism, not a permission problem.
 *
 * WHY THIS IS NOT SOMEONE ELSE QUEUEING YOUR BRANCH. "Only the owning session queues" exists so
 * that a session DECLARES its own work finished, because a branch can be green and clear while
 * its session is still deciding what to do next, and no verdict can tell those apart. That
 * declaration was already made when this job was queued, and nothing about the branch has
 * changed since. A retry re-runs a declaration; it does not make a second one. The command is
 * copied VERBATIM, which is what makes that true mechanically rather than by argument: it still
 * carries the `--expect-sha` pin from the original queueing, so if the session woke up and
 * pushed another commit, the retry refuses instead of landing work nobody declared.
 *
 * WHAT DOES NOT RETRY, and this is the whole safety of it: anything the landing actually judged. A
 * red check, a conflict with main, a pull request that fell out of the queue are verdicts, and
 * retrying a verdict is how a queue lands something that was refused. What is left is exactly the
 * set where the machine failed to answer: killed at the cap, reaped after its runner died, or
 * `no-verdict` from the watcher's own hour.
 */
/**
 * The job's own landing command if the branch still stands where it was declared, else null.
 *
 * Shared by the automatic retry and the by-hand `requeue`, because the safety argument is the same
 * one and it must not exist twice: neither path may re-run a declaration over a commit the session
 * did not declare finished. A branch that moved, or one whose tip cannot be read, gets null and no
 * landing at all.
 *
 * THE PIN NEVER MOVES NOW, and that is a simplification the retired laptop lander paid for. It
 * used to be allowed to move over commits that were provably the previous landing's own
 * integration of `main`, because that lander merged `main` into the branch and pushed the result
 * before it gated - so its own first attempt moved the tip out from under the pin, and a verbatim
 * retry refused for a commit the queue itself had made (j-0519, 2026-09-04). GitHub's merge queue
 * builds its temporary merge on GitHub and never writes the branch, so the only thing that can
 * move a tip now is a session pushing to it, and that is exactly what the pin exists to refuse.
 */
function repinnedCommand(job, { tipOf = () => null } = {}) {
  const pinned = declaredCommitOf(job);
  if (!pinned) return job.command; // Queued before pinning existed; nothing to check it against.
  const tip = tipOf(job.branch);
  if (!tip) return null; // A branch we cannot read is not one to queue a landing for.
  return tip === pinned ? job.command : null;
}

export function retryLandingFor(job, {
  tipOf = () => null,
  inMain = () => false,
} = {}) {
  if (!job || job.kind !== 'merge' || !job.branch || !job.command) return null;
  // A COMMAND THIS BUILD CAN STILL RUN. The queue keeps records for a fortnight, so records written
  // by the retired laptop lander outlive it - and a retry copies the command VERBATIM, which is
  // what makes it a re-run rather than a new declaration. Copying one that names a deleted script
  // would spend a serialised merge slot and the branch's single retry on a module-not-found, with
  // no refusal kind to name it. The branch is not stranded: its own session queues it afresh.
  if (!/\bland-watch\.mjs\b/.test(job.command)) return null;
  // NOTHING LEFT TO LAND. A landing that pushed and was then reaped or killed at its cap has the
  // best verdict there is sitting in a ref, and re-running it spends a whole serialised slot to
  // refuse. This is checked FIRST, ahead of every other reason to retry, because it is the one
  // answer that makes all of them moot - and it is deliberately not folded into `noVerdict`: this
  // says the work is DONE, the others say the machine failed to answer.
  if (landedDespiteItsProcess(job, { inMain })) return null;
  const noVerdict = job.state === 'timed-out'
    || job.reapedAsDead === true
    || job.exitCode === NO_VERDICT_EXIT;

  // AN ORDERING BLOCK THAT WAS ALREADY FAILED, which is the sweep doing what a hook cannot. The
  // runner parks an ordering block as it happens, but only a runner running THIS code does - and
  // for a fortnight most landings ran an older copy of the tooling and died the old way instead.
  // Adopting a dead one puts the same landing
  // back ALREADY HELD, so it costs nothing until a blocker lands or is queued, and the hold's clock
  // runs from when it first refused rather than from now.
  //
  // ONCE, and `orderHold` is what says so. A job that carries one was already parked and then
  // written off, which only happens when the hold ran its twelve hours out - and adopting THAT
  // would park it for another twelve, spend the branch's one retry on a job that never runs, and
  // quietly contradict the promise that a hold nothing answers surfaces for a person.
  const orderBlockers = job.refusal?.kind === ORDER_BLOCKED_REFUSAL ? (job.refusal.blockers ?? []) : [];
  const orderBlocked = orderBlockers.length > 0 && !job.orderHold;

  // A GATE THAT PROVED NOTHING IS NOT A VERDICT ON THE BRANCH. Phase 3 refuses a run that skipped
  // every E2E shard, which happens whenever the push planned `mode: none` - eight landings in the
  // week to 2026-09-04, every one of them a branch whose own CI was green. The cure is written in
  // the refusal itself: a `workflow_dispatch` has no push base, so it runs the full suite, and the
  // landing then gates on a run that actually covers the tree. The queue can ask for that; only
  // the caller does the asking (`adoptOrphans` in scripts/jobs.mjs), because minting a job must
  // stay a decision and not a network call.
  //
  // ONCE. `ciDispatched` is what says so: a landing already given a full run and refused for the
  // same reason has been answered, and asking a second time is the loop this bound exists to stop.
  //
  // ONE CASE IT DOES NOT COVER, stated rather than papered over. The dispatched run sits on the
  // branch tip as it is NOW, and the retry re-integrates main before it gates - so if main moves
  // in between, the landing gates on a different sha and never sees the run that was made for it.
  // It then dispatches its own, which carries `diff_base` and plans the same empty subset, and
  // refuses identically. The branch is not stuck: the second refusal escalates with the command
  // on it, and a person runs the one line. Fixing it properly means the LANDING asking for its
  // own full run, and that lived in the branch's own copy of the landing script - which is exactly
  // the copy an old branch does not have.
  const gatedNothing = job.refusal?.kind === SHARDS_SKIPPED_REFUSAL && !job.ciDispatched;

  if (!noVerdict && !orderBlocked && !gatedNothing) return null;
  const spent = job.retryCount ?? 0;
  if (spent >= MAX_LANDING_RETRIES) return null;

  // THE PIN IS RE-CHECKED, NEVER MOVED. A branch whose session pushed after declaring the work
  // finished has not declared THAT work, and nobody may land it - so the retry is refused outright
  // rather than re-aimed at the new tip. See `repinnedCommand` for why the queue no longer has to
  // forgive movement it made itself.
  const command = repinnedCommand(job, { tipOf });
  if (!command) return null;
  return {
    command,
    checkout: job.checkout,
    branch: job.branch,
    kind: 'merge',
    // Dependencies were about the queue state when the branch was FIRST declared finished. Those
    // jobs are long gone by now, and a retry that waits on a pruned id waits forever.
    after: [],
    capMinutes: job.capMinutes ?? POLICY.capMinutes,
    retryOf: job.id,
    retryCount: spent + 1,
    // The review verdict rides along: a retry lands the same declared work, so what `/check`
    // said about it (or that nothing did) stays on the record.
    ...(job.review ? { review: job.review } : {}),
    // Carried onto the new job so a second refusal for the same reason escalates instead of
    // asking for a third full suite, and stated as `recovery` so the caller knows to run it.
    ...(gatedNothing
      ? { ciDispatched: true, recovery: { dispatchCi: job.branch, command: `gh workflow run ci.yml --ref ${job.branch}` } }
      : {}),
    // Reborn already parked, with the clock running from when it first refused rather than from
    // when the sweep noticed - a branch blocked since last night must surface this morning.
    ...(orderBlocked
      ? { orderHold: { blockers: orderBlockers }, blockedSince: job.blockedSince ?? job.finishedAt ?? Date.now() }
      : {}),
    // WHY this job exists, in its own words. The listing used to infer it from `retryOf` alone and
    // so told the owner that a branch parked behind another "reached no verdict" - a confident,
    // specific sentence about a thing that had not happened.
    retryReason: orderBlocked
      ? `was blocked by ${orderBlockers.join(', ')}`
      : gatedNothing
        ? 'was gated by a CI run that skipped every shard'
        : 'reached no verdict',
  };
}

/**
 * Every orphaned landing in the queue, as the jobs that would revive them.
 *
 * A SWEEP rather than a hook on the moment a job dies, and that is the whole point: the two
 * landings this was written for died before it existed, and a hook can only ever help the next
 * one. Reading the queue's current state instead means a mechanism that adopts what is already
 * stuck - which on the night of 2026-09-03 was the difference between two stranded branches and
 * six, because the jam SPREADS. `merge-order.mjs` refuses a branch that collides with one still
 * ahead of main and unqueued, on the sound reasoning that waiting cannot change it; so one dead
 * landing refuses every branch touching the same files, and the refusals pile up all night. That
 * is what happened to `claude/j-fields-step-per-field` behind `claude/f-contracts-point`.
 *
 * A branch qualifies when its NEWEST merge job reached no verdict and nothing has been queued
 * since. "Newest" is what keeps this from fighting a person: queue a landing by hand and the
 * sweep sees a live job and stands down; land the branch later and the newest job is `done`.
 * `retryOf` is checked too, so a retry that has itself been pruned cannot restart the cycle.
 */
export function adoptOrphanedLandings(jobs, git = {}) {
  const all = jobs ?? [];
  const alreadyRetried = new Set(all.map((j) => j.retryOf).filter(Boolean));
  const branches = new Set(all.filter((j) => j.kind === 'merge' && j.branch).map((j) => j.branch));
  const adopted = [];
  for (const branch of branches) {
    const landing = landingStateFor(branch, all, git);
    // `queued` covers a live job, `landed` and `withdrawn` are settled, and a `gave-up` job that
    // was JUDGED (a red gate, a conflict) is refused by `retryLandingFor` on its own terms.
    if (landing.state !== 'gave-up') continue;
    if (alreadyRetried.has(landing.job.id)) continue;
    const next = retryLandingFor(landing.job, git);
    if (next) adopted.push(next);
  }
  return adopted;
}

/**
 * May this branch's dead landing be put back, and as what job? `{ action, job | message }`.
 *
 * THE COMMAND A SESSION CAN RUN WITHOUT ASKING ANYONE, and the reason it is a separate verb from
 * `add-merge` rather than a flag on it. On the night of 2026-09-03 five branches needed nothing
 * but re-queueing, and the one party that had verified they were safe - the session that had just
 * checked every pin - was the one party that could not do it: `add-merge` is not allowlisted, and
 * for good reasons that this verb does not share. `add-merge` makes a DECLARATION about a branch
 * at whatever commit it is at now, and it takes `--accept <kind>` and `--onto-red-main`, two
 * deliberate overrides of gates. A prefix pattern cannot exclude a trailing argument
 * (docs/AGENT_WORKFLOWS.md, the `git push` reasoning), so allowlisting `add-merge` allowlists both.
 *
 * `requeue` cannot express either, and it cannot make a declaration:
 *
 *   - It takes a BRANCH NAME and nothing else. No flags, no command payload, no refspec.
 *   - It refuses a branch that was never queued. There is nothing to re-run, and inventing one
 *     would be exactly the "somebody else declared my work finished" this whole rule prevents.
 *   - It copies the dead job's own command, so whatever a person once weighed with `--accept`
 *     carries forward and nothing new can be added.
 *   - It re-checks the pin by `repinnedCommand`, so a commit that arrived after the declaration
 *     refuses. That is the property that makes it safe: it can only ever re-run work already
 *     declared.
 *
 * What it can do is spend a CI run on a branch that will refuse again. That is the whole cost, and
 * it is the cost of a prompt nobody was awake to answer.
 */
export function requeueDecision(branch, jobs, git = {}) {
  if (!branch || branch === 'main' || branch === 'HEAD') {
    return { action: 'refuse', message: `${branch || 'that'} is not a branch this queue lands.` };
  }
  const landing = landingStateFor(branch, jobs ?? [], git);
  if (landing.state === 'not-queued') {
    return {
      action: 'refuse',
      message:
        `No landing was ever queued for ${branch}, so there is no declaration to re-run.\n`
        + `  Only that branch's own session declares its work finished: ${declareCommand(branch)}`,
    };
  }
  if (landing.state === 'queued') {
    return { action: 'refuse', message: `${branch} is already queued as ${landing.job.id} - nothing to do.` };
  }
  if (landing.state === 'landed') {
    return {
      action: 'refuse',
      message:
        `${branch} landed as ${landing.job.id}. Anything committed since was never declared finished, `
        + `so it needs a fresh declaration from that branch's own session:\n  ${declareCommand(branch)}`,
    };
  }
  if (landing.state === 'withdrawn') {
    return {
      action: 'refuse',
      message:
        `${branch}'s landing was cancelled by a person, and re-running a withdrawn declaration is not `
        + `this command's business:\n  ${declareCommand(branch)}`,
    };
  }
  const command = repinnedCommand(landing.job, git);
  if (!command) {
    return {
      action: 'refuse',
      message:
        `${branch} has moved past the commit ${landing.job.id} was queued at.\n`
        + `  Commits arrived after the work was declared finished, so re-running the old declaration would land\n`
        + `  something nobody declared. Its own session queues the new work: ${declareCommand(branch)}`,
    };
  }
  return {
    action: 'queue',
    job: {
      command,
      checkout: landing.job.checkout,
      branch,
      kind: 'merge',
      // Same reasoning as a retry: the jobs it was originally queued behind are long gone, and a
      // dependency on a pruned id waits for ever.
      after: [],
      capMinutes: landing.job.capMinutes ?? POLICY.capMinutes,
      retryOf: landing.job.id,
      ...(landing.job.review ? { review: landing.job.review } : {}),
      // A FRESH AUTOMATIC BUDGET, because this is a person putting the work back rather than the
      // sweep spending its one try. The sweep cannot loop on it either: `adoptOrphanedLandings`
      // treats `retryOf` as "already handled", so this job is the last word on the old one.
      retryCount: 0,
      retryReason: 'was put back by hand',
    },
  };
}

/**
 * WHY a landing stopped, in the words of the fact that stopped it.
 *
 * Every one of these vanished silently at some point on 2026-08-28: a job killed at its cap
 * mid-CI-wait, a job whose runner died with the machine, a job that spent its deferrals waiting
 * for a turn that never came. "LANDING FAILED j-0126" alone sends a person to a log to find out
 * which of those happened; the answer is already in the job row, so it is printed.
 */
export function giveUpReason(job) {
  // A job that exited 0 did not give up, and the exit-code arm below used to render it as
  // "auto-merge refused it (exit 0)" - a sentence indistinguishable from a real refusal.
  // `landingStateFor` no longer routes a successful landing here, so reaching this line is a bug
  // in the caller; it says so loudly rather than handing back another plausible lie.
  if (job.exitCode === 0) return `it exited 0 - it did not give up, it LANDED (asking ${job.id ?? 'this job'} why is a bug)`;
  if (job.giveUpReason) return job.giveUpReason;
  if (job.state === 'timed-out') return `killed at its ${job.capMinutes ?? '?'} min cap - probably still waiting on CI`;
  if (job.reapedAsDead) return 'its process vanished - the runner died or the machine slept';
  if (job.exitCode === 3) return 'still blocked by another branch after every deferral';
  // Named rather than left as "exit 1", because the branch is not broken and the line must not
  // read as though it were: the work is fine, it is just newer than the declaration that was made
  // about it.
  if (job.refusal?.kind === STALE_PIN_REFUSAL) {
    return 'the branch was pushed after it was declared finished - /check the new tip and queue again';
  }
  // NOT a verdict on the branch, and the line must not read like one. `waitForCi` leaves through
  // 'judge' the moment any run concludes either way, so everything that exits 5 is the machine
  // failing to answer: a run still going, only cancelled shells, no run at all, or a run whose
  // jobs were killed by their own timeout. The queue retries this one; exit 1 it never does.
  if (job.exitCode === NO_VERDICT_EXIT) return NO_VERDICT_REASON;
  // Not this branch's fault, and the listing must say so: five landings queued against a red main
  // all stop here, and five identical lines are how a person sees the fault is upstream of all of
  // them rather than opening five logs looking for five different causes.
  if (job.exitCode === 4) return 'main itself is red - fix main first (gh run list --workflow ci.yml --branch main --limit 5)';
  if (typeof job.exitCode === 'number') return `auto-merge refused it (exit ${job.exitCode})`;
  return 'it stopped without recording why';
}

/**
 * The outstanding listing's line for one branch: what its landing did, and the exact command that
 * puts it back. Kept here, beside the state it reads, so the listing and the tests share one
 * definition of what "loud" means.
 */
export function landingRow(branch, jobs, git = {}) {
  const landing = landingStateFor(branch, jobs, git);
  // A retry says so. Otherwise the listing shows a branch queued that no session queued, which
  // reads as somebody having landed work out from under a conversation - the exact thing the
  // one-session rule exists to prevent. Naming the job it revives is what makes it legible.
  if (landing.state === 'queued') {
    // HELD IS NOT QUEUED, and for up to twelve hours it read as though it were. A landing parked
    // behind a branch nobody has queued is waiting on a person somewhere else, and the row is the
    // only place that fact surfaces before the deadline writes it off.
    const blockers = landing.job.orderHold?.blockers ?? [];
    const holding = blockers.length > 0 ? ` - HELD for ${blockers.join(', ')} to land or be queued` : '';
    return landing.job.retryOf
      // Why it was put back, in the words of what put it back: the sweep re-runs several kinds of
      // dead landing now, and `requeue` mints one too. Saying "reached no verdict" for all of them
      // is confident, specific and wrong for most.
      ? `QUEUED ${landing.job.id} (retry of ${landing.job.retryOf}, which ${landing.job.retryReason ?? 'reached no verdict'})${holding}`
      : `QUEUED ${landing.job.id}${holding}`;
  }
  if (landing.state === 'not-queued') return 'not queued';
  // A landed branch is normally INVISIBLE here: the caller enumerates branches ahead of main, and
  // a branch whose landing succeeded has nothing ahead of main to enumerate. So reaching this
  // line means the branch is ahead AGAIN - commits arrived after that landing, or it was rebased
  // - and "already on main" would be false every single time it could be read. The row says the
  // true thing instead, and here a re-queue command is right rather than dangerous: this branch
  // really does have unlanded work. That is why `landingStateFor` withholds the command and this
  // function supplies it - the classifier knows only what the JOB did, while the listing knows
  // its subject is ahead of main, and only the second of those justifies asking for an action.
  if (landing.state === 'landed') {
    return (
      `LANDED ${landing.job.id}, and this branch is ahead of main AGAIN - commits arrived after it landed\n` +
      `        log: ${logCommand(landing.job.id)}   ·   queue the new work: ${declareCommand(branch)}`
    );
  }
  const label = landing.state === 'withdrawn' ? 'LANDING WITHDRAWN' : 'LANDING FAILED';
  return (
    `${label} ${landing.job.id} (${landing.job.state}) - ${landing.reason}\n` +
    `        log: ${logCommand(landing.job.id)}   ·   re-queue: ${landing.requeue}`
  );
}

/** Jobs that reached a terminal state at or after `since` - the "what happened while I was away" list. */
export function finishedSince(jobs, since) {
  return jobs.filter((j) => !LIVE_STATES.includes(j.state) && (j.finishedAt ?? 0) >= since);
}
