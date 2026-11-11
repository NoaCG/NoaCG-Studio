// guards: src/output/placeOnOutput.ts
// A Take's preset resolved on the output from its own box (live-publishing spec W1, phase 3): the
// graphic's commands wait behind the hinted update until its own measurement answers, then go in
// order with the resolved place; every other graphic and every unhinted command goes at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { createPlacer } = await import('../src/output/placeOnOutput.ts');
const A = await import('../src/control/cueAdjust.ts');

const HD = { width: 1920, height: 1080 };
const LT = { x: 120, y: 872, w: 410, h: 89 };
const box = (w) => ({ info: { ...LT, w }, paint: { ...LT, w }, minText: 30 });
const sent = { v: 1, frame: { dx: 100, dy: 0, s: 1, ox: 120, oy: 961 } };
const hint = { v: 1, place: 'br', anchor: 'bl', frame: HD, stage: HD };

function harness({ canPlace = () => true } = {}) {
  const applied = [];
  const measures = [];
  const deferred = [];
  const placer = createPlacer({
    apply: (graphic, msg) => applied.push({ graphic, msg }),
    canPlace,
    measure: (graphic, values, look) => new Promise((resolve) => measures.push({ graphic, values, look, resolve })),
    defer: (run) => deferred.push(run),
  });
  const runDeferred = () => { while (deferred.length) deferred.shift()(); };
  return { placer, applied, measures, runDeferred };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('a hinted Take waits for this output\'s measurement and lands at the preset, then what came behind it, in order', async () => {
  const h = harness();
  const update = { t: 'update', data: { name: 'Annabel Longname' }, appearance: sent, place: hint };
  h.placer.apply('G', update);
  h.placer.apply('G', { t: 'play' });
  h.placer.apply('G', { t: 'next' });
  h.placer.apply('Other', { t: 'play' });
  assert.deepEqual(h.applied.map((a) => `${a.graphic}:${a.msg.t}`), ['Other:play'], 'another graphic never waits');
  assert.equal(h.measures.length, 0, 'measuring starts after the task (the page sends first)');
  h.runDeferred();
  assert.deepEqual(h.measures.map((m) => [m.graphic, m.values]), [['G', { name: 'Annabel Longname' }]]);
  h.measures[0].resolve(box(520));
  await tick();
  assert.deepEqual(h.applied.map((a) => `${a.graphic}:${a.msg.t}`), ['Other:play', 'G:update', 'G:play', 'G:next']);
  const placed = h.applied[1].msg.appearance;
  assert.deepEqual(placed, A.placedAppearance(sent, hint, box(520)));
  assert.notDeepEqual(placed, sent);
});

test('no measurement (failed or capped): the place as sent, which an older output applies too', async () => {
  const h = harness();
  h.placer.apply('G', { t: 'update', data: {}, appearance: sent, place: hint });
  h.placer.apply('G', { t: 'play' });
  h.runDeferred();
  h.measures[0].resolve(null);
  await tick();
  assert.deepEqual(h.applied.map((a) => a.msg.t), ['update', 'play']);
  assert.deepEqual(h.applied[0].msg.appearance, sent);
});

test('nothing waits without a readable hint, for typed data, or where the stage may not place (off air, a package)', () => {
  for (const [msg, canPlace] of [
    [{ t: 'update', data: {}, appearance: sent }, () => true],
    [{ t: 'update', data: {}, appearance: sent, place: { v: 9 } }, () => true],
    [{ t: 'update', data: {}, appearance: sent, place: hint, typed: { v: 1 } }, () => true],
    [{ t: 'update', data: {}, appearance: sent, place: hint }, () => false],
  ]) {
    const h = harness({ canPlace });
    h.placer.apply('G', msg);
    h.placer.apply('G', { t: 'play' });
    assert.deepEqual(h.applied.map((a) => a.msg), [msg, { t: 'play' }]);
    assert.equal(h.measures.length + 0, 0);
  }
});

test('a graphic that leaves while it is being placed applies nothing later; a second hinted Take behind the first waits its own turn', async () => {
  const gone = harness();
  gone.placer.apply('G', { t: 'update', data: {}, appearance: sent, place: hint });
  gone.runDeferred();
  gone.placer.drop('G');
  gone.measures[0].resolve(box(520));
  await tick();
  assert.deepEqual(gone.applied, []);

  const h = harness();
  h.placer.apply('G', { t: 'update', data: { name: 'A' }, appearance: sent, place: hint });
  h.placer.apply('G', { t: 'play' });
  h.placer.apply('G', { t: 'update', data: { name: 'B' }, appearance: sent, place: hint });
  h.placer.apply('G', { t: 'play' });
  h.runDeferred();
  h.measures[0].resolve(box(300));
  await tick();
  assert.deepEqual(h.applied.map((a) => a.msg.t), ['update', 'play'], 'the second waits for its own measurement');
  h.runDeferred();
  assert.deepEqual(h.measures[1].values, { name: 'B' });
  h.measures[1].resolve(box(600));
  await tick();
  assert.deepEqual(h.applied.map((a) => a.msg.t), ['update', 'play', 'update', 'play']);
  assert.notDeepEqual(h.applied[0].msg.appearance, h.applied[2].msg.appearance);
});

test('an Out never waits on a measurement: what waits goes at once at the place sent, then the Out, and a late answer applies nothing', async () => {
  const h = harness();
  h.placer.apply('G', { t: 'update', data: { name: 'A' }, appearance: sent, place: hint });
  h.placer.apply('G', { t: 'play' });
  h.runDeferred();
  h.placer.apply('G', { t: 'stop' });
  assert.deepEqual(h.applied.map((a) => a.msg.t), ['update', 'play', 'stop']);
  assert.deepEqual(h.applied[0].msg.appearance, sent);
  assert.equal(h.placer.placing('G'), false);
  h.measures[0].resolve(box(520));
  await tick();
  assert.equal(h.applied.length, 3);
});
