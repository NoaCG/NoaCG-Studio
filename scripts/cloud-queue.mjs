#!/usr/bin/env node
// QUEUE A CLOUD SESSION'S BRANCH FOR LANDING - `/queue-merge` for a session that has no `gh`.
//
//   node scripts/cloud-queue.mjs     # in .github/workflows/cloud-queue-merge.yml; inputs are env vars
//
// `npm run queue:merge` (scripts/jobs.mjs `queueOnGitHub`) is the declaration that a branch is
// finished, and it runs on a machine with a signed-in `gh`: it posts the review verdict as the
// `noacg/reviewed` status, labels the pull request `land` and turns auto-merge on. A cloud session
// (Claude Code on the web) has no `gh` and no token that can post a status, so until 2026-09-23 its
// finished work waited for somebody's laptop - the one thing a cloud session exists not to need.
//
// This is the same declaration made from the GitHub side. The session pushes its branch, opens its
// pull request, and dispatches this workflow with the tip it reviewed and its verdict in one line;
// the workflow's own token does the rest. What it keeps from the laptop path, deliberately:
//
//   - THE TIP IS PINNED. The stamp goes on the sha the session names, and only if the branch still
//     points there - a push after the review is refused, exactly as `add-merge --expect-sha` is.
//   - THE VERDICT IS THE SESSION'S, IN ITS OWN WORDS, on the status and nowhere invented: the
//     description reads "cloud session: <verdict>", so a reader of the check sees who said what.
//   - THE CODE THAT RUNS IS MAIN'S. The workflow checks out `main`, never the branch, so a branch
//     cannot change what stamps it.
//
// THE PULL REQUEST'S OWN `Reviewed` IS THE ONE THAT COUNTS. Its job waits 150 s for the stamp
// (scripts/reviewed-status.mjs), and a cloud session pushes, opens the pull request and reviews
// before it dispatches this, so that job has usually given up and gone red by the time the stamp
// exists. Measured on pull request 390, 2026-09-23: a `Reviewed` that passed in a separately
// dispatched ci.yml run did NOT clear it - with every required check green on the tip, GitHub
// held the pull request out of the queue for 43 minutes, and re-running the red job in the pull
// request's own run put it in the queue 30 seconds later. So after stamping, this waits for that
// run to finish (a job cannot be re-run while its run is still going) and re-runs a `Reviewed`
// that failed; one still waiting reads the stamp by itself. Only a branch with no pull-request run
// at all has ci.yml dispatched with `require_review`, as the mechanical landings do (queue-pr.mjs).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAND_LABEL, REVIEW_CONTEXT, pullRequestFor, spawnRunner } from './queue-pr.mjs';

/** A full 40-hex sha - a short one could name a commit the session never saw. */
const SHA = /^[0-9a-f]{40}$/;

/** How long to wait for the pull request's own run to finish. A full-suite run takes about 20. */
export const RUN_WAIT_MS = 40 * 60_000;

/** How often to look while waiting. */
export const RUN_POLL_MS = 20_000;

/** Block for `ms` - the runner has nothing else to do, and the git/gh calls here are synchronous. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Parse `gh` JSON output, or null when it did not answer. */
function ghJson(gh, args) {
  const res = gh(args, { allowFailure: true });
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.out);
  } catch {
    return null;
  }
}

/** The status description: the session's verdict, marked as a cloud session's, within GitHub's 140. */
export function cloudDescription(review) {
  return `cloud session: ${String(review).replace(/\s+/g, ' ').trim()}`.slice(0, 140);
}

/** Refuse inputs that cannot be a landing, before anything touches GitHub. */
export function checkInputs({ branch, sha, review }) {
  if (!branch || branch === 'main' || branch.startsWith('-') || /\s/.test(branch)) return `not a branch that can land: "${branch}"`;
  if (!SHA.test(String(sha ?? ''))) return `the reviewed tip must be a full 40-character sha, got "${sha}"`;
  if (!String(review ?? '').trim()) return 'the review verdict is empty - say in one line what was checked';
  return null;
}

/**
 * Stamp, label and auto-merge the open pull request for `branch`, if its tip on origin is
 * still `sha`, then make its own `Reviewed` read the stamp. Returns `{ number, url, reviewed }`;
 * throws with a sentence naming what to do otherwise.
 */
export function cloudQueue({
  branch,
  sha,
  review,
  git = spawnRunner('git'),
  gh = spawnRunner('gh'),
  sleep = sleepSync,
  now = Date.now,
  waitMs = RUN_WAIT_MS,
  pollMs = RUN_POLL_MS,
}) {
  const refused = checkInputs({ branch, sha, review });
  if (refused) throw new Error(refused);

  // The EXACT ref: `ls-remote --heads origin <name>` matches by suffix, so `fix` would also list
  // `claude/fix`, and the first line could be somebody else's tip.
  const ref = `refs/heads/${branch}`;
  const remote =
    git(['ls-remote', 'origin', ref], { allowFailure: true })
      .out.split('\n')
      .map((line) => line.split(/\s+/))
      .find(([, name]) => name === ref)?.[0] ?? '';
  if (!remote) throw new Error(`${branch} is not on origin - push it first.`);
  if (remote !== sha) {
    throw new Error(`${branch} is at ${remote.slice(0, 12)} on origin, not the reviewed ${sha.slice(0, 12)}. Review the new tip and dispatch again.`);
  }

  const pr = pullRequestFor(branch, gh, 'open');
  if (!pr) throw new Error(`${branch} has no open pull request against main - open one first, then dispatch again.`);

  gh(['api', `repos/{owner}/{repo}/statuses/${sha}`, '-f', 'state=success', '-f', `context=${REVIEW_CONTEXT}`, '-f', `description=${cloudDescription(review)}`]);
  gh(['label', 'create', LAND_LABEL, '--force', '--color', 'F5A623', '--description', 'Queued for the landing queue']);
  gh(['pr', 'edit', String(pr.number), '--add-label', LAND_LABEL]);
  // No strategy flag: the merge queue owns the strategy, and `gh` refuses one when a queue is on.
  gh(['pr', 'merge', String(pr.number), '--auto']);
  const reviewed = reviveReviewed({ branch, sha, gh, sleep, now, waitMs, pollMs });
  return { number: pr.number, url: pr.url, reviewed };
}

/**
 * Make the pull request's own `Reviewed` read the stamp that now exists. Returns what it did:
 * `passing` (passed, or still waiting and will see the stamp), `rerun` (it had failed; re-run),
 * `dispatched` (no pull-request run on `sha`, so ci.yml was asked for one), or `timeout` (the run
 * was still going at the bound, with `Reviewed` red - re-run that job by hand once it finishes).
 */
export function reviveReviewed({ branch, sha, gh, sleep = sleepSync, now = Date.now, waitMs = RUN_WAIT_MS, pollMs = RUN_POLL_MS }) {
  const until = now() + waitMs;
  for (;;) {
    // Newest first, so a re-run's newer attempt of the same run is the one read.
    const run = ghJson(gh, ['run', 'list', '--workflow', 'ci.yml', '--commit', sha, '--event', 'pull_request', '--json', 'databaseId,status', '--limit', '1'])?.[0];
    if (!run) {
      gh(['workflow', 'run', 'ci.yml', '--ref', branch, '-f', 'require_review=true']);
      return { outcome: 'dispatched' };
    }
    const job = ghJson(gh, ['run', 'view', String(run.databaseId), '--json', 'jobs'])?.jobs?.find((j) => j.name === 'Reviewed');
    // Not reported yet, still waiting for the stamp, or already green: it reads the stamp itself.
    const red = job?.status === 'completed' && !['success', 'skipped'].includes(job.conclusion);
    if (job && !red) return { outcome: 'passing', run: run.databaseId };
    if (red && run.status === 'completed') {
      gh(['run', 'rerun', String(run.databaseId), '--job', String(job.databaseId)]);
      return { outcome: 'rerun', run: run.databaseId };
    }
    if (now() >= until) return { outcome: 'timeout', run: run.databaseId };
    sleep(pollMs);
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const { number, url, reviewed } = cloudQueue({ branch: process.env.BRANCH, sha: process.env.SHA, review: process.env.REVIEW });
    console.log(`Queued pull request #${number} (${url}): stamped, labelled \`${LAND_LABEL}\`, auto-merge on.`);
    const said = {
      passing: `Reviewed on its run ${reviewed.run} reads the stamp.`,
      rerun: `Reviewed had failed before the stamp existed; re-ran it on run ${reviewed.run}.`,
      dispatched: 'No pull-request run on this tip, so ci.yml was dispatched with require_review.',
      timeout: `Run ${reviewed.run} was still going at the bound with Reviewed red - re-run that job once it finishes.`,
    }[reviewed.outcome];
    console.log(reviewed.outcome === 'timeout' ? `::warning title=Reviewed not re-run::${said}` : said);
  } catch (e) {
    console.error(`::error title=Not queued::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
