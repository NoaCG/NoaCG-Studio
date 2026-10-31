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
  evidenceOf, exceptionStatus, knownCovers, ledgerChanges, phasesFromLedger, phaseClock, pooledTiming, prClock, priceAdditions, queueClock, sustained,
  tableFreshness, tierOfJob, workflowShape,
} from './growth-controls.mjs';
import { ages, buildReport, carriedStarts, fetchLatest, makeReader, phaseIssueTitle, priceRuns, spread } from './growth-report.mjs';

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
  assert.equal(sweep.perDay, 4 * CEILINGS.estimates.newJobMinutes);
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

test('(b) the same scope is never renewed without a measured repayment, whatever it is called', () => {
  const first = { id: 'a', tier: 'graphics', covers: ['job:ci.yml/Catalog calibration gate'], perLanding: 17.7, owner: 'o', reviewed: 'https://github.com/NoaCG/NoaCG-Studio/issues/1#issuecomment-1', from: '2026-10-31', expires: '2026-11-30' };
  const renamed = { ...first, id: 'b-new-name', from: '2026-12-01', expires: '2026-12-30' };
  const st = exceptionStatus([first, renamed], '2026-12-02', 30);
  assert.deepEqual(st.invalid.map((e) => e.id), ['b-new-name']);
  assert.match(st.invalid[0].problems.join(), /renews the scope of a without a measured repayment/);
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
  const revised = clone(raised); revised.version = 2; revised.revisions = [{ version: 2, rationale: 'measured', authority: 'owner', reviewed: 'https://x/2' }];
  assert.deepEqual(ledgerChanges({ base, head: revised }), []);
  assert.match(ledgerChanges({ base, head: clone(base), mainRunners: { base: 13, head: 15 } }).join(), /MAIN_RUNNERS rose/);
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

test('(b) offline exception lines stay on record and a renewal for the same spec needs a measured repayment', () => {
  const md = (lines) => `## Budget exceptions\n\n${lines.join('\n')}\n`;
  const old = parseExceptions(md(['- e2e/sports.spec.ts: 1.1 min, protects the match clock, expires 2026-11-16'])).map((e) => ({ ...e, from: 'docs/work-specs/a/spec.md' }));
  assert.match(offlineExceptionChanges(old, []).join(), /removed or moved/);
  const renew = parseExceptions(md(['- e2e/sports.spec.ts: 1.1 min, protects the clock again, expires 2026-12-10'])).map((e) => ({ ...e, from: 'docs/work-specs/b/spec.md' }));
  assert.match(offlineExceptionChanges(old, [...old, ...renew]).join(), /without a measured repayment/);
  const repaid = parseExceptions(md(['- e2e/sports.spec.ts: 1.1 min, protects the clock again, repaid 0.6 min in run 41300000002, expires 2026-12-10'])).map((e) => ({ ...e, from: 'docs/work-specs/b/spec.md' }));
  assert.deepEqual(repaid[0].repaid, { minutes: 0.6, run: '41300000002' });
  assert.equal(repaid[0].protects, 'protects the clock again');
  assert.deepEqual(offlineExceptionChanges(old, [...old, ...repaid]), []);
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
  assert.deepEqual(Object.keys(lat.stops).sort(), ['backend', 'offline', 'overhead']);
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
  assert.equal(item.perDay, 23 * CEILINGS.estimates.newJobMinutes);
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
  const art = (expired, at, id) => ({ name: 'growth-report', expired, created_at: at, workflow_run: { id, head_branch: 'main' } });
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
  assert.match(st.invalid.find((e) => e.id === 'b').problems.join(), /renews the scope of a/, 'scope is what it covers, whatever the tier');
  const reworded = { ...first, id: 'c', covers: ['job:ci.yml/Catalog calibration gate (affected)'], from: '2026-12-01', expires: '2026-12-30' };
  assert.match(exceptionStatus([first, reworded], '2026-12-02', 30, known).invalid[0].problems.join(), /names no job or spec/);
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

test('(b) overlapping active exceptions never credit the same job twice', () => {
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
  assert.match(exceptionStatus(appended.exceptions, '2026-12-05', 30).invalid[0].problems.join(), /without a measured repayment/);
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
  assert.match(st.invalid.find((e) => e.id === 'catalog-gate-2').problems.join(), /renews the scope of ci04-catalog-gate without a measured repayment/);
  const later = { ...renamed, id: 'unrelated', from: '2027-03-01', expires: '2027-03-30' };
  assert.equal(exceptionStatus([ci04, later], '2027-03-05', 30, known).active.length, 1, 'months later, an orphaned entry no longer stands in the way');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'growth-restart-'));
  const gone = () => JSON.stringify({ artifacts: [{ name: 'growth-report', expired: true, created_at: '2026-09-01T00:00:00Z', workflow_run: { id: 1, head_branch: 'main' } }] });
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
