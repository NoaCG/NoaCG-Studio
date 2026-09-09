// The configured suite's verdict, pinned against the cases that actually happened.
//
// Every fixture below is a shape observed on a real run between 2026-08-24 and 2026-08-25, because
// this logic exists to catch a class of failure that reads as success. The two that matter most:
// a run where every spec skipped itself and Playwright exited 0, and a run whose only fault was a
// flake - which the FIRST version of the fingerprint missed entirely, hashing the empty set,
// because it read each spec's LAST result and a flake ends `passed`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { verdict, isUnclean, allSpecs, repoRelative } from './configured-verdict.mjs';
import { failureSet } from './ci-failure-set.mjs';

const spec = (file, title, ...results) => ({ file, title, tests: [{ results: results.map((status) => ({ status })) }] });
const report = (stats, specs) => ({ stats, suites: [{ specs }] });

test('a clean full run is green', () => {
  const v = verdict(report({ expected: 33, unexpected: 0, flaky: 0, skipped: 0 }, [spec('a.spec.ts', 'x', 'passed')]), {
    minTests: 33,
    allowedSkips: '',
  });
  assert.equal(v.green, true);
  assert.deepEqual(v.problems, []);
  assert.equal(v.ran, 33);
});

test('THE SILENT-GREEN CASE: everything skipped, exit code 0, must NOT be green', () => {
  const specs = [spec('a.spec.ts', 'x', 'skipped'), spec('b.spec.ts', 'y', 'skipped')];
  const v = verdict(report({ expected: 0, unexpected: 0, flaky: 0, skipped: 2 }, specs), { minTests: 33, allowedSkips: '' });
  assert.equal(v.green, false);
  const titles = v.problems.map((p) => p.title);
  assert.ok(titles.includes('Unexpected skip'), 'names the skip');
  assert.ok(titles.includes('Too few tests ran'), 'and the count');
});

test('an allowlisted skip is tolerated; an unlisted one beside it still fails', () => {
  const specs = [spec('moderator.spec.ts', 'm', 'skipped'), spec('other.spec.ts', 'o', 'skipped')];
  const v = verdict(report({ expected: 31, unexpected: 0, flaky: 0, skipped: 2 }, specs), {
    minTests: 31,
    allowedSkips: 'moderator.spec.ts',
  });
  assert.equal(v.green, false);
  assert.match(v.problems[0].detail, /other\.spec\.ts/);
  assert.doesNotMatch(v.problems[0].detail, /moderator\.spec\.ts/);
});

test('an empty allowlist tolerates nothing (the empty-string split trap)', () => {
  const v = verdict(report({ expected: 32, unexpected: 0, flaky: 0, skipped: 1 }, [spec('a.spec.ts', 'x', 'skipped')]), {
    minTests: 0,
    allowedSkips: '',
  });
  assert.equal(v.green, false, 'a bare "" must not become an allowlist entry that matches a file');
});

test('a FLAKE is not green, and IS in the fingerprint', () => {
  const flake = spec('scorebug-output.spec.ts', 'a published scorebug', 'failed', 'passed');
  assert.equal(isUnclean(flake), true, 'failed>passed is unclean even though it ends passed');
  const v = verdict(report({ expected: 32, unexpected: 0, flaky: 1, skipped: 0 }, [flake]), { minTests: 33, allowedSkips: '' });
  assert.equal(v.green, false);
  assert.deepEqual(v.failSet, ['scorebug-output.spec.ts::a published scorebug']);
  assert.notEqual(v.failHash, 'da39a3ee5e6b', 'the empty-set hash means the flake was missed');
});

test('two runs failing the same way fingerprint the same; a different set does not', () => {
  const one = () => verdict(report({ expected: 32, unexpected: 0, flaky: 1, skipped: 0 }, [spec('s.spec.ts', 't', 'failed', 'passed')]), { minTests: 0, allowedSkips: '' });
  const other = verdict(report({ expected: 31, unexpected: 1, flaky: 1, skipped: 0 }, [
    spec('s.spec.ts', 't', 'failed', 'passed'),
    spec('q.spec.ts', 'u', 'failed', 'failed'),
  ]), { minTests: 0, allowedSkips: '' });
  assert.equal(one().failHash, one().failHash);
  assert.notEqual(one().failHash, other.failHash, 'a new spec failing must change the hash so it is reported');
});

test('ordering noise cannot change the fingerprint', () => {
  const a = verdict(report({ expected: 0, unexpected: 2, flaky: 0, skipped: 0 }, [spec('a.spec.ts', 'x', 'failed'), spec('b.spec.ts', 'y', 'failed')]), { minTests: 0, allowedSkips: '' });
  const b = verdict(report({ expected: 0, unexpected: 2, flaky: 0, skipped: 0 }, [spec('b.spec.ts', 'y', 'failed'), spec('a.spec.ts', 'x', 'failed')]), { minTests: 0, allowedSkips: '' });
  assert.equal(a.failHash, b.failHash);
});

test('specs are found however deeply Playwright nests them', () => {
  const nested = { suites: [{ suites: [{ suites: [{ specs: [spec('deep.spec.ts', 'd', 'passed')] }] }] }] };
  assert.equal(allSpecs(nested).length, 1);
});

// NAMING THE SPEC, not the job. Until 2026-09-09 a configured red told GitHub only a count, so
// `scripts/ci-failure-set.mjs` could answer nothing better than `job: Configured E2E
// (authenticated, local Supabase)` - and over the seven days to 2026-09-09 that was seven reds on
// seven distinct commits of main, none of them naming a spec. Playwright's own `github` reporter
// would not have closed the hole: a FLAKY test is `ok()` to it, and this suite counts flaky as red.
const WORKSPACE = '/home/runner/work/NoaCG-Studio/NoaCG-Studio';
const withRoot = (r, rootDir = `${WORKSPACE}/e2e/configured`) => ({ ...r, config: { rootDir } });

test('a failing spec carries the repo-relative path the rest of the repo keys on', () => {
  // Run 34407579629, 2026-09-09: `production-links.spec.ts:20` timed out at 180s and passed in
  // 8.7s on the retry, which this suite counts as red. Playwright writes `file` relative to
  // rootDir, so the prefix has to be put back or the identity is a different string.
  const flake = { ...spec('production-links.spec.ts', 'unpublishing and publishing again keeps every capability URL', 'timedOut', 'passed'), line: 20 };
  const v = verdict(withRoot(report({ expected: 41, unexpected: 0, flaky: 1, skipped: 0 }, [flake])), {
    minTests: 40,
    allowedSkips: '',
    workspace: WORKSPACE,
  });
  assert.equal(v.green, false);
  assert.deepEqual(v.failing.map((f) => f.path), ['e2e/configured/production-links.spec.ts']);
  assert.equal(v.failing[0].line, 20);
  assert.deepEqual(v.failing[0].statuses, ['timedOut', 'passed']);
});

test('the emitted annotation is what ci-failure-set reads, so the run names the SPEC', () => {
  // The whole point, closed end to end: the path this verdict puts in an `::error file=` line is
  // the path GitHub hands back as a failure annotation, and that is the item the failure set
  // names. Anything else here and the two halves would agree on nothing.
  const flake = { ...spec('production-links.spec.ts', 'a capability URL', 'timedOut', 'passed'), line: 20 };
  const v = verdict(withRoot(report({ expected: 41, unexpected: 0, flaky: 1, skipped: 0 }, [flake])), { minTests: 0, allowedSkips: '', workspace: WORKSPACE });
  const annotations = v.failing.map((f) => ({ path: f.path, annotation_level: 'failure' }));
  const set = failureSet([{ id: 1, name: 'Configured E2E (authenticated, local Supabase)', conclusion: 'failure' }], () => annotations);
  assert.deepEqual(set.items, ['e2e/configured/production-links.spec.ts']);
  assert.equal(set.reason, null);
});

test('an unknown workspace degrades to no path, never to a wrong one', () => {
  // A bare `production-links.spec.ts` and `e2e/configured/production-links.spec.ts` are two
  // identities; a set holding both dedups against neither. With no workspace the annotation goes
  // out without a `file=`, which is exactly the behaviour that stood before this.
  const flake = spec('production-links.spec.ts', 'x', 'failed');
  const v = verdict(withRoot(report({ expected: 0, unexpected: 1, flaky: 0, skipped: 0 }, [flake])), { minTests: 0, allowedSkips: '', workspace: '' });
  assert.equal(v.failing[0].path, null);
  assert.equal(repoRelative('a.spec.ts', '/w/repo/e2e/configured', '/w/repo'), 'e2e/configured/a.spec.ts');
  assert.equal(repoRelative('a.spec.ts', '/w/repo', '/w/repo'), 'a.spec.ts', 'a report written at the repo root needs no prefix');
  assert.equal(repoRelative('a.spec.ts', '/elsewhere/e2e', '/w/repo'), null, 'a rootDir outside the workspace is not guessed at');
  assert.equal(repoRelative('a.spec.ts', undefined, '/w/repo'), null);
  assert.equal(repoRelative('a.spec.ts', 'C:\\w\\repo\\e2e\\configured', 'C:\\w\\repo'), 'e2e/configured/a.spec.ts', 'windows separators normalize');
});

test('a run where the stack never came up names NO spec - every spec skipped is not every spec broken', () => {
  // The annotation is narrower than the fingerprint on purpose. A skipped spec is unclean (the
  // fingerprint must tell an all-skipped run from a clean one) but it did not fail, and naming it
  // would put innocent files into the failure set, the rolling issue and the cross-commit report -
  // where an environment fault repeats across commits by its nature and would headline as a flake.
  const specs = [spec('account.spec.ts', 'a', 'skipped'), spec('teams.spec.ts', 'b', 'skipped')];
  const v = verdict(withRoot(report({ expected: 0, unexpected: 0, flaky: 0, skipped: 2 }, specs)), { minTests: 40, allowedSkips: '', workspace: WORKSPACE });
  assert.equal(v.green, false, 'still red, loudly');
  assert.deepEqual(v.problems.map((p) => p.title), ['Unexpected skip', 'Too few tests ran']);
  assert.deepEqual(v.failing, [], 'and not one spec is named as the fault');
  assert.equal(v.failSet.length, 2, 'the FINGERPRINT still sees them, which is what tells this run from a clean one');
});

test('a spec that failed beside skipped ones is still named', () => {
  const specs = [spec('account.spec.ts', 'a', 'skipped'), spec('teams.spec.ts', 'b', 'failed')];
  const v = verdict(withRoot(report({ expected: 0, unexpected: 1, flaky: 0, skipped: 1 }, specs)), { minTests: 0, allowedSkips: 'account.spec.ts', workspace: WORKSPACE });
  assert.deepEqual(v.failing.map((f) => f.path), ['e2e/configured/teams.spec.ts']);
});

test('a clean run names nothing at all', () => {
  const v = verdict(withRoot(report({ expected: 42, unexpected: 0, flaky: 0, skipped: 0 }, [spec('a.spec.ts', 'x', 'passed')])), { minTests: 0, allowedSkips: '', workspace: WORKSPACE });
  assert.deepEqual(v.failing, []);
  assert.equal(v.green, true);
});
