// WHAT A RESTARTED OUTPUT PUTS BACK OF A PUBLISHED FOREIGN OGRAF PACKAGE (src/control/ografRecovery.ts;
// E3.2b, AC-3): only what the Graphic's answers prove, never a custom action, and otherwise a state
// said to be not known until the operator re-cues. The late word of a replaced instance is refused
// (src/control/ografOutcome.ts `acceptOutcome`). The stage half (re-cue of a lost instance, a removed
// asset, a failed action) is e2e/foreign-ograf-sandbox.spec.ts; the reload through a real backend
// is e2e/configured/ograf-rundown.spec.ts.
// guards: src/control/ografRecovery.ts, src/output/catchUp.ts
import test from 'node:test';
import assert from 'node:assert/strict';

const { ografRestore, heldActions, RESTORE_STEPS_MAX, UNKNOWN_ACTED, UNKNOWN_UNCONFIRMED, UNKNOWN_STEP, UNKNOWN_OUT } = await import('../src/control/ografRecovery.ts');
const { acceptOutcome, isOgrafInstance, ografOutcomeWords, readOgrafOutcome } = await import('../src/control/ografOutcome.ts');

const stateOf = (ograf) => ({ ograf });
const report = (ograf) => ({ state: stateOf(ograf) });
const up = { i: '0a1b2c3d', call: 'play', status: 'done', code: 200, step: 1, on: true };
const row = (t) => ({ graphic: 'Board', msg: { t } });

test('a Take the Graphic accepted comes back at its step, through its own lifecycle calls', () => {
  assert.deepEqual(ografRestore(report(up), true, []), { play: true, steps: 1, unknown: null });
  // Protocol 1 has no head: the report's own word decides.
  assert.deepEqual(ografRestore(report(up), undefined, []), { play: true, steps: 1, unknown: null });
  // The log says an Out went, but the Graphic's last word left it up (it refused the Out, or its
  // answer was not banked yet): a restart does not undo the operator's Out, and says it is unconfirmed.
  assert.deepEqual(ografRestore(report({ ...up, call: 'stop', status: 'rejected', code: 409 }), false, []), { play: false, steps: 0, unknown: UNKNOWN_OUT });
  assert.deepEqual(ografRestore(report(up), false, []), { play: false, steps: 0, unknown: UNKNOWN_OUT });
  // With no head, the report's own last call says it: a refused Out stays off, not known.
  assert.deepEqual(ografRestore(report({ ...up, call: 'stop', status: 'rejected', code: 409 }), undefined, []), { play: false, steps: 0, unknown: UNKNOWN_OUT });
  // A second restart of a package the first left off and not known keeps saying so.
  assert.deepEqual(ografRestore(report({ ...up, call: 'mount', on: false, step: null, unknown: UNKNOWN_OUT }), false, []), { play: false, steps: 0, unknown: UNKNOWN_OUT });
  // Off in the log and off by the Graphic's word: nothing.
  assert.deepEqual(ografRestore(report({ ...up, call: 'stop', on: false }), false, []), { play: false, steps: 0, unknown: null });
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
  // An action pressed on a package that is off, after the bank: not delivered, and said.
  for (const head of [undefined, false]) assert.deepEqual(ografRestore(report({ ...up, call: 'stop', on: false }), head, [row('event')]), { play: false, steps: 0, unknown: UNKNOWN_ACTED }, `head ${head}`);
  // ... and after an Out among the rows after the bank: an Out before the action does not clear it.
  assert.deepEqual(ografRestore(report(up), true, [row('stop'), row('event')]), { play: false, steps: 0, unknown: UNKNOWN_ACTED });
  // An Out after it does not undo it either: off, and still not known.
  assert.deepEqual(ografRestore(report(up), undefined, [row('event'), row('stop')]), { play: false, steps: 0, unknown: UNKNOWN_ACTED });
  // Take, action, Out, Take on one instance, banked: the action is still on that instance only.
  for (const head of [true, undefined]) assert.deepEqual(ografRestore(report({ ...up, step: 0, acted: true }), head, []), { play: true, steps: 0, unknown: UNKNOWN_ACTED }, `head ${head}`);
  // Banked: an accepted Out ends the stage's count, so `acted` while off is an action after the Out.
  assert.deepEqual(ografRestore(report({ ...up, call: 'custom', on: false, step: null, acted: true }), false, []), { play: false, steps: 0, unknown: UNKNOWN_ACTED });
  assert.deepEqual(ografRestore(report({ ...up, call: 'stop', on: false, step: null }), undefined, []), { play: false, steps: 0, unknown: null });
  // An Out after it all: off, as the log says, and the action still not repeated.
  assert.deepEqual(ografRestore(report({ ...up, acted: true }), true, [row('play'), row('event'), row('stop')]), { play: false, steps: 0, unknown: UNKNOWN_ACTED });
  assert.deepEqual(ografRestore(report(up), true, [row('play'), row('stop')]), { play: false, steps: 0, unknown: null });
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
  // A stranger's step is bounded before it becomes calls: at the bound it is walked, past it the Take
  // comes back at its first step and the step is not known.
  assert.equal(RESTORE_STEPS_MAX, 32);
  assert.deepEqual(ografRestore(report({ ...up, step: 32 }), true, []), { play: true, steps: 32, unknown: null });
  assert.deepEqual(ografRestore(report({ ...up, step: 33 }), true, []), { play: true, steps: 0, unknown: UNKNOWN_STEP });
  assert.deepEqual(ografRestore(report({ ...up, step: 1e12 }), true, []), { play: true, steps: 0, unknown: UNKNOWN_STEP });
  // What one restart could not prove stays unproven through the next, until the operator's re-cue.
  assert.deepEqual(ografRestore(report({ ...up, unknown: UNKNOWN_ACTED }), true, []), { play: true, steps: 1, unknown: UNKNOWN_ACTED });
  assert.deepEqual(ografRestore(report({ ...up, unknown: UNKNOWN_UNCONFIRMED, step: null }), true, []), { play: true, steps: 0, unknown: UNKNOWN_UNCONFIRMED });
  // A Take or Out banked before its answer (`sent`): `on` is the state before it, on either road.
  // An Out keeps it off; a Take puts back only what was proven up, at its first step; not known.
  for (const head of [undefined, false]) assert.deepEqual(ografRestore(report({ ...up, step: null, sent: 'stop' }), head, []), { play: false, steps: 0, unknown: UNKNOWN_OUT }, `head ${head}`);
  assert.deepEqual(ografRestore(report({ ...up, step: null, sent: 'stop', acted: true }), undefined, []), { play: false, steps: 0, unknown: UNKNOWN_ACTED });
  // A refused Out stays `sent` through later calls (output/stage.ts): a later update is no proof.
  assert.deepEqual(ografRestore(report({ ...up, call: 'update', sent: 'stop' }), undefined, []), { play: false, steps: 0, unknown: UNKNOWN_OUT });
  for (const head of [undefined, true]) {
    assert.deepEqual(ografRestore(report({ ...up, step: null, sent: 'play' }), head, []), { play: true, steps: 0, unknown: UNKNOWN_UNCONFIRMED }, `head ${head}`);
    assert.deepEqual(ografRestore(report({ ...up, on: false, step: null, sent: 'play' }), head, []), { play: false, steps: 0, unknown: UNKNOWN_UNCONFIRMED }, `head ${head}`);
  }
  // A step pending on the row-id road: up as proven, its step not known.
  assert.deepEqual(ografRestore(report({ ...up, step: null }), undefined, []), { play: true, steps: 0, unknown: UNKNOWN_STEP });
  // Rows after the bank still decide over the marker.
  assert.deepEqual(ografRestore(report({ ...up, step: null, sent: 'stop' }), undefined, [row('play')]), { play: false, steps: 0, unknown: null });
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

test('a row read past still goes through the typed gate: an unreadable one holds its graphic, and the Take after it is refused', async () => {
  const { readPastGate } = await import('../src/control/ografRecovery.ts');
  const { typedOutputGate } = await import('../src/model/ografTyped.ts');
  const typed = { held: new Map(), airing: new Set() };
  // An action whose envelope this build cannot read, read past by the catch-up (never sent).
  assert.equal(readPastGate(typed, { graphic: 'Board', msg: { t: 'event', event: 'mark', typed: { v: 999 } } }), true);
  assert.equal(typed.held.has('Board'), true, 'held, as delivering it would have held it');
  // The Take after it in the log is refused by the same gate, as on the output that first had it.
  assert.equal(typedOutputGate(typed, 'Board', { t: 'play' }).apply, false);
  // A readable action read past changes nothing.
  const clear = { held: new Map(), airing: new Set() };
  assert.equal(readPastGate(clear, { graphic: 'Board', msg: { t: 'event', event: 'mark', payload: {} } }), false);
  assert.equal(clear.held.size, 0);
});

test('a package the boot did not take is not stepped: its steps are read past until its next Take or Out', async () => {
  const { heldSteps, bootGap } = await import('../src/control/ografRecovery.ts');
  // Its Take was not proven (`sent`), and a Next went before the restart: the step is not sent.
  assert.deepEqual(ografRestore(report({ ...up, on: false, step: null, sent: 'play' }), true, [row('next')]).play, false);
  const rows = [row('next'), row('update'), row('next'), row('play'), row('next'), { graphic: 'Strap', msg: { t: 'next' } }];
  const steps = heldSteps(rows, new Set(['Board']));
  assert.deepEqual([...steps.held], [rows[0], rows[2]], 'up to its Take, never after it, never another graphic');
  assert.deepEqual([...steps.untaken], []);
  const off = heldSteps([row('next'), row('stop'), row('next')], new Set(['Board']));
  assert.equal(off.held.size, 1, 'an Out among them is the operator taking it out: what follows replays');
  assert.deepEqual([...heldSteps([row('update')], new Set(['Board'])).untaken], ['Board']);
  // Unread history keeps reading its steps past until its Take there.
  const gap = bootGap(true, new Set(['Board']), [], 4, () => false, ['Board']);
  const history = [row('next'), row('play'), row('next'), row('update')];
  assert.deepEqual([...gap.batch(history, true).readPast], [history[0]]);
  assert.equal(bootGap(false, new Set(['Board']), [], 4, () => false, ['Board']).batch([row('next')], true).readPast.size, 0);
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
  // Two reloads whose reports arrive out of order: C (was B), then B (was A), then A. B is refused
  // and still records that it replaced A, so A is refused too.
  const c = { ...fresh, i: 'cccc0003', was: 'bbbb0002' };
  const b2 = { ...fresh, i: 'bbbb0002', was: 'aaaa0001' };
  const a1 = { ...old, i: 'aaaa0001' };
  const r1 = acceptOutcome([], c);
  const r2 = acceptOutcome(r1.replaced, b2);
  assert.equal(r2.accept, false);
  assert.equal(acceptOutcome(r2.replaced, a1).accept, false);
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
  assert.equal(readOgrafOutcome(stateOf({ ...up, sent: 'event' })).sent, undefined);
  assert.equal(readOgrafOutcome(stateOf({ ...up, sent: 'stop' })).sent, 'stop');
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

test('a boot comes back on air once its packages have settled, and never later than its cap', async () => {
  const { airWhenSettled } = await import('../src/output/catchUp.ts');
  const stage = (ografSettled) => {
    let visible = false;
    return {
      graphics: [],
      requestState() {},
      motion: new Map(),
      replies: new Map(),
      whenLoaded: () => Promise.resolve(),
      setVisible: (v) => (visible = v),
      ografSettled,
      visible: () => visible,
    };
  };
  const timing = { floorMs: 0, capMs: 300, pollMs: 10 };
  // A package whose calls settle at 120 ms: the reveal waits for them.
  let settledAt = 0;
  const started = Date.now();
  const late = stage(() => new Promise((r) => setTimeout(() => ((settledAt = Date.now()), r()), 120)));
  await airWhenSettled(late, timing);
  assert.ok(settledAt > 0 && settledAt - started >= 100, 'waited for the package');
  assert.equal(late.visible(), true);
  // A package that never settles holds it no longer than the cap.
  const t0 = Date.now();
  const never = stage(() => new Promise(() => {}));
  assert.equal(await airWhenSettled(never, timing), 'cap');
  assert.ok(Date.now() - t0 < 1_000, 'the cap holds');
  assert.equal(never.visible(), true);
});

test('protocol 2: unread history reads a package action past, page after page, until its end', async () => {
  const { bootGap } = await import('../src/control/ografRecovery.ts');
  const ev = (graphic = 'Board') => ({ graphic, msg: { t: 'event' } });
  const take = { graphic: 'Board', msg: { t: 'play' } };
  const page = (n, ...head) => [...head, ...Array.from({ length: n - head.length }, () => ({ graphic: 'Strap', msg: { t: 'update' } }))];
  // A catch-up that read to the end leaves nothing to read past.
  assert.equal(bootGap(false, new Set(['Board']), [], 4).batch([ev()], true).readPast.size, 0);
  const gap = bootGap(true, new Set(['Board']), [], 4);
  // A full first page: Board's action is read past (a NoaCG graphic's never is), Board is marked.
  const first = page(4, ev(), ev('Strap'));
  const one = gap.batch(first, true);
  assert.deepEqual([...one.readPast], [first[0]]);
  assert.deepEqual(one.mark, ['Board']);
  assert.equal(gap.open, true, 'a full page says nothing of the next');
  // A Take on the next full page cannot clear the mark: it is said again after that batch.
  assert.deepEqual(gap.batch(page(4, take), true).mark, ['Board']);
  // A short page reached the end: it still marks, and the gap closes.
  assert.deepEqual(gap.batch([ev()], true).mark, ['Board']);
  assert.equal(gap.open, false);
  assert.equal(gap.batch([ev()], true).readPast.size, 0, 'a later action is sent');
  // A live batch closes it at once, and its own Take is the operator's: it marks nothing.
  const live = bootGap(true, new Set(['Board']), ['Board'], 4);
  assert.deepEqual(live.batch([take], false), { readPast: new Set(), mark: [] });
  assert.equal(live.open, false);
  // An empty read is the end, with the boot's own action marks said once more.
  const empty = bootGap(true, new Set(['Board']), ['Board'], 4);
  assert.deepEqual(empty.batch(page(4, take), true).mark, ['Board'], "the boot's mark survives a Take in history");
  assert.deepEqual(empty.emptyRead(), ['Board']);
  assert.equal(empty.open, false);
  // An Out after the action does not end it, nor a Take after that, as `ografRestore` reads it.
  const out = bootGap(true, new Set(['Board']), [], 4);
  assert.deepEqual(out.batch([ev(), { graphic: 'Board', msg: { t: 'stop' } }, take], true).mark, ['Board']);
  // A row Board's own report already holds (the refill starts at an older graphic's bank) neither
  // marks nor ends a mark, and still counts towards a page.
  const at = (seq, t) => ({ seq, graphic: 'Board', msg: { t } });
  const banked = bootGap(true, new Set(['Board']), [], 4, (r) => r.seq !== undefined && r.seq <= 100);
  const refill = [at(50, 'event'), ...page(3)];
  assert.deepEqual(banked.batch(refill, true), { readPast: new Set(), mark: [] }, 'a held action is no omitted one');
  assert.equal(banked.open, true, 'a full page, covered rows counted');
  const held = bootGap(true, new Set(['Board']), ['Board'], 4, (r) => r.seq !== undefined && r.seq <= 100);
  assert.deepEqual(held.batch([at(60, 'stop'), ...page(3)], true).mark, ['Board'], 'a banked Out does not end a mark');
});

test('protocol 1: unread history closes only once a short read is applied, by id, never by a live row', async () => {
  const { bootGap } = await import('../src/control/ografRecovery.ts');
  const row = (id, t = 'update', graphic = 'Board') => ({ id, graphic, msg: { t } });
  const gap = bootGap(true, new Set(['Board']), [], 3);
  // A full read names no end; its action is read past and marked.
  assert.deepEqual(gap.tailRead([row(11), row(12), row(13)], 10), []);
  assert.deepEqual(gap.row(row(11, 'event'), true), { readPast: true, mark: ['Board'] });
  // A live row, even past the cursor, says nothing of history committed late below it.
  assert.deepEqual(gap.row(row(99, 'event'), false), { readPast: false, mark: [] });
  assert.equal(gap.open, true);
  // A short read names its last id; the gap closes once that row is applied, marks said once more.
  assert.deepEqual(gap.tailRead([row(14), row(15)], 13), []);
  assert.deepEqual(gap.row(row(14, 'event'), true), { readPast: true, mark: ['Board'] });
  assert.deepEqual(gap.row(row(15), true), { readPast: false, mark: ['Board'] });
  assert.equal(gap.open, false);
  assert.deepEqual(gap.row(row(16, 'event'), true), { readPast: false, mark: [] }, 'a later action is sent');
  // A short read whose rows another walk already applied closes at once (the follow drops duplicates).
  const dup = bootGap(true, new Set(['Board']), ['Board'], 3);
  assert.deepEqual(dup.tailRead([row(8), row(9)], 9), ['Board']);
  assert.equal(dup.open, false);
  // An empty read is the end too.
  const empty = bootGap(true, new Set(['Board']), [], 3);
  assert.deepEqual(empty.tailRead([], 5), []);
  assert.equal(empty.open, false);
  // A row Board's own report already holds is not read past and ends no mark.
  const banked = bootGap(true, new Set(['Board']), ['Board'], 3, (r) => r.id <= 20);
  assert.deepEqual(banked.row(row(18, 'event'), true), { readPast: false, mark: ['Board'] });
  assert.deepEqual(banked.row(row(19, 'stop'), true), { readPast: false, mark: ['Board'] });
});
