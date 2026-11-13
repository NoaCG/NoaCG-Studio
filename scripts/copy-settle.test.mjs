// guards: src/model/copySettle.ts, src/model/teamShowMerge.ts, src/model/rundownHistory.ts
//
// THE PRODUCTION'S COPY IS THE ONLY TRUTH (live-publishing W2, docs/work-specs/live-publishing/
// designs/G1.md sections 3 and 5, rules R3, R4, R7, R8). Before a production is sent, a copy that no
// copy-truth build stamped and whose design differs from the server's copy takes the server's design:
// a design an older page pulled from the library is dropped, and nothing else changes. The settle is
// checked against a reference written from the rules, not a copy of the production code.

import test from 'node:test';
import assert from 'node:assert/strict';

const { settleGraphics, stamped, isOwnReaderRemoval, needsSettle } = await import('../src/model/copySettle.ts');
const { mergeTeamShow } = await import('../src/model/teamShowMerge.ts');
const { stripLiveData, LIVE_DATA_OPEN, LIVE_DATA_CLOSE } = await import('../src/model/liveDataMark.ts');

const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-02T10:00:00.000Z';
const T2 = '2026-11-03T10:00:00.000Z';
const NOW = '2026-11-12T10:00:00.000Z';

const tpl = (html, name = 'Strap', js = '') => ({ name, html, css: '', js, assets: [], fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: '' }] });
const copy = (over = {}) => ({ id: 'g1', name: 'Strap', type: 'lower-third', savedAt: T0, template: tpl('<p>base</p>'), graphicId: 'lib-1', layer: 20, ...over });

/** THE REFERENCE, from R4 and section 3 in plain steps: for each copy, if the base has the same id,
 *  the copy is unstamped, and its design differs (template without its name, savedAt, designAt,
 *  graphicId), the base's design wins, unless the copy is exactly the base with its Sheet block
 *  stripped; the pool name and every placement member stay the copy's. */
function reference(graphics, base) {
  return graphics.map((g) => {
    const b = base.find((x) => x.id === g.id);
    if (!b) return g;
    if (g.designAt !== undefined && g.designAt === g.savedAt) return g;
    const design = (x) => JSON.stringify([{ ...x.template, name: '' }, x.savedAt, x.designAt ?? null, x.graphicId ?? null]);
    if (design(g) === design(b)) return g;
    const strippedBase = stripLiveData(b.template.js ?? '');
    if (strippedBase !== (b.template.js ?? '') && g.template.js === strippedBase && JSON.stringify({ ...g.template, js: '', name: '' }) === JSON.stringify({ ...b.template, js: '', name: '' })) {
      return { ...g, savedAt: NOW, designAt: NOW };
    }
    const out = { ...g, template: { ...b.template, name: g.name }, savedAt: b.savedAt };
    if (b.designAt === undefined) delete out.designAt; else out.designAt = b.designAt;
    if (b.graphicId === undefined) delete out.graphicId; else out.graphicId = b.graphicId;
    return out;
  });
}

const settle = (graphics, base) => settleGraphics(graphics, base, NOW);
const sameAsReference = (graphics, base) => {
  const got = settle(graphics, base).graphics;
  assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(reference(graphics, base))));
  return got;
};

test('a design an older page pulled from the library is dropped; placement edits stay (R4, E3)', () => {
  const base = [copy()];
  // An old publish copied a newer library design in: savedAt moved, no stamp.
  const pulled = copy({ template: tpl('<p>library v2</p>'), savedAt: T1, layer: 31, adjust: { x: 5 } });
  const [out] = sameAsReference([pulled], base);
  assert.equal(out.template.html, '<p>base</p>');
  assert.equal(out.savedAt, T0);
  assert.equal(out.layer, 31, 'a placement edit made beside the pull stays');
  assert.deepEqual(out.adjust, { x: 5 });
  assert.equal(settle([pulled], base).changed, true);
});

test('the base copy need not be stamped: the rule never asks (round 3 finding 5)', () => {
  const base = [copy({ designAt: undefined })];
  const pulled = copy({ template: tpl('<p>library v2</p>'), savedAt: T1 });
  assert.equal(sameAsReference([pulled], base)[0].template.html, '<p>base</p>');
});

test('adding again a graphic the production held is a pull, and is dropped, link included', () => {
  const base = [copy({ designAt: T0 })];
  // The old addGraphicToShow kept the pool id, built a fresh object from another library record.
  const readded = { id: 'g1', name: 'Strap', type: 'lower-third', savedAt: T2, template: tpl('<p>other record</p>'), graphicId: 'lib-9', layer: 20 };
  const [out] = sameAsReference([readded], base);
  assert.equal(out.graphicId, 'lib-1', 'the base link comes back with its design (round 2 finding 6)');
  assert.equal(out.designAt, T0);
});

test('a stamped copy is a copy-truth build\'s own design and stays (Update, add, undo)', () => {
  const base = [copy()];
  const updated = copy({ template: tpl('<p>updated</p>'), savedAt: T2, designAt: T2 });
  assert.equal(sameAsReference([updated], base)[0].template.html, '<p>updated</p>');
  assert.equal(settle([updated], base).changed, false);
});

test('a graphic the base does not hold stays as it is: an explicit add', () => {
  const added = copy({ id: 'g2', name: 'New', template: tpl('<p>new</p>', 'New'), savedAt: T2 });
  assert.equal(sameAsReference([added], [copy()])[0].template.html, '<p>new</p>');
});

test('the exact own-reader removal is kept and stamped; anything more is a pull', () => {
  const reader = `${LIVE_DATA_OPEN}\nread();\n${LIVE_DATA_CLOSE}\nmain();\n`;
  const base = [copy({ template: tpl('<p>x</p>', 'Strap', reader) })];
  const removed = copy({ template: tpl('<p>x</p>', 'Strap', stripLiveData(reader)), savedAt: T1 });
  assert.ok(isOwnReaderRemoval(removed.template, base[0].template));
  const [out] = sameAsReference([removed], base);
  assert.equal(out.template.js, stripLiveData(reader));
  assert.ok(stamped(out));
  const more = copy({ template: tpl('<p>changed too</p>', 'Strap', stripLiveData(reader)), savedAt: T1 });
  assert.equal(isOwnReaderRemoval(more.template, base[0].template), false);
  assert.equal(sameAsReference([more], base)[0].template.html, '<p>x</p>');
});

test('the template\'s own name is placement: a rename in place is no design change, and stays the pool name', () => {
  const base = [copy()];
  const renamed = copy({ name: 'Strap 2', template: tpl('<p>base</p>', 'Strap 2') });
  assert.equal(settle([renamed], base).changed, false);
  const renamedAndPulled = copy({ name: 'Strap 2', template: tpl('<p>pulled</p>', 'Strap 2'), savedAt: T1 });
  const [out] = sameAsReference([renamedAndPulled], base);
  assert.equal(out.template.name, 'Strap 2');
  assert.equal(out.name, 'Strap 2');
});

test('no base, nothing to settle against: the record is sent as stored', () => {
  const g = [copy({ savedAt: T1, template: tpl('<p>pulled</p>') })];
  assert.equal(settle(g, null).changed, false);
  assert.equal(needsSettle(g), true);
  assert.equal(needsSettle([copy({ designAt: T0 })]), false);
});

// R7: the team merge takes a graphic's design members and its placement apart.
const show = (graphics, over = {}) => ({ id: 'show-1', name: 'P', version: 2, updatedAt: T0, graphics, cues: [], ...over });

test('a stamp on one side and a layer edit on the other both stand', () => {
  const base = show([copy()]);
  const theirs = show([copy({ designAt: T0 })]);
  const ours = show([copy({ layer: 42, adjust: { y: 3 } })]);
  const { doc, lost } = mergeTeamShow(base, ours, theirs, NOW);
  assert.equal(doc.graphics[0].layer, 42);
  assert.deepEqual(doc.graphics[0].adjust, { y: 3 });
  assert.equal(doc.graphics[0].designAt, T0);
  assert.deepEqual(lost, []);
});

test('an Update on one side and a rename on the other: the design from one, the name from the other, template.name the pool name', () => {
  const base = show([copy()]);
  const theirs = show([copy({ template: tpl('<p>updated</p>'), savedAt: T2, designAt: T2 })]);
  const ours = show([copy({ name: 'Strap B', template: tpl('<p>base</p>', 'Strap B') })]);
  const { doc } = mergeTeamShow(base, ours, theirs, NOW);
  assert.equal(doc.graphics[0].template.html, '<p>updated</p>');
  assert.equal(doc.graphics[0].name, 'Strap B');
  assert.equal(doc.graphics[0].template.name, 'Strap B');
});

test('a retained pulled design against a stored adoption: theirs stands, and the layer edit beside it survives', () => {
  const base = show([copy()]);
  const theirs = show([copy({ designAt: T0 })]);
  const ours = show([copy({ template: tpl('<p>pulled</p>'), savedAt: T1, layer: 33 })]);
  const { doc, lost } = mergeTeamShow(base, ours, theirs, NOW);
  assert.equal(doc.graphics[0].template.html, '<p>base</p>');
  assert.equal(doc.graphics[0].layer, 33);
  assert.deepEqual(lost, ['the graphics'], 'the dropped design is said, as any conflict is');
});

test('a whole-item change on one side only is taken as today', () => {
  const base = show([copy()]);
  const ours = show([copy({ layer: 50 })]);
  assert.equal(mergeTeamShow(base, ours, base, NOW).doc.graphics[0].layer, 50);
});

// R3: an Undo or Redo of a design stamps it, in the write and in what the history records.
test('an undo that restores a design stamps it, so the next settle keeps it and the next redo is not refused', async () => {
  const { replaceRundown, landedReplacement, rundownSlice, sameRundown } = await import('../src/model/rundownHistory.ts');
  const before = show([copy()], { cues: [{ id: 'c1', sourceId: 'g1', label: 'A', values: { f0: 'x' } }] });
  const updated = show([copy({ template: tpl('<p>updated</p>'), savedAt: T2, designAt: T2 })], { cues: before.cues });
  const result = replaceRundown(updated, rundownSlice(updated), rundownSlice(before));
  assert.ok(result.show, result.refused ?? '');
  assert.ok(stamped(result.show.graphics[0]), 'the restored design is stamped');
  assert.equal(result.show.graphics[0].savedAt, T0, 'its edit time is kept');
  const landed = landedReplacement(updated, rundownSlice(before));
  assert.ok(sameRundown(rundownSlice(result.show), landed), 'what the history records is what was written');
  assert.equal(settle(result.show.graphics, updated.graphics).changed, false, 'the settle keeps it');
});

// R8: the owed cue edit writes cue text only, so a pulled design beside it is still settled.
test('a recovered cue edit never stamps a copy: the pulled design beside it is still dropped', () => {
  const base = [copy()];
  const pulled = copy({ template: tpl('<p>pulled</p>'), savedAt: T1 });
  // P2's write changes a cue's label, note or values and nothing in the pool.
  const afterRecovery = [pulled];
  assert.equal(settle(afterRecovery, base).graphics[0].template.html, '<p>base</p>');
});
