// gate: build
// guards: src/model/fonts.ts, src/templates/shared/base.ts
//
// NO BOLD IS SYNTHESISED, AND A HEADING WEIGHT IS ONE THE FACE REALLY HAS (playout-adjustments spec,
// "Typography reliability" item 2). Bebas Neue and Anton are one static weight and an imported face
// is one file that declares none, so any weight of 600 or more on them was a bold the browser
// invented by smearing the outlines. Their `@font-face` now declares 100-900, so every request
// draws the file as it is; the choices offered follow `fontWeights()`, and the build and the
// wizard write the heading weight clamped to a real one (`clampFontWeight()`).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function load(entry) {
  const bundle = await rolldown({ input: entry, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const fonts = await load(path.join(projectRoot, 'src/model/fonts.ts'));
const { fontWeights, clampFontWeight, importedFontFamilies, customFontFaceCss, fontById, fontStack, fontFaceCss, labelFontFaceCss, supportingFontFaceCss } = fonts;
const { applyLookToTemplate } = await load(path.join(projectRoot, 'src/model/packets.ts'));
const { getCssVariable } = await load(path.join(projectRoot, 'src/model/cssVars.ts'));
const { rootVarsCss } = await load(path.join(projectRoot, 'src/templates/shared/base.ts'));
const { FAMILY_TOKENS } = await load(path.join(projectRoot, 'src/model/themeTokens.ts'));

const values = (family, imported) => fontWeights(family, imported).map((w) => w.value);
const bebas = fontStack(fontById('bebas-neue'));
const custom = { family: 'Brand Sans', format: 'woff2', asset: { path: 'fonts/brand-sans.woff2', data: '' } };

test('the weights offered are the face\'s own: single-weight and imported faces offer Regular alone', () => {
  assert.deepEqual(values(bebas), [400]);
  assert.deepEqual(values(fontStack(fontById('anton'))), [400]);
  assert.deepEqual(values(fontStack(fontById('archivo'))), [400, 500, 600, 700, 800, 900]);
  assert.deepEqual(values('"Brand Sans", Arial, sans-serif', ['Brand Sans']), [400], 'an imported face: Regular until its weights are known');
  assert.deepEqual(values('"Brand Sans", Arial, sans-serif'), [400, 500, 600, 700, 800], 'a family the template does not ship is not narrowed');
});

test('a weight is clamped to the nearest real one, and anything else is left alone', () => {
  assert.equal(clampFontWeight('700', bebas), '400');
  assert.equal(clampFontWeight('bold', bebas), '400');
  assert.equal(clampFontWeight('800', '"Brand Sans", Arial', ['Brand Sans']), '400');
  assert.equal(clampFontWeight('600', fontStack(fontById('inter'))), '600', 'a real weight stays');
  assert.equal(clampFontWeight('900', fontStack(fontById('inter'))), '800', 'Inter stops at 800');
  assert.equal(clampFontWeight('var(--w)', bebas), 'var(--w)');
  assert.equal(clampFontWeight('900', '"Futura", Arial'), '900', 'a family the app does not ship is never narrowed');
});

test('a single-weight face and an imported face declare 100-900, so no request is a synthesised bold', () => {
  // Blink synthesises a bold only when the matched face's declared range tops out below 600.
  const top = (css) => [...css.matchAll(/font-weight:\s*(\d+)(?:\s+(\d+))?;/g)].map((m) => Number(m[2] ?? m[1]));
  for (const id of ['bebas-neue', 'anton']) {
    for (const css of [fontFaceCss(fontById(id)), labelFontFaceCss(fontById(id)), supportingFontFaceCss(fontById(id), 'why')]) {
      assert.ok(top(css).length > 0 && top(css).every((w) => w >= 600), `${id}: ${css}`);
    }
  }
  assert.ok(top(customFontFaceCss(custom)).every((w) => w >= 600) && top(customFontFaceCss(custom)).length > 0, 'the imported face');
  assert.match(fontFaceCss(fontById('archivo')), /font-weight: 400 900;/, 'a variable face keeps the range it covers');
});

test('an imported face is read back from the stylesheet that ships it', () => {
  assert.deepEqual(importedFontFamilies(`${customFontFaceCss(custom)}\n\n${fontFaceCss(fontById('inter'))}`), ['Brand Sans']);
});

/** The `:root` block a design reading the heading weight is built with, on a face. */
const built = (fontId, customFont) => {
  const o = { palette: { accent: '#f00', text: '#fff', textDim: '#ccc', panel: '#000' }, typeScale: 1, fontId, customFont };
  const stack = customFont ? `"${customFont.family}", Arial, sans-serif` : fontStack(fontById(fontId));
  return rootVarsCss(o, stack, 1, { tokens: FAMILY_TOKENS.sport, consumerCss: '.name { font-weight: var(--display-weight); }' });
};

test('the build emits a weight the chosen face has: the sport family on Bebas Neue asks for Regular', () => {
  assert.equal(FAMILY_TOKENS.sport.displayWeight, '800', 'the case below assumes the sport family sets a bold');
  assert.equal(getCssVariable(built('bebas-neue'), 'display-weight'), '400', 'an 800 would be a synthesised bold on Bebas Neue');
  assert.equal(getCssVariable(built('anton'), 'display-weight'), '400');
  assert.equal(getCssVariable(built('archivo'), 'display-weight'), '800', 'on a face with a bold, the family\'s weight stays');
  assert.equal(getCssVariable(built('archivo', custom), 'display-weight'), '400', 'an imported face draws its file as it is');
});

test('a look that swaps to a single-weight face keeps the stored weight, and the face cannot smear it', () => {
  const template = { id: 't', name: 't', html: '<div></div>', js: '', assets: [], fields: [],
    css: `${fontFaceCss(fontById('archivo'))}\n\n${built('archivo')}\n.name { font-weight: var(--display-weight); }` };
  const looked = applyLookToTemplate(template, { palette: {}, fontId: 'bebas-neue' }).css;
  assert.equal(getCssVariable(looked, 'display-weight'), '800', 'not rewritten: a later look on a face with a bold gets it back');
  assert.match(looked, /fonts\/bebas-neue\.woff2[^}]*font-weight: 100 900;/, 'the swapped-in face declares every weight');
});
