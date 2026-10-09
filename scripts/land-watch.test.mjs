// The watcher's reading of a pull request in the merge queue, pinned in every direction.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ciLogLink, failedLandings, watch, watchVerdict } from './land-watch.mjs';

const open = (over = {}) => ({ state: 'OPEN', mergedAt: null, mergeCommit: null, headRefOid: 'abc', autoMergeRequest: { enabledAt: 'x' }, ...over });

test('an open pull request with auto-merge on, or a queue entry, is waiting; no answer from gh is waiting too', () => {
  assert.deepEqual(watchVerdict(open()), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(open({ autoMergeRequest: null, mergeQueueEntry: { state: 'AWAITING_CHECKS', position: 1 } })), { verdict: 'waiting' }, 'the queue clears the auto-merge request when it takes the pull request');
  assert.deepEqual(watchVerdict(null), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(open({ state: 'MERGED', merged: true, mergeCommit: { oid: 'm9' } })), { verdict: 'landed', sha: 'm9' });
});

test('a merged pull request landed, at its merge commit or its head', () => {
  assert.deepEqual(watchVerdict(open({ state: 'MERGED', mergedAt: 'x', mergeCommit: { oid: 'm1' } })), { verdict: 'landed', sha: 'm1' });
  assert.deepEqual(watchVerdict(open({ state: 'MERGED', mergedAt: 'x' })), { verdict: 'landed', sha: 'abc' });
});

test('a conflicting pull request is a refusal even while its auto-merge request stands', () => {
  const verdict = watchVerdict(open({ mergeable: 'CONFLICTING' }));
  assert.equal(verdict.verdict, 'refused');
  assert.match(verdict.reason, /conflicts with main/);
  assert.deepEqual(watchVerdict(open({ mergeable: 'MERGEABLE' })), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(open({ mergeable: 'UNKNOWN' })), { verdict: 'waiting' }, 'GitHub has not computed it yet');
});

test('a failed gate on the pull request is a refusal while its auto-merge request still stands', () => {
  const red = { name: 'CI gate', status: 'COMPLETED', conclusion: 'FAILURE' };
  const shard = { name: 'E2E 3/9 (subset)', status: 'COMPLETED', conclusion: 'FAILURE' };
  const verdict = watchVerdict(open(), [shard, shard, red, red, { name: 'Build', status: 'COMPLETED', conclusion: 'SUCCESS' }]);
  assert.equal(verdict.verdict, 'refused');
  assert.equal(verdict.reason, 'CI gate failed on the pull request (also red: E2E 3/9 (subset)), so the queue never took it');
  // A run still going (queued, running, or re-run after it failed) is not a verdict yet.
  assert.deepEqual(watchVerdict(open(), [red, { name: 'CI gate', status: 'IN_PROGRESS', conclusion: '' }]), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(open(), [red, { name: 'CI gate', status: 'QUEUED', conclusion: null }]), { verdict: 'waiting' });
  // GitHub reads the most recently updated run of a name: a red run superseded by a green one is
  // not a verdict, and a red run that came last is (#609, below), a tie counting as red.
  const at = (check, startedAt, completedAt) => ({ ...check, startedAt, completedAt });
  const green = { name: 'CI gate', status: 'COMPLETED', conclusion: 'SUCCESS' };
  assert.deepEqual(watchVerdict(open(), [at(red, '2026-10-01T22:21:51Z', '2026-10-01T22:21:58Z'), at(green, '2026-10-01T22:21:54Z', '2026-10-01T22:21:59Z')]), { verdict: 'waiting' });
  assert.equal(watchVerdict(open(), [at(green, '2026-10-01T22:21:51Z', '2026-10-01T22:21:58Z'), at(red, '2026-10-01T22:21:54Z', '2026-10-01T22:21:59Z')]).verdict, 'refused');
  assert.equal(watchVerdict(open(), [at(green, 'T1', 'T2'), at(red, 'T1', 'T2')]).verdict, 'refused');
  // Any check the landing ruleset requires, not the gate alone; a non-required red check is not one.
  const reviewed = { name: 'Reviewed', status: 'COMPLETED', conclusion: 'FAILURE' };
  assert.equal(watchVerdict(open(), [reviewed, green]).reason, 'Reviewed failed on the pull request, so the queue never took it');
  assert.deepEqual(watchVerdict(open(), [reviewed, { ...green, status: 'IN_PROGRESS', conclusion: null }]), { verdict: 'waiting' }, 'one required check still running is not yet the verdict');
  // One run's gate is red while the other run's shards still work towards a gate it has not
  // created yet: that run is still going, so it is not a verdict. A pending check in a workflow
  // that reports no required check does not hold the verdict back.
  const ci = (check) => ({ ...check, workflowName: 'CI' });
  assert.deepEqual(watchVerdict(open(), [ci(red), ci({ name: 'E2E 2/4 (subset)', status: 'IN_PROGRESS', conclusion: null })]), { verdict: 'waiting' });
  assert.equal(watchVerdict(open(), [ci(red), { name: 'Pages', workflowName: 'Docs', status: 'IN_PROGRESS', conclusion: null }]).verdict, 'refused');
  assert.equal(watchVerdict(open(), [{ ...red, conclusion: 'STARTUP_FAILURE' }]).verdict, 'refused', 'a run that never started blocks the check too');
  assert.deepEqual(watchVerdict(open(), [shard, green]), { verdict: 'waiting' });
  // A red shard with no gate verdict yet is still waiting, and so is a gate nobody has reported.
  assert.deepEqual(watchVerdict(open(), [shard]), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(open(), []), { verdict: 'waiting' });
  // Inside the queue the pull request's own checks are history; the merge group decides.
  assert.deepEqual(watchVerdict(open({ mergeQueueEntry: { state: 'AWAITING_CHECKS', position: 1 } }), [red]), { verdict: 'waiting' });
});

// PR #609 as the watcher read it through the night of 2026-10-01: auto-merge on, mergeable, not in
// the queue, head 61f4d565, and the rollup below - both runs of ci.yml on that head (push and
// pull_request), first attempts only, from the commit's check runs (`filter=all`). The push run's
// `E2E 3/4` failed, so its `CI gate` went red at 22:21:59, one second after the pull_request run's
// went green. GitHub kept the pull request out of the queue until the push run was re-run at 05:38;
// the watcher (j-2830, then j-2845) read "waiting in the merge queue" for its full hour, twice.
const NIGHT_609 = [
  ['E2E plan', 'SUCCESS', '22:11:50', '22:12:11'],
  ['Factory gates', 'SUCCESS', '22:11:48', '22:13:13'],
  ['Build', 'SUCCESS', '22:11:48', '22:15:33'],
  ['Reviewed', 'SKIPPED', '22:11:46', '22:11:46'],
  ['Vercel accepted the commit', 'SKIPPED', '22:11:46', '22:11:46'],
  ['Build', 'SUCCESS', '22:11:55', '22:14:56'],
  ['E2E plan', 'SUCCESS', '22:11:55', '22:12:06'],
  ['Reviewed', 'SUCCESS', '22:11:55', '22:12:06'],
  ['Factory gates', 'SUCCESS', '22:11:55', '22:12:41'],
  ['Vercel accepted the commit', 'SKIPPED', '22:11:52', '22:11:51'],
  ['E2E 1/4 (subset)', 'SUCCESS', '22:12:08', '22:18:01'],
  ['E2E 3/4 (subset)', 'SUCCESS', '22:12:08', '22:19:30'],
  ['E2E 4/4 (subset)', 'SUCCESS', '22:12:08', '22:21:49'],
  ['Catalog calibration gate', 'SUCCESS', '22:12:08', '22:17:06'],
  ['E2E 2/4 (subset)', 'SUCCESS', '22:12:08', '22:20:12'],
  ['Catalog calibration gate', 'SUCCESS', '22:12:14', '22:17:01'],
  ['E2E 2/4 (subset)', 'SUCCESS', '22:12:16', '22:20:54'],
  ['E2E 4/4 (subset)', 'SUCCESS', '22:12:14', '22:21:51'],
  ['E2E 1/4 (subset)', 'SUCCESS', '22:12:14', '22:17:17'],
  ['E2E 3/4 (subset)', 'FAILURE', '22:12:13', '22:18:11'],
  ['Re-run (failed Build or Factory job, same commit)', 'SKIPPED', '22:14:57', '22:14:56'],
  ['Re-run (failed Build or Factory job, same commit)', 'SKIPPED', '22:15:33', '22:15:33'],
  ['Combined E2E report', 'SUCCESS', '22:21:51', '22:22:06'],
  ['CI gate', 'SUCCESS', '22:21:51', '22:21:58'],
  ['E2E retry (failed specs, same commit)', 'SKIPPED', '22:21:49', '22:21:49'],
  ['Combined E2E report', 'SUCCESS', '22:21:54', '22:22:09'],
  ['CI gate', 'FAILURE', '22:21:54', '22:21:59'],
  ['E2E retry (failed specs, same commit)', 'SKIPPED', '22:21:52', '22:21:51'],
  ['After the gate', 'SKIPPED', '22:21:59', '22:21:59'],
  ['After the gate', 'SKIPPED', '22:22:00', '22:22:00'],
].map(([name, conclusion, startedAt, completedAt]) => ({
  __typename: 'CheckRun', name, workflowName: 'CI', status: 'COMPLETED', conclusion,
  startedAt: `2026-10-01T${startedAt}Z`, completedAt: `2026-10-01T${completedAt}Z`,
})).concat([
  { __typename: 'CheckRun', name: 'Vercel Preview Comments', workflowName: '', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-01T22:11:56Z', completedAt: '2026-10-01T22:11:56Z' },
  { __typename: 'StatusContext', context: 'Vercel', state: 'SUCCESS', startedAt: '2026-10-01T22:11:54Z' },
  { __typename: 'StatusContext', context: 'noacg/reviewed', state: 'SUCCESS', startedAt: '2026-10-01T22:11:50Z' },
]);
const PR_609 = { state: 'OPEN', merged: false, mergeable: 'MERGEABLE', url: 'https://github.com/NoaCG/NoaCG-Studio/pull/609', headRefOid: '61f4d56553a0bb46dfc5553a0de566478024dfa4', mergeCommit: null, autoMergeRequest: { enabledAt: '2026-10-01T22:11:58Z' }, mergeQueueEntry: null };

test('#609: a required check whose newest run is red is a refusal, though an older run of it passed', () => {
  assert.deepEqual(
    watchVerdict(PR_609, NIGHT_609, { expectSha: PR_609.headRefOid }),
    { verdict: 'refused', reason: 'CI gate failed on the pull request (also red: E2E 3/4 (subset)), so the queue never took it' },
  );
  // The same night a few seconds earlier, while the push run's gate was still running, was rightly
  // waiting; and so is the pull request after the owner re-ran that gate at 05:38.
  const pushGate = (over) => NIGHT_609.map((c) => (c.name === 'CI gate' && c.conclusion === 'FAILURE' ? { ...c, ...over } : c));
  assert.deepEqual(watchVerdict(PR_609, pushGate({ status: 'IN_PROGRESS', conclusion: null, completedAt: null })), { verdict: 'waiting' });
  assert.deepEqual(watchVerdict(PR_609, pushGate({ status: 'QUEUED', conclusion: null, startedAt: '2026-10-02T05:38:35Z', completedAt: null })), { verdict: 'waiting' });
  // And in the queue it waits whatever the pull request's own checks say.
  assert.deepEqual(watchVerdict({ ...PR_609, autoMergeRequest: null, mergeQueueEntry: { state: 'AWAITING_CHECKS', position: 1 } }, NIGHT_609), { verdict: 'waiting' });
});

test('#609 replayed through the watcher: refused on the first confirmed tick, within two polls', async () => {
  let clock = 0;
  const waits = [];
  const errors = [];
  const said = console.error;
  console.error = (line) => errors.push(line);
  let code;
  try {
    code = await watch(
      { pr: '609', branch: 'claude/editor-r1-2b-anchor-typography-bf62be', expectSha: PR_609.headRefOid },
      { view: () => PR_609, checks: () => NIGHT_609, mergeGroupRuns: () => [], wait: async (ms) => { waits.push(ms); clock += ms; }, now: () => clock },
    );
  } finally {
    console.error = said;
  }
  assert.equal(code, 1, 'refused, so the landing slot is freed');
  assert.deepEqual(waits, [10_000], 'one confirming read ten seconds after the first, and no poll interval at all');
  assert.match(errors[0], /refused: CI gate failed on the pull request \(also red: E2E 3\/4 \(subset\)\)/);
});

test('auto-merge off without a merge is a refusal, naming the failed checks when there are any', () => {
  const checks = [{ name: 'CI gate', conclusion: 'FAILURE' }, { name: 'Build', conclusion: 'SUCCESS' }, { context: 'noacg/reviewed', state: 'SUCCESS' }];
  assert.deepEqual(watchVerdict(open({ autoMergeRequest: null }), checks), { verdict: 'refused', reason: 'CI gate failed on the pull request' });
  assert.match(watchVerdict(open({ autoMergeRequest: null }), []).reason, /open and no longer queued for auto-merge/);
  assert.match(watchVerdict(open({ state: 'CLOSED', autoMergeRequest: null }), []).reason, /closed and no longer queued/);
});

test('a branch pushed after it was declared finished is refused, and a merge still outranks the pin', () => {
  // The pin is written by `add-merge` as `--expect-sha <tip>`, and it is what `requeue` re-reads to
  // refuse a declaration the branch has moved past. GitHub refuses the same pull request anyway,
  // because `noacg/reviewed` is a required check posted on the exact tip and a commit status cannot
  // follow a new commit - this only says so on the first tick rather than leaving a reader to work
  // out which check went missing and why.
  const moved = watchVerdict(open({ headRefOid: 'def' }), [], { expectSha: 'abc' });
  assert.equal(moved.verdict, 'refused');
  assert.match(moved.reason, /moved after it was declared finished/);
  assert.match(moved.reason, /abc -> def/);

  // The pin holding is not a verdict of its own - the watcher goes on waiting.
  assert.deepEqual(watchVerdict(open(), [], { expectSha: 'abc' }), { verdict: 'waiting' });
  // An unpinned job (queued before the pin was written) is unaffected.
  assert.deepEqual(watchVerdict(open({ headRefOid: 'def' })), { verdict: 'waiting' });
  // WHAT LANDED, LANDED. A merged pull request is answered before the pin, or a landing that raced
  // a push would be reported as a refusal and re-queued.
  assert.equal(
    watchVerdict(open({ state: 'MERGED', mergedAt: 'x', headRefOid: 'def' }), [], { expectSha: 'abc' }).verdict,
    'landed',
  );
});

test('a refusal names where its CI log is: the red job on the pull request, else the failed merge-group run', () => {
  const job = (name, conclusion, url, workflowName = 'CI') => ({ name, workflowName, status: 'COMPLETED', conclusion, detailsUrl: url });
  const checks = [job('CI gate', 'FAILURE', 'https://x/runs/1/job/9'), job('E2E 3/4 (subset)', 'FAILURE', 'https://x/runs/1/job/3'), job('Build', 'SUCCESS', 'https://x/runs/1/job/1')];
  let asked = 0;
  const runs = () => { asked += 1; return []; };
  assert.equal(ciLogLink(checks, 850, runs), 'https://x/runs/1/job/3', 'the leg that went red, not the aggregate');
  assert.equal(ciLogLink([checks[0]], 850, runs), 'https://x/runs/1/job/9');
  assert.equal(ciLogLink([job('E2E 1/4 (subset)', 'CANCELLED', 'https://x/runs/1/job/2'), ...checks], 850, runs), 'https://x/runs/1/job/3', 'the shard that failed, not one fail-fast cancelled');
  assert.equal(asked, 0, 'no gh call while the pull request names its own failure');
  // Dropped from the queue: the pull request's checks are green and the merge group's run is red.
  const group = [
    { headBranch: 'gh-readonly-queue/main/pr-8500-aaa', conclusion: 'failure', url: 'https://x/runs/7' },
    { headBranch: 'gh-readonly-queue/main/pr-850-bbb', conclusion: 'success', url: 'https://x/runs/5' },
    { headBranch: 'gh-readonly-queue/main/pr-850-ddd', conclusion: 'cancelled', url: 'https://x/runs/6' },
    { headBranch: 'gh-readonly-queue/main/pr-850-ccc', conclusion: 'failure', url: 'https://x/runs/4' },
  ];
  assert.equal(ciLogLink([checks[2]], 850, () => group), 'https://x/runs/4');
  assert.equal(ciLogLink([], 851, () => group), null);
});

test('a refused landing writes its CI log line, and `jobs failed` reads it back', async () => {
  const lines = [];
  const said = console.error;
  console.error = (line) => lines.push(line);
  try {
    await watch(
      { pr: '609', branch: 'claude/x', expectSha: PR_609.headRefOid },
      { view: () => PR_609, checks: () => NIGHT_609.map((c) => ({ ...c, detailsUrl: `https://x/${encodeURIComponent(c.name)}` })), mergeGroupRuns: () => [], wait: async () => {}, now: () => 0 },
    );
  } finally {
    console.error = said;
  }
  const log = ['=== j-2 node scripts/land-watch.mjs --pr 609 --branch claude/x', ...lines, ''].join('\n');
  const now = 10 * 60_000;
  const record = (over) => ({ kind: 'merge', branch: 'claude/x', state: 'failed', exitCode: 1, enqueuedAt: 2, finishedAt: now - 60_000, command: 'node scripts/land-watch.mjs --pr 609 --branch claude/x', ...over });
  const jobs = [record({ id: 'j-1', enqueuedAt: 1, finishedAt: now - 120_000, state: 'done', exitCode: 0 }), record({ id: 'j-2' })];
  assert.deepEqual(failedLandings(jobs, { now, logOf: () => log }), [{
    id: 'j-2',
    branch: 'claude/x',
    pr: '609',
    reason: 'CI gate failed on the pull request (also red: E2E 3/4 (subset)), so the queue never took it',
    ciLog: 'https://x/E2E%203%2F4%20(subset)',
  }]);
  // A later landing of the same branch replaces the failure; so does a log that says it landed,
  // whatever the record says; and a day-old failure has been dealt with or reported already.
  assert.deepEqual(failedLandings([...jobs, record({ id: 'j-3', enqueuedAt: 3, state: 'running' })], { now, logOf: () => log }), []);
  assert.deepEqual(failedLandings(jobs, { now, logOf: () => '=== j-2 x\nland-watch: claude/x landed on main as 1234abcd (u)\n' }), []);
  assert.deepEqual(failedLandings(jobs, { now: now + 25 * 60 * 60_000, logOf: () => log }), []);
});
