// The failure set decides two things nobody wants wrong: what a red-main refusal NAMES, and
// whether the owner hears about a failure at all. Every case below is one the measurement in
// docs/CI_STABILITY.md actually produced between 2026-08-15 and 2026-08-29.

import assert from 'node:assert/strict';
import test from 'node:test';

import { describeFailureSet, failureSet, jobIdentity } from './ci-failure-set.mjs';

/** A run's jobs, in the shape `gh api .../jobs` returns them. */
const JOBS = {
  gate: { id: 1, name: 'CI gate', conclusion: 'failure' },
  shard3: { id: 2, name: 'E2E 3/9 (full)', conclusion: 'failure' },
  shard6: { id: 3, name: 'E2E 6/9 (full)', conclusion: 'failure' },
  build: { id: 4, name: 'Build (typecheck + lint + bundle)', conclusion: 'failure' },
  factory: { id: 5, name: 'Factory gates', conclusion: 'failure' },
  green: { id: 6, name: 'E2E 1/9 (full)', conclusion: 'success' },
};

/** One failing-test annotation, as Playwright's `github` reporter really produces it. */
const fail = (path) => ({ path, annotation_level: 'failure' });
const anim = [fail('e2e/anim-engine.spec.ts')];

test('the failing SPEC is the identity, not the job that happened to run it', () => {
  const set = failureSet([JOBS.gate, JOBS.shard3], () => anim);
  assert.deepEqual(set.items, ['e2e/anim-engine.spec.ts']);
  assert.notEqual(set.hash, 'unknown');
});

test('the same spec keeps its hash when Playwright re-splits it into another shard', () => {
  // Playwright shards by test COUNT, so one added spec file moves everything. Keying on the shard
  // index would make every re-split look like a brand-new failure and defeat the dedup on exactly
  // the runs it exists for.
  const inShard3 = failureSet([JOBS.shard3], () => anim);
  const inShard6 = failureSet([JOBS.shard6], () => anim);
  assert.equal(inShard3.hash, inShard6.hash);
});

test('the CI gate contributes nothing - it fails because something else did', () => {
  const withGate = failureSet([JOBS.gate, JOBS.shard3], () => anim);
  const withoutGate = failureSet([JOBS.shard3], () => anim);
  assert.equal(withGate.hash, withoutGate.hash);
});

test('a NEW spec beside a familiar one is a different set, so it can never be deduped away', () => {
  const one = failureSet([JOBS.shard3], () => anim);
  const two = failureSet([JOBS.shard3], () => [...anim, fail('e2e/local-relay.spec.ts')]);
  assert.notEqual(one.hash, two.hash);
  assert.deepEqual(two.items, ['e2e/anim-engine.spec.ts', 'e2e/local-relay.spec.ts']);
});

test('order of annotations and jobs cannot change the hash', () => {
  const a = failureSet([JOBS.shard3, JOBS.shard6], (id) => (id === 2 ? [fail('e2e/b.spec.ts')] : [fail('e2e/a.spec.ts')]));
  const b = failureSet([JOBS.shard6, JOBS.shard3], (id) => (id === 2 ? [fail('e2e/b.spec.ts')] : [fail('e2e/a.spec.ts')]));
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.items, ['e2e/a.spec.ts', 'e2e/b.spec.ts']);
});

test('a failing job with no annotations is named by the job - a red build is not a red spec', () => {
  const set = failureSet([JOBS.build], () => []);
  assert.deepEqual(set.items, ['job: Build (typecheck + lint + bundle)']);
  assert.notEqual(set.hash, failureSet([JOBS.factory], () => []).hash);
});

test('a successful job contributes nothing', () => {
  assert.deepEqual(failureSet([JOBS.green], () => anim).items, []);
});

test('an unclassifiable run hashes to `unknown`, and two of them are NOT equal', () => {
  // The load-bearing case. `unknown` must never dedup against anything, including itself in a
  // later run - "I could not tell what failed" is the one answer that must always be spoken.
  const empty = failureSet([], () => []);
  const onlyGate = failureSet([JOBS.gate], () => []);
  assert.equal(empty.hash, 'unknown');
  assert.equal(onlyGate.hash, 'unknown');
});

test('a timed-out job counts as a failure; a cancelled one does not', () => {
  const timedOut = failureSet([{ id: 9, name: 'Factory gates', conclusion: 'timed_out' }], () => []);
  const cancelled = failureSet([{ id: 9, name: 'Factory gates', conclusion: 'cancelled' }], () => []);
  assert.deepEqual(timedOut.items, ['job: Factory gates']);
  assert.deepEqual(cancelled.items, []);
});

test('windows-shaped annotation paths normalize, so the same spec is one member', () => {
  const set = failureSet([JOBS.shard3], () => [fail('e2e\\anim-engine.spec.ts'), fail('e2e/anim-engine.spec.ts')]);
  assert.deepEqual(set.items, ['e2e/anim-engine.spec.ts']);
});

test('ONLY failure annotations count - a Slow Test warning is not a failing spec', () => {
  // Measured on the real red main this whole mechanism exists for (run 33205116363, 2026-08-28).
  // The failing shard emitted three non-failure annotations beside the real one: a `Slow Test`
  // warning whose path was `[chromium] > e2e/ai.spec.ts`, a run-summary notice, and GitHub's
  // `.github` placeholder. Counting any of them would put a timing-dependent member in the set,
  // so the hash would differ on most runs, nothing would ever dedup, and the fix would look
  // installed while doing nothing at all.
  const set = failureSet([JOBS.shard3], () => [
    { path: '.github', annotation_level: 'warning' },
    { path: '.github', annotation_level: 'failure' },
    { path: '.github', annotation_level: 'notice' },
    { path: '[chromium] › e2e/ai.spec.ts', annotation_level: 'warning' },
    { path: 'e2e/anim-engine.spec.ts', annotation_level: 'failure' },
  ]);
  assert.deepEqual(set.items, ['e2e/anim-engine.spec.ts']);
});

test('a project prefix is not part of a spec identity', () => {
  // One spec failing under two Playwright projects is one broken file, which is also how
  // nightly-triage.mjs counts it.
  const set = failureSet([JOBS.shard3], () => [
    { path: '[chromium] › e2e/anim-engine.spec.ts', annotation_level: 'failure' },
    fail('e2e/anim-engine.spec.ts'),
  ]);
  assert.deepEqual(set.items, ['e2e/anim-engine.spec.ts']);
});

test('a shard whose ONLY annotations are non-failures is named by its job, not silently dropped', () => {
  // A shard that died before Playwright could report still failed. It must land in the set as
  // something, or a run with one dead shard hashes to `unknown` when we do know which job broke.
  const set = failureSet([JOBS.shard3], () => [{ path: '.github', annotation_level: 'warning' }]);
  assert.deepEqual(set.items, ['job: E2E shard']);
});

test('jobIdentity strips only the shard coordinates', () => {
  assert.equal(jobIdentity('E2E 3/9 (full)'), 'E2E shard');
  assert.equal(jobIdentity('Factory gates'), 'Factory gates');
  assert.equal(jobIdentity(undefined), 'unknown job');
});

test('the description names specs, and says so honestly when there are none', () => {
  assert.match(describeFailureSet([]), /could not name/);
  assert.equal(describeFailureSet(['a', 'b']), 'a, b');
  assert.equal(describeFailureSet(['a', 'b', 'c', 'd']), 'a, b, c (+1 more)');
});

// EXHAUSTED vs UNKNOWN. Both leave the item set empty, and until 2026-09-04 they were the same
// answer - which is how run 33829325663 (four E2E shards killed at the 20-minute cap, everything
// else green) opened issue #52 reporting a failure nobody could name.
test('a run whose jobs ran out of clock is exhausted, not an unnamed failure', () => {
  const set = failureSet([
    { id: 1, name: 'Build', conclusion: 'success' },
    { id: 2, name: 'E2E 4/9 (full)', conclusion: 'cancelled' },
    { id: 3, name: 'E2E 2/9 (full)', conclusion: 'cancelled' },
    { id: 4, name: 'CI gate', conclusion: 'failure' },
  ]);
  assert.equal(set.exhausted, true);
  assert.deepEqual(set.cancelled, ['E2E 2/9 (full)', 'E2E 4/9 (full)']);
  assert.deepEqual(set.items, [], 'nothing failed, so nothing is named');
});

test('a real failure alongside a cancelled job is NOT exhausted', () => {
  // One shard out of time and another genuinely red is a red run. The nameable fault wins, or a
  // slow shard would become a way to silence a real regression.
  const set = failureSet(
    [
      { id: 1, name: 'E2E 4/9 (full)', conclusion: 'cancelled' },
      { id: 2, name: 'E2E 5/9 (full)', conclusion: 'failure' },
    ],
    (id) => (id === 2 ? [{ path: 'e2e/anim-engine.spec.ts', annotation_level: 'failure' }] : []),
  );
  assert.equal(set.exhausted, false);
  assert.deepEqual(set.items, ['e2e/anim-engine.spec.ts']);
});

test('a run with nothing cancelled and nothing failing is not exhausted either', () => {
  const set = failureSet([{ id: 1, name: 'Build', conclusion: 'success' }]);
  assert.equal(set.exhausted, false);
  assert.equal(set.hash, 'unknown');
});

test('the DERIVED gate job never makes a run look exhausted on its own', () => {
  // 'CI gate' fails because something else did. A cancelled gate job says nothing about the code,
  // exactly as its failure does not - so it must not be the thing that reports exhaustion.
  const set = failureSet([
    { id: 1, name: 'Build', conclusion: 'success' },
    { id: 2, name: 'CI gate', conclusion: 'cancelled' },
  ]);
  assert.equal(set.exhausted, false);
  assert.deepEqual(set.cancelled, []);
});

// MAIN'S PUSH RUNS, one per commit, newest first - the list the revert's last-verdict walk and the
// quarantine's pass history both read, so what counts as a main run is spelled once.
import { mainPushRuns } from './ci-failure-set.mjs';

test('main push runs are read from one workflow, completed pushes only, deduplicated by commit', () => {
  const asked = [];
  const gh = (args) => {
    asked.push(args[0]);
    return [{ head_sha: 'a', conclusion: 'success' }, { head_sha: 'a', conclusion: 'cancelled' }, { conclusion: 'failure' }, { head_sha: 'b', conclusion: 'failure' }];
  };
  assert.deepEqual(mainPushRuns({ repo: 'o/r', workflow: 'quarantine.yml', limit: 5, gh }), [{ head_sha: 'a', conclusion: 'success' }, { head_sha: 'b', conclusion: 'failure' }]);
  assert.equal(asked[0], 'repos/o/r/actions/workflows/quarantine.yml/runs?branch=main&event=push&status=completed&per_page=5');
  assert.deepEqual(mainPushRuns({ repo: 'o/r', gh: () => [] }), []);
});

// WHY THE SET IS EMPTY. Four emptinesses reach a reader as one word until they are told apart, and
// on 2026-09-08 the weekly review ran this tool against eleven failed runs, got eleven `unknown`s,
// and nearly reported that CI had failed eleven times for reasons the repo could not name. Every
// one of them was "I never asked GitHub", which is not a verdict about the run at all.
import { fetchFailureSet, repoFromRemote, resolveRepo } from './ci-failure-set.mjs';

test('a green run says nothing failed, rather than that it could not be named', () => {
  const set = failureSet([JOBS.green], () => []);
  assert.equal(set.hash, 'unknown');
  assert.equal(set.reason, 'no-failed-jobs');
  assert.match(describeFailureSet(set.items, { reason: set.reason }), /nothing in the run failed/);
});

test('a run GitHub described no jobs for is told apart from a run where nothing failed', () => {
  // `ghJsonLines` answers [] for an unauthenticated `gh`, a wrong run id and a slow API alike, so
  // the sentence names all three possibilities instead of picking one it cannot know.
  const set = failureSet([], () => []);
  assert.equal(set.reason, 'no-jobs');
  assert.match(describeFailureSet(set.items, { reason: set.reason }), /run id may be wrong/);
});

test('a run that only ran out of clock reports exhausted, even with the derived gate red beside it', () => {
  // The gate fails BECAUSE the shards were killed, so "the shards never finished" is the half of
  // that pair worth saying. Ordering, not a new rule - it is why `exhausted` is tested first.
  const set = failureSet([
    { id: 1, name: 'E2E 4/9 (full)', conclusion: 'cancelled' },
    { id: 2, name: 'CI gate', conclusion: 'failure' },
  ]);
  assert.equal(set.exhausted, true);
  assert.equal(set.reason, 'exhausted');
});

test('a run whose only casualty was the derived gate says so', () => {
  const set = failureSet([JOBS.gate, JOBS.green], () => []);
  assert.equal(set.reason, 'derived-only');
  assert.match(describeFailureSet(set.items, { reason: set.reason }), /derived CI gate/);
});

test('a named set carries no reason, and an unrecognised reason keeps the old sentence', () => {
  assert.equal(failureSet([JOBS.shard3], () => anim).reason, null);
  assert.match(describeFailureSet([], { reason: 'something-new' }), /could not name/);
  assert.match(describeFailureSet([], {}), /could not name/);
});

test('fetchFailureSet distinguishes no run id from no repository, and asks GitHub for neither', () => {
  let asked = 0;
  const gh = () => {
    asked += 1;
    return [];
  };
  assert.equal(fetchFailureSet('', { repo: 'o/r', gh }).reason, 'no-run-id');
  assert.equal(fetchFailureSet('123', { repo: '', gh }).reason, 'no-repo');
  assert.equal(asked, 0, 'neither case is worth a network call');
});

// RESOLVING THE REPOSITORY. Every workflow sets GH_REPO and nothing sets it for a person, which is
// the whole reason the tool was blind outside CI. Three sources, each covering where the previous
// one is blind - and none of them writes an owner down, because the repository moved to the NoaCG
// organisation on 2026-09-06 and a hardcoded owner would have survived that move looking right.
test('the environment wins, and costs no subprocess at all', () => {
  const run = () => assert.fail('the environment already answered');
  assert.deepEqual(resolveRepo({ env: { GH_REPO: ' o/r ' }, run }), { repo: 'o/r', source: 'GH_REPO' });
  assert.deepEqual(resolveRepo({ env: { GITHUB_REPOSITORY: 'o/r' }, run }), { repo: 'o/r', source: 'GH_REPO' });
});

test('with no environment, gh names the checkout', () => {
  const run = (cmd) => (cmd === 'gh' ? { status: 0, stdout: 'NoaCG/NoaCG-Studio\n' } : assert.fail('git was not needed'));
  assert.deepEqual(resolveRepo({ env: {}, run }), { repo: 'NoaCG/NoaCG-Studio', source: 'gh repo view' });
});

test('when gh cannot answer - not signed in, not installed - the git remote still can', () => {
  const run = (cmd) => (cmd === 'gh' ? { status: 1, stdout: '' } : { status: 0, stdout: 'https://github.com/NoaCG/NoaCG-Studio.git\n' });
  assert.deepEqual(resolveRepo({ env: {}, run }), { repo: 'NoaCG/NoaCG-Studio', source: 'git remote' });
});

test('when nothing can name the repository the answer is null, never a guess', () => {
  const run = () => ({ status: 1, stdout: '' });
  assert.deepEqual(resolveRepo({ env: {}, run }), { repo: null, source: null });
});

test('both remote forms parse, and a non-GitHub remote answers null', () => {
  // A wrong repository is worse than none: GitHub answers a question about somebody else's runs
  // with a plausible empty set, which reads exactly like a green run.
  assert.equal(repoFromRemote('https://github.com/NoaCG/NoaCG-Studio.git'), 'NoaCG/NoaCG-Studio');
  assert.equal(repoFromRemote('https://github.com/NoaCG/NoaCG-Studio'), 'NoaCG/NoaCG-Studio');
  assert.equal(repoFromRemote('git@github.com:NoaCG/NoaCG-Studio.git\n'), 'NoaCG/NoaCG-Studio');
  assert.equal(repoFromRemote('ssh://git@github.com/NoaCG/NoaCG-Studio.git'), 'NoaCG/NoaCG-Studio');
  assert.equal(repoFromRemote('https://gitlab.com/NoaCG/NoaCG-Studio.git'), null);
  assert.equal(repoFromRemote(''), null);
  assert.equal(repoFromRemote(undefined), null);
});
