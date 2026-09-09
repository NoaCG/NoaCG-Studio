// The two counting rules decide what a person is told to look at on a Monday morning, and both
// were learned from one measurement: 2026-09-04..08, where `e2e/import-svg.spec.ts` failed on four
// commits across four lines of work and `e2e/wizard-filters.spec.ts` failed three times on three
// commits of ONE branch. The first is evidence nobody could see; the second is a branch failing
// its own tests, which its owner can see perfectly well. A rule that names both names nothing.

import assert from 'node:assert/strict';
import test from 'node:test';

import { failedRuns, renderReport, repeatOffenders, windowStart } from './ci-repeat-failures.mjs';

/** One failed run, in the shape the CLI assembles before grouping. */
const run = (id, sha, branch, items) => ({ id, head_sha: sha, head_branch: branch, name: 'CI', html_url: `https://x/${id}`, items });

test('a spec failing on several commits across several branches is reported', () => {
  // The real 2026-09-08 finding, with its real shas shortened.
  const { specs } = repeatOffenders([
    run(1, 'aaa', 'claude/two-row-set-recipe', ['e2e/import-svg.spec.ts']),
    run(2, 'bbb', 'claude/phone-work-session', ['e2e/import-svg.spec.ts']),
    run(3, 'ccc', 'main', ['e2e/import-svg.spec.ts']),
    run(4, 'ddd', 'claude/new-session', ['e2e/import-svg.spec.ts']),
  ]);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].item, 'e2e/import-svg.spec.ts');
  assert.equal(specs[0].shas.length, 4);
  assert.deepEqual(specs[0].branches, ['claude/new-session', 'claude/phone-work-session', 'claude/two-row-set-recipe', 'main']);
});

test('a spec failing three times on ONE branch is NOT reported', () => {
  // `wizard-filters` in that window. Three commits, one line of work: a branch failing its own
  // tests is the branch owner's, and reporting it here would drown the finding that is not.
  const { specs, seen } = repeatOffenders([
    run(1, 'aaa', 'claude/phone-work-session', ['e2e/wizard-filters.spec.ts']),
    run(2, 'bbb', 'claude/phone-work-session', ['e2e/wizard-filters.spec.ts']),
    run(3, 'ccc', 'claude/phone-work-session', ['e2e/wizard-filters.spec.ts']),
  ]);
  assert.deepEqual(specs, []);
  assert.equal(seen, 1, 'it was seen and weighed, not missed');
});

test('two reds on two commits of main count, though main is one branch name', () => {
  // Main is the line every branch lands on, so two independent landings with the same symptom is
  // the strongest cross-sha evidence there is - and the shape a single-branch rule would drop.
  const { specs } = repeatOffenders([
    run(1, 'aaa', 'main', ['e2e/anim-engine.spec.ts']),
    run(2, 'bbb', 'main', ['e2e/anim-engine.spec.ts']),
  ]);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].mainShas, 2);
});

test('two runs of the SAME commit are one commit - that pair is the quarantine\'s business', () => {
  // A fail-then-fail re-run on one sha says the code decided the outcome; a fail-then-PASS on one
  // sha is the quarantine's admission receipt. Neither is this file's shape, and counting runs
  // instead of commits would let one re-run manufacture a report.
  const { specs } = repeatOffenders([
    run(1, 'aaa', 'claude/x', ['e2e/anim-engine.spec.ts']),
    run(2, 'aaa', 'claude/x', ['e2e/anim-engine.spec.ts']),
  ]);
  assert.deepEqual(specs, []);
});

test('jobs are kept apart from specs and never headline', () => {
  // `job: Build` repeats by construction - unrelated branches break the build for unrelated
  // reasons - so it is reported where a reader can ignore it, not beside the specs.
  const { specs, jobs } = repeatOffenders([
    run(1, 'aaa', 'claude/x', ['job: Build', 'e2e/anim-engine.spec.ts']),
    run(2, 'bbb', 'claude/y', ['job: Build', 'e2e/anim-engine.spec.ts']),
  ]);
  assert.deepEqual(jobs.map((j) => j.item), ['job: Build']);
  assert.deepEqual(specs.map((s) => s.item), ['e2e/anim-engine.spec.ts']);
});

test('a run whose failure could not be named contributes nothing and breaks nothing', () => {
  const { specs, seen } = repeatOffenders([run(1, 'aaa', 'main', []), run(2, 'bbb', 'main', [])]);
  assert.deepEqual(specs, []);
  assert.equal(seen, 0);
  assert.deepEqual(repeatOffenders(undefined).specs, []);
});

test('the report says plainly that it decides nothing', () => {
  // The whole design rests on this: cross-sha evidence is weaker than the quarantine's same-sha
  // receipt, so this instrument reports and a person decides. If the text ever stops saying so,
  // somebody will read the list as a verdict and quarantine off it.
  const result = repeatOffenders([
    run(1, 'aaa', 'claude/x', ['e2e/anim-engine.spec.ts']),
    run(2, 'bbb', 'claude/y', ['e2e/anim-engine.spec.ts']),
  ]);
  const text = renderReport(result, { window: '2026-09-04..2026-09-08', runs: 2 }).join('\n');
  assert.match(text, /Nothing here is quarantined/);
  assert.match(text, /evidence, not a verdict/);
  assert.match(text, /e2e\/anim-engine\.spec\.ts/);

  const empty = renderReport(repeatOffenders([]), { window: 'since 2026-09-03 (7 day(s))', runs: 0 }).join('\n');
  assert.match(empty, /No spec failed on two commits/);
});

test('a past window is asked for as a closed range, so a measurement can be re-derived', () => {
  const asked = [];
  const gh = (args) => {
    asked.push(args[0]);
    return [{ id: 1, head_sha: 'aaa', head_branch: 'main' }, { head_sha: 'no id' }, { id: 2 }];
  };
  const runs = failedRuns({ repo: 'o/r', workflow: 'ci.yml', since: '2026-09-04', until: '2026-09-08', gh });
  assert.deepEqual(runs, [{ id: 1, head_sha: 'aaa', head_branch: 'main' }], 'a run without an id or a sha is no run');
  assert.match(asked[0], /workflows\/ci\.yml\/runs\?status=failure&created=2026-09-04\.\.2026-09-08/);

  failedRuns({ repo: 'o/r', workflow: 'ci.yml', since: '2026-09-04', gh });
  assert.match(asked[1], /created=%3E%3D2026-09-04/, 'an open window is >=DATE');
});

test('the window start is a plain date, days back from now', () => {
  assert.equal(windowStart(7, new Date('2026-09-10T02:00:00Z')), '2026-09-03');
  assert.equal(windowStart(0, new Date('2026-09-10T02:00:00Z')), '2026-09-10');
});
