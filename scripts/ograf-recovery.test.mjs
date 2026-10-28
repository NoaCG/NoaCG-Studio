// WHAT A RESTARTED OUTPUT PUTS BACK OF A PUBLISHED FOREIGN OGRAF PACKAGE (src/control/ografRecovery.ts;
// E3.2b, AC-3): only what the Graphic's answers prove, never a custom action, and otherwise a state
// said to be not known until the operator re-cues. The late word of a replaced instance is refused
// (src/control/ografOutcome.ts `acceptOutcome`). The stage half (re-cue of a lost instance, a removed
// asset, a failed action) is e2e/foreign-ograf-sandbox.spec.ts; the reload through a real backend
// is e2e/configured/ograf-rundown.spec.ts.
// guards: src/control/ografRecovery.ts
import test from 'node:test';
import assert from 'node:assert/strict';

const { ografRestore, heldActions, UNKNOWN_ACTED, UNKNOWN_UNCONFIRMED, UNKNOWN_STEP } = await import('../src/control/ografRecovery.ts');
const { acceptOutcome, isOgrafInstance, ografOutcomeWords, readOgrafOutcome } = await import('../src/control/ografOutcome.ts');

const stateOf = (ograf) => ({ ograf });
const report = (ograf) => ({ state: stateOf(ograf) });
const up = { i: '0a1b2c3d', call: 'play', status: 'done', code: 200, step: 1, on: true };
const row = (t) => ({ graphic: 'Board', msg: { t } });

test('a Take the Graphic accepted comes back at its step, through its own lifecycle calls', () => {
  assert.deepEqual(ografRestore(report(up), true, []), { play: true, steps: 1, unknown: null });
  // Protocol 1 has no head: the report's own word decides.
  assert.deepEqual(ografRestore(report(up), undefined, []), { play: true, steps: 1, unknown: null });
  // The log says it went off since (a head with no Out row read is a report older than its Out).
  assert.deepEqual(ografRestore(report(up), false, []), { play: false, steps: 0, unknown: null });
  // Off on the output and off in the log: nothing to put back, nothing unknown.
  assert.deepEqual(ografRestore(report({ ...up, on: false, call: 'stop' }), false, []), { play: false, steps: 0, unknown: null });
});

test('an action is never repeated: the Take and step come back, and the state is said to be not known', () => {
  // Banked in the report (an action the old instance took) ...
  assert.deepEqual(ografRestore(report({ ...up, acted: true }), true, []), { play: true, steps: 1, unknown: UNKNOWN_ACTED });
  // ... or a row after the bank, which the catch-up reads past.
  assert.deepEqual(ografRestore(report(up), true, [row('event')]), { play: true, steps: 1, unknown: UNKNOWN_ACTED });
  // A Take after the bank replays from the log; an action after THAT Take is not repeated.
  assert.deepEqual(ografRestore(report(up), true, [row('update'), row('play'), row('event')]), { play: false, steps: 0, unknown: UNKNOWN_ACTED });
  // OGraf promises no Take undoes an action: one before a later Take still leaves it not known.
  assert.deepEqual(ografRestore(report({ ...up, acted: true }), true, [row('event'), row('update'), row('play'), row('next')]), { play: false, steps: 0, unknown: UNKNOWN_ACTED });
  assert.deepEqual(ografRestore(report(up), true, [row('event'), row('play')]), { play: false, steps: 0, unknown: UNKNOWN_ACTED });
  // With no action anywhere, a Take after the bank replays and is known by its own answer.
  assert.deepEqual(ografRestore(report(up), true, [row('update'), row('play'), row('next')]), { play: false, steps: 0, unknown: null });
  // An Out after it all: off, as the log says.
  assert.deepEqual(ografRestore(report({ ...up, acted: true }), true, [row('play'), row('event'), row('stop')]), { play: false, steps: 0, unknown: null });
});

test('a Take that was never confirmed is not repeated by itself: the operator re-cues', () => {
  for (const ograf of [
    { ...up, status: 'rejected', code: 503, on: false },
    { ...up, status: 'timeout', on: false },
    { i: null, status: 'unmounted', msg: 'its package could not be reached', on: false },
  ]) assert.deepEqual(ografRestore(report(ograf), true, []), { play: false, steps: 0, unknown: UNKNOWN_UNCONFIRMED }, JSON.stringify(ograf));
  assert.deepEqual(ografRestore(null, true, []), { play: false, steps: 0, unknown: UNKNOWN_UNCONFIRMED });
  assert.deepEqual(ografRestore({ state: { groups: {} } }, true, []), { play: false, steps: 0, unknown: UNKNOWN_UNCONFIRMED });
  // Up with no step its answers confirm: its Take comes back, its step is not known.
  assert.deepEqual(ografRestore(report({ ...up, step: null }), true, []), { play: true, steps: 0, unknown: UNKNOWN_STEP });
  assert.deepEqual(ografRestore(report({ ...up, step: 'end' }), true, []), { play: true, steps: 0, unknown: UNKNOWN_STEP });
  // What one restart could not prove stays unproven through the next, until the operator's re-cue.
  assert.deepEqual(ografRestore(report({ ...up, unknown: UNKNOWN_ACTED }), true, []), { play: true, steps: 1, unknown: UNKNOWN_ACTED });
  assert.deepEqual(ografRestore(report({ ...up, unknown: UNKNOWN_UNCONFIRMED, step: null }), true, []), { play: true, steps: 0, unknown: UNKNOWN_UNCONFIRMED });
  // A snap has no OGraf meaning: it is no Take, so the bank still decides.
  assert.deepEqual(ografRestore(report(up), true, [row('snap')]), { play: true, steps: 1, unknown: null });
  assert.deepEqual(ografRestore(null, true, [row('snap')]), { play: false, steps: 0, unknown: UNKNOWN_UNCONFIRMED });
});

test('the catch-up reads past every action on a package and nothing else', () => {
  const rows = [row('event'), { graphic: 'Strap', msg: { t: 'event' } }, row('update'), row('event')];
  const held = heldActions(rows, new Set(['Board']));
  assert.deepEqual([...held], [rows[0], rows[3]]);
  assert.equal(heldActions(rows, new Set()).size, 0);
});

test('a report from an instance the output replaced is refused, and only from then on', () => {
  const old = readOgrafOutcome(stateOf(up));
  const fresh = readOgrafOutcome(stateOf({ ...up, i: 'ffee0011', was: '0a1b2c3d', step: 0 }));
  assert.equal(fresh.was, '0a1b2c3d');
  // Before the new instance says so, the old one's word stands.
  assert.deepEqual(acceptOutcome([], old), { accept: true, replaced: [] });
  const after = acceptOutcome([], fresh);
  assert.deepEqual(after, { accept: true, replaced: ['0a1b2c3d'] });
  // The old instance's report on its way when the output reloaded lands after: refused.
  assert.equal(acceptOutcome(after.replaced, old).accept, false);
  assert.equal(acceptOutcome(after.replaced, fresh).accept, true);
  // Another output's instance is not touched by it.
  assert.equal(acceptOutcome(after.replaced, { ...old, i: '12345678' }).accept, true);
  // Bounded at 16 instances.
  let replaced = [];
  for (let n = 0; n < 20; n += 1) replaced = acceptOutcome(replaced, { ...fresh, i: `b${n}`, was: `a${n}` }).replaced;
  assert.equal(replaced.length, 16);
  assert.deepEqual(replaced.slice(0, 2), ['a4', 'a5']);
  assert.ok(isOgrafInstance('0a1b2c3d'));
  for (const bad of ['', 'A1', 'x', 'a'.repeat(33), 7, null]) assert.equal(isOgrafInstance(bad), false, String(bad));
  // `was` is read only as an instance id, and never as the instance itself.
  assert.equal(readOgrafOutcome(stateOf({ ...up, was: 'not-hex' })).was, undefined);
  assert.equal(readOgrafOutcome(stateOf({ ...up, was: up.i })).was, undefined);
});

test('a state not known is said so, apart from what the Graphic answered', () => {
  const o = readOgrafOutcome(stateOf({ ...up, acted: true, unknown: UNKNOWN_ACTED }));
  assert.equal(o.acted, true);
  assert.deepEqual(ografOutcomeWords('Board', o), { text: `Board: not known on the output (${UNKNOWN_ACTED})`, tone: 'unknown' });
  assert.equal(readOgrafOutcome(stateOf({ ...up, acted: 'yes' })).acted, undefined);
  assert.equal(readOgrafOutcome(stateOf({ ...up, unknown: 'x'.repeat(500) })).unknown.length, 200);
});

test('reading a hostile report stays linear', () => {
  const big = 'a'.repeat(4_000_000);
  const started = performance.now();
  readOgrafOutcome(stateOf({ ...up, was: big, unknown: big, msg: big, i: big }));
  readOgrafOutcome(stateOf({ ...up, was: `${'0'.repeat(32)}!`, unknown: big }));
  assert.ok(performance.now() - started < 500, 'bounded reads, no backtracking');
});
