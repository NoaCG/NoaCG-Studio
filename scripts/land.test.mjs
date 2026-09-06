// The lander's decisions, pinned in both directions: what may land, what counts as reviewed, and
// what counts as a green run. The OS half (git, gh) is exercised by the workflow itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { judgeRun, LAND_LABEL, planPreconditions, REVIEWED_CONTEXT, reviewedGap } from './land.mjs';

const pr = (over = {}) => ({
  number: 7, state: 'OPEN', isDraft: false, baseRefName: 'main', headRefName: 'claude/x',
  headRefOid: '012bb5d1aa00bb11cc22dd33ee44ff5566778899', labels: [{ name: LAND_LABEL }], url: 'https://x/pull/7', ...over,
});

test('an open, non-draft pull request against main carrying the label may land', () => {
  assert.equal(planPreconditions(pr()), null);
});

test('every precondition names itself', () => {
  assert.match(planPreconditions(null), /could not be read/);
  assert.match(planPreconditions(pr({ state: 'MERGED' })), /is merged, not open/);
  assert.match(planPreconditions(pr({ isDraft: true })), /draft/);
  assert.match(planPreconditions(pr({ baseRefName: 'dev' })), /targets dev, not main/);
  assert.match(planPreconditions(pr({ labels: [] })), /does not carry the `land` label/);
  assert.equal(planPreconditions(pr({ labels: [{ name: 'x' }] }), { label: 'x' }), null);
});

test('the reviewed status must exist on the tip and be a success; the newest one counts', () => {
  const sha = pr().headRefOid;
  assert.match(reviewedGap([], sha), /no `noacg\/reviewed` status on 012bb5d1/);
  assert.match(reviewedGap([{ context: 'ci', state: 'success' }], sha), /no `noacg\/reviewed`/);
  assert.equal(reviewedGap([{ context: REVIEWED_CONTEXT, state: 'success' }], sha), null);
  assert.match(reviewedGap([{ context: REVIEWED_CONTEXT, state: 'failure', description: 'red' }], sha), /is "failure": red/);
  assert.equal(reviewedGap([{ context: REVIEWED_CONTEXT, state: 'success' }, { context: REVIEWED_CONTEXT, state: 'failure' }], sha), null, 'statuses come newest first');
});

test('a run is green only when it completed, succeeded, and its CI gate job succeeded', () => {
  const run = { status: 'completed', conclusion: 'success' };
  assert.deepEqual(judgeRun(run, [{ name: 'CI gate', conclusion: 'success' }]), { ok: true, why: null });
  assert.match(judgeRun({ status: 'in_progress' }, []).why, /not completed/);
  assert.match(judgeRun({ status: 'completed', conclusion: 'failure' }, []).why, /concluded "failure"/);
  assert.match(judgeRun(run, [{ name: 'Build', conclusion: 'success' }]).why, /no "CI gate" job/);
  assert.match(judgeRun(run, [{ name: 'CI gate', conclusion: 'skipped' }]).why, /"CI gate" concluded "skipped"/);
  assert.match(judgeRun(null, []).why, /not completed/);
});
