import assert from 'node:assert/strict';
import test from 'node:test';
import { checkInputs, cloudDescription, cloudQueue, reviveReviewed } from './cloud-queue.mjs';

const SHA = 'a'.repeat(40);

/**
 * Fake `git` and `gh` that record every call and answer like GitHub would. `runs` is the sequence
 * of pull-request runs `gh run list` returns, one per look (the last repeats); each is
 * `{ status, reviewed: { status, conclusion } }`, or null for no run at all.
 */
function fakes({ remoteSha = SHA, lines = null, pr = { number: 7, url: 'https://github.com/o/r/pull/7' }, runs = [{ status: 'completed', reviewed: { status: 'completed', conclusion: 'success' } }] } = {}) {
  const calls = [];
  let look = 0;
  const current = () => runs[Math.min(look, runs.length - 1)];
  const git = (args) => {
    calls.push(['git', ...args]);
    const out = lines ?? (remoteSha ? `${remoteSha}\trefs/heads/feature` : '');
    return { status: 0, out, err: '' };
  };
  const gh = (args) => {
    calls.push(['gh', ...args]);
    if (args[0] === 'pr' && args[1] === 'list') return { status: 0, out: JSON.stringify(pr ? [pr] : []), err: '' };
    if (args[0] === 'run' && args[1] === 'list') {
      const run = current();
      look += 1;
      return { status: 0, out: JSON.stringify(run ? [{ databaseId: 42, status: run.status }] : []), err: '' };
    }
    if (args[0] === 'run' && args[1] === 'view') {
      const run = runs[Math.min(look - 1, runs.length - 1)];
      return { status: 0, out: JSON.stringify({ jobs: [{ databaseId: 900, name: 'Build', status: 'completed', conclusion: 'success' }, { databaseId: 901, name: 'Reviewed', ...run.reviewed }] }), err: '' };
    }
    return { status: 0, out: '', err: '' };
  };
  return { calls, git, gh };
}

/** A clock that only moves when the code sleeps. */
function clock() {
  let t = 0;
  return { now: () => t, sleep: (ms) => { t += ms; } };
}

test('a reviewed tip still on origin is stamped, labelled, dispatched and set to auto-merge', () => {
  const { calls, git, gh } = fakes();
  const result = cloudQueue({ branch: 'feature', sha: SHA, review: 'build green, specs pass', git, gh });
  assert.deepEqual(result, { number: 7, url: 'https://github.com/o/r/pull/7', reviewed: { outcome: 'passing', run: 42 } });
  const said = calls.map((c) => c.join(' '));
  assert.ok(said.some((c) => c.includes(`statuses/${SHA}`) && c.includes('context=noacg/reviewed') && c.includes('description=cloud session: build green, specs pass')));
  assert.ok(said.includes('gh pr edit 7 --add-label land'));
  assert.ok(said.includes('gh pr merge 7 --auto'));
  // Its own run already passed Reviewed: nothing re-run, no second run dispatched.
  assert.ok(!said.some((c) => c.startsWith('gh run rerun') || c.startsWith('gh workflow run')));
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

test('a Reviewed that failed before the stamp existed is re-run once its run finishes', () => {
  // Measured on pull request 390: the red job in the pull request's own run held it out of the queue
  // even with a green Reviewed from a dispatched run, and a job cannot be re-run mid-run.
  const failed = { status: 'completed', conclusion: 'failure' };
  const { calls, git, gh } = fakes({ runs: [{ status: 'in_progress', reviewed: failed }, { status: 'in_progress', reviewed: failed }, { status: 'completed', reviewed: failed }] });
  const { now, sleep } = clock();
  const result = cloudQueue({ branch: 'feature', sha: SHA, review: 'ok', git, gh, now, sleep, pollMs: 1000 });
  assert.deepEqual(result.reviewed, { outcome: 'rerun', run: 42 });
  const said = calls.map((c) => c.join(' '));
  assert.deepEqual(said.filter((c) => c.startsWith('gh run rerun')), ['gh run rerun 42 --job 901']);
  // The stamp and auto-merge come first, so the re-run reads a status that is already there.
  assert.ok(said.findIndex((c) => c.includes('statuses/')) < said.findIndex((c) => c.startsWith('gh run rerun')));
  assert.ok(said.findIndex((c) => c.startsWith('gh pr merge')) < said.findIndex((c) => c.startsWith('gh run rerun')));
});

test('a Reviewed still waiting reads the stamp by itself, and is left alone', () => {
  const { calls, gh } = fakes({ runs: [{ status: 'in_progress', reviewed: { status: 'in_progress', conclusion: null } }] });
  assert.deepEqual(reviveReviewed({ branch: 'feature', sha: SHA, gh, ...clock() }), { outcome: 'passing', run: 42 });
  assert.ok(!calls.some(([, verb, sub]) => verb === 'workflow' || (verb === 'run' && sub === 'rerun')));
});

test('no pull-request run on the tip asks ci.yml for one, with the review check', () => {
  const { calls, gh } = fakes({ runs: [null] });
  assert.deepEqual(reviveReviewed({ branch: 'feature', sha: SHA, gh, ...clock() }), { outcome: 'dispatched' });
  assert.ok(calls.map((c) => c.join(' ')).includes('gh workflow run ci.yml --ref feature -f require_review=true'));
});

test('a run still going at the bound is reported, never re-run half-way', () => {
  const failed = { status: 'completed', conclusion: 'failure' };
  const { calls, gh } = fakes({ runs: [{ status: 'in_progress', reviewed: failed }] });
  const result = reviveReviewed({ branch: 'feature', sha: SHA, gh, ...clock(), waitMs: 5000, pollMs: 1000 });
  assert.deepEqual(result, { outcome: 'timeout', run: 42 });
  assert.ok(!calls.some((c) => c[1] === 'run' && c[2] === 'rerun'));
});
