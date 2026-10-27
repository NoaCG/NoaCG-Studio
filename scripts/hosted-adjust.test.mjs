// guards: src/control/hostedAdjust.ts, src/control/cueStaging.ts, src/control/adjustGeometry.ts, src/control/cueAdjust.ts
//
// THE ADJUST BLOCK ON THE HOSTED PAGE AND PHONE (docs/work-specs/playout-adjustments/spec.md,
// phase 3), in Node: the same fold and doors as the production page, with the hosted page's
// authority (a record is staged in the shared buffer and airs only on Take or Update), resolved
// against the box Publish carried; a staged record over an older publish never counts; a staged
// record is never a field value. The browser half is the journey in e2e/production-controls.spec.ts.

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const H = await import('../src/control/hostedAdjust.ts');
const A = await import('../src/control/cueAdjust.ts');
const St = await import('../src/control/cueStyle.ts');
const { hostedCueValues } = await import('../src/control/cueStaging.ts');
const { ADJUST_READ_ONLY } = await import('../src/model/adjust.ts');

const HD = { width: 1920, height: 1080 };
/** lt01's strap, as the production page measured it. */
const BOX = { info: { x: 120, y: 872, w: 410, h: 89 }, paint: { x: 120, y: 872, w: 410, h: 89 }, minText: 26 };
const ctx = St.styleContextFor([]);
const pubOf = (extra = {}) => ({ graphicId: 'g', frame: HD, stage: HD, box: BOX, graphic: { v: 1, anchor: 'bl' }, ...extra });
const cueOf = (id, pub, appearance) => ({ id, graphic: 'Strap', values: {}, label: id, adjust: pub, ...(appearance ? { appearance } : {}) });
/** The buffer after a staged write. */
const apply = (buffer, write) => {
  assert.equal(typeof write, 'object', `refused: ${write}`);
  return { ...buffer, ...write };
};

describe('what a Take carries from the hosted page', () => {
  test('nothing staged: what was published, exactly as before', () => {
    const published = { v: 1, frame: { dx: 5, dy: 0, s: 1, ox: 120, oy: 961 } };
    const cue = cueOf('c1', pubOf(), published);
    assert.deepEqual(H.hostedAppearance(cue, [cue], {}, null, ctx), published);
    const plain = { id: 'p', graphic: 'Other', values: {}, label: 'p' };
    assert.equal(H.hostedAppearance(plain, [plain], {}, null, ctx), undefined, 'a cue nobody adjusted carries nothing');
  });

  test('a staged preset resolves against the published box with the production page\'s fold', () => {
    const pub = pubOf();
    const cue = cueOf('c1', pub);
    const buffer = apply({}, H.stageAdjustWrite(pub, H.hostedRecords(pub, {}, 'c1'), 'c1', 'graphic', { place: 'br' }));
    const sent = H.hostedAppearance(cue, [cue], buffer, null, ctx);
    const expected = A.resolveFrame(A.effectiveAdjust({ v: 1, anchor: 'bl', place: 'br' }, undefined), BOX, HD, HD);
    assert.deepEqual(sent.frame, expected);
    assert.equal(sent.frame.dx, 1920 - 120 - (120 + 410), 'the strap\'s right edge on the right safe inset');
    const state = H.hostedAdjustState(pub, H.hostedRecords(pub, buffer, 'c1'), 'c1', null, false, ctx);
    assert.equal(state.fresh, true, 'the published box is current here: never "measuring"');
  });

  test('a record staged over an older publish never counts: the production page\'s newer record wins', () => {
    const before = pubOf();
    const buffer = apply({}, H.stageAdjustWrite(before, H.hostedRecords(before, {}, 'c1'), 'c1', 'graphic', { place: 'br' }));
    const republished = pubOf({ graphic: { v: 1, anchor: 'bl', x: 40 } });
    const records = H.hostedRecords(republished, buffer, 'c1');
    assert.equal(records.staged, false);
    assert.deepEqual(records.graphic, republished.graphic);
    // And a buffer value this build cannot read counts as nothing staged.
    assert.equal(H.hostedRecords(before, { [H.stagedAdjustKey(null)]: '{nope' }, 'c1').staged, false);
  });

  test('a staged record is never a field value', () => {
    const pub = pubOf();
    const write = H.stageAdjustWrite(pub, H.hostedRecords(pub, {}, 'c1'), 'c1', 'cue', { x: 3 });
    const graphicWide = H.stageAdjustWrite(pub, H.hostedRecords(pub, {}, 'c1'), 'c1', 'graphic', { y: 2 });
    const cue = { id: 'c1', graphic: 'Strap', values: { f0: 'Ann' }, label: 'c1' };
    const staged = { Strap: { ...write, ...graphicWide, 'c1\u001ff0': 'Bo' } };
    assert.deepEqual(hostedCueValues(cue, staged, {}, [cue]), { f0: 'Bo' });
    assert.ok(Object.keys(write).every(H.isStagedAdjustKey));
  });
});

describe('the doors, as on the production page', () => {
  const pub = pubOf({ graphic: { v: 1, anchor: 'bl', x: 10 } });

  test('a step adds to the fold as it stands and writes at the scope shown', () => {
    let buffer = {};
    for (let i = 0; i < 3; i++) buffer = apply(buffer, H.stageAdjustStep(pub, H.hostedRecords(pub, buffer, 'c1'), 'c1', 'cue', { x: -1 }));
    assert.deepEqual(H.hostedRecords(pub, buffer, 'c1').cue, { v: 1, x: 7 }, 'from the inherited 10');
  });

  test('"Stop this cue\'s exception" reveals the graphic\'s default; promotion is one staged write', () => {
    let buffer = apply({}, H.stageAdjustWrite(pub, H.hostedRecords(pub, {}, 'c1'), 'c1', 'cue', { place: 'br' }));
    const promoted = H.stageAdjustPromote(pub, H.hostedRecords(pub, buffer, 'c1'), 'c1');
    assert.equal(Object.keys(promoted).length, 2, 'both scopes in one stage call');
    const after = H.hostedRecords(pub, apply(buffer, promoted), 'c1');
    assert.deepEqual(after.graphic, { v: 1, anchor: 'bl', x: 10, place: 'br' });
    assert.equal(after.cue, undefined);
    buffer = apply(buffer, H.stageAdjustReset(pub, H.hostedRecords(pub, buffer, 'c1'), 'c1', 'cue'));
    const reset = H.hostedRecords(pub, buffer, 'c1');
    assert.equal(reset.cue, undefined);
    assert.equal(reset.staged, true, 'a reset is staged: the next Take sends the default');
    const cue = cueOf('c1', pub);
    assert.equal(H.hostedAppearance(cue, [cue], buffer, null, ctx).frame.dx, 10);
  });

  test('a later version\'s record is refused at every door', () => {
    const later = pubOf({ graphic: { v: 2, place: 'tr' } });
    const records = H.hostedRecords(later, {}, 'c1');
    assert.equal(H.stageAdjustWrite(later, records, 'c1', 'graphic', { x: 1 }), ADJUST_READ_ONLY);
    assert.equal(H.stageAdjustReset(later, records, 'c1', 'graphic'), ADJUST_READ_ONLY);
    assert.equal(H.stageAdjustPromote(later, records, 'c1'), ADJUST_READ_ONLY);
  });

  test('the production look Publish carried applies under both scopes, and "As designed" staged here keeps it out', () => {
    const look = { vars: { accent: '#ff7a00' }, font: { fontId: 'archivo' } };
    const withLook = pubOf({ look, graphic: undefined });
    const state = H.hostedAdjustState(withLook, H.hostedRecords(withLook, {}, 'c1'), 'c1', null, false, ctx);
    assert.equal(state.style.vars.accent, '#ff7a00');
    assert.match(state.style.vars['font-heading'], /Archivo/);
    const reach = { family: true, weight: true, colours: ['accent'] };
    const buffer = apply({}, H.stageAdjustWrite(withLook, H.hostedRecords(withLook, {}, 'c1'), 'c1', 'cue', St.asDesignedPatch('colour', 'cue', undefined, reach)));
    const kept = H.hostedAdjustState(withLook, H.hostedRecords(withLook, buffer, 'c1'), 'c1', null, false, ctx);
    assert.equal(kept.style, null);
  });

  test('Publish carries records for every cue of an adjusted graphic, and nothing for one nobody adjusted', () => {
    const cues = [{ sourceId: 'g', adjust: { v: 1, x: 2 } }, { sourceId: 'g' }, { sourceId: 'other' }];
    assert.equal(H.carriesAdjust({ id: 'g' }, cues, undefined), true, 'a sibling\'s record is enough');
    assert.equal(H.carriesAdjust({ id: 'other' }, cues, undefined), false);
    assert.equal(H.carriesAdjust({ id: 'other' }, cues, { vars: { accent: '#f00' } }), true, 'the look reaches it');
    assert.equal(H.carriesAdjust({ id: 'other', adjust: { v: 1 } }, cues, undefined), true);
    assert.deepEqual(H.publishedAdjustOf({ id: 'g' }, {}, undefined, null, HD, HD), { graphicId: 'g', frame: HD, stage: HD });
  });

  test('a sibling\'s exception staged here makes a Take of a plain cue send the identity, and one reset there stops it', () => {
    const plain = pubOf({ graphic: undefined });
    const a = cueOf('a', plain);
    const b = cueOf('b', plain);
    assert.equal(H.hostedAppearance(b, [a, b], {}, null, ctx), undefined, 'nobody adjusted: nothing');
    let buffer = apply({}, H.stageAdjustWrite(plain, H.hostedRecords(plain, {}, 'a'), 'a', 'cue', { y: -5 }));
    // b stages nothing of its own, so it airs what was published; a's exception counts for it only
    // once b has something staged too.
    buffer = apply(buffer, H.stageAdjustReset(plain, H.hostedRecords(plain, buffer, 'b'), 'b', 'cue'));
    assert.equal(H.adjustedElsewhere(b, [a, b], buffer), true);
    assert.deepEqual(H.hostedAppearance(b, [a, b], buffer, null, ctx), A.IDENTITY, 'the identity, so a\'s place is not left on air');
    buffer = apply(buffer, H.stageAdjustReset(plain, H.hostedRecords(plain, buffer, 'a'), 'a', 'cue'));
    assert.equal(H.adjustedElsewhere(b, [a, b], buffer), false);
  });
});

test('a hostile staged value is read in one pass and counts as nothing staged', () => {
  const pub = pubOf();
  const deep = '['.repeat(200_000) + ']'.repeat(200_000);
  const long = JSON.stringify({ on: pub.graphic, r: { v: 1, place: 'x'.repeat(1_000_000) } });
  const started = performance.now();
  for (const value of [deep, long, '{'.repeat(500_000), 'x'.repeat(2_000_000)]) {
    const records = H.hostedRecords(pub, { [H.stagedAdjustKey(null)]: value }, 'c1');
    const state = H.hostedAdjustState(pub, records, 'c1', null, false, ctx);
    assert.equal(state.eff.place, undefined, 'nothing it cannot read airs');
  }
  assert.ok(performance.now() - started < 5_000, 'linear in the input, never stuck on it');
});

