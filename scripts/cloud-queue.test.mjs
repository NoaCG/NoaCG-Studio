import assert from 'node:assert/strict';
import test from 'node:test';
import { checkInputs, cloudDescription, cloudQueue } from './cloud-queue.mjs';

const SHA = 'a'.repeat(40);

/** Fake `git` and `gh` that record every call and answer like GitHub would. */
function fakes({ remoteSha = SHA, lines = null, pr = { number: 7, url: 'https://github.com/o/r/pull/7' } } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(['git', ...args]);
    const out = lines ?? (remoteSha ? `${remoteSha}\trefs/heads/feature` : '');
    return { status: 0, out, err: '' };
  };
  const gh = (args) => {
    calls.push(['gh', ...args]);
    if (args[0] === 'pr' && args[1] === 'list') return { status: 0, out: JSON.stringify(pr ? [pr] : []), err: '' };
    return { status: 0, out: '', err: '' };
  };
  return { calls, git, gh };
}

test('a reviewed tip still on origin is stamped, labelled, dispatched and set to auto-merge', () => {
  const { calls, git, gh } = fakes();
  const result = cloudQueue({ branch: 'feature', sha: SHA, review: 'build green, specs pass', git, gh });
  assert.deepEqual(result, { number: 7, url: 'https://github.com/o/r/pull/7' });
  const said = calls.map((c) => c.join(' '));
  assert.ok(said.some((c) => c.includes(`statuses/${SHA}`) && c.includes('context=noacg/reviewed') && c.includes('description=cloud session: build green, specs pass')));
  assert.ok(said.includes('gh pr edit 7 --add-label land'));
  assert.ok(said.includes('gh workflow run ci.yml --ref feature -f require_review=true'));
  assert.ok(said.includes('gh pr merge 7 --auto'));
});

test('a branch that moved after its review is refused before anything is stamped', () => {
  const { calls, git, gh } = fakes({ remoteSha: 'b'.repeat(40) });
  assert.throws(() => cloudQueue({ branch: 'feature', sha: SHA, review: 'ok', git, gh }), /not the reviewed/);
  assert.equal(calls.filter(([tool]) => tool === 'gh').length, 0);
});

test('no open pull request, or no branch on origin, is refused with what to do', () => {
  const noPr = fakes({ pr: null });
  assert.throws(() => cloudQueue({ branch: 'feature', sha: SHA, review: 'ok', git: noPr.git, gh: noPr.gh }), /no open pull request/);
  const noBranch = fakes({ remoteSha: '' });
  assert.throws(() => cloudQueue({ branch: 'feature', sha: SHA, review: 'ok', git: noBranch.git, gh: noBranch.gh }), /not on origin/);
});

test('inputs that cannot be a landing are refused', () => {
  assert.match(checkInputs({ branch: 'main', sha: SHA, review: 'ok' }), /not a branch/);
  assert.match(checkInputs({ branch: 'feature', sha: 'abc123', review: 'ok' }), /40-character/);
  assert.match(checkInputs({ branch: 'feature', sha: SHA, review: '  ' }), /verdict is empty/);
  assert.equal(checkInputs({ branch: 'feature', sha: SHA, review: 'ok' }), null);
});

test('the stamp says whose verdict it is, and fits the status field', () => {
  assert.equal(cloudDescription('  build\n green  '), 'cloud session: build green');
  assert.equal(cloudDescription('x'.repeat(300)).length, 140);
});

test('only the exact branch counts: a longer name ending the same way is never read as its tip', () => {
  // What a suffix match returns for `feature`: another branch first, at the reviewed sha, and the
  // real branch after it, moved on.
  const lines = `${SHA}\trefs/heads/claude/feature\n${'b'.repeat(40)}\trefs/heads/feature`;
  const { calls, git, gh } = fakes({ lines });
  assert.throws(() => cloudQueue({ branch: 'feature', sha: SHA, review: 'ok', git, gh }), /not the reviewed/);
  assert.equal(calls.filter(([tool]) => tool === 'gh').length, 0);
  assert.deepEqual(calls[0], ['git', 'ls-remote', 'origin', 'refs/heads/feature']);
});
