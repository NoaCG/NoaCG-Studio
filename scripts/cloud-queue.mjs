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
// A push made with the workflow token starts no workflow run, and the pull request's own
// `Reviewed` run has usually given up waiting for the stamp by now (it waits 150 s), so ci.yml is
// dispatched on the branch with `require_review`, as the mechanical landings do (queue-pr.mjs).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAND_LABEL, REVIEW_CONTEXT, pullRequestFor, spawnRunner } from './queue-pr.mjs';

/** A full 40-hex sha - a short one could name a commit the session never saw. */
const SHA = /^[0-9a-f]{40}$/;

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
 * Stamp, label, dispatch and auto-merge the open pull request for `branch`, if its tip on origin is
 * still `sha`. Returns `{ number, url }`; throws with a sentence naming what to do otherwise.
 */
export function cloudQueue({ branch, sha, review, git = spawnRunner('git'), gh = spawnRunner('gh') }) {
  const refused = checkInputs({ branch, sha, review });
  if (refused) throw new Error(refused);

  const remote = git(['ls-remote', '--heads', 'origin', branch], { allowFailure: true }).out.split(/\s+/)[0] ?? '';
  if (!remote) throw new Error(`${branch} is not on origin - push it first.`);
  if (remote !== sha) {
    throw new Error(`${branch} is at ${remote.slice(0, 12)} on origin, not the reviewed ${sha.slice(0, 12)}. Review the new tip and dispatch again.`);
  }

  const pr = pullRequestFor(branch, gh, 'open');
  if (!pr) throw new Error(`${branch} has no open pull request against main - open one first, then dispatch again.`);

  gh(['api', `repos/{owner}/{repo}/statuses/${sha}`, '-f', 'state=success', '-f', `context=${REVIEW_CONTEXT}`, '-f', `description=${cloudDescription(review)}`]);
  gh(['label', 'create', LAND_LABEL, '--force', '--color', 'F5A623', '--description', 'Queued for the landing queue']);
  gh(['pr', 'edit', String(pr.number), '--add-label', LAND_LABEL]);
  gh(['workflow', 'run', 'ci.yml', '--ref', branch, '-f', 'require_review=true']);
  // No strategy flag: the merge queue owns the strategy, and `gh` refuses one when a queue is on.
  gh(['pr', 'merge', String(pr.number), '--auto']);
  return { number: pr.number, url: pr.url };
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const { number, url } = cloudQueue({ branch: process.env.BRANCH, sha: process.env.SHA, review: process.env.REVIEW });
    console.log(`Queued pull request #${number} (${url}): stamped, labelled \`${LAND_LABEL}\`, auto-merge on, CI dispatched.`);
  } catch (e) {
    console.error(`::error title=Not queued::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
