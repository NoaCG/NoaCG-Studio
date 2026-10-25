// guards: src/control/sourceMapping.ts, src/control/selectionAir.ts, src/model/productionData.ts, src/model/rundownHistory.ts, src/control/takeBlockers.ts, src/control/cueAuto.ts
//
// KEYED SELECTORS, THE COHERENT RESOLVER AND THE AIRED INSTANCE (docs/work-specs/
// playout-election-package/spec.md, phase E7.1; AC-2, AC-3 as far as the gate and the resolver
// reach), in Node against the real modules:
//   - identity is district plus candidate: two cues of one card pick their own entity, the same
//     candidate number in two districts stays two people, a reordered ranking moves nobody;
//   - every rule of the selection contract, each red when it is removed or inverted: duplicate keys
//     invalidate the selection, a missing required field the whole candidate, an optional field
//     takes its fallback, a valid empty list creates no candidate, an unknown B is never ready and
//     never borrows A;
//   - the aired instance: captured at Take, following ITS selector through a count increase and a
//     newer downward correction, rejecting older and duplicate revisions read out of order, holding
//     with its reason, age and revision when A is deleted or the collection breaks, kept across a
//     reload, and forgotten when the layer airs another cue;
//   - the read gate: a selector or recipe of a later version is read-only, and the write-door
//     predicate keeps every selection byte for byte (model/shows.ts `patchShowChecked` and
//     ./rundownHistory.ts `replaceRundown` ask it; the browser half is
//     e2e/configured/election-selection.spec.ts);
//   - every bound at its edge, and linear work on a hostile collection.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import './lib/tsResolve.mjs';

const mapping = await import('../src/control/sourceMapping.ts');
const air = await import('../src/control/selectionAir.ts');
const data = await import('../src/model/productionData.ts');
const { replaceRundown } = await import('../src/model/rundownHistory.ts');
const { takeBlockerFor } = await import('../src/control/takeBlockers.ts');
const { nextGraphicCue } = await import('../src/control/cueAuto.ts');
const { storePart } = await import('../src/control/storePart.ts');

const text = (key) => ({ key, label: key, kind: 'text', defaultValue: '' });
const number = (key) => ({ key, label: key, kind: 'number', defaultValue: '' });
const FIELDS = [text('f0'), number('f1'), text('f2'), text('f3')];

const RECIPE = {
  v: 1,
  id: 'cands',
  sourceId: 'e1',
  schemaRevision: 3,
  graphic: 'Card',
  from: 'candidates',
  key: ['district', 'number'],
  fields: { f0: { from: 'name' }, f1: { from: 'votes' }, f2: { from: 'party', fallback: '-' } },
};
// The same card fed by a second source (an official count after a preliminary one), same key.
const OFFICIAL = { ...RECIPE, id: 'official', sourceId: 'e2' };
const officialOf = (district, num) => ({ v: 1, recipe: 'official', key: [district, num] });
const person = (district, num, name, votes, extra = {}) => ({ district, number: num, name, votes, ...extra });
const collection = (revision, items, extra = {}) => ({ schemaRevision: 3, revision, items, ...extra });
const tree = (c) => ({ external: { e1: { candidates: c } } });
const selectionOf = (district, num) => ({ v: 1, recipe: 'cands', key: [district, num] });
const facts = (c, more = {}) => ({ collections: [RECIPE], bindings: {}, tree: tree(c), fieldsOf: (g) => (g === 'Card' ? FIELDS : null), ...more });
const take = (sel, c, more) => air.selectionTake({ selection: sel }, 'Card', facts(c, more));
// Both sources: the preliminary `e1` and the official `e2`, each its own collection.
const both = (c1, c2, more = {}) => ({ collections: [RECIPE, OFFICIAL], bindings: {}, tree: { external: { e1: { candidates: c1 }, e2: { candidates: c2 } } }, fieldsOf: (g) => (g === 'Card' ? FIELDS : null), ...more });
const resolve = (key, c, recipe = RECIPE, fields = FIELDS) => mapping.resolveSelection({ recipe, tree: tree(c), key, fields });

const BASE = [person('D1', 7, 'Aino Aalto', 1200, { party: 'Green' }), person('D2', 7, 'Bertta Berg', 900, { party: 'Blue' }), person('D1', 8, 'Cecilia Cole', 800)];

describe('identity is district plus candidate', () => {
  test('two cues of one card select different people, including one number in two districts', () => {
    const a = take(selectionOf('D1', 7), collection(1, BASE));
    const b = take(selectionOf('D2', 7), collection(1, BASE));
    assert.deepEqual(a, { status: 'ok', selection: selectionOf('D1', 7), scope: '["cands","e1",3,"candidates",["district","number"],[["f0",{"from":"name"}],["f1",{"from":"votes"}],["f2",{"from":"party","fallback":"-"}]]]', entity: '["D1",7]', revision: 1, values: { f0: 'Aino Aalto', f1: '1200', f2: 'Green' } });
    assert.deepEqual(b.values, { f0: 'Bertta Berg', f1: '900', f2: 'Blue' });
  });

  test('a reordered ranking changes nobody: identity is never the row', () => {
    const before = take(selectionOf('D1', 7), collection(1, BASE));
    const after = take(selectionOf('D1', 7), collection(2, [...BASE].reverse()));
    assert.deepEqual(after.values, before.values);
  });

  test('a key is typed: 7 and "7" are two candidates', () => {
    const r = take(selectionOf('D1', '7'), collection(1, BASE));
    assert.equal(r.status, 'refused');
    assert.match(r.reason, /has no district "D1", number "7"/);
  });

  test('every value of one card comes from one record of one revision', () => {
    const r = resolve(['D2', 7], collection(9, BASE));
    assert.deepEqual([r.revision, r.entity, r.values.f0, r.values.f1], [9, '["D2",7]', 'Bertta Berg', '900']);
  });
});

describe('the selection contract', () => {
  test('duplicate keys invalidate the whole selection, for every cue', () => {
    const dup = collection(2, [...BASE, person('D2', 7, 'Impostor', 1)]);
    for (const key of [['D1', 7], ['D2', 7]]) {
      const r = resolve(key, dup);
      assert.deepEqual([r.status, r.why], ['hold', 'collection']);
      assert.match(r.reason, /two items share the key district "D2", number 7/);
    }
  });

  test('an item missing a key part holds the collection, not just its own card', () => {
    const r = resolve(['D1', 7], collection(2, [...BASE, { district: 'D3', name: 'No number' }]));
    assert.deepEqual([r.status, r.why, r.reason], ['hold', 'collection', 'an item of the collection has no number']);
  });

  test('a missing required field invalidates the whole candidate; null is missing; zero is a value', () => {
    const partial = resolve(['D1', 7], collection(2, [person('D1', 7, 'Aino Aalto', undefined, { party: 'Green' })]));
    assert.deepEqual([partial.status, partial.why], ['hold', 'partial']);
    assert.match(partial.reason, /votes has no value/);
    assert.equal(resolve(['D1', 7], collection(2, [person('D1', 7, null, 1)])).why, 'partial');
    assert.equal(resolve(['D1', 7], collection(2, [person('D1', 7, 'Aino', 0)])).values.f1, '0');
  });

  test('an optional field takes its declared fallback, and only it does', () => {
    assert.equal(resolve(['D1', 8], collection(2, BASE)).values.f2, '-');
    const noFallback = { ...RECIPE, fields: { ...RECIPE.fields, f2: { from: 'party' } } };
    assert.equal(resolve(['D1', 8], collection(2, BASE), noFallback).why, 'partial');
  });

  test('a value its field cannot hold invalidates the candidate', () => {
    const r = resolve(['D1', 7], collection(2, [person('D1', 7, 'Aino', 'many')]));
    assert.deepEqual([r.status, r.why, r.reason], ['hold', 'partial', 'district "D1", number 7: votes does not fit field f1']);
  });

  test('a valid empty collection clears nothing into a candidate: it is missing', () => {
    const r = resolve(['D1', 7], collection(3, []));
    assert.deepEqual(r, { status: 'hold', why: 'missing', reason: 'revision 3 holds no candidates', revision: 3 });
  });

  test('an unknown B is never ready and never borrows A, whatever was valid before', () => {
    const ok = take(selectionOf('D1', 7), collection(1, BASE));
    assert.equal(ok.status, 'ok');
    const b = take(selectionOf('D9', 1), collection(2, BASE));
    assert.deepEqual(b, { status: 'refused', reason: 'Not ready: revision 2 has no district "D9", number 1.' });
  });

  test('a collection that is not one holds: not arrived, not JSON, no revision, another schema, no items', () => {
    const holds = [undefined, '{nope', 'null', { items: BASE }, collection(1.5, BASE), collection(1, BASE, { schemaRevision: 4 }), { schemaRevision: 3, revision: 1 }, collection(1, [7])];
    for (const c of holds) {
      const r = resolve(['D1', 7], c);
      assert.equal(r.status, 'hold', JSON.stringify(c));
      assert.equal(r.why, 'collection', JSON.stringify(c));
    }
    assert.match(resolve(['D1', 7], collection(1, BASE, { schemaRevision: 4 })).reason, /schema revision 4, and its fields were mapped for 3/);
  });

  test('a collection written as JSON text reads as the same collection', () => {
    assert.deepEqual(resolve(['D1', 7], JSON.stringify(collection(5, BASE))), resolve(['D1', 7], collection(5, BASE)));
  });

  test('a graphic without the field, or with no fields, holds the candidate', () => {
    assert.equal(resolve(['D1', 7], collection(1, BASE), RECIPE, [text('f0')]).why, 'partial');
    assert.equal(resolve(['D1', 7], collection(1, BASE), RECIPE, null).why, 'partial');
  });
});

describe('the read gate', () => {
  const gate = (selection, collections = [RECIPE], graphic = 'Card', bindings = {}) => mapping.selectionGate({ selection }, collections, graphic, bindings);

  test('no selection is the old behaviour; a v 1 selection on its graphic is read', () => {
    assert.deepEqual(gate(undefined), { status: 'none' });
    const ok = gate(selectionOf('D1', 7));
    assert.deepEqual([ok.status, ok.entity], ['ok', '["D1",7]']);
  });

  test('a selector or a recipe of a later version is read-only, and the predicate the doors ask agrees', () => {
    const laterSel = { v: 2, recipe: 'cands', pick: { by: 'rank' } };
    const laterRecipe = { v: 2, id: 'cands', anything: true };
    assert.equal(gate(laterSel).status, 'read-only');
    assert.equal(gate(selectionOf('D1', 7), [laterRecipe]).status, 'read-only');
    assert.equal(data.selectionReadOnly({ selection: laterSel }, [RECIPE]), true);
    assert.equal(data.selectionReadOnly({ selection: selectionOf('D1', 7) }, [laterRecipe]), true);
    assert.equal(data.selectionReadOnly({ selection: selectionOf('D1', 7) }, [RECIPE]), false);
    assert.equal(data.selectionReadOnly({}, [laterRecipe]), false);
    assert.deepEqual(take(selectionOf('D1', 7), collection(1, BASE), { readable: false }), { status: 'refused', reason: 'This production’s shared values are still loading.' }, 'an unread published tree takes nothing');
    const refused = take(laterSel, collection(1, BASE));
    assert.deepEqual(refused, { status: 'refused', reason: 'This cue’s live candidate was set up by a later version of NoaCG, so it is read-only here.' });
  });

  test('a selector this build cannot use is not ready: wrong graphic, unknown recipe, wrong key, a shared binding on a mapped field', () => {
    assert.match(gate(selectionOf('D1', 7), [RECIPE], 'Other').reason, /made for another graphic/);
    assert.match(gate({ v: 1, recipe: 'nope', key: ['D1', 7] }).reason, /does not have/);
    assert.match(gate({ v: 1, recipe: 'cands', key: ['D1'] }).reason, /needs 2 parts/);
    assert.match(gate({ v: 1, recipe: 'cands', key: ['D1', 7], extra: 1 }).reason, /not one this version reads/);
    assert.match(gate(selectionOf('D1', 7), [RECIPE], 'Card', { Card: { f1: 'external.e1.total' } }).reason, /field f1 also follows a shared value/);
    assert.equal(gate(selectionOf('D1', 7), [RECIPE], 'Card', { Card: { f3: 'external.e1.total' } }).status, 'ok');
  });

  test('a recipe is strict: extra keys, no version, a bad key list, a field map out of bounds', () => {
    const read = (r) => mapping.readCollectionRecipe(r).status;
    assert.equal(read(RECIPE), 'ok');
    assert.equal(read({ ...RECIPE, headers: { token: 'x' } }), 'invalid');
    assert.equal(read({ ...RECIPE, v: undefined }), 'invalid');
    assert.equal(read({ ...RECIPE, key: [] }), 'invalid');
    assert.equal(read({ ...RECIPE, key: ['district', 'district'] }), 'invalid');
    assert.equal(read({ ...RECIPE, sourceId: 'e.1' }), 'invalid');
    assert.equal(read({ ...RECIPE, fields: { f0: { from: 'name', format: { kind: 'number', locale: 'fi-FI', decimals: 7 } } } }), 'invalid');
  });

  describe('the write doors keep every selection byte for byte', () => {
    const cue = (id, extra = {}) => ({ id, sourceId: 'g1', label: id, values: { f0: 'x' }, ...extra });
    const show = (cues, collections = [RECIPE]) => ({ cues, collections });
    const frozen = (before, after) => data.selectionFrozen(data.selectionKeep(before), after);
    const later = cue('later', { selection: { v: 2, recipe: 'cands', pick: 'rank' } });
    const a = cue('a', { selection: selectionOf('D1', 7) });

    test('a production with no selection has nothing kept and refuses nothing', () => {
      assert.equal(data.selectionKeep({ cues: [cue('p')] }), null);
      assert.equal(frozen({ cues: [cue('p')] }, { cues: [cue('p', { values: { f0: 'y' } })] }), null);
    });

    test('an edit that leaves the selections alone passes; a reorder passes', () => {
      assert.equal(frozen(show([a, cue('p')]), show([cue('p'), { ...a, values: { f0: 'z' }, label: 'renamed' }])), null);
    });

    test('a changed, dropped or flattened selection is refused', () => {
      assert.ok(frozen(show([a]), show([{ ...a, selection: selectionOf('D2', 7) }])));
      const flattened = { ...a, values: { f0: 'Aino Aalto' } };
      delete flattened.selection;
      assert.ok(frozen(show([a]), show([flattened])));
    });

    test('a cue of a later version keeps every byte and is never removed; a v 1 cue may be removed', () => {
      assert.ok(frozen(show([later]), show([{ ...later, label: 'renamed' }])));
      assert.ok(frozen(show([later]), show([])));
      assert.equal(frozen(show([a]), show([])), null);
    });

    test('no cue gains a selection and the recipes do not change', () => {
      assert.ok(frozen(show([a]), show([a, { ...a, id: 'copy' }])));
      assert.ok(frozen({ cues: [] }, { cues: [cue('p', { selection: selectionOf('D1', 7) })] }));
      assert.ok(frozen(show([a]), show([a], [{ ...RECIPE, schemaRevision: 4 }])));
      assert.ok(frozen(show([a]), { cues: [a] }));
    });

    test('an undo brings back a deleted candidate cue with its selection, byte for byte', () => {
      const slice = (cues) => ({ cues, folders: [], graphics: [{ id: 'g1', name: 'Card' }], playoutItems: [] });
      const record = { id: 's', version: 2, name: 'S', graphics: [{ id: 'g1', name: 'Card' }], playoutItems: [], folders: [], cues: [], collections: [RECIPE], updatedAt: 'x' };
      const back = replaceRundown(record, slice([]), slice([a]));
      assert.equal(back.refused, null);
      assert.deepEqual(back.show.cues, [a]);
      assert.ok(frozen(show([]), show([a])), 'any other write may not add one');
    });

    test('an undo is refused when it would change a selection, and goes through when it would not', () => {
      const slice = (cues) => ({ cues, folders: [], graphics: [{ id: 'g1', name: 'Card' }], playoutItems: [] });
      const record = { id: 's', version: 2, name: 'S', graphics: [{ id: 'g1', name: 'Card' }], playoutItems: [], folders: [], cues: [later], collections: [RECIPE], updatedAt: 'x' };
      const undo = replaceRundown(record, slice([later]), slice([]));
      assert.deepEqual(undo, { show: null, refused: 'This production has live candidate cues this version cannot change, so the edit was not saved.' });
      const plain = { ...record, cues: [later, cue('p')] };
      const ok = replaceRundown(plain, slice([later, cue('p')]), slice([later]));
      assert.equal(ok.refused, null);
      assert.deepEqual(ok.show.cues, [later]);
    });
  });
});

const people6 = () => [person('D1', 7, 'Aino Aalto', 1500, { party: 'Green' }), ...BASE.slice(1)];

// One layer through the reducer: a press, its answer, a follow (one read against what airs).
const pressed = (state, cueId, t, now = 1000) => air.reduceSelection(state, { t: 'press', graphic: 'Card', cueId, take: t, seq: air.mintSend(), now });
const answered = (state, seq, landed, now = 1100) => air.reduceSelection(state, { t: 'answer', graphic: 'Card', seq, landed, now }).air;
const shown = (state) => air.airedOf(state, 'Card');
const marks = (state) => Object.values(state.Card.marks)[0];

describe('the aired instance', () => {
  const live = { Card: 'cue-a' };
  const captured = (c = collection(5, BASE), sel = selectionOf('D1', 7)) => {
    const t = take(sel, c);
    assert.equal(t.status, 'ok');
    const p = pressed({}, 'cue-a', t);
    return answered(p.air, p.seq, true);
  };
  const follow = (state, c, now = 2000, liveCue = live) => air.reduceSelection(state, { t: 'follow', liveCue, seeded: true, facts: facts(c), mint: air.mintSend, now });
  const reconcile = (state, liveCue, seeded, now = 0) => air.reduceSelection(state, { t: 'follow', liveCue, seeded, facts: facts(collection(5, BASE), { readable: false }), mint: air.mintSend, now }).air;
  const settled = (at) => at + air.SETTLE_MS + 1;

  test('a count increase and a newer downward correction each go out once, whole', () => {
    let state = captured();
    const up = follow(state, collection(6, [person('D1', 7, 'Aino Aalto', 1500, { party: 'Green' }), ...BASE.slice(1)]));
    assert.deepEqual(up.sends.map(({ graphic, values }) => ({ graphic, values })), [{ graphic: 'Card', values: { f0: 'Aino Aalto', f1: '1500', f2: 'Green' } }]);
    assert.equal(shown(up.air).revision, 6, 'the page believes the correction it sent');
    state = up.air;
    const down = follow(state, collection(7, [person('D1', 7, 'Aino Aalto', 1400, { party: 'Green' }), ...BASE.slice(1)]), 3000);
    assert.deepEqual(down.sends.map((s) => s.values.f1), ['1400']);
    assert.deepEqual([shown(down.air).revision, shown(down.air).at], [7, 3000]);
  });

  test('older and duplicate revisions, read out of order, are rejected', () => {
    let state = follow(captured(), collection(7, [person('D1', 7, 'Aino Aalto', 1400)])).air;
    for (const old of [collection(6, [person('D1', 7, 'Aino Aalto', 1500)]), collection(7, [person('D1', 7, 'Aino Aalto', 9999)]), collection(5, BASE)]) {
      const r = follow(state, old);
      assert.deepEqual(r.sends, []);
      assert.equal(r.air, state);
      state = r.air;
    }
    assert.equal(shown(state).values.f1, '1400');
  });

  test('it follows the selector captured at Take, never the cue as it is now (preview B, reload)', () => {
    const state = captured();
    // The layer carries its own selector, so a preview of B, a draft or a changed record cannot
    // reach it: follow is handed no cue at all.
    const r = follow(air.readSelectionAir(air.writeSelectionAir(state)), collection(6, BASE.map((p) => ({ ...p, votes: p.votes + 1 }))));
    assert.deepEqual(r.sends.map(({ graphic, values }) => ({ graphic, values })), [{ graphic: 'Card', values: { f0: 'Aino Aalto', f1: '1201', f2: 'Green' } }]);
    const b = take(selectionOf('D2', 7), collection(6, BASE));
    assert.equal(b.status, 'ok', 'B is ready on its own');
    assert.deepEqual(shown(r.air).selection, selectionOf('D1', 7));
  });

  test('a deleted person, a valid empty list, a malformed or duplicate collection hold A with reason, revision and age', () => {
    const state = captured();
    const cases = [
      [collection(6, BASE.slice(1)), 'revision 6 has no district "D1", number 7', 6],
      [collection(6, []), 'revision 6 holds no candidates', 6],
      ['{broken', 'the collection is not JSON', null],
      [collection(6, [...BASE, person('D1', 7, 'Twin', 1)]), 'two items share the key district "D1", number 7', 6],
    ];
    for (const [c, reason, revision] of cases) {
      const r = follow(state, c, 4000);
      assert.deepEqual(r.sends, [], 'nothing is sent: the picture stays');
      assert.deepEqual(shown(r.air).held, { reason, since: 4000, revision });
      assert.deepEqual([shown(r.air).values, shown(r.air).revision, shown(r.air).at], [shown(state).values, 5, 1000]);
      const again = follow(r.air, c, 9000);
      assert.equal(again.air, r.air, 'a hold keeps its first time');
    }
    const first = follow(state, collection(6, []), 4000).air;
    assert.deepEqual(shown(follow(first, '{broken', 9000).air).held, { reason: 'the collection is not JSON', since: 4000, revision: null }, 'another reason, the same hold: its age runs from the first');
  });

  test('a hold ends with a newer revision that holds A again, or the aired one read well', () => {
    const held = follow(captured(), collection(6, []), 4000).air;
    const back = follow(held, collection(8, BASE), 5000);
    assert.equal(back.sends.length, 1);
    assert.equal(shown(back.air).held, undefined);
    const malformed = follow(captured(), '{broken', 4000).air;
    const same = follow(malformed, collection(5, BASE), 5000);
    assert.deepEqual([same.sends, shown(same.air).held], [[], undefined]);
    // A hold the aired revision itself set (the graphic lost a mapped field) ends when that
    // revision reads well again: nothing newer is needed (/so D5).
    const lost = air.reduceSelection(captured(), { t: 'follow', liveCue: live, seeded: true, facts: facts(collection(5, BASE), { fieldsOf: () => [text('f0')] }), mint: air.mintSend, now: 4000 }).air;
    assert.equal(shown(lost).held?.revision, 5);
    assert.equal(shown(follow(lost, collection(5, BASE), 5000).air).held, undefined);
  });

  test('an older revision cannot undo a hold a newer one set: it neither sends nor clears the warning', () => {
    const held = follow(captured(), collection(9, BASE.slice(1)), 4000).air;
    assert.equal(shown(held).held.revision, 9);
    const late = follow(held, collection(8, BASE), 5000);
    assert.deepEqual(late.sends, []);
    assert.equal(late.air, held, 'revision 8 is older than what said Aino is gone');
    assert.equal(follow(held, collection(5, BASE), 5000).air, held, 'nor the aired revision read again');
    const blind = follow(held, undefined, 5100).air;
    assert.equal(shown(blind).held.revision, null, 'the collection went missing');
    assert.deepEqual(follow(blind, collection(8, BASE), 5200).sends, [], 'a read with no revision does not lower the bound revision 9 set');
    const newer = follow(held, collection(10, BASE), 6000);
    assert.equal(newer.sends.length, 1);
    assert.equal(shown(newer.air).held, undefined);
  });

  test('a re-read of the aired revision under a newer hold, after a read with no revision, does not clear the warning', () => {
    const gone = follow(captured(), collection(9, BASE.slice(1)), 4000).air;
    const blind = follow(gone, '{broken', 4500).air;
    assert.deepEqual([shown(blind).held.revision, marks(blind).heldAt], [null, 9]);
    const reread = follow(blind, collection(5, BASE), 5000);
    assert.deepEqual(reread.sends, []);
    assert.equal(reread.air, blind, 'revision 9 said Aino is gone; revision 5 read well is no recovery');
  });

  test('a press that fails after a hold keeps what the hold judged: an older read is still rejected', () => {
    const held = follow(captured(), collection(9, BASE.slice(1)), 4000).air;
    const update = pressed(held, 'cue-a', take(selectionOf('D1', 7), collection(10, BASE)), 4500);
    const failed = answered(update.air, update.seq, false, 4600);
    assert.equal(shown(failed).revision, 5, 'what airs is back');
    assert.deepEqual(follow(failed, collection(8, BASE), 5000).sends, [], 'revision 8 is older than what said Aino is gone');
  });

  test('an older revision that would not resolve says nothing about the newer one on air', () => {
    const state = follow(captured(), collection(7, BASE)).air;
    assert.equal(follow(state, collection(6, [])).air, state);
  });

  test('a Paused source writes no tree, so nothing moves; a layer airing another cue follows nothing', () => {
    const state = captured();
    assert.equal(follow(state, collection(5, BASE)).air, state);
    const other = follow(state, collection(6, BASE), 2000, { Card: 'cue-b' });
    assert.deepEqual(other.sends, []);
  });

  test('the layer goes when its graphic airs another cue, or is off air once the page knows', () => {
    const state = captured();
    assert.deepEqual(reconcile(state, { Card: 'cue-b' }, false), {});
    assert.equal(reconcile(state, {}, false), state, 'not yet seeded: a restored layer waits');
    assert.deepEqual(reconcile(state, {}, true), {});
    assert.equal(reconcile(state, live, true), state);
  });

  test('a press is out until its answer: neither forgotten nor followed before; a reload holds it until the marker decides', () => {
    const t = take(selectionOf('D1', 7), collection(5, BASE));
    const p = pressed({}, 'cue-a', t);
    assert.equal(shown(p.air).pending, true);
    assert.equal(reconcile(p.air, { Card: 'cue-old' }, true), p.air, 'the marker has not moved yet');
    assert.equal(reconcile(p.air, {}, true), p.air);
    assert.deepEqual(follow(p.air, collection(6, BASE)).sends, []);
    const landed = answered(p.air, p.seq, true);
    assert.equal(shown(landed).pending, false);
    assert.equal(answered(landed, p.seq, true), landed, 'one answer per send');
    const restored = air.readSelectionAir(air.writeSelectionAir(p.air), 7000);
    assert.deepEqual([shown(restored).known, shown(restored).held?.since], [false, 7000], 'a reload does not know whether it landed');
    assert.equal(reconcile(restored, { Card: 'cue-old' }, true, 7000 + 1000), restored, 'while a send of the page that went away may still arrive, nothing is decided');
    assert.deepEqual(reconcile(restored, { Card: 'cue-old' }, true, settled(7000)), {}, 'the marker names neither: gone');
    const decided = reconcile(restored, live, true, settled(7000));
    assert.deepEqual([shown(decided).known, shown(decided).held, shown(decided).revision], [true, undefined, 5], 'the marker moved to it: it landed');
  });

  test('a failed press gives back only its own layer: what the output shows, with every later press standing', () => {
    const a = captured();
    const bug = air.reduceSelection(a, { t: 'press', graphic: 'Bug', cueId: 'cue-bug', take: take(selectionOf('D1', 8), collection(5, BASE)), seq: air.mintSend(), now: 1500 });
    const b = pressed(bug.air, 'cue-b', take(selectionOf('D2', 7), collection(5, BASE)), 2000);
    const undone = answered(b.air, b.seq, false);
    assert.equal(shown(undone).cueId, 'cue-a');
    assert.equal(undone.Bug, bug.air.Bug, 'another layer stands');
    const c = pressed(b.air, 'cue-c', take(selectionOf('D1', 8), collection(5, BASE)), 2100);
    assert.equal(shown(answered(c.air, b.seq, false)).cueId, 'cue-c', 'a later press on the layer stands over an earlier failure');
  });

  test('a correction whose send failed keeps the aired revision, held, so the next read sends it again', () => {
    const state = captured();
    const sent = follow(state, collection(6, people6()));
    const [send] = sent.sends;
    const unsent = answered(sent.air, send.seq, false, 3000);
    assert.deepEqual([shown(unsent).revision, shown(unsent).values, shown(unsent).held], [5, shown(state).values, { reason: 'the correction to revision 6 was not sent', since: 3000, revision: null, unsent: true }]);
    assert.equal(follow(unsent, collection(5, BASE), 3500).air, unsent, 'the aired revision read again does not end a "not sent" hold');
    const retry = follow(unsent, collection(6, people6()), 4000);
    assert.deepEqual(retry.sends.map((s) => s.values.f1), ['1500']);
    assert.equal(shown(retry.air).held, undefined);
  });

  test('a correction whose send failed is rolled back even when a hold was set meanwhile, and is sent again', () => {
    const state = captured();
    const sent = follow(state, collection(6, people6()));
    const [send] = sent.sends;
    const heldMeanwhile = follow(sent.air, '{broken', 2500).air;
    const rolled = answered(heldMeanwhile, send.seq, false, 3000);
    assert.deepEqual([shown(rolled).revision, shown(rolled).values, shown(rolled).held.revision], [5, shown(state).values, null]);
    const again = follow(rolled, collection(6, people6()), 4000);
    assert.deepEqual(again.sends.map((s) => s.values.f1), ['1500'], 'revision 6 goes out again once it reads well');
    const later = pressed(sent.air, 'cue-b', take(selectionOf('D2', 7), collection(6, BASE)), 2600);
    assert.equal(shown(answered(later.air, send.seq, false, 3000)).cueId, 'cue-b', 'a later press stands');
  });

  test('a correction that fails after a newer revision held the card keeps that bound and that hold', () => {
    const six = follow(captured(), collection(6, people6()), 2000);
    const deleted = follow(six.air, collection(9, BASE.slice(1)), 2100).air;
    assert.equal(shown(deleted).held.revision, 9);
    const failed = answered(deleted, six.sends[0].seq, false, 2200);
    assert.deepEqual([shown(failed).revision, marks(failed).heldAt, shown(failed).held.revision], [5, 9, 9], 'back to what landed; the deletion still bounds and holds');
    const late = follow(failed, collection(8, BASE), 2300);
    assert.deepEqual(late.sends, [], 'revision 8 is older than the deletion');
    assert.equal(late.air, failed);
  });

  test('two overlapping corrections: both failing go back to what landed; a later one landing after an earlier failure stands', () => {
    const state = captured();
    const six = follow(state, collection(6, people6()), 2000);
    const seven = follow(six.air, collection(7, [person('D1', 7, 'Aino Aalto', 1700)]), 2100);
    const a = answered(answered(seven.air, six.sends[0].seq, false, 2200), seven.sends[0].seq, false, 2300);
    assert.deepEqual([shown(a).revision, shown(a).values], [5, shown(state).values], 'revision 5 is what air shows');
    let b = answered(seven.air, six.sends[0].seq, false, 2200);
    assert.deepEqual([shown(b).revision, shown(b).held], [7, undefined], 'revision 7 is out and supersedes the failed 6');
    b = answered(b, seven.sends[0].seq, true, 2300);
    assert.deepEqual([shown(b).revision, shown(b).values.f1, b.Card.onAir.revision, shown(b).held], [7, '1700', 7, undefined]);
    const c = answered(answered(seven.air, seven.sends[0].seq, true, 2300), six.sends[0].seq, false, 2400);
    assert.deepEqual([shown(c).revision, shown(c).held], [7, undefined], 'an older failure after a newer landing changes nothing');
  });

  test('what is kept reads back; anything else is no layer', () => {
    const state = captured();
    assert.deepEqual(air.readSelectionAir(air.writeSelectionAir(state)), state);
    const bad = (layer) => JSON.stringify({ v: 2, graphics: { Card: layer } });
    for (const raw of [null, '', '{', 'null', '7', JSON.stringify({ v: 1, graphics: state }), bad({ ...state.Card, out: [{ seq: 'x', press: true, target: null }] }), bad({ ...state.Card, onAir: { ...state.Card.onAir, revision: 'x' } }), bad({ ...state.Card, marks: { k: { bound: null } } })]) {
      assert.deepEqual(air.readSelectionAir(raw), {}, String(raw));
    }
  });
});

describe('what may Take a candidate', () => {
  test('a Take of a cue, or of a folder holding it, is refused with the candidate\'s reason', () => {
    const cue = { id: 'b', sourceId: 'g', label: 'B card', values: {} };
    const ctx = {
      cues: [cue],
      items: [],
      folders: [],
      members: new Map([['f', [cue]]]),
      places: new Map(),
      ownership: { onAir: [], sequences: [] },
      settings: {},
      ability: null,
      casparOn: true,
      bridgeDown: false,
      itemOf: () => null,
      graphicOf: () => ({ name: 'Card', layer: 20 }),
      slots: { itemSlot: () => ({ channel: 1, layer: 1 }), folderSlot: () => ({ channel: 1, layer: 1 }) },
      selectionBlocker: (c) => (c.id === 'b' ? 'Not ready: revision 2 has no district "D9", number 1.' : null),
    };
    assert.equal(takeBlockerFor(cue, ctx), 'Not ready: revision 2 has no district "D9", number 1.');
    assert.equal(takeBlockerFor({ id: 'f', name: 'F', mode: 'together' }, ctx), 'B card: Not ready: revision 2 has no district "D9", number 1.');
    assert.equal(takeBlockerFor(cue, { ...ctx, selectionBlocker: () => null }), null);
  });

  test('a timed end never takes a candidate cue', () => {
    const cues = [{ id: 'a' }, { id: 'b', selection: selectionOf('D1', 7) }, { id: 'c' }];
    assert.equal(nextGraphicCue(cues, 'a'), null);
    assert.equal(nextGraphicCue(cues, 'b'), 'c');
  });
});

describe('bounds, each at its edge, and linear work', () => {
  test('a key of 1 to 4 parts', () => {
    const key = (n) => Array.from({ length: n }, (_, i) => `k${i}`);
    assert.equal(mapping.readCollectionRecipe({ ...RECIPE, key: key(4) }).status, 'ok');
    assert.equal(mapping.readCollectionRecipe({ ...RECIPE, key: key(5) }).status, 'invalid');
  });

  test('1 to 32 mapped fields', () => {
    const fields = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, { from: 'name' }]));
    assert.equal(mapping.readCollectionRecipe({ ...RECIPE, fields: fields(32) }).status, 'ok');
    assert.equal(mapping.readCollectionRecipe({ ...RECIPE, fields: fields(33) }).status, 'invalid');
    assert.equal(mapping.readCollectionRecipe({ ...RECIPE, fields: {} }).status, 'invalid');
  });

  test('a key part of at most 64 characters', () => {
    const at = (s) => resolve([s, 7], collection(1, [person(s, 7, 'Aino', 1)])).status;
    assert.equal(at('d'.repeat(64)), 'ok');
    assert.equal(at('d'.repeat(65)), 'hold');
    assert.equal(mapping.selectionGate({ selection: { v: 1, recipe: 'cands', key: ['d'.repeat(65), 7] } }, [RECIPE], 'Card', {}).status, 'invalid');
  });

  test('at most 5000 items', () => {
    const many = (n) => Array.from({ length: n }, (_, i) => person('D1', i, `P${i}`, i));
    assert.equal(resolve(['D1', 4999], collection(1, many(5000))).status, 'ok');
    assert.match(resolve(['D1', 1], collection(1, many(5001))).reason, /more than 5000 items/);
  });

  test('a collection as text of at most 512 KiB characters', () => {
    const body = JSON.stringify(collection(1, [person('D1', 7, 'Aino', 1)]));
    const pad = (n) => body.slice(0, -1) + ',"pad":"' + 'x'.repeat(n - body.length - 9) + '"}';
    assert.equal(pad(512 * 1024).length, 512 * 1024);
    assert.equal(resolve(['D1', 7], pad(512 * 1024)).status, 'ok');
    assert.match(resolve(['D1', 7], pad(512 * 1024 + 1)).reason, /longer than 524288 characters/);
  });

  test('a hostile collection is linear: 5000 items with long keys resolve well under a second', () => {
    const items = Array.from({ length: 5000 }, (_, i) => person(`D${i}`.padEnd(64, 'x'), i, 'n'.repeat(200), i));
    const started = performance.now();
    for (let i = 0; i < 5; i += 1) assert.equal(resolve([items[4999].district, 4999], collection(1, items)).status, 'ok');
    assert.ok(performance.now() - started < 1000);
  });
});

describe('the page\'s two doors onto the layers', () => {
  const io = (initial = {}) => {
    const part = storePart(initial);
    const kept = [];
    let clock = 1000;
    return { part, kept, keep: (a) => { part.set(a); kept.push(a); }, now: () => clock, tick: (ms) => (clock += ms) };
  };
  const ok = (sel, rev = 5) => take(sel, collection(rev, BASE));
  const card = (p) => air.airedOf(p.part.get(), 'Card');
  const ANSWERED = { ok: true, skipped: [], superseded: [], pressedAgain: [] };
  const live = { Card: 'cue-a' };
  const settle = () => new Promise((r) => setImmediate(r));

  test('a press is kept at once and is out until its answer; landed or failed, it follows the newest tree; a failure gives back what airs', () => {
    const p = io();
    air.pressSelection(p, 'Bug', 'bug', ok(selectionOf('D1', 8))).landed();
    let followed = 0;
    p.followNow = () => (followed += 1);
    const a = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    assert.equal(card(p).pending, true);
    assert.equal(p.kept.length, 3, 'kept in this browser at the press');
    a.landed();
    assert.equal(card(p).pending, false);
    assert.equal(followed, 1, 'a revision passed over while it was out is followed at once');
    a.undo();
    assert.equal(card(p).cueId, 'cue-a', 'one answer per press');
    const bug = p.part.get().Bug;
    const b = air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)));
    b.undo();
    assert.equal(card(p).cueId, 'cue-a', 'the layer gets back what airs');
    assert.equal(p.part.get().Bug, bug, 'another layer stands');
    assert.equal(followed, 2, 'a failed press follows the newest tree too');
    const c = air.pressSelection(p, 'Card', 'cue-c', ok(selectionOf('D1', 8)));
    air.pressSelection(p, 'Card', 'cue-d', ok(selectionOf('D2', 7)));
    c.undo();
    assert.equal(card(p).cueId, 'cue-d', 'a later press on the layer stands over an earlier failure');
  });

  test('a cue without a selection taken onto the layer: nothing is shown while it is out; failed, the candidate is back; landed, the layer goes', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const failed = air.pressSelection(p, 'Card', 'plain', { status: 'none' });
    assert.equal(card(p), null, 'nothing candidate is shown while it is out');
    failed.undo();
    assert.equal(card(p).cueId, 'cue-a');
    air.pressSelection(p, 'Card', 'plain', { status: 'none' }).landed();
    air.followAired(p, { liveCue: { Card: 'plain' }, seeded: true, facts: facts(collection(5, BASE)), send: () => Promise.resolve(ANSWERED) });
    assert.deepEqual(p.part.get(), {});
    const q = io();
    air.pressSelection(q, 'Card', 'plain', { status: 'none' }).landed();
    assert.deepEqual(q.part.get(), {}, 'onto a layer with no candidate: nothing to follow');
  });

  test('overlapping presses: whatever answers first, the layer ends on what the output shows, and follows again', () => {
    const p = io();
    const first = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    const second = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 8)));
    first.landed();
    second.undo();
    assert.deepEqual([card(p).selection, card(p).pending], [selectionOf('D1', 7), false]);
    const sends = [];
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send: (g, v) => (sends.push(v.f1), new Promise(() => {})) });
    assert.deepEqual(sends, ['1500'], 'it follows the next revision');
    const r = io();
    air.pressSelection(r, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const u6 = air.pressSelection(r, 'Card', 'cue-a', ok(selectionOf('D1', 8)));
    const u7 = air.pressSelection(r, 'Card', 'cue-a', ok(selectionOf('D2', 7)));
    u6.undo();
    u7.undo();
    assert.deepEqual([card(r).selection, card(r).pending], [selectionOf('D1', 7), false], 'both Updates failed: what airs is back');
    const q = io();
    const a = air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 8))).undo();
    assert.equal(card(q).pending, true, 'a first press still unanswered stays out');
    a.landed();
    assert.equal(card(q).pending, false);
    // Updates 6 and 7 of one candidate: 6 lands, then 7 fails. 6 is what airs (/so D3b).
    const s = io();
    air.pressSelection(s, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const six = air.pressSelection(s, 'Card', 'cue-a', take(selectionOf('D1', 7), collection(6, people6())));
    const seven = air.pressSelection(s, 'Card', 'cue-a', take(selectionOf('D1', 7), collection(7, [person('D1', 7, 'Aino Aalto', 1600)])));
    six.landed();
    seven.undo();
    assert.deepEqual([card(s).revision, card(s).values.f1, card(s).pending], [6, '1500', false]);
  });

  test('following sends each newer revision through the page, holds one whose send failed, and judges nothing before the tree is readable', async () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    const send = (graphic, values) => {
      sends.push([graphic, values.f1]);
      return Promise.resolve(sends.length > 1 ? { ok: false } : ANSWERED);
    };
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6()), { readable: false }), send });
    assert.deepEqual([sends, card(p).held], [[], undefined], 'an unread published tree is not judged');
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(undefined, { readable: false }), send });
    assert.equal(card(p).held, undefined, 'no false hold before the first read');
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
    await settle();
    assert.deepEqual([sends, card(p).revision, card(p).held], [[['Card', '1500']], 6, undefined]);
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(7, [person('D1', 7, 'Aino Aalto', 1600)])), send });
    await settle();
    assert.deepEqual([card(p).revision, card(p).held?.reason], [6, 'the correction to revision 7 was not sent']);
    const overtaken = io();
    air.pressSelection(overtaken, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.followAired(overtaken, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send: () => Promise.resolve({ ok: true, skipped: ['Card'], superseded: [], pressedAgain: [] }) });
    await settle();
    assert.deepEqual([card(overtaken).revision, overtaken.part.get().Card.onAir.revision, card(overtaken).held?.unsent], [5, 5, true], 'a correction a later press overtook did not land');
    air.followAired(p, { liveCue: {}, seeded: true, facts: facts(collection(7, BASE)), send });
    assert.deepEqual(p.part.get(), {}, 'off air once the page knows: forgotten');
  });

  test('a Take that failed with no answer may still commit: nothing is sent on its own until an operator press lands, whatever the marker says', async () => {
    // The marker cannot decide: this page moved it itself when it sent (airState.ts claimAndApply).
    for (const marker of ['cue-a', 'cue-b']) {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      const sends = [];
      const send = (graphic, values) => (sends.push(values.f0), Promise.resolve(ANSWERED));
      air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true).undo({ uncertain: true });
      assert.deepEqual([card(p).known, card(p).held?.reason], [false, 'a send got no answer, so it is not known which candidate is on air: press Update to send it'], marker);
      p.tick(air.SETTLE_MS + 1);
      air.followAired(p, { liveCue: { Card: marker }, seeded: true, facts: facts(collection(6, people6())), send });
      await settle();
      assert.deepEqual([sends, card(p).known], [[], false], `${marker}: held, nothing sent`);
      assert.equal(air.airedValues(p.part.get(), 'Card', marker), null, `${marker}: nothing for Snap`);
      // The operator's Update of the card the marker names decides.
      air.pressSelection(p, 'Card', marker, ok(marker === 'cue-a' ? selectionOf('D1', 7) : selectionOf('D2', 7), 6)).landed();
      air.followAired(p, { liveCue: { Card: marker }, seeded: true, facts: facts(collection(7, people6().map((x) => ({ ...x })))), send });
      assert.deepEqual([card(p).known, card(p).cueId, card(p).held], [true, marker, undefined], `${marker}: decided by the press`);
    }
    // A reload: the reopened page reads the marker from the server, so the marker decides again.
    const q = io();
    air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(q, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true).undo({ uncertain: true });
    const reopened = io(air.readSelectionAir(air.writeSelectionAir(q.part.get()), 1000));
    reopened.tick(air.SETTLE_MS + 1);
    const late = [];
    air.followAired(reopened, { liveCue: { Card: 'cue-b' }, seeded: true, facts: facts(collection(6, people6())), send: (g, v) => (late.push(v.f0), Promise.resolve(ANSWERED)) });
    assert.deepEqual([card(reopened).cueId, late], ['cue-b', ['Bertta Berg']], 'the server\'s marker decides B, and B follows');
    // A definite failure gives back what airs at once.
    const d = io();
    air.pressSelection(d, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(d, 'Card', 'cue-b', ok(selectionOf('D2', 7))).undo();
    assert.deepEqual([card(d).cueId, card(d).known], ['cue-a', true]);
    assert.equal(air.nextSettle(d.part.get()), null, 'nothing settling');
    assert.equal(air.nextSettle(reopened.part.get()), null, 'settled by the follow');
    const t = io();
    air.pressSelection(t, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(t, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true).undo({ uncertain: true });
    assert.equal(air.nextSettle(t.part.get()), t.now() + air.SETTLE_MS, 'the page follows once more when it ends');
  });

  test('a press with no answer may still land over an older one whose answer comes after; a later press that lands settles both', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const older = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 8)));
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7))).undo({ uncertain: true });
    older.landed();
    assert.equal(card(p).known, false, 'cue-b may still land after cue-a');
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    assert.deepEqual([card(p).known, p.part.get().Card.settling], [true, undefined], 'a newer press landed: nothing older arrives over it');
  });

  test('the fields a layer protects are the ones captured with its candidates, whatever the cue\'s recipe says now', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    assert.deepEqual(air.protectedFields(p.part.get(), 'Card', 'cue-a'), ['f0', 'f1', 'f2']);
    assert.deepEqual(air.protectedFields(p.part.get(), 'Card', 'plain'), [], 'the marker names another cue');
    air.pressSelection(p, 'Card', 'plain', { status: 'none' });
    assert.deepEqual(air.protectedFields(p.part.get(), 'Card', 'plain'), ['f0', 'f1', 'f2'], 'a press out: what may still air');
  });

  test('a hold names the revision the output shows, not one still on its way', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send: () => new Promise(() => {}) });
    assert.deepEqual([card(p).revision, card(p).showing?.revision], [6, 5]);
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)));
    assert.equal(card(p).showing, undefined, 'another candidate on its way: not known to show it');
  });

  test('a send refused because another screen changed the card: nothing is sent on its own until this page presses', async () => {
    for (const refused of ['correction', 'press']) {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      const sends = [];
      let fate = { ok: false, stale: true };
      const send = (graphic, values) => (sends.push(values.f1), Promise.resolve(fate));
      if (refused === 'correction') air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
      else air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7), 6)).undo({ stale: true });
      await settle();
      fate = ANSWERED;
      assert.match(card(p).held?.reason ?? '', /another screen/, refused);
      assert.equal(air.airedValues(p.part.get(), 'Card', 'cue-a'), null, `${refused}: what airs is not known to be these values`);
      air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(7, [person('D1', 7, 'Aino Aalto', 1600)])), send });
      await settle();
      assert.equal(sends.length, refused === 'correction' ? 1 : 0, `${refused}: no resend once the head is known`);
      const kept = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 9000);
      assert.equal(typeof kept.Card.blocked?.since, 'number', 'kept across a reload');
      const raw = JSON.parse(air.writeSelectionAir(p.part.get()));
      raw.graphics.Card.blocked = { since: 'soon' };
      assert.deepEqual(air.readSelectionAir(JSON.stringify(raw), 9000), {}, 'a malformed block is not read');
      const rawMoved = JSON.parse(air.writeSelectionAir(p.part.get()));
      rawMoved.graphics.Card.blocked.moved = 'yes';
      assert.deepEqual(air.readSelectionAir(JSON.stringify(rawMoved), 9000), {}, 'nor a malformed moved flag');
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7), 7)).landed();
      assert.equal(card(p).held, undefined, `${refused}: the operator's Take lifts it`);
      air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(8, [person('D1', 7, 'Aino Aalto', 1700)])), send });
      await settle();
      assert.equal(sends[sends.length - 1], '1700', `${refused}: following again`);
    }
  });

  test('a Take or an Out that did not land leaves a marker this page moved: nothing goes on its own until a press lands; a reload reads the marker again', async () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    const send = (graphic, values) => (sends.push(values.f1), Promise.resolve(ANSWERED));
    // Another screen took Card; this page took cue-a again, which moved its marker back to cue-a.
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7)), true).undo();
    assert.match(card(p).held?.reason ?? '', /did not go through/);
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
    await settle();
    assert.deepEqual(sends, [], 'nothing on its own');
    assert.equal(air.airedValues(p.part.get(), 'Card', 'cue-a'), null);
    const reopened = io(air.readSelectionAir(air.writeSelectionAir(p.part.get()), 1000));
    air.followAired(reopened, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
    await settle();
    assert.deepEqual(sends, ['1500'], 'a reopened page reads the marker from the server');
    // An Update moves no marker: its failure gives back what airs, and following goes on.
    const u = io();
    air.pressSelection(u, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(u, 'Card', 'cue-a', ok(selectionOf('D1', 7))).undo();
    assert.equal(card(u).held, undefined);
    // An Out on its way: no correction follows it out or overtakes it; landed, the layer goes.
    const o = io();
    air.pressSelection(o, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const out = air.pressSelection(o, 'Card', '', { status: 'none' }, true);
    const during = [];
    air.followAired(o, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send: (g, v) => (during.push(v.f1), Promise.resolve(ANSWERED)) });
    assert.deepEqual(during, [], 'no correction while the Out is out');
    out.landed();
    air.followAired(o, { liveCue: {}, seeded: true, facts: facts(collection(6, people6())), send });
    assert.deepEqual(o.part.get(), {});
  });

  test('a refusal as stale on any road blocks the layers it names: the page learned the head, so a correction would pass', async () => {
    const sends = [];
    const send = (g, v) => (sends.push(v.f1), Promise.resolve(ANSWERED));
    for (const named of [['Card', 'Gone'], ['Other']]) {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      air.staleSelection(p, named);
      air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
      await settle();
      assert.equal(p.part.get().Gone, undefined, 'a graphic with no layer gets none');
    }
    assert.deepEqual(sends, ['1500'], 'the named layer holds; one not named follows');
  });

  test('a recipe whose field map changed since the Take holds: a field dropped from it stays at its old count on air', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    const dropped = [{ ...RECIPE, fields: { f0: RECIPE.fields.f0, f2: RECIPE.fields.f2 } }];
    air.followAired(p, { liveCue: live, seeded: true, facts: { ...facts(collection(6, people6())), collections: dropped }, send: (g, v) => (sends.push(v), Promise.resolve(ANSWERED)) });
    assert.deepEqual([sends, card(p).held?.reason], [[], 'its collection recipe changed since it was taken']);
  });

  test('another screen\'s update of a candidate\'s fields blocks it; its own echo, an unstamped row, a command that moves no field, or another card\'s fields do not (sixth assessment)', async () => {
    const sends = [];
    const send = (g, v) => (sends.push(v.f0), Promise.resolve(ANSWERED));
    const mine = (msg) => msg.oid === 'mine';
    const cases = [
      ['another screen', { t: 'update', oid: 'theirs', snd: { i: 'x', at: 1 }, data: { f0: 'Someone' } }, true],
      ['this page', { t: 'update', oid: 'mine', snd: { i: 'x', at: 1 }, data: { f0: 'Someone' } }, false],
      ['a server row', { t: 'update', oid: 'theirs', data: { f0: 'Someone' } }, false],
      ['a Next', { t: 'next', oid: 'theirs', snd: { i: 'x', at: 1 } }, false],
      ['an event', { t: 'event', oid: 'theirs', snd: { i: 'x', at: 1 }, event: 'flash', data: { f0: 'Someone' } }, false],
      ['other fields', { t: 'update', oid: 'theirs', snd: { i: 'x', at: 1 }, data: { f9: '2' } }, false],
    ];
    for (const [name, msg, blocks] of cases) {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      air.foreignSelection(p, [{ graphic: 'Card', msg }, { graphic: 'Gone', msg }], mine);
      sends.length = 0;
      air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
      await settle();
      assert.deepEqual([sends.length, !!card(p).held], blocks ? [0, true] : [1, false], name);
      assert.equal(p.part.get().Gone, undefined, `${name}: no layer is made`);
    }
  });

  test('a press whose answer comes after another screen\'s newer change was heard does not end the block that change set (automated review)', async () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const update = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    p.tick(1000);
    air.foreignSelection(p, [{ graphic: 'Card', msg: { t: 'update', oid: 'theirs', snd: { i: 'them', at: 0 }, data: { f1: '1' } } }], () => false);
    p.tick(100);
    update.landed();
    const sends = [];
    const send = (g, v) => (sends.push(v.f1), Promise.resolve(ANSWERED));
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
    await settle();
    assert.deepEqual([sends, !!card(p).held], [[], true], 'still blocked: the Update was sent before the other screen\'s change');
    assert.equal(air.airedValues(p.part.get(), 'Card', 'cue-a'), null);
    p.tick(100);
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7), 6)).landed();
    assert.equal(card(p).held, undefined, 'a press sent after it ends the block');
    // A block already set by a refusal, then a newer change heard while an Update is out: the
    // Update, sent between the two, does not end it.
    const q = io();
    air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    q.tick(50);
    air.staleSelection(q, ['Card']);
    q.tick(50);
    const between = air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    q.tick(100);
    air.foreignSelection(q, [{ graphic: 'Card', msg: { t: 'update', oid: 'theirs', snd: { i: 'them', at: 0 }, data: { f1: '1' } } }], () => false);
    between.landed();
    assert.ok(card(q).held, 'the newer change still blocks');
    const raw = JSON.parse(air.writeSelectionAir(q.part.get()));
    raw.graphics.Card.blocked.stale = 'later';
    assert.deepEqual(air.readSelectionAir(JSON.stringify(raw), 9000), {}, 'a malformed block time is not read');
  });

  test('a Take that did not land keeps the layer and its protected fields while the marker names another cue (sixth assessment)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(p, 'Card', 'plain', { status: 'none' }, true).undo();
    air.followAired(p, { liveCue: { Card: 'plain' }, seeded: true, facts: facts(collection(6, people6())), send: () => Promise.resolve(ANSWERED) });
    assert.equal(card(p).cueId, 'cue-a', 'not forgotten on a marker this page moved');
    assert.deepEqual(air.protectedFields(p.part.get(), 'Card', 'plain'), ['f0', 'f1', 'f2'], 'Snap and events on the plain cue leave them alone');
    air.pressSelection(p, 'Card', 'plain', { status: 'none' }, true).landed();
    air.followAired(p, { liveCue: { Card: 'plain' }, seeded: true, facts: facts(collection(6, people6())), send: () => Promise.resolve(ANSWERED) });
    assert.deepEqual(p.part.get(), {}, 'the plain Take landed: the layer goes');
  });

  test('a later Take that lands ends the block an earlier one that did not land set; an earlier Take that lands does not (automated review)', async () => {
    const sends = [];
    const send = (g, v) => (sends.push(v.f0), Promise.resolve(ANSWERED));
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const b = air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true);
    const c = air.pressSelection(p, 'Card', 'cue-c', ok(selectionOf('D1', 7)), true);
    b.undo();
    c.landed();
    air.followAired(p, { liveCue: { Card: 'cue-c' }, seeded: true, facts: facts(collection(6, people6())), send });
    await settle();
    assert.deepEqual([card(p).held, sends], [undefined, ['Aino Aalto']], 'C airs and follows');
    const q = io();
    air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const early = air.pressSelection(q, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true);
    air.pressSelection(q, 'Card', 'cue-c', ok(selectionOf('D1', 7)), true).undo();
    early.landed();
    assert.match(card(q).held?.reason ?? '', /did not go through/, 'the later Take moved the marker after the one that landed');
    // Two Takes that did not land around an Update that did: the newest of them still holds.
    const r = io();
    air.pressSelection(r, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const first = air.pressSelection(r, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true);
    const update = air.pressSelection(r, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    const last = air.pressSelection(r, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true);
    first.undo();
    last.undo();
    update.landed();
    assert.ok(card(r).held, 'the Take after the Update did not land');
  });

  test('a second refusal or another screen\'s change after a press was sent keeps the block when that press lands', () => {
    for (const second of ['refusal', 'another screen']) {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      air.staleSelection(p, ['Card']);
      p.tick(100);
      const update = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
      p.tick(100);
      if (second === 'refusal') air.staleSelection(p, ['Card']);
      else air.foreignSelection(p, [{ graphic: 'Card', msg: { t: 'update', oid: 'x', snd: { i: 'x', at: 0 }, data: { f0: 'Someone' } } }], () => false);
      update.landed();
      assert.ok(card(p).held, second);
    }
    // The same through a refusal of one of this page's own sends.
    const q = io();
    air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.staleSelection(q, ['Card']);
    q.tick(100);
    const update = air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    const refused = air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    q.tick(100);
    refused.undo({ stale: true });
    update.landed();
    assert.ok(card(q).held, 'a refusal after the Update was sent');
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.staleSelection(p, ['Card']);
    const raw = JSON.parse(air.writeSelectionAir(p.part.get()));
    raw.graphics.Card.blocked.stale = 'then';
    assert.deepEqual(air.readSelectionAir(JSON.stringify(raw), 9000), {}, 'a malformed block is not read');
  });

  test('an update carrying values the layer holds changes nothing; the newest update in the log a reopened page reads decides (eighth assessment)', async () => {
    const aino = ok(selectionOf('D1', 7)).values;
    const stamped = (data, oid) => ({ t: 'update', oid, snd: { i: 'x', at: 0 }, data });
    const blocked = (rows, live = true) => {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      if (live) air.foreignSelection(p, rows.map((msg) => ({ graphic: 'Card', msg })), () => false);
      else air.foreignHistory(p, rows.map((msg) => ({ graphic: 'Card', msg })), () => false);
      return !!card(p).held;
    };
    assert.equal(blocked([stamped(aino, 'echo')]), false, 'this page\'s own send heard after a reload, or another desk following the same candidate');
    assert.equal(blocked([stamped({ ...aino, f1: '1' }, 'other')]), true, 'another count');
    assert.equal(blocked([stamped({ f0: 'Someone' }, 'old'), stamped(aino, 'mine')], false), false, 'the log: this page wrote last');
    assert.equal(blocked([stamped(aino, 'mine'), stamped({ f0: 'Someone' }, 'other')], false), true, 'the log: another screen wrote last');
    assert.equal(blocked([stamped(aino, 'mine'), { t: 'update', oid: 'api', data: { f0: 'Someone' } }], false), false, 'an unstamped server row is not another screen');
  });

  test('a block from a Take that did not land stays one when another screen\'s change or a refusal comes too; a reload keeps only the other screen\'s part (seventh assessment)', () => {
    for (const then of ['refusal', 'another screen']) {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      air.pressSelection(p, 'Card', 'plain', { status: 'none' }, true).undo();
      if (then === 'refusal') air.staleSelection(p, ['Card']);
      else air.foreignSelection(p, [{ graphic: 'Card', msg: { t: 'update', oid: 'x', snd: { i: 'x', at: 0 }, data: { f0: 'Someone' } } }], () => false);
      air.followAired(p, { liveCue: { Card: 'plain' }, seeded: true, facts: facts(collection(6, people6())), send: () => Promise.resolve(ANSWERED) });
      assert.equal(card(p).cueId, 'cue-a', `${then}: not dropped on the marker this page moved`);
      assert.deepEqual(air.protectedFields(p.part.get(), 'Card', 'plain'), ['f0', 'f1', 'f2'], `${then}: its fields stay protected`);
      assert.match(card(p).held.reason, /did not go through/);
      const reopened = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 9000);
      assert.deepEqual(reopened.Card.blocked, { since: 1000, stale: 1000 }, `${then}: a reopened page keeps the other screen's change`);
    }
  });

  test('a reload of a layer that did not know what airs settles it again: sends folded into it may still arrive', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true).undo({ uncertain: true });
    const reopened = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 99000);
    assert.equal(reopened.Card.settling, 99000 + air.SETTLE_MS);
    // Held by the Take that did not land, the layer still stops settling once that is over.
    p.tick(air.SETTLE_MS + 1);
    air.followAired(p, { liveCue: { Card: 'cue-b' }, seeded: true, facts: facts(collection(6, people6())), send: () => Promise.resolve(ANSWERED) });
    assert.equal(air.nextSettle(p.part.get()), null);
  });

  test('a press that lands below a revision a hold judged keeps the hold, so that revision still goes (sixth assessment)', async () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    const send = (g, v) => (sends.push(v.f1), Promise.resolve(ANSWERED));
    const nine = collection(9, [person('D1', 7, 'Aino Aalto', 1900)]);
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(nine, { fieldsOf: () => [text('f0')] }), send });
    air.pressSelection(p, 'Card', 'cue-a', take(selectionOf('D1', 7), collection(8, [person('D1', 7, 'Aino Aalto', 1800)]))).landed();
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(nine), send });
    await settle();
    assert.deepEqual([sends, card(p).revision], [['1900'], 9]);
  });

  test('the page follows once when the earliest layer stops settling, re-armed as the layers change, and stops cleanly', () => {
    const p = io();
    const timers = new Map();
    let next = 0;
    let follows = 0;
    const stop = air.watchSettling(p.part, {
      now: p.now,
      follow: () => (follows += 1),
      setTimeout: (run, ms) => (timers.set(++next, { run, ms }), next),
      clearTimeout: (id) => timers.delete(id),
    });
    assert.equal(timers.size, 0, 'nothing settling: no timer');
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true).undo({ uncertain: true });
    assert.deepEqual([...timers.values()].map((t) => t.ms), [air.SETTLE_MS + 100], 'armed for the end of the settling, with a margin');
    const [[id, { run }]] = [...timers];
    timers.delete(id);
    run();
    assert.equal(follows, 1, 'one follow when it ends');
    p.part.set({});
    assert.equal(timers.size, 0, 'nothing settling again: nothing armed');
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true).undo({ uncertain: true });
    assert.equal(timers.size, 1);
    p.part.set({});
    assert.equal(timers.size, 0, 'the layers moved on: the old timer is cleared');
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)), true).undo({ uncertain: true });
    stop();
    assert.equal(timers.size, 0, 'stopped: the timer is cleared');
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D2', 7))).undo({ uncertain: true });
    assert.equal(timers.size, 0, 'and no longer listens');
  });

  test('a correction that failed with no answer may have aired: an older revision is not sent over it, and it goes once more', async () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    let fate = { ok: false, uncertain: true };
    const send = (graphic, values) => (sends.push(values.f1), Promise.resolve(fate));
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(7, [person('D1', 7, 'Aino Aalto', 1600)])), send });
    await settle();
    fate = ANSWERED;
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
    await settle();
    assert.deepEqual(sends, ['1600'], 'revision 6 is never sent over 7');
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(7, [person('D1', 7, 'Aino Aalto', 1600)])), send });
    await settle();
    assert.deepEqual(sends, ['1600', '1600'], '7 goes once more');
    assert.equal(p.part.get().Card.marks[Object.keys(p.part.get().Card.marks)[0]].lostAt, undefined, 'spent once 7 landed');
  });

  test('a correction out when a Take displaces it: failed, then the Take failing, revision 6 goes again; landed, then the Take failing, 6 is what airs', async () => {
    for (const correction of ['failed', 'landed']) {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      let answer;
      const sends = [];
      const send = (graphic, values) => {
        sends.push(values.f1);
        return sends.length === 1 ? new Promise((r) => (answer = r)) : Promise.resolve(ANSWERED);
      };
      air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
      assert.equal(card(p).revision, 6, 'the correction is out');
      const b = air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7), 6));
      answer(correction === 'failed' ? { ok: false } : ANSWERED);
      await settle();
      b.undo();
      assert.deepEqual([card(p).cueId, card(p).revision, p.part.get().Card.onAir.revision], ['cue-a', correction === 'failed' ? 5 : 6, correction === 'failed' ? 5 : 6], correction);
      air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
      await settle();
      assert.deepEqual(sends, correction === 'failed' ? ['1500', '1500'] : ['1500'], `${correction}: revision 6 goes again only if it did not land`);
    }
  });

  test('a correction displaced by a press keeps a newer revision observed since: an older one read out of order is still rejected', async () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    const send = (graphic, values) => {
      sends.push(values.f1);
      return new Promise(() => {});
    };
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(9, BASE.slice(1))), send });
    assert.deepEqual([card(p).revision, card(p).held?.revision], [6, 9]);
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7), 9)).undo();
    assert.deepEqual([card(p).revision, card(p).held?.revision], [6, 9], 'the correction is still out; the deletion still holds');
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(8, people6())), send });
    assert.deepEqual(sends, ['1500'], 'revision 8 is older than what said Aino is gone');
    assert.equal(card(p).held?.revision, 9);
  });

  test('a reload: sends for the candidate on air are followed again; overlapping Updates of it come back as what landed (/so D1)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send: () => new Promise(() => {}) });
    assert.equal(card(p).revision, 6, 'out, not answered');
    const restored = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 8000);
    assert.deepEqual([air.airedOf(restored, 'Card').revision, air.airedOf(restored, 'Card').values.f1], [5, '1200']);
    const again = air.reduceSelection(restored, { t: 'follow', liveCue: live, seeded: true, facts: facts(collection(6, people6())), mint: air.mintSend, now: 8000 + air.SETTLE_MS + 1 });
    assert.deepEqual(again.sends.map((x) => x.values.f1), ['1500'], 'revision 6 goes again');
    const u = io();
    air.pressSelection(u, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(u, 'Card', 'cue-a', take(selectionOf('D1', 7), collection(6, people6())));
    air.pressSelection(u, 'Card', 'cue-a', take(selectionOf('D1', 7), collection(7, [person('D1', 7, 'Aino Aalto', 1600)])));
    const back = air.readSelectionAir(air.writeSelectionAir(u.part.get()), 8000);
    assert.deepEqual([air.airedOf(back, 'Card').revision, air.airedOf(back, 'Card').known], [5, true], 'neither Update is known to have landed: 5 is what airs');
    const sent = air.reduceSelection(back, { t: 'follow', liveCue: live, seeded: true, facts: facts(collection(7, [person('D1', 7, 'Aino Aalto', 1600)])), mint: air.mintSend, now: 8000 + air.SETTLE_MS + 1 });
    assert.deepEqual(sent.sends.map((x) => x.values.f1), ['1600'], 'and the newest revision goes');
  });

  test('a reload with an Update to another person on the same cue unanswered: not known who airs, held, nothing sent (/so D2)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(p, 'Card', 'cue-a', take(selectionOf('D2', 7), collection(6, people6())));
    const restored = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 8000);
    const view = air.airedOf(restored, 'Card');
    assert.deepEqual([view.known, view.held?.reason, view.held?.since], [false, 'it is not known which candidate is on air after the page reloaded', 8000]);
    const read = air.reduceSelection(restored, { t: 'follow', liveCue: live, seeded: true, facts: facts(collection(7, BASE)), mint: air.mintSend, now: 8000 + air.SETTLE_MS + 1 });
    assert.deepEqual(read.sends, [], 'the marker names the cue both share: still not known, nothing sent');
    const q = { ...io(restored) };
    air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D2', 7), 7)).landed();
    assert.deepEqual([card(q).known, card(q).held, card(q).entity], [true, undefined, air.airedOf(p.part.get(), 'Card').entity], 'an operator press decides');
  });

  test('a correction answering while an Update of the same candidate is out: its landing is what airs if the Update fails (/so D3a)', async () => {
    for (const outcome of ['landed', 'undo']) {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      let answer;
      const sends = [];
      const send = (graphic, values) => {
        sends.push(values.f1);
        return sends.length === 1 ? new Promise((r) => (answer = r)) : new Promise(() => {});
      };
      air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
      const update = air.pressSelection(p, 'Card', 'cue-a', take(selectionOf('D1', 7), collection(7, [person('D1', 7, 'Aino Aalto', 1600)])));
      answer(ANSWERED);
      await settle();
      assert.equal(card(p).pending, true, `${outcome}: the Update is still out`);
      update[outcome]();
      assert.equal(card(p).pending, false, `${outcome}: its answer ends it`);
      assert.deepEqual([card(p).revision, p.part.get().Card.onAir.revision], outcome === 'landed' ? [7, 7] : [6, 6]);
      if (outcome === 'undo') {
        air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(7, [person('D1', 7, 'Aino Aalto', 1600)])), send });
        assert.equal(sends.at(-1), '1600', 'and the newest revision is followed again');
      }
    }
  });

  test('a later Update failing while an earlier one is out: the earlier one is still out, for its own answer to settle', () => {
    for (const outcome of ['landed', 'undo']) {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      const first = air.pressSelection(p, 'Card', 'cue-a', take(selectionOf('D1', 7), collection(6, people6())));
      air.pressSelection(p, 'Card', 'cue-a', take(selectionOf('D1', 7), collection(7, [person('D1', 7, 'Aino Aalto', 1600)]))).undo();
      assert.deepEqual([card(p).revision, card(p).pending], [6, true], `${outcome}: the first Update is still out`);
      first[outcome]();
      assert.equal(card(p).pending, false, `${outcome}: its answer settles it`);
      assert.deepEqual([card(p).revision, p.part.get().Card.onAir.revision], outcome === 'landed' ? [6, 6] : [5, 5]);
    }
  });

  test('another recipe for the same key is another candidate: its revisions and holds are its own (assessment 1)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', air.selectionTake({ selection: selectionOf('D1', 7) }, 'Card', both(collection(50, BASE), collection(1, BASE)))).landed();
    const sends = [];
    const send = (g, v) => (sends.push(v.f1), Promise.resolve(ANSWERED));
    air.followAired(p, { liveCue: live, seeded: true, facts: both(collection(60, BASE.slice(1)), collection(1, BASE)), send });
    assert.equal(card(p).held?.revision, 60, 'the preliminary count held at 60');
    air.pressSelection(p, 'Card', 'cue-a', air.selectionTake({ selection: officialOf('D1', 7) }, 'Card', both(collection(60, BASE), collection(3, BASE)))).landed();
    for (const r of [4, 10, 59]) air.followAired(p, { liveCue: live, seeded: true, facts: both(collection(60, BASE), collection(r, [person('D1', 7, 'Aino Aalto', r)])), send });
    assert.deepEqual(sends, ['4', '10', '59'], 'the official count follows its own revisions');
  });

  test('a reload with an Update to another recipe unanswered: not known which airs, nothing sent from either (assessment 2)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', air.selectionTake({ selection: selectionOf('D1', 7) }, 'Card', both(collection(50, BASE), collection(3, BASE)))).landed();
    air.pressSelection(p, 'Card', 'cue-a', air.selectionTake({ selection: officialOf('D1', 7) }, 'Card', both(collection(50, BASE), collection(3, BASE))));
    const restored = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 8000);
    assert.equal(air.airedOf(restored, 'Card').known, false);
    const read = air.reduceSelection(restored, { t: 'follow', liveCue: live, seeded: true, facts: both(collection(51, BASE), collection(4, BASE)), mint: air.mintSend, now: 8000 + air.SETTLE_MS + 1 });
    assert.deepEqual(read.sends, []);
    assert.deepEqual(air.protectedSelections(restored, 'Card', 'cue-z'), [selectionOf('D1', 7), officialOf('D1', 7)], 'both selectors\' fields stay protected, whatever the marker names');
  });

  test('a reload with the same cue taken without a selection unanswered: the marker cannot tell, nothing is sent (assessment 3)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(p, 'Card', 'cue-a', { status: 'none' });
    const restored = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 8000);
    const read = air.reduceSelection(restored, { t: 'follow', liveCue: live, seeded: true, facts: facts(collection(6, people6())), mint: air.mintSend, now: 8000 + air.SETTLE_MS + 1 });
    assert.deepEqual([read.sends, air.airedOf(read.air, 'Card')?.known], [[], false]);
    const other = air.reduceSelection(restored, { t: 'follow', liveCue: { Card: 'cue-z' }, seeded: true, facts: facts(collection(6, people6())), mint: air.mintSend, now: 8000 + air.SETTLE_MS + 1 });
    assert.deepEqual(other.air, {}, 'the marker names neither: gone');
  });

  test('a hold a revision set ends when that same revision reads well, and it is sent (assessment 6)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    const send = (g, v) => (sends.push(v.f1), Promise.resolve(ANSWERED));
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6()), { fieldsOf: () => [text('f0')] }), send });
    assert.deepEqual([sends, card(p).held?.revision], [[], 6], 'the graphic lost a mapped field at revision 6');
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
    assert.deepEqual([sends, card(p).held, card(p).revision], [['1500'], undefined, 6]);
  });

  test('a hold survives a reload that the marker decides: the held revision is still sent once its field is back (automated review)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    const send = (g, v) => (sends.push(v.f1), Promise.resolve(ANSWERED));
    const nine = collection(9, [person('D1', 7, 'Aino Aalto', 1900)]);
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(nine, { fieldsOf: () => [text('f0')] }), send });
    assert.equal(card(p).held?.revision, 9, 'revision 9 held: a field was missing');
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)));
    const restored = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 8000);
    const q = io(restored);
    q.tick(8000 + air.SETTLE_MS);
    air.followAired(q, { liveCue: live, seeded: true, facts: facts(nine), send });
    assert.deepEqual([sends, card(q).cueId], [['1900'], 'cue-a'], 'the marker decided A, and revision 9 goes');
  });

  test('an Update that fails keeps the hold it would have ended: the held revision still goes on the next read (automated review)', async () => {
    for (const fate of ['failed', 'skipped']) {
      const p = io();
      air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
      const sends = [];
      const send = (g, v) => (sends.push(v.f1), Promise.resolve(ANSWERED));
      const nine = collection(9, [person('D1', 7, 'Aino Aalto', 1900)]);
      air.followAired(p, { liveCue: live, seeded: true, facts: facts(nine, { fieldsOf: () => [text('f0')] }), send });
      assert.equal(card(p).held?.revision, 9, 'revision 9 held: a field was missing');
      // The field is back; the operator presses Update, and it does not land.
      air.pressSelection(p, 'Card', 'cue-a', take(selectionOf('D1', 7), nine)).undo();
      air.followAired(p, { liveCue: live, seeded: true, facts: facts(nine), send });
      await settle();
      assert.deepEqual([sends, card(p).revision], [['1900'], 9], `${fate}: revision 9 goes`);
    }
  });

  test('a revision that held, then read well and went, but failed to send: said "not sent" and sent again', async () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    let fail = true;
    const send = (g, v) => (sends.push(v.f1), Promise.resolve(fail ? { ok: false } : ANSWERED));
    const nine = collection(9, [person('D1', 7, 'Aino Aalto', 1900)]);
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(nine, { fieldsOf: () => [text('f0')] }), send });
    assert.equal(card(p).held?.revision, 9, 'revision 9 held: a field was missing');
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(nine), send });
    await settle();
    assert.deepEqual([sends, card(p).revision, card(p).held?.unsent], [['1900'], 5, true], 'it read well and went, and failed');
    fail = false;
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(nine), send });
    await settle();
    assert.deepEqual([sends, card(p).revision, card(p).held], [['1900', '1900'], 9, undefined], 'sent again, and it landed');
  });

  test('a layer the marker decides after a reload follows the newest tree in the same pass (assessment 7)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)));
    const restored = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 8000);
    const read = air.reduceSelection(restored, { t: 'follow', liveCue: live, seeded: true, facts: facts(collection(6, people6())), mint: air.mintSend, now: 8000 + air.SETTLE_MS + 1 });
    assert.deepEqual([air.airedOf(read.air, 'Card').known, read.sends.map((x) => x.values.f1)], [true, ['1500']]);
  });

  test('a recipe changed under a captured selector holds the card: another source is not this candidate', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    const moved = { ...RECIPE, sourceId: 'e9' };
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6()), { collections: [moved], tree: { external: { e9: { candidates: collection(6, people6()) } } } }), send: (g, v) => (sends.push(v.f1), Promise.resolve(ANSWERED)) });
    assert.deepEqual([sends, card(p).held?.reason], [[], 'its collection recipe changed since it was taken']);
  });

  test('a reload that lost a correction\'s answer: nothing older than it is sent, and it goes once more (re-assessment 1)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7), 1)).landed();
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(3, people6())), send: () => new Promise(() => {}) });
    const restored = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 8000);
    const after = 8000 + air.SETTLE_MS + 1;
    const read = (state, c) => air.reduceSelection(state, { t: 'follow', liveCue: live, seeded: true, facts: facts(c), mint: air.mintSend, now: after });
    assert.deepEqual(read(restored, collection(2, BASE)).sends, [], 'revision 2 is older than the correction that may have aired');
    const again = read(restored, collection(3, people6()));
    assert.deepEqual(again.sends.map((x) => x.values.f1), ['1500'], 'revision 3 goes once more');
    assert.deepEqual(read(again.air, collection(3, people6())).sends, [], 'once');
    // The same through a marker decision: A r1 on air, a Take of B and a Take of A r3 out.
    const q = io();
    air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7), 1)).landed();
    air.pressSelection(q, 'Card', 'cue-b', ok(selectionOf('D2', 7), 1));
    air.pressSelection(q, 'Card', 'cue-a', take(selectionOf('D1', 7), collection(3, people6())));
    const back = air.readSelectionAir(air.writeSelectionAir(q.part.get()), 8000);
    assert.deepEqual(read(back, collection(2, BASE)).sends, [], 'decided A: nothing older than its Take at 3');
    assert.deepEqual(read(back, collection(3, people6())).sends.map((x) => x.values.f1), ['1500']);
  });

  test('a restored layer decides nothing and sends nothing while a send of the page that went away may still arrive (re-assessment 2)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7), 1)).landed();
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7), 1));
    const restored = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 8000);
    const early = air.reduceSelection(restored, { t: 'follow', liveCue: live, seeded: true, facts: facts(collection(2, BASE)), mint: air.mintSend, now: 9000 });
    assert.deepEqual([early.sends, early.air], [[], restored], 'the Take of B may still land: A is not decided, nothing goes');
    const later = air.reduceSelection(restored, { t: 'follow', liveCue: { Card: 'cue-b' }, seeded: true, facts: facts(collection(2, BASE)), mint: air.mintSend, now: 8000 + air.SETTLE_MS + 1 });
    assert.equal(air.airedOf(later.air, 'Card').cueId, 'cue-b', 'it landed: B is decided');
    assert.deepEqual(later.sends.map((x) => x.values.f0), ['Bertta Berg']);
  });

  test('while a press is out its candidate\'s fields are protected, whatever cue the marker still names (re-assessment 3)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)));
    assert.deepEqual(air.protectedSelections(p.part.get(), 'Card', 'plain'), [selectionOf('D2', 7)]);
    const q = io();
    air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    assert.deepEqual(air.protectedSelections(q.part.get(), 'Card', 'cue-a'), [selectionOf('D1', 7)]);
    assert.deepEqual(air.protectedSelections(q.part.get(), 'Card', 'plain'), [], 'settled, the marker on another cue: that cue\'s fields are its own');
  });

  test('Snap and events get a candidate\'s values only while what airs is known for certain (assessment 3: F1, F3)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    assert.equal(air.airedValues(p.part.get(), 'Card', 'cue-a').f0, 'Aino Aalto', 'settled: what airs');
    assert.equal(air.airedValues(p.part.get(), 'Card', 'cue-b'), null, 'another cue: none');
    const b = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D2', 7)));
    assert.equal(air.airedValues(p.part.get(), 'Card', 'cue-a'), null, 'an Update to B is out: neither A nor B for certain');
    b.undo();
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send: () => new Promise(() => {}) });
    assert.equal(air.airedValues(p.part.get(), 'Card', 'cue-a'), null, 'a correction is out');
    const restored = air.readSelectionAir(air.writeSelectionAir(p.part.get()), 8000);
    assert.equal(air.airedValues(restored, 'Card', 'cue-a'), null, 'restored with a lost send: it may trail what airs');
  });

  test('a cue without a selection taken onto the layer by something else (a timed end) holds every correction until it is answered (assessment 3: F2)', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const timed = air.pressSelection(p, 'Card', 'cue-n', { status: 'none' });
    const sends = [];
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send: (g, v) => (sends.push(v.f1), new Promise(() => {})) });
    assert.deepEqual(sends, [], 'the Take of cue-n is out: nothing goes onto its card');
    timed.landed();
    air.followAired(p, { liveCue: { Card: 'cue-n' }, seeded: true, facts: facts(collection(6, people6())), send: (g, v) => (sends.push(v.f1), new Promise(() => {})) });
    assert.deepEqual([sends, p.part.get()], [[], {}], 'it landed: the layer is gone, nothing sent');
  });

  test('a page whose sends are not ordered per graphic (protocol 1) never sends a correction on its own: it holds, and presses still go', () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    const send = (g, v) => (sends.push(v.f1), new Promise(() => {}));
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6()), { ordered: false }), send });
    assert.deepEqual(sends, [], 'nothing on its own');
    assert.match(card(p).held?.reason ?? '', /cannot send it on its own/);
    assert.deepEqual([card(p).revision, card(p).values.f1], [5, '1200'], 'what airs is held');
    const update = air.pressSelection(p, 'Card', 'cue-a', take(selectionOf('D1', 7), collection(6, people6())));
    update.landed();
    assert.deepEqual([card(p).revision, card(p).held], [6, undefined], 'the operator\'s own Update goes, and ends the hold');
  });

  test('an answer to a send of a layer since removed never settles a later press: send numbers are never reused', async () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    let answer;
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send: () => new Promise((r) => (answer = r)) });
    air.followAired(p, { liveCue: {}, seeded: true, facts: facts(collection(6, people6())), send: () => new Promise(() => {}) });
    assert.deepEqual(p.part.get(), {}, 'off air: the layer is gone, its correction still out');
    const b = air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7), 6));
    const c = air.pressSelection(p, 'Card', 'cue-c', ok(selectionOf('D1', 8), 6));
    answer({ ok: false });
    await settle();
    assert.deepEqual([card(p).cueId, p.part.get().Card.out.length], ['cue-c', 2], 'the old answer found nothing of this layer');
    b.landed();
    c.landed();
    assert.deepEqual([card(p).cueId, card(p).pending], ['cue-c', false]);
  });

  test('a disposed page writes no selection: a late answer cannot overwrite what a reopened page captured', async () => {
    let alive = true;
    const p = { ...io(), alive: () => alive };
    const a = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    const captured = p.part.get();
    alive = false;
    a.landed();
    a.undo();
    air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)));
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send: () => Promise.resolve({ ok: false }) });
    await settle();
    assert.equal(p.part.get(), captured, 'nothing written after disposal');
    assert.equal(p.kept.length, 1);
  });
});

test('an action carries field values when it reads or moves any: the hosted page holds those back while it cannot see the cue on air', () => {
  assert.equal(air.actionCarriesValues({}), false);
  assert.equal(air.actionCarriesValues({ payload: [] }), false);
  for (const button of [{ payload: ['f1'] }, { adjust: { f1: 1 } }, { set: { f0: 'x' } }, { add: { f2: 'y' } }, { remove: { f2: 'y' } }]) {
    assert.equal(air.actionCarriesValues(button), true, JSON.stringify(button));
  }
});

test('a published page re-reads a live candidate collection every 5 s (E7.1)', () => {
  // A feed may change only the collection; nothing else tells the page, so the read is polled.
  assert.equal(air.CANDIDATE_READ_MS, 5000);
});

test('a candidate cue never goes out with its prepared values; the page reads on its cadence while one is authored or still aired', () => {
  assert.equal(data.preparedCue({}), true);
  assert.equal(data.preparedCue({ selection: selectionOf('D1', 7) }), false);
  assert.equal(data.preparedCue({ selection: { v: 2 } }), false, 'a later version too');
  assert.equal(air.followsCandidates([{}], {}), false);
  assert.equal(air.followsCandidates([{}, { selection: selectionOf('D1', 7) }], {}), true);
  const aired = air.reduceSelection({}, { t: 'press', graphic: 'Card', cueId: 'cue-gone', take: take(selectionOf('D1', 7), collection(5, BASE)), seq: air.mintSend(), now: 1000 }).air;
  assert.equal(air.followsCandidates([{}], aired), true, 'its cue deleted, the layer still airs the candidate');
});

// ── Generated walks over every event, against a model of the output (/so, the transition table) ──
//
// Each walk drives the page's two doors with random events: a Take of cue A or cue B, an Update of
// cue A to another person, a cue without a selection, answers that land, fail or are skipped in any
// order, new and out-of-order tree reads, and reloads whose outstanding sends the server may or
// may not have applied. The ORACLE is the server: it applies a send only when it lands and is newer
// than the last it applied (seqSend.ts skips an older press). After every step:
//   I1  what the layer records as on air is what the page was told landed last;
//   I4  a correction is only ever sent for the entity the output shows, never while a press is out;
//   I5  with nothing out, the layer shows the entity the output shows;
// and at the end, once every answer is in and the tree has been read again, nothing is left out,
// and the layer shows the newest revision of what airs, or holds.
describe('generated walks: the layer against the output', () => {
  const mulberry = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ANSWERED = { ok: true, skipped: [], superseded: [], pressedAgain: [] };
  const SKIPPED = { ok: true, skipped: ['Card'], superseded: [], pressedAgain: [] };
  const settle = () => new Promise((r) => setImmediate(r));
  const keyOf = (t) => (t ? JSON.stringify([t.cueId, t.scope, t.entity]) : 'none');
  const PICKS = [
    ['cue-a', selectionOf('D1', 7)],
    ['cue-a', selectionOf('D2', 7)],
    ['cue-a', officialOf('D1', 7)],
    ['cue-b', selectionOf('D2', 7)],
    ['cue-a', null],
    ['plain', null],
  ];
  // Both sources read the same counts, so a walk can switch one card between them.
  const factsOf = (c, lossy = false) => both(c, c, lossy ? { fieldsOf: (g) => (g === 'Card' ? FIELDS.filter((f) => f.key !== 'f1') : null) } : {});
  const treeAt = (rnd, rev) => {
    const r = rnd();
    if (r < 0.1) return '{broken';
    if (r < 0.18) return collection(rev, []);
    if (r < 0.3) return collection(rev, [person('D2', 7, 'Bertta Berg', rev * 10 + 2)]);
    return collection(rev, [person('D1', 7, 'Aino Aalto', rev * 10 + 1), person('D2', 7, 'Bertta Berg', rev * 10 + 2)]);
  };

  const seen = { press: 0, landed: 0, failed: 0, skipped: 0, correction: 0, reload: 0, unknown: 0, decided: 0, held: 0, unsent: 0, plain: 0, uncertain: 0, stale: 0, other: 0, otherUpdate: 0, blocked: 0 };
  async function walk(seed, steps) {
    const rnd = mulberry(seed);
    const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
    const log = [];
    const fail = (msg) => assert.fail(`seed ${seed}: ${msg}\n  ${log.join('\n  ')}`);
    // The server.
    let index = 0;
    let applied = 0;
    let output = null;
    let trueMarker = undefined;
    // Another screen's Takes: the server refuses a send based before the newest (protocol 2). This
    // page learns the head from its frames (with the marker), a reload, or a refusal (without it).
    let head = 0;
    let known = 0;
    let unheard = false;
    // What aired whenever another screen took over: a page that has not settled since may still
    // record it.
    let before = [];
    // What another screen pressed, as the page hears it (ProductionPage hearCommand).
    let theirs = null;
    // The production's log, oldest first, as far as updates go.
    const rows = [];
    const hear = () => {
      if (!unheard) return;
      unheard = false;
      known = head;
      marker = trueMarker;
      if (theirs) air.foreignSelection(io(), [{ graphic: 'Card', msg: theirs }], () => false);
      log.push(`the page heard another screen's Take (${trueMarker})`);
      // The marker moved: the page follows at once.
      followOnce(tree);
    };
    // The page.
    const part = storePart({});
    let clock = 1000;
    let page = { alive: true };
    let told = null;
    let toldIndex = 0;
    let marker = undefined;
    let seeded = false;
    let reloaded = false;
    let wasUnknown = false;
    let rev = 1;
    let tree = treeAt(rnd, rev);
    const trees = [tree];
    const out = [];
    const io = () => {
      const me = page;
      return { part, keep: (a) => part.set(a), now: () => clock, followNow: () => followOnce(tree), alive: () => me.alive };
    };
    const serve = (send, fate) => {
      if (fate && send.base < head) return 'stale';
      const lands = fate && send.index > applied;
      // What the server puts on air must never be a correction for a card that shows someone else,
      // nor an older revision over a newer one of the same person.
      if (lands && !send.press && keyOf(send.target) !== keyOf(output)) fail(`the server applied a correction for ${keyOf(send.target)} over ${keyOf(output)}`);
      if (lands && !send.press && output && send.target.revision < output.revision) fail(`the server applied revision ${send.target.revision} over ${output.revision}`);
      if (lands) {
        applied = send.index;
        output = send.target;
        // The log a reopened page reads: what this page's send wrote there.
        if (send.target) rows.push({ graphic: 'Card', msg: { t: 'update', oid: `page-${send.index}`, snd: { i: 'me', at: 0 }, data: send.target.values } });
        if (send.press) trueMarker = send.target ? send.target.cueId : 'plain';
      }
      return lands ? 'landed' : fate ? 'skipped' : 'failed';
    };
    const check = (where) => {
      const layer = part.get().Card;
      const view = air.airedOf(part.get(), 'Card');
      // What the layer records as on air is what it was told landed last, or (a reload the marker
      // decided) what the output truly shows: never a guess.
      // From a reload until the next landed answer the revision may lag (the follow sends the
      // newest again; the drain checks it): the entity may not.
      const same = (x, y) => keyOf(x) === keyOf(y) && (reloaded || (x?.revision ?? null) === (y?.revision ?? null));
      // A Take on another screen not heard yet: nothing here can know it.
      if (unheard) return;
      if (layer && !layer.unknown && layer.onAir && !same(layer.onAir, told) && !same(layer.onAir, output) && !before.some((b) => same(layer.onAir, b))) fail(`${where}: I1 on air ${keyOf(layer.onAir)} r${layer.onAir.revision}, told ${keyOf(told)} r${told?.revision}, output ${keyOf(output)} r${output?.revision}`);
      // A restored layer that is still settling decides and sends nothing, so it may still show what
      // aired before another screen took the card, until it settles.
      const settlingOver = layer?.settling !== undefined && trueMarker === 'other';
      // A blocked layer says it does not know what airs, and sends nothing on its own.
      if (layer && !layer.unknown && !layer.blocked && !settlingOver && layer.out.length === 0 && view && keyOf(view) !== keyOf(output)) fail(`${where}: I5 shows ${keyOf(view)}, output ${keyOf(output)}`);
      // What Snap and events may send for the marker's cue is exactly what airs, or nothing.
      const offered = marker ? air.airedValues(part.get(), 'Card', marker) : null;
      if (offered && (!output || JSON.stringify(offered) !== JSON.stringify(output.values))) fail(`${where}: Snap would send ${JSON.stringify(offered)} while ${keyOf(output)} ${JSON.stringify(output?.values)} airs`);
      // A candidate this page put on air, on the cue the marker names, is never forgotten.
      // While a candidate airs, Snap, events and ± leave its fields alone, whatever the marker
      // names: else a plain cue's own values would go onto that candidate's card.
      if (output && !unheard && air.protectedFields(part.get(), 'Card', marker).length === 0) fail(`${where}: ${keyOf(output)} airs and none of its fields is protected (marker ${marker})`);
      if (output && marker === output.cueId && !layer) fail(`${where}: the layer is gone while ${keyOf(output)} airs on the marker's cue`);
    };
    const followOnce = (t, lossy = false, ordered = true) => {
      air.followAired(io(), {
        liveCue: marker === undefined ? {} : { Card: marker },
        seeded,
        facts: { ...factsOf(t, lossy), ordered },
        send: (graphic, values) => {
          if (!ordered) fail('a correction was sent on its own on a page without per-graphic order');
          const layer = part.get().Card;
          if (layer.out.some((s) => s.press)) fail('I4 a correction while a press is out');
          if (!unheard && keyOf(air.airedOf(part.get(), 'Card')) !== keyOf(output)) fail(`I4 correction for ${keyOf(air.airedOf(part.get(), 'Card'))} while output shows ${keyOf(output)}`);
          seen.correction += 1;
          return new Promise((resolve) => {
            const target = { ...air.airedOf(part.get(), 'Card'), values };
            out.push({ index: ++index, base: known, press: false, target, answer: (fate) => resolve(fate === 'landed' ? ANSWERED : fate === 'skipped' ? SKIPPED : fate === 'stale' ? { ok: false, stale: true } : fate === 'uncertain' ? { ok: false, uncertain: true } : { ok: false }) });
          });
        },
      });
      // The send above saw the layer before its correction was recorded: fix the target's revision.
      const layer = part.get().Card;
      const last = out[out.length - 1];
      if (layer && last && !last.press && last.target && layer.out.length && !layer.out[layer.out.length - 1].press) {
        last.target = { ...last.target, revision: layer.out[layer.out.length - 1].target.revision };
        last.seq ??= layer.out[layer.out.length - 1].seq;
      }
    };
    const answerOne = async (i, fate) => {
      const [send] = out.splice(i, 1);
      // The layer still waits on this answer (not folded into what it does not know).
      const waited = (part.get().Card?.out ?? []).some((s) => s.seq === send.seq);
      // No answer in time: the send is still on its way, and may commit later or never.
      if (fate === 'uncertain') flying.push({ send, fate: rnd() < 0.5, at: clock + Math.floor(rnd() * 5500) });
      const told_ = fate === 'uncertain' ? 'uncertain' : serve(send, fate);
      const lands = told_ === 'landed';
      log.push(`answer #${send.index} ${send.press ? 'press' : 'correction'} ${keyOf(send.target)} ${told_}`);
      seen[told_] += 1;
      if (told_ === 'stale') {
        known = head;
        // As the page's one sender does for a refusal on any road (graphicVerbs.ts sendWith).
        air.staleSelection(io(), ['Card']);
      }
      // What the layer records may trail what airs until the next landed answer.
      if (told_ === 'uncertain') reloaded = true;
      if (lands && send.index > toldIndex) {
        if (waited) reloaded = false;
        toldIndex = send.index;
        told = send.target;
        if (send.press) {
          marker = send.target ? send.target.cueId : 'plain';
        }
      }
      if (send.press) {
        if (lands) send.closure.landed();
        else send.closure.undo(told_ === 'uncertain' ? { uncertain: true } : told_ === 'stale' ? { stale: true } : undefined);
      } else send.answer(told_);
      await settle();
    };
    // Sends of a page that went away, still on their way to the server.
    const flying = [];
    const land = () => {
      const was = marker;
      for (const f of flying.splice(0).sort((a, b) => a.send.index - b.send.index)) {
        if (f.at > clock) {
          flying.push(f);
          continue;
        }
        serve(f.send, f.fate);
        log.push(`#${f.send.index} of the page that went away reached the server (${keyOf(output)})`);
        // The page hears what the server airs from its frames: the marker follows.
        marker = trueMarker;
        if (unheard && theirs) air.foreignSelection(io(), [{ graphic: 'Card', msg: theirs }], () => false);
        known = head;
        unheard = false;
      }
      // Each arrived before this moment: the page follows the marker they leave.
      if (marker !== was) followOnce(tree);
    };
    for (let step = 0; step < steps; step++) {
      // Mostly a moment; sometimes seconds, and sometimes past a restored layer's settling.
      const pause = rnd();
      clock += pause < 0.12 ? air.SETTLE_MS + 1 : pause < 0.3 ? 1500 + Math.floor(rnd() * 4000) : 100;
      land();
      if (unheard && rnd() < 0.3) hear();
      const r = rnd();
      if (r < 0.28) {
        const [cueId, sel] = pick(PICKS);
        const t = sel ? air.selectionTake({ selection: sel }, 'Card', factsOf(tree)) : { status: 'none' };
        if (t.status === 'refused') continue;
        const target = t.status === 'ok' ? { cueId, scope: t.scope, entity: t.entity, revision: t.revision, values: t.values } : null;
        log.push(`press ${cueId} ${keyOf(target)} r${target?.revision ?? '-'}`);
        seen.press += 1;
        if (!target) seen.plain += 1;
        const before = part.get().Card;
        const closure = air.pressSelection(io(), 'Card', cueId, t, true);
        // On the fast road this page moves its own marker when it sends (airState.ts
        // claimAndApply), whatever the server later does with the press.
        if (rnd() < 0.5) marker = target ? cueId : 'plain';
        const layer = part.get().Card;
        if (layer !== before) out.push({ index: ++index, seq: layer?.out[layer.out.length - 1]?.seq, base: known, press: true, target, closure });
        else if (!layer && target === null) {
          // A cue without a selection onto a layer with none: the server still applies it.
          out.push({ index: ++index, base: known, press: true, target, closure });
        }
      } else if (r < 0.58 && out.length > 0) {
        const f = rnd();
        await answerOne(Math.floor(rnd() * out.length), f < 0.5 ? true : f < 0.85 ? false : 'uncertain');
      } else if (r < 0.78) {
        rev += 1;
        tree = treeAt(rnd, rev);
        trees.push(tree);
        const lossy = rnd() < 0.1;
        const ordered = rnd() >= 0.08;
        log.push(`read r${rev}${lossy ? ' (a field missing)' : ''}${ordered ? '' : ' (on protocol 1)'}`);
        followOnce(tree, lossy, ordered);
      } else if (r < 0.9) {
        const old = pick(trees);
        log.push('read an older tree');
        followOnce(old);
      } else if (r < 0.93) {
        // Another screen takes a card without a selection, or Updates the card on air to another
        // person under the same cue: nothing of this page's that was sent before it heard may
        // land, and nothing of this candidate's may go over that card.
        before.push(output);
        if (output && rnd() < 0.5) {
          output = { ...output, entity: '["D9",9]', values: { f0: 'Someone Else', f1: '1', f2: '-' } };
          theirs = { t: 'update', oid: `theirs-${head}`, snd: { i: 'them', at: clock }, data: { f0: 'Someone Else' } };
          rows.push({ graphic: 'Card', msg: theirs });
          head += 1;
          unheard = true;
          seen.otherUpdate += 1;
          log.push('another screen updated the card to another person');
          continue;
        }
        theirs = { t: 'cue', oid: `theirs-${head}`, snd: { i: 'them', at: clock } };
        output = null;
        trueMarker = 'other';
        head += 1;
        unheard = true;
        seen.other += 1;
        log.push('another screen took a plain card');
      } else {
        // A reload: the server settles each send still out now, or a little later (it was still on
        // its way); the page never hears either answer.
        for (const send of out.splice(0).sort((a, b) => a.index - b.index)) {
          const fate = rnd() < 0.6;
          if (rnd() < 0.5) serve(send, fate);
          else flying.push({ send, fate, at: clock + Math.floor(rnd() * 5500) });
        }
        log.push(`reload (output ${keyOf(output)}, marker ${trueMarker})`);
        seen.reload += 1;
        page.alive = false;
        page = { alive: true };
        known = head;
        unheard = false;
        part.set(air.readSelectionAir(air.writeSelectionAir(part.get()), clock));
        // The reopened page reads the log at boot (sessionWire.ts); a command another screen sent
        // while it was closed is never heard otherwise.
        air.foreignHistory(io(), rows, () => false);
        marker = trueMarker;
        seeded = true;
        reloaded = true;
        // The page was told nothing after the reload: I1 holds only to what truly airs.
        told = null;
        toldIndex = applied;
        followOnce(tree);
      }
      seeded = seeded || marker !== undefined;
      const now = part.get().Card;
      if (now?.unknown) seen.unknown += 1;
      if (wasUnknown && now && !now.unknown) seen.decided += 1;
      wasUnknown = !!now?.unknown;
      const v = air.airedOf(part.get(), 'Card');
      if (v?.held) seen.held += 1;
      if (v?.held?.unsent) seen.unsent += 1;
      if (now?.blocked) seen.blocked += 1;
      check(`step ${step}`);
    }
    // Drain: what was on its way arrives, the page settles, every answer comes in, then the tree is
    // read again until nothing more goes out.
    clock += air.SETTLE_MS + 1;
    land();
    hear();
    for (let round = 0; round < 6; round++) {
      while (out.length > 0) await answerOne(0, true);
      followOnce(tree);
      check(`drain ${round}`);
    }
    const layer = part.get().Card;
    const view = air.airedOf(part.get(), 'Card');
    if (layer && layer.out.length > 0) fail('sends still out after every answer');
    if (view?.pending) fail('a press still out after every answer');
    // A blocked layer holds, says so, and waits for the operator: nothing to compare.
    if (layer && !layer.unknown && !layer.blocked && view) {
      const t = air.selectionTake({ selection: view.selection }, 'Card', factsOf(tree));
      if (t.status === 'ok' && t.entity === view.entity && !view.held && view.revision !== t.revision) fail(`not following: shows r${view.revision}, tree r${t.revision}`);
      if (t.status !== 'ok' && !view.held) fail('the tree does not resolve what airs, and nothing holds');
      // Holding after a reload that lost a correction's answer, the layer names the last revision
      // it knows landed; the person is the output's all the same.
      if (keyOf(view) !== keyOf(output) || (!view.held && view.revision !== output?.revision)) fail(`after the drain shows ${keyOf(view)} r${view.revision}, output ${keyOf(output)} r${output?.revision}`);
    }
  }

  test('4000 seeded walks of 20 events hold I1, I4 and I5 at every step and end settled', async () => {
    for (let seed = 1; seed <= 4000; seed++) await walk(seed, 20);
    // Every kind of event and every state was reached, many times over: the walks are not vacuous.
    for (const [kind, n] of Object.entries(seen)) assert.ok(n >= 50, `${kind} reached ${n} times`);
  });
});
