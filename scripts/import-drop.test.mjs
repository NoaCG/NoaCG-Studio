// guards: src/components/wizard/import/drop.ts, src/components/wizard/draft/template.ts
//
// THE IMPORT GRAPHIC CARD'S DROP DOORS (docs/work-specs/wizard-structure/spec.md D5). What a
// dropped SVG, picture or template file does to the wizard's draft, and the brand spread the
// shell lays over a new design (`brandOrClearPatch`). Each case is what the shell's inline
// handlers did on the day they moved into `import/drop.ts`, read back.
//
// The SVG results are hand-made inventories: reading real markup needs `DOMParser`, and the
// real reader over the real corpus is scripts/svg-import-passes.test.mjs's job. Here only the
// draft a drop makes from an inventory is asked.
//
// Loaded through scripts/wizard-load.mjs: field-auto-map.test.mjs's rolldown pattern, with the
// wizard's `import` index resolved to `import/draft.ts` (that file says why).
//
//   node --test scripts/import-drop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWizardModule as load } from './wizard-load.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (relative) => path.join(projectRoot, 'src', relative);

const { svgDropPatch, clearSvgPatch, artDropPatch, templateFileDropped } = await load(src('components/wizard/import/drop.ts'));
const { initialDraft, mergeDraft, brandPatch, brandOrClearPatch } = await load(src('components/wizard/draft.ts'));
const { PALETTES } = await load(src('model/wizard.ts'));

const FRAME = { width: 1920, height: 1080 };

/** One text layer of an inventory, as the reader reports it. */
const text = (id, label, extra = {}) => ({
  id, label, sample: label, marked: false, drawing: false, namedByGroup: false, numeric: false, clock: false, ...extra,
});

/** An SVG inventory with a field, a furniture text drawn before it, one off the canvas, a
 *  picture opted in by name and one not, an outline, a panel and a font. */
function inventory(overrides = {}) {
  return {
    markup: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    fileName: 'match-strap.svg',
    width: 1920,
    height: 1080,
    candidates: [text('t0', 'Q', { drawing: true }), text('t1', 'Name'), text('t2', 'Bleed', { outsideCanvas: true })],
    images: [{ id: 'i0', label: 'Logo', marked: true }, { id: 'i1', label: 'Backdrop', marked: false }],
    outlines: [{ id: 'o0', label: 'Wordmark', marked: false }],
    groups: [],
    shapes: [{ id: 's0', label: 'Banner', x: 0, y: 0, width: 800, height: 120 }],
    fonts: [{ family: 'Inter-Bold', lookup: 'Inter', weight: 700 }],
    notices: [],
    ...overrides,
  };
}

const drop = (result, previous = initialDraft()) => svgDropPatch(result, { resolution: FRAME, previous });

/** The SVG road's keys of a patch: `designSvg` and every `svg*` key. */
const svgKeys = (patch) => Object.keys(patch).filter((k) => k === 'designSvg' || k.startsWith('svg')).sort();

// ── An SVG drop ───────────────────────────────────────────────────────────────────────────

test('a dropped SVG larger than the frame is fitted down to it, a smaller one keeps its size', () => {
  const big = drop(inventory({ width: 3840, height: 2400 }));
  assert.deepEqual([big.designSvg.width, big.designSvg.height], [1728, 1080]);
  assert.equal(big.designSvg.markup, inventory().markup, 'the markup itself is untouched');
  const small = drop(inventory({ width: 640, height: 200 }));
  assert.deepEqual([small.designSvg.width, small.designSvg.height], [640, 200]);
});

test('a dropped SVG offers every text on, furniture last and off, and a text off the canvas kept as drawn', () => {
  const rows = drop(inventory()).svgFields;
  assert.deepEqual(rows.map((r) => [r.candidateId, r.on]), [['t1', true], ['t2', false], ['t0', false]]);
  assert.equal(rows.find((r) => r.candidateId === 't2').whenOff, 'keep');
  assert.ok(rows.every((r) => r.kind === 'text'));
});

test('a dropped SVG offers a picture or an outline only when its layer opted in by name', () => {
  const patch = drop(inventory());
  assert.deepEqual(patch.svgImages.map((r) => [r.candidateId, r.on]), [['i0', true], ['i1', false]]);
  assert.deepEqual(patch.svgOutlines.map((r) => [r.candidateId, r.on, r.box]), [['o0', false, null]]);
  assert.deepEqual(patch.svgStretch, { on: false, shapeId: 's0' });
  assert.deepEqual(patch.svgFonts.map((f) => [f.family, f.weight, f.customFont]), [['Inter-Bold', 700, null]]);
});

test('a dropped SVG replaces the raster walk and settles the design', () => {
  const patch = drop(inventory());
  assert.equal(patch.designArt, null);
  assert.deepEqual(patch.importedImages, []);
  assert.equal(patch.designOriginal, null);
  assert.deepEqual(patch.designErases, []);
  assert.deepEqual(patch.designFields, []);
  assert.equal(patch.category, 'imported-design');
  assert.equal(patch.variantId, 'svg01');
  assert.deepEqual(patch.lines, []);
  assert.equal(patch.zone, null);
  assert.deepEqual(patch.animation, { presetId: null, outPresetId: null });
});

test('a dropped SVG names the graphic after the file until the reader names it', () => {
  const first = mergeDraft(initialDraft(), drop(inventory()));
  assert.equal(first.name, 'Match strap');
  // A second drop's file replaces the name the first file gave…
  const second = drop(inventory({ fileName: 'scoreboard.svg' }), first);
  assert.equal(second.name, 'Scoreboard');
  // …and never a name the reader typed.
  const typed = drop(inventory({ fileName: 'scoreboard.svg' }), { ...first, name: 'Friday final' });
  assert.equal(typed.name, 'Friday final');
});

// ── The SVG taken back ────────────────────────────────────────────────────────────────────

test('clearing the SVG takes back every SVG answer and the name its file gave', () => {
  const dropped = mergeDraft(initialDraft(), drop(inventory()));
  const cleared = clearSvgPatch(dropped);
  assert.equal(cleared.designSvg, null);
  for (const key of ['svgFields', 'svgImages', 'svgOutlines', 'svgExtras', 'svgFonts']) assert.deepEqual(cleared[key], [], key);
  assert.equal(cleared.svgBehaviour, null);
  assert.deepEqual(cleared.svgStretch, { on: false, shapeId: null });
  assert.equal(cleared.variantId, null);
  assert.equal(cleared.category, null);
  assert.equal(cleared.name, '');
  assert.equal(clearSvgPatch({ ...dropped, name: 'Friday final' }).name, 'Friday final');
});

// ── A picture drop ────────────────────────────────────────────────────────────────────────

const art = { width: 1920, height: 1080 };
const picture = (name) => ({ path: `images/${name}`, name, mime: 'image/png', data: 'data:image/png;base64,AA==' });

test('a dropped picture takes back every SVG answer an SVG clear does', () => {
  const patch = artDropPatch(art, [picture('strap.png')]);
  const cleared = clearSvgPatch(mergeDraft(initialDraft(), drop(inventory())));
  // Whatever SVG answer the clear takes back, a picture drop takes back too, to the same value.
  assert.deepEqual(svgKeys(patch), svgKeys(cleared));
  assert.equal(svgKeys(cleared).length, 8);
  for (const key of svgKeys(cleared)) assert.deepEqual(patch[key], cleared[key], key);
});

test('a dropped picture starts the prepare walk over on it and settles the bare design', () => {
  const strap = picture('strap.png');
  const patch = artDropPatch(art, [strap]);
  assert.equal(patch.designArt, art);
  assert.deepEqual(patch.importedImages, [strap]);
  assert.equal(patch.designOriginal, strap, 'the pristine upload is the erase source');
  assert.deepEqual(patch.designErases, []);
  assert.equal(patch.designKeepBakedText, false);
  assert.deepEqual(patch.designFields, []);
  assert.equal(patch.category, 'imported-design');
  assert.equal(patch.variantId, 'imp01');
  assert.deepEqual(patch.lines, []);
  assert.equal(patch.zone, null);
  assert.deepEqual(patch.animation, { presetId: null, outPresetId: null });
  assert.equal('name' in patch, false, 'a picture drop leaves the name alone');
  assert.equal(artDropPatch(art, []).designOriginal, null);
});

// ── A template file drop ──────────────────────────────────────────────────────────────────

test('a dropped template file is read through the injected reader, and a refusal becomes its message', async () => {
  const file = { name: 'strap.html' };
  const read = { template: { name: 'Strap' }, detection: { certain: true, messages: [] } };
  const seen = [];
  assert.deepEqual(await templateFileDropped(file, { importTemplateFile: async (f) => (seen.push(f), read) }), { ok: true, file: read });
  assert.deepEqual(seen, [file]);
  assert.deepEqual(
    await templateFileDropped(file, { importTemplateFile: async () => { throw new Error('Not a template'); } }),
    { ok: false, error: 'Not a template' },
  );
  assert.deepEqual(
    await templateFileDropped(file, { importTemplateFile: () => Promise.reject('zip unreadable') }),
    { ok: false, error: 'zip unreadable' },
  );
});

// ── The brand over a new design ───────────────────────────────────────────────────────────

const brand = {
  id: 'b1', name: 'Channel A7', styleTag: 'minimal', palette: PALETTES[1], fontId: 'oswald', customFont: null,
  logo: picture('a7-mark.png'),
};

test('a new design takes the brand in force, or clears the palette and typeface the last one carried', () => {
  assert.deepEqual(brandOrClearPatch(brand), brandPatch(brand));
  // Only the three: a new design without a brand leaves `customFont` and `brandLogo` alone.
  assert.deepEqual(brandOrClearPatch(null), { paletteId: null, customPalette: null, fontId: null });
});

test('the shell spreads the brand over a drop, so a drop never writes the palette itself', () => {
  for (const patch of [drop(inventory()), artDropPatch(art, [picture('strap.png')])]) {
    for (const key of ['paletteId', 'customPalette', 'fontId', 'customFont', 'brandLogo']) assert.equal(key in patch, false, key);
  }
  const branded = mergeDraft(initialDraft(), { ...drop(inventory()), ...brandOrClearPatch(brand) });
  assert.equal(branded.paletteId, PALETTES[1].id);
  assert.equal(branded.fontId, 'oswald');
  assert.equal(branded.variantId, 'svg01');
});
