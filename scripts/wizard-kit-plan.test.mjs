// guards: src/components/wizard/template/kitPlan.ts
//
// THE KIT PLAN, PINNED BEFORE THE KIT BECOMES OPERATIONS OVER THE WALK'S STATE
// (docs/work-specs/wizard-structure/spec.md section 5.3, D6). `kitPlan.ts` is what "build the
// whole set" is: which answers one graphic shares with the rest (`kitLookPatch`), the set built
// up front (`buildKit`), the set after its contents change (`reconcileKit`), an edit recorded
// (`commitKitGraphic`), a Style applied across it (`applyStyleToKit`) and the footer's brand on
// every graphic (`rebrandKit`). Each case is what the module does today, read back.
//
// THE DESIGNS ARE FIXTURES, ON PURPOSE. Building a catalog design needs a DOM (`variant.create()`
// parses its own html with `DOMParser`), and what this module decides never depends on what a
// design draws: it decides which DRAFT each graphic has and whether its code was rebuilt from it.
// So each fixture design's `create()` writes the options it was handed into the template, and the
// assertions read them back - a graphic built from the wrong draft, or not rebuilt at all, shows.
// Real designs through the real UI stay with e2e/wizard-kit.spec.ts.
//
// Loaded through scripts/wizard-load.mjs: field-auto-map.test.mjs's rolldown pattern, with the
// wizard's `import` index resolved to `import/draft.ts` (that file says why).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWizardModule as load } from './wizard-load.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { kitLookPatch, buildKit, reconcileKit, commitKitGraphic, applyStyleToKit, rebrandKit, kitPaletteFor } = await load(
  path.join(projectRoot, 'src/components/wizard/template/kitPlan.ts'),
);
const { initialDraft, mergeDraft, brandPatch } = await load(path.join(projectRoot, 'src/components/wizard/draft.ts'));
const { PALETTES } = await load(path.join(projectRoot, 'src/model/wizard.ts'));

/** A catalog palette and a style family it is drawn for, and one it is not. */
const KIT_PALETTE = PALETTES.find((p) => p.styleTags.length > 0 && p.id !== PALETTES[0].id);
const IN_FAMILY = KIT_PALETTE.styleTags[0];
const OFF_FAMILY = ['noacg', 'minimal', 'editorial', 'cinematic', 'sport', 'glass'].find((t) => !KIT_PALETTE.styleTags.includes(t));

/**
 * A design whose code is the options it was built from: the first line's sample, the palette's
 * accent and the size knob, each readable back off the template.
 */
function design(id, { styleTag = IN_FAMILY, presets = ['slide-up', 'fade'], logo = 'none' } = {}) {
  return {
    id,
    name: `Design ${id}`,
    category: 'lower-third',
    styleTag,
    description: '',
    maxLines: 2,
    suggestedLines: [{ key: 'name', label: 'Name', sample: `Sample ${id}` }],
    logo,
    animationPresets: presets,
    create(options) {
      const line = options.lines?.[0]?.sample ?? `Sample ${id}`;
      return {
        name: `Design ${id}`,
        type: 'lower-third',
        resolution: options.resolution,
        fps: options.fps,
        html: `<div class="fx-root">${line}</div>`,
        css: `:root { --accent: ${options.palette?.accent ?? 'default'}; --scale: ${options.sizeScale}; }`,
        js: '',
        fields: [],
        settings: {},
        assets: [],
        layers: [],
      };
    },
  };
}

/** What a built graphic says it was built from. */
const builtFrom = (template) => ({
  line: /<div class="fx-root">([^<]*)</.exec(template.html)[1],
  accent: /--accent: ([^;]+);/.exec(template.css)[1],
  scale: Number(/--scale: ([^;]+);/.exec(template.css)[1]),
});

const pack = () => ({
  id: 'fixture-kit',
  name: 'Fixture kit',
  description: '',
  family: IN_FAMILY,
  paletteId: KIT_PALETTE.id,
  starter: ['a', 'b'],
  types: [],
  formats: [],
});
const item = (key, variant) => ({ key, variant, typeId: null });

const A = design('a');
const B = design('b');
const OFF = design('off', { styleTag: OFF_FAMILY });
const C = design('c', { presets: ['fade'] });

const base = () => mergeDraft(initialDraft(), { aspectId: '9:16', resolutionId: '1080x1920', fps: 50, formatTouched: true });

test('the fixture palette has a family it is drawn for and one it is not', () => {
  assert.ok(KIT_PALETTE && IN_FAMILY && OFF_FAMILY);
  assert.equal(kitPaletteFor(pack(), A), KIT_PALETTE.id);
  assert.equal(kitPaletteFor(pack(), OFF), undefined);
  assert.equal(kitPaletteFor({ ...pack(), paletteId: undefined }, A), undefined, 'a kit with no palette imposes none');
});

// ── kitLookPatch ───────────────────────────────────────────────────────────────────────────

test('kitLookPatch carries the Style and nothing that belongs to one design', () => {
  const mark = { path: 'assets/mark.png', name: 'mark.png', mime: 'image/png', data: 'data:,' };
  const source = mergeDraft(initialDraft(), {
    name: 'Opening strap',
    lines: [{ key: 'name', sample: 'Only here' }],
    zone: 'top-left',
    nudge: { x: 12, y: 4 },
    logoEnabled: false,
    paletteId: KIT_PALETTE.id,
    customPalette: { ...KIT_PALETTE, id: 'captured' },
    cssVarOverrides: { accent: '#ff0000' },
    fontId: 'inter',
    brandLogo: mark,
    sizeScale: 1.2,
    typeScale: 0.9,
    animation: { presetId: 'slide-up', outPresetId: 'fade', direction: 'in', speed: 1.5, easing: 'linear', steps: true },
  });
  const patch = kitLookPatch(source, B);
  assert.deepEqual(patch, {
    paletteId: KIT_PALETTE.id,
    customPalette: source.customPalette,
    cssVarOverrides: { accent: '#ff0000' },
    fontId: 'inter',
    customFont: null,
    brandLogo: mark,
    sizeScale: 1.2,
    typeScale: 0.9,
    animation: { presetId: 'slide-up', outPresetId: 'fade', direction: 'in', speed: 1.5, easing: 'linear', steps: null },
  });
  for (const key of ['name', 'lines', 'zone', 'nudge', 'logoEnabled']) assert.equal(key in patch, false, `${key} stays with its design`);

  // A preset the target design does not declare is not carried onto it.
  const onC = kitLookPatch(source, C);
  assert.equal(onC.animation.presetId, null);
  assert.equal(onC.animation.outPresetId, 'fade');
});

// ── buildKit ───────────────────────────────────────────────────────────────────────────────

test('buildKit builds every graphic up front, in the kit palette where it is drawn for the design', () => {
  const items = [item('a', A), item('off', OFF)];
  const plan = buildKit(pack(), items, base(), null);
  assert.equal(plan.items, items);
  assert.equal(plan.current, 0);
  assert.equal(plan.sharedLook, null);
  assert.equal(plan.edited, false);
  assert.equal(plan.drafts.length, 2);
  assert.equal(plan.built.length, 2);

  const [a, off] = plan.drafts;
  assert.equal(a.variantId, 'a');
  assert.equal(a.category, 'lower-third');
  assert.deepEqual(a.lines, A.suggestedLines);
  assert.notEqual(a.lines[0], A.suggestedLines[0], 'the lines are copies, never the catalog\'s own objects');
  assert.deepEqual([a.aspectId, a.resolutionId, a.fps, a.formatTouched], ['9:16', '1080x1920', 50, true], 'the frame is the production\'s');
  assert.equal(a.paletteId, KIT_PALETTE.id);
  assert.equal(off.paletteId, null, 'an off-family design keeps its own default');

  assert.deepEqual(builtFrom(plan.built[0]), { line: 'Sample a', accent: KIT_PALETTE.accent, scale: 1 });
  assert.deepEqual(builtFrom(plan.built[1]), { line: 'Sample off', accent: 'default', scale: 1 });
});

test('buildKit: the footer\'s brand outranks the kit palette', () => {
  const branded = { ...PALETTES[0], id: 'captured', accent: '#6c4cf1' };
  const brand = brandPatch({ styleTag: IN_FAMILY, palette: branded, fontId: null, customFont: null });
  const plan = buildKit(pack(), [item('a', A), item('off', OFF)], base(), brand);
  for (const [i, d] of plan.drafts.entries()) {
    assert.equal(d.paletteId, null);
    assert.equal(d.customPalette, branded);
    assert.equal(builtFrom(plan.built[i]).accent, '#6c4cf1');
  }
});

// ── reconcileKit ───────────────────────────────────────────────────────────────────────────

test('reconcileKit keeps every graphic still wanted exactly as edited, builds the new, drops the removed', () => {
  let plan = buildKit(pack(), [item('a', A), item('b', B)], base(), null);
  plan = { ...plan, current: 1 };
  const next = reconcileKit(plan, [item('b', B), item('off', OFF)], base(), null);
  assert.deepEqual(next.items.map((i) => i.key), ['b', 'off']);
  assert.equal(next.drafts[0], plan.drafts[1], 'a kept graphic keeps its draft object');
  assert.equal(next.built[0], plan.built[1], 'and its code, not a rebuild');
  assert.equal(next.drafts[1].variantId, 'off');
  assert.equal(next.current, 0, 'the open graphic stays open where it moved to');

  const dropped = reconcileKit(plan, [item('a', A)], base(), null);
  assert.equal(dropped.current, 0, 'the open graphic was removed: the hub starts from the first');
});

test('reconcileKit builds an added graphic in the Style last applied across the kit', () => {
  const plan = buildKit(pack(), [item('a', A)], base(), null);
  const styled = applyStyleToKit(plan, mergeDraft(plan.drafts[0], { sizeScale: 1.4 }));
  const next = reconcileKit(styled, [item('a', A), item('b', B)], base(), null);
  assert.equal(next.drafts[1].sizeScale, 1.4);
  assert.equal(builtFrom(next.built[1]).scale, 1.4);
});

// ── commitKitGraphic ───────────────────────────────────────────────────────────────────────

test('commitKitGraphic records an edit and rebuilds only that graphic', () => {
  const plan = { ...buildKit(pack(), [item('a', A), item('b', B)], base(), null), current: 1 };
  const edited = mergeDraft(plan.drafts[1], { lines: [{ key: 'name', sample: 'Edited' }] });
  const next = commitKitGraphic(plan, edited);
  assert.equal(next.drafts[1], edited);
  assert.equal(builtFrom(next.built[1]).line, 'Edited');
  assert.equal(next.drafts[0], plan.drafts[0]);
  assert.equal(next.built[0], plan.built[0], 'the others are not rebuilt');
  assert.equal(next.edited, true);
});

test('commitKitGraphic ignores a look that changed nothing, and a draft of another design', () => {
  const plan = buildKit(pack(), [item('a', A), item('b', B)], base(), null);
  assert.equal(commitKitGraphic(plan, plan.drafts[0]), plan, 'looking at a graphic is not editing it');
  const stray = mergeDraft(plan.drafts[1], { name: 'Not the open one' });
  assert.equal(commitKitGraphic(plan, stray), plan);
});

// ── applyStyleToKit and rebrandKit ─────────────────────────────────────────────────────────

test('applyStyleToKit gives every other graphic the Style and keeps its text', () => {
  const plan = buildKit(pack(), [item('a', A), item('b', B)], base(), null);
  const source = mergeDraft(plan.drafts[0], { sizeScale: 1.3 });
  const next = applyStyleToKit(plan, source);
  assert.equal(next.drafts[0], plan.drafts[0], 'the source is the caller\'s to commit');
  assert.equal(next.built[0], plan.built[0]);
  assert.equal(next.drafts[1].sizeScale, 1.3);
  assert.deepEqual(builtFrom(next.built[1]), { line: 'Sample b', accent: KIT_PALETTE.accent, scale: 1.3 });
  assert.equal(next.sharedLook, source);
  assert.equal(next.edited, true);
});

test('rebrandKit puts the brand on every graphic, and None gives each its kit palette back', () => {
  const plan = buildKit(pack(), [item('a', A), item('off', OFF)], base(), null);
  const branded = { ...PALETTES[0], id: 'captured', accent: '#6c4cf1' };
  const on = rebrandKit(plan, brandPatch({ styleTag: IN_FAMILY, palette: branded, fontId: null, customFont: null }));
  assert.deepEqual(on.built.map((t) => builtFrom(t).accent), ['#6c4cf1', '#6c4cf1']);
  assert.equal(on.edited, plan.edited, 'a brand is not an edit');

  const off = rebrandKit(on, null);
  assert.deepEqual(off.drafts.map((d) => [d.paletteId, d.customPalette, d.fontId, d.brandLogo]), [
    [KIT_PALETTE.id, null, null, null],
    [null, null, null, null],
  ]);
  assert.deepEqual(off.built.map((t) => builtFrom(t).accent), [KIT_PALETTE.accent, 'default']);
});
