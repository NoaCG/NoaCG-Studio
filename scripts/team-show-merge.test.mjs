// guards: src/model/teamShowMerge.ts
//
// The three-way merge a refused team save goes through (docs/TEAMS_PLAN.md §7 stage 4). It is pure,
// so these run it directly: Node strips the module's types on import, and its only import is a type.
//
// The case that earned this file: two members each add a graphic from the same base. Each add takes
// the lowest free layer, so both land on one number, and two graphics on one layer replace each
// other on air. The three-member walk in e2e/configured/teams.spec.ts found it.

import test from 'node:test';
import assert from 'node:assert/strict';

const { mergeTeamShow } = await import('../src/model/teamShowMerge.ts');

const AT = '2026-09-27T00:00:00.000Z';
const graphic = (id, layer) => ({ id, name: id, layer });
const show = (graphics, extra = {}) => ({ id: 'show', name: 'Show', graphics, updatedAt: '2026-09-26T00:00:00.000Z', ...extra });

test('two graphics added from the same base on one layer end up on two layers, theirs unmoved', () => {
  const base = show([graphic('anna', 20)]);
  const theirs = show([graphic('anna', 20), graphic('ben', 21)]);
  const ours = show([graphic('anna', 20), graphic('cleo', 21)]);
  const { doc, lost } = mergeTeamShow(base, ours, theirs, AT);
  const layers = Object.fromEntries(doc.graphics.map((g) => [g.id, g.layer]));
  assert.deepEqual(layers, { anna: 20, ben: 21, cleo: 22 });
  assert.deepEqual(lost, []);
});

test('the moved graphic skips every layer already in use', () => {
  const base = show([graphic('anna', 20), graphic('dan', 22)]);
  const theirs = show([graphic('anna', 20), graphic('dan', 22), graphic('ben', 21)]);
  const ours = show([graphic('anna', 20), graphic('dan', 22), graphic('cleo', 21)]);
  const { doc } = mergeTeamShow(base, ours, theirs, AT);
  assert.equal(doc.graphics.find((g) => g.id === 'cleo').layer, 23);
});

test('a layer shared with a graphic from before is somebody’s choice and is left alone', () => {
  // Ours puts the new graphic on anna's layer on purpose; theirs adds one elsewhere.
  const base = show([graphic('anna', 20)]);
  const theirs = show([graphic('anna', 20), graphic('ben', 21)]);
  const ours = show([graphic('anna', 20), graphic('cleo', 20)]);
  const { doc } = mergeTeamShow(base, ours, theirs, AT);
  assert.equal(doc.graphics.find((g) => g.id === 'cleo').layer, 20);
});

test('both new graphics are kept, and the other lists still merge per item', () => {
  const base = show([graphic('anna', 20)], { cues: [{ id: 'c-anna', sourceId: 'anna', label: 'Anna', values: {} }] });
  const theirs = show([graphic('anna', 20), graphic('ben', 21)], {
    cues: [
      { id: 'c-anna', sourceId: 'anna', label: 'Anna', values: {} },
      { id: 'c-ben', sourceId: 'ben', label: 'Ben', values: { f0: 'Ben' } },
    ],
  });
  const ours = show([graphic('anna', 20), graphic('cleo', 21)], {
    cues: [
      { id: 'c-anna', sourceId: 'anna', label: 'Anna', values: {} },
      { id: 'c-cleo', sourceId: 'cleo', label: 'Cleo', values: { f0: 'Cleo' } },
    ],
  });
  const { doc } = mergeTeamShow(base, ours, theirs, AT);
  assert.deepEqual(doc.graphics.map((g) => g.id).sort(), ['anna', 'ben', 'cleo']);
  assert.deepEqual(doc.cues.map((c) => c.id).sort(), ['c-anna', 'c-ben', 'c-cleo']);
  assert.equal(doc.updatedAt, AT);
});
