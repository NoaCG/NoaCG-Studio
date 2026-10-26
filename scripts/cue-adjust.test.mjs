// guards: src/model/adjust.ts, src/control/cueAdjust.ts, src/control/adjustGeometry.ts, src/model/teamShowMerge.ts, src/model/cueClipboard.ts, src/model/rundownHistory.ts, src/control/cueItems.ts, src/control/airState.ts, src/model/shows.ts
//
// PLACE AND SIZE FROM RECORD TO AIR (docs/work-specs/playout-adjustments/spec.md, phase 1), in Node:
// the record and its one reader, the fold of a cue over its graphic member by member (AC-4), the
// presets, nudges and pivot in production px (AC-1, AC-2), the readability estimate (AC-3), the
// wire's four rules (AC-8, AC-9, AC-10), the doors and the lifecycle (AC-4), and both merge probes.
// The browser halves are e2e/playout-adjust.spec.ts (the measurement and the stage's frame) and the
// journey in e2e/production-controls.spec.ts.

import test, { after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import './lib/tsResolve.mjs';

const adjust = await import('../src/model/adjust.ts');
const A = await import('../src/control/cueAdjust.ts');
const G = await import('../src/control/adjustGeometry.ts');
const { mergeTeamShow } = await import('../src/model/teamShowMerge.ts');
const { copyClip, pasteCopies } = await import('../src/model/cueClipboard.ts');
const { liveRundownRefusal } = await import('../src/model/rundownHistory.ts');
const { takeCueItems } = await import('../src/control/cueItems.ts');
const { rememberAired, restoreItems, seedFromResolve } = await import('../src/control/airState.ts');
const { NO_AIR } = await import('../src/control/playoutSession.ts');
const { storePart } = await import('../src/control/storePart.ts');

const HD = { width: 1920, height: 1080 };
const eff = (g, c) => A.effectiveAdjust(g, c);
/** lt01 as the receipt measured it: a strap at left 120, bottom 961, 410 px wide. */
const LT = { x: 120, y: 872, w: 410, h: 89 };
const strap = (box = LT, minText = 30) => ({ info: box, paint: box, minText });
const composed = (box, frame) => A.composeRect(box, frame);
const right = (r) => r.x + r.w;
const bottom = (r) => r.y + r.h;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1, `${msg}: ${a} vs ${b}`);

describe('the record and its reader', () => {
  test('absent, this version, and a later one kept read-only', () => {
    assert.deepEqual(adjust.readAdjust(undefined), { status: 'none' });
    assert.deepEqual(adjust.readAdjust({ v: 1, place: 'br', x: -12, scale: 0.95, anchor: 'bl', later: 1 }), {
      status: 'ok',
      record: { v: 1, place: 'br', x: -12, scale: 0.95, anchor: 'bl' },
    });
    assert.deepEqual(adjust.readAdjust({ v: 2, place: 'br' }), { status: 'read-only' });
    assert.deepEqual(adjust.readAdjust({ v: 1, place: 'nowhere', x: 'a', scale: -1 }).record, { v: 1 }, 'bad members are not read');
    assert.equal(adjust.readAdjust({ v: 1, scale: 99 }).record.scale, 4, 'the size stops at 400 %');
    assert.equal(adjust.readAdjust({ v: 1, scale: 0.01 }).record.scale, 0.25, 'and at 25 %');
  });

  test('a patch writes over the record, keeps members it does not know, and a null removes one', () => {
    assert.deepEqual(adjust.patchAdjust({ v: 1, place: 'bl', vars: { accent: '#f00' } }, { x: 4, place: null }), { v: 1, x: 4, vars: { accent: '#f00' } });
    assert.equal(adjust.patchAdjust({ v: 1, x: 4 }, { x: null }), undefined, 'nothing left at this scope');
    assert.equal(adjust.patchAdjust({ v: 2, x: 4 }, { x: 5 }), adjust.ADJUST_READ_ONLY);
    // x 0 written at a scope is a member: it overrides an inherited x.
    assert.deepEqual(adjust.patchAdjust(undefined, { x: 0 }), { v: 1, x: 0 });
  });
});

describe('AC-4: the fold is member by member, narrowest wins, identity after', () => {
  test('a cue that sets place alone still inherits x; the default\'s place leaves it', () => {
    const graphic = { v: 1, place: 'bl', x: 0 };
    const cue2 = { v: 1, place: 'br' };
    assert.equal(eff(graphic, cue2).place, 'br');
    assert.equal(eff(graphic, cue2).x, 0);
    assert.deepEqual(eff(graphic, cue2).own, ['place']);
    // The default's x moves by 10: cue 1 (no record) and cue 2 (inherits x) both move.
    const moved = { ...graphic, x: 10 };
    assert.equal(eff(moved, undefined).x, 10);
    assert.equal(eff(moved, cue2).x, 10);
    // The default's place changes: cue 2 keeps its own.
    assert.equal(eff({ ...graphic, place: 'tl' }, cue2).place, 'br');
    // Stop the exception: the default is what is left.
    assert.equal(eff(moved, undefined).place, 'bl');
  });

  test('a later version\'s record applies nothing and makes the fold read-only', () => {
    const e = eff({ v: 2, place: 'br' }, undefined);
    assert.equal(e.place, undefined);
    assert.equal(e.readOnly, true);
    assert.equal(e.any, true);
  });
});

describe('AC-1: a lower third moves to the other side and nudges precisely', () => {
  test('bottom-right puts its right edge on the right safe inset; three 1 px and one 10 px nudge move it 13 px', () => {
    const anchored = { v: 1, ...A.withAnchor(eff(undefined, undefined), strap(), HD, { place: 'br' }) };
    assert.equal(anchored.anchor, 'bl', 'the anchor is the authored zone, taken once');
    const placed = A.resolveFrame(eff(anchored, undefined), strap(), HD, HD);
    near(right(composed(LT, placed)), 1920 - 120, 'right edge on the inset');
    near(bottom(composed(LT, placed)), 961, 'bottom stays');
    const nudged = A.resolveFrame(eff({ ...anchored, x: -1 - 1 - 1 - 10 }, undefined), strap(), HD, HD);
    near(right(composed(LT, nudged)), 1800 - 13, 'moved 13 px left');
  });

  test('the presets are the safe area of base.ts zoneDecls: left and right 120, top 86, bottom 119 at 1080p', () => {
    assert.deepEqual(A.presetPoint('tl', HD), { x: 120, y: 86 });
    assert.deepEqual(A.presetPoint('br', HD), { x: 1800, y: 961 });
    assert.deepEqual(A.presetPoint('mc', HD), { x: 960, y: 540 });
    assert.deepEqual(A.presetPoint('br', { width: 3840, height: 2160 }), { x: 3600, y: 1922 }, 'scaled with the stage');
  });

  test('a longer name re-measured keeps the right edge on the inset and the anchor unchanged', () => {
    const record = { v: 1, place: 'br', anchor: 'bl' };
    const longer = { ...LT, w: 520 };
    const frame = A.resolveFrame(eff(record, undefined), strap(longer), HD, HD);
    near(right(composed(longer, frame)), 1800, 'still on the inset');
    // The anchor never follows the box: the record keeps the one written first.
    assert.deepEqual(A.withAnchor(eff(record, undefined), strap(longer), HD, { x: 3 }), { x: 3 });
  });

  test('a nudge never takes a frame off the stage', () => {
    const frame = A.resolveFrame(eff({ v: 1, x: 99999 }, undefined), strap(), HD, HD);
    assert.equal(frame.dx, 1912, 'at most the stage width less 8 px');
  });
});

describe('AC-2: about five percent smaller, with no pivot drift', () => {
  test('lt01 at 95 % keeps its left and bottom edges and shrinks 5 %', () => {
    const frame = A.resolveFrame(eff({ v: 1, scale: 0.95, anchor: 'bl' }, undefined), strap(), HD, HD);
    const out = composed(LT, frame);
    near(out.x, 120, 'left edge');
    near(bottom(out), 961, 'bottom edge');
    near(out.w, LT.w * 0.95, 'width');
  });

  test('a centred board keeps its centre', () => {
    const board = { x: 512, y: 396, w: 895, h: 287 };
    const frame = A.resolveFrame(eff({ v: 1, scale: 0.95 }, undefined), strap(board), HD, HD);
    const out = composed(board, frame);
    near(out.x + out.w / 2, board.x + board.w / 2, 'centre x');
    near(out.y + out.h / 2, board.y + board.h / 2, 'centre y');
  });

  test('every one of the nine anchors is the fixed point of the size', () => {
    for (const zone of adjust.ZONES) {
      const box = { x: 300, y: 200, w: 400, h: 100 };
      const frame = A.resolveFrame(eff({ v: 1, scale: 0.5, anchor: zone }, undefined), strap(box), HD, HD);
      const before = A.pointOf(box, zone);
      const after = A.pointOf(composed(box, frame), zone);
      near(after.x, before.x, `${zone} x`);
      near(after.y, before.y, `${zone} y`);
    }
  });

  test('a 720p and a portrait graphic pivot on their own boxes at the stage origin', () => {
    const p720 = { x: 80, y: 581, w: 273, h: 59 };
    const f720 = A.resolveFrame(eff({ v: 1, scale: 0.95 }, undefined), strap(p720), { width: 1280, height: 720 }, HD);
    near(composed(p720, f720).x, 80, '720p left edge');
    near(bottom(composed(p720, f720)), 640, '720p bottom edge');
    const portrait = { x: 60, y: 1500, w: 900, h: 200 };
    const fp = A.resolveFrame(eff({ v: 1, scale: 0.95 }, undefined), strap(portrait), { width: 1080, height: 1920 }, { width: 1920, height: 1920 });
    near(bottom(composed(portrait, fp)), 1700, 'portrait bottom edge');
  });

  test('lt63 spans the frame: no size, no horizontal preset, a vertical nudge moves it', () => {
    const m = { info: { x: 120, y: 900, w: 1672, h: 60 }, paint: { x: 0, y: 880, w: 1920, h: 100 }, minText: 30 };
    assert.equal(A.geometryLimit(m, HD), 'spans');
    assert.equal(A.resolveFrame(eff({ v: 1, scale: 0.9, place: 'br', x: 40 }, undefined), m, HD, HD), null, 'size, preset and x do nothing');
    const frame = A.resolveFrame(eff({ v: 1, y: -30 }, undefined), m, HD, HD);
    assert.deepEqual([frame.dx, frame.dy, frame.s], [0, -30, 1]);
  });

  test('a ticker with no information box takes no preset; with no measurement the size acts about the frame', () => {
    const ticker = { info: null, paint: { x: 0, y: 1000, w: 1920, h: 60 }, minText: null };
    assert.equal(A.geometryLimit({ ...ticker, paint: { x: 100, y: 1000, w: 600, h: 60 } }, HD), 'no-presets');
    assert.equal(A.geometryLimit(null, HD), 'none');
    const frame = A.resolveFrame(eff({ v: 1, place: 'tr', scale: 0.5 }, undefined), null, HD, HD);
    assert.deepEqual([frame.dx, frame.dy, frame.ox, frame.oy], [0, 0, 960, 540], 'no preset, about the centre');
  });
});

describe('AC-3: the oversized quiz assessed per board', () => {
  test('qz01 at 0.84 is amber, the agent votes board at 0.47 is red with the remedy, qz05 is fine', () => {
    assert.equal(A.floorEstimate(21.9, 0.84, 'quiz').tone, 'amber');
    assert.equal(A.floorEstimate(21.9, 0.84, 'quiz').px, 18.4);
    const votes = A.floorEstimate(26, 0.47, 'quiz');
    assert.deepEqual([votes.tone, votes.px], ['red', 12.2]);
    assert.equal(A.floorEstimate(26, 1, 'quiz').tone, 'ok');
    // Red below 16 px whatever the category; 16 itself is amber under the 20 px floor.
    assert.equal(A.floorEstimate(15.9, 1, 'quiz').tone, 'red');
    assert.equal(A.floorEstimate(16, 1, 'quiz').tone, 'amber');
    assert.equal(A.floorEstimate(19.9, 1, 'quiz').tone, 'amber');
    assert.equal(A.floorEstimate(20, 1, 'quiz').tone, 'ok');
    assert.equal(A.floorEstimate(null, 1, 'quiz'), null);
    // The floor moves with the category's (model/designRules.ts): a corner bug answers to 16.
    assert.equal(A.floorEstimate(17, 1, 'corner-bug').tone, 'ok');
  });
});

describe('the wire: the four rules', () => {
  const look = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
  test('rule 1: an update without an appearance, an event and a stop keep the one applied', () => {
    let looks = A.lookAfter({}, 'L3', { t: 'update', data: {}, appearance: look });
    assert.deepEqual(looks.L3, look);
    for (const msg of [{ t: 'update', data: { f0: 'x' } }, { t: 'event', event: 'goal', payload: { s: '1' } }, { t: 'stop' }, { t: 'play' }]) {
      assert.equal(A.lookAfter(looks, 'L3', msg), looks, msg.t);
    }
  });

  test('rule 3: an appearance replaces the one applied (never multiplies), the identity clears it', () => {
    const other = { v: 1, frame: { dx: 0, dy: 0, s: 0.9, ox: 120, oy: 961 } };
    let looks = A.lookAfter({ L3: look }, 'L3', { t: 'update', data: {}, appearance: other });
    assert.deepEqual(looks.L3, other);
    looks = A.lookAfter(looks, 'L3', { t: 'update', data: {}, appearance: A.IDENTITY });
    assert.equal('L3' in looks, false);
    // A later version's appearance is not understood: what was applied stays (rollback).
    assert.equal(A.lookAfter({ L3: look }, 'L3', { t: 'update', data: {}, appearance: { v: 2, frame: {} } }).L3, look);
  });

  test('rule 2 and AC-10: no record, no field; an emptied record sends the identity; a resolved one itself', () => {
    assert.equal(A.appearanceToSend(null, eff(undefined, undefined), undefined), undefined, 'a never-adjusted graphic sends nothing');
    assert.deepEqual(A.appearanceToSend(null, eff({ v: 1, x: 0 }, undefined), undefined), A.IDENTITY);
    assert.deepEqual(A.appearanceToSend(null, eff(undefined, undefined), look), A.IDENTITY, 'reset with an old one applied');
    assert.deepEqual(A.appearanceToSend(null, eff(undefined, undefined), undefined, true), A.IDENTITY, 'another cue of it has one');
    assert.deepEqual(A.appearanceToSend(look.frame, eff({ v: 1, x: 10 }, undefined), undefined), look);
    // The Take's items are exactly what they were without one.
    assert.deepEqual(takeCueItems({ id: 'c', graphic: 'L3', values: { f0: 'a' } })[0], { graphic: 'L3', msg: { t: 'update', data: { f0: 'a' } } });
    assert.deepEqual(takeCueItems({ id: 'c', graphic: 'L3', values: { f0: 'a' }, appearance: look })[0].msg.appearance, look);
  });

  test('the hosted page applies the published appearance, and an identity only when something holds one', () => {
    const cues = [{ graphic: 'L3' }, { graphic: 'L3', appearance: look }, { graphic: 'Bug' }];
    assert.deepEqual(A.publishedAppearance(cues[1], cues, undefined), look);
    assert.deepEqual(A.publishedAppearance(cues[0], cues, undefined), A.IDENTITY);
    assert.equal(A.publishedAppearance(cues[2], cues, undefined), undefined);
    assert.deepEqual(A.publishedAppearance(cues[2], cues, look), A.IDENTITY);
  });

  test('rule 4: what the page remembers and what rebuilds PROGRAM is what was applied, never preparation', () => {
    let air = { ...NO_AIR, liveCue: { L3: 'c1' } };
    air = rememberAired(air, [{ graphic: 'L3', msg: { t: 'update', data: { f0: 'a' }, appearance: look } }]);
    assert.deepEqual(air.looks.L3, look);
    air = rememberAired(air, [{ graphic: 'L3', msg: { t: 'update', data: { f0: 'b' } } }]);
    assert.deepEqual(air.looks.L3, look, 'a partial update keeps it');
    const { items } = restoreItems(air, {}, { clocks: new Map(), pairs: new Map() });
    assert.deepEqual(items[0].msg.appearance, look);
    // A boot seeds it from the renderer's report, then the rows after it.
    const seeded = seedFromResolve(
      NO_AIR,
      { liveCue: { L3: 'c1' }, live: { L3: { data: { f0: 'a' }, state: { groups: { main: 'in' }, appearance: look }, event: 5 } } },
      [],
      { moves: 0, commands: 0 },
      [{ id: 'c1', values: { f0: 'a' } }],
      { clocks: new Map(), pairs: new Map() },
    );
    assert.deepEqual(seeded.looks.L3, look);
    assert.deepEqual(A.reportedLook({ state: { appearance: look } }), look);
    assert.equal(A.reportedLook({ state: { groups: {} } }), null);
  });
});

test('a re-resolve takes each report as the renderer\'s word: a report with no appearance clears an older one', () => {
  const look = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
  const air = { ...NO_AIR, looks: { L3: look, Bug: look } };
  const seeded = seedFromResolve(
    air,
    { liveCue: { L3: 'c1' }, live: { L3: { data: {}, state: { groups: {} }, event: 5 } } },
    [],
    { moves: 0, commands: 0 },
    [{ id: 'c1', values: {} }],
    { clocks: new Map(), pairs: new Map() },
  );
  assert.equal('L3' in seeded.looks, false, 'reset elsewhere: cleared');
  assert.deepEqual(seeded.looks.Bug, look, 'a graphic with no report keeps what this page aired');
  // And a rebuild after an identity sent here never falls back to the boot report's old look.
  const rebuilt = restoreItems({ ...NO_AIR, liveCue: { L3: 'c1' }, aired: { L3: {} }, looks: {}, reports: { L3: { state: { appearance: look } } } }, {}, { clocks: new Map(), pairs: new Map() });
  assert.equal(rebuilt.items[0].msg.appearance, undefined);
});

test('a command applied while the read was out keeps what this page believes is applied', () => {
  const look = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
  const seeded = seedFromResolve(
    { ...NO_AIR, looks: { L3: look }, commands: 1 },
    { liveCue: { L3: 'c1' }, live: { L3: { data: {}, state: {}, event: 5 } } },
    [],
    { moves: 0, commands: 0 },
    [{ id: 'c1', values: {} }],
    { clocks: new Map(), pairs: new Map() },
  );
  assert.deepEqual(seeded.looks.L3, look, 'the older report does not clear it');
});

describe('measurements: identified and qualified', () => {
  test('one qualify rule for both measurers: agree, ask again, or give up after three', () => {
    const a = { info: { x: 0, y: 0, w: 100, h: 10 }, paint: null, minText: 20 };
    const b = { ...a, info: { ...a.info, x: 30 } };
    assert.deepEqual(A.qualifyStep(null, a, 0), { again: a, tries: 0 });
    assert.deepEqual(A.qualifyStep(a, a, 0), { done: a });
    assert.deepEqual(A.qualifyStep(a, b, 0), { again: b, tries: 1 });
    assert.deepEqual(A.qualifyStep(a, b, 2), { giveUp: true });
    assert.equal(A.QUALIFY_GAP_MS, 250);
  });

  test('a longer name, a new copy or another stage is another identity', () => {
    const id = A.measureId('g', 't1', 'c', { f0: 'Ann' }, HD);
    assert.notEqual(A.measureId('g', 't1', 'c', { f0: 'Annabel' }, HD), id);
    assert.notEqual(A.measureId('g', 't2', 'c', { f0: 'Ann' }, HD), id);
    assert.equal(A.measureId('g', 't1', 'c', { f0: 'Ann' }, HD), id);
  });

  test('two answers keep only what agrees within 1 px', () => {
    const a = { info: { x: 0, y: 0, w: 100, h: 10 }, paint: { x: 0, y: 0, w: 200, h: 20 }, minText: 20 };
    const moving = { info: { x: 40, y: 0, w: 100, h: 10 }, paint: { x: 0, y: 0, w: 200.5, h: 20 }, minText: 20 };
    assert.deepEqual(A.qualify(a, moving), { info: null, paint: moving.paint, minText: 20 });
    const off = (n) => ({ ...a, info: { ...a.info, x: n } });
    assert.notEqual(A.qualify(a, off(1)).info, null, '1 px agrees');
    assert.equal(A.qualify(a, off(1.5)).info, null, '1.5 px does not');
  });

  test('the session keeps the last measurement of a cue while its new identity is measured', () => {
    let part = G.NO_GEOMETRY;
    part = G.measured(part, 'c1', 'g', 'id1', strap());
    assert.deepEqual(G.geometryOf(part, 'c1', 'g', 'id1'), { m: strap(), fresh: true });
    assert.deepEqual(G.geometryOf(part, 'c1', 'g', 'id2'), { m: strap(), fresh: false }, 'stale: the last placement');
    assert.deepEqual(G.geometryOf(part, 'c2', 'g', 'x'), { m: strap(), fresh: false }, 'never measured: its graphic\'s newest');
  });

  test('a change waits while what a Take would send differs from what is applied; nothing waits unadjusted', () => {
    const look = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
    assert.equal(G.placeWaiting({ send: undefined }, undefined), false);
    assert.equal(G.placeWaiting({ send: look }, look), false);
    assert.equal(G.placeWaiting({ send: look }, undefined), true);
    assert.equal(G.placeWaiting({ send: A.IDENTITY }, look), true, 'a reset waits too');
    assert.equal(G.placeWaiting({ send: A.IDENTITY }, undefined), false);
  });

  test('a Take of a placed cue nothing measured yet is measured first, and waits only so long', async () => {
    const part = storePart(G.NO_GEOMETRY);
    const asked = [];
    const answers = new Map();
    const measurer = G.createMeasurer(part, {
      measure: (input) => {
        asked.push(input);
        return new Promise((resolve) => answers.set(input, () => resolve(strap())));
      },
    });
    // Three cues waiting; the first is being measured when the Take of the third arrives.
    measurer.want(['a', 'b', 'c'].map((id) => ({ cueId: id, graphicId: 'g', id: `${id}1`, input: id })));
    let done = false;
    const taking = measurer.now({ cueId: 'c', graphicId: 'g', id: 'c1', input: 'c' }, 1000).then(() => (done = true));
    answers.get('a')();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(asked, ['a', 'c'], 'the Take\'s cue goes before b');
    assert.equal(done, false, 'another cue\'s answer does not release it');
    answers.get('c')();
    await taking;
    assert.equal(part.get().byCue.c.id, 'c1');
    // A document that never answers holds a Take for the cap only.
    const stuck = G.createMeasurer(storePart(G.NO_GEOMETRY), { measure: () => new Promise(() => {}) });
    const t = Date.now();
    await stuck.now({ cueId: 'x', graphicId: 'g', id: 'x1', input: 1 }, 40);
    assert.ok(Date.now() - t < 1000);
  });

  test('Publish waits for the measurer only so long', async () => {
    const part = storePart(G.NO_GEOMETRY);
    const measurer = G.createMeasurer(part, { measure: () => new Promise(() => {}) });
    measurer.want([{ cueId: 'c1', graphicId: 'g', id: 'x', input: 1 }]);
    const t = Date.now();
    await measurer.drain(30);
    assert.ok(Date.now() - t < 1000);
  });

  test('the background measurer drops an answer for an identity no longer wanted', async () => {
    const part = storePart(G.NO_GEOMETRY);
    const answers = [];
    const measurer = G.createMeasurer(part, { measure: (input) => new Promise((resolve) => answers.push(() => resolve(strap({ ...LT, w: input })))) });
    measurer.want([{ cueId: 'c1', graphicId: 'g', id: 'old', input: 100 }]);
    measurer.want([{ cueId: 'c1', graphicId: 'g', id: 'new', input: 200 }]);
    answers.shift()();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(part.get().byCue.c1, undefined, 'the old answer is not kept');
    answers.shift()();
    await measurer.drain(1000);
    assert.equal(part.get().byCue.c1.id, 'new');
    assert.equal(part.get().byCue.c1.m.info.w, 200);
  });
});

describe('the merge never deletes a cue exception (both probes)', () => {
  const AT = '2026-10-25T00:00:00.000Z';
  const doc = (graphicAdjust, cueAdjust, extra = {}) => ({
    id: 's',
    name: 'Show',
    updatedAt: '2026-10-24T00:00:00.000Z',
    graphics: [{ id: 'g', name: 'Strap', layer: 20, ...(graphicAdjust ? { adjust: graphicAdjust } : {}), ...(extra.layer ? { layer: extra.layer } : {}) }],
    cues: [{ id: 'c1', sourceId: 'g', label: extra.label ?? 'One', values: {}, ...(cueAdjust ? { adjust: cueAdjust } : {}) }],
  });
  const exception = { v: 1, place: 'br' };

  test('a promotion against a concurrent pool-layer edit keeps the exception', () => {
    const base = doc(undefined, exception);
    const ours = doc(exception, undefined);
    const theirs = doc(undefined, exception, { layer: 30 });
    const { doc: merged, lost } = mergeTeamShow(base, ours, theirs, AT);
    assert.equal(merged.graphics[0].layer, 30, 'their layer stands');
    assert.deepEqual(merged.cues[0].adjust, exception, 'the exception is kept, not deleted');
    assert.ok(lost.length > 0, 'the loss of the default is named');
  });

  test('a promotion against a concurrent cue-text edit keeps the new default and the old exception', () => {
    const base = doc(undefined, exception);
    const ours = doc(exception, undefined);
    const theirs = doc(undefined, exception, { label: 'Renamed' });
    const { doc: merged } = mergeTeamShow(base, ours, theirs, AT);
    assert.deepEqual(merged.graphics[0].adjust, exception);
    assert.deepEqual(merged.cues[0].adjust, exception, 'kept: it equals the default and one press clears it');
  });

  test('an operator\'s own reset is not undone by a merge', () => {
    const base = doc(undefined, exception);
    const ours = doc(undefined, undefined);
    const theirs = doc(undefined, exception, { layer: 30 });
    assert.equal(mergeTeamShow(base, ours, theirs, AT).doc.cues[0].adjust, undefined);
  });
});

describe('lifecycle: copy and paste, undo of a graphic on air', () => {
  test('copy and paste copies the cue record', () => {
    const record = { id: 's', cues: [{ id: 'a', sourceId: 'g', label: 'A', values: {}, adjust: { v: 1, place: 'br' } }], folders: [], graphics: [{ id: 'g' }] };
    const out = pasteCopies(record, copyClip(record, ['a']), { after: 'a' }, () => 'n1');
    assert.deepEqual(out.cues[1].adjust, { v: 1, place: 'br' });
  });

  test('undoing an adjustment of a graphic on air is allowed; another change of it is not', () => {
    const slice = (adj, layer = 20) => ({ cues: [], folders: [], graphics: [{ id: 'g', name: 'G', layer, ...(adj ? { adjust: adj } : {}) }], playoutItems: [] });
    const live = { cues: new Set(), sources: new Set(['g']), folders: new Set(), unidentifiedServer: false };
    assert.equal(liveRundownRefusal(slice({ v: 1, x: 3 }), slice(undefined), live), null);
    assert.match(liveRundownRefusal(slice(undefined), slice(undefined, 21), live), /off air/);
  });
});

// ── The doors on the record (model/shows.ts), bundled for Node as legacy-sheet-block.test.mjs does ──
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(tmpdir(), 'cue-adjust-'));
after(() => rmSync(dir, { recursive: true, force: true }));

async function loadShowsModule() {
  const bundle = await rolldown({ input: path.join(root, 'src/model/shows.ts'), platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, 'shows.mjs');
  writeFileSync(file, output[0].code);
  return import(pathToFileURL(file).href);
}

test('the doors: graphic default, cue exception, promotion in one write, reset, and a later version refused at each', async () => {
  const stored = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => stored.get(k) ?? null,
    setItem: (k, v) => stored.set(k, String(v)),
    removeItem: (k) => stored.delete(k),
    key: (i) => [...stored.keys()][i] ?? null,
    get length() {
      return stored.size;
    },
  };
  try {
    const shows = await loadShowsModule();
    const template = { name: 'Strap', type: 'lowerThird', resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 50, html: '<div></div>', css: '', js: '', fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: '' }], settings: {}, assets: [], layers: [] };
    const show = shows.createShowNamed('Adjust');
    shows.addGraphicToShow(show.id, template);
    const read = () => shows.loadShows().find((s) => s.id === show.id);
    const g = read().graphics[0];
    const [c1] = read().cues;
    shows.addShowCue(show.id, g.id);
    const c2 = read().cues[1];

    assert.equal(shows.setGraphicAdjust(show.id, g.id, { place: 'bl', anchor: 'bl' }).error, null);
    assert.equal(shows.setCueAdjust(show.id, c2.id, { place: 'br' }).error, null);
    assert.deepEqual(read().cues[1].adjust, { v: 1, place: 'br' });

    // Promotion from cue 2: one write (one stamp), default takes its members, its record goes.
    const before = read().updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    assert.equal(shows.promoteCueAdjust(show.id, c2.id).error, null);
    const promoted = read();
    assert.notEqual(promoted.updatedAt, before);
    assert.deepEqual(promoted.graphics[0].adjust, { v: 1, place: 'br', anchor: 'bl' });
    assert.equal(promoted.cues[1].adjust, undefined);

    // Re-adding the graphic by name keeps its record, as it keeps its layer.
    shows.addGraphicToShow(show.id, { ...template, html: '<div>new</div>' });
    assert.deepEqual(read().graphics[0].adjust, { v: 1, place: 'br', anchor: 'bl' });
    // Publish's refresh replaces the template and keeps the record.
    shows.refreshGraphicCopies(show.id, () => ({ template: { ...template, html: '<div>pub</div>' }, updatedAt: '2099-01-01T00:00:00.000Z' }));
    assert.deepEqual(read().graphics[0].adjust, { v: 1, place: 'br', anchor: 'bl' });
    // A duplicate carries every record.
    shows.setCueAdjust(show.id, c1.id, { y: -20 });
    const copy = shows.duplicateShowChecked(show.id).show;
    assert.deepEqual(copy.graphics[0].adjust, read().graphics[0].adjust);
    assert.deepEqual(copy.cues[0].adjust, { v: 1, y: -20 });

    // Steps add to the record as it stands when each write runs: three quick presses are 3 px,
    // at the cue's scope from the inherited x, and a size step from the inherited scale.
    shows.setGraphicAdjust(show.id, g.id, { x: 10, scale: 0.9 });
    for (let i = 0; i < 3; i++) shows.stepAdjust(show.id, c1.id, 'cue', { x: -1 });
    shows.stepAdjust(show.id, c1.id, 'cue', { scale: -0.05 });
    assert.deepEqual(read().cues[0].adjust, { v: 1, y: -20, x: 7, scale: 0.85 });
    shows.setCueAdjust(show.id, c1.id, { x: null, scale: null });

    // Reset at the graphic reveals as designed; the cue's own stays.
    shows.setGraphicAdjust(show.id, g.id, null);
    assert.equal(read().graphics[0].adjust, undefined);
    assert.deepEqual(read().cues[0].adjust, { v: 1, y: -20 });

    // A later version's record is refused at every door.
    const all = JSON.parse(stored.get('spx-gfx-shows'));
    const mine = all.find((s) => s.id === show.id);
    mine.graphics[0].adjust = { v: 2, place: 'tr' };
    mine.cues[0].adjust = { v: 2, place: 'tr' };
    stored.set('spx-gfx-shows', JSON.stringify(all));
    assert.equal(shows.setGraphicAdjust(show.id, g.id, { x: 1 }).error, adjust.ADJUST_READ_ONLY);
    assert.equal(shows.setGraphicAdjust(show.id, g.id, null).error, adjust.ADJUST_READ_ONLY);
    assert.equal(shows.setCueAdjust(show.id, c1.id, { x: 1 }).error, adjust.ADJUST_READ_ONLY);
    assert.equal(shows.setCueAdjust(show.id, c1.id, null).error, adjust.ADJUST_READ_ONLY);
    assert.equal(shows.promoteCueAdjust(show.id, c1.id).error, adjust.ADJUST_READ_ONLY);
    assert.deepEqual(read().graphics[0].adjust, { v: 2, place: 'tr' }, 'kept as it was');
  } finally {
    globalThis.localStorage = previous;
  }
});
