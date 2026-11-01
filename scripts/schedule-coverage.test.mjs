// The ci13 drills, as controlled fixtures: missed, failed, late and incomplete runs, interacting
// landings, a corrected successor masking an earlier defect, culprit replay and the full-scope
// rollback rule. Every run speaks for the commit it requested (its head sha); none is credited by
// ancestry from a branch or a non-landing commit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CONTRACTS,
  NIGHTLY_JOBS,
  coverageTimeline,
  missedSlots,
  judgedDays,
  landingTimes,
  nextCron,
  oldestUncovered,
  projectedCompletion,
  projectedBreach,
  pushTimes,
  render,
  replayCulprit,
  runVerdict,
  scopeDecision,
  summarize,
} from './schedule-coverage.mjs';

const H = 3_600_000;
const T = (s) => Date.parse(s);

/** The jobs of a complete nightly with `shards` E2E shards, every conclusion `ok` unless overridden. */
function nightlyJobs(shards = 3, overrides = {}) {
  const names = ['Nightly shard plan', ...Array.from({ length: shards }, (_, i) => `Nightly E2E ${i + 1}/${shards}`), 'Catalog calibration tripwire', 'Type floor, overflow sweep and field coverage', 'Combined nightly report', 'Nightly verdict'];
  return names.map((name) => ({ name, conclusion: overrides[name] ?? 'success' }));
}

function run(id, headSha, createdAt, minutes, extra = {}) {
  const jobs = extra.jobs ?? nightlyJobs();
  const failed = jobs.some((j) => j.conclusion === 'failure');
  return { id, headSha, branch: 'main', event: 'schedule', createdAt: T(createdAt), completedAt: T(createdAt) + minutes * 60_000, status: 'completed', conclusion: failed ? 'failure' : 'success', jobs, ...extra };
}

const L = (sha, at) => ({ sha, at: T(at) });

test('runVerdict: complete green, red on any required failure, incomplete on a cancelled, skipped or missing job', () => {
  assert.equal(runVerdict(run(1, 'a', '2026-10-01T05:00:00Z', 20)).verdict, 'green');
  // 2026-10-19: every shard green, the report job's time budget failed - a complete RED run.
  assert.equal(runVerdict(run(2, 'a', '2026-10-01T05:00:00Z', 20, { jobs: nightlyJobs(3, { 'Combined nightly report': 'failure', 'Nightly verdict': 'failure' }) })).verdict, 'red');
  const cancelled = runVerdict(run(3, 'a', '2026-10-01T05:00:00Z', 20, { jobs: nightlyJobs(3, { 'Nightly E2E 2/3': 'cancelled' }) }));
  assert.equal(cancelled.verdict, 'incomplete');
  assert.match(cancelled.reasons.join(), /E2E 2\/3: cancelled/);
  const skipped = runVerdict(run(4, 'a', '2026-10-01T05:00:00Z', 20, { jobs: nightlyJobs(3, { 'Combined nightly report': 'skipped' }) }));
  assert.equal(skipped.verdict, 'incomplete');
  const missingShard = runVerdict(run(5, 'a', '2026-10-01T05:00:00Z', 20, { jobs: nightlyJobs(3).filter((j) => j.name !== 'Nightly E2E 3/3') }));
  assert.deepEqual(missingShard.reasons, ['E2E shard 3/3 missing']);
  assert.equal(runVerdict({ status: 'in_progress', jobs: [] }).verdict, 'pending');
  // A dispatch whose jobs never ran (the empty job list) is incomplete for every contract.
  assert.equal(runVerdict({ status: 'completed', conclusion: 'failure', jobs: [] }).verdict, 'incomplete');
});

test('runVerdict per contract: the catalog battery is judged on its own jobs, and a scoped pass is not the whole catalog', () => {
  const redE2E = run(1, 'a', '2026-10-01T05:00:00Z', 20, { jobs: nightlyJobs(3, { 'Nightly E2E 1/3': 'failure', 'Nightly verdict': 'failure' }) });
  const catalog = CONTRACTS['catalog battery (emit, calibration, four sweeps)'];
  assert.equal(runVerdict({ ...redE2E, required: catalog['nightly.yml'] }).verdict, 'green');
  assert.equal(runVerdict(redE2E).verdict, 'red');
  const midday = { status: 'completed', conclusion: 'success', jobs: catalog['catalog-gates.yml'].map((name) => ({ name, conclusion: 'success' })), required: catalog['catalog-gates.yml'] };
  assert.equal(runVerdict({ ...midday, scope: 'full' }).verdict, 'green');
  assert.equal(runVerdict({ ...midday, scope: 'slice lt01' }).verdict, 'incomplete');
  assert.equal(runVerdict({ ...midday, scope: 'none' }).verdict, 'incomplete');
  // engine-floor has one carrier: catalog-gates.yml never runs it.
  assert.deepEqual(Object.keys(CONTRACTS['engine-floor']), ['nightly.yml']);
});

const landings = [L('a1', '2026-10-01T04:00:00Z'), L('a2', '2026-10-01T05:30:00Z'), L('a3', '2026-10-01T22:00:00Z'), L('a4', '2026-10-02T07:00:00Z')];

test('requested-commit identity: a branch run or a commit off the landing line covers nothing', () => {
  const runs = [
    run(10, 'a4', '2026-10-02T08:00:00Z', 20, { branch: 'claude/some-branch' }),
    run(11, 'not-a-landing', '2026-10-02T08:00:00Z', 20),
  ];
  const tl = coverageTimeline({ landings, runs, now: T('2026-10-02T09:00:00Z') });
  assert.equal(tl.landings.filter((l) => l.covered).length, 0);
  assert.equal(summarize(tl).runs.unattributable, 2);
});

test('a green complete run covers its own landing exactly and earlier ones by range', () => {
  const tl = coverageTimeline({ landings, runs: [run(20, 'a2', '2026-10-01T05:40:00Z', 20)], now: T('2026-10-01T12:00:00Z') });
  const [a1, a2, a3] = tl.landings;
  assert.equal(a1.covered, true);
  assert.equal(a1.exact, false);
  assert.equal(a2.exact, true);
  assert.equal(a2.greenDelayMs, 30 * 60_000);
  assert.equal(a3.covered, false);
});

test('drill: late - the next run completes after the deadline, so the landing breaches', () => {
  // a2 lands 05:30, just after that day's nightly (05:20, at a1) was created. The next nightly
  // starts late, at 07:35 the following day, and takes 20 minutes: a2 waits 26h25m.
  const runs = [run(30, 'a1', '2026-10-01T05:20:00Z', 20), run(31, 'a4', '2026-10-02T07:35:00Z', 20)];
  const tl = coverageTimeline({ landings, runs, now: T('2026-10-03T00:00:00Z') });
  const a2 = tl.landings[1];
  assert.equal(a2.breach, true);
  assert.equal(a2.greenDelayMs, 26 * H + 25 * 60_000);
  assert.equal(tl.landings[0].breach, false);
  assert.equal(summarize(tl).breaches, 1); // a3 and a4 waited under 10h; every breach is counted, not a percentile
});

test('drill: failed - a red run detects but does not clear; the landing waits for green', () => {
  const runs = [
    run(40, 'a2', '2026-10-01T06:00:00Z', 20, { jobs: nightlyJobs(3, { 'Nightly E2E 1/3': 'failure', 'Nightly verdict': 'failure' }) }),
    run(41, 'a4', '2026-10-02T08:00:00Z', 20),
  ];
  const tl = coverageTimeline({ landings, runs, now: T('2026-10-03T00:00:00Z') });
  const a1 = tl.landings[0];
  assert.equal(a1.firstVerdict, 'red');
  assert.equal(a1.anyDelayMs, 2 * H + 20 * 60_000);
  assert.equal(a1.greenRun, 41);
  assert.equal(a1.breach, true);
});

test('drill: incomplete - a cancelled shard covers nothing, and the rollback rule names the run', () => {
  const runs = [run(50, 'a2', '2026-10-01T06:00:00Z', 20, { jobs: nightlyJobs(3, { 'Nightly E2E 3/3': 'cancelled' }) })];
  const now = T('2026-10-01T12:00:00Z');
  const tl = coverageTimeline({ landings, runs, now });
  assert.equal(tl.landings[0].covered, false);
  const decision = scopeDecision({ timeline: tl, now });
  assert.equal(decision.scope, 'full');
  assert.match(decision.reasons.join(), /incomplete nightly run\(s\): 50/);
});

test('drill: missed - a day with no scheduled run is named; a dispatch does not fill the slot', () => {
  const runs = [run(60, 'a1', '2026-10-01T05:00:00Z', 20), run(61, 'a4', '2026-10-02T21:00:00Z', 20, { event: 'workflow_dispatch' }), run(62, 'a4', '2026-10-03T04:50:00Z', 20)];
  assert.deepEqual(missedSlots(runs, ['2026-10-01', '2026-10-02', '2026-10-03']), ['2026-10-02']);
  const now = T('2026-10-04T00:00:00Z');
  const tl = coverageTimeline({ landings, runs, now });
  assert.equal(scopeDecision({ timeline: tl, now, missed: ['2026-10-02'] }).scope, 'full');
});

test('drill: oldest uncovered landing and the repair-margin projection', () => {
  const history = [run(70, 'a1', '2026-10-01T05:00:00Z', 20)]; // 4h40m start delay, 20 minutes long
  const now = T('2026-10-01T22:30:00Z');
  const tl = coverageTimeline({ landings, runs: history, now });
  const oldest = oldestUncovered(tl, now);
  assert.equal(oldest.sha, 'a2');
  assert.equal(oldest.remainingMs, 7 * H);
  // Next cron 2026-10-02T00:20 + 4h40m + 20m = 05:20, before a2's deadline 05:30: inside the bound.
  const p = projectedBreach(tl, now);
  assert.equal(p.projection.at, T('2026-10-02T05:20:00Z'));
  assert.equal(p.breach, false);
  // One later, slower night in the history moves the projection past the deadline: alarm.
  const slower = coverageTimeline({ landings, runs: [...history, run(71, 'not-a-landing', '2026-09-30T05:20:00Z', 20)], now });
  assert.equal(projectedBreach(slower, now).breach, true);
  assert.match(render(slower, now), /PROJECTED BREACH/);
  // With nothing to project from there is no margin to claim.
  assert.equal(projectedBreach(coverageTimeline({ landings, runs: [], now }), now).breach, true);
  // Before the day's run exists: the pending slot, not tomorrow's (2026-10-02T03:00, slot 00:20).
  const early = coverageTimeline({ landings, runs: history, now: T('2026-10-02T03:00:00Z') });
  const pe = projectedBreach(early, T('2026-10-02T03:00:00Z'));
  assert.equal(pe.projection.at, T('2026-10-02T05:20:00Z'));
  assert.equal(pe.projection.from, 'the slot not yet started');
  // A scheduled run already going that contains the oldest landing: its start plus the worst duration.
  const going = { ...run(72, 'a3', '2026-10-02T04:00:00Z', 0), status: 'in_progress', conclusion: null };
  const dispatched = { ...going, id: 73, event: 'workflow_dispatch' };
  assert.equal(projectedBreach(coverageTimeline({ landings, runs: [...history, dispatched], now: T('2026-10-02T04:05:00Z') }), T('2026-10-02T04:05:00Z')).projection.from, 'run 73, already going');
  const g = projectedBreach(coverageTimeline({ landings, runs: [...history, going], now: T('2026-10-02T04:05:00Z') }), T('2026-10-02T04:05:00Z'));
  assert.equal(g.projection.at, T('2026-10-02T04:20:00Z'));
  // One going at a1 does not contain a2, the oldest uncovered, so the next slot is the one.
  const goingEarly = { ...going, headSha: 'a1' };
  const ge = projectedBreach(coverageTimeline({ landings, runs: [...history, goingEarly], now: T('2026-10-02T04:05:00Z') }), T('2026-10-02T04:05:00Z'));
  assert.equal(ge.projection.from, 'the next slot');
  assert.equal(nextCron(T('2026-10-01T00:19:00Z')), T('2026-10-01T00:20:00Z'));
  assert.equal(nextCron(T('2026-10-01T00:20:00Z')), T('2026-10-02T00:20:00Z'));
});

test('drill: culprit replay by exact commit, with a corrected successor and an interaction', () => {
  // Range of a red nightly: r1..r4. Replayed at each exact commit: r2 introduces the defect, r3
  // still fails, r4 corrects it. A green nightly at r4 would have hidden r2 - it is masked.
  const verdicts = { r1: 'pass', r2: 'fail', r3: 'fail', r4: 'pass' };
  const replay = replayCulprit(['r1', 'r2', 'r3', 'r4'], (s) => verdicts[s], (s) => (s === 'r2' ? 'pass' : undefined));
  assert.equal(replay.culprit, 'r2');
  assert.deepEqual(replay.masked, [{ culprit: 'r2', correctedBy: 'r4', interaction: true }]);
  assert.equal(replay.resolved, true);
  // Two independent defects in one range are both attributed.
  const two = replayCulprit(['x1', 'x2', 'x3', 'x4'], (s) => ({ x1: 'fail', x2: 'pass', x3: 'fail', x4: 'fail' })[s]);
  assert.deepEqual(two.defects.map((d) => d.culprit), ['x1', 'x3']);
  // An unreplayed commit before a failure leaves the attribution open, never guessed.
  const gap = replayCulprit(['y1', 'y2', 'y3'], (s) => ({ y1: 'pass', y3: 'fail' })[s]);
  assert.equal(gap.culprit, null);
  assert.deepEqual(gap.unresolved, ['y2', 'y3']);
  assert.equal(gap.resolved, false);
});

test('drill: full-scope rollback - any open condition means full scope; a clean window is eligible', () => {
  const clean = coverageTimeline({ landings: landings.slice(0, 2), runs: [run(80, 'a2', '2026-10-01T06:00:00Z', 20)], now: T('2026-10-01T12:00:00Z') });
  // The history for the projection is the same run; its 5h40m delay still lands before the next deadline.
  assert.deepEqual(scopeDecision({ timeline: clean, now: T('2026-10-01T12:00:00Z') }), { scope: 'scoped-eligible', reasons: [] });
  const unresolved = replayCulprit(['y1', 'y2'], () => undefined);
  const withReplay = scopeDecision({ timeline: clean, now: T('2026-10-01T12:00:00Z'), replays: [unresolved] });
  assert.equal(withReplay.scope, 'full');
  assert.match(withReplay.reasons.join(), /culprit replay unresolved/);
  const late = coverageTimeline({ landings, runs: [run(81, 'a1', '2026-10-01T05:00:00Z', 20)], now: T('2026-10-03T00:00:00Z') });
  const decision = scopeDecision({ timeline: late, now: T('2026-10-03T00:00:00Z') });
  assert.equal(decision.scope, 'full');
  assert.match(decision.reasons.join(), /waited more than 24h/);
});

test('review fixes: a re-run attempt, a queued run, a failed plan and the push-time pager', () => {
  // A red night re-run hours later: its duration is from the attempt's start, not the creation.
  const rerun = { ...run(90, 'a1', '2026-10-01T05:00:00Z', 0), startedAt: T('2026-10-01T09:00:00Z'), completedAt: T('2026-10-01T09:20:00Z') };
  const p = projectedBreach(coverageTimeline({ landings, runs: [rerun], now: T('2026-10-01T22:30:00Z') }), T('2026-10-01T22:30:00Z'));
  assert.equal(p.projection.durationMs, 20 * 60_000);
  // A dispatch queued behind a run in progress starts when that one is projected to end.
  const history = [run(91, 'a1', '2026-10-01T05:00:00Z', 20)];
  const ahead = { ...run(92, 'a2', '2026-10-02T04:00:00Z', 0), status: 'in_progress', conclusion: null };
  const queued = { ...run(93, 'a3', '2026-10-02T04:05:00Z', 0), status: 'queued', conclusion: null, event: 'workflow_dispatch' };
  const now = T('2026-10-02T04:06:00Z');
  const q = projectedBreach(coverageTimeline({ landings, runs: [...history, ahead, queued], now }), now);
  assert.equal(q.sha, 'a2');
  assert.equal(q.projection.from, 'run 92, already going');
  const q3 = projectedCompletion(coverageTimeline({ landings, runs: [...history, ahead, queued], now }), now, 2);
  assert.equal(q3.from, 'run 93, already queued');
  assert.equal(q3.at, T('2026-10-02T04:40:00Z'));
  // A run going that started after it was created counts from its start, and an overdue one is
  // projected no earlier than now (Codex, PR #1930).
  const late = { ...ahead, startedAt: T('2026-10-02T04:25:00Z') };
  assert.equal(projectedCompletion(coverageTimeline({ landings, runs: [...history, late], now }), now, 1).at, T('2026-10-02T04:45:00Z'));
  const overdueNow = T('2026-10-02T05:00:00Z');
  assert.equal(projectedCompletion(coverageTimeline({ landings, runs: [...history, ahead], now: overdueNow }), overdueNow, 1).at, overdueNow);
  // A failed plan skips every shard (their names never expand): incomplete, but a detection.
  const jobs = [{ name: 'Nightly shard plan', conclusion: 'failure' }, { name: 'Nightly E2E ${{ matrix.shardIndex }}/${{ matrix.shardTotal }}', conclusion: 'skipped' }, ...nightlyJobs(1).slice(2)];
  const failedPlan = run(94, 'a2', '2026-10-01T06:00:00Z', 5, { jobs });
  const v = runVerdict(failedPlan);
  assert.equal(v.verdict, 'incomplete');
  assert.equal(v.detected, true);
  const tl = coverageTimeline({ landings, runs: [failedPlan], now: T('2026-10-01T12:00:00Z') });
  assert.equal(tl.landings[0].firstVerdictRun, 94);
  assert.equal(tl.landings[0].covered, false);
  // The activity pager: follows the after-cursor, keeps the first (newest) time per sha, stops past the window.
  const pages = [
    'HTTP/2.0 200 OK\r\nLink: <https://api.github.com/repositories/1/activity?per_page=100&after=CUR1>; rel="next"\r\n\r\n[{"after":"s2","timestamp":"2026-10-02T00:10:00Z"},{"after":"s1","timestamp":"2026-10-01T00:10:00Z"}]',
    'HTTP/2.0 200 OK\r\n\r\n[{"after":"s0","timestamp":"2026-09-20T00:00:00Z"}]',
  ];
  const calls = [];
  const times = pushTimes('o/r', T('2026-09-25T00:00:00Z'), (args) => (calls.push(args[2]), pages[calls.length - 1]));
  assert.equal(times.get('s1'), T('2026-10-01T00:10:00Z'));
  assert.equal(times.get('s0'), T('2026-09-20T00:00:00Z'));
  assert.match(calls[1], /&after=CUR1$/);
  assert.equal(calls.length, 2);
  // Two merge commits in one push: the first lands at the push that listed the second.
  const lt = landingTimes([{ sha: 'c1', committedAt: 1 }, { sha: 'c2', committedAt: 2 }, { sha: 'c3', committedAt: 3 }, { sha: 'c4', committedAt: 4 }], new Map([['c2', 20], ['c3', 30]]));
  assert.deepEqual(lt.map((l) => [l.sha, l.at, l.source]), [['c1', 20, 'later push'], ['c2', 20, 'push'], ['c3', 30, 'push'], ['c4', 4, 'commit']]);
  // Only slots a full day old are judged for a miss.
  assert.deepEqual(judgedDays(T('2026-10-01T00:00:00Z'), T('2026-10-03T00:10:00Z')), ['2026-10-01']);
});

test('every job name this report reads is a job name in its workflow, so a rename cannot go quiet', () => {
  const names = (wf) => [...readFileSync(new URL(`../.github/workflows/${wf}`, import.meta.url), 'utf8').matchAll(/^ {4}name: (.+)$/gm)].map((m) => m[1].trim());
  const check = (wf, prefixes) => {
    const declared = names(wf);
    for (const prefix of prefixes) assert.ok(declared.some((n) => n.startsWith(prefix.trimEnd())), `${wf} has no job named "${prefix.trim()}..."`);
  };
  check('nightly.yml', NIGHTLY_JOBS);
  for (const carriers of Object.values(CONTRACTS)) for (const [wf, prefixes] of Object.entries(carriers)) check(wf, prefixes);
});
