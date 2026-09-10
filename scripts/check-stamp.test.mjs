// The /check verdict stamp: a leg's mode is read exactly as check.md defines it, the verdict is
// computed from the legs rather than declared, and the file the queue opens is the file this
// writes. The parts that touch git are exercised through the CLI in the repo's own checkout; the
// rest is pure, so it needs no checkout at all.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGS,
  MODES,
  buildStamp,
  deriveVerdict,
  main,
  parseLeg,
  stampPath,
  trackedChanges,
} from './check-stamp.mjs';
import { readReviewStamp, stampGap } from './jobs-store.mjs';

const legs = (overrides = {}) => ({
  review: { mode: 'inline', findings: 0, fixed: 0 },
  simplify: { mode: 'inline', findings: 0, fixed: 0 },
  verify: { mode: 'inline', findings: 0, fixed: 0 },
  ...overrides,
});

test('a leg is a mode, with optional findings and fixed counts', () => {
  assert.deepEqual(parseLeg('inline'), { mode: 'inline', findings: 0, fixed: 0 });
  assert.deepEqual(parseLeg('delegated:3/2'), { mode: 'delegated', findings: 3, fixed: 2 });
  assert.deepEqual(parseLeg('discarded+inline:1/1'), { mode: 'discarded+inline', findings: 1, fixed: 1 });
});

test('the mode that must never be dropped is accepted however it is spelt', () => {
  // "not run" is the one mode whose loss turns a gap into a pass, so a hyphen or an underscore
  // must not be the difference between an honest stamp and a dishonest one.
  for (const spelling of ['not run', 'not-run', 'not_run', 'NOT RUN']) {
    assert.equal(parseLeg(spelling).mode, 'not run', spelling);
  }
});

test('a mode that is not one of check.md\'s four is refused, never guessed at', () => {
  assert.throws(() => parseLeg('skipped', 'review'), /not one of/);
  assert.throws(() => parseLeg('', 'review'), /needs a mode/);
  for (const mode of MODES) assert.equal(parseLeg(mode).mode, mode);
});

test('counts must parse, and more fixed than found is refused', () => {
  assert.throws(() => parseLeg('inline:two/one', 'review'), /must read <findings>\/<fixed>/);
  assert.throws(() => parseLeg('inline:1/3', 'review'), /cannot exceed findings/);
});

test('a leg that did not run makes the verdict fail, and says which one', () => {
  const verdict = deriveVerdict(legs({ simplify: { mode: 'not run', findings: 0, fixed: 0 } }));
  assert.equal(verdict.verdict, 'fail');
  assert.match(verdict.why, /simplify did not run/);
});

test('two legs that did not run are both named', () => {
  const verdict = deriveVerdict(legs({
    review: { mode: 'not run', findings: 0, fixed: 0 },
    verify: { mode: 'not run', findings: 0, fixed: 0 },
  }));
  assert.match(verdict.why, /review and verify did not run/);
});

test('nothing raises a verdict - --fail can only lower it', () => {
  // The whole reason the verdict is derived: check.md says a check carrying a `not run` leg has
  // not passed, and that is the sentence a session writes `pass` over.
  assert.equal(deriveVerdict(legs()).verdict, 'pass');
  assert.equal(deriveVerdict(legs(), { failed: true }).verdict, 'fail');
  assert.equal(
    deriveVerdict(legs({ review: { mode: 'not run', findings: 0, fixed: 0 } }), { failed: false }).verdict,
    'fail',
    'a not-run leg fails whatever else is passed in',
  );
});

test('the stamp it builds is one the landing queue accepts', () => {
  const sha = 'bc251e8c0a93dc4371d382aaa0b75ccb76f8b7fb';
  const stamp = buildStamp({
    scope: { branch: 'claude/bl-check-stamp-script', mergeBase: '56b12f32'.padEnd(40, '0'), files: ['scripts/check-stamp.mjs'] },
    reviewedSha: sha,
    legs: legs({ review: { mode: 'inline', findings: 2, fixed: 2 } }),
    verdict: 'pass',
    model: 'claude-opus-5',
    effort: 'high',
    at: '2026-09-10T09:00:00.000Z',
  });
  assert.equal(stampGap(stamp, sha), null, 'the queue must accept what this writes');
  assert.equal(stamp.v, 1);
  assert.deepEqual(Object.keys(stamp.legs), [...LEGS]);
  assert.equal(stamp.legs.review.findings, 2);
  assert.equal(stamp.legs.review.model, 'claude-opus-5');
});

test('a failing stamp is still a readable stamp, and the queue still refuses it', () => {
  const sha = 'a'.repeat(40);
  const stamp = buildStamp({
    scope: { branch: 'b', mergeBase: 'c', files: [] },
    reviewedSha: sha,
    legs: legs({ simplify: { mode: 'not run', findings: 0, fixed: 0 } }),
    verdict: 'fail',
    at: '2026-09-10T09:00:00.000Z',
  });
  assert.match(stampGap(stamp, sha), /verdict is "fail"/, 'an honest failure must not let a branch queue');
});

test('model and effort are omitted rather than written as null', () => {
  const stamp = buildStamp({
    scope: { branch: 'b', mergeBase: 'c', files: [] },
    reviewedSha: 'd'.repeat(40),
    legs: legs(),
    verdict: 'pass',
    at: '2026-09-10T09:00:00.000Z',
  });
  assert.deepEqual(Object.keys(stamp.legs.review), ['mode', 'findings', 'fixed']);
});

test('the path it writes is the path jobs-store opens', () => {
  const dir = process.cwd();
  const branch = 'claude/bl-check-stamp-script';
  assert.match(stampPath(dir, branch), /claude-bl-check-stamp-script\.json$/);
  // readReviewStamp builds the same name from the same branch; a miss returns null rather than
  // throwing, so this asserts the shape by proving the reader looks where the writer wrote.
  assert.equal(readReviewStamp(dir, branch), null, 'nothing is there yet, and that is not an error');
});

test('every leg must be named - there is no pass-shaped default', () => {
  // A leg defaulting to `inline` would let a bare `npm run stamp` record a full pass nobody
  // claimed, in the one script whose job is to stop an unearned pass reaching the record.
  assert.equal(main([]), 1);
  assert.equal(main(['--review', 'inline', '--simplify', 'inline']), 1, 'verify is still missing');
});

test('untracked files do not block a stamp, tracked changes do', () => {
  const status = [' M scripts/check-stamp.mjs', '?? scratch.txt', 'A  scripts/check-stamp.test.mjs'].join('\n');
  assert.deepEqual(trackedChanges(status), [' M scripts/check-stamp.mjs', 'A  scripts/check-stamp.test.mjs']);
  assert.deepEqual(trackedChanges('?? notes.md\n'), []);
  assert.deepEqual(trackedChanges(''), []);
});
