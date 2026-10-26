// gate: build
// guards: src/templates/importedDesign/svgFonts.ts, src/model/fonts.ts
//
// THE FONT CSS AN IMPORTED SVG SHIPS, from plain inputs (docs/SVG_IMPORT_PLAN.md §4).
//
// `svgFontCss` turns the import's font matches into the template's `@font-face` block. The rule
// this pins is the alias: Illustrator names a face by its PostScript name (`Archivo-Black`) and
// states no weight anywhere, so a bundled variable file declared under that name is PINNED to the
// one weight the name states, clamped into the file's range - declared with the whole range, a
// Black headline renders Regular and nothing reports it (src/templates/importedDesign/AGENTS.md).
// The corpus harness (scripts/svg-import-passes.test.mjs, the `fontCss` record) pins the pass on
// the real files; this file pins every branch on literals, without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One TypeScript module of the app's graph, importable here. */
async function load(entry) {
  const bundle = await rolldown({ input: entry, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const { svgFontCss } = await load(path.join(projectRoot, 'src/templates/importedDesign/svgFonts.ts'));
const { FONTS, fontFaceCss, customFontFaceCss, LATIN_EXT_RANGE } = await load(path.join(projectRoot, 'src/model/fonts.ts'));

const css = (fonts) => svgFontCss({ markup: '<svg/>', width: 960, height: 270, fields: [], images: [], outlines: [], fonts });
const archivo = FONTS.find((f) => f.id === 'archivo');
/** The `font-weight` line of the one block a name is declared in. */
const weightOf = (text, family) => {
  const block = text.split('\n\n').find((b) => b.includes(`font-family: "${family}";`));
  return block?.match(/font-weight: ([^;]+);/)?.[1] ?? null;
};

test('no font named: no CSS at all', () => {
  assert.equal(css([]), '');
});

test('a bundled face under its own name is the bundled declaration, whole range', () => {
  const inter = FONTS.find((f) => f.id === 'inter');
  assert.equal(css([{ family: 'Inter', fontId: 'inter' }]), fontFaceCss(inter));
});

test('a bundled face under the artwork\'s own name is an alias pinned to the weight the name states', () => {
  assert.equal(archivo.weights.join(' '), '400 900', 'the clamps below assume the Archivo file covers 400-900');
  assert.equal(
    css([{ family: 'Archivo-Black', fontId: 'archivo', weight: 900 }]),
    `/* Bundled open-source font (the file ships with the export - no internet at playout).
   Declared as "Archivo-Black" because that is the name this artwork's own CSS asks for; the file is Archivo. */
@font-face {
  font-family: "Archivo-Black";
  src: url("fonts/archivo.woff2") format("woff2");
  font-weight: 900;            /* the name says this one weight, and the artwork states no other: pin the variable file to it */
  font-display: swap;          /* show fallback text until the font loads */
}
@font-face {
  font-family: "Archivo-Black";
  src: url("fonts/archivo-latin-ext.woff2") format("woff2");
  font-weight: 900;            /* the name says this one weight, and the artwork states no other: pin the variable file to it */
  font-display: swap;
  unicode-range: ${LATIN_EXT_RANGE};  /* latin-ext: Š Ž Ł ő ğ and the rest of Latin Extended */
}`,
  );
  // A stated weight outside the file's range is clamped into it.
  assert.equal(weightOf(css([{ family: 'Archivo-Light', fontId: 'archivo', weight: 300 }]), 'Archivo-Light'), '400');
  assert.equal(weightOf(css([{ family: 'Archivo-Heavy', fontId: 'archivo', weight: 950 }]), 'Archivo-Heavy'), '900');
  // A name that states no weight keeps the whole range, as the bundled declaration does.
  assert.equal(weightOf(css([{ family: 'Archivo-Narrow', fontId: 'archivo' }]), 'Archivo-Narrow'), '400 900');
  // A STATIC file (one weight) is never pinned: it declares 100-900, so a bold the artwork asks
  // for draws the file as it is rather than a synthesised smear.
  assert.equal(weightOf(css([{ family: 'BebasNeue-Bold', fontId: 'bebas-neue', weight: 700 }]), 'BebasNeue-Bold'), '100 900');
  assert.equal(weightOf(css([{ family: 'Anton-Regular', fontId: 'anton' }]), 'Anton-Regular'), '100 900');
});

test('an embedded face is the custom declaration; a bundled id wins over it', () => {
  const customFont = { family: 'Brand Sans', format: 'woff2', asset: { path: 'fonts/brand-sans.woff2', data: '' } };
  assert.equal(css([{ family: 'Brand Sans', customFont }]), customFontFaceCss(customFont));
  assert.equal(css([{ family: 'Archivo', fontId: 'archivo', customFont }]), fontFaceCss(archivo));
});

test('an unresolved family is named in one comment, after every face, never blocked', () => {
  assert.equal(
    css([{ family: 'Futura PT' }]),
    `/* UNRESOLVED FONT: Futura PT - the SVG references this family but no file ships
   with the template, so playout falls back to whatever the machine has installed. If the
   playout machine has the font, this is fine; otherwise import the file in the Style panel. */`,
  );
  const text = css([{ family: 'Helvetica Neue' }, { family: 'Inter', fontId: 'inter' }, { family: 'Futura PT' }]);
  const blocks = text.split('\n\n');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0], fontFaceCss(FONTS.find((f) => f.id === 'inter')));
  assert.ok(blocks[1].startsWith('/* UNRESOLVED FONTS: Helvetica Neue, Futura PT - the SVG references these families'));
  assert.ok(blocks[1].includes('If the\n   playout machine has the fonts, this is fine'));
  // An id the bundle does not carry (a font since removed) is unresolved, not an empty face.
  assert.ok(css([{ family: 'Gone', fontId: 'no-such-font' }]).startsWith('/* UNRESOLVED FONT: Gone'));
});
