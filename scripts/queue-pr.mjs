#!/usr/bin/env node
// QUEUE A MECHANICAL PULL REQUEST FROM A WORKFLOW - the same landing path a session takes, driven
// by a bot that holds nothing but the workflow's own token.
//
//   import { queuePullRequest } from './queue-pr.mjs'
//
// The three mechanical landings of docs/WORKFLOW_ARCHITECTURE.md §5.2 (a quarantine entry, a
// quarantine release, a revert of a batch that turned main red) all end the same way: a branch
// exists locally with one commit on it, and it has to reach `main` through the merge queue and
// nothing else. That is what `npm run queue:merge` does for a session (scripts/jobs.mjs
// `queueOnGitHub`), and this is the same sequence for a caller that is a job on a runner.
//
// TWO THINGS ARE DIFFERENT ABOUT A BOT, and both are handled here rather than in each caller:
//
//   1. The `/check` stamp. A session posts `noacg/reviewed` from a review it ran; a bot posts it
//      from the MECHANISM that produced the change, and the description says so - "mechanical:
//      quarantine entry from run 123" - so the stamp never claims a review that did not happen.
//      The Reviewed check reads the state, a person reads the description.
//   2. A push made with the workflow token starts NO workflow run (GitHub's rule for
//      GITHUB_TOKEN), so the branch would sit on its pull request with no `CI gate` and no
//      `Reviewed` on its tip, and a pull request without its required checks never enters the
//      queue. `workflow_dispatch` IS allowed from the token, so the branch's run is asked for by
//      dispatch, with `require_review` so the Reviewed job runs on it and `diff_base` so it plans
//      the change rather than the whole suite. The merge group re-tests the merged result anyway.
//
// Every step is idempotent, as in `queueOnGitHub`: an existing pull request is reused, the label
// is created with --force, the status can be posted twice. `git` and `gh` are injected so the
// sequence is testable without a repository; the default runners spawn the real tools.
import { spawnSync } from 'node:child_process';

/** The commit status the Reviewed check reads (ci.yml `reviewed`). */
export const REVIEW_CONTEXT = 'noacg/reviewed';

/** The label the ledger sync (scripts/landings.mjs) reads a landing off. */
export const LAND_LABEL = 'land';

/** The identity a workflow's commits carry, so a reader can tell a bot landing from a session's. */
export const BOT_IDENTITY = {
  name: 'github-actions[bot]',
  email: '41898282+github-actions[bot]@users.noreply.github.com',
};

/** Spawn one tool and hand back its text; a non-zero exit is an error naming the command. */
export function spawnRunner(tool) {
  return (args, { cwd = process.cwd(), allowFailure = false } = {}) => {
    const res = spawnSync(tool, args, { cwd, encoding: 'utf8', windowsHide: true });
    const out = String(res.stdout ?? '').trim();
    const err = String(res.stderr ?? '').trim();
    if (res.status !== 0 && !allowFailure) {
      throw new Error(`${tool} ${args.slice(0, 2).join(' ')} failed: ${err || out || `exit ${res.status}`}`);
    }
    return { status: res.status ?? 1, out, err };
  };
}

/** Set the bot identity on this checkout only, so a commit made here says who made it. */
export function configureBotIdentity(git) {
  git(['config', 'user.name', BOT_IDENTITY.name]);
  git(['config', 'user.email', BOT_IDENTITY.email]);
}

/** Is there already a branch of this name on origin? Callers skip a landing that is already queued. */
export function branchExistsOnOrigin(branch, git) {
  const res = git(['ls-remote', '--heads', 'origin', branch], { allowFailure: true });
  return res.status === 0 && res.out.trim() !== '';
}

/** The pull request open for a branch, or null. */
export function openPullRequestFor(branch, gh) {
  const res = gh(['pr', 'list', '--head', branch, '--base', 'main', '--state', 'open', '--json', 'number,url', '--limit', '1'], { allowFailure: true });
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.out)[0] ?? null;
  } catch {
    return null;
  }
}

/** The description the stamp carries: the mechanism, never the word "reviewed" on its own. */
export function mechanicalDescription(mechanism, runUrl) {
  const where = runUrl ? ` from ${runUrl}` : '';
  return `mechanical: ${mechanism}${where}`.slice(0, 140);
}

/**
 * Push the branch, open or reuse its pull request, post the stamp, label it, ask for its run, turn
 * auto-merge on. Returns `{ number, url, created }`.
 *
 * @param {object} input
 * @param {string} input.branch the local branch to land; its tip is what gets stamped
 * @param {string} input.title pull request title (also the landing's line in the ledger)
 * @param {string} input.body pull request body
 * @param {string} input.mechanism what produced the change, for the stamp's description
 * @param {string} [input.runUrl] the workflow run that produced it
 * @param {string} [input.diffBase] the main sha the branch was cut from; the dispatched run plans from it
 * @param {boolean} [input.dispatch=true] ask ci.yml for the branch run the token push cannot start
 * @param {(args: string[], opts?: object) => {status:number,out:string,err:string}} [input.git]
 * @param {(args: string[], opts?: object) => {status:number,out:string,err:string}} [input.gh]
 */
export function queuePullRequest({ branch, title, body, mechanism, runUrl = '', diffBase = '', dispatch = true, git = spawnRunner('git'), gh = spawnRunner('gh') }) {
  if (!branch) throw new Error('queuePullRequest: a branch is required');
  const tip = git(['rev-parse', branch]).out;
  git(['push', 'origin', `refs/heads/${branch}:refs/heads/${branch}`]);

  let pr = openPullRequestFor(branch, gh);
  let created = false;
  if (!pr) {
    const url = gh(['pr', 'create', '--base', 'main', '--head', branch, '--title', String(title).slice(0, 120), '--body', body]).out;
    pr = { number: Number(url.split('/').pop()), url };
    created = true;
  }

  const description = mechanicalDescription(mechanism, runUrl);
  gh(['api', `repos/{owner}/{repo}/statuses/${tip}`, '-f', 'state=success', '-f', `context=${REVIEW_CONTEXT}`, '-f', `description=${description}`]);
  gh(['label', 'create', LAND_LABEL, '--force', '--color', 'F5A623', '--description', 'Queued for the landing queue']);
  gh(['pr', 'edit', String(pr.number), '--add-label', LAND_LABEL]);

  if (dispatch) {
    const args = ['workflow', 'run', 'ci.yml', '--ref', branch, '-f', 'require_review=true'];
    if (diffBase) args.push('-f', `diff_base=${diffBase}`);
    gh(args);
  }
  // No strategy flag: the merge queue owns the strategy, and `gh` refuses one when a queue is on.
  gh(['pr', 'merge', String(pr.number), '--auto']);
  return { number: pr.number, url: pr.url, created, tip };
}
