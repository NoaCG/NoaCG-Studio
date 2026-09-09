#!/usr/bin/env node
// THE REVIEW CHECK'S READER - what ci.yml's `Reviewed` job runs.
//
//   node scripts/reviewed-status.mjs        # in the job; every input is an environment variable
//
// `npm run queue:merge` posts the /check verdict as the `noacg/reviewed` commit status on the
// branch tip (scripts/jobs.mjs `queueOnGitHub`, scripts/queue-pr.mjs for the mechanical landings).
// This turns that status into a check the merge queue can require: a tip with no passing status
// cannot enter or pass the queue.
//
// WHY IT WAITS INSTEAD OF LOOKING ONCE. The status and the run that reads it are started by two
// different commands, and the reader used to win or lose on network luck. Measured over the five
// landings of 2026-09-09:
//
//   PR #189   status 11:49:04Z   job read it ~11:49:09Z    green, by about five seconds
//   PR #191   status 12:12:54Z   job read it ~12:13:01Z    green, by about seven seconds
//   PR #174   status 05:43:38Z   job read it  05:42:50Z    RED, by forty-eight seconds
//
// The margin on a first landing is the second or two between `gh pr create` (which starts the
// `pull_request` run) and the status call three `gh` calls later - a coin flip that has so far
// landed our way because GitHub takes a few seconds to schedule a runner. #174 shows the other
// shape and it is not a coin flip at all: when the pull request ALREADY exists, the push that
// precedes queueing starts a `synchronize` run immediately, and the rest of `queue:merge` takes
// most of a minute to reach the status call. The gate loses that one every time.
//
// Nothing is broken when it loses, which is what makes it corrosive: a red `Reviewed` says the
// most alarming thing a landing check can say, on a branch whose review really happened. A session
// that trusts it debugs a review problem it does not have; a session that learns to re-run it has
// stopped reading the check that exists to be read.
//
// So the fix is to stop the ORDER mattering. The pass condition is untouched - a `success` status
// on that exact sha, and nothing else - and only the moment we call it absent moves: a bounded
// wait, then the same red as before. That keeps both true shapes of a `Reviewed` red red (a tip
// that moved after its declaration, and a `/queue-merge` that opened the pull request and then
// stopped - `scripts/ci-watch.mjs` `describeReviewedOnly` has both, measured): in neither is a
// status ever coming, so both fail at the bound. A check that cannot fail would be worse than one
// that cries wolf, and this one still fails.
//
// The bound is 150 seconds against a worst measured gap of 48. Waiting too long costs a runner
// minute nobody is waiting on, because `CI gate` takes six to nine; waiting too short leaves the
// bug in. The asymmetry is why the bound is generous rather than tight.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REVIEW_CONTEXT, spawnRunner } from './queue-pr.mjs';

/** How long to wait for a status that another command is on its way to posting. */
export const DEFAULT_WAIT_MS = 150_000;

/** How often to ask while waiting. */
export const DEFAULT_INTERVAL_MS = 5_000;

/** States that answer the question for good: waiting longer cannot change any of them. */
const TERMINAL = new Set(['success', 'failure', 'error']);

/**
 * Run `gh` and hand back its stdout; a non-zero exit throws with what gh said. The spawning and
 * the error text are `queue-pr.mjs`'s, so the two halves of this mechanism - the command that
 * posts the status and the check that reads it - call the same tool the same way.
 */
const runGh = spawnRunner('gh');
export const ghRunner = (args) => runGh(args).out;

/**
 * The pull request number in a merge group's head ref (`gh-readonly-queue/main/pr-123-<base>`).
 * The commit under test in a merge group is a temporary merge GitHub made, which no session ever
 * stamped, so the status has to be looked up on the pull request's own head.
 * @returns {number|null}
 */
export function pullRequestNumberFromGroupRef(ref) {
  const match = /\/pr-(\d+)-/.exec(String(ref ?? ''));
  return match ? Number(match[1]) : null;
}

/**
 * Which sha carries the review, for the event this run is.
 * @param {Record<string, string|undefined>} env
 * @param {(args: string[]) => string} gh
 */
export function resolveSha(env, gh = ghRunner) {
  if (env.EVENT === 'merge_group') {
    const number = pullRequestNumberFromGroupRef(env.GROUP_REF);
    if (!number) throw new Error(`cannot read a pull request number off ${env.GROUP_REF}`);
    return gh(['pr', 'view', String(number), '--repo', String(env.GITHUB_REPOSITORY), '--json', 'headRefOid', '--jq', '.headRefOid']);
  }
  // A pull request run reads its head; a dispatch asking for the check (`require_review`) reads
  // the tip it was dispatched on.
  return env.PR_HEAD || env.GITHUB_SHA || '';
}

/**
 * The `noacg/reviewed` status on one sha, as `{ state, description }`. An absent status is the
 * state `missing` rather than an error, because absent is the answer while a landing is in flight.
 */
export function readReviewStatus(sha, repo, gh = ghRunner) {
  const raw = gh(['api', `repos/${repo}/commits/${sha}/status`, '--jq', `[.statuses[] | select(.context == "${REVIEW_CONTEXT}")][0] // {}`]);
  let status;
  try {
    status = JSON.parse(raw || '{}') ?? {};
  } catch {
    status = {};
  }
  return { state: status.state ?? 'missing', description: status.description ?? '' };
}

/**
 * Ask until the status answers for good or the bound runs out. Returns the last reading plus how
 * long it took, so the log can say whether this was a wait or an immediate answer.
 *
 * A POLL THAT FAILS IS NOT AN ANSWER. Where the old check asked twice, this one asks up to thirty
 * times, so one 502 or one rate-limit response from `gh` would otherwise end the job - reinstating
 * the false red this whole change removes, and without the sentence that explains it. A failed
 * read is `unreadable`, the wait carries on, and only a bound reached with nothing but failures
 * ends it - which the caller then reports as gh not answering rather than as a missing stamp.
 *
 * `read`, `sleep` and `now` are injected so the wait is testable without a clock or a network.
 * @param {object} input
 * @param {() => {state: string, description: string}} input.read
 */
export async function waitForReviewStatus({ read, timeoutMs = DEFAULT_WAIT_MS, intervalMs = DEFAULT_INTERVAL_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), log = () => {} }) {
  const started = now();
  let polls = 0;
  for (;;) {
    let status;
    try {
      status = read();
    } catch (error) {
      status = { state: 'unreadable', description: String(error?.message ?? error).split('\n')[0] };
    }
    polls += 1;
    const waitedMs = now() - started;
    if (TERMINAL.has(status.state)) return { ...status, waitedMs, polls };
    // Not there yet. Say so on every poll but the first, so a job log shows the wait happening
    // rather than sitting silent for two minutes. A failed read carries what gh said with it.
    const why = status.state === 'unreadable' ? ` (${status.description})` : '';
    if (polls > 1) log(`  still ${status.state}${why} after ${Math.round(waitedMs / 1000)}s of ${Math.round(timeoutMs / 1000)}s`);
    if (waitedMs + intervalMs > timeoutMs) return { ...status, waitedMs, polls };
    await sleep(intervalMs);
  }
}

/** The bound, from the environment when it is set and readable, and the default otherwise. */
export function waitMsFrom(env) {
  const seconds = Number(env.REVIEW_WAIT_SECONDS);
  // A bound that is not a number would be no bound at all: `NaN` fails every comparison, so the
  // loop would poll until the job's own cap killed it, with nothing in the log but `NaNs`.
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_WAIT_MS;
}

/** The job's own step: resolve the sha, wait for the status, say what happened, exit 0 or 1. */
async function main() {
  const env = process.env;
  const repo = env.GITHUB_REPOSITORY ?? '';
  const waitMs = waitMsFrom(env);
  const sha = resolveSha(env);
  if (!sha) {
    console.error('::error::no sha to read a review status on');
    process.exit(1);
  }
  console.log(`waiting up to ${Math.round(waitMs / 1000)}s for ${REVIEW_CONTEXT} on ${sha}`);
  const status = await waitForReviewStatus({
    read: () => readReviewStatus(sha, repo),
    timeoutMs: waitMs,
    log: (line) => console.log(line),
  });
  const waited = `${Math.round(status.waitedMs / 1000)}s, ${status.polls} poll(s)`;
  console.log(`${REVIEW_CONTEXT} on ${sha}: ${status.state} ${status.description} (${waited})`);
  if (status.state === 'unreadable') {
    // GitHub not answering is a different fact from a tip nobody stamped, and the reader needs
    // the difference: one is re-runnable, the other needs `/check` and a queueing.
    console.error(`::error::could not read ${REVIEW_CONTEXT} on ${sha} in ${waited} - gh said: ${status.description}`);
    process.exit(1);
  }
  if (status.state !== 'success') {
    // Name the wait in the error. Without it the next reader repeats this session's work asking
    // whether the red is the race again; with it, the red is a fact about the tip.
    console.error(`::error::no passing ${REVIEW_CONTEXT} on ${sha} after ${waited} - queue with npm run queue:merge, which posts the /check stamp`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Everything this step can throw - an unparseable merge-group ref, a `gh` that is not installed
  // - has to arrive as one `::error::` line. A raw stack in a job log reads as a broken check
  // rather than as an answer about the tip, which is the failure this whole file is about.
  try {
    await main();
  } catch (error) {
    console.error(`::error::${String(error?.message ?? error).split('\n')[0]}`);
    process.exit(1);
  }
}
