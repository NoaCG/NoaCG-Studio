#!/usr/bin/env node
// THE CI WATCH - every red run on GitHub reaches the live session the minute it happens.
//
//   node scripts/ci-watch.mjs [--every 60] [--since 60] [--limit 40] [--once]
//
// WHY. The agent reads GitHub only when it polls, and only for the branches it is landing, so a
// run that goes red on any other branch - or on `main` after a landing this session never saw -
// sits unseen until somebody looks. The owner gets the email; the session never hears
// (`docs/ORCHESTRATOR_SIMPLIFICATION.md`, the visibility gap). `main-health.mjs` answers "is main
// red right now?" when a landing ASKS; nothing asked on the session's behalf. This does.
//
// HOW. The same shape as `wave-watch.mjs`: poll `gh run list` for the WHOLE repo on a short
// interval and print ONE LINE PER EVENT and nothing else, so it can be armed as a persistent
// Monitor beside the wave watch. An event is a run reaching a red conclusion (`failure`,
// `timed_out`), reported once per run id, with WHAT failed named from the run's check annotations
// (`ci-failure-set.mjs`) so the line sends a reader to a spec rather than to a dashboard; and
// `main` turning green again after a red, so the queue's release is seen too. A cancelled run is
// not a verdict (`docs/VERIFICATION.md`) and prints nothing. The first poll is a BASELINE: reds
// older than `--since` minutes at arming are history, not events.
//
// NOTHING IS EVER SUPPRESSED, and one class is spelled out instead. A run whose only failing job is
// `Reviewed` used to print as `job: Reviewed`, which reads like a procedural hiccup and is not one:
// it means a queued pull request cannot land, or a `/queue-merge` that stopped half-way. It now
// says which, read off the pull request. See `describeReviewedOnly` for the measurement.
//
// Silence is not success (the Monitor rule): a poll that FAILS prints a `WATCH ERROR` line, the
// same error at most once until `gh` answers again, and the recovery prints once too. Every line
// is also appended to `<git-common-dir>/noacg-jobs/ci-watch-events.log`, because stdout can be
// lost to compaction and the morning reads the log, not the loop's memory.

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeFailureSet, fetchFailureSet } from './ci-failure-set.mjs';
import { ensureJobsDir, jobsDir } from './jobs-store.mjs';

export const DEFAULT_EVERY_SECONDS = 60;
export const DEFAULT_SINCE_MINUTES = 60;
export const DEFAULT_LIMIT = 40;

/** Conclusions that are a verdict against the code. `cancelled` is deliberately absent. */
export const RED = new Set(['failure', 'timed_out']);

/**
 * The single member a failure set has when the ONLY failing job is ci.yml's `Reviewed` - the check
 * that reads the `noacg/reviewed` commit status `/queue-merge` posts on a tip. `failureSet` gives a
 * failing job with no file annotations its own name, and that job annotates nothing with a path.
 */
export const REVIEWED_ONLY = 'job: Reviewed';

/**
 * WHY THIS IS NAMED RATHER THAN SUPPRESSED.
 *
 * The night of 2026-09-08 read `CI RED - CI on <branch> - job: Reviewed` as procedural noise: the
 * pre-queue window every branch passes through, because the stamp only exists once a session
 * queues. It measured false. `reviewed` does not run on `push` at all (ci.yml: pull_request,
 * merge_group, or a dispatch asking for it), and a pull request exists only because `/queue-merge`
 * opened one - which posts the status seconds later. The same wave queued two more pull requests
 * minutes apart and neither went red.
 *
 * "Seconds later" used to be a race the check could lose - by forty-eight of them on pull request
 * #174, on a branch that was properly reviewed. It no longer is: the job WAITS up to 150 s for the
 * status (`scripts/reviewed-status.mjs`), so a `Reviewed` red is one of the two shapes below and
 * never the gap between a push and the queueing that follows it.
 *
 * All three of that night's `Reviewed` reds were TRUE, and both branches are still unlanded:
 * a pull request queued the day before whose tip moved twice with no fresh stamp (queue-merge.md,
 * "a tip that moved after the declaration"), and one whose `/queue-merge` opened the pull request
 * and then stopped - no status on the tip, no `land` label, no auto-merge, three hours later.
 * Suppressing on "not queued" would have hidden the second, which is the worse of the two.
 *
 * So the fix is the line, not the alarm. `job: Reviewed` names a job and sends the reader to a
 * dashboard; what they need is which of the two shapes it is, which is one `gh pr view` away.
 */
export function describeReviewedOnly(queued) {
  const head = 'no /check stamp on this tip';
  if (queued === true) {
    return `${head} and the pull request IS queued - it cannot land until its own session runs /check and queues again`;
  }
  if (queued === false) {
    return `${head} and the pull request was never queued - the queueing stopped after opening it`;
  }
  return `${head} - open the pull request for whether it is queued`;
}

/**
 * The `what` half of a red line: the failing spec files, or the review check said in full.
 * `queued` is only consulted for a `Reviewed`-only set and may be null (GitHub did not answer).
 */
export function describeRun(set, queued = null) {
  const items = set?.items ?? [];
  if (isReviewedOnly(set)) return describeReviewedOnly(queued);
  return items.length > 0 ? describeFailureSet(items) : null;
}

/**
 * Did this run fail on the review check and NOTHING else? The one place the test is written, so
 * the caller that decides whether to look the pull request up and the one that words the line
 * cannot drift apart about what "only Reviewed" means.
 */
export function isReviewedOnly(set) {
  const items = set?.items ?? [];
  return items.length === 1 && items[0] === REVIEWED_ONLY;
}

/**
 * Is this pull request in the landing queue? `/queue-merge` posts the review status, adds the
 * `land` label and turns auto-merge on (`scripts/jobs.mjs`, `queueOnGitHub`), so either mark means
 * a session declared the branch finished. `null` is "GitHub did not say", and null never becomes
 * one of the two definite sentences above - an alarm may be vague, never wrong.
 */
export function queuedFromPr(pr) {
  if (!pr || typeof pr !== 'object') return null;
  if (pr.autoMergeRequest) return true;
  const labels = Array.isArray(pr.labels) ? pr.labels : [];
  return labels.some((label) => label?.name === 'land');
}

export function parseArgs(argv) {
  const args = { every: DEFAULT_EVERY_SECONDS, since: DEFAULT_SINCE_MINUTES, limit: DEFAULT_LIMIT, once: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--every') args.every = Number(argv[index += 1]);
    else if (token === '--since') args.since = Number(argv[index += 1]);
    else if (token === '--limit') args.limit = Number(argv[index += 1]);
    else if (token === '--once') args.once = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`unknown argument: ${token}`);
  }
  if (!Number.isFinite(args.every) || args.every < 30) throw new Error('--every must be at least 30 seconds - every poll is a GitHub API call');
  if (!Number.isFinite(args.since) || args.since < 0) throw new Error('--since must be a number of minutes');
  if (!Number.isFinite(args.limit) || args.limit < 1 || args.limit > 100) throw new Error('--limit must be between 1 and 100');
  return args;
}

const isRed = (run) => run.status === 'completed' && RED.has(run.conclusion);
const isVerdict = (run) => run.status === 'completed' && (run.conclusion === 'success' || RED.has(run.conclusion));
const shortSha = (sha) => String(sha ?? '').slice(0, 8);

/** The one line a red run prints. `what` is the failure set already described, or null. */
export function redLine(run, what) {
  const where = `${run.workflowName ?? run.name} on ${run.headBranch} (${shortSha(run.headSha)})`;
  return `CI RED - ${where} - ${what ?? 'open the run'} - ${run.url}`;
}

/**
 * The state one poll carries to the next: which run ids have been reported, and the last verdict
 * seen per workflow on `main` (so a red-to-green flip is an event and a green-to-green is not).
 */
export function baseline(runs, { now = Date.now(), sinceMs = DEFAULT_SINCE_MINUTES * 60_000 } = {}) {
  const reported = new Set();
  for (const run of runs) {
    if (run.status !== 'completed') continue;
    const finished = Date.parse(run.updatedAt ?? run.createdAt ?? '') || 0;
    if (now - finished > sinceMs) reported.add(run.databaseId);
  }
  return { reported, mainVerdict: mainVerdicts(runs) };
}

/**
 * Newest verdict per workflow on main, with the run that gave it. The list is newest first, so
 * the first wins. The run travels with the verdict because a RE-RUN sends a red run back to
 * `in_progress`: the newest verdict is then an OLDER green, and reporting that as "green again"
 * would be false - main only turns green when a run at least as new as the red one passes.
 */
function mainVerdicts(runs) {
  const verdicts = new Map();
  for (const run of runs) {
    if (run.headBranch !== 'main' || !isVerdict(run)) continue;
    const workflow = run.workflowName ?? run.name;
    if (!verdicts.has(workflow)) verdicts.set(workflow, { verdict: isRed(run) ? 'red' : 'green', createdAt: run.createdAt, headSha: run.headSha, url: run.url });
  }
  return verdicts;
}

const newerOrSame = (a, b) => (Date.parse(a ?? '') || 0) >= (Date.parse(b ?? '') || 0);

/**
 * One poll's events, and the state for the next. Pure: `describe(run)` names what failed and is
 * only called for a run that will be printed, so a quiet poll costs no annotation fetch.
 */
export function step(state, runs, { describe = () => null } = {}) {
  const lines = [];
  const reported = new Set(state.reported);
  // Newest first from gh; print oldest first so a batch reads in the order it happened.
  for (const run of [...runs].reverse()) {
    if (!isRed(run) || reported.has(run.databaseId)) continue;
    reported.add(run.databaseId);
    lines.push(redLine(run, describe(run)));
  }
  const mainVerdict = mainVerdicts(runs);
  for (const [workflow, now] of mainVerdict) {
    const before = state.mainVerdict.get(workflow);
    if (before?.verdict !== 'red') continue;
    if (now.verdict === 'green' && newerOrSame(now.createdAt, before.createdAt)) {
      lines.push(`CI GREEN - main is green again on ${workflow} (${shortSha(now.headSha)}) - ${now.url ?? ''}`.trimEnd());
    } else if (!newerOrSame(now.createdAt, before.createdAt)) {
      // The red run was re-run and is in flight again: main is still red until it answers.
      mainVerdict.set(workflow, before);
    }
  }
  // A workflow that has scrolled out of the window keeps its last known verdict.
  for (const [workflow, verdict] of state.mainVerdict) if (!mainVerdict.has(workflow)) mainVerdict.set(workflow, verdict);
  return { lines, state: { reported, mainVerdict } };
}

/** WATCH ERROR once until recovery, WATCH RECOVERED once on recovery - the wave-watch contract. */
export function errorLines(result, lastError) {
  if (!result.ok) return result.error === lastError ? [] : [`WATCH ERROR - gh run list failed: ${result.error}`];
  return lastError ? ['WATCH RECOVERED - gh answers again'] : [];
}

const FIELDS = 'databaseId,status,conclusion,headBranch,headSha,name,workflowName,url,createdAt,updatedAt';

export function listRuns({ limit = DEFAULT_LIMIT } = {}) {
  const res = spawnSync('gh', ['run', 'list', '--limit', String(limit), '--json', FIELDS], { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  if (res.status !== 0) return { ok: false, error: String(res.stderr ?? '').trim().split('\n')[0] || `exit ${res.status}` };
  try {
    return { ok: true, runs: JSON.parse(res.stdout) };
  } catch {
    return { ok: false, error: 'gh run list printed something that was not JSON' };
  }
}

function repoSlug() {
  if (process.env.GH_REPO) return process.env.GH_REPO;
  const res = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  return res.status === 0 ? String(res.stdout).trim() || null : null;
}

/**
 * The OPEN pull request for a branch, or null. Only asked for a `Reviewed`-only red, so the extra
 * call costs nothing on a normal poll and nothing at all on a quiet one.
 *
 * The lookup is `pr list --head --base --state open`, the form `jobs.mjs` and `queue-pr.mjs`
 * already use, and the state filter is the load-bearing part. `gh pr view <branch>` answers with a
 * MERGED pull request when the branch has no open one, and nothing in this repo ever removes the
 * `land` label - so a landed branch still carries it, and reading that would print "it cannot land"
 * about a pull request that landed hours ago. The list form also cannot mistake a branch name for a
 * pull request number, which `pr view` does for a numeric one.
 *
 * Null is "no open pull request, or GitHub did not answer", and null keeps the vague sentence: a
 * merge-group branch (`gh-readonly-queue/...`) has none of its own and lands there correctly, since
 * that red is the queue's own gate and wants no queue-state gloss.
 */
export function fetchPr(branch, { run = spawnSync } = {}) {
  if (!branch) return null;
  const res = run(
    'gh',
    ['pr', 'list', '--head', branch, '--base', 'main', '--state', 'open', '--json', 'autoMergeRequest,labels', '--limit', '1'],
    { encoding: 'utf8', windowsHide: true, timeout: 30_000 },
  );
  if (res?.status !== 0) return null;
  try {
    return JSON.parse(res.stdout)[0] ?? null;
  } catch {
    return null;
  }
}

function describeFor(repo) {
  return (run) => {
    const set = fetchFailureSet(run.databaseId, { repo });
    return describeRun(set, isReviewedOnly(set) ? queuedFromPr(fetchPr(run.headBranch)) : null);
  };
}

function appendLog(lines) {
  const dir = jobsDir();
  if (!dir || lines.length === 0) return;
  try {
    ensureJobsDir(dir);
    const stamp = new Date().toISOString();
    appendFileSync(path.join(dir, 'ci-watch-events.log'), lines.map((line) => `${stamp} ${line}\n`).join(''), 'utf8');
  } catch {
    // The log is a convenience for the morning; losing a line there never stops the watch.
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`ci-watch: ${error.message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write('Usage: node scripts/ci-watch.mjs [--every <seconds>] [--since <minutes>] [--limit <runs>] [--once]\n');
    return 0;
  }
  const describe = describeFor(repoSlug());
  let state = null;
  let lastError = null;
  for (;;) {
    const result = listRuns({ limit: args.limit });
    let lines = errorLines(result, lastError);
    if (result.ok) {
      if (state === null) state = baseline(result.runs, { sinceMs: args.since * 60_000 });
      const next = step(state, result.runs, { describe });
      state = next.state;
      lines = lines.concat(next.lines);
    }
    for (const line of lines) process.stdout.write(`${line}\n`);
    appendLog(lines);
    lastError = result.ok ? null : result.error;
    if (args.once) return result.ok ? 0 : 1;
    await sleep(args.every * 1000);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
