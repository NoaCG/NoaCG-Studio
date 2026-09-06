// The bot's landing sequence, pinned: every call it makes and the order, against fake `git` and
// `gh`. What matters is the shape - the stamp says "mechanical", the run is asked for by dispatch
// with `require_review`, and a second call reuses the pull request instead of opening another.
import assert from 'node:assert/strict';
import test from 'node:test';

import { branchExistsOnOrigin, mechanicalDescription, openPullRequestFor, queuePullRequest, LAND_LABEL, REVIEW_CONTEXT } from './queue-pr.mjs';

function fakeRunners({ existingPr = null, remoteBranch = false } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(['git', ...args]);
    if (args[0] === 'rev-parse') return { status: 0, out: 'f'.repeat(40), err: '' };
    if (args[0] === 'ls-remote') return { status: 0, out: remoteBranch ? `${'a'.repeat(40)}\trefs/heads/x` : '', err: '' };
    return { status: 0, out: '', err: '' };
  };
  const gh = (args) => {
    calls.push(['gh', ...args]);
    if (args[0] === 'pr' && args[1] === 'list') return { status: 0, out: JSON.stringify(existingPr ? [existingPr] : []), err: '' };
    if (args[0] === 'pr' && args[1] === 'create') return { status: 0, out: 'https://github.com/o/r/pull/77', err: '' };
    return { status: 0, out: '', err: '' };
  };
  return { calls, git, gh };
}

test('a new branch is pushed, opened, stamped, labelled, dispatched and set to auto-merge, in that order', () => {
  const { calls, git, gh } = fakeRunners();
  const pr = queuePullRequest({ branch: 'quarantine/enter-1', title: 'Quarantine x', body: 'why', mechanism: 'quarantine entry for e2e/x.spec.ts', runUrl: 'https://run/1', diffBase: 'b'.repeat(40), git, gh });
  assert.deepEqual({ number: pr.number, url: pr.url, created: pr.created }, { number: 77, url: 'https://github.com/o/r/pull/77', created: true });
  const heads = calls.map((c) => c.slice(0, 3).join(' '));
  assert.deepEqual(heads, [
    'git rev-parse quarantine/enter-1',
    'git push origin',
    'gh pr list',
    'gh pr create',
    `gh api repos/{owner}/{repo}/statuses/${'f'.repeat(40)}`,
    `gh label create`,
    'gh pr edit',
    'gh workflow run',
    'gh pr merge',
  ]);
  const status = calls.find((c) => c[1] === 'api');
  assert.ok(status.includes(`context=${REVIEW_CONTEXT}`));
  assert.ok(status.some((a) => a.startsWith('description=mechanical: quarantine entry')), 'the stamp names the mechanism, not a review');
  const dispatch = calls.find((c) => c[1] === 'workflow');
  assert.deepEqual(dispatch.slice(2), ['run', 'ci.yml', '--ref', 'quarantine/enter-1', '-f', 'require_review=true', '-f', `diff_base=${'b'.repeat(40)}`]);
  assert.ok(calls.some((c) => c[1] === 'pr' && c[2] === 'edit' && c.includes(LAND_LABEL)));
  const merge = calls.find((c) => c[1] === 'pr' && c[2] === 'merge');
  assert.deepEqual(merge.slice(3), ['77', '--auto'], 'no strategy flag: the queue owns it');
});

test('an open pull request for the branch is reused, never duplicated', () => {
  const { calls, git, gh } = fakeRunners({ existingPr: { number: 5, url: 'https://github.com/o/r/pull/5' } });
  const pr = queuePullRequest({ branch: 'revert/abc1234', title: 't', body: 'b', mechanism: 'revert', git, gh });
  assert.equal(pr.number, 5);
  assert.equal(pr.created, false);
  assert.ok(!calls.some((c) => c[1] === 'pr' && c[2] === 'create'));
});

test('dispatch can be left out, and a missing branch is refused', () => {
  const { calls, git, gh } = fakeRunners();
  queuePullRequest({ branch: 'x', title: 't', body: 'b', mechanism: 'm', dispatch: false, git, gh });
  assert.ok(!calls.some((c) => c[1] === 'workflow'));
  assert.throws(() => queuePullRequest({ title: 't', body: 'b', mechanism: 'm', git, gh }), /branch is required/);
});

test('the description is bounded to what a commit status accepts and says where it came from', () => {
  const d = mechanicalDescription('x'.repeat(200), 'https://run/9');
  assert.ok(d.length <= 140);
  assert.ok(d.startsWith('mechanical: '));
  assert.equal(mechanicalDescription('revert of abc', 'https://run/9'), 'mechanical: revert of abc from https://run/9');
});

test('the origin branch probe and the open-PR probe read the tools, not assumptions', () => {
  const present = fakeRunners({ remoteBranch: true, existingPr: { number: 1, url: 'u' } });
  assert.equal(branchExistsOnOrigin('x', present.git), true);
  assert.deepEqual(openPullRequestFor('x', present.gh), { number: 1, url: 'u' });
  const absent = fakeRunners();
  assert.equal(branchExistsOnOrigin('x', absent.git), false);
  assert.equal(openPullRequestFor('x', absent.gh), null);
  // An unreadable answer is "no pull request", never a crash - the callers act on null.
  assert.equal(openPullRequestFor('x', () => ({ status: 0, out: 'not json', err: '' })), null);
  assert.equal(openPullRequestFor('x', () => ({ status: 1, out: '', err: 'boom' })), null);
});
