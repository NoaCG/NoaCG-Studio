// WHAT AN OUTPUT SAYS A PUBLISHED FOREIGN OGRAF PACKAGE DID (src/control/ografOutcome.ts; E3.2a,
// AC-2): the report's `state.ograf` read back on the production page, and the words it is shown in.
// Only the output's word counts: anything malformed is no word at all, never a success. The stage
// half (mount, same-layer rule, outcomes) is e2e/foreign-ograf-sandbox.spec.ts; the round trip
// through a real backend is e2e/configured/ograf-rundown.spec.ts.
// guards: src/control/ografOutcome.ts
import test from 'node:test';
import assert from 'node:assert/strict';

const { readOgrafOutcome, ografOutcomeWords, confirmedLines, packageLayerPeers, withPeersOff } = await import('../src/control/ografOutcome.ts');

const on = { i: '0a1b2c3d', call: 'play', status: 'done', code: 200, step: 1, on: true, data: { count: 3 } };

test('a report is read for what the Graphic did, and nothing malformed reads as a success', () => {
  assert.deepEqual(readOgrafOutcome({ ograf: on }), { i: '0a1b2c3d', call: 'play', status: 'done', code: 200, step: 1, on: true });
  assert.deepEqual(readOgrafOutcome({ groups: { main: 'in' }, ograf: { ...on, step: 'end' } }).step, 'end');
  assert.deepEqual(readOgrafOutcome({ ograf: { i: null, status: 'unmounted', msg: 'its package could not be reached', on: true } }), { i: null, status: 'unmounted', msg: 'its package could not be reached', on: false });
  for (const bad of [
    null,
    'x',
    { groups: {} },
    { ograf: [] },
    { ograf: { ...on, status: 'ok' } },
    { ograf: { ...on, status: 'unmounted ' } },
    { ograf: { ...on, call: 'eval' } },
    { ograf: { ...on, i: 'not-hex' } },
    { ograf: { ...on, i: 'a'.repeat(33) } },
    { ograf: { ...on, i: 7 } },
  ]) assert.equal(readOgrafOutcome(bad), null, JSON.stringify(bad));
  // A step that is not a whole step is not known; `on` is only ever the boolean true.
  assert.equal(readOgrafOutcome({ ograf: { ...on, step: -1 } }).step, null);
  assert.equal(readOgrafOutcome({ ograf: { ...on, step: 1.5 } }).step, null);
  assert.equal(readOgrafOutcome({ ograf: { ...on, on: 'true' } }).on, false);
  // A stranger's message is cut to its bound.
  assert.equal(readOgrafOutcome({ ograf: { ...on, status: 'rejected', msg: 'x'.repeat(201) } }).msg.length, 200);
  assert.equal(readOgrafOutcome({ ograf: { ...on, status: 'rejected', msg: 'x'.repeat(200) } }).msg.length, 200);
});

test('the words say what the OUTPUT says, never on air for anything but an accepted Take', () => {
  const w = (o) => ografOutcomeWords('Board', o);
  assert.deepEqual(w({ ...on, step: 1 }), { text: 'Board: on air on the output, step 2', tone: 'ok' });
  assert.deepEqual(w({ ...on, step: 'end' }), { text: 'Board: on air on the output, at its end', tone: 'ok' });
  assert.deepEqual(w({ ...on, step: null }), { text: 'Board: on air on the output', tone: 'ok' });
  assert.deepEqual(w({ ...on, call: 'stop', on: false }), { text: 'Board: off air on the output', tone: 'ok' });
  assert.deepEqual(w({ ...on, status: 'rejected', code: 409, msg: 'not now', on: false }), { text: 'Board: the graphic refused the Take (409: not now)', tone: 'bad' });
  assert.deepEqual(w({ ...on, call: 'custom', status: 'rejected', code: 500 }), { text: 'Board: the graphic refused the action (500)', tone: 'bad' });
  assert.deepEqual(w({ ...on, status: 'timeout' }), { text: 'Board: no answer to the Take', tone: 'unknown' });
  assert.deepEqual(w({ ...on, call: 'update', status: 'gone' }), { text: 'Board: replaced before it answered the update', tone: 'unknown' });
  assert.deepEqual(w({ ...on, status: 'refused', msg: 'It is on step 3 of 3; Out ends it.' }), { text: 'Board: the Take was not sent: It is on step 3 of 3; Out ends it.', tone: 'bad' });
  assert.deepEqual(w({ i: null, status: 'unmounted', msg: 'its package could not be reached', on: false }), { text: 'Board: the output could not load it (its package could not be reached)', tone: 'bad' });
});

test('the confirmed lines: one per package an output reported on, in pool order, nothing for the rest', () => {
  const reported = { Poll: { ...on, status: 'rejected', code: 409, on: false }, Board: on, Native: on };
  assert.deepEqual(confirmedLines(['Board', 'Poll', 'Quiet'], reported).map((l) => [l.name, l.tone]), [['Board', 'ok'], ['Poll', 'bad']]);
  assert.deepEqual(confirmedLines([], reported), []);
});

test('the same-layer rule: a package replaces what shares its layer and is replaced there; NoaCG graphics stack as before', () => {
  const pool = [
    { name: 'Strap', layer: 20, foreign: false },
    { name: 'Bug', layer: 21, foreign: false },
    { name: 'Board', layer: 21, foreign: true },
    { name: 'Poll', layer: 22, foreign: true },
    { name: 'Ticker', layer: 20, foreign: false },
  ];
  assert.deepEqual(packageLayerPeers(pool, 'Board'), ['Bug']);
  assert.deepEqual(packageLayerPeers(pool, 'Bug'), ['Board']);
  assert.deepEqual(packageLayerPeers(pool, 'Strap'), [], 'two NoaCG graphics on one layer: unchanged');
  assert.deepEqual(packageLayerPeers(pool, 'Poll'), []);
  assert.deepEqual(packageLayerPeers(pool, 'Gone'), []);
  assert.deepEqual(packageLayerPeers([...pool, { name: 'Card', layer: 21, foreign: true }], 'Board'), ['Bug', 'Card']);
});

test('a Take with the Outs it replaces: one command call when they fit, else the Outs first, none left out', () => {
  const take = [{ graphic: 'K', msg: { t: 'update', data: {} } }, { graphic: 'K', msg: { t: 'play' } }, { graphic: 'K', msg: { t: 'cue', cue: 'k' } }];
  const shape = (batches) => batches.map((b) => b.map((i) => `${i.graphic}:${i.msg.t}`).join('+'));
  assert.deepEqual(shape(withPeersOff([], take)), ['K:update+K:play+K:cue']);
  assert.deepEqual(shape(withPeersOff(['A', 'B'], take)), ['A:stop+A:cue+B:stop+B:cue+K:update+K:play+K:cue'], '7 items: one call');
  assert.deepEqual(shape(withPeersOff(['A', 'B', 'C'], take)), ['A:stop+A:cue+B:stop+B:cue+C:stop+C:cue', 'K:update+K:play+K:cue']);
  const five = withPeersOff(['A', 'B', 'C', 'D', 'E'], take);
  assert.deepEqual(five.map((b) => b.length), [8, 2, 3], 'no call past 8 items, every peer cleared');
});

test('reading a hostile report stays linear', () => {
  const time = (n) => {
    const state = { ograf: { ...on, msg: 'm'.repeat(n), data: { big: 'x'.repeat(n) } } };
    const t = process.hrtime.bigint();
    for (let k = 0; k < 20; k += 1) readOgrafOutcome(state);
    return Number(process.hrtime.bigint() - t) / 1e6;
  };
  time(1000);
  const small = Math.max(time(200_000), 0.5);
  const large = time(400_000);
  assert.ok(large < small * 6 + 5, `${small} ms then ${large} ms`);
});
