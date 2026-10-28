// gate: build
// guards: src/model/fonts.ts, src/preview/composeDocument.ts, src/video/videoFonts.ts, scripts/packs/newsroom/look.mjs
//
// A GRAPHIC SAVED BEFORE THE FONT FIXES SETS Š AND Ž IN ITS OWN FACE AND DRAWS NO SYNTHESISED BOLD
// (issue #1746). #1744 gave every bundled face a second `@font-face` for its latin-ext file and
// #1745 widened a static face (Bebas Neue, Anton) and an imported one to 100-900, but only for CSS
// generated from then on. A graphic already in a library or a production pool keeps its old CSS,
// so `upgradeFontCss` brings it up to date where the CSS is used (the composed preview and output
// document, the render document, every export), never in the saved record. The fixtures below are
// the CSS the generators wrote before #1744, verbatim.
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
const { upgradeFontCss, ensureFontFace, fontById, fontFaceCss, labelFontFaceCss, supportingFontFaceCss, customFontFaceCss, LATIN_EXT_RANGE } = fonts;
const video = await load(path.join(projectRoot, 'src/video/videoFonts.ts'));

// ── Saved CSS from before #1744/#1745 (src/model/fonts.ts and svgFonts.ts at 044bcd95^) ──
const OLD_HEADING_BEBAS = `/* Bundled open-source font (the file ships with the export — no internet at playout). */
@font-face {
  font-family: "Bebas Neue";
  src: url("fonts/bebas-neue.woff2") format("woff2");
  font-weight: 400 400;  /* variable font: covers this weight range */
  font-display: swap;          /* show fallback text until the font loads */
}`;
const OLD_LABEL_MONO = `/* Design-owned label font (bundled OFL file — ships with the export, offline at playout).
   The Style panel's font picker swaps the heading face above; this one belongs to the design. */
@font-face {
  font-family: "JetBrains Mono";
  src: url("fonts/jetbrains-mono.woff2") format("woff2");
  font-weight: 400 700;  /* variable font: covers this weight range */
  font-display: swap;          /* show fallback text until the font loads */
}`;
const OLD_SUPPORTING_SAIRA = `/* Supporting face (bundled OFL file — ships with the export, offline at playout).
   The graphic's own typeface cannot hold a digit's width, so its live numbers are set in
   this one instead. Change --font-numeric below to overrule it. */
@font-face {
  font-family: "Saira";
  src: url("fonts/saira.woff2") format("woff2");
  font-weight: 400 900;  /* variable font: covers this weight range */
  font-display: swap;          /* show fallback text until the font loads */
}`;
const OLD_ALIAS_ANTON = `/* Bundled open-source font (the file ships with the export - no internet at playout).
   Declared as "Anton-Regular" because that is the name this artwork's own CSS asks for; the file is Anton. */
@font-face {
  font-family: "Anton-Regular";
  src: url("fonts/anton.woff2") format("woff2");
  font-weight: 400;            /* the name says this one weight, and the artwork states no other: pin the variable file to it */
  font-display: swap;          /* show fallback text until the font loads */
}`;
const OLD_IMPORTED = `/* Imported font (your file — embedded in the template and its export). */
@font-face {
  font-family: "Neue Machina";
  src: url("fonts/Neue-Machina.otf") format("opentype");
  font-display: swap;          /* show fallback text until the font loads */
  /* Single file: the browser synthesizes bold/italic. Add more @font-face rules
     with their own files for true weights. */
}`;
const BODY = `:root {
  --font-heading: "Bebas Neue", "Arial Narrow", Arial, sans-serif;
}
.title { font-family: var(--font-heading); font-weight: 700; }`;
const OLD_CSS = [OLD_SUPPORTING_SAIRA, OLD_HEADING_BEBAS, OLD_LABEL_MONO, OLD_ALIAS_ANTON, OLD_IMPORTED, BODY].join('\n\n');

const rules = (css) => [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
const rulesFor = (css, family) => rules(css).filter((r) => r.includes(`font-family: "${family}"`));

test('a saved bundled block gains its latin-ext twin under the same family, right after it', () => {
  const out = upgradeFontCss(OLD_CSS);
  for (const [family, id] of [['Bebas Neue', 'bebas-neue'], ['JetBrains Mono', 'jetbrains-mono'], ['Saira', 'saira'], ['Anton-Regular', 'anton']]) {
    const [latin, ext, ...more] = rulesFor(out, family);
    assert.equal(more.length, 0, `${family}: two rules, no more`);
    assert.match(latin, new RegExp(`fonts/${id}\\.woff2`), `${family}: the latin rule stays first`);
    assert.match(ext, new RegExp(`fonts/${id}-latin-ext\\.woff2`), `${family}: the twin names the latin-ext file`);
    assert.ok(ext.includes(`unicode-range: ${LATIN_EXT_RANGE};`), `${family}: the twin is limited to latin-ext`);
    assert.equal(/font-weight:[^;]*;/.exec(ext)[0], /font-weight:[^;]*;/.exec(latin)[0], `${family}: the twin declares the latin rule's weight`);
    assert.ok(out.indexOf(ext) > out.indexOf(latin), `${family}: declared after the latin rule`);
  }
  assert.equal(rulesFor(out, 'JetBrains Mono')[1].match(/font-weight:\s*([^;]*);/)[1], '400 700', 'a variable face keeps its range');
});

test('a static bundled face, its alias included, widens to 100-900; a variable one is left alone', () => {
  const out = upgradeFontCss(OLD_CSS);
  for (const family of ['Bebas Neue', 'Anton-Regular']) {
    for (const rule of rulesFor(out, family)) assert.match(rule, /font-weight: 100 900;/, `${family}: no synthesised bold`);
  }
  assert.match(rulesFor(out, 'Saira')[0], /font-weight: 400 900;/);
  assert.ok(!out.includes('400 400'), 'no static face keeps its one-weight range');
});

test('an imported block that declares no weight gains 100-900, and its note stops promising a synthesised bold', () => {
  const [rule] = rulesFor(upgradeFontCss(OLD_CSS), 'Neue Machina');
  assert.match(rule, /src: url\("fonts\/Neue-Machina\.otf"\) format\("opentype"\);\n {2}font-weight: 100 900;/);
  assert.ok(!rule.includes('synthesizes'), rule);
  assert.equal(rulesFor(upgradeFontCss(OLD_CSS), 'Neue Machina').length, 1, 'an imported file has no latin-ext twin to add');
});

test('the upgrade is idempotent, leaves the rest of the stylesheet as it was, and passes new CSS through unchanged', () => {
  const once = upgradeFontCss(OLD_CSS);
  assert.equal(upgradeFontCss(once), once, 'twice gives the same CSS as once');
  assert.ok(once.endsWith(BODY), 'the rules after the faces are untouched');
  const custom = { family: 'Neue Machina', format: 'opentype', asset: { path: 'fonts/Neue-Machina.otf', data: '' } };
  const current = [
    fontFaceCss(fontById('bebas-neue')),
    labelFontFaceCss(fontById('jetbrains-mono')),
    supportingFontFaceCss(fontById('saira'), 'why'),
    fontFaceCss(fontById('anton')),
    fontFaceCss(fontById('inter')),
    customFontFaceCss(custom),
    BODY,
  ].join('\n\n');
  assert.equal(upgradeFontCss(current), current, 'CSS the generators write today is already current');
});

test('a hand-written face gets no twin; a static one is still widened, on one line as on several', () => {
  const hand = `@font-face { font-family: "Mine"; src: url("fonts/inter.woff2") format("woff2"); font-weight: 400 800; }`;
  assert.equal(upgradeFontCss(hand), hand);
  const oneLine = `@font-face { font-family: "Shout"; src: url("fonts/anton.woff2") format("woff2"); font-weight: 400; }`;
  const out = upgradeFontCss(oneLine);
  assert.match(out, /font-weight: 100 900;/);
  assert.equal(rules(out).length, 1, 'still one rule');
  assert.equal(upgradeFontCss(out), out);
});

test('an imported block whose src spans lines gains its weight after the whole declaration', () => {
  const split = OLD_IMPORTED.replace('src: url("fonts/Neue-Machina.otf") format("opentype");', 'src: url("fonts/Neue-Machina.otf")\n       format("opentype");');
  const [rule] = rules(upgradeFontCss(split));
  assert.match(rule, /format\("opentype"\);\n {2}font-weight: 100 900;/);
});

test('a saved block written on one line, or with a single-quoted family, still gains its twin at its own weight', () => {
  const block = `/* Bundled open-source font (the file ships with the export). */\n@font-face { font-family: 'Archivo-Black'; src: url("fonts/archivo.woff2") format("woff2"); font-weight: 900; font-display: swap; }`;
  const out = upgradeFontCss(block);
  const [, ext] = rules(out);
  assert.ok(ext && ext.includes('fonts/archivo-latin-ext.woff2') && ext.includes('"Archivo-Black"'), out);
  assert.match(ext, /font-weight: 900;/, 'the pinned weight is carried over');
  assert.equal(upgradeFontCss(out), out);
});

test('an imported block embedded as a data URL (a single-file export read back) keeps its src whole', () => {
  for (const src of ['url("data:font/otf;base64,AAEAAA==")', 'url(data:font/otf;base64,AAEAAA==)']) {
    const embedded = OLD_IMPORTED.replace('url("fonts/Neue-Machina.otf")', src);
    const [rule] = rules(upgradeFontCss(embedded));
    assert.ok(rule.includes(`src: ${src} format("opentype");\n  font-weight: 100 900;`), rule);
  }
});

test('an imported block written on one line gains its weight too', () => {
  const oneLine = `/* Imported font (your file). */\n@font-face { font-family: "Mine"; src: url("fonts/Mine.otf") format("opentype"); font-display: swap; }`;
  const out = upgradeFontCss(oneLine);
  assert.match(rules(out)[0], /format\("opentype"\);\n {2}font-weight: 100 900;/);
  assert.equal(upgradeFontCss(out), out);
});

test('a long, unterminated src is scanned in linear time', () => {
  const css = `/* Imported font (your file). */\n@font-face { font-family: "Mine"; src: ${'url()'.repeat(50000)} }`;
  const started = performance.now();
  assert.equal(upgradeFontCss(css), css, 'no terminating semicolon: left as it was');
  assert.ok(performance.now() - started < 1000);
});

test('an imported family the stylesheet also gives weighted files keeps its weight-less rule', () => {
  const bold = `@font-face {
  font-family: "Neue Machina";
  src: url("fonts/Neue-Machina-Bold.otf") format("opentype");
  font-weight: 700;
}`;
  const css = `${OLD_IMPORTED}\n${bold}`;
  assert.equal(upgradeFontCss(css), css, 'the Bold file keeps the heavy requests');
});

test('ensureFontFace counts both files, and leaves a saved block the use-time upgrade completes as it is', () => {
  const saira = fontById('saira');
  assert.equal(ensureFontFace(OLD_SUPPORTING_SAIRA, saira), OLD_SUPPORTING_SAIRA, 'no saved-record rewrite');
  const current = supportingFontFaceCss(saira, 'why');
  assert.equal(ensureFontFace(current, saira), current);
  // A hand-written rule with the latin file alone: the upgrade cannot complete it, so the face's
  // own block, with both files, is added (before #1746 this counted as shipped).
  const hand = `@font-face { font-family: "Saira"; src: url("fonts/saira.woff2") format("woff2"); }`;
  const out = ensureFontFace(hand, saira);
  assert.ok(out.includes('fonts/saira-latin-ext.woff2') && out.endsWith(hand));
});

test('the newsroom pack declares Outfit exactly as the generator does', async () => {
  const look = await import(new URL('./packs/newsroom/look.mjs', import.meta.url).href);
  assert.equal(look.FONT_FACE_CSS, fontFaceCss(fontById('outfit')));
});

test('the composed document carries the upgrade; the saved template is not touched', async () => {
  const { composeDocument } = await load(path.join(projectRoot, 'src/preview/composeDocument.ts'));
  const template = {
    name: 'saved', html: '<div class="title">Šimon Žáková</div>', css: OLD_CSS, js: '', assets: [], fields: [],
    settings: {}, resolution: { width: 1920, height: 1080 },
  };
  const html = composeDocument(template);
  assert.ok(html.includes('fonts/bebas-neue-latin-ext.woff2'), 'the twin reaches the document');
  assert.ok(!html.includes('400 400'), 'the widened weight reaches the document');
  assert.equal(template.css, OLD_CSS, 'the saved CSS is left as it was');
});

test('the video faces declare the latin-ext file too', () => {
  assert.equal(video.LATIN_EXT_RANGE, LATIN_EXT_RANGE, 'the video world carries the same range');
  const css = video.videoFontFaceCss((f) => `fonts/${f}`);
  const bebas = css.match(/@font-face \{[^}]*"Bebas Neue"[^}]*\}/g);
  assert.ok(bebas.length === 2 && bebas.every((r) => r.includes('font-weight: 100 900;')), 'a static video face draws no synthesised bold');
  assert.ok(!video.videoFontFaceCss((f) => (f.includes('latin-ext') ? '' : `fonts/${f}`)).includes('url("")'), 'a missing latin-ext file is left out');
  for (const f of video.VIDEO_FONTS) {
    const ext = f.file.replace(/\.woff2$/, '-latin-ext.woff2');
    assert.ok(css.includes(`url("fonts/${ext}")`), `${f.family}: latin-ext declared`);
    assert.equal(fontById(f.file.replace(/\.woff2$/, '')).file, f.file, `${f.family}: mirrors model/fonts.ts`);
  }
});
