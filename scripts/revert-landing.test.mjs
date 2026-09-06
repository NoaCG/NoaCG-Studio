// The revert, pinned against a fake git: which commits a range holds, how each is reverted, what
// a conflict does, and that a revert already open, or closed by a person, is not made again. The
// real git is not spawned; `batchCommits` parses exactly the `log --format` line git prints.
import assert from 'node:assert/strict';
import test from 'node:test';

import { batchCommits, isUsableSha, revertBody, revertBranchName, revertCommands, revertLanding, revertTitle } from './revert-landing.mjs';

const H = (c) => c.repeat(40);
const LOG = [
  `${H('1')} ${H('4')} ${H('a')}\x1fMerge pull request #70 from NoaCG/claude/first`,
  `${H('2')} ${H('1')}\x1fA plain commit`,
  `${H('3')} ${H('2')} ${H('b')}\x1fMerge pull request #71 from NoaCG/claude/second`,
].join('\n');

function fakeGit({ log = LOG, remoteBranch = false, conflictOn = null } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'log') return { status: 0, out: log, err: '' };
    if (args[0] === 'ls-remote') return { status: 0, out: remoteBranch ? 'sha\trefs/heads/x' : '', err: '' };
    if (args[0] === 'rev-parse') return { status: 0, out: H('9'), err: '' };
    if (args[0] === 'revert' && conflictOn && args.includes(conflictOn)) return { status: 1, out: '', err: 'error: could not revert' };
    return { status: 0, out: '', err: '' };
  };
  return { calls, git };
}

function fakeGh({ openPr = null, closedPr = null } = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'list') {
      const pr = args[args.indexOf('--state') + 1] === 'open' ? openPr : closedPr;
      return { status: 0, out: JSON.stringify(pr ? [pr] : []), err: '' };
    }
    if (args[0] === 'pr' && args[1] === 'create') return { status: 0, out: 'https://github.com/o/r/pull/80', err: '' };
    return { status: 0, out: '', err: '' };
  };
  return { calls, gh };
}

test('the range is the first-parent walk, oldest first, merges marked', () => {
  const { calls, git } = fakeGit();
  const commits = batchCommits(git, H('4'), H('3'));
  assert.deepEqual(commits.map((c) => [c.hash[0], c.merge, c.subject]), [
    ['1', true, 'Merge pull request #70 from NoaCG/claude/first'],
    ['2', false, 'A plain commit'],
    ['3', true, 'Merge pull request #71 from NoaCG/claude/second'],
  ]);
  assert.deepEqual(calls[0].slice(0, 3), ['log', '--first-parent', '--reverse']);
  assert.deepEqual(revertCommands(commits), [
    ['revert', '--no-edit', '-m', '1', H('3')],
    ['revert', '--no-edit', H('2')],
    ['revert', '--no-edit', '-m', '1', H('1')],
  ]);
});

test('a clean revert lands on revert/<sha7> through the queue and reports the pull request', () => {
  const { calls, git } = fakeGit();
  const { calls: ghCalls, gh } = fakeGh();
  const result = revertLanding({ since: H('4'), sha: H('3'), runUrl: 'https://run/1', failing: 'e2e/x.spec.ts', git, gh });
  assert.equal(result.status, 'queued');
  assert.equal(result.url, 'https://github.com/o/r/pull/80');
  assert.ok(calls.some((c) => c[0] === 'checkout' && c.includes(revertBranchName(H('3')))));
  assert.equal(calls.filter((c) => c[0] === 'revert').length, 3);
  const create = ghCalls.find((c) => c[0] === 'pr' && c[1] === 'create');
  assert.match(create[create.indexOf('--title') + 1], /^Revert the 3 landings up to 3333333 - main went red$/);
  const dispatch = ghCalls.find((c) => c[0] === 'workflow');
  assert.ok(dispatch.includes(`diff_base=${H('3')}`), 'the branch run plans from the red commit it was cut from');
  assert.ok(!calls.some((c) => c[0] === 'push' && c[1] === '--force'), 'a free branch is not force-pushed');
});

test('a conflict aborts, leaves nothing pushed, and says which revert did not apply', () => {
  const { calls, git } = fakeGit({ conflictOn: H('2') });
  const { gh } = fakeGh();
  const result = revertLanding({ since: H('4'), sha: H('3'), git, gh });
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /revert --no-edit 2{40} did not apply cleanly/);
  assert.ok(calls.some((c) => c[0] === 'revert' && c[1] === '--abort'));
  assert.ok(!calls.some((c) => c[0] === 'push'));
});

test('an unusable range and an empty range are skipped with a reason', () => {
  const { gh } = fakeGh();
  assert.equal(isUsableSha('0'.repeat(40)), false);
  assert.equal(isUsableSha(''), false);
  assert.equal(isUsableSha(null), false);
  assert.equal(isUsableSha('abc1234'), true);
  assert.match(revertLanding({ since: '0'.repeat(40), sha: H('3'), git: fakeGit().git, gh }).reason, /cannot be named/);
  assert.match(revertLanding({ since: null, sha: H('3'), git: fakeGit().git, gh }).reason, /cannot be named/);
  assert.match(revertLanding({ since: H('4'), sha: H('3'), git: fakeGit({ log: '' }).git, gh }).reason, /no commits/);
});

test('a revert already open is reported as queued; one a person closed is left alone; a dead one is retried with force', () => {
  const open = revertLanding({ since: H('4'), sha: H('3'), git: fakeGit({ remoteBranch: true }).git, gh: fakeGh({ openPr: { number: 4, url: 'u4' } }).gh });
  assert.deepEqual({ status: open.status, url: open.url, existing: open.existing }, { status: 'queued', url: 'u4', existing: true });
  const closed = revertLanding({ since: H('4'), sha: H('3'), git: fakeGit({ remoteBranch: true }).git, gh: fakeGh({ closedPr: { number: 5, url: 'u5', mergedAt: null } }).gh });
  assert.equal(closed.status, 'skipped');
  assert.match(closed.reason, /closed without merging/);
  const stale = fakeGit({ remoteBranch: true });
  const retried = revertLanding({ since: H('4'), sha: H('3'), git: stale.git, gh: fakeGh().gh });
  assert.equal(retried.status, 'queued');
  assert.ok(stale.calls.some((c) => c[0] === 'push' && c[1] === '--force'), 'the branch a dead landing left behind is replaced');
});

test('dry-run plans without touching git beyond reading', () => {
  const { calls, git } = fakeGit();
  const result = revertLanding({ since: H('4'), sha: H('3'), dryRun: true, git, gh: fakeGh().gh });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.commands.length, 3);
  assert.ok(calls.every((c) => ['ls-remote', 'log'].includes(c[0])));
});

test('the title and body name the commit, the run, the failure and every reverted landing', () => {
  const commits = [{ hash: H('1'), merge: true, subject: 'Merge pull request #70 from NoaCG/claude/first' }];
  assert.equal(revertTitle(commits, H('1')), 'Revert "Merge pull request #70 from NoaCG/claude/first" - main went red');
  const body = revertBody({ commits, sha: H('1'), since: H('4'), runUrl: 'https://run/1', failing: 'e2e/x.spec.ts' });
  assert.match(body, /https:\/\/run\/1/);
  assert.match(body, /e2e\/x\.spec\.ts/);
  assert.match(body, /with a verdict \(4444444\) was green/);
  assert.match(body, /- 1111111 Merge pull request #70/);
});
