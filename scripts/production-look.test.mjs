// gate: factory
// needs: browser
// guards: src/control/productionLook.ts, src/control/cueAdjust.ts, src/control/adjustGeometry.ts, src/control/cueStyle.ts, src/audience/audienceBrand.ts, src/model/shows.ts
//
// THE PRODUCTION LOOK AT PLAYOUT (docs/work-specs/playout-adjustments/spec.md, phase 3), in Node:
// the look as the fold's widest scope and `keepStyle` keeping it out (AC-6), what it reaches per
// property over emitted catalog templates, team and severity colours and an imported SVG left alone
// (AC-6), the exceptions and "Clear exceptions", activation, Off, the duplicate and the join page's
// activated-or-captured rule (AC-7). The bulk send's capture and recheck are in
// scripts/graphic-verbs.test.mjs; the journey is e2e/production-controls.spec.ts.

import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import { emitCatalog } from './catalog-emit.mjs';
import './lib/tsResolve.mjs';

const A = await import('../src/control/cueAdjust.ts');
const G = await import('../src/control/adjustGeometry.ts');
const St = await import('../src/control/cueStyle.ts');
const L = await import('../src/control/productionLook.ts');
const { audienceBrandFor } = await import('../src/audience/audienceBrand.ts');

const HD = { width: 1920, height: 1080 };
/** A look of Archivo and accent #ff7a00 (the spec's AC-6). */
const LOOK = {
  styleTag: 'clean',
  palette: { id: 'custom', name: 'Custom', styleTags: [], accent: '#ff7a00', text: '#ffffff', textDim: '#c8c8c8', panel: '#101820' },
  fontId: 'archivo',
  customFont: null,
};
const OTHER = { ...LOOK, palette: { ...LOOK.palette, accent: '#00a3ff' }, fontId: 'oswald' };
const layer = L.lookLayerOf(LOOK);

describe('the look in the fold', () => {
  test('it is the widest scope: the graphic and the cue win key by key, identity after', () => {
    assert.deepEqual(A.effectiveAdjust(undefined, undefined, layer).vars.accent, '#ff7a00');
    assert.deepEqual(A.effectiveAdjust(undefined, undefined, layer).font, { fontId: 'archivo' });
    const g = { v: 1, vars: { accent: '#00ff00' } };
    const c = { v: 1, font: { fontId: 'oswald' } };
    const eff = A.effectiveAdjust(g, c, layer);
    assert.equal(eff.vars.accent, '#00ff00', 'the graphic over the look');
    assert.equal(eff.vars['panel-bg'], '#101820', 'the look where neither scope sets it');
    assert.deepEqual(eff.font, { fontId: 'oswald' }, 'the cue over the look');
    assert.equal(A.effectiveAdjust(undefined, undefined, undefined).vars, undefined, 'no look, nothing');
  });

  test('keepStyle at either scope keeps the look out, and the scope\'s own style still applies', () => {
    const own = { v: 1, keepStyle: true, vars: { accent: '#00ff00' } };
    const atGraphic = A.effectiveAdjust(own, undefined, layer);
    assert.deepEqual(atGraphic.vars, { accent: '#00ff00' });
    assert.equal(atGraphic.font, undefined);
    const atCue = A.effectiveAdjust({ v: 1, vars: { 'text-color': '#eee' } }, { v: 1, keepStyle: true }, layer);
    assert.deepEqual(atCue.vars, { 'text-color': '#eee' }, 'the graphic\'s own style, never the look');
    assert.equal(A.effectiveAdjust({ v: 2, place: 'tr' }, undefined, layer).vars, undefined, 'a later version\'s record keeps the look out too');
  });

  test('a cue set "As designed" in its Colour row keeps its colours out of the look', () => {
    const reach = { family: true, weight: true, colours: ['accent', 'text-color'] };
    const patch = St.asDesignedPatch('colour', 'cue', undefined, reach);
    const eff = A.effectiveAdjust(undefined, { v: 1, keepStyle: patch.keepStyle }, layer);
    assert.equal(St.resolveStyle(eff, []), null, 'as designed');
  });
});

describe('what the look reaches, over emitted templates (AC-6)', () => {
  let byId;
  before(async () => {
    byId = Object.fromEntries((await emitCatalog({ only: ['lt01', 'sb05', 'al01', 'svg01'] })).map((v) => [v.id, v]));
  });

  test('a lower third takes the face and the accent where it paints them; a scoreboard keeps its team colours; an alert its severities', () => {
    const lt = L.lookLayerFor(layer, byId.lt01);
    assert.equal(lt.vars.accent, '#ff7a00');
    assert.deepEqual(lt.font, { fontId: 'archivo' });
    const style = St.resolveStyle(A.effectiveAdjust(undefined, undefined, lt), []);
    assert.match(style.vars['font-heading'], /Archivo/);
    assert.ok(style.fonts.some((f) => f.family === 'Archivo'));
    for (const id of ['sb05', 'al01']) {
      const on = L.lookLayerFor(layer, byId[id]);
      const vars = St.resolveStyle(A.effectiveAdjust(undefined, undefined, on), [])?.vars ?? {};
      assert.ok(!Object.keys(vars).some((k) => /team|severity|alert|level/.test(k)), `${id} sets none of its exceptions: ${Object.keys(vars)}`);
    }
    assert.match(byId.sb05.js + byId.sb05.css, /--team-a/, 'sb05 lifts its team colours onto its root itself');
    const sbReach = St.styleReach(byId.sb05);
    for (const k of Object.keys(L.lookLayerFor(layer, byId.sb05).vars ?? {})) {
      assert.ok(k === 'display-weight' ? sbReach.weight : sbReach.colours.includes(k), `sb05 takes ${k} only where it paints it`);
    }
  });

  test('an imported SVG takes nothing and sends nothing: it keeps its "as designed" line', () => {
    assert.equal(L.lookLayerFor(layer, byId.svg01), undefined);
    assert.equal(St.reachesAny(St.styleReach(byId.svg01)), false);
    const ctx = St.styleContextFor([byId.svg01], () => L.lookLayerFor(layer, byId.svg01));
    const state = G.cueAdjustState({ id: 'g', savedAt: 't' }, { id: 'c' }, HD, HD, {}, G.NO_GEOMETRY, null, false, ctx);
    assert.equal(state.send, undefined, 'no record, no look on it, no field');
  });

  test('the reach counts type and accent separately over the pool, and names what it reaches not at all', () => {
    // A graphic painting the accent and not the heading face counts once, for the accent.
    const accentOnly = { css: ':root { --accent: #f00; --font-heading: "Inter"; }\n.bar { background: var(--accent); font-family: Arial; }', js: '' };
    const pool = [
      { name: 'Strap', template: byId.lt01 },
      { name: 'Score', template: byId.sb05 },
      { name: 'Alert', template: byId.al01 },
      { name: 'Quiz art', template: byId.svg01 },
      { name: 'Bar', template: accentOnly },
    ];
    const reach = L.lookReach(pool, LOOK, []);
    const count = (pick) => pool.filter((g) => pick(St.styleReach(g.template))).length;
    assert.equal(reach.pool, 5);
    assert.equal(reach.type, count((r) => r.family));
    assert.equal(reach.accent, count((r) => r.colours.includes('accent')));
    const pair = L.lookReach([pool[0], pool[4]], LOOK, []);
    assert.deepEqual([pair.type, pair.accent], [1, 2], 'counted per property: the bar counts for the accent only');
    assert.deepEqual(reach.untouched, ['Quiz art']);
    // A face no graphic can resolve reaches none of them.
    assert.equal(L.lookReach(pool, { ...LOOK, fontId: null, customFont: { family: 'Mine', format: 'woff2', asset: { path: 'fonts/mine.woff2', data: '' } } }, []).type, 0);
  });
});

describe('Send to on-air graphics carries the look beside the place and size held', () => {
  test('the style as the fold gives it now, the frame the graphic holds, and nothing when nothing changes', () => {
    const held = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
    const style = { vars: { accent: '#ff7a00' } };
    assert.deepEqual(G.lookAppearance({ style }, held), { v: 1, frame: held.frame, vars: { accent: '#ff7a00' } });
    assert.deepEqual(G.lookAppearance({ style: null }, { ...held, vars: { accent: '#ff7a00' } }), held, 'Off takes the look off and keeps the place');
    assert.equal(G.lookAppearance({ style }, { ...held, vars: { accent: '#ff7a00' } }), undefined, 'already applied');
    assert.equal(G.lookAppearance({ style: null }, null), undefined, 'nothing on, nothing held');
    assert.deepEqual(G.lookAppearance({ style: null }, { v: 1, vars: { accent: '#ff7a00' } }), A.IDENTITY, 'the identity when the look was all it held');
  });

  test('its words: all sent, or the partial count first', () => {
    assert.equal(L.lookSentWords({ of: 3, updated: 3, gone: [], changed: [], failed: [] }), 'Look sent to 3 graphics on air.');
    assert.equal(L.lookSentWords({ of: 3, updated: 2, gone: ['Quiz board'], changed: [], failed: [] }), '2 of 3 updated; Quiz board went off air');
    assert.equal(L.lookSentWords({ of: 0, updated: 0, gone: [], changed: [], failed: [] }), 'No graphic is on air, so nothing was sent.');
  });
});

describe('a light panel is a change of tone', () => {
  test('warned for a light panel, translucent or not, never for a dark one or a colour it cannot read', () => {
    assert.equal(L.lightPanel(LOOK), false);
    assert.equal(L.lightPanel({ ...LOOK, palette: { ...LOOK.palette, panel: '#f4f4f4' } }), true);
    assert.equal(L.lightPanel({ ...LOOK, palette: { ...LOOK.palette, panel: 'rgba(12, 14, 18, 0.92)' } }), false, 'the captured default, translucent and dark');
    assert.equal(L.lightPanel({ ...LOOK, palette: { ...LOOK.palette, panel: 'rgba(250, 250, 250, 0.9)' } }), true, 'translucent and light');
    assert.equal(L.lightPanel({ ...LOOK, palette: { ...LOOK.palette, panel: 'not a colour' } }), false);
  });
});

// ── The doors on the production (model/shows.ts), bundled for Node as cue-adjust.test.mjs does ──
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(tmpdir(), 'production-look-'));
after(() => rmSync(dir, { recursive: true, force: true }));

async function loadShowsModule() {
  const bundle = await rolldown({ input: path.join(root, 'src/model/shows.ts'), platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, 'shows.mjs');
  writeFileSync(file, output[0].code);
  return import(pathToFileURL(file).href);
}

test('activation, Off, exceptions, "Clear exceptions", the duplicate and the join page (AC-6, AC-7)', async () => {
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
    const template = { name: 'Strap', type: 'lowerThird', resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 50, html: '<div></div>', css: ':root { --accent: #fa0; --font-heading: "Inter"; }\n.x { color: var(--accent); font-family: var(--font-heading); }', js: '', fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: '' }], settings: {}, assets: [], layers: [] };
    const show = shows.createShowNamed('Look');
    shows.addGraphicToShow(show.id, template);
    const read = (id = show.id) => shows.loadShows().find((s) => s.id === id);
    const g = read().graphics[0];
    shows.addShowCue(show.id, g.id);
    const [c1, c2] = read().cues;
    // An old production: a captured look, never turned on. Its graphics change nothing.
    shows.setShowLook(show.id, LOOK);
    assert.equal(L.productionLookOf(read()), null);
    const fold = (record, cue) => {
      const look = L.productionLookOf(record);
      return A.effectiveAdjust(record.graphics[0].adjust, cue.adjust, look ? L.lookLayerFor(L.lookLayerOf(look), template) : undefined);
    };
    assert.equal(St.resolveStyle(fold(read(), read().cues[0]), []), null, 'a captured look styles nothing');
    assert.equal(audienceBrandFor(read().look).accent, '#ff7a00', 'and its join page keeps it');

    // One cue keeps its own style; another graphic-wide exception would count too.
    shows.setCueAdjust(show.id, c2.id, { keepStyle: true, x: 4 });
    assert.deepEqual(L.lookExceptions(read()), [{ graphic: 'Strap', cue: c2.label }]);

    // Duplicate, then turn another brand on in the copy: every cue previews it, the exception
    // survives, the original is unchanged.
    const copy = shows.duplicateShowChecked(show.id).show;
    const saved = [{ id: 'b-autumn', brand: OTHER }];
    const activating = L.lookToActivate({ ...read(copy.id), brandId: 'b-autumn' }, saved);
    assert.notEqual(activating, OTHER, 'copied at activation, never the library\'s object');
    assert.equal(shows.setShowLookApplied(copy.id, true, activating).error, null);
    const dup = read(copy.id);
    assert.equal(dup.lookApplied, true);
    assert.equal(St.resolveStyle(fold(dup, dup.cues[0]), []).vars.accent, '#00a3ff');
    assert.equal(St.resolveStyle(fold(dup, dup.cues[1]), []), null, 'the cue exception survived the duplicate');
    assert.deepEqual(dup.cues[1].adjust, { v: 1, keepStyle: true, x: 4 });
    assert.equal(read().lookApplied, undefined, 'the original is not turned on');
    assert.equal(read().look.palette.accent, '#ff7a00', 'nor restyled');
    assert.equal(audienceBrandFor(dup.look).accent, '#00a3ff', 'the activated look on the copy\'s join page');

    // "Clear exceptions" removes every keepStyle and nothing else of any record.
    const cleared = shows.clearStyleExceptions(copy.id);
    assert.equal(cleared.cleared, 1);
    assert.deepEqual(read(copy.id).cues[1].adjust, { v: 1, x: 4 });
    assert.equal(St.resolveStyle(fold(read(copy.id), read(copy.id).cues[1]), []).vars.accent, '#00a3ff');
    assert.equal(shows.clearStyleExceptions(copy.id).cleared, 0, 'nothing left: no write');

    // Off restores: the activation goes, the look stays for the join page and the wizard.
    assert.equal(shows.setShowLookApplied(copy.id, false).error, null);
    assert.equal(read(copy.id).lookApplied, undefined);
    assert.equal(St.resolveStyle(fold(read(copy.id), read(copy.id).cues[0]), []), null);
    assert.equal(read(copy.id).look.palette.accent, '#00a3ff');

    // On with no look at all is refused; a hand edit names no brand any more.
    const bare = shows.createShowNamed('Bare');
    assert.match(shows.setShowLookApplied(bare.id, true).error, /Choose/);
    shows.editShowLook(copy.id, LOOK, 'b-autumn');
    assert.equal(read(copy.id).brandId, 'b-autumn');
    shows.editShowLook(copy.id, { ...LOOK, fontId: 'inter' }, null);
    assert.equal(read(copy.id).brandId, undefined);

    // A record a later build wrote is kept as it is by "Clear exceptions".
    const all = JSON.parse(stored.get('spx-gfx-shows'));
    all.find((s) => s.id === show.id).cues[0].adjust = { v: 2, keepStyle: true };
    stored.set('spx-gfx-shows', JSON.stringify(all));
    const kept = shows.clearStyleExceptions(show.id);
    assert.equal(kept.unread, 1);
    assert.deepEqual(read().cues[0].adjust, { v: 2, keepStyle: true });
    assert.deepEqual(read().cues[1].adjust, { v: 1, x: 4 }, 'the other exception cleared');
    void c1;
  } finally {
    globalThis.localStorage = previous;
  }
});
