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
const person = (district, num, name, votes, extra = {}) => ({ district, number: num, name, votes, ...extra });
const collection = (revision, items, extra = {}) => ({ schemaRevision: 3, revision, items, ...extra });
const tree = (c) => ({ external: { e1: { candidates: c } } });
const selectionOf = (district, num) => ({ v: 1, recipe: 'cands', key: [district, num] });
const facts = (c, more = {}) => ({ collections: [RECIPE], bindings: {}, tree: tree(c), fieldsOf: (g) => (g === 'Card' ? FIELDS : null), ...more });
const take = (sel, c, more) => air.selectionTake({ selection: sel }, 'Card', facts(c, more));
const resolve = (key, c, recipe = RECIPE, fields = FIELDS) => mapping.resolveSelection({ recipe, tree: tree(c), key, fields });

const BASE = [person('D1', 7, 'Aino Aalto', 1200, { party: 'Green' }), person('D2', 7, 'Bertta Berg', 900, { party: 'Blue' }), person('D1', 8, 'Cecilia Cole', 800)];

describe('identity is district plus candidate', () => {
  test('two cues of one card select different people, including one number in two districts', () => {
    const a = take(selectionOf('D1', 7), collection(1, BASE));
    const b = take(selectionOf('D2', 7), collection(1, BASE));
    assert.deepEqual(a, { status: 'ok', selection: selectionOf('D1', 7), entity: '["D1",7]', revision: 1, values: { f0: 'Aino Aalto', f1: '1200', f2: 'Green' } });
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

describe('the aired instance', () => {
  const live = { Card: 'cue-a' };
  const captured = (c = collection(5, BASE), sel = selectionOf('D1', 7)) => {
    const t = take(sel, c);
    assert.equal(t.status, 'ok');
    const pending = air.captureSelection({}, 'Card', 'cue-a', t, 1000);
    return air.landedSelection(pending, 'Card', pending.Card);
  };
  const follow = (state, c, now = 2000, liveCue = live) => air.followSelection(state, liveCue, facts(c), now);

  test('a count increase and a newer downward correction each go out once, whole', () => {
    let state = captured();
    const up = follow(state, collection(6, [person('D1', 7, 'Aino Aalto', 1500, { party: 'Green' }), ...BASE.slice(1)]));
    assert.deepEqual(up.sends.map(({ graphic, values }) => ({ graphic, values })), [{ graphic: 'Card', values: { f0: 'Aino Aalto', f1: '1500', f2: 'Green' } }]);
    assert.equal(up.sends[0].advanced, up.air.Card);
    state = up.air;
    const down = follow(state, collection(7, [person('D1', 7, 'Aino Aalto', 1400, { party: 'Green' }), ...BASE.slice(1)]), 3000);
    assert.deepEqual(down.sends.map((s) => s.values.f1), ['1400']);
    assert.deepEqual([down.air.Card.revision, down.air.Card.at], [7, 3000]);
  });

  test('older and duplicate revisions, read out of order, are rejected', () => {
    let state = follow(captured(), collection(7, [person('D1', 7, 'Aino Aalto', 1400)])).air;
    for (const old of [collection(6, [person('D1', 7, 'Aino Aalto', 1500)]), collection(7, [person('D1', 7, 'Aino Aalto', 9999)]), collection(5, BASE)]) {
      const r = follow(state, old);
      assert.deepEqual(r.sends, []);
      assert.equal(r.air, state);
      state = r.air;
    }
    assert.equal(state.Card.values.f1, '1400');
  });

  test('it follows the selector captured at Take, never the cue as it is now (preview B, reload)', () => {
    const state = captured();
    // The instance carries its own selector, so a preview of B, a draft or a changed record cannot
    // reach it: follow is handed no cue at all.
    const r = follow(air.readSelectionAir(air.writeSelectionAir(state)), collection(6, BASE.map((p) => ({ ...p, votes: p.votes + 1 }))));
    assert.deepEqual(r.sends.map(({ graphic, values }) => ({ graphic, values })), [{ graphic: 'Card', values: { f0: 'Aino Aalto', f1: '1201', f2: 'Green' } }]);
    const b = take(selectionOf('D2', 7), collection(6, BASE));
    assert.equal(b.status, 'ok', 'B is ready on its own');
    assert.deepEqual(r.air.Card.selection, selectionOf('D1', 7));
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
      assert.deepEqual(r.air.Card.held, { reason, since: 4000, revision });
      assert.deepEqual([r.air.Card.values, r.air.Card.revision, r.air.Card.at], [state.Card.values, 5, 1000]);
      const again = follow(r.air, c, 9000);
      assert.equal(again.air, r.air, 'a hold keeps its first time');
    }
    const first = follow(state, collection(6, []), 4000).air;
    assert.deepEqual(follow(first, '{broken', 9000).air.Card.held, { reason: 'the collection is not JSON', since: 4000, revision: null }, 'another reason, the same hold: its age runs from the first');
  });

  test('a hold ends with a newer revision that holds A again, or the aired one read well', () => {
    const held = follow(captured(), collection(6, []), 4000).air;
    const back = follow(held, collection(8, BASE), 5000);
    assert.equal(back.sends.length, 1);
    assert.equal(back.air.Card.held, undefined);
    const malformed = follow(captured(), '{broken', 4000).air;
    const same = follow(malformed, collection(5, BASE), 5000);
    assert.deepEqual([same.sends, same.air.Card.held], [[], undefined]);
  });

  test('an older revision cannot undo a hold a newer one set: it neither sends nor clears the warning', () => {
    const held = follow(captured(), collection(9, BASE.slice(1)), 4000).air;
    assert.equal(held.Card.held.revision, 9);
    const late = follow(held, collection(8, BASE), 5000);
    assert.deepEqual(late.sends, []);
    assert.equal(late.air, held, 'revision 8 is older than what said Aino is gone');
    assert.equal(follow(held, collection(5, BASE), 5000).air, held, 'nor the aired revision read again');
    const blind = follow(held, undefined, 5100).air;
    assert.equal(blind.Card.held.revision, null, 'the collection went missing');
    assert.deepEqual(follow(blind, collection(8, BASE), 5200).sends, [], 'a read with no revision does not lower the bound revision 9 set');
    const newer = follow(held, collection(10, BASE), 6000);
    assert.equal(newer.sends.length, 1);
    assert.equal(newer.air.Card.held, undefined);
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

  test('the instance goes when the layer airs another cue, or is off air once the page knows', () => {
    const state = captured();
    assert.deepEqual(air.reconcileSelection(state, { Card: 'cue-b' }, false), {});
    assert.equal(air.reconcileSelection(state, {}, false), state, 'not yet seeded: a restored instance waits');
    assert.deepEqual(air.reconcileSelection(state, {}, true), {});
    assert.equal(air.reconcileSelection(state, live, true), state);
    assert.deepEqual(air.dropSelection(state, 'Card'), {});
  });

  test('a capture is pending until its send is answered: neither forgotten nor followed before', () => {
    const t = take(selectionOf('D1', 7), collection(5, BASE));
    const pending = air.captureSelection({}, 'Card', 'cue-a', t, 1000);
    assert.equal(pending.Card.pending, true);
    assert.equal(air.reconcileSelection(pending, { Card: 'cue-old' }, true), pending, 'the marker has not moved yet');
    assert.equal(air.reconcileSelection(pending, {}, true), pending);
    assert.deepEqual(follow(pending, collection(6, BASE)).sends, []);
    const landed = air.landedSelection(pending, 'Card', pending.Card);
    assert.equal(landed.Card.pending, undefined);
    assert.equal(air.landedSelection(landed, 'Card', pending.Card), landed, 'only the instance that press wrote');
    assert.equal(air.readSelectionAir(air.writeSelectionAir(pending)).Card.pending, undefined, 'a reload judges it by the marker');
  });

  test('a failed send gives back only its own layer, and only while nothing else wrote it', () => {
    const a = captured();
    const other = { ...a, Bug: { ...a.Card, cueId: 'cue-bug' } };
    const t = take(selectionOf('D2', 7), collection(5, BASE));
    const written = air.captureSelection(other, 'Card', 'cue-b', t, 2000);
    assert.deepEqual(air.undoSelection(written, 'Card', written.Card, a.Card), other);
    const moved = { ...written, Card: { ...written.Card, revision: 9 } };
    assert.equal(air.undoSelection(moved, 'Card', written.Card, a.Card), moved, 'a later write stands');
    assert.deepEqual(air.undoSelection(air.captureSelection({}, 'Card', 'cue-b', t, 2000), 'Card', air.captureSelection({}, 'Card', 'cue-b', t, 2000).Card, undefined), air.captureSelection({}, 'Card', 'cue-b', t, 2000), 'not the same instance: stands');
  });

  test('a correction whose send failed keeps the aired revision, held, so the next read sends it again', () => {
    const state = captured();
    const sent = follow(state, collection(6, people6()));
    const [send] = sent.sends;
    const unsent = air.settleSelection(sent.air, 'Card', send.advanced, false, 3000);
    assert.deepEqual([unsent.Card.revision, unsent.Card.values, unsent.Card.held], [5, state.Card.values, { reason: 'the correction to revision 6 was not sent', since: 3000, revision: null, unsent: true }]);
    assert.equal(follow(unsent, collection(5, BASE), 3500).air, unsent, 'the aired revision read again does not end a "not sent" hold');
    const retry = follow(unsent, collection(6, people6()), 4000);
    assert.deepEqual(retry.sends.map((s) => s.values.f1), ['1500']);
    assert.equal(retry.air.Card.held, undefined);
  });

  test('a correction whose send failed is rolled back even when a hold changed the instance meanwhile, and is sent again', () => {
    const state = captured();
    const sent = follow(state, collection(6, people6()));
    const [send] = sent.sends;
    const heldMeanwhile = follow(sent.air, '{broken', 2500).air;
    assert.notEqual(heldMeanwhile.Card, send.advanced, 'the hold replaced the object');
    const rolled = air.settleSelection(heldMeanwhile, 'Card', send.advanced, false, 3000);
    assert.deepEqual([rolled.Card.revision, rolled.Card.values, rolled.Card.held.revision], [5, state.Card.values, null]);
    const again = follow(rolled, collection(6, people6()), 4000);
    assert.deepEqual(again.sends.map((s) => s.values.f1), ['1500'], 'revision 6 goes out again once it reads well');
    const pressed = air.captureSelection(sent.air, 'Card', 'cue-b', take(selectionOf('D2', 7), collection(6, BASE)), 2600);
    assert.equal(air.settleSelection(pressed, 'Card', send.advanced, false, 3000), pressed, 'a later press stands');
  });

  test('a correction that fails after a newer revision held the card keeps that bound and that hold', () => {
    const six = follow(captured(), collection(6, people6()), 2000);
    const deleted = follow(six.air, collection(9, BASE.slice(1)), 2100).air;
    assert.equal(deleted.Card.held.revision, 9);
    const failed = air.settleSelection(deleted, 'Card', six.sends[0].advanced, false, 2200);
    assert.deepEqual([failed.Card.revision, failed.Card.seen, failed.Card.held.revision], [5, 9, 9], 'back to what landed; the deletion still bounds and holds');
    const late = follow(failed, collection(8, BASE), 2300);
    assert.deepEqual(late.sends, [], 'revision 8 is older than the deletion');
    assert.equal(late.air, failed);
  });

  test('two overlapping corrections: both failing go back to what landed; a later one landing after an earlier failure stands', () => {
    const state = captured();
    const six = follow(state, collection(6, people6()), 2000);
    const seven = follow(six.air, collection(7, [person('D1', 7, 'Aino Aalto', 1700)]), 2100);
    let a = air.settleSelection(seven.air, 'Card', six.sends[0].advanced, false, 2200);
    a = air.settleSelection(a, 'Card', seven.sends[0].advanced, false, 2300);
    assert.deepEqual([a.Card.revision, a.Card.values], [5, state.Card.values], 'revision 5 is what air shows');
    let b = air.settleSelection(seven.air, 'Card', six.sends[0].advanced, false, 2200);
    assert.equal(b, seven.air, 'revision 7 is out and supersedes the failed 6');
    b = air.settleSelection(b, 'Card', seven.sends[0].advanced, true, 2300);
    assert.deepEqual([b.Card.revision, b.Card.values.f1, b.Card.confirmed.revision, b.Card.held], [7, '1700', 7, undefined]);
    const c = air.settleSelection(air.settleSelection(seven.air, 'Card', seven.sends[0].advanced, true, 2300), 'Card', six.sends[0].advanced, false, 2400);
    assert.deepEqual([c.Card.revision, c.Card.held], [7, undefined], 'an older failure after a newer landing changes nothing');
  });

  test('what is kept reads back; anything else is no instance', () => {
    const state = captured();
    assert.deepEqual(air.readSelectionAir(air.writeSelectionAir(state)), state);
    for (const raw of [null, '', '{', 'null', '7', JSON.stringify({ v: 2, graphics: state }), JSON.stringify({ v: 1, graphics: { Card: { ...state.Card, revision: 'x' } } })]) {
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

describe('the page\'s two doors onto the instances', () => {
  const io = (initial = {}) => {
    const part = storePart(initial);
    const kept = [];
    let clock = 1000;
    return { part, kept, keep: (a) => { part.set(a); kept.push(a); }, now: () => clock, tick: (ms) => (clock += ms) };
  };
  const ok = (sel, rev = 5) => take(sel, collection(rev, BASE));

  test('a press captures pending and keeps it; landed ends pending; undo gives back only its own layer', () => {
    const p = io({ Bug: { cueId: 'bug', selection: selectionOf('D1', 8), entity: 'x', revision: 1, values: {}, at: 1 } });
    let followed = 0;
    p.followNow = () => (followed += 1);
    const a = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    assert.equal(p.part.get().Card.pending, true);
    assert.equal(p.kept.length, 1, 'kept in this browser at the press');
    a.landed();
    assert.equal(p.part.get().Card.pending, undefined);
    assert.equal(followed, 1, 'a revision passed over while it was pending is followed at once');
    const b = air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7)));
    p.keep({ ...p.part.get(), Bug: { ...p.part.get().Bug, revision: 2 } });
    b.undo();
    assert.equal(p.part.get().Card.cueId, 'cue-a', 'the layer gets back what it had');
    assert.equal(p.part.get().Bug.revision, 2, 'another layer written meanwhile stands');
    const c = air.pressSelection(p, 'Card', 'cue-c', ok(selectionOf('D1', 8)));
    air.pressSelection(p, 'Card', 'cue-d', ok(selectionOf('D2', 7)));
    c.undo();
    assert.equal(p.part.get().Card.cueId, 'cue-d', 'a later press on the layer stands over an earlier failure');
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const none = air.pressSelection(p, 'Card', 'plain', { status: 'none' });
    assert.equal(p.part.get().Card, undefined, 'a cue without a selection drops what the layer followed');
    none.landed();
    none.undo();
    assert.equal(p.part.get().Card.cueId, 'cue-a');
  });

  test('two overlapping presses: the first answered, the second failed, the layer goes back to the first, settled, and follows again', () => {
    const p = io();
    const first = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    const second = air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 8)));
    first.landed();
    second.undo();
    assert.deepEqual([p.part.get().Card.selection, p.part.get().Card.pending], [selectionOf('D1', 7), undefined]);
    assert.equal(air.followSelection(p.part.get(), { Card: 'cue-a' }, facts(collection(6, people6())), 2000).sends.length, 1, 'it follows the next revision');
    let followed = 0;
    p.followNow = () => (followed += 1);
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 8))).undo();
    assert.equal(followed, 1, 'a failed press follows the newest tree too');
    const r = io();
    air.pressSelection(r, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const settled = r.part.get().Card;
    const u6 = air.pressSelection(r, 'Card', 'cue-a', ok(selectionOf('D1', 8)));
    const u7 = air.pressSelection(r, 'Card', 'cue-a', ok(selectionOf('D2', 7)));
    u6.undo();
    u7.undo();
    assert.equal(r.part.get().Card, settled, 'both Updates failed, the first first: the settled capture is back, not the failed one');
    const q = io();
    const a = air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 7)));
    air.pressSelection(q, 'Card', 'cue-a', ok(selectionOf('D1', 8))).undo();
    assert.equal(q.part.get().Card.pending, true, 'a first press still unanswered stays pending');
    a.landed();
    assert.equal(q.part.get().Card.pending, undefined);
  });

  test('following sends each newer revision through the page, holds one whose send failed, and judges nothing before the tree is readable', async () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const sends = [];
    const send = (graphic, values) => {
      sends.push([graphic, values.f1]);
      return Promise.resolve(sends.length > 1 ? null : { skipped: [], superseded: [], pressedAgain: [] });
    };
    const live = { Card: 'cue-a' };
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6()), { readable: false }), send });
    assert.deepEqual([sends, p.part.get().Card.held], [[], undefined], 'an unread published tree is not judged');
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(undefined, { readable: false }), send });
    assert.equal(p.part.get().Card.held, undefined, 'no false hold before the first read');
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual([sends, p.part.get().Card.revision, p.part.get().Card.held], [[['Card', '1500']], 6, undefined]);
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(7, [person('D1', 7, 'Aino Aalto', 1600)])), send });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual([p.part.get().Card.revision, p.part.get().Card.held?.reason], [6, 'the correction to revision 7 was not sent']);
    const overtaken = io();
    air.pressSelection(overtaken, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    air.followAired(overtaken, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send: () => Promise.resolve({ skipped: ['Card'], superseded: [], pressedAgain: [] }) });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual([overtaken.part.get().Card.revision, overtaken.part.get().Card.confirmed.revision, overtaken.part.get().Card.held?.unsent], [5, 5, true], 'a correction a later press overtook did not land');
    air.followAired(p, { liveCue: {}, seeded: true, facts: facts(collection(7, BASE)), send });
    assert.deepEqual(p.part.get(), {}, 'off air once the page knows: forgotten');
  });

  test('a correction displaced by a Take that then fails is sent again: the layer goes back to what last landed', async () => {
    const p = io();
    air.pressSelection(p, 'Card', 'cue-a', ok(selectionOf('D1', 7))).landed();
    const live = { Card: 'cue-a' };
    let answer;
    const sends = [];
    const send = (graphic, values) => {
      sends.push(values.f1);
      return sends.length === 1 ? new Promise((r) => (answer = r)) : Promise.resolve({ skipped: [], superseded: [], pressedAgain: [] });
    };
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
    assert.equal(p.part.get().Card.revision, 6, 'the correction is out');
    const b = air.pressSelection(p, 'Card', 'cue-b', ok(selectionOf('D2', 7), 6));
    answer(null);
    await new Promise((r) => setImmediate(r));
    b.undo();
    const back = p.part.get().Card;
    assert.deepEqual([back.cueId, back.revision, back.confirmed.revision], ['cue-a', 5, 5], 'neither send landed: revision 5 is what airs');
    air.followAired(p, { liveCue: live, seeded: true, facts: facts(collection(6, people6())), send });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual([sends, p.part.get().Card.revision], [['1500', '1500'], 6], 'and revision 6 goes again');
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
    air.followAired(p, { liveCue: { Card: 'cue-a' }, seeded: true, facts: facts(collection(6, people6())), send: () => Promise.resolve(null) });
    await new Promise((r) => setImmediate(r));
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
