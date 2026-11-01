// guards: scripts/growth-controls.mjs, scripts/growth-report.mjs, scripts/growth-ceilings.json, scripts/e2e-capacity.mjs, docs/work-specs/cicd-improvement/evidence/phase-ci01.md
// D7 growth controls (docs/work-specs/cicd-improvement/spec.md D7, AC-9; phase ci18). Each test
// names the acceptance line it proves: (a) tiers and envelope, (b) per-tier refusal, estimates,
// evidence, freshness and exceptions, (c) indirect slowdown, (d) clocks and ages, (e) ownership,
// correction, growth stop and admission.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { HARD_SHARE, MAIN_RUNNERS, WARN_SHARE, applyOfflineStop, assess, knownCoversOnDisk, offlineExceptionChanges, parseExceptions } from './e2e-capacity.mjs';
import {
  TIERS, admit, ageAlarms, applySlowdown, assessTiers, carryBreaches, costBreaches, cronRunsPerDay, detectSlowdown,
  ceilingsRevision, coverCosts, coverJobs, evidenceOf, exceptionProblems, exceptionStatus, knownCovers, ledgerChanges, phasesFromLedger, phaseClock, pooledTiming, prClock, priceAdditions, queueClock, sustained,
  tableFreshness, tierOfCover, tierOfJob, workflowShape,
} from './growth-controls.mjs';
import { AGE_ISSUE, ages, buildReport, carriedDues, carriedStarts, fetchLatest, findIssue, finishedPrs, listRuns, makeReader, phaseIssueTitle, priceRuns, readJobs, sampleJobs, seriesOf, spread } from './growth-report.mjs';

const CEILINGS = JSON.parse(readFileSync(new URL('./growth-ceilings.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const TODAY = '2026-10-31';

/** A complete, fresh measurement at the given per-landing costs (per day at 50% of ceiling). */
function measurement(perLanding, { evidence = 'complete', windowEnd = '2026-10-30' } = {}) {
  return { windowEnd, landings: 120, tiers: Object.fromEntries(TIERS.map((t) => [t, { perLanding: perLanding[t] ?? CEILINGS.tiers[t].perLanding * 0.5, perDay: CEILINGS.tiers[t].perDay * 0.5, evidence }])) };
}
const backendItem = (perLanding) => ({ tier: 'backend', id: 'spec:e2e/configured/new.spec.ts', perLanding, perDay: 0, how: 'test' });
const noExceptions = { ...CEILINGS, exceptions: [] };

// --- (a) ------------------------------------------------------------------------------------

test('(a) the tiers are ci01 version 1, unchanged, and their allocation fits the envelope', () => {
  assert.equal(CEILINGS.version, 1);
  assert.deepEqual(CEILINGS.tiers, { offline: { perLanding: 535, perDay: 215 }, backend: { perLanding: 117, perDay: 78 }, graphics: { perLanding: 10, perDay: 115 }, overhead: { perLanding: 105, perDay: 10 } });
  assert.equal(CEILINGS.envelopeRunnerMinutesPerDay, 28800);
  const perLanding = TIERS.reduce((a, t) => a + CEILINGS.tiers[t].perLanding, 0);
  const perDay = TIERS.reduce((a, t) => a + CEILINGS.tiers[t].perDay, 0);
  assert.equal(perLanding, 767);
  assert.equal(perDay, 418);
  assert.ok(perLanding * 17.4 + perDay <= CEILINGS.envelopeRunnerMinutesPerDay, 'the reference workload fits');
  // The offline line keeps its own constants: the per-landing tier never replaces or raises it.
  assert.equal(MAIN_RUNNERS, 13);
  assert.equal(WARN_SHARE, 0.85);
  assert.equal(HARD_SHARE, 0.95);
  assert.equal(CEILINGS.warnShare, WARN_SHARE);
  assert.equal(CEILINGS.refuseShare, HARD_SHARE);
});

test('(a) every job counts once, in one tier, by workflow and job name', () => {
  assert.equal(tierOfJob('ci.yml', 'E2E 3/15 (subset)'), 'offline');
  assert.equal(tierOfJob('ci.yml', 'Configured E2E 2/4 (selected, local Supabase)'), 'backend');
  assert.equal(tierOfJob('configured-suite.yml', 'anything'), 'backend');
  assert.equal(tierOfJob('ci.yml', 'Catalog calibration gate'), 'graphics');
  assert.equal(tierOfJob('nightly.yml', 'Type floor, overflow sweep and field coverage'), 'graphics');
  assert.equal(tierOfJob('ci.yml', 'Build'), 'overhead');
  assert.equal(tierOfJob('codeql', 'Analyze (javascript)'), 'overhead');
});

test('(a) the aggregate is a weekly report line, never a per-PR refusal', () => {
  // Every tier at 90%: the sum is high, but no tier's own line is crossed and nothing is added.
  const m = measurement(Object.fromEntries(TIERS.map((t) => [t, CEILINGS.tiers[t].perLanding * 0.9])));
  const r = assessTiers({ ceilings: noExceptions, measurement: m, items: [], today: TODAY });
  assert.equal(r.status, 'warn');
  assert.ok(!('aggregate' in r), 'the per-PR assessment has no aggregate verdict');
});

// --- (b) ------------------------------------------------------------------------------------

test('(b) each tier warns at 85% and refuses ADDITIVE growth at 95%; no addition is never refused', () => {
  const at = (share, items) => assessTiers({ ceilings: noExceptions, measurement: measurement({ backend: 117 * share }), items, today: TODAY }).tiers.backend.status;
  assert.equal(at(0.5, [backendItem(5)]), 'ok');
  assert.equal(at(0.86, []), 'warn');
  assert.equal(at(0.86, [backendItem(1)]), 'warn');
  assert.equal(at(0.94, [backendItem(2)]), 'refuse', '0.94 + 2/117 crosses 95%');
  assert.equal(at(1.3, []), 'warn', 'a measured overrun alone does not refuse a change that adds nothing');
});

test('(b) no cross-tier offset: a cheap tier never lends headroom to a refused one', () => {
  const m = measurement({ offline: 100, backend: 112 });
  const r = assessTiers({ ceilings: noExceptions, measurement: m, items: [backendItem(3), { tier: 'offline', id: 'x', perLanding: -50, perDay: 0 }], today: TODAY });
  assert.equal(r.tiers.backend.status, 'refuse');
  assert.equal(r.tiers.offline.status, 'ok');
  assert.equal(r.status, 'refuse');
});

test('(b) a new case is priced conservatively, with the setup it brings', () => {
  const e = CEILINGS.estimates;
  const [backend, catalog] = priceAdditions({ added: ['e2e/configured/new.spec.ts', 'e2e/catalog/new.spec.ts', 'e2e/plain.spec.ts', 'src/x.ts'], estimates: e });
  const setup = e.backendStackSetupMinutes * (e.backendCaseMinutes / e.backendStackQuantumMinutes);
  assert.ok(setup > 0);
  assert.ok(Math.abs(backend.perLanding - e.runsPerLanding.backend * (e.backendCaseMinutes + setup)) < 1e-9);
  assert.ok(e.backendCaseMinutes >= 2.6, 'never below the slowest measured configured spec (2.6, p90 1.47)');
  assert.equal(catalog.tier, 'graphics');
  assert.ok(Math.abs(catalog.perLanding - e.runsPerLanding.graphics * e.graphicsCaseMinutes) < 1e-9);
});

test('(b) a new workflow job is priced per run it joins, and a scheduled one per cron firing', () => {
  const base = 'on:\n  pull_request:\n  merge_group:\n  push:\njobs:\n  build:\n    name: Build\n';
  const head = `${base}  lint:\n    name: Lint again\n`;
  const sched = "on:\n  schedule:\n    - cron: '0 */6 * * *'\njobs:\n  sweep:\n    name: Fit sweep extra\n";
  const items = priceAdditions({ workflows: { 'ci.yml': { base, head }, 'fit-sweep.yml': { base: '', head: sched } }, estimates: CEILINGS.estimates });
  const lint = items.find((i) => i.id === 'job:ci.yml/Lint again');
  assert.equal(lint.tier, 'overhead');
  assert.ok(Math.abs(lint.perLanding - CEILINGS.estimates.runsPerLanding.everyRun * CEILINGS.estimates.newJobMinutes) < 1e-9);
  const sweep = items.find((i) => i.id === 'job:fit-sweep.yml/Fit sweep extra');
  assert.equal(sweep.tier, 'graphics');
  assert.equal(sweep.perLanding, 0);
  assert.ok(Math.abs(sweep.perDay - 4 * CEILINGS.estimates.newJobMinutesByTier.graphics) < 1e-9, 'a graphics job at the slowest measured graphics job');
  assert.equal(cronRunsPerDay('0 6 * * 1'), 1 / 7);
  assert.equal(cronRunsPerDay('43 5,11,17,23 * * *'), 4);
  assert.deepEqual(workflowShape(head).jobs, ['build', 'lint']);
  const postLand = priceAdditions({ workflows: { 'post-land.yml': { base: 'on:\n  push:\njobs:\n  a:\n    name: A\n', head: 'on:\n  push:\njobs:\n  a:\n    name: A\n  b:\n    name: B\n' } }, estimates: CEILINGS.estimates });
  assert.equal(postLand[0].perLanding, CEILINGS.estimates.newJobMinutes, 'a push-only job runs once per landing');
});

test('(b) missing evidence refuses added cost; stale or partial evidence refuses it from the 85% line', () => {
  const run = (m) => assessTiers({ ceilings: noExceptions, measurement: m, items: [backendItem(2)], today: TODAY }).tiers.backend;
  const missing = clone(measurement({ backend: 50 })); delete missing.tiers.backend;
  assert.equal(run(missing).status, 'refuse');
  assert.equal(run(null).status, 'refuse');
  assert.equal(run(measurement({ backend: 100 })).status, 'warn', '87.2% with complete evidence is warned, not refused');
  assert.equal(run(measurement({ backend: 100 }, { evidence: 'partial' })).status, 'refuse');
  assert.equal(run(measurement({ backend: 100 }, { windowEnd: '2026-10-20' })).status, 'refuse');
  assert.equal(run(measurement({ backend: 50 }, { windowEnd: '2026-10-20' })).status, 'warn', 'stale but far from the line: added, warned');
  assert.equal(evidenceOf(measurement({}, { windowEnd: '2026-10-23' }), 'backend', TODAY, 8).state, 'complete');
  assert.equal(evidenceOf(measurement({}, { windowEnd: '2026-10-22' }), 'backend', TODAY, 8).state, 'stale');
});

test('(b) the durations table alarms past eight days, and an open refresh PR is not a refresh', () => {
  assert.equal(tableFreshness({ recordedAt: '2026-10-23', today: TODAY, boundDays: 8 }).stale, false);
  const stale = tableFreshness({ recordedAt: '2026-10-19', today: TODAY, boundDays: 8, pending: [{ number: 1503, recordedAt: '2026-10-26' }] });
  assert.equal(stale.stale, true);
  assert.match(stale.reason, /pending, not accepted: #1503/);
  assert.equal(tableFreshness({ recordedAt: undefined, today: TODAY, boundDays: 8 }).stale, true, 'no date is stale, not fresh');
  // The offline line: a stale table refuses added minutes from 85% instead of 95%.
  const minutes = Object.fromEntries([...Array(100).keys()].map((i) => [`s${i}.spec.ts`, 1.8]));
  const table = { source: {}, minutes, overhead: { jobMinutes: 0.42, testFactor: 1.01, medianJobMinutes: 0.3, samples: 10 } };
  const suite = [...Object.keys(minutes), 'new.spec.ts'].sort();
  const args = { table, suite, changed: ['e2e/new.spec.ts'], today: TODAY };
  assert.equal(assess(args).status, 'warn');
  assert.equal(assess({ ...args, tableStale: true }).status, 'refuse');
});

test('(b) an exception is owned, reviewed, scoped and at most 30 days; expired or invalid ones cover nothing', () => {
  const ex = { id: 'a', tier: 'backend', covers: ['spec:e2e/configured/new.spec.ts'], perLanding: 10, owner: 'me', reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1', from: '2026-10-25', expires: '2026-11-20' };
  const m = measurement({ backend: 110 });
  const run = (exceptions, today = TODAY) => assessTiers({ ceilings: { ...CEILINGS, exceptions }, measurement: m, items: [backendItem(8)], today }).tiers.backend;
  assert.equal(run([ex]).status, 'warn', 'the exception excepts 10 of the measured cost and covers the new spec: warned, not refused');
  assert.equal(run([ex], '2026-11-21').status, 'refuse', 'expiry restores refusal');
  assert.equal(run([{ ...ex, expires: '2026-11-30' }]).status, 'refuse', 'a 36-day exception is invalid');
  assert.equal(run([{ ...ex, owner: '' }]).status, 'refuse');
  assert.equal(run([{ ...ex, reviewed: '' }]).status, 'refuse');
});

test('(b) a later exception in a tier is never renewed without a measured repayment, whatever it is called', () => {
  const first = { id: 'a', tier: 'graphics', covers: ['job:ci.yml/Catalog calibration gate'], perLanding: 17.7, owner: 'o', reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1', from: '2026-10-31', expires: '2026-11-30' };
  const renamed = { ...first, id: 'b-new-name', from: '2026-12-01', expires: '2026-12-30' };
  const st = exceptionStatus([first, renamed], '2026-12-02', 30);
  assert.deepEqual(st.invalid.map((e) => e.id), ['b-new-name']);
  assert.match(st.invalid[0].problems.join(), /is not the first graphics exception \(a came before\) and has no measured repayment receipt/);
  const repaid = { ...renamed, repaid: { perLanding: 6.1, runs: ['41300000001'], measuredAt: '2026-11-29' } };
  assert.deepEqual(exceptionStatus([first, repaid], '2026-12-02', 30).active.map((e) => e.id), ['b-new-name']);
  const noRuns = { ...renamed, repaid: { perLanding: 6.1, runs: [], measuredAt: '2026-11-29' } };
  assert.equal(exceptionStatus([first, noRuns], '2026-12-02', 30).invalid.length, 1, 'a repayment is measured: it names runs');
});

test('(b) the ledger is append-only and the ceilings move only by a reviewed revision', () => {
  const base = clone(CEILINGS);
  assert.deepEqual(ledgerChanges({ base, head: clone(base) }), []);
  const removed = clone(base); removed.exceptions = [];
  assert.match(ledgerChanges({ base, head: removed }).join(), /removed: the ledger is append-only/);
  const edited = clone(base); edited.exceptions[0].expires = '2026-12-31';
  assert.match(ledgerChanges({ base, head: edited }).join(), /edited/);
  const raised = clone(base); raised.tiers.backend.perLanding = 150;
  assert.match(ledgerChanges({ base, head: raised }).join(), /without a new version/);
  const cheaper = clone(base); cheaper.estimates.backendCaseMinutes = 0.1;
  assert.equal(ledgerChanges({ base, head: cheaper }).length, 1, 'estimates cannot be quietly lowered either');
  const revised = clone(raised); revised.version = 2; revised.revisions = [{ version: 2, rationale: 'measured', authority: 'owner', reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1842#issuecomment-2' }];
  assert.deepEqual(ledgerChanges({ base, head: revised }), []);
  assert.match(ledgerChanges({ base, head: clone(base), mainRunners: { base: 13, head: 15 } }).join(), /MAIN_RUNNERS rose/);
  assert.match(ledgerChanges({ base, head: clone(base), shardCap: { base: 20, head: 25 } }).join(), /SHARD_CAP_MINUTES rose/);
});

test('(b) the ci04 catalog-gate exception holds to 2026-11-30, then its cost counts and growth is refused', () => {
  const seed = CEILINGS.measurement;
  const added = [{ tier: 'graphics', id: 'spec:e2e/catalog/x.spec.ts', perLanding: 0.5, perDay: 0 }];
  const held = assessTiers({ ceilings: CEILINGS, measurement: { ...seed, windowEnd: '2026-11-28' }, items: [], today: '2026-11-29' });
  assert.ok(held.tiers.graphics.share < 0.85, 'held as the exception, not as headroom');
  const after = assessTiers({ ceilings: CEILINGS, measurement: { ...seed, windowEnd: '2026-11-30' }, items: added, today: '2026-12-01' });
  assert.equal(after.tiers.graphics.status, 'refuse');
  assert.deepEqual(costBreaches(after).map((b) => b.key), ['cost:graphics']);
  assert.equal(CEILINGS.exceptions[0].repayment, '#1862');
});

test('(b) offline exception lines stay on record and a later offline line needs a dated, measured repayment', () => {
  const md = (lines) => `## Budget exceptions\n\n${lines.join('\n')}\n`;
  const old = parseExceptions(md(['- e2e/sports.spec.ts: 1.1 min, protects the match clock, expires 2026-11-16'])).map((e) => ({ ...e, from: 'docs/work-specs/a/spec.md' }));
  assert.match(offlineExceptionChanges(old, [], { today: '2026-11-20' }).join(), /removed or moved/);
  const renew = parseExceptions(md(['- e2e/sports.spec.ts: 1.1 min, protects the clock again, expires 2026-12-10'])).map((e) => ({ ...e, from: 'docs/work-specs/b/spec.md' }));
  assert.match(offlineExceptionChanges(old, [...old, ...renew], { today: '2026-11-20' }).join(), /is not the first offline exception and has no measured repayment receipt dated between 2026-11-16/);
  const repaid = parseExceptions(md(['- e2e/sports.spec.ts: 1.1 min, protects the clock again, repaid 0.6 min in run 41300000002 on 2026-11-17, expires 2026-12-10'])).map((e) => ({ ...e, from: 'docs/work-specs/b/spec.md' }));
  assert.deepEqual(repaid[0].repaid, { minutes: 0.6, runs: ['41300000002'], measuredAt: '2026-11-17' });
  assert.equal(repaid[0].protects, 'protects the clock again');
  assert.deepEqual(offlineExceptionChanges(old, [...old, ...repaid], { today: '2026-11-20' }), []);
  const undated = parseExceptions(md(['- e2e/sports.spec.ts: 1.1 min, protects the clock again, repaid 0.6 min in run 41300000002, expires 2026-12-10'])).map((e) => ({ ...e, from: 'docs/work-specs/b/spec.md' }));
  assert.match(offlineExceptionChanges(old, [...old, ...undated], { today: '2026-11-20' }).join(), /no measured repayment receipt/, 'a receipt without a date cannot be checked');
});

// --- (c) ------------------------------------------------------------------------------------

const point = (i, value, complete = true) => ({ sha: `sha${String(i).padStart(2, '0')}`, at: `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00Z`, complete, value });

test('(c) an indirect slowdown of unchanged tests is found in complete post-landing evidence and attributed to a landing range', () => {
  const series = [10, 10.2, 9.9, 10.1, 13, 12.8, 13.1, 13.2].map((v, i) => point(i, v));
  series.splice(4, 0, { ...point(99, 2), complete: false }); // a cancelled run: never read as fast
  const s = detectSlowdown(series);
  assert.equal(s.found, true);
  assert.deepEqual(s.range, { after: 'sha03', through: 'sha04' });
  assert.ok(s.ratio > 1.25 && s.ratio < 1.35);
});

test('(c) one slow run is noise, not a slowdown', () => {
  const s = detectSlowdown([10, 10.1, 9.9, 15, 10, 10.2, 9.8].map((v, i) => point(i, v)));
  assert.equal(s.found, false);
});

test('(c) the attributed slowdown raises the estimate, never the ceiling, and refuses the NEXT additive change', () => {
  const before = measurement({ backend: 95 });
  const item = [backendItem(10)];
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: before, items: item, today: TODAY }).tiers.backend.status, 'warn');
  const s = detectSlowdown([20, 20, 20, 24, 24, 24].map((v, i) => point(i, v)));
  const after = applySlowdown(before, 'backend', s);
  assert.equal(after.tiers.backend.perLanding, 95 * 1.2);
  assert.equal(noExceptions.tiers.backend.perLanding, 117, 'ceilings stay fixed');
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: after, items: item, today: TODAY }).tiers.backend.status, 'refuse');
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: after, items: [], today: TODAY }).tiers.backend.status, 'warn', 'a change that adds nothing still lands');
});

test('(c) a PR\'s own run never refuses it for an unchanged spec that ran slow there', () => {
  const minutes = Object.fromEntries([...Array(100).keys()].map((i) => [`s${i}.spec.ts`, 1.9]));
  const table = { source: {}, minutes, overhead: { jobMinutes: 0.42, testFactor: 1.01, medianJobMinutes: 0.3, samples: 10 } };
  const suite = Object.keys(minutes).sort();
  const quiet = assess({ table, suite, changed: ['e2e/s1.spec.ts'], today: TODAY });
  const noisy = assess({ table, suite, changed: ['e2e/s1.spec.ts'], measured: { 's1.spec.ts': 1.9, 's2.spec.ts': 40 }, today: TODAY });
  assert.equal(noisy.status, quiet.status);
  assert.equal(noisy.after, quiet.after, 'the unchanged s2 is read from the table, not from this run');
});

// --- (d) ------------------------------------------------------------------------------------

test('(d) the PR clock starts at the first all-green worker receipt and never resets on repairs or requeues', () => {
  const now = '2026-10-31T12:00:00Z';
  const receipts = [
    { at: '2026-10-31T10:30:00Z', head: 'b', gatesGreen: true }, // after a repair, new head
    { at: '2026-10-31T09:00:00Z', head: 'a', gatesGreen: false },
    { at: '2026-10-31T10:00:00Z', head: 'a', gatesGreen: true },
  ];
  const c = prClock({ receipts, stamps: [{ at: '2026-10-31T10:10:00Z' }], now });
  assert.equal(c.start, '2026-10-31T10:00:00Z');
  assert.equal(c.source, 'receipt');
  assert.equal(c.minutes, 120);
  const stamp = prClock({ stamps: [{ at: '2026-10-31T11:00:00Z' }, { at: '2026-10-31T08:00:00Z' }], openedAt: '2026-10-31T09:00:00Z', now });
  assert.equal(stamp.start, '2026-10-31T09:00:00Z', 'a stamp before the PR opened is clipped, never counted backwards');
  assert.equal(stamp.source, 'stamp');
  const unknown = prClock({ now });
  assert.equal(unknown.source, 'unknown');
  assert.equal(unknown.minutes, null, 'unknown, never zero');
  const closed = prClock({ stamps: [{ at: '2026-10-31T08:00:00Z' }], closedAt: '2026-10-31T09:00:00Z', now });
  assert.equal(closed.state, 'abandoned');
  assert.equal(closed.minutes, 60, 'closed unmerged is kept with its age, not dropped');
});

test('(d) the phase clock keeps failed, repaired and cancelled work, and the queue clock its first entry', () => {
  const now = '2026-10-31T20:00:00Z';
  const events = [{ type: 'build', at: '2026-10-31T06:00:00Z' }, { type: 'fail', at: '2026-10-31T09:00:00Z' }, { type: 'build', at: '2026-10-31T10:00:00Z' }];
  assert.equal(phaseClock({ events, now }).hours, 14);
  assert.equal(phaseClock({ events: [...events, { type: 'pass', at: '2026-10-31T12:00:00Z' }], now }).hours, 6);
  const cancelled = phaseClock({ events: [...events, { type: 'cancelled', at: '2026-10-31T11:00:00Z' }], now });
  assert.equal(cancelled.state, 'abandoned');
  assert.equal(cancelled.hours, 5);
  const q = queueClock({ queued: ['2026-10-31T19:00:00Z', '2026-10-31T18:00:00Z'], now });
  assert.equal(q.minutes, 120, 'a requeue does not restart the queue clock');
});

test('(d) ONE overdue item gets an owned, dated action, with no sample minimum', () => {
  const now = '2026-10-31T12:00:00Z';
  const items = [
    { id: '#1', category: 'prReady', clock: { state: 'unfinished', source: 'stamp', start: '2026-10-31T09:00:00Z', minutes: 180 } },
    { id: '#2', category: 'prReady', clock: { state: 'unfinished', source: 'stamp', start: '2026-10-31T11:00:00Z', minutes: 60 } },
    { id: '#3', category: 'prReady', clock: { state: 'finished', source: 'stamp', start: '2026-10-30T00:00:00Z', minutes: 900 } },
    { id: '#4', category: 'prReady', clock: { state: 'unfinished', source: 'unknown', start: null, minutes: null } },
    { id: 'ci07', category: 'phase', clock: { state: 'unfinished', source: 'ledger', start: '2026-10-30T20:00:00Z', hours: 16 } },
  ];
  const actions = ageAlarms(items, CEILINGS, now, 'coordinator');
  assert.deepEqual(actions.map((a) => a.key), ['age:#1', 'age:ci07']);
  assert.equal(actions[0].owner, 'coordinator');
  assert.equal(actions[0].due, '2026-11-01');
});

test('(d) pooled timing needs 12 samples ACROSS categories and keeps every category in the report', () => {
  const now = '2026-10-31T00:00:00Z';
  const mk = (category, value, n) => [...Array(n)].map((_, i) => ({ category, value, finishedAt: `2026-10-${String(20 + (i % 10)).padStart(2, '0')}T00:00:00Z` }));
  const twelve = [...mk('backend', 70, 5), ...mk('frontend', 70, 4), ...mk('docs', 70, 3)];
  const t = pooledTiming(twelve, 'prReady', CEILINGS, now);
  assert.equal(t.pooled.n, 12);
  assert.equal(t.adequate, true, 'no category has 12, the pool does');
  assert.equal(t.above, true);
  assert.deepEqual(Object.keys(t.categories).sort(), ['backend', 'docs', 'frontend']);
  const eleven = pooledTiming(twelve.slice(1), 'prReady', CEILINGS, now);
  assert.equal(eleven.adequate, false);
  assert.equal(eleven.above, false, 'low volume is descriptive');
  assert.equal(sustained(eleven, t), false);
  assert.equal(sustained(t, t), true, 'two adequate weeks above in a row');
  const old = pooledTiming(mk('x', 70, 12).map((s) => ({ ...s, finishedAt: '2026-09-01T00:00:00Z' })), 'prReady', CEILINGS, now);
  assert.equal(old.pooled.n, 0, 'outside the 28-day window');
});

test('(d) future merge-time data never gates its own PR', () => {
  // The per-PR verdict takes no timing input: last week's report reaches it only as a stop on a
  // breach that already survived its correction, never as this PR's own clock.
  const args = { ceilings: noExceptions, measurement: measurement({ backend: 60 }), items: [backendItem(5)], today: TODAY };
  const plain = assessTiers(args);
  const withTiming = assessTiers({ ...args, timing: [{ measure: 'prReady', above: true, adequate: true }] });
  assert.deepEqual(withTiming, plain);
  assert.equal(plain.status, 'ok');
});

// --- (e) ------------------------------------------------------------------------------------

test('(e) a breach gets an owner, a dated correction, then a growth stop if one correction did not fix it', () => {
  const w1 = carryBreaches({ current: [{ key: 'cost:backend', detail: 'x' }], today: '2026-11-02', owner: 'coordinator' });
  assert.equal(w1.breaches[0].state, 'correcting');
  assert.equal(w1.breaches[0].owner, 'coordinator');
  assert.equal(w1.breaches[0].due, '2026-11-09');
  assert.deepEqual(w1.stops, {});
  const w2 = carryBreaches({ previous: w1.breaches, current: [{ key: 'cost:backend', detail: 'x' }], today: '2026-11-09', owner: 'coordinator' });
  assert.equal(w2.breaches[0].state, 'stopped');
  assert.equal(w2.breaches[0].corrections, 1, 'one bounded correction, not a second');
  assert.deepEqual(Object.keys(w2.stops), ['backend']);
  const w3 = carryBreaches({ previous: w2.breaches, current: [], today: '2026-11-16', owner: 'coordinator' });
  assert.deepEqual(w3.cleared, ['cost:backend']);
  assert.deepEqual(w3.stops, {}, 'back in bounds, growth resumes');
  const lat = carryBreaches({ previous: [{ key: 'latency:queue', since: '2026-11-02', due: '2026-11-09', owner: 'o', corrections: 1, state: 'correcting' }], current: [{ key: 'latency:queue' }], today: '2026-11-09' });
  assert.deepEqual(Object.keys(lat.stops).sort(), ['backend', 'graphics', 'offline', 'overhead']);
  const age = carryBreaches({ previous: [{ key: 'age:#9', since: '2026-11-02', due: '2026-11-03', owner: 'o', corrections: 1, state: 'correcting' }], current: [{ key: 'age:#9' }], today: '2026-11-03' });
  assert.equal(age.breaches[0].state, 'stopped');
  assert.deepEqual(age.stops, {}, 'an item-level age breach escalates but stops no tier');
});

test('(e) a growth stop refuses additive growth in the affected tier and lets maintenance through', () => {
  const args = { ceilings: noExceptions, measurement: measurement({ backend: 40 }), today: TODAY, stops: { backend: 'cost:backend since 2026-11-02' } };
  assert.equal(assessTiers({ ...args, items: [backendItem(1)] }).tiers.backend.status, 'refuse');
  assert.equal(assessTiers({ ...args, items: [] }).tiers.backend.status, 'warn');
  assert.equal(assessTiers({ ...args, items: [{ ...backendItem(1), tier: 'graphics' }] }).tiers.graphics.status, 'ok', 'other tiers unaffected');
});

/** A small Actions week: four landings, PR, merge-group and scheduled runs, one stratum unsampled. */
function fixtureRuns() {
  const job = (name, min, status = 'completed') => ({ name, status, started_at: '2026-10-30T00:00:00Z', completed_at: new Date(Date.parse('2026-10-30T00:00:00Z') + min * 60_000).toISOString() });
  const ciJobs = (shard, configured) => [job('Build', 6), job('E2E 1/2 (full)', shard), job('E2E 2/2 (full)', shard), job('Catalog calibration gate', 2), job('Configured E2E 1/1 (selected, local Supabase)', configured)];
  const runs = [];
  for (let i = 0; i < 4; i++) runs.push({ id: i, workflow: 'ci.yml', event: 'push', branch: 'main', sha: `m${i}`, created: `2026-10-2${4 + i}T00:00:00Z`, conclusion: 'success', jobs: ciJobs(10, 0) });
  for (let i = 0; i < 8; i++) runs.push({ id: 10 + i, workflow: 'ci.yml', event: 'pull_request', branch: 'f', sha: `p${i}`, created: '2026-10-25T00:00:00Z', conclusion: i % 2 ? 'cancelled' : 'success', jobs: i < 4 ? ciJobs(5, 12) : null });
  runs.push({ id: 30, workflow: 'configured-suite.yml', event: 'push', branch: 'main', sha: 'm0', created: '2026-10-24T00:00:00Z', conclusion: 'success', jobs: [job('Configured 1/4', 12), job('Configured 2/4', 12)] });
  runs.push({ id: 40, workflow: 'nightly.yml', event: 'schedule', branch: 'main', sha: 'm1', created: '2026-10-25T03:00:00Z', conclusion: 'failure', jobs: [job('Nightly E2E 1/2', 70)] });
  return runs;
}

test('(e) the weekly report prices tiers per landing and per day, scaling each stratum and counting failed and cancelled runs', () => {
  const p = priceRuns(fixtureRuns(), { days: 7 });
  assert.equal(p.landings, 4);
  // PR stratum: 4 of 8 sampled at 6+10+2+12 = 30 each, scaled to 8 runs.
  assert.equal(p.tiers.backend.totalLanding, 8 * 12 + 24);
  assert.equal(p.tiers.offline.perDay, 10);
  assert.equal(p.tiers.offline.evidence, 'complete');
  const unsampled = priceRuns([...fixtureRuns(), { id: 50, workflow: 'hosted-latency.yml', event: 'schedule', branch: 'main', sha: 'x', created: '2026-10-26T00:00:00Z', conclusion: 'success', jobs: null }], { days: 7 });
  assert.equal(unsampled.tiers.backend.evidence, 'partial', 'an unsampled stratum is partial, never zero');
  assert.deepEqual(spread(10, 3), [0, 5, 9]);
});

test('(e) the weekly report owns missing reports, overdue refreshes, exception expiry and cost breaches with dated actions', () => {
  const ceilings = clone(CEILINGS);
  ceilings.tiers.overhead.perLanding = 10; // a fixture ceiling the fixture week breaches
  const previous = { generatedAt: '2026-11-10T06:00:00Z', breaches: [], stops: {}, timing: [] };
  const { report, markdown } = buildReport({ ceilings, runs: fixtureRuns(), days: 7, windowEnd: '2026-11-24T00:00:00Z', now: '2026-11-24T06:00:00Z', previous, tableRecordedAt: '2026-11-01', pending: [{ number: 1503 }], collection: 'fixture' });
  const keys = report.breaches.map((b) => b.key).sort();
  assert.deepEqual(keys, ['cost:overhead', 'exception:ci04-catalog-gate', 'report:missing', 'table:stale']);
  for (const b of report.breaches) { assert.ok(b.owner); assert.match(b.due, /^\d{4}-\d{2}-\d{2}$/); }
  assert.equal(report.breaches.find((b) => b.key === 'exception:ci04-catalog-gate').due, '2026-11-30');
  assert.match(markdown, /Aggregate \(a report line, not a gate\)/);
  assert.match(markdown, /pending, not accepted: #1503/);
  assert.match(markdown, /EXPIRES WITHIN A WEEK/);
  // A week later the overhead breach is still there: growth there stops.
  const next = buildReport({ ceilings, runs: fixtureRuns(), days: 7, windowEnd: '2026-12-01T00:00:00Z', now: '2026-12-01T06:00:00Z', previous: report, tableRecordedAt: '2026-11-30', collection: 'fixture' });
  assert.equal(next.report.stops.overhead !== undefined, true);
  assert.equal(next.report.breaches.find((b) => b.key === 'cost:overhead').state, 'stopped');
});

test('(e) admission: a backend test, a graphics fixture and a critical journey name contract, layer, overlap, cost and owner', () => {
  const tiers = assessTiers({ ceilings: noExceptions, measurement: measurement({ backend: 60, graphics: 5, offline: 300 }), items: [], today: TODAY });
  const backendTest = {
    case: 'e2e/configured/panel-lease.spec.ts: a second panel cannot take a held lease',
    tier: 'backend', layer: 'backend', needs: 'concurrency',
    contract: 'one writer holds a panel lease; a second writer is refused until it is released',
    failure: 'two operators both believe they control the same graphic',
    overlap: 'panel-lease.spec.ts proves the single-writer lease, not contention between two',
    whyNotCheaper: 'the refusal is a database row lock under row-level security; a Node fake would prove the fake',
    cadence: 'selected on lease changes, full per landing', owner: 'production-page owner', costPerLanding: 0.4,
  };
  const graphicsFixture = {
    case: 'e2e/catalog/long-value-containment.spec.ts: a right-to-left long value fixture',
    tier: 'graphics', layer: 'browser', contract: 'a long right-to-left value stays inside its box',
    failure: 'Arabic names overflow the lower third on air', overlap: 'the bench covers left-to-right only',
    whyNotCheaper: 'containment depends on real font shaping and layout, which only a browser measures',
    cadence: 'affected catalog runs only', owner: 'catalog owner', costPerLanding: 0.3,
  };
  const journey = {
    case: 'e2e/dashboard-operator-walk.spec.ts: take the graphic off air at the end of the walk',
    tier: 'offline', layer: 'journey', extends: 'e2e/dashboard-operator-walk.spec.ts',
    contract: 'an operator can take a graphic off air from the dashboard', failure: 'a graphic stays on air with no way off',
    overlap: 'the walk puts a graphic on air but never takes it off', whyNotCheaper: 'the critical journey is the operator path through the real app',
    cadence: 'every run (critical journey)', owner: 'operator flow owner', costPerLanding: 0.2,
  };
  for (const r of [backendTest, graphicsFixture, journey]) assert.deepEqual(admit(r, tiers), { admitted: true, reasons: [] }, r.case);
  assert.match(admit({ ...backendTest, needs: undefined }, tiers).reasons.join(), /persistence, permissions or concurrency/);
  assert.match(admit({ ...journey, extends: undefined }, tiers).reasons.join(), /extends a maintained journey/);
  assert.match(admit({ ...graphicsFixture, whyNotCheaper: '' }, tiers).reasons.join(), /cheaper layer/);
  const full = assessTiers({ ceilings: noExceptions, measurement: measurement({ backend: 116 }), items: [backendItem(1)], today: TODAY });
  assert.equal(admit(backendTest, full).admitted, false, 'admission and the tier gate cannot disagree');
});

test('(d) the age check never reads a failed or partial GitHub read as "nothing overdue"', () => {
  const now = '2026-10-31T12:00:00Z';
  const routes = {
    pulls: [{ number: 7, created_at: '2026-10-31T08:00:00Z', head: { ref: 'f' }, draft: false }],
    commits: [{ sha: 'c1' }, { sha: 'c2' }],
    statuses: [{ context: 'noacg/reviewed', state: 'success', created_at: '2026-10-31T08:30:00Z' }],
    timeline: [],
  };
  const fake = (failStatuses) => (args) => {
    const route = args.at(-1);
    if (/\/pulls\?/.test(route)) return JSON.stringify(routes.pulls);
    if (/\/commits\?/.test(route)) return JSON.stringify(routes.commits);
    if (/\/statuses/.test(route)) { if (failStatuses) throw new Error('502'); return JSON.stringify(routes.statuses); }
    return JSON.stringify(routes.timeline);
  };
  const ok = ages({ ceilings: CEILINGS, now, reader: makeReader(50, fake(false)) });
  assert.equal(ok.actions.length, 1, 'stamped 08:30, 210 minutes ago: over 120');
  assert.match(ok.body, /#7 unfinished for 210 min/);
  const failed = ages({ ceilings: CEILINGS, now, reader: makeReader(50, fake(true)) });
  assert.equal(failed.body, null, 'unknown, so the issue is neither cleared nor closed');
  const starved = ages({ ceilings: CEILINGS, now, reader: makeReader(2, fake(false)) });
  assert.equal(starved.body, null, 'an exhausted budget is a partial read too');
});

test('(b) a renamed spec or job adds nothing; a job on an unpriced trigger is never free', () => {
  const base = 'on:\n  pull_request:\njobs:\n  build:\n    name: Build\n';
  const renamedKey = 'on:\n  pull_request:\njobs:\n  compile:\n    name: Build\n';
  assert.deepEqual(priceAdditions({ workflows: { 'ci.yml': { base, head: renamedKey } }, estimates: CEILINGS.estimates }), []);
  const afterRun = priceAdditions({ workflows: { 'x.yml': { base: '', head: 'on:\n  workflow_run:\n    workflows: [CI]\njobs:\n  a:\n    name: Follow\n' } }, estimates: CEILINGS.estimates });
  assert.equal(afterRun[0].perLanding, CEILINGS.estimates.runsPerLanding.everyRun * CEILINGS.estimates.newJobMinutes);
  const dispatch = priceAdditions({ workflows: { 'y.yml': { base: '', head: 'on:\n  workflow_dispatch:\njobs:\n  a:\n    name: Manual\n' } }, estimates: CEILINGS.estimates });
  assert.equal(dispatch[0].perLanding, CEILINGS.estimates.newJobMinutes, 'unknown frequency is at least once per landing');
  const rerun = priceAdditions({ workflows: { 'z.yml': { base: '', head: "on:\n  schedule:\n    - cron: '0 6 * * 1'\n  workflow_dispatch: {}\njobs:\n  a:\n    name: Weekly\n" } }, estimates: CEILINGS.estimates });
  assert.equal(rerun[0].perLanding, 0, 'a dispatch beside a cron is its manual re-run');
});

test('(b) a more frequent schedule or trigger on an existing job is priced; an unchanged one is not', () => {
  const daily = "on:\n  schedule:\n    - cron: '0 3 * * *'\njobs:\n  sweep:\n    name: Fit sweep\n";
  const hourly = daily.replace("'0 3 * * *'", "'0 * * * *'");
  const [item] = priceAdditions({ workflows: { 'fit-sweep.yml': { base: daily, head: hourly } }, estimates: CEILINGS.estimates });
  assert.equal(item.tier, 'graphics');
  assert.ok(Math.abs(item.perDay - 23 * CEILINGS.estimates.newJobMinutesByTier.graphics) < 1e-9);
  assert.deepEqual(priceAdditions({ workflows: { 'fit-sweep.yml': { base: daily, head: daily } }, estimates: CEILINGS.estimates }), []);
  assert.deepEqual(priceAdditions({ workflows: { 'fit-sweep.yml': { base: hourly, head: daily } }, estimates: CEILINGS.estimates }), [], 'a cheaper schedule adds nothing');
  const pushOnly = 'on:\n  push:\njobs:\n  a:\n    name: Post\n';
  const [wider] = priceAdditions({ workflows: { 'x.yml': { base: pushOnly, head: pushOnly.replace('  push:\n', '  push:\n  pull_request:\n') } }, estimates: CEILINGS.estimates });
  assert.equal(wider.perLanding, CEILINGS.estimates.prRunsPerLanding * CEILINGS.estimates.newJobMinutes);
});

test('(e) partial evidence never clears a breach or its growth stop', () => {
  const stopped = { key: 'cost:backend', since: '2026-11-02', due: '2026-11-09', owner: 'o', corrections: 1, state: 'stopped', detail: 'x' };
  const kept = carryBreaches({ previous: [stopped], current: [], today: '2026-11-16', confirmed: () => false });
  assert.equal(kept.breaches[0].state, 'stopped');
  assert.ok(kept.stops.backend);
  assert.deepEqual(kept.cleared, []);
  // Replayed through the report: the backend stratum went unsampled, so its cost is a lower bound.
  const runs = fixtureRuns().map((r) => (r.workflow === 'configured-suite.yml' ? { ...r, jobs: null } : r));
  const previous = { generatedAt: '2026-11-17T06:00:00Z', breaches: [stopped], stops: { backend: 'x' }, timing: [] };
  const { report } = buildReport({ ceilings: CEILINGS, runs, days: 7, windowEnd: '2026-11-24T00:00:00Z', now: '2026-11-24T06:00:00Z', previous, tableRecordedAt: '2026-11-20', collection: 'fixture' });
  assert.equal(report.measurement.tiers.backend.evidence, 'partial');
  assert.equal(report.measurement.tiers.backend.lowerBound, true);
  assert.ok(report.stops.backend, 'the stop survives an unmeasured week');
});

test('(d) pooled samples carry forward report to report inside the 28-day window', () => {
  const s = (id, finishedAt) => ({ measure: 'prReady', id, category: 'other', value: 20, finishedAt });
  const previous = { generatedAt: '2026-11-17T06:00:00Z', breaches: [], stops: {}, timing: [], timingSamples: [s('#1', '2026-11-10T00:00:00Z'), s('#2', '2026-10-01T00:00:00Z')] };
  const { report } = buildReport({ ceilings: CEILINGS, runs: fixtureRuns(), days: 7, windowEnd: '2026-11-24T00:00:00Z', now: '2026-11-24T06:00:00Z', previous, finished: [s('#3', '2026-11-20T00:00:00Z'), s('#1', '2026-11-10T00:00:00Z')], tableRecordedAt: '2026-11-20', collection: 'fixture' });
  assert.deepEqual(report.timingSamples.map((x) => x.id).sort(), ['#1', '#3'], 'deduplicated, and #2 is past 28 days');
  assert.equal(report.timing.find((t) => t.measure === 'prReady').pooled.n, 2);
});

test('(e) an offline growth stop, or an unreadable weekly report, refuses added offline minutes', () => {
  const stop = applyOfflineStop({ status: 'ok', reasons: [], stops: { offline: 'cost:offline since 2026-11-02' } }, { added: 1.2 });
  assert.equal(stop.status, 'refuse');
  assert.equal(applyOfflineStop({ status: 'ok', reasons: [], stops: { offline: 'x' } }, { added: 0 }).status, 'ok', 'maintenance lands');
  assert.equal(applyOfflineStop({ status: 'warn', reasons: [], stops: {}, unreadable: true }, { added: 0.5 }).status, 'refuse');
  const measured = assessTiers({ ceilings: noExceptions, measurement: measurement({ offline: 300 }), items: [], today: TODAY });
  assert.equal(applyOfflineStop({ status: 'ok', reasons: [], stops: {}, tiers: measured }, { added: 3 }).status, 'ok');
});

test('(e) a breach clears only on a measurement that is complete AND back in bounds', () => {
  const stopped = (key) => ({ key, since: '2026-11-02', due: '2026-11-09', owner: 'o', corrections: 1, state: 'stopped', detail: 'x' });
  const base = { ceilings: CEILINGS, days: 7, windowEnd: '2026-11-24T00:00:00Z', now: '2026-11-24T06:00:00Z', tableRecordedAt: '2026-11-20', collection: 'fixture' };
  // Latency: an adequate pool still above the ceiling is not recovery, though one week cannot re-raise it.
  const slow = [...Array(12)].map((_, i) => ({ measure: 'queue', id: `#${i}`, category: 'other', value: 100, finishedAt: '2026-11-20T00:00:00Z' }));
  const prevLatency = { generatedAt: '2026-11-17T06:00:00Z', breaches: [stopped('latency:queue')], stops: {}, timing: [{ measure: 'queue', adequate: false, above: false }] };
  const still = buildReport({ ...base, runs: fixtureRuns(), previous: prevLatency, finished: slow }).report;
  assert.equal(still.breaches.find((b) => b.key === 'latency:queue')?.state, 'stopped');
  assert.ok(still.stops.offline);
  const fast = slow.map((x) => ({ ...x, value: 5 }));
  const recovered = buildReport({ ...base, runs: fixtureRuns(), previous: prevLatency, finished: fast }).report;
  assert.deepEqual(recovered.cleared, ['latency:queue']);
  // Cost: a run list cut short is partial before anything is judged, so a stop survives it.
  const prevCost = { generatedAt: '2026-11-17T06:00:00Z', breaches: [stopped('cost:backend')], stops: { backend: 'x' }, timing: [] };
  const cut = buildReport({ ...base, runs: fixtureRuns(), previous: prevCost, listComplete: false }).report;
  assert.equal(cut.measurement.tiers.backend.evidence, 'partial');
  assert.ok(cut.stops.backend);
  const whole = buildReport({ ...base, runs: fixtureRuns(), previous: prevCost }).report;
  assert.deepEqual(whole.cleared, ['cost:backend'], 'complete and in bounds: cleared, and growth resumes');
});

test('(e) a long outage is never a first week, and unnamed or thinly read breaches stay', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'growth-test-'));
  const out = path.join(dir, 'out.json');
  const art = (expired, at, id) => ({ name: 'growth-report', expired, created_at: at, workflow_run: { id, head_branch: 'main', repository_id: 10, head_repository_id: 10 } });
  const fake = (artifacts) => (args) => {
    if (args[0] === 'run') { writeFileSync(path.join(args[args.indexOf('-D') + 1], 'growth-report.json'), '{"generatedAt":"x"}'); return ''; }
    return JSON.stringify({ artifacts });
  };
  assert.equal(fetchLatest(out, fake([])), null);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), { none: true }, 'no report ever: the first week');
  assert.throws(() => fetchLatest(path.join(dir, 'gone.json'), fake([art(true, '2026-09-01T00:00:00Z', 1)])), /expired/, 'all expired: an outage, not a first week');
  assert.equal(fetchLatest(out, fake([art(true, '2026-09-01T00:00:00Z', 1), art(false, '2026-11-02T00:00:00Z', 2)])).run, 2);
  // A stopped latency breach survives a week whose merged-PR read was cut short, even with a fast pool.
  const stopped = (key, extra = {}) => ({ key, since: '2026-11-02', due: '2026-11-09', owner: 'o', corrections: 1, state: 'stopped', detail: 'x', ...extra });
  const fast = [...Array(12)].map((_, i) => ({ measure: 'queue', id: `#${i}`, category: 'other', value: 5, finishedAt: '2026-11-20T00:00:00Z' }));
  const base = { ceilings: CEILINGS, runs: fixtureRuns(), days: 7, windowEnd: '2026-11-24T00:00:00Z', now: '2026-11-24T06:00:00Z', tableRecordedAt: '2026-11-20', collection: 'fixture' };
  const previous = { generatedAt: '2026-11-17T06:00:00Z', breaches: [stopped('latency:queue'), stopped('mystery:x'), stopped('age:ci07', { category: 'phase' })], stops: {}, timing: [] };
  const r = buildReport({ ...base, previous, finished: fast, timingComplete: false }).report;
  assert.deepEqual(r.breaches.map((b) => b.key).filter((k) => !k.startsWith('exception:')).sort(), ['age:ci07', 'latency:queue', 'mystery:x'], 'none clears: a cut-short read, an unnamed kind, a phase with no clocks read');
});

test('(d) a draft PR keeps its age clock: turning it into a draft does not clear an alarm', () => {
  const now = '2026-10-31T12:00:00Z';
  const fake = (args) => {
    const route = args.at(-1);
    if (/\/pulls\?/.test(route)) return JSON.stringify([{ number: 8, created_at: '2026-10-31T08:00:00Z', head: { ref: 'f' }, draft: true }]);
    if (/\/commits\?/.test(route)) return JSON.stringify([{ sha: 'c1' }]);
    if (/\/statuses/.test(route)) return JSON.stringify([{ context: 'noacg/reviewed', state: 'success', created_at: '2026-10-31T08:30:00Z' }]);
    return '[]';
  };
  assert.equal(ages({ ceilings: CEILINGS, now, reader: makeReader(20, fake) }).actions.length, 1);
});

test('(b) an exception cannot be re-filed under another tier or a reworded scope to dodge renewal or offset a tier', () => {
  const first = { id: 'a', tier: 'graphics', covers: ['job:ci.yml/Catalog calibration gate'], perLanding: 17.7, owner: 'o', reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1', from: '2026-10-31', expires: '2026-11-30' };
  const known = knownCovers({ 'ci.yml': 'on:\n  pull_request:\njobs:\n  e2e-catalog:\n    name: Catalog calibration gate\n' }, ['e2e/configured/x.spec.ts']);
  const asBackend = { ...first, id: 'b', tier: 'backend', from: '2026-12-01', expires: '2026-12-30' };
  const st = exceptionStatus([first, asBackend], '2026-12-02', 30, known);
  assert.match(st.invalid.find((e) => e.id === 'b').problems.join(), /not in the backend tier/);
  const reworded = { ...first, id: 'c', covers: ['job:ci.yml/Catalog calibration gate (affected)'], from: '2026-12-01', expires: '2026-12-30' };
  assert.match(exceptionStatus([first, reworded], '2026-12-02', 30, known).invalid[0].problems.join(), /names no job or spec/);
  assert.match(exceptionStatus([first, reworded], '2026-12-02', 30, known).invalid[0].problems.join(), /not the first graphics exception/, 'and a later graphics exception needs a receipt, however it is worded');
  // And the offset it would have bought is refused: backend at 116/117 with a +5 addition.
  const r = assessTiers({ ceilings: { ...CEILINGS, exceptions: [first, asBackend] }, measurement: measurement({ backend: 116 }), items: [backendItem(5)], today: '2026-12-02', known });
  assert.equal(r.tiers.backend.status, 'refuse');
  assert.deepEqual(exceptionStatus([first], TODAY, 30, known).active.map((e) => e.id), ['a'], 'the real ci04 scope stays valid');
});

test('(d) the plan-run ledger feeds the phase age alarm: one overdue phase acts at the coordinator check-in', () => {
  const ledger = [
    '- 2026-10-31T06:00:00.000Z phase 7 build ci07 builder',
    '- 2026-10-31T09:00:00.000Z phase 7 fail product: x',
    '- 2026-10-31T09:30:00.000Z phase 7 repair',
    '- 2026-10-31T07:00:00.000Z phase 6 build',
    '- 2026-10-31T10:00:00.000Z phase 6 pass',
    '- 2026-10-30T01:00:00.000Z phase 5 build',
    '- 2026-10-30T02:00:00.000Z phase 5 stop owner',
  ].join('\n');
  const phases = phasesFromLedger(ledger);
  assert.deepEqual(phases.map((p) => p.id).sort(), ['phase 5', 'phase 6', 'phase 7']);
  const fake = (args) => (/\/pulls\?/.test(args.at(-1)) ? '[]' : '[]');
  const r = ages({ ceilings: CEILINGS, now: '2026-10-31T19:00:00Z', reader: makeReader(10, fake), ledger });
  assert.deepEqual(r.actions.map((a) => a.key), ['age:phase 7'], '13 hours since its first build, repairs included; 6 passed; 5 was stopped');
  assert.equal(r.actions[0].category, 'phase');
  assert.match(r.phaseBody, /phase 7 unfinished/);
  assert.equal(r.body, '', 'the PR issue carries no phase');
  // A check after a landing reads no ledger: it leaves the phase issue untouched (undefined), never empty.
  const postLand = ages({ ceilings: CEILINGS, now: '2026-10-31T19:00:00Z', reader: makeReader(10, fake) });
  assert.equal(postLand.phaseBody, undefined);
});

test('(e) a run still unfinished at collection keeps its tier partial, so a stop survives it', () => {
  const runs = [...fixtureRuns(), { id: 99, workflow: 'configured-suite.yml', event: 'push', branch: 'main', sha: 'm9', created: '2026-10-27T00:00:00Z', conclusion: null, status: 'in_progress', jobs: null }];
  assert.equal(priceRuns(runs, { days: 7 }).tiers.backend.evidence, 'partial');
  const stopped = { key: 'cost:backend', since: '2026-11-02', due: '2026-11-09', owner: 'o', corrections: 1, state: 'stopped', detail: 'x' };
  const previous = { generatedAt: '2026-11-17T06:00:00Z', breaches: [stopped], stops: { backend: 'x' }, timing: [] };
  const { report } = buildReport({ ceilings: CEILINGS, runs, days: 7, windowEnd: '2026-11-24T00:00:00Z', now: '2026-11-24T06:00:00Z', previous, tableRecordedAt: '2026-11-20', collection: 'fixture' });
  assert.ok(report.stops.backend);
});

test('(d) a rewritten head never restarts or hides a ready clock', () => {
  const now = '2026-10-31T12:00:00Z';
  const fake = (forcePushed) => (args) => {
    const route = args.at(-1);
    if (/\/pulls\?/.test(route)) return JSON.stringify([{ number: 9, created_at: '2026-10-31T07:00:00Z', head: { ref: 'f' }, draft: false }]);
    if (/\/commits\?/.test(route)) return JSON.stringify([{ sha: 'new' }]);
    if (/\/statuses/.test(route)) return JSON.stringify([{ context: 'noacg/reviewed', state: 'success', created_at: '2026-10-31T11:50:00Z' }]);
    if (/timeline/.test(route)) return JSON.stringify(forcePushed ? [{ event: 'head_ref_force_pushed', created_at: '2026-10-31T11:45:00Z' }] : []);
    return '[]';
  };
  // The 08:00 stamp sat on a commit the force-push dropped: no carried start, so unknown and incomplete.
  assert.equal(ages({ ceilings: CEILINGS, now, reader: makeReader(20, fake(true)) }).body, null);
  // The open alarm issue recorded the 08:00 start: it is kept, and the item stays overdue.
  const carried = carriedStarts('- prReady #9 unfinished for 180 min, over its 120 minutes ceiling (clock from stamp 2026-10-31T08:00:00Z). Owner o; act by 2026-11-01.');
  assert.deepEqual(carried, { '#9': '2026-10-31T08:00:00Z' });
  const r = ages({ ceilings: CEILINGS, now, reader: makeReader(20, fake(true)), carried });
  assert.match(r.body, /#9 unfinished for 240 min/);
});

test('(b) an exception never excepts more than the job it covers, and a spec cover earns no credit', () => {
  const ex = (covers, perLanding, id = 'p') => ({ id, tier: 'graphics', covers, perLanding, owner: 'o', reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1', from: '2026-10-31', expires: '2026-11-20' });
  const item = [{ tier: 'graphics', id: 'spec:e2e/catalog/new.spec.ts', perLanding: 10.7, perDay: 0 }];
  const m = { ...measurement({ graphics: 7.8 }), jobs: { 'ci.yml/Catalog calibration gate': { perLanding: 3, perDay: 0 } } };
  // The probe: claim 50 on an existing spec to buy headroom for a new one.
  const spec = assessTiers({ ceilings: { ...CEILINGS, exceptions: [ex(['spec:e2e/catalog/catalog-bench.spec.ts'], 50)] }, measurement: m, items: item, today: TODAY });
  assert.equal(spec.tiers.graphics.status, 'refuse');
  assert.match(spec.tiers.graphics.why, /claims 50, capped at what it covers/);
  // A job cover is credited only up to the job's measured cost (3 here, not the 50 claimed).
  const job = assessTiers({ ceilings: { ...CEILINGS, exceptions: [ex(['job:ci.yml/Catalog calibration gate'], 50)] }, measurement: m, items: [], today: TODAY });
  assert.match(job.tiers.graphics.why, /^4\.8\/10 per landing/, 'credited 3, the job\'s measured cost, not the 50 claimed');
  // A shard template matches every shard's measured name.
  const shards = { ...m, jobs: { 'ci.yml/Configured E2E 1/2 (selected, local Supabase)': { perLanding: 4, perDay: 0 }, 'ci.yml/Configured E2E 2/2 (selected, local Supabase)': { perLanding: 5, perDay: 0 } } };
  const bx = { ...ex(['job:ci.yml/Configured E2E ${{ matrix.shardIndex }}/${{ matrix.shardTotal }} (selected, local Supabase)'], 20), tier: 'backend' };
  const r = assessTiers({ ceilings: { ...CEILINGS, exceptions: [bx] }, measurement: { ...shards, tiers: { ...shards.tiers, backend: { perLanding: 50, perDay: 0, evidence: 'complete' } } }, items: [], today: TODAY });
  assert.match(r.tiers.backend.why, /^41\/117 per landing/, 'credited 9, the two shards, not the 20 claimed');
});

test('(d) a partial read keeps the unread PRs\' existing alarms and raises the read ones', () => {
  const now = '2026-10-31T12:00:00Z';
  const fake = (args) => {
    const route = args.at(-1);
    if (/\/pulls\?/.test(route)) return JSON.stringify([7, 8].map((n) => ({ number: n, created_at: '2026-10-31T07:00:00Z', head: { ref: 'f' }, draft: false })));
    if (/pulls\/7\/commits/.test(route)) throw new Error('502');
    if (/\/commits\?/.test(route)) return JSON.stringify([{ sha: 'c8' }]);
    if (/\/statuses/.test(route)) return JSON.stringify([{ context: 'noacg/reviewed', state: 'success', created_at: '2026-10-31T08:00:00Z' }]);
    return '[]';
  };
  const existing = 'Owner: o.\n\n- prReady #7 unfinished for 200 min, over its 120 minutes ceiling (clock from stamp 2026-10-31T06:40:00Z). Owner o; act by 2026-11-01.';
  const r = ages({ ceilings: CEILINGS, now, reader: makeReader(20, fake), existing, carried: carriedStarts(existing) });
  assert.match(r.body, /prReady #8 unfinished/);
  assert.match(r.body, /prReady #7 unfinished for 200 min/, 'the unread #7 keeps its line and its start');
});

test('(b) an overlapping second exception in a tier is invalid, so a job is never credited twice', () => {
  const base = { tier: 'graphics', covers: ['job:ci.yml/Catalog calibration gate'], perLanding: 17.7, owner: 'o', reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1' };
  const first = { ...base, id: 'a', from: '2026-11-01', expires: '2026-11-30' };
  const renewal = { ...base, id: 'b', from: '2026-11-20', expires: '2026-12-19', repaid: { perLanding: 2, runs: ['1'], measuredAt: '2026-11-19' } };
  const m = { ...measurement({ graphics: 30 }), jobs: { 'ci.yml/Catalog calibration gate': { perLanding: 17.7, perDay: 0 } } };
  const r = assessTiers({ ceilings: { ...CEILINGS, exceptions: [first, renewal] }, measurement: m, items: [{ tier: 'graphics', id: 'spec:e2e/catalog/x.spec.ts', perLanding: 1, perDay: 0 }], today: '2026-11-25' });
  assert.match(r.tiers.graphics.why, /^12\.3\/10 per landing/);
  assert.equal(r.tiers.graphics.status, 'refuse');
});

test('(c) an attributed offline slowdown refuses the next offline addition at the tier line', () => {
  const before = measurement({ offline: 480 });
  const s = detectSlowdown([20, 20, 20, 22.2, 22.2, 22.2].map((v, i) => point(i, v)));
  const after = applySlowdown(before, 'offline', s);
  assert.ok(Math.abs(after.tiers.offline.perLanding - 532.8) < 1e-9, '480 x 1.11: the ceiling stays 535');
  const grow = (m) => applyOfflineStop({ status: 'ok', reasons: [], stops: {}, tiers: assessTiers({ ceilings: noExceptions, measurement: m, items: [], today: TODAY }) }, { added: 1.5 });
  assert.equal(grow(before).status, 'ok', '90% before the slowdown: the table line decides');
  assert.equal(grow(after).status, 'refuse', '99.6% after it: the next offline spec is refused');
  assert.equal(applyOfflineStop({ status: 'ok', reasons: [], stops: {}, tiers: assessTiers({ ceilings: noExceptions, measurement: after, items: [], today: TODAY }) }, { added: 0 }).status, 'ok', 'maintenance that adds nothing lands');
  const partial = measurement({ offline: 460 }, { evidence: 'partial' });
  assert.equal(grow(partial).status, 'refuse', '86% on partial evidence is past the 85% line');
});

test('(d) each plan\'s phase alarms live in their own issue, and (b) a missing offline measurement refuses offline additions', () => {
  assert.notEqual(phaseIssueTitle('/k/2026-10-31-plan-cicd-improvement.md'), phaseIssueTitle('/k/2026-10-31-plan-jev-svg-import.md'));
  assert.equal(phaseIssueTitle('/k/2026-10-31-plan-jev-svg-import.md'), 'Plan phases past their age ceiling: 2026-10-31-plan-jev-svg-import');
  const missing = clone(measurement({})); delete missing.tiers.offline;
  const tiers = assessTiers({ ceilings: noExceptions, measurement: missing, items: [], today: TODAY });
  assert.equal(applyOfflineStop({ status: 'ok', reasons: [], stops: {}, tiers }, { added: 1 }).status, 'refuse');
  assert.equal(applyOfflineStop({ status: 'ok', reasons: [], stops: {}, tiers }, { added: 0 }).status, 'ok');
});

test('(b) a renewal cannot be put ahead of the exception it renews, and nested specs are priced', () => {
  const base = clone(CEILINGS);
  const prepended = clone(base);
  prepended.exceptions.unshift({ ...base.exceptions[0], id: 'catalog-gate-2', from: '2026-11-29', expires: '2026-12-28' });
  assert.match(ledgerChanges({ base, head: prepended }).join(), /appended after the existing ones/);
  const appended = clone(base);
  appended.exceptions.push({ ...base.exceptions[0], id: 'catalog-gate-2', from: '2026-11-29', expires: '2026-12-28' });
  assert.deepEqual(ledgerChanges({ base, head: appended }), [], 'appending is the route; the renewal itself is then judged invalid without a receipt');
  assert.match(exceptionStatus(appended.exceptions, '2026-12-05', 30).invalid[0].problems.join(), /no measured repayment receipt/);
  const nested = priceAdditions({ added: ['e2e/configured/sub/x.spec.ts', 'e2e/catalog/deep/y.spec.ts'], estimates: CEILINGS.estimates });
  assert.deepEqual(nested.map((i) => i.tier), ['backend', 'graphics']);
});

test('(b) a new spec is priced for the scheduled runs it joins, and nested specs are scopes an exception may name', () => {
  const [backend, catalog] = priceAdditions({ added: ['e2e/configured/x.spec.ts', 'e2e/catalog/y.spec.ts'], estimates: CEILINGS.estimates });
  assert.ok(backend.perDay > 0 && catalog.perDay > 0);
  const m = { ...measurement({ backend: 50 }), tiers: { ...measurement({}).tiers, backend: { perLanding: 50, perDay: 73, evidence: 'complete' } } };
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: m, items: [backend], today: TODAY }).tiers.backend.status, 'refuse', '73/78 a day plus the new spec crosses 95%');
  const known = knownCoversOnDisk(undefined, ['e2e/configured/nested/new.spec.ts']);
  assert.ok(known.has('spec:e2e/configured/nested/new.spec.ts'));
  assert.ok(knownCoversOnDisk().has('job:ci.yml/Catalog calibration gate'));
});

test('(b) renaming the covered job first is no way round a measured repayment, and a reviewed restart ends a reporting outage', () => {
  const ci04 = clone(CEILINGS.exceptions[0]);
  const renamed = { ...ci04, id: 'catalog-gate-2', covers: ['job:ci.yml/Catalog calibration gate (v2)'], from: '2026-11-29', expires: '2026-12-28' };
  const known = knownCovers({ 'ci.yml': 'on:\n  pull_request:\njobs:\n  e2e-catalog:\n    name: Catalog calibration gate (v2)\n' }, []);
  const st = exceptionStatus([ci04, renamed], '2026-12-05', 30, known);
  assert.match(st.invalid.find((e) => e.id === 'catalog-gate-2').problems.join(), /not the first graphics exception \(ci04-catalog-gate came before\) and has no measured repayment receipt/);
  const later = { ...renamed, id: 'unrelated', from: '2027-03-01', expires: '2027-03-30' };
  assert.match(exceptionStatus([ci04, later], '2027-03-05', 30, known).invalid.find((e) => e.id === 'unrelated').problems.join(), /not the first graphics exception/, 'months later, under any name');
  const moved = { ...later, covers: ['job:catalog-gates.yml/Catalog gate (PR)'] };
  assert.match(exceptionStatus([ci04, moved], '2027-03-05', 30, new Set([...known, 'job:catalog-gates.yml/Catalog gate (PR)'])).invalid.find((e) => e.id === 'unrelated').problems.join(), /not the first graphics exception/, 'moved to another workflow in the same tier');
  const elsewhere = { ...later, tier: 'overhead', covers: ['job:ci.yml/Build'] };
  assert.equal(exceptionStatus([ci04, elsewhere], '2027-03-05', 30, new Set([...known, 'job:ci.yml/Build'])).active.length, 1, 'another tier is another scope');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'growth-restart-'));
  const gone = () => JSON.stringify({ artifacts: [{ name: 'growth-report', expired: true, created_at: '2026-09-01T00:00:00Z', workflow_run: { id: 1, head_branch: 'main', repository_id: 10, head_repository_id: 10 } }] });
  assert.throws(() => fetchLatest(path.join(dir, 'a.json'), gone), /expired/);
  assert.equal(fetchLatest(path.join(dir, 'b.json'), gone, { at: '2026-12-01T00:00:00Z', revision: 2 }), null);
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'b.json'), 'utf8')).none, true);
});

test('(b) a matrix entry added to an existing job is priced, and a growth stop refuses it', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.equal(workflowShape(ci).width['guided-mod'], 2);
  const wider = ci.replace("claude-code: ['2.1.287', '2.1.295']", "claude-code: ['2.1.287', '2.1.295', '2.1.300']");
  const [item] = priceAdditions({ workflows: { 'ci.yml': { base: ci, head: wider } }, estimates: CEILINGS.estimates });
  assert.equal(item.id, 'job:ci.yml/Guided mod (Claude Code ${{ matrix.claude-code }})');
  assert.ok(Math.abs(item.perLanding - CEILINGS.estimates.runsPerLanding.everyRun * CEILINGS.estimates.newJobMinutes) < 1e-9, 'one more entry on every run');
  assert.deepEqual(priceAdditions({ workflows: { 'ci.yml': { base: ci, head: ci } }, estimates: CEILINGS.estimates }), []);
  const r = assessTiers({ ceilings: noExceptions, measurement: measurement({ overhead: 40 }), items: [item], today: TODAY, stops: { overhead: 'cost:overhead' } });
  assert.equal(r.tiers.overhead.status, 'refuse');
  const dash = "on:\n  push:\njobs:\n  a:\n    name: A\n    strategy:\n      matrix:\n        os:\n          - x\n          - y\n        node: [1, 2, 3]\n    steps: []\n";
  assert.equal(workflowShape(dash).width.a, 6);
});

test('(b) a rename that moves a job into another tier brings its whole cost there, and new jobs are priced at their tier\'s slowest', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const moved = ci.replace('name: Catalog calibration gate', 'name: Calibration gate');
  const [item] = priceAdditions({ workflows: { 'ci.yml': { base: ci, head: moved } }, estimates: CEILINGS.estimates });
  assert.equal(item.tier, 'overhead');
  assert.match(item.how, /moved into this tier/);
  assert.ok(item.perLanding > 0);
  // An exception filed under the new tier for the moved job waives none of it: the moved job has
  // no measured cost in its new tier, so it has no room there (Rule X9).
  const known = knownCovers({ 'ci.yml': moved }, []);
  const refiled = { ...clone(CEILINGS.exceptions[0]), id: 'calibration', tier: 'overhead', covers: ['job:ci.yml/Calibration gate'], from: '2026-11-29', expires: '2026-12-28' };
  const r0 = assessTiers({ ceilings: noExceptions, measurement: { ...measurement({}), jobs: { 'ci.yml/Catalog calibration gate': { perLanding: 17.7, perDay: 0 } } }, items: [item], today: '2026-12-05', known, exceptions: [CEILINGS.exceptions[0], refiled] });
  assert.equal(r0.tiers.overhead.addedLanding, item.perLanding, 'charged in full');
  // A new backend job with eight static shards, and one whose matrix is built at run time.
  const job = (matrix) => `on:\n  push:\njobs:\n  big:\n    name: Big backend\n    strategy:\n      matrix:\n        shard: ${matrix}\n    steps: []\n`;
  const [eight] = priceAdditions({ workflows: { 'configured-suite.yml': { base: '', head: job('[1, 2, 3, 4, 5, 6, 7, 8]') } }, estimates: CEILINGS.estimates });
  assert.ok(Math.abs(eight.perLanding - 8 * CEILINGS.estimates.newJobMinutesByTier.backend) < 1e-9);
  const [dyn] = priceAdditions({ workflows: { 'configured-suite.yml': { base: '', head: job('${{ fromJSON(needs.plan.outputs.shards) }}') } }, estimates: CEILINGS.estimates });
  assert.ok(Math.abs(dyn.perLanding - CEILINGS.estimates.dynamicMatrixWidth * CEILINGS.estimates.newJobMinutesByTier.backend) < 1e-9);
  const r = assessTiers({ ceilings: noExceptions, measurement: measurement({ backend: 94 }), items: [eight], today: TODAY });
  assert.equal(r.tiers.backend.status, 'refuse');
});

test('(b) include-only matrix entries are counted, and an exception waives growth only up to its allowance', () => {
  const drift = readFileSync(new URL('../.github/workflows/nightly-drift.yml', import.meta.url), 'utf8');
  const shape = workflowShape(drift);
  const job = Object.keys(shape.width).find((k) => shape.width[k] > 1);
  assert.ok(job, 'the drift job has several include entries');
  const inc = "on:\n  schedule:\n    - cron: '0 3 * * *'\njobs:\n  d:\n    name: Drift\n    strategy:\n      matrix:\n        include:\n          - wf: a\n            x: 1\n          - wf: b\n";
  assert.equal(workflowShape(inc).width.d, 2);
  const more = inc + '          - wf: c\n';
  const [item] = priceAdditions({ workflows: { 'nightly-drift.yml': { base: inc, head: more } }, estimates: CEILINGS.estimates });
  assert.ok(item.perDay > 0, 'one more scheduled entry is priced');
  // ci04 already excepts all of its 17.7: growing the catalog gate is charged in full.
  const m = { ...measurement({ graphics: 25.5 }), jobs: { 'ci.yml/Catalog calibration gate': { perLanding: 17.7, perDay: 0 } } };
  const grow = [{ tier: 'graphics', id: 'job:ci.yml/Catalog calibration gate', perLanding: 40, perDay: 0 }];
  const r = assessTiers({ ceilings: CEILINGS, measurement: m, items: grow, today: TODAY });
  assert.equal(r.tiers.graphics.addedLanding, 40);
  assert.equal(r.tiers.graphics.status, 'refuse');
  // An exception for a new spec (no measured cost) waives that spec up to its allowance and no further.
  const ex = { id: 's', tier: 'backend', covers: ['spec:e2e/configured/new.spec.ts'], perLanding: 5, owner: 'o', reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1', from: '2026-10-25', expires: '2026-11-20' };
  const r2 = assessTiers({ ceilings: { ...CEILINGS, exceptions: [ex] }, measurement: measurement({ backend: 60 }), items: [backendItem(8)], today: TODAY });
  assert.equal(r2.tiers.backend.addedLanding, 3);
});

test('(b) a ceilings revision needs a recorded decision, not any link, and is always named for the owner', () => {
  const base = clone(CEILINGS);
  const head = clone(base); head.version = 2; head.tiers.backend.perLanding = 400;
  head.revisions = [{ version: 2, rationale: 'more', authority: 'me', reviewed: 'https://example.com/x' }];
  assert.match(ledgerChanges({ base, head, mainRunners: { base: 13, head: 20 }, shardCap: { base: 20, head: 40 } }).join(), /without a new version and a reviewed revision/);
  head.revisions[0].reviewed = 'https://github.com/NoaCG/NoaCG-Studio/issues/1842#issuecomment-9';
  assert.deepEqual(ledgerChanges({ base, head, mainRunners: { base: 13, head: 20 } }), []);
  assert.equal(ceilingsRevision(base, head).version, 2, 'legal, and still named');
  assert.equal(ceilingsRevision(base, clone(base)), null);
});

test('(d) a commit with more than a hundred statuses is read to its first stamp', () => {
  const now = '2026-10-31T12:00:00Z';
  const filler = [...Array(100)].map(() => ({ context: 'other', state: 'success', created_at: '2026-10-31T11:00:00Z' }));
  const fake = (args) => {
    const route = args.at(-1);
    if (/\/pulls\?/.test(route)) return JSON.stringify([{ number: 5, created_at: '2026-10-31T07:00:00Z', head: { ref: 'f' }, draft: false }]);
    if (/\/commits\?/.test(route)) return JSON.stringify([{ sha: 'c1' }]);
    if (/statuses.*page=1$/.test(route)) return JSON.stringify(filler);
    if (/statuses.*page=2$/.test(route)) return JSON.stringify([{ context: 'noacg/reviewed', state: 'success', created_at: '2026-10-31T08:00:00Z' }]);
    return '[]';
  };
  const r = ages({ ceilings: CEILINGS, now, reader: makeReader(20, fake) });
  assert.match(r.body, /#5 unfinished for 240 min/);
});

test('(b) a review link must be an issue comment in this repository', () => {
  const ex = { id: 'x', tier: 'backend', covers: ['spec:e2e/configured/new.spec.ts'], perLanding: 5, owner: 'o', from: '2026-10-25', expires: '2026-11-20' };
  assert.match(exceptionStatus([{ ...ex, reviewed: 'https://github.com/someone/else/issues/1#issuecomment-1' }], TODAY, 30).invalid[0].problems.join(), /no separate review/);
  assert.equal(exceptionStatus([{ ...ex, reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1' }], TODAY, 30).active.length, 1);
});

test('(d) a timeline still full at the last permitted page is a partial read', () => {
  const now = '2026-10-31T12:00:00Z';
  const full = [...Array(100)].map(() => ({ event: 'commented', created_at: '2026-10-31T09:00:00Z' }));
  const fake = (args) => {
    const route = args.at(-1);
    if (/\/pulls\?/.test(route)) return JSON.stringify([{ number: 6, created_at: '2026-10-31T07:00:00Z', head: { ref: 'f' }, draft: false }]);
    if (/\/commits\?/.test(route)) return JSON.stringify([{ sha: 'c1' }]);
    if (/timeline/.test(route)) return JSON.stringify(full);
    return '[]';
  };
  const existing = '- queue #6 queue unfinished for 300 min, over its 240 minutes ceiling. Owner o; act by 2026-11-01.';
  const r = ages({ ceilings: CEILINGS, now, reader: makeReader(30, fake), existing });
  assert.equal(r.complete, false);
  assert.notEqual(r.body, '', 'unread history never clears an existing queue alarm');
});

test('(d) an alarm issue opened by the coordinator\'s account is found; an outsider\'s with the same title is not', () => {
  const issue = (number, login, type, association) => ({ number, title: AGE_ISSUE, user: { login, type }, author_association: association });
  const gh = (list) => () => JSON.stringify(list);
  assert.equal(findIssue(AGE_ISSUE, gh([issue(1, 'stranger', 'User', 'NONE'), issue(2, 'owner', 'User', 'OWNER')]))?.number, 2);
  assert.equal(findIssue(AGE_ISSUE, gh([issue(3, 'github-actions[bot]', 'Bot', 'NONE')]))?.number, 3);
  assert.equal(findIssue(AGE_ISSUE, gh([issue(4, 'stranger', 'User', 'CONTRIBUTOR')])), null);
  assert.throws(() => findIssue(AGE_ISSUE, gh([...Array(100)].map((_, n) => ({ ...issue(n, 'x', 'User', 'NONE'), title: 'other' })))), /cannot tell/);
});

test('(e) a run with more jobs than were read is a lower bound: its tier is partial and a stop survives it', () => {
  const page = [...Array(100)].map((_, i) => ({ name: `Job ${i}`, status: 'completed', started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:01:00Z' }));
  const read = readJobs(makeReader(10, () => JSON.stringify({ total_count: 301, jobs: page })), { id: 1 });
  assert.equal(read.complete, false);
  assert.equal(read.jobs.length, 300);
  assert.equal(readJobs(makeReader(10, () => JSON.stringify({ total_count: 2, jobs: page.slice(0, 2) })), { id: 1 }).complete, true);
  const runs = fixtureRuns();
  runs[0].cutShort = true;
  assert.equal(priceRuns(runs, { days: 7 }).tiers.backend.evidence, 'partial');
  const stopped = { key: 'cost:backend', since: '2026-11-02', due: '2026-11-09', owner: 'o', corrections: 1, state: 'stopped', detail: 'x' };
  const previous = { generatedAt: '2026-11-17T06:00:00Z', breaches: [stopped], stops: { backend: 'x' }, timing: [] };
  const { report } = buildReport({ ceilings: CEILINGS, runs, days: 7, windowEnd: '2026-11-24T00:00:00Z', now: '2026-11-24T06:00:00Z', previous, tableRecordedAt: '2026-11-20', collection: 'fixture' });
  assert.ok(report.stops.backend, 'an unread job never clears a stop');
});

test('(c) a run with unread jobs is never a complete slowdown point, so it cannot fake a fast baseline', () => {
  const job = (min) => ({ name: 'Configured 1/4', status: 'completed', started_at: '2026-10-30T00:00:00Z', completed_at: new Date(Date.parse('2026-10-30T00:00:00Z') + min * 60_000).toISOString() });
  const run = (i, min, cutShort) => ({ id: i, workflow: 'configured-suite.yml', event: 'push', branch: 'main', sha: `m${i}`, created: `2026-10-2${i}T00:00:00Z`, conclusion: 'success', jobs: [job(min)], ...(cutShort ? { cutShort } : {}) });
  const series = seriesOf([run(1, 3, true), run(2, 3, true), run(3, 3, true), run(4, 30), run(5, 30), run(6, 30)]).backend;
  assert.deepEqual(series.map((p) => p.complete), [false, false, false, true, true, true]);
  assert.equal(detectSlowdown(series).found, false, "three 3-minute runs with unread jobs fake no 10x slowdown");
});

test('(c) a slowdown is found only between equal workloads: a full suite after a selection is not one', () => {
  const job = (name, min) => ({ name, status: 'completed', started_at: '2026-10-30T00:00:00Z', completed_at: new Date(Date.parse('2026-10-30T00:00:00Z') + min * 60_000).toISOString() });
  const at = (i) => `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00Z`;
  const selected = (i) => ({ id: i, workflow: 'ci.yml', event: 'push', branch: 'main', sha: `m${i}`, created: at(i), conclusion: 'success', jobs: [job('Configured E2E 1/1 (selected, local Supabase)', 3)] });
  const full = (i, min) => ({ id: i, workflow: 'configured-suite.yml', event: 'push', branch: 'main', sha: `m${i}`, created: at(i), conclusion: 'success', jobs: [job('Configured E2E shard 1/4', min)] });
  const mixed = seriesOf([selected(1), selected(2), selected(3), full(4, 30), full(5, 30), full(6, 30)]).backend;
  assert.deepEqual(mixed.map((p) => p.complete), [false, false, false, true, true, true], 'a selected run is never a complete point');
  assert.equal(detectSlowdown(mixed).found, false);
  const shards = (i, min, n) => ({ ...full(i, min), jobs: [...Array(n)].map((_, s) => job(`Configured E2E shard ${s + 1}/${n}`, min / n)) });
  assert.equal(detectSlowdown(seriesOf([shards(1, 12, 2), shards(2, 12, 2), shards(3, 12, 2), shards(4, 30, 4), shards(5, 30, 4), shards(6, 30, 4)]).backend).found, false, 'a re-sharded suite is another workload');
  const subset = (i, min) => ({ id: i, workflow: 'ci.yml', event: 'push', branch: 'main', sha: `m${i}`, created: at(i), conclusion: 'success', jobs: [1, 2, 3, 4].map((n) => job(`E2E ${n}/4 (subset)`, min)) });
  assert.equal(detectSlowdown(seriesOf([subset(1, 5), subset(2, 5), subset(3, 5), subset(4, 12), subset(5, 12), subset(6, 12)]).offline).found, false, 'an offline subset is a variable workload too');
  const same = seriesOf([full(1, 20), full(2, 20), full(3, 20), full(4, 24), full(5, 24), full(6, 24)]).backend;
  assert.equal(detectSlowdown(same).found, true, 'the same suite slowing down is still found');
});

test('(b) an offline addition counts toward its tier: a spec that would cross the line is refused', () => {
  const tiers = (perLanding) => assessTiers({ ceilings: noExceptions, measurement: measurement({ offline: perLanding }), items: [], today: TODAY });
  const grow = (perLanding, added) => applyOfflineStop({ status: 'ok', reasons: [], stops: {}, tiers: tiers(perLanding), estimates: CEILINGS.estimates }, { added });
  // 502.9 is 94% of 535: under the 95% line before, but 10 spec minutes x 4.84 runs per landing cross it.
  const r = grow(502.9, 10);
  assert.equal(r.status, 'refuse');
  assert.match(r.reasons.join(), /48\.4 runner-minutes per landing/);
  assert.equal(grow(300, 3).status, 'ok', 'room left: the table line decides');
  assert.equal(grow(502.9, 0).status, 'ok', 'adding nothing lands');
});

test('(e) a planned job read the budget stopped makes its stratum partial, so a thin sample never clears a stop', () => {
  const at = (i) => new Date(Date.parse('2026-11-17T00:00:00Z') + i * 600_000).toISOString();
  const runs = () => [...Array(200)].map((_, i) => ({ id: 1000 + i, workflow: 'configured-suite.yml', event: 'workflow_dispatch', branch: 'main', sha: `d${i}`, created: at(i), conclusion: 'success', status: 'completed', jobs: null }))
    .concat([...Array(4)].map((_, i) => ({ id: 2000 + i, workflow: 'ci.yml', event: 'push', branch: 'main', sha: `m${i}`, created: at(i), conclusion: 'success', status: 'completed', jobs: null })));
  const cheap = JSON.stringify({ total_count: 1, jobs: [{ name: 'Configured E2E shard 1/4', status: 'completed', started_at: '2026-11-17T00:00:00Z', completed_at: '2026-11-17T00:00:30Z', run_attempt: 1 }] });
  // One call left for jobs: the clocks spent the rest of the budget.
  const reader = makeReader(1, () => cheap);
  const thin = runs();
  sampleJobs(reader, thin, 1);
  assert.ok(thin.filter((r) => r.jobs).length <= 1, 'one call left: at most one read planned');
  const priced = priceRuns(thin, { days: 7 });
  assert.equal(priced.tiers.backend.evidence, 'partial');
  assert.match(priced.tiers.backend.why, /not sampled|call budget ran out/);
  const stopped = { key: 'cost:backend', since: '2026-11-02', due: '2026-11-09', owner: 'o', corrections: 1, state: 'stopped', detail: 'x' };
  const previous = { generatedAt: '2026-11-17T06:00:00Z', breaches: [stopped], stops: { backend: 'x' }, timing: [] };
  const { report } = buildReport({ ceilings: CEILINGS, runs: thin, days: 7, windowEnd: '2026-11-24T00:00:00Z', now: '2026-11-24T06:00:00Z', previous, tableRecordedAt: '2026-11-20', collection: 'fixture' });
  assert.ok(report.stops.backend, 'a cheap thin sample never clears the stop');
});

test('(c) a re-run landing is one attempt\'s work in the slowdown series, never the sum of its attempts', () => {
  const job = (min, attempt) => ({ name: 'Configured E2E shard 1/4', status: 'completed', started_at: '2026-10-30T00:00:00Z', completed_at: new Date(Date.parse('2026-10-30T00:00:00Z') + min * 60_000).toISOString(), attempt });
  const run = (i, attempts) => ({ id: i, workflow: 'configured-suite.yml', event: 'push', branch: 'main', sha: `m${i}`, created: `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00Z`, conclusion: 'success', jobs: [...Array(attempts)].map((_, a) => job(20, a + 1)) });
  const series = seriesOf([run(1, 1), run(2, 1), run(3, 1), run(4, 2), run(5, 2), run(6, 2)]).backend;
  assert.deepEqual(series.map((p) => p.value), [20, 20, 20, 20, 20, 20]);
  assert.equal(detectSlowdown(series).found, false, 'three re-run landings are not a 2x slowdown');
  const landing = { id: 99, workflow: 'ci.yml', event: 'push', branch: 'main', sha: 'm4', created: '2026-10-14T00:00:00Z', conclusion: 'success', jobs: [] };
  assert.equal(priceRuns([run(4, 2), landing], { days: 7 }).tiers.backend.perLanding, 40, 'cost still counts every attempt: 20 + 20');
});

test('(b) a job is one tier by its workflow name and its run-time name, so no exception moves offline cost into overhead', () => {
  const yamlShard = 'E2E ${{ matrix.shardIndex }}/${{ matrix.shardTotal }} (${{ needs.plan.outputs.mode }})';
  assert.equal(tierOfJob('ci.yml', yamlShard), 'offline');
  assert.equal(tierOfJob('ci.yml', 'E2E 1/6 (full)'), 'offline');
  assert.equal(tierOfJob('nightly.yml', 'Nightly E2E ${{ matrix.shardIndex }}/${{ matrix.shardTotal }}'), 'offline');
  // The replay: an overhead exception on the shard job's workflow name, to buy overhead headroom
  // with offline's measured cost.
  const ex = { id: 'x', tier: 'overhead', covers: [`job:ci.yml/${yamlShard}`], perLanding: 80, owner: 'o', reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1', from: '2026-10-25', expires: '2026-11-20' };
  assert.match(exceptionStatus([ex], TODAY, 30).invalid[0].problems.join(), /not in the overhead tier/);
  // A catch-all cover in the right tier still credits only that tier's measured jobs.
  const jobs = { 'ci.yml/E2E 1/6 (full)': { perLanding: 66, perDay: 0 }, 'ci.yml/Build': { perLanding: 6, perDay: 0 } };
  assert.deepEqual(coverCosts({ jobs })('job:ci.yml/${{ matrix.name }}'), { perLanding: 6, perDay: 0 });
  const overhead = assessTiers({ ceilings: noExceptions, measurement: { ...measurement({ overhead: 100, offline: 420 }), jobs }, items: [{ tier: 'overhead', id: 'job:ci.yml/New', perLanding: 10, perDay: 0 }], today: TODAY, exceptions: [{ ...ex, covers: ['job:ci.yml/${{ matrix.name }}'] }] });
  assert.equal(overhead.tiers.overhead.status, 'refuse', 'credit is capped at the 6 minutes of overhead it covers');
});

test('(e) an overdue item keeps the date its first alarm set, and a passed date reads as missed', () => {
  const fake = (args) => {
    const route = args.at(-1);
    if (/\/pulls\?/.test(route)) return JSON.stringify([{ number: 7, created_at: '2026-10-31T08:00:00Z', head: { ref: 'f' }, draft: false }]);
    if (/\/commits\?/.test(route)) return JSON.stringify([{ sha: 'c1' }]);
    if (/\/statuses/.test(route)) return JSON.stringify([{ context: 'noacg/reviewed', state: 'success', created_at: '2026-10-31T08:30:00Z' }]);
    return '[]';
  };
  const day1 = ages({ ceilings: CEILINGS, now: '2026-10-31T12:00:00Z', reader: makeReader(50, fake) });
  assert.match(day1.body, /act by 2026-11-01\./);
  const day2 = ages({ ceilings: CEILINGS, now: '2026-11-01T12:00:00Z', reader: makeReader(50, fake), existing: day1.body });
  assert.match(day2.body, /act by 2026-11-01\./, 'the second check keeps the first date, not 2026-11-02');
  const day3 = ages({ ceilings: CEILINGS, now: '2026-11-02T12:00:00Z', reader: makeReader(50, fake), existing: day2.body });
  assert.match(day3.body, /act by 2026-11-01 \(missed\)\./);
  assert.deepEqual(carriedDues('- phase ci18 unfinished for 900 min, over its 6 hours ceiling (clock from ledger 2026-10-31T00:00:00Z). Owner o; act by 2026-11-01 (missed).'), { 'phase ci18': '2026-11-01' });
});

test('(b) covers worded differently over the same measured jobs: renewal needs repayment and credit is never doubled', () => {
  const shards = [1, 2, 3, 4, 5, 6].map((n) => `ci.yml/Configured E2E ${n}/6 (selected, local Supabase)`);
  const jobs = Object.fromEntries(shards.map((k) => [k, { perLanding: 10, perDay: 0 }]));
  const base = { tier: 'backend', owner: 'o', reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1' };
  const e1 = { ...base, id: 'e1', covers: ['job:ci.yml/Configured E2E ${{ matrix.shardIndex }}/${{ matrix.shardTotal }} (selected, local Supabase)'], perLanding: 60, from: '2026-10-01', expires: '2026-10-30' };
  const e2 = { ...base, id: 'e2', covers: ['job:ci.yml/Configured E2E ${{ matrix.lane }}'], perLanding: 60, from: '2026-10-31', expires: '2026-11-20' };
  const m = { ...measurement({ backend: 112 }), jobs };
  // The replay: e1 expired; e2 is a new pattern over the same six shards, with no repayment.
  const renewal = exceptionStatus([e1, e2], TODAY, 30);
  assert.match(renewal.invalid.find((e) => e.id === 'e2').problems.join(), /not the first backend exception \(e1 came before\) and has no measured repayment receipt/);
  const r = assessTiers({ ceilings: noExceptions, measurement: m, items: [backendItem(1)], today: TODAY, exceptions: [e1, e2] });
  assert.equal(r.tiers.backend.status, 'refuse', 'no headroom bought with e1\'s measured cost');
  // Overlapping with e1, e2 is invalid even with its repayment: one active exception per tier, so the 60 measured is credited once.
  const both = [{ ...e1, from: '2026-10-21', expires: '2026-11-20' }, { ...e2, repaid: { perLanding: 2, runs: ['1'], measuredAt: '2026-10-31' } }];
  const r2 = assessTiers({ ceilings: noExceptions, measurement: m, items: [], today: TODAY, exceptions: both });
  assert.match(r2.tiers.backend.why, /^52\/117 per landing/, '112 - 60, not 112 - 120');
});

// --- Rules (phase-ci18.md section 6): one test per rule line ---------------------------------

const RULE_REVIEW = 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1';
const completeRuns = () => fixtureRuns();
const backendOf = (runs, opts) => priceRuns(runs, { days: 7, ...opts }).tiers.backend.evidence;

test('Rule E1: no measurement of the tier, or no window end, is missing', () => {
  assert.equal(evidenceOf(null, 'backend', TODAY, 8).state, 'missing');
  const m = measurement({}); delete m.tiers.backend;
  assert.equal(evidenceOf(m, 'backend', TODAY, 8).state, 'missing');
  assert.equal(evidenceOf({ ...measurement({}), windowEnd: undefined }, 'backend', TODAY, 8).state, 'missing');
});

test('Rule E2: a window end more than 8 days old is stale', () => {
  assert.equal(evidenceOf(measurement({}, { windowEnd: '2026-10-22' }), 'backend', TODAY, 8).state, 'stale');
  assert.equal(evidenceOf(measurement({}, { windowEnd: '2026-10-23' }), 'backend', TODAY, 8).state, 'complete');
});

test('Rule E3: a fresh tier whose evidence is not complete is partial', () => {
  assert.equal(evidenceOf(measurement({}, { evidence: 'partial' }), 'backend', TODAY, 8).state, 'partial');
});

test('Rule E4: otherwise the tier is complete', () => {
  assert.equal(evidenceOf(measurement({}), 'backend', TODAY, 8).state, 'complete');
  assert.equal(backendOf(completeRuns()), 'complete', 'the fixture week is complete, so E5 to E11 each change one thing');
});

test('Rule E5: a run list cut short makes every tier partial', () => {
  const { report } = buildReport({ ceilings: CEILINGS, runs: completeRuns(), days: 7, windowEnd: '2026-10-31T00:00:00Z', now: '2026-10-31T06:00:00Z', listComplete: false, tableRecordedAt: '2026-10-30', collection: 'fixture' });
  for (const t of TIERS) assert.equal(report.measurement.tiers[t].evidence, 'partial', t);
  // A 6-hour slice that reports more runs than it can page is a cut-short list too.
  const slice = () => JSON.stringify({ total_count: 1500, workflow_runs: [] });
  const from = Date.parse('2026-10-30T00:00:00Z');
  assert.equal(listRuns(makeReader(20, slice), from, from + 6 * 3_600_000).complete, false);
  assert.equal(listRuns(makeReader(20, () => JSON.stringify({ total_count: 0, workflow_runs: [] })), from, from + 6 * 3_600_000).complete, true);
  // Ten full pages and no total count: the slice may hold more, so the list is cut short.
  const full = () => JSON.stringify({ workflow_runs: [...Array(100)].map((_, i) => ({ id: i, path: '.github/workflows/ci.yml', event: 'push', created_at: '2026-10-30T01:00:00Z' })) });
  assert.equal(listRuns(makeReader(20, full), from, from + 6 * 3_600_000).complete, false);
});

test('Rule E6: a stratum with no sampled run makes the tiers partial', () => {
  const runs = [...completeRuns(), { id: 900, workflow: 'catalog-gates.yml', event: 'push', branch: 'main', sha: 'x', created: '2026-10-26T00:00:00Z', conclusion: 'success', status: 'completed', jobs: null }];
  assert.equal(backendOf(runs), 'partial');
});

test('Rule E7: a planned job read that failed makes the tiers partial', () => {
  const runs = completeRuns(); runs[1].jobs = null; runs[1].failed = true;
  assert.equal(backendOf(runs), 'partial');
});

test('Rule E8: a planned job read the call budget stopped makes the tiers partial', () => {
  const runs = completeRuns(); runs[1].jobs = null; runs[1].unread = true;
  assert.equal(backendOf(runs), 'partial');
  // A read that needs extra pages can still spend the budget a planned read counted on.
  const fullPage = JSON.stringify({ total_count: 250, jobs: [...Array(100)].map((_, i) => ({ name: `Job ${i}`, status: 'completed', started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:01:00Z', run_attempt: 1 })) });
  const planned = completeRuns().filter((r) => r.workflow === 'ci.yml' && r.event === 'push').slice(0, 2).map((r) => ({ ...r, jobs: null, status: 'completed' }));
  sampleJobs(makeReader(2, () => fullPage), planned, 2);
  assert.ok(planned.some((r) => r.unread), 'the read the budget stopped is marked unread, never silently unsampled');
  assert.equal(backendOf([...completeRuns().filter((r) => !(r.workflow === 'ci.yml' && r.event === 'push')), ...planned]), 'partial');
  // The plan fits the budget: two 60-run post-landing strata (double shares) and 30 calls left.
  const job = JSON.stringify({ total_count: 1, jobs: [{ name: 'Build', status: 'completed', started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:05:00Z', run_attempt: 1 }] });
  const strata = ['ci.yml', 'configured-suite.yml'].flatMap((wf, w) => [...Array(60)].map((_, i) => ({ id: w * 100 + i, workflow: wf, event: 'push', branch: 'main', sha: `s${w}${i}`, created: new Date(Date.parse('2026-10-24T00:00:00Z') + i * 3_600_000).toISOString(), conclusion: 'success', status: 'completed', jobs: null })));
  const fits = makeReader(30, () => job);
  sampleJobs(fits, strata, 30);
  assert.equal(strata.filter((r) => r.unread).length, 0, 'every planned read fits the budget');
  assert.ok(strata.filter((r) => r.jobs).length > 0);
  // A small budget too: six calls for two post-landing strata plan six reads, not eight.
  const few = strata.map((r) => ({ ...r, jobs: null, unread: undefined }));
  sampleJobs(makeReader(6, () => job), few, 6);
  assert.equal(few.filter((r) => r.unread).length, 0, 'never more planned reads than calls left');
  assert.equal(few.filter((r) => r.jobs).length, 6);
});

test('Rule E9: a run still unfinished at collection makes the tiers partial', () => {
  const runs = [...completeRuns(), { id: 901, workflow: 'ci.yml', event: 'push', branch: 'main', sha: 'u', created: '2026-10-28T00:00:00Z', conclusion: null, status: 'in_progress', jobs: null }];
  assert.equal(backendOf(runs), 'partial');
});

test('Rule E10: a run whose jobs were still full at the last page is partial, its jobs a lower bound', () => {
  const runs = completeRuns(); runs[0].cutShort = true;
  const priced = priceRuns(runs, { days: 7 });
  assert.equal(priced.tiers.backend.evidence, 'partial');
  assert.equal(priced.tiers.backend.lowerBound, true);
});

test('Rule E11: a week with no landing is partial', () => {
  const runs = completeRuns().filter((r) => !(r.workflow === 'ci.yml' && r.event === 'push'));
  assert.equal(backendOf(runs), 'partial');
  const priced = priceRuns(runs, { days: 7 });
  assert.equal(evidenceOf({ windowEnd: '2026-10-30', tiers: { backend: priced.tiers.backend } }, 'backend', TODAY, 8).state, 'missing', 'with no per-landing figure the gate reads it as missing (E1)');
});

test('Rule E12: cost counts every attempt; a slowdown point counts the latest attempt only', () => {
  const job = (attempt) => ({ name: 'Configured E2E shard 1/4', status: 'completed', started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:20:00Z', attempt });
  const rerun = { id: 1, workflow: 'configured-suite.yml', event: 'push', branch: 'main', sha: 'r', created: '2026-10-20T00:00:00Z', conclusion: 'success', jobs: [job(1), job(2)] };
  const landing = { id: 2, workflow: 'ci.yml', event: 'push', branch: 'main', sha: 'l', created: '2026-10-20T00:00:00Z', conclusion: 'success', jobs: [] };
  assert.equal(priceRuns([rerun, landing], { days: 7 }).tiers.backend.perLanding, 40);
  assert.equal(seriesOf([rerun]).backend[0].value, 20);
});

test('Rule E13: a slowdown point is complete only for a successful, fully read, fixed-workload run; points compare within one workload', () => {
  const job = (name, status = 'completed') => ({ name, status, started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:20:00Z' });
  const run = (over) => ({ id: 1, workflow: 'configured-suite.yml', event: 'push', branch: 'main', sha: 's', created: '2026-10-20T00:00:00Z', conclusion: 'success', jobs: [job('Configured E2E shard 1/4')], ...over });
  assert.equal(seriesOf([run({})]).backend[0].complete, true);
  assert.equal(seriesOf([run({ conclusion: 'failure' })]).backend[0].complete, false, 'failed run');
  assert.equal(seriesOf([run({ jobs: [job('Configured E2E shard 1/4', 'in_progress')] })]).backend[0].complete, false, 'unfinished job');
  assert.equal(seriesOf([run({ cutShort: true })]).backend[0].complete, false, 'unread jobs');
  assert.equal(seriesOf([run({ workflow: 'ci.yml', jobs: [job('Configured E2E 1/4 (selected, local Supabase)')] })]).backend[0].complete, false, 'selected run');
  assert.notEqual(seriesOf([run({})]).backend[0].workload, seriesOf([run({ jobs: [job('Configured E2E shard 1/8')] })]).backend[0].workload, 'a re-sharded suite is another workload');
});

test('Rule E14: the durations table is stale past 8 days or with no date, and an open refresh never makes it fresh', () => {
  assert.equal(tableFreshness({ recordedAt: '2026-10-22', today: TODAY, boundDays: 8 }).stale, true);
  assert.equal(tableFreshness({ recordedAt: '2026-10-23', today: TODAY, boundDays: 8 }).stale, false);
  assert.equal(tableFreshness({ recordedAt: undefined, today: TODAY, boundDays: 8 }).stale, true);
  assert.equal(tableFreshness({ recordedAt: '2026-10-19', today: TODAY, boundDays: 8, pending: [{ number: 1503, recordedAt: '2026-10-30' }] }).stale, true);
});

test('Rule E15: on complete evidence added cost warns from 85% and is refused at 95%', () => {
  const run = (used, add) => assessTiers({ ceilings: noExceptions, measurement: measurement({ backend: used }), items: add ? [backendItem(add)] : [], today: TODAY }).tiers.backend.status;
  assert.equal(run(90, 1), 'ok', '78%');
  assert.equal(run(100, 1), 'warn', '86%');
  assert.equal(run(110, 1), 'warn', '94.9%');
  assert.equal(run(110, 2), 'refuse', '95.7%');
});

test('Rule E16: on partial or stale evidence added cost is refused from 85%', () => {
  const run = (m) => assessTiers({ ceilings: noExceptions, measurement: m, items: [backendItem(1)], today: TODAY }).tiers.backend.status;
  assert.equal(run(measurement({ backend: 100 })), 'warn', 'complete at 86% only warns');
  assert.equal(run(measurement({ backend: 100 }, { evidence: 'partial' })), 'refuse');
  assert.equal(run(measurement({ backend: 100 }, { windowEnd: '2026-10-20' })), 'refuse');
});

test('Rule E17: on missing evidence any added cost is refused, and adding nothing lands', () => {
  const m = measurement({}); delete m.tiers.backend;
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: m, items: [backendItem(0.1)], today: TODAY }).tiers.backend.status, 'refuse');
  assert.notEqual(assessTiers({ ceilings: noExceptions, measurement: m, items: [], today: TODAY }).tiers.backend.status, 'refuse');
  // An exception's room rests on measured cost, so it waives nothing here either.
  const ex = { id: 's', tier: 'backend', covers: ['spec:e2e/configured/new.spec.ts'], perLanding: 30, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-25', expires: '2026-11-20' };
  assert.equal(assessTiers({ ceilings: { ...CEILINGS, exceptions: [ex] }, measurement: m, items: [backendItem(0.1)], today: TODAY }).tiers.backend.status, 'refuse');
});

test('Rule E18: a weekly report asked for and unreadable refuses any added cost, offline included', () => {
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: null, items: [backendItem(0.1)], today: TODAY }).tiers.backend.status, 'refuse');
  // Offline: even a tier with room is refused when the report itself could not be read.
  const roomy = assessTiers({ ceilings: noExceptions, measurement: measurement({ offline: 100 }), items: [], today: TODAY });
  assert.equal(applyOfflineStop({ status: 'ok', reasons: [], stops: {}, tiers: roomy, estimates: CEILINGS.estimates }, { added: 0.1 }).status, 'ok');
  assert.equal(applyOfflineStop({ status: 'ok', reasons: [], stops: {}, tiers: roomy, estimates: CEILINGS.estimates, unreadable: true }, { added: 0.1 }).status, 'refuse');
  // An exception present changes nothing: unread evidence gives no room, offline or not.
  const ex = { id: 's', tier: 'backend', covers: ['spec:e2e/configured/new.spec.ts'], perLanding: 30, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-25', expires: '2026-11-20' };
  assert.equal(assessTiers({ ceilings: { ...CEILINGS, exceptions: [ex] }, measurement: null, items: [backendItem(0.1)], today: TODAY }).tiers.backend.status, 'refuse');
  const offlineEx = { ...ex, tier: 'offline', covers: ['spec:e2e/new.spec.ts'] };
  const ceilings = { ...CEILINGS, exceptions: [offlineEx] };
  const growth = { status: 'ok', reasons: [], stops: {}, unreadable: true, estimates: CEILINGS.estimates, tiers: assessTiers({ ceilings, measurement: null, items: [], today: TODAY }), assessWith: (items) => assessTiers({ ceilings, measurement: null, items, today: TODAY }) };
  assert.equal(applyOfflineStop(growth, { added: 1, details: [{ spec: 'new.spec.ts', delta: 1 }] }, { paths: ['e2e/new.spec.ts'] }).status, 'refuse');
});

test('Rule E19: a stale durations table makes the offline table line refuse from 85%', () => {
  const minutes = Object.fromEntries([...Array(100).keys()].map((i) => [`s${i}.spec.ts`, 1.8]));
  const table = { source: {}, minutes, overhead: { jobMinutes: 0.42, testFactor: 1.01, medianJobMinutes: 0.3, samples: 10 } };
  const args = { table, suite: [...Object.keys(minutes), 'new.spec.ts'].sort(), changed: ['e2e/new.spec.ts'], today: TODAY };
  assert.equal(assess(args).status, 'warn');
  assert.equal(assess({ ...args, tableStale: true }).status, 'refuse');
});

test('Rule E20: a breach clears only on evidence that judges it, and is otherwise kept with its stop', () => {
  const cost = { key: 'cost:backend', since: '2026-10-10', due: '2026-10-17', owner: 'o', corrections: 1, state: 'stopped', detail: 'x' };
  const age = { key: 'age:#7', kind: 'age', subject: '#7', category: 'prReady', since: '2026-10-29', due: '2026-10-30', owner: 'o', corrections: 1, state: 'stopped', detail: 'y' };
  const previous = { generatedAt: '2026-10-24T06:00:00Z', breaches: [cost, age], stops: { backend: 'x' }, timing: [] };
  const build = (over) => buildReport({ ceilings: CEILINGS, runs: completeRuns(), days: 7, windowEnd: '2026-10-31T00:00:00Z', now: '2026-10-31T06:00:00Z', previous, tableRecordedAt: '2026-10-30', collection: 'fixture', ...over }).report;
  const keys = (r) => r.breaches.map((b) => b.key);
  assert.ok(!keys(build({})).includes('cost:backend'), 'complete and in bounds: cleared');
  assert.ok(keys(build({ listComplete: false })).includes('cost:backend'), 'partial: kept');
  assert.ok(!keys(build({})).includes('age:#7'), 'a complete read without the item: cleared');
  assert.ok(keys(build({ openComplete: false })).includes('age:#7'), 'an incomplete read: kept');
});

test('Rule E21: a growth stop refuses any addition to its tier, waived by an exception or not', () => {
  const ex = { id: 's', tier: 'backend', covers: ['spec:e2e/configured/new.spec.ts'], perLanding: 30, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-25', expires: '2026-11-20' };
  const run = (items) => assessTiers({ ceilings: noExceptions, measurement: measurement({ backend: 60 }), items, today: TODAY, stops: { backend: 'cost:backend since 2026-10-10' }, exceptions: [ex] }).tiers.backend.status;
  assert.equal(run([backendItem(1)]), 'refuse', 'fully waived, still refused');
  assert.notEqual(run([]), 'refuse', 'adding nothing lands');
  const offline = { status: 'ok', reasons: [], stops: { offline: 'x' }, estimates: CEILINGS.estimates, assessWith: () => ({ tiers: { offline: { addedLanding: 0, addedDay: 0 } } }) };
  assert.equal(applyOfflineStop(offline, { added: 1, details: [{ spec: 'new.spec.ts', delta: 1 }] }).status, 'refuse', 'offline: the stop is judged before the waiver');
});

test('Rule E22: the report search reads every artifact page; only a finished listing establishes a first week', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'growth-e22-'));
  const art = (branch, id) => ({ name: 'growth-report', expired: false, created_at: `2026-10-${String(1 + (id % 28)).padStart(2, '0')}T00:00:00Z`, workflow_run: { id, head_branch: branch, repository_id: 10, head_repository_id: 10 } });
  const branches = [...Array(100)].map((_, i) => art('feature', 1000 + i));
  const pages = (list, total = list.length) => (args) => {
    if (args[0] === 'run') { writeFileSync(path.join(args[args.indexOf('-D') + 1], 'growth-report.json'), '{"generatedAt":"x"}'); return ''; }
    const page = Number(/[?&]page=(\d+)/.exec(args.at(-1))?.[1] ?? 1);
    return JSON.stringify({ total_count: total, artifacts: list.slice((page - 1) * 100, page * 100) });
  };
  assert.equal(fetchLatest(path.join(dir, 'a.json'), pages([...branches, art('main', 7)])).run, 7, 'main\'s report on page 2 is found');
  assert.equal(fetchLatest(path.join(dir, 'b.json'), pages(branches)), null, 'a finished listing with no main report: a first week');
  const endless = (args) => (args[0] === 'run' ? '' : JSON.stringify({ total_count: 1e6, artifacts: branches }));
  assert.throws(() => fetchLatest(path.join(dir, 'c.json'), endless), /unfinished listing never establishes a first week/);
  // A fork's branch called main is not main: its report is never read.
  const fork = { ...art('main', 999), created_at: '2026-11-01T00:00:00Z', workflow_run: { id: 999, head_branch: 'main', repository_id: 10, head_repository_id: 77 } };
  assert.equal(fetchLatest(path.join(dir, 'd.json'), pages([art('main', 111), fork])).run, 111);
  assert.equal(fetchLatest(path.join(dir, 'e.json'), pages([fork])), null, 'only a fork\'s report: still a first week');
  // A listing that does not say how long it is ends only on a short page.
  const untold = (args) => { if (args[0] === 'run') return pages([])(args); const page = Number(/[?&]page=(\d+)/.exec(args.at(-1))?.[1] ?? 1); const list = [...branches, art('main', 7)]; return JSON.stringify({ artifacts: list.slice((page - 1) * 100, page * 100) }); };
  assert.equal(fetchLatest(path.join(dir, 'f.json'), untold).run, 7);
});

test('Rule X1: a cover\'s tier is its job\'s tier with each ${{ }} read as a number, or its spec\'s folder', () => {
  assert.equal(tierOfCover('job:ci.yml/E2E ${{ matrix.shardIndex }}/${{ matrix.shardTotal }} (${{ needs.plan.outputs.mode }})'), 'offline');
  assert.equal(tierOfCover('job:ci.yml/Configured E2E ${{ matrix.shardIndex }}/4 (selected, local Supabase)'), 'backend');
  assert.equal(tierOfCover('spec:e2e/configured/a.spec.ts'), 'backend');
  assert.equal(tierOfCover('spec:e2e/catalog/a.spec.ts'), 'graphics');
  assert.equal(tierOfCover('spec:e2e/a.spec.ts'), 'offline');
});

test('Rule X2: an exception is valid only with id, tier, covers in its tier naming something real, allowance, owner, issue-comment review and dates at most 30 days apart', () => {
  const good = { id: 'g', tier: 'backend', covers: ['spec:e2e/configured/a.spec.ts'], perLanding: 5, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-25', expires: '2026-11-20' };
  const known = new Set(['spec:e2e/configured/a.spec.ts']);
  const problems = (over) => exceptionProblems({ ...good, ...over }, [], 30, known);
  assert.deepEqual(problems({}), []);
  assert.match(exceptionProblems({ ...good }, [{ ...good }], 30, known).join(), /repeats the id g/, 'a unique id');
  for (const [field, value, why] of [['id', '', /no id/], ['tier', 'x', /unknown tier/], ['covers', [], /no scope/], ['covers', ['spec:e2e/a.spec.ts'], /not in the backend tier/], ['covers', ['spec:e2e/configured/gone.spec.ts'], /names no job or spec/], ['perLanding', 0, /no cost/], ['owner', '', /no owner/], ['reviewed', 'https://github.com/x/y/issues/1#issuecomment-1', /no separate review/], ['expires', '2026-12-30', /over 30/], ['expires', '2026-10-01', /no valid from\/expires/]]) {
    assert.match(problems({ [field]: value }).join(), why, `${field}=${JSON.stringify(value)}`);
  }
});

test('Rule X3: the first exception in a tier needs no receipt; every later one in that tier needs a measured repayment receipt, under any name and at any distance', () => {
  const ex = (id, over) => ({ id, tier: 'backend', covers: ['spec:e2e/configured/a.spec.ts'], perLanding: 5, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-01', expires: '2026-10-20', ...over });
  const first = ex('a');
  assert.deepEqual(exceptionProblems(first, [], 30), [], 'the first in its tier');
  const later = (repaid) => exceptionProblems(ex('b', { covers: ['spec:e2e/configured/other.spec.ts'], from: '2026-10-25', expires: '2026-11-20', repaid }), [first], 30);
  assert.deepEqual(later({ perLanding: 2, runs: ['1'], measuredAt: '2026-10-01' }), [], 'measured on the latest earlier start');
  for (const [r, why] of [[undefined, 'none'], [{ perLanding: 0, runs: ['1'], measuredAt: '2026-10-21' }, 'zero'], [{ perLanding: 2, runs: [], measuredAt: '2026-10-21' }, 'no run'], [{ perLanding: 2, runs: ['1'], measuredAt: '2026-09-30' }, 'before the earlier start'], [{ perLanding: 2, runs: ['1'] }, 'undated']]) {
    assert.match(later(r).join(), /is not the first backend exception \(a came before\) and has no measured repayment receipt/, why);
  }
  assert.match(later({ perLanding: 2, runs: ['1'], measuredAt: '2026-10-26' }).join(), /no measured repayment receipt/, 'measured after its own start');
  assert.match(later({ perLanding: 2, runs: ['x'], measuredAt: '2026-10-21' }).join(), /no measured repayment receipt/, 'a run id that is not a number');
  assert.match(exceptionProblems(ex('c', { from: '2028-01-01', expires: '2028-01-20' }), [first], 30).join(), /not the first backend exception/, 'it never lapses');
  assert.match(exceptionProblems(ex('c', { from: '2026-12-01', expires: '2026-12-20' }), [{ ...first, owner: '' }], 30).join(), /not the first backend exception/, 'an earlier entry counts whatever its state today');
  assert.deepEqual(exceptionProblems(ex('c', { tier: 'graphics', covers: ['spec:e2e/catalog/a.spec.ts'], from: '2026-10-25', expires: '2026-11-20' }), [first], 30), [], 'the first in another tier');
  const second = ex('b', { from: '2026-10-25', expires: '2026-11-20', repaid: { perLanding: 1, runs: ['1'], measuredAt: '2026-10-21' } });
  assert.match(exceptionProblems(ex('c', { from: '2026-11-25', expires: '2026-12-20', repaid: { perLanding: 1, runs: ['2'], measuredAt: '2026-10-24' } }), [first, second], 30).join(), /between 2026-10-25/, 'the latest earlier start');
});

test('Rule X4: at most one active exception per tier: a later one that starts on or before an earlier one expires is invalid', () => {
  const r = { perLanding: 2, runs: ['1'], measuredAt: '2026-10-05' };
  const ex = (id, from, expires, over) => ({ id, tier: 'graphics', covers: ['job:ci.yml/Catalog calibration gate'], perLanding: 17.7, owner: 'o', reviewed: RULE_REVIEW, from, expires, ...over });
  const first = ex('a', '2026-10-01', '2026-10-20');
  assert.match(exceptionProblems(ex('b', '2026-10-20', '2026-11-10', { repaid: r }), [first], 30).join(), /overlaps an earlier graphics exception \(a\)/);
  assert.deepEqual(exceptionProblems(ex('b', '2026-10-21', '2026-11-10', { repaid: r }), [first], 30), []);
  const m = { ...measurement({ graphics: 60 }), jobs: { 'ci.yml/Catalog calibration gate': { perLanding: 45, perDay: 0 } } };
  const why = assessTiers({ ceilings: noExceptions, measurement: m, items: [], today: '2026-10-10', exceptions: [first, ex('b', '2026-10-05', '2026-11-01', { perLanding: 30, repaid: r })] }).tiers.graphics.why;
  assert.match(why, /^42\.3\/10 per landing/, '60 - 17.7: the overlapping second earns nothing, never 60 - 47.7 or 60 - 30');
});

test('Rule X5: the offline tier is one scope across growth-ceilings.json and the work-spec lines', () => {
  const line = (spec, from, expires, repaid) => ({ from, spec, minutes: 3, expires, ...(repaid ? { repaid } : {}) });
  const old = [line('e2e/a.spec.ts', 'docs/work-specs/a/spec.md', '2026-11-16')];
  const r = (measuredAt) => ({ minutes: 1, runs: ['9'], measuredAt });
  const fresh = (spec, repaid) => line(spec, 'docs/work-specs/b/spec.md', '2026-12-10', repaid);
  const ch = (base, head, opts) => offlineExceptionChanges(base, head, { today: '2026-11-20', ...opts }).join();
  assert.equal(ch([], [fresh('e2e/b.spec.ts')]), '', 'the first offline exception needs no receipt');
  assert.match(ch(old, [...old, fresh('e2e/b.spec.ts')]), /is not the first offline exception/, 'another spec in another work spec: one scope');
  assert.equal(ch(old, [...old, fresh('e2e/b.spec.ts', r('2026-11-16'))]), '', 'dated on or after the earlier line\'s expiry, which stands for its start');
  assert.match(ch(old, [...old, fresh('e2e/b.spec.ts', r('2026-11-15'))]), /dated between 2026-11-16/);
  assert.match(ch(old, [...old, fresh('e2e/b.spec.ts', r('2026-11-16'))], { today: '2026-11-16' }), /one active exception per tier/, 'while an earlier line still runs');
  const entry = (id, from, expires, repaid) => ({ id, tier: 'offline', covers: ['spec:e2e/a.spec.ts'], perLanding: 5, owner: 'o', reviewed: RULE_REVIEW, from, expires, ...(repaid ? { repaid } : {}) });
  assert.match(ch([], [fresh('e2e/b.spec.ts')], { baseEntries: [entry('o1', '2026-10-01', '2026-10-30')] }), /is not the first offline exception/, 'a ceilings entry came first');
  assert.match(ch(old, old, { newEntries: [entry('o2', '2026-11-17', '2026-12-10')] }), /o2 is not the first offline exception/, 'a work-spec line came first');
  assert.match(ch(old, old, { newEntries: [entry('o2', '2026-11-15', '2026-12-10', { perLanding: 1, runs: ['9'], measuredAt: '2026-11-16' })] }), /o2 starts 2026-11-15, while an earlier offline exception runs to 2026-11-16/);
  assert.equal(ch(old, old, { newEntries: [entry('o2', '2026-11-17', '2026-12-10', { perLanding: 1, runs: ['9'], measuredAt: '2026-11-16' })] }), '');
  assert.match(ch([], [fresh('e2e/b.spec.ts')], { newEntries: [entry('o2', '2026-11-21', '2026-12-10')] }), /one scope with one exception at a time/);
  assert.match(ch(old, [...old, fresh('e2e/b.spec.ts', r('2026-11-21'))]), /dated between 2026-11-16 and today/, 'a receipt dated after the day judged');
  const long = line('e2e/b.spec.ts', 'docs/work-specs/b/spec.md', '2027-06-01');
  assert.match(ch([], [long]), /expires 2027-06-01: a new line starts today \(2026-11-20\) and runs at most 30 days/);
  assert.match(ch([], [line('e2e/b.spec.ts', 'docs/work-specs/b/spec.md', '2026-11-19')]), /runs at most 30 days/, 'already expired');
});

test('Rule X6: the ledger is append-only and in order', () => {
  const e = (id) => ({ id, tier: 'backend', covers: ['spec:e2e/configured/a.spec.ts'], perLanding: 5, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-01', expires: '2026-10-20' });
  const base = { ...clone(CEILINGS), exceptions: [e('a')] };
  assert.deepEqual(ledgerChanges({ base, head: { ...base, exceptions: [e('a'), e('b')] } }), []);
  assert.match(ledgerChanges({ base, head: { ...base, exceptions: [] } }).join(), /removed/);
  assert.match(ledgerChanges({ base, head: { ...base, exceptions: [{ ...e('a'), perLanding: 9 }] } }).join(), /edited/);
  assert.match(ledgerChanges({ base, head: { ...base, exceptions: [e('b'), e('a')] } }).join(), /appended after the existing ones/);
  // An edited copy in front of the untouched original: one id, two entries.
  assert.match(ledgerChanges({ base, head: { ...base, exceptions: [{ ...e('a'), perLanding: 40, from: '2026-11-25', expires: '2026-12-24' }, e('a')] } }).join(), /appears more than once/);
});

test('Rule X7: status, first match wins: invalid, expired, not yet started, active', () => {
  const e = (over) => ({ id: 'x', tier: 'backend', covers: ['spec:e2e/configured/a.spec.ts'], perLanding: 5, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-25', expires: '2026-11-20', ...over });
  const where = (x) => { const s = exceptionStatus([x], TODAY, 30); return s.invalid.length ? 'invalid' : s.expired.length ? 'expired' : s.active.length ? 'active' : 'not yet'; };
  assert.equal(where(e({ owner: '', expires: '2026-10-26' })), 'invalid', 'invalid wins over expired');
  assert.equal(where(e({ from: '2026-10-01', expires: '2026-10-20' })), 'expired');
  assert.equal(where(e({ from: '2026-11-05', expires: '2026-11-20' })), 'not yet');
  assert.equal(where(e({})), 'active');
});

test('Rule X8: credit is the allowance capped at the measured cost of the jobs its covers match in its tier; a spec or unmeasured cover earns 0', () => {
  const m = { jobs: { 'ci.yml/Configured E2E 1/2 (selected, local Supabase)': { perLanding: 5 }, 'ci.yml/Configured E2E 2/2 (selected, local Supabase)': { perLanding: 5 }, 'nightly.yml/Configured E2E 1/2 (selected, local Supabase)': { perLanding: 5 }, 'ci.yml/E2E 1/6 (full)': { perLanding: 66 } } };
  const of = coverJobs(m);
  assert.deepEqual(of('job:ci.yml/Configured E2E ${{ matrix.i }}/${{ matrix.n }} (selected, local Supabase)').sort(), ['ci.yml/Configured E2E 1/2 (selected, local Supabase)', 'ci.yml/Configured E2E 2/2 (selected, local Supabase)']);
  assert.deepEqual(of('job:ci.yml/${{ matrix.name }}'), [], 'overhead cover: no offline or backend job');
  assert.deepEqual(of('spec:e2e/configured/a.spec.ts'), []);
  assert.deepEqual(of('job:ci.yml/Never ran'), []);
  const ex = (covers) => ({ id: 'c', tier: 'graphics', covers, perLanding: 30, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-25', expires: '2026-11-20' });
  const why = (cost, e) => assessTiers({ ceilings: noExceptions, measurement: { ...measurement({ graphics: 60 }), jobs: { 'ci.yml/Catalog calibration gate': { perLanding: cost, perDay: 0 } } }, items: [], today: TODAY, exceptions: [e] }).tiers.graphics.why;
  assert.match(why(45, ex(['job:ci.yml/Catalog calibration gate'])), /^30\/10 per landing/, 'the allowance');
  assert.match(why(20, ex(['job:ci.yml/Catalog calibration gate'])), /^40\/10 per landing/, 'the measured cost');
  assert.match(why(20, ex(['job:ci.yml/Catalog calibration never measured'])), /^60\/10 per landing/, 'an unmeasured cover');
  assert.match(why(20, ex(['spec:e2e/catalog/a.spec.ts'])), /^60\/10 per landing/, 'a spec cover');
});

test('Rule X9: a covered addition is waived up to the room left (allowance minus its jobs\' cost); no room unless the evidence is complete, nor for an unmeasured existing job', () => {
  const spec = { id: 's', tier: 'backend', covers: ['spec:e2e/configured/new.spec.ts'], perLanding: 5, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-25', expires: '2026-11-20' };
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: measurement({ backend: 60 }), items: [backendItem(8)], today: TODAY, exceptions: [spec] }).tiers.backend.addedLanding, 3);
  const gate = { id: 'g', tier: 'graphics', owner: 'o', reviewed: RULE_REVIEW, covers: ['job:ci.yml/Catalog calibration gate'], perLanding: 30, from: '2026-10-25', expires: '2026-11-20' };
  const m = { ...measurement({ graphics: 25.5 }), jobs: { 'ci.yml/Catalog calibration gate': { perLanding: 17.7, perDay: 0 } } };
  const grow = (add) => assessTiers({ ceilings: noExceptions, measurement: m, items: [{ tier: 'graphics', id: 'job:ci.yml/Catalog calibration gate', perLanding: add, perDay: 0, how: 'more runs of a job' }], today: TODAY, exceptions: [gate] }).tiers.graphics.addedLanding;
  assert.equal(Math.round(10 * grow(20)) / 10, 7.7, '12.3 of room: 30 allowed, 17.7 measured');
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: null, items: [backendItem(8)], today: TODAY, exceptions: [spec] }).tiers.backend.addedLanding, 8, 'missing evidence: no room, even for a spec');
  // Partial or stale evidence reads a job's cost as a lower bound, so its room is unknown: nothing is waived.
  const gate4 = (m2) => assessTiers({ ceilings: noExceptions, measurement: m2, items: [{ tier: 'graphics', id: 'job:ci.yml/Catalog calibration gate', perLanding: 4, perDay: 0, how: 'more runs of a job' }], today: TODAY, exceptions: [{ ...gate, perLanding: 17.7 }] }).tiers.graphics;
  const at = (evidence, windowEnd) => ({ ...measurement({ graphics: 21.5 }, { evidence, windowEnd }), jobs: { 'ci.yml/Catalog calibration gate': { perLanding: 13.7, perDay: 0 } } });
  assert.equal(gate4(at('complete')).addedLanding, 0, 'complete: 4 of the 4.0 room waived');
  assert.equal(gate4(at('partial')).addedLanding, 4, 'partial: nothing waived');
  assert.equal(gate4(at('partial')).status, 'refuse');
  assert.equal(gate4(at('complete', '2026-10-01')).addedLanding, 4, 'stale: nothing waived');
  // The offline tier takes the same route: an approved offline exception waives an offline spec.
  const offlineEx = { id: 'o', tier: 'offline', covers: ['spec:e2e/new.spec.ts'], perLanding: 30, perDay: 5, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-25', expires: '2026-11-20' };
  const offlineGrowth = (exceptions) => {
    const ceilings = { ...CEILINGS, exceptions };
    const m = measurement({ offline: 500 });
    return { status: 'ok', reasons: [], stops: {}, estimates: CEILINGS.estimates, tiers: assessTiers({ ceilings, measurement: m, items: [], today: TODAY }), assessWith: (items) => assessTiers({ ceilings, measurement: m, items, today: TODAY }) };
  };
  const added = { added: 5, details: [{ spec: 'new.spec.ts', delta: 5 }] };
  assert.equal(applyOfflineStop(offlineGrowth([]), added, { paths: ['e2e/new.spec.ts'] }).status, 'refuse', '500 + 24.2 crosses 95% of 535');
  assert.equal(applyOfflineStop(offlineGrowth([offlineEx]), added, { paths: ['e2e/new.spec.ts'] }).status, 'ok', 'waived by the approved allowance');
  // No measured figure for an existing job: its room is unknown, so nothing is waived; a new job keeps its allowance.
  const jobEx = { id: 'j', tier: 'backend', covers: ['job:ci.yml/Configured E2E (${{ matrix.shard }})'], perLanding: 30, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-25', expires: '2026-11-20' };
  const jobItem = (how) => ({ tier: 'backend', id: 'job:ci.yml/Configured E2E (${{ matrix.shard }})', perLanding: 25, perDay: 0, how });
  const added2 = (how) => assessTiers({ ceilings: noExceptions, measurement: measurement({ backend: 60 }), items: [jobItem(how)], today: TODAY, exceptions: [jobEx] }).tiers.backend.addedLanding;
  assert.equal(added2('more runs of a job at 12.7 runner-min'), 25, 'an existing job no measurement prices');
  assert.equal(added2('new job at 12.7 runner-min'), 0, 'a job new in this change');
});

test('Rule X10: credit never crosses tiers, a job moved into another tier is new there, and no exception moves a ceiling, an estimate, MAIN_RUNNERS or SHARD_CAP_MINUTES', () => {
  const ex = { id: 'x', tier: 'overhead', covers: ['job:ci.yml/E2E ${{ matrix.shardIndex }}/${{ matrix.shardTotal }} (full)'], perLanding: 80, owner: 'o', reviewed: RULE_REVIEW, from: '2026-10-25', expires: '2026-11-20' };
  assert.match(exceptionStatus([ex], TODAY, 30).invalid[0].problems.join(), /not in the overhead tier/);
  const base = clone(CEILINGS);
  const head = clone(base); head.tiers.backend.perLanding = 200; head.exceptions.push({ ...ex, tier: 'backend' });
  assert.match(ledgerChanges({ base, head }).join(), /without a new version and a reviewed revision/);
  assert.match(ledgerChanges({ base, head: base, mainRunners: { base: 13, head: 20 } }).join(), /MAIN_RUNNERS rose/);
  assert.match(ledgerChanges({ base, head: base, shardCap: { base: 20, head: 40 } }).join(), /SHARD_CAP_MINUTES rose/);
  // A job moved into another tier by renaming its workflow file is new to that tier.
  const sweep = "on:\n  schedule:\n    - cron: '0 3 * * *'\njobs:\n  sweep:\n    name: Fit sweep\n";
  const [moved] = priceAdditions({ workflows: { 'fit-sweep-renamed.yml': { base: sweep, head: sweep, baseFile: 'fit-sweep.yml' } }, estimates: CEILINGS.estimates });
  // An offline job is priced like any other, and an offline growth stop refuses it.
  const shard = 'on:\n  push:\njobs:\n  e2e:\n    name: E2E 1/1 (full)\n';
  const [offlineJob] = priceAdditions({ workflows: { 'ci.yml': { base: shard, head: `${shard}  e2e-copy:\n    name: E2E 1/1 (full)\n` } }, estimates: CEILINGS.estimates });
  assert.equal(offlineJob?.tier, 'offline');
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: measurement({}), items: [offlineJob], today: TODAY, stops: { offline: 'cost:offline' } }).tiers.offline.status, 'refuse');
  // An offline job and offline spec minutes added by one change are judged in one sum.
  const both = (jobItems) => {
    const m = measurement({ offline: 420 });
    const ceilings = noExceptions;
    const growth = { status: 'ok', reasons: [], stops: {}, estimates: CEILINGS.estimates, items: jobItems, tiers: assessTiers({ ceilings, measurement: m, items: jobItems, today: TODAY }), assessWith: (items) => assessTiers({ ceilings, measurement: m, items, today: TODAY }) };
    return applyOfflineStop(growth, { added: 5, details: [{ spec: 'new.spec.ts', delta: 5 }] }, { paths: ['e2e/new.spec.ts'] }).status;
  };
  const job75 = { tier: 'offline', id: 'job:ci.yml/E2E 2/2 (full)', perLanding: 75.02, perDay: 0, how: 'new job at 15.5 runner-min' };
  assert.equal(both([]), 'ok', '420 + 24.2 alone fits');
  assert.equal(both([job75]), 'refuse', '420 + 75.02 + 24.2 crosses 95% of 535 together');
  assert.equal(moved?.tier, 'overhead');
  assert.match(moved?.how ?? '', /moved into this tier/);
  // A copy under a new key that repeats an existing job's name is new, not the existing job.
  const build = 'on:\n  pull_request:\njobs:\n  build:\n    name: Build\n';
  const [copy] = priceAdditions({ workflows: { 'ci.yml': { base: build, head: `${build}  build-copy:\n    name: Build\n` } }, estimates: CEILINGS.estimates });
  assert.match(copy?.how ?? '', /^new job/);
  assert.deepEqual(priceAdditions({ workflows: { 'ci.yml': { base: build, head: build.replace('  build:', '  compile:') } }, estimates: CEILINGS.estimates }), [], 'a renamed key with its name kept is the same job');
  const twice = priceAdditions({ workflows: { 'ci.yml': { base: build, head: 'on:\n  pull_request:\njobs:\n  compile:\n    name: Build\n  compile-2:\n    name: Build\n' } }, estimates: CEILINGS.estimates });
  assert.deepEqual(twice.map((i) => i.how.split(' at ')[0]), ['new job'], 'a removed job has one successor; the second copy is new');
});

// Each earlier escape from same-scope renewal, replayed against the tier-scope rules with no rename
// record anywhere: refused, or earning no credit.
const CI04 = () => clone(CEILINGS.exceptions[0]);
const laterGraphics = (over) => ({ ...CI04(), id: 'later', from: '2026-12-01', expires: '2026-12-30', ...over });
const invalidWhy = (ledger, known = null, today = '2026-12-05') => exceptionStatus(ledger, today, 30, known).invalid.map((e) => e.problems.join()).join(' | ');

test('Rule replay: a cover worded as a pattern over the same job needs a receipt', () => {
  assert.match(invalidWhy([CI04(), laterGraphics({ covers: ['job:ci.yml/Catalog calibration ${{ matrix.lane }}'] })]), /not the first graphics exception/);
});

test('Rule replay: a templated name in another tier is refused and earns no credit', () => {
  const ex = { ...laterGraphics({ tier: 'overhead', covers: ['job:ci.yml/E2E ${{ matrix.shardIndex }}/${{ matrix.shardTotal }} (full)'] }), from: '2026-10-25', expires: '2026-11-20' };
  assert.match(invalidWhy([ex], null, TODAY), /not in the overhead tier/);
  const m = { ...measurement({ overhead: 40 }), jobs: { 'ci.yml/E2E 1/6 (full)': { perLanding: 66, perDay: 0 } } };
  const wide = { ...ex, covers: ['job:ci.yml/${{ matrix.name }}'] };
  assert.match(assessTiers({ ceilings: noExceptions, measurement: m, items: [], today: TODAY, exceptions: [wide] }).tiers.overhead.why, /^40\/105 per landing/, 'no offline minutes credited to overhead');
});

test('Rule replay: renaming the covered job first still needs a receipt', () => {
  const known = new Set(['job:ci.yml/Catalog calibration gate (v2)']);
  assert.match(invalidWhy([CI04(), laterGraphics({ covers: ['job:ci.yml/Catalog calibration gate (v2)'] })], known), /not the first graphics exception/);
});

test('Rule replay: retiring the covered job and adding one under a new key and name still needs a receipt', () => {
  const known = new Set(['job:ci.yml/Catalog calibration fresh']);
  const why = invalidWhy([CI04(), laterGraphics({ covers: ['job:ci.yml/Catalog calibration fresh'], from: '2027-04-01', expires: '2027-04-30' })], known, '2027-04-05');
  assert.match(why, /not the first graphics exception/);
});

test('Rule replay: a duplicate id is refused in the ledger and invalid in the status', () => {
  const base = clone(CEILINGS);
  const head = clone(base);
  head.exceptions.unshift({ ...CI04(), perLanding: 40, from: '2026-11-25', expires: '2026-12-24' });
  assert.match(ledgerChanges({ base, head }).join(), /appears more than once/);
  assert.match(invalidWhy(head.exceptions), /repeats the id ci04-catalog-gate/);
});

test('Rule replay: moving the covered job to another workflow file still needs a receipt', () => {
  const known = new Set(['job:catalog-gates.yml/Catalog gate (PR)']);
  assert.match(invalidWhy([CI04(), laterGraphics({ covers: ['job:catalog-gates.yml/Catalog gate (PR)'] })], known), /not the first graphics exception/);
});

test('Rule replay: an existing job no measurement prices gets no waiver', () => {
  const ex = { ...CI04(), covers: ['job:ci.yml/Catalog calibration unpriced'], perLanding: 30, from: '2026-10-25', expires: '2026-11-20' };
  const item = { tier: 'graphics', id: 'job:ci.yml/Catalog calibration unpriced', perLanding: 4, perDay: 0, how: 'more runs of a job at 4 runner-min' };
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: measurement({ graphics: 2 }), items: [item], today: TODAY, exceptions: [ex] }).tiers.graphics.addedLanding, 4);
});

test('Rule replay: a made-up name is refused and still needs a receipt', () => {
  const why = invalidWhy([CI04(), laterGraphics({ covers: ['job:ci.yml/Catalog calibration zzz'] })], new Set(['job:ci.yml/Catalog calibration gate']));
  assert.match(why, /names no job or spec/);
  assert.match(why, /not the first graphics exception/);
});

test('Rule replay: a workflow file rename that moves a job\'s tier is priced as new there and earns no room', () => {
  const sweep = "on:\n  schedule:\n    - cron: '0 3 * * *'\njobs:\n  sweep:\n    name: Fit sweep\n";
  const [item] = priceAdditions({ workflows: { 'fit-sweep-renamed.yml': { base: sweep, head: sweep, baseFile: 'fit-sweep.yml' } }, estimates: CEILINGS.estimates });
  assert.equal(item.tier, 'overhead');
  const ex = { ...CI04(), id: 'sweep', tier: 'overhead', covers: [item.id], perLanding: 50, perDay: 50, from: '2026-10-25', expires: '2026-11-20' };
  const m = { ...measurement({}), jobs: { 'fit-sweep.yml/Fit sweep': { perLanding: 0, perDay: 3 } } };
  assert.equal(assessTiers({ ceilings: noExceptions, measurement: m, items: [item], today: TODAY, exceptions: [ex] }).tiers.overhead.addedDay, item.perDay, 'charged in full');
});
test('(d) a merged PR whose head was rewritten keeps the start an earlier read recorded', () => {
  const fake = (args) => {
    const route = args.at(-1);
    if (/pulls\?state=closed/.test(route)) return JSON.stringify([{ number: 9, created_at: '2026-10-28T07:00:00Z', merged_at: '2026-10-29T07:00:00Z', updated_at: '2026-10-29T07:00:00Z', head: { ref: 'f' } }]);
    if (/timeline/.test(route)) return JSON.stringify([{ event: 'head_ref_force_pushed', created_at: '2026-10-28T12:00:00Z' }]);
    if (/\/commits\?/.test(route)) return JSON.stringify([{ sha: 'new' }]);
    if (/\/statuses/.test(route)) return JSON.stringify([{ context: 'noacg/reviewed', state: 'success', created_at: '2026-10-28T12:30:00Z' }]);
    return '[]';
  };
  const window = [Date.parse('2026-10-24T00:00:00Z'), Date.parse('2026-10-31T00:00:00Z')];
  assert.equal(finishedPrs(makeReader(20, fake), ...window, 5).complete, false, 'without the recorded start: unknown, incomplete');
  const r = finishedPrs(makeReader(20, fake), ...window, 5, { '#9': '2026-10-28T08:00:00Z' });
  assert.equal(r.complete, true);
  assert.equal(r.samples.find((x) => x.measure === 'prReady').value, 23 * 60, 'from the recorded 08:00 start to the merge');
});
