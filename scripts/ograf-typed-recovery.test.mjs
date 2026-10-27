// guards: src/control/outputRecovery.ts, src/control/airState.ts, src/output/main.ts, src/control/hostedReceiver.ts, src/components/HostedControlPage.tsx
//
// TYPED OGRAF DATA THROUGH A RELOAD (docs/work-specs/playout-ograf-contract/spec.md, E1.2b), in
// Node. The browser halves are e2e/output-typed-recovery.spec.ts (the real /output renderer: the
// typed baseline, the log below the reports, the renderer's round trip and the refusals) and
// e2e/hosted-control.spec.ts (the exported receiver refusing a typed row, #1761).
//   - AC-2, output replay and baseline: a report of typed data carries its envelope and steps; a
//     graphic no report banks is replayed from below the reports when its data on air is typed
//     (#1762), on as many tail pages as that takes; PROGRAM is rebuilt from the same baseline;
//   - AC-3, mixed versions: native recovery reads nothing new and replays nothing more;
//   - every limit pinned, and linear on hostile input.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './lib/tsResolve.mjs';

const {
  TYPED_STEPS_MAX, planOutputRecovery, reportedTyped, stepsAfter, unreportedPages, unreportedTypedRows,
} = await import('../src/control/outputRecovery.ts');
const { OGRAF_STANDARD, TYPED_VERSION, typedOutputGate } = await import('../src/model/ografTyped.ts');
const { airAtRequest, restoreItems, seedFromResolve } = await import('../src/control/airState.ts');
const { NO_AIR } = await import('../src/control/playoutSession.ts');
const { CONTROL_TAIL_PAGE } = await import('../src/control/logFollow.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFileSync(path.join(root, file), 'utf8');
const envelope = (values = { title: 'Results', round: 2, live: true }, v = TYPED_VERSION) => ({ v, kind: 'values', standard: OGRAF_STANDARD.commit, schema: 'hash', values });
const row = (seq, graphic, msg) => ({ id: seq, seq, graphic, msg });
const specs = { clocks: new Map(), pairs: new Map() };

test('a report says a graphic\'s typed data: its envelope as it came, and its steps from 0 to TYPED_STEPS_MAX', () => {
  assert.equal(TYPED_STEPS_MAX, 64);
  assert.equal(reportedTyped(null), null);
  assert.equal(reportedTyped({ data: { f0: 'x' }, state: { groups: { main: 'in' } } }), null, 'a native report says nothing');
  assert.equal(reportedTyped({ state: null }), null);
  const env = envelope();
  assert.deepEqual(reportedTyped({ state: { typed: env, steps: 3 } }), { typed: env, steps: 3 });
  assert.deepEqual(reportedTyped({ state: { typed: env, steps: 64 } }), { typed: env, steps: 64 });
  for (const steps of [65, -1, 1.5, '2', null, undefined, Number.NaN]) assert.equal(reportedTyped({ state: { typed: env, steps } }).steps, 0, String(steps));
  // An envelope that does not read is still reported as it came: the output's gate refuses it.
  assert.deepEqual(reportedTyped({ state: { typed: 'garbage' } }), { typed: 'garbage', steps: 0 });
});

test('steps since an entrance: a play or a pose starts at 0, a next adds one up to the cap, a stop forgets', () => {
  assert.equal(stepsAfter(undefined, { t: 'play' }), 0);
  assert.equal(stepsAfter(5, { t: 'snap' }), 0);
  assert.equal(stepsAfter(0, { t: 'next' }), 1);
  assert.equal(stepsAfter(undefined, { t: 'next' }), undefined, 'no entrance seen, no count');
  assert.equal(stepsAfter(2, { t: 'update' }), 2);
  assert.equal(stepsAfter(2, { t: 'event' }), 2);
  assert.equal(stepsAfter(2, { t: 'stop' }), undefined);
  let steps = 0;
  for (let i = 0; i < 100; i += 1) steps = stepsAfter(steps, { t: 'next' });
  assert.equal(steps, TYPED_STEPS_MAX);
});

test('#1762: a graphic on air that no report banks, with typed data on air, gets its commands from below the reports', () => {
  const typedTake = { t: 'update', data: {}, typed: envelope() };
  // First Take ever typed, then 1200 rows of another graphic, which reported at the end.
  const rows = [row(1, 'Strap', typedTake), row(2, 'Strap', { t: 'play' }), row(3, 'Strap', { t: 'next' }), row(4, 'Strap', { t: 'live', data: {} })];
  for (let seq = 5; seq <= 1204; seq += 1) rows.push(row(seq, 'Bug', { t: 'update', data: { f0: String(seq) } }));
  const plan = planOutputRecovery(['Strap', 'Bug'], { Bug: { data: {}, event: 1204 } });
  assert.equal(plan.followFrom, 1204, 'the replay starts above the Take: the defect');
  assert.deepEqual(unreportedTypedRows(['Strap'], rows).map((r) => r.seq), [1, 2, 3], 'its commands, never its status rows');
  // A data road's text leaves it typed; an operator's native update ends it, as on the output.
  assert.deepEqual(unreportedTypedRows(['Strap'], [...rows, row(1205, 'Strap', { t: 'update', data: { f0: 'x' }, src: 'api' })]).length, 4);
  assert.deepEqual(unreportedTypedRows(['Strap'], [...rows, row(1205, 'Strap', { t: 'update', data: { f0: 'x' } })]), []);
  // An envelope this build cannot read replays too: the output refuses and holds it again.
  assert.equal(unreportedTypedRows(['Strap'], [row(1, 'Strap', { t: 'update', data: {}, typed: envelope({}, 9) })]).length, 1);
  // A graphic not asked about, or a native one, gets nothing: native recovery is unchanged.
  assert.deepEqual(unreportedTypedRows(['Bug'], rows), []);
  assert.deepEqual(unreportedTypedRows([], rows), []);
});

test('the read below the reports takes every page up to followFrom, past the catch-up\'s own ceiling, and nothing by row id', () => {
  assert.equal(CONTROL_TAIL_PAGE, 500);
  assert.equal(unreportedPages(1203, true, CONTROL_TAIL_PAGE), 3);
  assert.equal(unreportedPages(499, true, CONTROL_TAIL_PAGE), 1);
  assert.equal(unreportedPages(500, true, CONTROL_TAIL_PAGE), 2);
  assert.equal(unreportedPages(0, true, CONTROL_TAIL_PAGE), 0, 'nothing below the start');
  assert.equal(unreportedPages(1203, false, CONTROL_TAIL_PAGE), 0, 'protocol 1 has no head to say what is on air');
  const main = source('src/output/main.ts');
  const ceiling = Number(/const MAX_CATCH_UP_PAGES = (\d+);/.exec(main)[1]);
  assert.ok(unreportedPages(30_000, true, CONTROL_TAIL_PAGE) > ceiling, 'a long log is read whole, not cut at the catch-up ceiling');
  // The output asks it only for graphics on air (the head) with no report, and puts their rows first.
  assert.match(main, /const unreported = stage\.graphics\.filter\(\(key\) => !resolved\.live\[key\] && headOn\.get\(key\) === true\);/);
  assert.match(main, /missed = unreportedTyped\.concat\(missed\);/);
});

test('the output banks typed data in its report, rebuilds it through the gate, and native reports are as they were', () => {
  const main = source('src/output/main.ts');
  // The report: native data unchanged; a typed graphic's data empty, its envelope and steps in state.
  assert.match(main, /const data = airingTyped \? \{\} : \(mergedData\.get\(graphic\) \?\? \{\}\);/);
  assert.match(main, /const state = airingTyped \? \{ \.\.\.\(withLook \?\? \{\}\), typed: typedEnvelope\.get\(graphic\), steps: stepsSince\.get\(graphic\) \?\? 0 \} : withLook;/);
  // Only a held graphic keeps its bank where it is.
  assert.match(main, /if \(typedRefused\.has\(graphic\)\) \{\n\s+forcedReports\.delete\(graphic\);/);
  assert.match(main, /if \(seq <= at \|\| typedRefused\.has\(graphic\)\) continue;/);
  // The boot: the baseline goes through the same gate a command does.
  assert.match(main, /const gate = typedOutputGate\(typed, key, msg\);/);
  // A baseline that does not read is held, with its reason, and airs nothing.
  const state = { held: new Map(), airing: new Set() };
  assert.deepEqual(typedOutputGate(state, 'Strap', { t: 'update', data: {}, typed: envelope({ f0: 'x' }, 2) }), { apply: false, changed: true });
  assert.match(state.held.get('Strap'), /cannot read this command/);
});

test('PROGRAM is rebuilt from a typed report: its envelope and look, its pose or steps, then the rows after it', () => {
  const look = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
  const env = envelope();
  const live = { Board: { data: {}, state: { typed: env, steps: 2, appearance: look }, event: 10 } };
  const boot = { ...NO_AIR, reports: live };
  const after = [{ graphic: 'Board', msg: { t: 'next' } }];
  const seeded = seedFromResolve(boot, { liveCue: { Board: 'c1' }, live }, after, airAtRequest(boot), [{ id: 'c1', values: { round: '1' } }], specs);
  assert.deepEqual(seeded.typedAired, { Board: env });
  assert.deepEqual(seeded.typedSteps, { Board: [{ t: 'next' }, { t: 'next' }, { t: 'next' }] });
  assert.deepEqual(restoreItems(seeded, {}, specs).items, [
    { graphic: 'Board', msg: { t: 'update', data: {}, typed: env, appearance: look } },
    { graphic: 'Board', msg: { t: 'play' } },
    { graphic: 'Board', msg: { t: 'next' } },
    { graphic: 'Board', msg: { t: 'next' } },
    { graphic: 'Board', msg: { t: 'next' } },
  ]);
  // With a pose, the pose is the step.
  const posed = { Board: { data: {}, state: { typed: env, steps: 0, groups: { main: 'in' } }, event: 10 } };
  const withPose = seedFromResolve({ ...NO_AIR, reports: posed }, { liveCue: { Board: 'c1' }, live: posed }, after, airAtRequest(NO_AIR), [], specs);
  assert.deepEqual(restoreItems(withPose, {}, specs).items.map((item) => item.msg.t), ['update', 'snap', 'next']);
  // A report whose envelope does not read rebuilds nothing typed from it.
  const later = { Board: { data: {}, state: { typed: envelope({}, 9), steps: 1 }, event: 10 } };
  const unread = seedFromResolve({ ...NO_AIR, reports: later }, { liveCue: { Board: 'c1' }, live: later }, [], airAtRequest(NO_AIR), [], specs);
  assert.deepEqual(unread.typedAired, {});
  // A native report rebuilds exactly as before.
  const native = { Board: { data: { f0: 'A' }, state: { groups: { main: 'in' } }, event: 10 } };
  const nativeAir = seedFromResolve({ ...NO_AIR, reports: native }, { liveCue: { Board: 'c1' }, live: native }, after, airAtRequest(NO_AIR), [], specs);
  assert.deepEqual(nativeAir.typedAired, {});
  assert.deepEqual(restoreItems(nativeAir, {}, specs).items, [
    { graphic: 'Board', msg: { t: 'update', data: { f0: 'A' } } },
    { graphic: 'Board', msg: { t: 'snap', snap: { main: 'in' } } },
    { graphic: 'Board', msg: { t: 'update', data: { f0: 'A' } } },
    { graphic: 'Board', msg: { t: 'next' } },
  ]);
  // The hosted page's PROGRAM reads the same baseline.
  assert.match(source('src/components/HostedControlPage.tsx'), /const typedBase = replay \? reportedTyped\(reportsRef\.current\[graphic\]\) : null;/);
});

test('the exported receiver refuses a typed row whole and holds, in ES5', () => {
  // The block is generated text an export embeds; its typed rule is read from the source here (the
  // module imports the app's backend config) and walked in a browser by e2e/hosted-control.spec.ts.
  const text = source('src/control/hostedReceiver.ts');
  const rule = text.slice(text.indexOf("  var refused = '';"), text.indexOf('  // Apply one command through'));
  assert.match(rule, /function held\(m\)/);
  assert.match(text, / {4}if \(held\(m\)\) return;\n/);
  // Chromium 71 (CasparCG 2.3) parses it: no syntax past ES5.
  const es5 = rule.replace('${JSON.stringify(RECEIVER_TYPED_REFUSAL)}', '"refused"');
  new Function(`${es5}; return held;`);
  assert.doesNotMatch(es5, /=>|\?\.|\?\?|\blet\b|\bconst\b|`/);
});

test('linear on hostile input: the steps, the rows below the reports and an envelope as large as the bounds allow', () => {
  const started = performance.now();
  for (const steps of [1e308, -1e308, 2 ** 53]) assert.equal(reportedTyped({ state: { typed: null, steps } }).steps, 0);
  const rows = Array.from({ length: 200_000 }, (_, i) => row(i, i % 2 ? 'Strap' : 'Bug', i % 3 ? { t: 'update', data: {}, typed: {} } : { t: 'next' }));
  assert.equal(unreportedTypedRows(['Strap'], rows).length, 100_000);
  let deep = 'x';
  for (let i = 0; i < 100_000; i += 1) deep = [deep];
  const state = { held: new Map(), airing: new Set() };
  assert.equal(typedOutputGate(state, 'Strap', { t: 'update', data: {}, typed: envelope({ deep }) }).apply, false);
  assert.ok(performance.now() - started < 1500, `${performance.now() - started} ms`);
});
