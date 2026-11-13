// guards: src/output/swap.ts
//
// R20 (live-publishing designs/G3.md section 5, owner decision Q1): an output starts no new frame for
// a changed or added graphic while a Take waits to run there; it starts once that Take has run.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { createSwapper } = await import('../src/output/swap.ts');

test('a changed and an added graphic wait for the waiting Take before their frames start', async () => {
  const started = [];
  let release;
  const quietAsked = [];
  const stage = {
    prepare: (spec) => {
      started.push(`build ${spec.key}`);
      return { whenLoaded: new Promise(() => {}), warm: () => new Promise(() => {}), error: () => null, discard() {}, swapIn() {} };
    },
    add: (spec) => started.push(`add ${spec.key}`),
    remove() {},
    requestState() {},
    motion: () => null,
    replies: () => null,
    graphics: ['Strap'],
  };
  const swapper = createSwapper({
    stage,
    held: { Strap: 's1' },
    onAir: () => false,
    data: () => null,
    warmData: () => null,
    onSwapped() {},
    onAdded() {},
    onRemoved() {},
    changed() {},
    quiet: (graphic) => {
      quietAsked.push(graphic);
      return release ? Promise.resolve() : new Promise((r) => { release = r; });
    },
  });
  const spec = (key) => ({ key, html: '', css: '', js: '', assets: [], resolution: { width: 1920, height: 1080 }, fps: 25 });
  void swapper.apply({ v: 1, ver: { n: 2, at: '', h: 'h2', g: { Strap: 's2', Bug: 'b1' } }, resolution: { width: 1920, height: 1080 }, graphics: [spec('Strap'), spec('Bug')], cues: [] }, () => {});
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(started, [], 'nothing starts while a Take waits');
  assert.equal(quietAsked.length, 1);
  release();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(started, ['add Bug', 'build Strap'], 'both start once the Take has run');
});
