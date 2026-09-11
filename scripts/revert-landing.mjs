#!/usr/bin/env node
// REVERT WHAT TURNED MAIN RED, and queue the revert through the merge queue.
//
//   node scripts/revert-landing.mjs --since <sha> --sha <sha> --run-url <url> --failing "<what>" [--dry-run]
//
// Chromium's answer to a red tree is a sheriff who reverts the culprit; the queue keeps moving
// and the author fixes forward on a branch. This is that answer without the sheriff
// (docs/WORKFLOW_ARCHITECTURE.md §3, phase 1c). ci.yml calls it after a main run whose failure
// was run a second time on the same commit and failed again, when the last main commit WITH A
// VERDICT was green - so everything since is the culprit by the only evidence there is. Landings
// arrive faster than full runs finish, and a superseded run cancels itself, so "since" is the
// last verdict, not the previous push: the range may hold several landings, and the pull request
// lists every one. The revert is a branch off the red commit carrying `git revert` of every
// first-parent commit in the range, newest first, landed through the same queue as everything
// else; the red-main issue names the pull request, and the next main run closes the issue when
// the revert lands.
//
// WHAT IT REFUSES, and says so instead: an unknown `since`, an empty range, a revert that
// conflicts (aborted, nothing pushed), a revert already open (reused), and one a person closed
// without merging (left alone). None of those is a crash: the caller writes the reason into the
// issue, and a person reads a reason rather than a silence.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { alreadyQueued, configureBotIdentity, queuePullRequest, spawnRunner } from './queue-pr.mjs';

const ZERO_SHA = '0'.repeat(40);

/** A push's `before` (or any bounding sha) that can bound a range at all. */
export function isUsableSha(sha) {
  return typeof sha === 'string' && /^[0-9a-f]{7,40}$/i.test(sha) && sha !== ZERO_SHA;
}

/** `revert/<sha7>` - one branch per red commit, so a re-run of the same run cannot queue it twice. */
export function revertBranchName(sha) {
  return `revert/${String(sha).slice(0, 7)}`;
}

/**
 * The commits between two main commits, oldest first: the first-parent walk from `since` to
 * `sha`. A merge-queue landing is a merge commit per pull request; a batch is several.
 * @returns {{ hash: string, merge: boolean, subject: string }[]}
 */
export function batchCommits(git, since, sha) {
  const out = git(['log', '--first-parent', '--reverse', '--format=%H %P%x1f%s', `${since}..${sha}`]).out;
  const commits = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const [hashes, subject = ''] = line.split('\x1f');
    const [hash, ...parents] = hashes.trim().split(' ');
    commits.push({ hash, merge: parents.length > 1, subject: subject.trim() });
  }
  return commits;
}

/** The `git revert` invocations, newest commit first, a merge reverted against its first parent. */
export function revertCommands(commits) {
  return [...commits].reverse().map((c) => ['revert', '--no-edit', ...(c.merge ? ['-m', '1'] : []), c.hash]);
}

export function revertTitle(commits, sha) {
  if (commits.length === 1) return `Revert "${commits[0].subject}" - main went red`.slice(0, 120);
  return `Revert the ${commits.length} landings up to ${String(sha).slice(0, 7)} - main went red`;
}

export function revertBody({ commits, sha, since, runUrl, failing }) {
  return [
    `main went red at ${sha} (${runUrl}): ${failing || 'see the run'}.`,
    'The failure survived a second run on the same commit, and the last main commit',
    `with a verdict (${String(since).slice(0, 7)}) was green, so everything since it is reverted. Fix forward on a`,
    'branch and land it through the queue.',
    '',
    `Reverted (first-parent commits ${String(since).slice(0, 7)}..${String(sha).slice(0, 7)}):`,
    ...commits.map((c) => `- ${c.hash.slice(0, 7)} ${c.subject}`),
  ].join('\n');
}

/**
 * Do it. Returns `{ status: 'queued', url, number }`, `{ status: 'skipped', reason }` or
 * `{ status: 'failed', reason }` - never throws for a reason the issue should carry instead.
 */
export function revertLanding({ since, sha, runUrl = '', failing = '', dryRun = false, git = spawnRunner('git'), gh = spawnRunner('gh') }) {
  if (!isUsableSha(since) || !isUsableSha(sha)) {
    return { status: 'skipped', reason: 'no main commit with a verdict bounds the range, so the culprit cannot be named' };
  }
  const branch = revertBranchName(sha);
  const state = alreadyQueued(branch, git, gh);
  if (state.state === 'open') return { status: 'queued', url: state.pr.url, number: state.pr.number, existing: true };
  if (state.state === 'closed') return { status: 'skipped', reason: `${state.pr.url} was closed without merging - a person decided against this revert` };
  let commits;
  try {
    commits = batchCommits(git, since, sha);
  } catch (error) {
    return { status: 'failed', reason: `could not list the range: ${error.message}` };
  }
  if (commits.length === 0) return { status: 'skipped', reason: `no commits between ${since.slice(0, 7)} and ${sha.slice(0, 7)}` };
  if (dryRun) return { status: 'dry-run', branch, commits, commands: revertCommands(commits) };

  configureBotIdentity(git);
  git(['checkout', '-q', '-B', branch, sha]);
  for (const args of revertCommands(commits)) {
    const res = git(args, { allowFailure: true });
    if (res.status !== 0) {
      git(['revert', '--abort'], { allowFailure: true });
      git(['checkout', '-q', sha], { allowFailure: true });
      return { status: 'failed', reason: `git ${args.join(' ')} did not apply cleanly (${(res.err || res.out).split('\n')[0]}) - the revert needs a person` };
    }
  }
  const title = revertTitle(commits, sha);
  const body = revertBody({ commits, sha, since, runUrl, failing });
  try {
    const pr = queuePullRequest({ branch, title, body, mechanism: `revert of ${since.slice(0, 7)}..${sha.slice(0, 7)}, main red on ${failing || 'CI'}`, runUrl, diffBase: sha, force: state.state === 'stale-branch', git, gh });
    return { status: 'queued', url: pr.url, number: pr.number, commits };
  } catch (error) {
    return { status: 'failed', reason: `queueing the revert failed: ${error.message}` };
  }
}

// The CLI is for a person reading a range before trusting the mechanism; ci.yml reaches
// `revertLanding` through scripts/red-main-issue.mjs, which supplies every argument itself.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);
  const result = revertLanding({ since: flag('--since'), sha: flag('--sha'), runUrl: flag('--run-url') ?? '', failing: flag('--failing') ?? '', dryRun: argv.includes('--dry-run') });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'failed' ? 1 : 0);
}
