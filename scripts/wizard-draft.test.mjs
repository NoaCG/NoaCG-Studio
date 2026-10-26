// gate: factory
// needs: browser
// guards: src/components/wizard/draft/core.ts, src/components/wizard/draft/template.ts, src/components/wizard/draft/format.ts, src/components/wizard/draft.ts
//
// THE WIZARD'S DRAFT, PINNED BEFORE THE SHELL AROUND IT IS TAKEN APART
// (docs/work-specs/wizard-structure/spec.md section 5.3). Every walk writes its answers into one
// `WizardDraft` and every door builds the graphic from it, so what these functions do today is
// the contract the coming walk reducer and door modules have to keep. Nothing here is new
// behaviour: each case is what the code did on the day it was written, read back.
//
// TWO HALVES, ONE FILE. The record, the merge, the option mapping, the brand patches and the
// motion pick are pure, and run here in Node. BUILDING a real design is not: `variant.create()`
// parses the html it emits with `DOMParser` (scripts/catalog-emit.mjs measured every catalog
// design failing without one), so the `buildDraftTemplate` cases run the same bundled modules in
// one blank Chromium page, which is why this file is a factory gate rather than a build one.
//
// Loaded through scripts/wizard-load.mjs: field-auto-map.test.mjs's rolldown pattern, with the
// wizard's `import` index resolved to `import/draft.ts` (that file says why).
//
//   node --test scripts/wizard-draft.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadWizardModule as load, wizardBrowserScript as browserScript } from './wizard-load.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (relative) => path.join(projectRoot, 'src', relative);

const draftModule = await load(src('components/wizard/draft.ts'));
const { initialDraft, mergeDraft, draftToOptions, draftName, brandPatch, brandClearPatch, universalPick } = draftModule;
const { draftFormatSelection, formatDraftPatch } = draftModule;
const { CATALOG, HAND_WRITTEN, variantById } = await load(src('templates/catalog.ts'));
const { PALETTES, paletteById } = await load(src('model/wizard.ts'));

const catalog = Object.values(CATALOG).flat();
const hairline = variantById('lt01');
/** A design with a logo slot that is not a picture slot - where a brand's mark belongs. */
const logoSlot = catalog.find((v) => v.logo === 'optional' && v.imageSlot !== 'picture');
/** A design whose image slot is for CONTENT (a headshot, cover art), never a channel mark. */
const pictureSlot = catalog.find((v) => v.logo === 'optional' && v.imageSlot === 'picture');
const importedDesign = HAND_WRITTEN['imported-design'].find((v) => v.id === 'imp01');

const asset = (name) => ({ path: `assets/${name}`, name, mime: 'image/png', data: 'data:image/png;base64,AA==' });
const mark = asset('brand-mark.png');
const own = asset('my-photo.png');

test('the fixtures this file reads are still in the catalog', () => {
  for (const [label, v] of Object.entries({ hairline, logoSlot, pictureSlot, importedDesign })) {
    assert.ok(v, `no catalog design for ${label}`);
  }
  assert.equal(hairline.logo, 'none');
});

// ── The record and its merge ──────────────────────────────────────────────────────────────

test('initialDraft is a fresh record every call, undecided everywhere', () => {
  const a = initialDraft();
  a.lines.push({ key: 'x' });
  a.animation.steps = true;
  a.nudge.x = 9;
  const b = initialDraft();
  assert.deepEqual(b.lines, []);
  assert.equal(b.animation.steps, null);
  assert.deepEqual(b.nudge, { x: 0, y: 0 });
  assert.equal(b.name, '');
  assert.equal(b.variantId, null);
  assert.equal(b.paletteId, null);
  assert.equal(b.customPalette, null);
  assert.equal(b.brandLogo, null);
  assert.equal(b.formatTouched, false);
  assert.deepEqual(b.animation, {
    presetId: null, outPresetId: null, direction: 'both', motionIn: null, motionOut: null, speed: 1, easing: 'auto', steps: null,
  });
});

test('mergeDraft replaces top-level fields and deep-merges animation and nudge only', () => {
  const base = mergeDraft(initialDraft(), {
    lines: [{ key: 'name', sample: 'A' }],
    animation: { presetId: 'fade', speed: 1.5 },
    nudge: { x: 4 },
  });
  assert.deepEqual(base.nudge, { x: 4, y: 0 });
  assert.equal(base.animation.presetId, 'fade');
  assert.equal(base.animation.speed, 1.5);
  assert.equal(base.animation.easing, 'auto', 'an animation patch keeps the keys it does not name');

  const next = mergeDraft(base, { animation: { outPresetId: 'slide-up' }, nudge: { y: -2 }, lines: [] });
  assert.equal(next.animation.presetId, 'fade');
  assert.equal(next.animation.outPresetId, 'slide-up');
  assert.deepEqual(next.nudge, { x: 4, y: -2 });
  assert.deepEqual(next.lines, [], 'an array is replaced whole, never merged');

  const plain = mergeDraft(base, { name: 'Strap' });
  assert.equal(plain.animation, base.animation, 'no animation patch: the same object carries over');
  assert.equal(plain.nudge, base.nudge);
  assert.notEqual(plain, base);
  assert.equal(base.name, '', 'the input draft is never mutated');
});

// ── The draft as WizardOptions, per design ─────────────────────────────────────────────────

test('an imported design takes its empty lines as they are; a catalog design reads empty as undecided', () => {
  const empty = initialDraft();
  assert.deepEqual(draftToOptions(importedDesign, empty).lines, []);
  assert.equal(draftToOptions(hairline, empty).lines, undefined);
  const lines = [{ key: 'name', sample: 'A' }];
  assert.equal(draftToOptions(hairline, mergeDraft(empty, { lines })).lines, lines);
});

test('a palette resolves by id, and a captured or custom palette travels as itself', () => {
  const known = PALETTES[3];
  assert.deepEqual(draftToOptions(hairline, mergeDraft(initialDraft(), { paletteId: known.id })).palette, paletteById(known.id));
  assert.equal(draftToOptions(hairline, initialDraft()).palette, undefined);

  const captured = { ...known, id: 'captured', name: 'From the production', accent: '#6c4cf1' };
  const options = draftToOptions(hairline, mergeDraft(initialDraft(), { paletteId: known.id, customPalette: captured }));
  assert.equal(options.palette, captured, 'the custom palette wins over the named one');
});

test('the rest of the mapping: fonts, undecided steps, the entrance default', () => {
  const font = { family: 'House Sans', format: 'woff2', asset: asset('house.woff2') };
  const custom = draftToOptions(hairline, mergeDraft(initialDraft(), { fontId: 'custom', customFont: font }));
  assert.equal(custom.fontId, undefined);
  assert.equal(custom.customFont, font);
  const bundled = draftToOptions(hairline, mergeDraft(initialDraft(), { fontId: 'inter', customFont: font }));
  assert.equal(bundled.fontId, 'inter');
  assert.equal(bundled.customFont, undefined, 'an imported face kept in the draft does not ride a bundled pick');

  const options = draftToOptions(hairline, initialDraft());
  assert.equal(options.animation.presetId, hairline.animationPresets[0]);
  assert.equal(options.animation.steps, undefined, 'null steps leaves the design its own answer');
  assert.equal(draftToOptions(hairline, mergeDraft(initialDraft(), { animation: { steps: false } })).animation.steps, false);
  assert.equal(options.importedImages, undefined);
  assert.equal(options.logoEnabled, undefined);
});

test('the brand mark reaches a design with a logo slot, and leads the person\'s own picture there', () => {
  const draft = mergeDraft(initialDraft(), { brandLogo: mark, importedImages: [own], logoAssetPath: own.path });
  const options = draftToOptions(logoSlot, draft);
  assert.deepEqual(options.importedImages.map((a) => a.path), [own.path, mark.path]);
  assert.equal(options.logoAssetPath, mark.path);
  assert.equal(options.logoEnabled, true);

  // Cleared, the person's own picture is still the chosen one: nothing to restore.
  const cleared = draftToOptions(logoSlot, mergeDraft(draft, brandClearPatch()));
  assert.deepEqual(cleared.importedImages.map((a) => a.path), [own.path]);
  assert.equal(cleared.logoAssetPath, own.path);
});

test('the brand mark never reaches a picture slot or a design with no slot', () => {
  const draft = mergeDraft(initialDraft(), { brandLogo: mark, importedImages: [own], logoAssetPath: own.path });
  const picture = draftToOptions(pictureSlot, draft);
  assert.deepEqual(picture.importedImages.map((a) => a.path), [own.path], 'the mark is not bundled into a headshot');
  assert.equal(picture.logoAssetPath, own.path);
  assert.equal(picture.logoEnabled, undefined);

  const none = draftToOptions(hairline, mergeDraft(initialDraft(), { brandLogo: mark }));
  assert.equal(none.importedImages, undefined);
  assert.equal(none.logoAssetPath, undefined);
});

// ── The brand chooser's patches ────────────────────────────────────────────────────────────

const brandOf = (palette, extra = {}) => ({ styleTag: 'minimal', palette, fontId: 'inter', customFont: null, ...extra });

test('a brand on a catalog palette is applied by id', () => {
  const known = PALETTES[2];
  assert.deepEqual(brandPatch(brandOf(known, { logo: mark })), {
    customPalette: null,
    paletteId: known.id,
    fontId: 'inter',
    customFont: null,
    brandLogo: mark,
  });
});

test('a captured look travels as a custom palette, never through the lookup that would swap it', () => {
  // paletteById answers PALETTES[0] for an id it does not know, which is how a production's
  // captured look once came out in catalog amber.
  const captured = { ...PALETTES[2], id: 'captured', accent: '#6c4cf1' };
  const font = { family: 'House Sans', format: 'woff2', asset: asset('house.woff2') };
  const patch = brandPatch(brandOf(captured, { customFont: font }));
  assert.deepEqual(patch, { customPalette: captured, paletteId: null, fontId: 'custom', customFont: font, brandLogo: null });
  assert.equal(draftToOptions(hairline, mergeDraft(initialDraft(), patch)).palette.accent, '#6c4cf1');
});

test('clearing a brand clears colour, typeface and mark, and nothing else', () => {
  assert.deepEqual(brandClearPatch(), { paletteId: null, customPalette: null, fontId: null, customFont: null, brandLogo: null });
});

// ── The universal motion pick ──────────────────────────────────────────────────────────────

test('universalPick maps the whole-unit presets, lets an explicit pick win, and leaves the rest alone', () => {
  const at = (animation) => universalPick(mergeDraft(initialDraft(), { animation }), importedDesign);
  assert.deepEqual(universalPick(initialDraft(), importedDesign), { in: 'fade', out: 'fade' }, 'the design default design-fade');
  assert.deepEqual(at({ presetId: 'design-slide' }), { in: 'rise', out: 'rise' });
  assert.deepEqual(at({ presetId: 'design-fade', outPresetId: 'design-pop' }), { in: 'fade', out: 'pop' });
  assert.deepEqual(at({ presetId: 'design-fade', motionIn: 'blur', motionOut: 'rise' }), { in: 'blur', out: 'rise' });
  assert.deepEqual(at({ presetId: 'design-stagger' }), {}, 'the layer stagger is not a whole-unit motion');
  assert.deepEqual(universalPick(initialDraft(), hairline), {}, 'a catalog choreography maps to nothing');
});

// ── Format and name ────────────────────────────────────────────────────────────────────────

test('the format reads back only a coherent selection, and a format edit marks itself touched', () => {
  const fresh = initialDraft();
  assert.deepEqual(draftFormatSelection(fresh), { aspectId: fresh.aspectId, resolutionId: fresh.resolutionId, fps: fresh.fps });
  const incoherent = mergeDraft(fresh, { aspectId: fresh.aspectId === '9:16' ? '16:9' : '9:16' });
  assert.deepEqual(draftFormatSelection(incoherent), draftFormatSelection(fresh), 'a mismatched aspect falls back to the default');
  const selection = draftFormatSelection(fresh);
  assert.deepEqual(formatDraftPatch(selection), { ...selection, formatTouched: true });
});

test('the graphic is named from Finish, else from the design', () => {
  assert.equal(draftName(hairline, initialDraft()), hairline.name);
  assert.equal(draftName(hairline, mergeDraft(initialDraft(), { name: '  Guest Strap  ' })), 'Guest Strap');
  assert.equal(draftName(hairline, mergeDraft(initialDraft(), { name: '   ' })), hairline.name);
});

// ── Building the real design (Chromium: create() needs a DOM) ──────────────────────────────

test('buildDraftTemplate: the Finish name, the font stack, declared overrides only, a different exit', async () => {
  // Bundled before the browser starts, so a bundle that fails leaves no Chromium behind.
  const scripts = await Promise.all([
    browserScript(src('components/wizard/draft.ts'), 'NOACG_DRAFT'),
    browserScript(src('templates/catalog.ts'), 'NOACG_CATALOG'),
    browserScript(src('model/fonts.ts'), 'NOACG_FONTS'),
  ]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const content of scripts) await page.addScriptTag({ content });
    const seen = await page.evaluate(() => {
      const { initialDraft, mergeDraft, buildDraftTemplate } = window.NOACG_DRAFT;
      const { FONTS, fontStack } = window.NOACG_FONTS;
      const cssVar = (css, name) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? null;
      const pick = (variant) =>
        mergeDraft(initialDraft(), {
          category: variant.category,
          variantId: variant.id,
          lines: variant.suggestedLines.map((l) => ({ ...l })),
        });
      // The typeface pass rewrites only the four font tokens a design DECLARES, so the subject is
      // the first lower third that declares the label face and not the body one.
      const variant = window.NOACG_CATALOG.variantsFor('lower-third').find((v) => {
        const css = buildDraftTemplate(v, pick(v)).css;
        return v.animationPresets.length > 1 && cssVar(css, 'font-label') !== null && cssVar(css, 'font-body') === null;
      });
      const picked = pick(variant);
      const base = buildDraftTemplate(variant, picked);
      const font = FONTS.find((f) => fontStack(f) !== cssVar(base.css, 'font-label'));
      const named = buildDraftTemplate(variant, mergeDraft(picked, { name: 'Guest Strap' }));
      const fonted = buildDraftTemplate(variant, mergeDraft(picked, { fontId: font.id }));
      const fontedKept = buildDraftTemplate(
        variant,
        mergeDraft(picked, { fontId: font.id, cssVarOverrides: { 'font-label': 'Georgia, serif' } }),
      );
      const overridden = buildDraftTemplate(
        variant,
        mergeDraft(picked, { cssVarOverrides: { accent: '#123456', 'not-declared-here': '#654321' } }),
      );
      const [first, second] = variant.animationPresets;
      const entrance = buildDraftTemplate(variant, mergeDraft(picked, { animation: { presetId: first } }));
      const sameExit = buildDraftTemplate(variant, mergeDraft(picked, { animation: { presetId: first, outPresetId: first } }));
      const otherExit = buildDraftTemplate(variant, mergeDraft(picked, { animation: { presetId: first, outPresetId: second } }));
      return {
        variantName: variant.name,
        baseName: base.name,
        namedName: named.name,
        stack: fontStack(font),
        baseLabel: cssVar(base.css, 'font-label'),
        fontedLabel: cssVar(fonted.css, 'font-label'),
        fontedBody: cssVar(fonted.css, 'font-body'),
        keptLabel: cssVar(fontedKept.css, 'font-label'),
        accent: cssVar(overridden.css, 'accent'),
        undeclared: overridden.css.includes('not-declared-here'),
        declaresAccent: cssVar(base.css, 'accent') !== null,
        sameExitIsEntrance: sameExit.js === entrance.js,
        otherExitDiffers: otherExit.js !== entrance.js,
        otherExitKeepsHtml: otherExit.html === entrance.html && otherExit.css === entrance.css,
        hasData: entrance.js.includes('NOACG_ANIM'),
      };
    });
    assert.equal(seen.baseName, seen.variantName, 'unnamed, the graphic carries the design name');
    assert.equal(seen.namedName, 'Guest Strap');
    assert.notEqual(seen.baseLabel, seen.stack);
    assert.equal(seen.fontedLabel, seen.stack, 'a bundled typeface writes its stack into a declared font token');
    assert.equal(seen.fontedBody, null, 'and never grafts a font token the design does not declare');
    assert.equal(seen.keptLabel, 'Georgia, serif', 'an override on a font token outranks the typeface');
    assert.equal(seen.declaresAccent, true);
    assert.equal(seen.accent, '#123456', 'a declared variable takes the override');
    assert.equal(seen.undeclared, false, 'a variable the design does not declare is never grafted on');
    assert.equal(seen.hasData, true, 'the design carries an animation data block to mix onto');
    assert.equal(seen.sameExitIsEntrance, true, 'an exit equal to the entrance mixes nothing');
    assert.equal(seen.otherExitDiffers, true, 'a different exit is written onto the motion');
    assert.equal(seen.otherExitKeepsHtml, true, 'and only onto the motion');
  } finally {
    await browser.close();
  }
});

test('buildDraftTemplate: the heading weight is one the chosen face really draws', async () => {
  const scripts = await Promise.all([
    browserScript(src('components/wizard/draft.ts'), 'NOACG_DRAFT'),
    browserScript(src('templates/catalog.ts'), 'NOACG_CATALOG'),
  ]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const content of scripts) await page.addScriptTag({ content });
    const seen = await page.evaluate(() => {
      const { initialDraft, mergeDraft, buildDraftTemplate } = window.NOACG_DRAFT;
      const cssVar = (css, name) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? null;
      // lt43: a sport-family strap (heading weight 800) whose default face is Bebas Neue, one static weight.
      const variant = window.NOACG_CATALOG.variantById('lt43');
      const picked = mergeDraft(initialDraft(), { category: variant.category, variantId: variant.id, lines: variant.suggestedLines.map((l) => ({ ...l })) });
      const weightOf = (patch) => cssVar(buildDraftTemplate(variant, mergeDraft(picked, patch)).css, 'display-weight');
      return {
        bebas: weightOf({}),
        bebasAsked900: weightOf({ cssVarOverrides: { 'display-weight': '900' } }),
        archivoAsked900: weightOf({ fontId: 'archivo', cssVarOverrides: { 'display-weight': '900' } }),
      };
    });
    assert.equal(seen.bebas, '400', 'the family weight is clamped to Bebas Neue\'s one weight');
    assert.equal(seen.bebasAsked900, '400', 'an override the face cannot draw is clamped too');
    assert.equal(seen.archivoAsked900, '900', 'a weight the face has is kept');
  } finally {
    await browser.close();
  }
});
