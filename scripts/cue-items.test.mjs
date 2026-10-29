// guards: src/control/cueItems.ts
//
// What a Take, an Out and All out put on the wire (production-page refactor phase 2, spec §2 and
// §5.3 "Take", "Out", "All out"). Both playout surfaces send these lists, and a rehearsal stage
// applies the same ones, so the order and the batch bound are pinned here as data.

import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAllCueBatches, clearCueItems, takeCueItems } from '../src/control/cueItems.ts';

test('a Take sends its values, then play, then its cue marker, on its own layer', () => {
  assert.deepEqual(takeCueItems({ id: 'c1', graphic: 'Lower', values: { f0: 'Ada' } }), [
    { graphic: 'Lower', msg: { t: 'update', data: { f0: 'Ada' } } },
    { graphic: 'Lower', msg: { t: 'play' } },
    { graphic: 'Lower', msg: { t: 'cue', cue: 'c1' } },
  ]);
});

test('the marker carries direct and the arm only when given', () => {
  const auto = { at: 5, then: 'out' };
  const [, , marker] = takeCueItems({ id: 'c1', graphic: 'Bug', values: {}, direct: true, auto });
  assert.deepEqual(marker, { graphic: 'Bug', msg: { t: 'cue', cue: 'c1', direct: true, auto } });
  const [, , plain] = takeCueItems({ id: 'c1', graphic: 'Bug', values: {}, direct: false, auto: null });
  assert.deepEqual(plain.msg, { t: 'cue', cue: 'c1' });
});

test('an Out stops one layer and clears its marker', () => {
  assert.deepEqual(clearCueItems('Bug'), [
    { graphic: 'Bug', msg: { t: 'stop' } },
    { graphic: 'Bug', msg: { t: 'cue', cue: null } },
  ]);
});

test('All out batches four layers per call, silent, in the given order', () => {
  const graphics = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const batches = clearAllCueBatches(graphics);
  assert.deepEqual(batches.map((b) => b.length), [8, 8, 2], 'eight items is the most one call takes');
  const flat = batches.flat();
  assert.deepEqual([...new Set(flat.map((i) => i.graphic))], graphics);
  for (const item of flat) {
    if (item.msg.t === 'stop') assert.equal(item.msg.sound, false, 'an All out plays no out sound');
    else assert.deepEqual(item.msg, { t: 'cue', cue: null });
  }
  assert.deepEqual(clearAllCueBatches([]), []);
});
