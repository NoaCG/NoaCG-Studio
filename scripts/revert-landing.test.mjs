// The revert, pinned against a fake git: which commits a push brought in, how each is reverted,
// what a conflict does, and that a batch already queued is not queued twice. The real git is not
// spawned; `batchCommits` parses exactly the `rev-list --format` line git prints.
import assert from 'node:assert/strict';
import test from 'node:test';

import { batchCommits, revertBody, revertBranchName, revertCommands, revertLanding, revertTitle } from './revert-landing.mjs';

const H = (c) => c.repeat(40);
const REV_LIST = [
  `commit ${H('1')}`,
  `${H('1')} ${H('0')} ${H('a')}\x1fMerge pull request #70 from NoaCG/claude/first`,
  `commit ${H('2')}`,
  `${H('2')} ${H('1')}\x1fA plain commit`,
  `commit ${H('3')}`,
  `${H('3')} ${H('2')} ${H('b')}\x1fMerge pull request #71 from NoaCG/claude/second`,
].join('\n');

function fakeGit({ revList = REV_LIST, remoteBranch = false, conflictOn = null } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'rev-list') return { status: 0, out: revList, err: '' };
    if (args[0] === 'ls-remote') return { status: 0, out: remoteBranch ? 'sha\trefs/heads/x' : '', err: '' };
    if (args[0] === 'rev-parse') return { status: 0, out: H('9'), err: '' };
    if (args[0] === 'revert' && conflictOn && args.includes(conflictOn)) return { status: 1, out: '', err: 'error: could not revert' };
    return { status: 0, out: '', err: '' };
  };
  return { calls, git };
}

const fakeGh = () => {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'list') return { status: 0, out: '[]', err: '' };
    if (args[0] === 'pr' && args[1] === 'create') return { status: 0, out: 'https://github.com/o/r/pull/80', err: '' };
    return { status: 0, out: '', err: '' };
  };
  return { calls, gh };
};

test('the batch is the first-parent walk, oldest first, merges marked', () => {
  const { git } = fakeGit();
  const commits = batchCommits(git, H('4'), H('3'));
  assert.deepEqual(commits.map((c) => [c.hash[0], c.merge, c.subject]), [
    ['1', true, 'Merge pull request #70 from NoaCG/claude/first'],
    ['2', false, 'A plain commit'],
    ['3', true, 'Merge pull request #71 from NoaCG/claude/second'],
  ]);
  assert.deepEqual(revertCommands(commits), [
    ['revert', '--no-edit', '-m', '1', H('3')],
    ['revert', '--no-edit', H('2')],
    ['revert', '--no-edit', '-m', '1', H('1')],
  ]);
});

test('a clean revert lands on revert/<sha7> through the queue and reports the pull request', () => {
  const { calls, git } = fakeGit();
  const { calls: ghCalls, gh } = fakeGh();
  const result = revertLanding({ before: H('4'), sha: H('3'), runUrl: 'https://run/1', failing: 'e2e/x.spec.ts', git, gh });
  assert.equal(result.status, 'queued');
  assert.equal(result.url, 'https://github.com/o/r/pull/80');
  assert.ok(calls.some((c) => c[0] === 'checkout' && c.includes(revertBranchName(H('3')))));
  assert.equal(calls.filter((c) => c[0] === 'revert').length, 3);
  const create = ghCalls.find((c) => c[0] === 'pr' && c[1] === 'create');
  assert.match(create[create.indexOf('--title') + 1], /^Revert the 3 landings up to 3333333 - main went red$/);
  const dispatch = ghCalls.find((c) => c[0] === 'workflow');
  assert.ok(dispatch.includes(`diff_base=${H('3')}`), 'the branch run plans from the red commit it was cut from');
});

test('a conflict aborts, leaves nothing pushed, and says which revert did not apply', () => {
  const { calls, git } = fakeGit({ conflictOn: H('2') });
  const { gh } = fakeGh();
  const result = revertLanding({ before: H('4'), sha: H('3'), git, gh });
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /revert --no-edit 2{40} did not apply cleanly/);
  assert.ok(calls.some((c) => c[0] === 'revert' && c[1] === '--abort'));
  assert.ok(!calls.some((c) => c[0] === 'push'));
});

test('an unusable before, an empty batch and an already-queued branch are skipped with a reason', () => {
  const { gh } = fakeGh();
  assert.equal(revertLanding({ before: '0'.repeat(40), sha: H('3'), git: fakeGit().git, gh }).status, 'skipped');
  assert.equal(revertLanding({ before: '', sha: H('3'), git: fakeGit().git, gh }).status, 'skipped');
  assert.match(revertLanding({ before: H('4'), sha: H('3'), git: fakeGit({ revList: '' }).git, gh }).reason, /no commits/);
  const queued = revertLanding({ before: H('4'), sha: H('3'), git: fakeGit({ remoteBranch: true }).git, gh: () => ({ status: 0, out: '[{"number":4,"url":"u4"}]', err: '' }) });
  assert.deepEqual({ status: queued.status, url: queued.url, existing: queued.existing }, { status: 'queued', url: 'u4', existing: true });
});

test('dry-run plans without touching git beyond reading', () => {
  const { calls, git } = fakeGit();
  const result = revertLanding({ before: H('4'), sha: H('3'), dryRun: true, git, gh: fakeGh().gh });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.commands.length, 3);
  assert.ok(calls.every((c) => ['ls-remote', 'rev-list'].includes(c[0])));
});

test('the title and body name the commit, the run, the failure and every reverted landing', () => {
  const commits = [{ hash: H('1'), merge: true, subject: 'Merge pull request #70 from NoaCG/claude/first' }];
  assert.equal(revertTitle(commits, H('1')), 'Revert "Merge pull request #70 from NoaCG/claude/first" - main went red');
  const body = revertBody({ commits, sha: H('1'), before: H('4'), runUrl: 'https://run/1', failing: 'e2e/x.spec.ts' });
  assert.match(body, /https:\/\/run\/1/);
  assert.match(body, /e2e\/x\.spec\.ts/);
  assert.match(body, /- 1111111 Merge pull request #70/);
});
