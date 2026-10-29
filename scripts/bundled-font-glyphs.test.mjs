// gate: build
// guards: src/model/fonts.ts, src/model/packets.ts, src/templates/importedDesign/svgFonts.ts, public/fonts/*.woff2
//
// EVERY BUNDLED FACE SETS A NORDIC AND CENTRAL-EUROPEAN NAME IN ITSELF (playout-adjustments spec,
// "Typography reliability" item 1, and AC-5's string).
//
// Each bundled `file` is Google's `latin` subset: å ä ö æ ø are there, Š š Ž ž are not, so
// "Šimon Žáková" used to set those letters in the fallback stack. Every face now ships its
// `latin-ext` file as a second `@font-face` limited to that range. This reads both files' own
// cmap (scripts/woff2-cmap.mjs) and resolves each letter the way the browser does: the latin-ext
// rule, declared second, answers a letter in its range when its file has it; the latin rule
// answers the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import { woff2CodePoints, inUnicodeRange } from './woff2-cmap.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function load(entry) {
  const bundle = await rolldown({ input: entry, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const { FONTS, fontFaceCss, labelFontFaceCss, supportingFontFaceCss } = await load(path.join(projectRoot, 'src/model/fonts.ts'));
const { applyLookToTemplate } = await load(path.join(projectRoot, 'src/model/packets.ts'));
const { svgFontCss } = await load(path.join(projectRoot, 'src/templates/importedDesign/svgFonts.ts'));

/** AC-5's string, precomposed. */
const NAME = 'Åsa Öberg-Ærø Šimon Žáková'.normalize('NFC');
const points = new Map();
const codePointsOf = (file) => {
  if (!points.has(file)) points.set(file, woff2CodePoints(readFileSync(path.join(projectRoot, 'public/fonts', file))));
  return points.get(file);
};
/** The `@font-face` rules of a stylesheet, each with its file and range. */
const rules = (css) => [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
  family: /font-family:\s*"([^"]+)"/.exec(body)?.[1],
  file: /url\("fonts\/([^"]+)"\)/.exec(body)?.[1],
  range: /unicode-range:\s*([^;]+);/.exec(body)?.[1] ?? null,
}));
/** The file a letter sets in: the LAST rule whose range has it and whose file draws it. */
const fileFor = (faceRules, ch) => {
  const cp = ch.codePointAt(0);
  for (const r of [...faceRules].reverse()) {
    if (r.range && !inUnicodeRange(r.range, cp)) continue;
    if (codePointsOf(r.file).has(cp)) return r.file;
  }
  return null;
};

test('the parser reads a real cmap: Inter latin has A and å, and no Š', () => {
  const inter = codePointsOf('inter.woff2');
  assert.ok(inter.has(0x41) && inter.has(0xe5), 'A and å');
  assert.ok(!inter.has(0x160), 'the latin subset has no Š: the reason the second face exists');
  assert.ok(codePointsOf('inter-latin-ext.woff2').has(0x160), 'the latin-ext file has Š');
});

for (const font of FONTS) {
  test(`${font.family}: every letter of "${NAME}" sets in ${font.family}`, () => {
    const faceRules = rules(fontFaceCss(font));
    assert.ok(faceRules.every((r) => r.family === font.family));
    for (const r of faceRules) assert.ok(existsSync(path.join(projectRoot, 'public/fonts', r.file)), `public/fonts/${r.file} ships`);
    const missing = [...NAME].filter((ch) => ch !== ' ' && fileFor(faceRules, ch) === null);
    assert.deepEqual(missing, [], `${font.family} draws every letter itself`);
    assert.match(fileFor(faceRules, 'Š'), /-latin-ext\.woff2$/, 'Š comes from the latin-ext file');
    assert.equal(fileFor(faceRules, 'å'), font.file, 'å stays on the latin file');
  });
}

test('the label, supporting and imported-alias faces carry the latin-ext rule too', () => {
  const archivo = FONTS.find((f) => f.id === 'archivo');
  for (const css of [labelFontFaceCss(archivo), supportingFontFaceCss(archivo, 'why')]) {
    assert.ok(fileFor(rules(css), 'Ž')?.endsWith('-latin-ext.woff2'));
  }
  const alias = svgFontCss({ markup: '<svg/>', width: 960, height: 270, fields: [], images: [], outlines: [],
    fonts: [{ family: 'Archivo-Black', fontId: 'archivo', weight: 900 }] });
  const aliasRules = rules(alias);
  assert.deepEqual(aliasRules.map((r) => r.family), ['Archivo-Black', 'Archivo-Black']);
  assert.ok(fileFor(aliasRules, 'Ž')?.endsWith('-latin-ext.woff2'));
  assert.equal((alias.match(/font-weight: 900;/g) ?? []).length, 2, 'both rules keep the pinned weight');
});

test('a look that swaps the typeface replaces both rules of the old face', () => {
  const inter = FONTS.find((f) => f.id === 'inter');
  const template = {
    id: 't', name: 't', html: '<div></div>', js: '', assets: [], fields: [],
    css: `${fontFaceCss(inter)}\n\n:root { --font-heading: "Inter", Arial, sans-serif; }`,
  };
  const out = applyLookToTemplate(template, { palette: {}, fontId: 'archivo' });
  assert.ok(!out.css.includes('fonts/inter'), 'no Inter rule is left behind');
  assert.deepEqual(rules(out.css).map((r) => r.file), ['archivo.woff2', 'archivo-latin-ext.woff2']);
});
