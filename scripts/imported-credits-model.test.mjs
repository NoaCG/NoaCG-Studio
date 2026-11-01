// needs: browser
// guards: src/templates/importedDesign/creditsRoll.ts
// guards: src/templates/importedDesign/designTypes.ts
// guards: src/templates/behaviours/credits.ts
//
// IMPORTED CREDITS IN THE ARTWORK'S OWN STYLING: the model (jev-svg-import row 16, AC-13).
//
// The designer draws a few roles and names as separate text layers; `analyseCreditsStyle` reads
// the repeated role and name looks, the layout (role above or beside its names), the alignment and
// the spacing, with each layer as a stable source anchor, and turns the sample into ONE list in the
// native credits format. A drawing it cannot describe is refused by name and stays the artwork it
// is; nothing is converted to a catalog design. `validateCreditsBinding` checks a saved binding
// against the markup, and the saved editable and original-artwork credits must build exactly as
// they did before any of this existed (the pins below).
//
// No dev server: the modules are bundled onto one blank Chromium page, because reading SVG needs
// a real DOM (scripts/catalog-emit.mjs explains why). `CREDITS_SRC=<tree>/src/` builds the pins
// from another checkout, which is how they were taken on main.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hash, withBundledPage } from './catalog-emit.mjs';

const SRC = process.env.CREDITS_SRC ?? fileURLToPath(new URL('../src/', import.meta.url));
const fixture = (rel) => readFileSync(fileURLToPath(new URL(`../e2e/fixtures/${rel}`, import.meta.url)), 'utf8');
const EXPECT = JSON.parse(fixture('jev-svg/dev.expect.json'));
const DEV = ['credits-1', 'credits-2', 'credits-3'].map((id) => {
  const design = EXPECT.designs.find((d) => d.id === id);
  return { id, markup: fixture(`jev-svg/${design.svg}`), expected: design.expected };
});
const LEGACY = fixture('credits-roll.svg');
const ARTWORK = fixture('credits-artwork.svg');

const svg = (body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800" font-family="sans-serif" fill="#fff"${extra}>${body}</svg>`;
const t = (x, y, size, text, more = '') => `<text x="${x}" y="${y}" font-size="${size}"${more}>${text}</text>`;
/** Synthetic drawings, each with every text layer chosen as an anchor. */
const CASES = {
  // A whole block turned as one: the shared angle is undone, so it reads as drawn.
  turned: svg(`<g transform="translate(100 100) rotate(-8)">${t(0, 0, 24, 'Design', ' fill="#fc0"')}${t(0, 60, 40, 'Jun Harbor')}${t(0, 110, 40, 'Ida Lake')}${t(0, 230, 24, 'Music', ' fill="#fc0"')}${t(0, 290, 40, 'Sol Reed')}</g>`),
  // Illustrator's centring: no text-anchor, each line its own x. Only drawn widths show it.
  centred: svg(`${t(0, 100, 24, 'Camera', ' fill="#fc0"')}${t(0, 160, 40, 'Jonas Bergström')}${t(0, 210, 40, 'Lena Fors')}`),
  // Zero, one and several names: a role with none stays in the list.
  zero: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 260, 24, 'Producer', ' fill="#fc0"')}${t(100, 360, 24, 'Editor', ' fill="#fc0"')}${t(100, 420, 40, 'Mia Holt')}${t(100, 470, 40, 'Ola Berg')}`),
  // The anchor stated by a stylesheet class, and a run's own x drawn over the text's.
  classed: svg(`<style>.c{text-anchor:middle}</style>${t(500, 100, 24, 'Camera', ' fill="#fc0" class="c"')}${t(500, 160, 40, 'Jonas Berg', ' class="c"')}${t(500, 210, 40, 'Lena Fors', ' class="c"')}`),
  runX: svg(`<text x="50" y="0" font-size="24" fill="#fc0"><tspan x="300" y="100">Camera</tspan></text><text x="0" y="0" font-size="40"><tspan x="300" y="160">Jonas Berg</tspan></text>`),
  // Positions stated as relative steps, in units and in ems (Inkscape writes them).
  // A run's own step replaces the text's for the first character; the two are never summed. The
  // role's run states x and dx, so the text's dx is not used; the second name's run states dy.
  steps: svg(`<text x="50" y="100" dx="30" font-size="24" fill="#fc0"><tspan x="100" dx="0">Director</tspan></text><text x="100" y="100" font-size="40"><tspan dy="60">Alex Rivera</tspan></text><text x="100" y="100" font-size="40" dy="1em"><tspan dy="2.75em">Ida Lake</tspan></text>`),
  // Roles set apart by paint alone: half-transparent fill, same size and colour.
  paint: svg(`${t(100, 100, 40, 'Director', ' fill-opacity="0.5"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 260, 40, 'Sound', ' fill-opacity="0.5"')}${t(100, 320, 40, 'Ari Moss')}`),
  // One name look spelt by two classes that set the same values.
  twoSpellings: svg(`<style>.a{fill:#fff}.b{fill:#fff}</style>${t(100, 100, 24, 'Cast', ' fill="#fc0"')}${t(100, 160, 40, 'Ada Holm', ' class="a"')}${t(100, 210, 40, 'Bo Lind', ' class="b"')}`),
  oneLook: svg(`${t(100, 100, 40, 'Director')}${t(100, 160, 40, 'Alex Rivera')}`),
  manyLooks: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 220, 40, 'Ida Lake', ' fill="#f00"')}`),
  sideBySide: svg(`${t(100, 100, 24, 'Cast', ' fill="#fc0"')}${t(100, 160, 40, 'Ada')}${t(400, 160, 40, 'Bo')}`),
  mixed: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(400, 100, 40, 'Alex Rivera')}${t(100, 220, 24, 'Sound', ' fill="#fc0"')}${t(100, 280, 40, 'Ari Moss')}`),
  misaligned: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(160, 160, 40, 'Alex Rivera')}`),
  format: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Note: Alex')}`),
  tooFew: svg(t(100, 100, 24, 'Director')),
};

/** Runs in the browser: every answer the tests below read, from one page. */
async function inPage({ dev, cases, legacy, artwork }) {
  const { NOACG_SVG: R, NOACG_IMPORTED: I, NOACG_ROLL: C } = window;
  const imported = (markup) => R.importSvgMarkup(markup);
  const parsed = (markup) => new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  const laidOut = (markup) => {
    const host = document.createElement('div');
    host.innerHTML = markup;
    document.body.appendChild(host);
    return host.firstElementChild;
  };
  const fieldsOf = (imp) => imp.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
  const base = (imp, behaviour) => ({ markup: imp.markup, width: imp.width, height: imp.height, fields: fieldsOf(imp), images: [], outlines: [], fonts: [], ...(behaviour ? { behaviour } : {}) });
  // The html as a tree: elements, their attributes sorted, and text. Namespace declarations are
  // left out because Chromium builds order them differently when serializing the inlined SVG
  // (the corpus records' html moves between the pinned and newer builds; css and js do not).
  const canonical = (node) => {
    if (node.nodeType === 3) return JSON.stringify(node.nodeValue);
    if (node.nodeType === 8) return `<!--${node.nodeValue}-->`;
    if (node.nodeType !== 1) return '';
    const attrs = [...node.attributes].filter((a) => a.name !== 'xmlns' && !a.name.startsWith('xmlns:')).map((a) => `${a.name}=${JSON.stringify(a.value)}`).sort();
    return `<${node.localName} ${attrs.join(' ')}>${[...node.childNodes].map(canonical).join('')}</${node.localName}>`;
  };
  const build = (designSvg) => {
    const tpl = I.IMPORTED_SVG.create({ designSvg });
    return { html: canonical(new DOMParser().parseFromString(tpl.html, 'text/html').documentElement), css: tpl.css, js: tpl.js, fields: tpl.fields };
  };

  // Pins: what saved credits and plain imports build today.
  const legacyImp = imported(legacy);
  const credits = legacyImp.candidates.findIndex((c) => c.label === 'Credits');
  const box = legacyImp.shapes.find((s) => /box/i.test(s.label))?.id;
  const artImp = imported(artwork);
  const pins = {
    editable: build(base(legacyImp, { kind: 'recipe', recipe: 'credits', layers: box ? { box } : {}, fields: { credits } })),
    artwork: build(base(artImp, { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: artImp.candidates.findIndex((c) => c.label === 'Programme text') }, options: { artwork: true } })),
    ...Object.fromEntries(dev.map((d) => [`fixed:${d.id}`, build(base(imported(d.markup)))])),
  };
  if (!C || typeof C.analyseCreditsStyle !== 'function') return { pins };

  const parser = new Function(`${window.NOACG_PARSER.CREDITS_PARSER_JS}\nreturn parseCredits;`)();
  const parse = (list) => parser(list, (s) => s);
  const analyse = (markup, root, pick) => {
    const imp = imported(markup);
    const ids = pick ? pick(imp) : imp.candidates.map((c) => c.id);
    const doc = root(imp.markup);
    const readings = C.readCreditsAnchors(doc, ids);
    const out = C.analyseCreditsStyle(readings, ids);
    return { ids, samples: Object.fromEntries(imp.candidates.map((c) => [c.id, c.sample])), out, parsed: out.ok ? parse(out.style.list) : null };
  };
  // A dev fixture's anchors are the layers its expectation names, matched by their drawn words.
  const devPick = (d) => (imp) => d.expected.fields[0].source_anchors.map((a) => imp.candidates.find((c) => c.sample === a.default).id);
  const devResults = Object.fromEntries(dev.map((d) => [d.id, {
    parsed: analyse(d.markup, parsed, devPick(d)),
    laid: analyse(d.markup, laidOut, devPick(d)),
  }]));
  // Centre the `centred` case as Illustrator does: each line's own x, half its drawn width left of
  // the middle, and no text-anchor stated anywhere.
  const centre = (markup) => {
    const el = laidOut(markup);
    for (const text of el.querySelectorAll('text')) text.setAttribute('x', String(500 - text.getComputedTextLength() / 2));
    const out = el.outerHTML;
    el.parentElement.remove();
    return out;
  };
  const caseMarkup = { ...cases, centred: centre(cases.centred) };
  const caseResults = Object.fromEntries(Object.entries(caseMarkup).map(([k, m]) => [k, { parsed: analyse(m, parsed), laid: analyse(m, laidOut) }]));
  // One layer drawing several lines: the editable roll's own sample.
  const severalIds = [legacyImp.candidates[credits].id, legacyImp.candidates.find((c, i) => i !== credits).id];
  const several = C.analyseCreditsStyle(C.readCreditsAnchors(parsed(legacyImp.markup), severalIds), severalIds);
  const unknown = C.analyseCreditsStyle(C.readCreditsAnchors(parsed(legacyImp.markup), ['t0', 'nope']), ['t0', 'nope']);

  // Bindings: the credits-1 drawing, its first role layer carrying the one content field.
  const d1 = dev[0];
  const imp1 = imported(d1.markup);
  const a1 = analyse(d1.markup, parsed, devPick(d1)).out.style;
  const contentId = a1.anchors[0].candidateId;
  const fields1 = fieldsOf(imp1).filter((f) => f.candidateId === contentId);
  const binding = (credits, extra = {}) => ({
    markup: imp1.markup, width: imp1.width, height: imp1.height, fields: fields1, images: [], outlines: [], fonts: [],
    behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, credits, ...extra },
  });
  const good = { v: 1, layout: 'role-above', playback: 'roll', anchors: a1.anchors };
  const check = (svg) => C.validateCreditsBinding(svg);
  const validation = {
    good: check(binding(good)),
    cards: check(binding({ ...good, playback: 'cards' })),
    cards2: check(binding({ ...good, playback: 'cards', advance: 2 })),
    cards60: check(binding({ ...good, playback: 'cards', advance: 60 })),
    cards1: check(binding({ ...good, playback: 'cards', advance: 1.9 })),
    cards61: check(binding({ ...good, playback: 'cards', advance: 61 })),
    cardsNaN: check(binding({ ...good, playback: 'cards', advance: Number.NaN })),
    rollTimed: check(binding({ ...good, advance: 5 })),
    playback: check(binding({ ...good, playback: 'loop' })),
    layout: check(binding({ ...good, layout: 'columns' })),
    version: check(binding({ ...good, v: 2 })),
    artwork: check(binding(good, { options: { artwork: true } })),
    staleLayout: check(binding({ ...good, layout: 'role-beside' })),
    staleAnchors: check(binding({ ...good, anchors: good.anchors.map((x, i) => (i === 1 ? { ...x, kind: 'role' } : x)) })),
    reordered: check(binding({ ...good, anchors: [...good.anchors].reverse() })),
    unknown: check(binding({ ...good, anchors: [...good.anchors, { candidateId: 'zz', kind: 'name' }] })),
    duplicate: check(binding({ ...good, anchors: [...good.anchors, good.anchors[1]] })),
    perName: check({ ...binding(good), fields: fieldsOf(imp1).filter((f) => a1.anchors.some((x) => x.candidateId === f.candidateId)) }),
    noContent: check({ ...binding(good), behaviour: { ...binding(good).behaviour, fields: {} } }),
    unsupported: (() => {
      const d3 = dev[2];
      const imp3 = imported(d3.markup);
      const ids = devPick(d3)(imp3);
      return C.validateCreditsBinding({ ...base(imp3), fields: fieldsOf(imp3).filter((f) => f.candidateId === ids[0]), behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, credits: { v: 1, layout: 'role-above', playback: 'static', anchors: ids.map((candidateId, i) => ({ candidateId, kind: i % 2 ? 'name' : 'role' })) } } });
    })(),
    plain: C.validateCreditsBinding(base(imp1)),
  };
  // Reading never rewrites the designer's transforms.
  const turnedRoot = parsed(imported(cases.turned).markup);
  const before = [...turnedRoot.querySelectorAll('[transform]')].map((el) => el.getAttribute('transform'));
  C.readCreditsAnchors(turnedRoot, imported(cases.turned).candidates.map((c) => c.id));
  const after = [...turnedRoot.querySelectorAll('[transform]')].map((el) => el.getAttribute('transform'));
  // A saved binding of Illustrator-style centring validates without a root: it is laid out.
  const centredImp = imported(caseMarkup.centred);
  const centredStyle = analyse(caseMarkup.centred, laidOut).out.style;
  const centredFields = fieldsOf(centredImp).filter((f) => f.candidateId === centredStyle.anchors[0].candidateId);
  const centredCheck = C.validateCreditsBinding({ ...base(centredImp), fields: centredFields, behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, credits: { v: 1, layout: centredStyle.layout, playback: 'static', anchors: centredStyle.anchors } } });
  // A run inside a name layer carrying its own id is still that name's layer.
  const nameId = good.anchors[1].candidateId;
  const runMarkup = imp1.markup.replace(new RegExp(`(<text[^>]*data-noacg-candidate="${nameId}"[^>]*>)([^<]*)<`), '$1<tspan data-noacg-candidate="run9">$2</tspan><');
  const runBinding = (credits, extraFields = []) => ({ ...binding(credits), markup: runMarkup, fields: [...fields1, ...extraFields] });
  const run = {
    perName: C.validateCreditsBinding(runBinding(good, [{ candidateId: 'run9', title: 'x', sample: 'x', numeric: false }])),
    duplicate: C.validateCreditsBinding(runBinding({ ...good, anchors: [...good.anchors, { candidateId: 'run9', kind: 'name' }] })),
    markupChanged: runMarkup !== imp1.markup,
  };
  const engine = {
    none: C.creditsEngine(base(imp1)),
    quiz: C.creditsEngine(base(imp1, { kind: 'recipe', recipe: 'meter', layers: {} })),
    editable: C.creditsEngine(base(imp1, { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 } })),
    artwork: C.creditsEngine(base(imp1, { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, options: { artwork: true } })),
    styled: C.creditsEngine(binding(good)),
    both: C.creditsEngine(binding(good, { options: { artwork: true } })),
  };
  return {
    pins,
    devResults,
    caseResults,
    several,
    unknown,
    validation,
    engine,
    transforms: { before, after },
    centredCheck,
    run,
    overflow: C.CREDITS_OVERFLOW,
    constants: { layouts: window.NOACG_RECIPE.CREDITS_LAYOUTS, playbacks: window.NOACG_RECIPE.CREDITS_PLAYBACKS, seconds: window.NOACG_RECIPE.CREDITS_CARD_SECONDS },
    intent: window.NOACG_CONTRACT.SVG_INTENT.credits,
  };
}

const R = await withBundledPage(
  [
    ['assets/svgImport.ts', 'NOACG_SVG'],
    ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
    ['templates/importedDesign/creditsRoll.ts', 'NOACG_ROLL'],
    ['templates/endCredits/shared.ts', 'NOACG_PARSER'],
    ['templates/behaviours/credits.ts', 'NOACG_RECIPE'],
    ['ai/svgInterpretation/contract.ts', 'NOACG_CONTRACT'],
  ].map(([rel, globalName]) => ({ entry: `${SRC}${rel}`, globalName })),
  (page) => page.evaluate(inPage, { dev: DEV, cases: CASES, legacy: LEGACY, artwork: ARTWORK }),
);

const sha = (o) => hash(JSON.stringify(o));

/** Taken on main e680acd1 before this row, and equal on this branch: saved editable and original-
 *  artwork credits, and each dev drawing imported as plain artwork, build byte for byte as before. */
const PINS = {
  editable: '0c878096aa7d0a8b',
  artwork: '68a2d80cedb3ac53',
  'fixed:credits-1': '82aa9a1f71492d37',
  'fixed:credits-2': 'f8df6ae2dc07db8f',
  'fixed:credits-3': 'f6535d6218476819',
};

if (process.env.CREDITS_PRINT_PINS) console.log(JSON.stringify(Object.fromEntries(Object.entries(R.pins).map(([k, v]) => [k, sha(v)]))));

test('saved editable and original-artwork credits, and plain imports, build exactly as before', () => {
  for (const [k, pin] of Object.entries(PINS)) assert.equal(sha(R.pins[k]), pin, k);
  // The editable roll still has its one list field; the artwork roll offers no list to type.
  assert.ok(R.pins.editable.js.includes('function noacgCreditsRoll()'));
  assert.ok(R.pins.artwork.js.includes('function stopCreditsRoll()'));
});

const content = (expected) => expected.fields[0].content;
const asContent = (sections) => sections.flat().map((e) => ({ role: e.role, names: e.names }));

test('role above: repeated looks, multiple names and spacing read off credits-1', () => {
  for (const mode of ['parsed', 'laid']) {
    const { out, parsed, ids } = R.devResults['credits-1'][mode];
    assert.equal(out.ok, true, `${mode}: ${out.message}`);
    assert.equal(out.style.layout, 'role-above');
    assert.deepEqual(out.style.anchors.map((a) => a.kind), ['role', 'name', 'name', 'role', 'name']);
    assert.deepEqual(out.style.anchors.map((a) => a.candidateId), ids, 'anchors are the chosen layers in reading order');
    assert.deepEqual(out.style.align, { role: 'middle', name: 'middle' });
    assert.deepEqual(out.style.steps, { roleToName: 65, nameToName: 55, groupGap: 150 });
    assert.equal(out.style.list, 'Research:\nNia Vale\nTomas Fen\nSound:\nAri Moss');
    assert.deepEqual(asContent(parsed), content(DEV[0].expected), 'the list reads back as the expected content');
  }
});

test('role beside: a role column and a name column read off credits-2, multilingual', () => {
  for (const mode of ['parsed', 'laid']) {
    const { out, parsed } = R.devResults['credits-2'][mode];
    assert.equal(out.ok, true, `${mode}: ${out.message}`);
    assert.equal(out.style.layout, 'role-beside');
    assert.deepEqual(out.style.anchors.map((a) => a.kind), ['role', 'name', 'role', 'name', 'name']);
    assert.deepEqual(out.style.align, { role: 'start', name: 'start' });
    assert.deepEqual(out.style.steps, { nameToName: 55, groupGap: 170, column: 350 });
    assert.deepEqual(asContent(parsed), content(DEV[1].expected));
  }
});

test('islands at different angles are refused by name and stay artwork (credits-3)', () => {
  for (const mode of ['parsed', 'laid']) {
    const { out, ids } = R.devResults['credits-3'][mode];
    assert.equal(out.ok, false);
    assert.equal(out.code, 'mixed-angles');
    assert.equal(out.fallback, 'artwork');
    assert.ok(out.anchors.length > 0 && out.anchors.every((id) => ids.includes(id)));
    assert.deepEqual(Object.keys(out).sort(), ['anchors', 'code', 'fallback', 'message', 'ok'], 'no preset or catalog design is offered');
  }
  assert.ok(DEV[2].expected.unsupported.length > 0, 'the fixture itself declares the pattern unsupported');
});

test('a block turned as a whole reads as drawn', () => {
  const { out } = R.caseResults.turned.parsed;
  assert.equal(out.ok, true, out.message);
  assert.equal(out.style.layout, 'role-above');
  assert.deepEqual(out.style.steps, { roleToName: 60, nameToName: 50, groupGap: 120 });
  assert.equal(out.style.list, 'Design:\nJun Harbor\nIda Lake\nMusic:\nSol Reed');
});

test('centring drawn without a text-anchor needs the laid-out widths', () => {
  assert.equal(R.caseResults.centred.parsed.out.code, 'misaligned', 'without widths it is not guessed');
  const { out } = R.caseResults.centred.laid;
  assert.equal(out.ok, true, out.message);
  assert.deepEqual(out.style.align, { role: 'middle', name: 'middle' });
});

test('zero, one and several names per role keep their order in the one list', () => {
  const { out, parsed } = R.caseResults.zero.parsed;
  assert.equal(out.ok, true, out.message);
  assert.equal(out.style.list, 'Director:\nAlex Rivera\nProducer:\nEditor:\nMia Holt\nOla Berg');
  assert.deepEqual(asContent(parsed), [
    { role: 'Director', names: ['Alex Rivera'] },
    { role: 'Producer', names: [] },
    { role: 'Editor', names: ['Mia Holt', 'Ola Berg'] },
  ]);
});

test('every pattern no one style describes is refused by name, never converted', () => {
  const want = {
    oneLook: 'one-look',
    manyLooks: 'many-looks',
    sideBySide: 'side-by-side',
    mixed: 'mixed-layout',
    misaligned: 'misaligned',
    format: 'not-list-format',
    tooFew: 'too-few',
  };
  for (const [k, code] of Object.entries(want)) {
    for (const mode of ['parsed', 'laid']) {
      const { out } = R.caseResults[k][mode];
      assert.equal(out.ok, false, `${k} ${mode}`);
      assert.equal(out.code, code, `${k} ${mode}: ${out.message}`);
      assert.equal(out.fallback, 'artwork');
    }
  }
  assert.equal(R.several.code, 'several-lines', 'the editable roll\'s one-layer sample is not this model');
  assert.equal(R.unknown.code, 'unknown-anchor');
  assert.deepEqual(R.unknown.anchors, ['nope']);
});

test('a saved binding is checked whole against the markup', () => {
  const v = R.validation;
  assert.deepEqual(v.good, []);
  assert.deepEqual(v.cards, [], 'cards default to the operator\'s Next');
  assert.deepEqual(v.cards2, []);
  assert.deepEqual(v.cards60, []);
  const has = (list, code) => assert.ok(list.some((e) => e.startsWith(`${code}:`)), `${code} in ${JSON.stringify(list)}`);
  for (const k of ['cards1', 'cards61', 'cardsNaN', 'rollTimed']) has(v[k], 'invalid-advance');
  has(v.playback, 'invalid-playback');
  has(v.layout, 'invalid-layout');
  has(v.version, 'unknown-version');
  has(v.artwork, 'conflicting-engine');
  has(v.staleLayout, 'stale-layout');
  has(v.staleAnchors, 'stale-anchors');
  has(v.reordered, 'stale-anchors');
  has(v.unknown, 'unknown-anchor');
  has(v.duplicate, 'duplicate-anchor');
  has(v.perName, 'field-per-name');
  has(v.noContent, 'no-content-field');
  has(v.unsupported, 'mixed-angles');
  assert.deepEqual(v.plain, [], 'a design without a styled binding has nothing to check');
});

test('reading leaves the designer\'s transforms as they are', () => {
  assert.ok(R.transforms.before.length > 0);
  assert.deepEqual(R.transforms.after, R.transforms.before);
});

test('a stylesheet anchor and a run\'s own position are read as drawn', () => {
  const classed = R.caseResults.classed.laid.out;
  assert.equal(classed.ok, true, classed.message);
  assert.deepEqual(classed.style.align, { role: 'middle', name: 'middle' });
  const runX = R.caseResults.runX.parsed.out;
  assert.equal(runX.ok, true, runX.message);
  assert.deepEqual(runX.style.steps, { roleToName: 60 });
});

test('two class spellings of one look are one look once laid out', () => {
  const { out } = R.caseResults.twoSpellings.laid;
  assert.equal(out.ok, true, out.message);
  assert.deepEqual(out.style.anchors.map((a) => a.kind), ['role', 'name', 'name']);
  assert.equal(R.caseResults.twoSpellings.parsed.out.code, 'many-looks', 'parsed, a class is all there is to compare');
});

test('relative steps are read as SVG draws them: the nearest one, never summed', () => {
  // Laid out, the position is the browser's own; the parsed reading must agree with it.
  for (const mode of ['parsed', 'laid']) {
    const { out } = R.caseResults.steps[mode];
    assert.equal(out.ok, true, `${mode}: ${out.message}`);
    assert.equal(out.style.layout, 'role-above');
    assert.deepEqual(out.style.align, { role: 'start', name: 'start' });
    assert.deepEqual(out.style.steps, { roleToName: 60, nameToName: 50 });
  }
  for (const k of Object.keys(R.caseResults)) {
    const { parsed, laid } = R.caseResults[k];
    if (parsed.out.ok && laid.out.ok) assert.deepEqual(parsed.out.style.steps, laid.out.style.steps, `${k}: parsed and laid-out steps agree`);
  }
});

test('paint opacity alone sets a look apart', () => {
  for (const mode of ['parsed', 'laid']) {
    const { out } = R.caseResults.paint[mode];
    assert.equal(out.ok, true, `${mode}: ${out.message}`);
    assert.deepEqual(out.style.anchors.map((a) => a.kind), ['role', 'name', 'role', 'name']);
  }
});

test('a saved centred binding validates on its own, laid out', () => {
  assert.deepEqual(R.centredCheck, []);
});

test('a run inside an anchor layer counts as that layer', () => {
  assert.ok(R.run.markupChanged);
  assert.ok(R.run.perName.some((e) => e.startsWith('field-per-name:')), JSON.stringify(R.run.perName));
  assert.ok(R.run.duplicate.some((e) => e.startsWith('duplicate-anchor:')), JSON.stringify(R.run.duplicate));
});

test('one engine per design: styled, original artwork or editable, never two', () => {
  // Carrying both is refused by validation; the engine answer is the one the assembler builds.
  assert.deepEqual(R.engine, { none: null, quiz: null, editable: 'editable', artwork: 'artwork', styled: 'styled', both: 'artwork' });
});

test('overflow is defined for every playback and never drops, clips or switches', () => {
  assert.deepEqual(R.overflow, {
    roll: { wide: 'shrink-report', tall: 'run-through' },
    static: { wide: 'shrink-report', tall: 'shrink-then-refuse' },
    cards: { wide: 'shrink-report', tall: 'next-card' },
  });
});

test('the model spells layout and playback as the proposal contract does', () => {
  const values = (key) => R.intent[key].filter((v) => v !== 'default' && v !== 'unresolved');
  assert.deepEqual(R.constants.layouts, values('layout'));
  assert.deepEqual(R.constants.playbacks, values('playback'));
  assert.deepEqual(R.constants.seconds, { min: 2, max: 60 });
});
