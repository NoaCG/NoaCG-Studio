// gate: factory
// needs: browser
// guards: src/assets/svgImport.ts, src/templates/importedDesign/**, src/templates/behaviours/**, src/components/wizard/import/**, src/components/wizard/CreationWizard.tsx, public/fonts/**, src/preview/composeDocument.ts, src/model/fonts.ts, src/validation/**, e2e/fixtures/svg-corpus/**, scripts/fixtures/svg-corpus-passes.json, scripts/ladder-values.mjs
//
// EVERY CORPUS FILE THROUGH EVERY PASS OF THE SVG IMPORT, IN ONE BLANK PAGE, AGAINST A RECORD.
//
// The import engine (docs/SVG_IMPORT_PLAN.md) is about to be moved into named files in phases
// that must change nothing (docs/work-specs/svg-import-engine/spec.md). The wizard walk proves a
// rung in five minutes and says little about which pass moved; this runs the 49 real exporter
// files in `e2e/fixtures/svg-corpus/` through the real reader, the real proposal, the draft the
// wizard builds at drop, the step's growth and fill measurements, the real build and the emitted
// runtime, and compares each pass's output with `scripts/fixtures/svg-corpus-passes.json`. A
// change to one pass fails that pass's test and names the files it changed:
//
//   inventory    what the reader returns (`importSvgMarkup`), its markup as a hash
//   proposal     the behaviour and the extras proposed from the names
//   draft        the rest of the patch the wizard's drop applies (`svgDraftFromImport`): the fitted
//                size, the growth seed, the name and every key a drop resets; its rows are
//                `proposal`'s and `fieldList`'s
//   fieldList    the draft's field, picture, outline and font rows, as the wizard builds them
//   step         the mapping step's growth default and its fill gap, measured on a stage render
//   bind         the bound <svg> as the emitted html carries it (`bindSvgMarkup`)
//   layout       the NOACG_LAYOUT table, parsed
//   behaviour    the NOACG_BEHAVIOUR table, parsed
//   fields       the template's SPX field list
//   fontCss      the @font-face blocks and the unresolved-font note in the template's css
//   emit         sha256 of the template's html, css and js
//   runtime      per bound line, at rest and at every LADDER_VALUES entry written into every text
//                field: painted lines, font size as a percentage of the drawn size, the overflow
//                report; and the box of every growth rule's shape, in px
//
// FONTS ARE THE SAME ON EVERY MACHINE. The bundled faces are served from `public/fonts` under a
// harness origin, and every family a file names that no bundled face matches is declared as an
// alias of Inter, so a Windows checkout and the Linux runner measure the same glyphs. This is the
// harness's override, never the product's: what the font pass emits is pinned by `fontCss`.
// The runtime record is still Linux's alone (RUNTIME_PINNED says why). A record that differs
// between two CI runs goes under `volatile` in the snapshot with its reason, and is compared
// within VOLATILE_TOLERANCE rather than exactly; never dropped.
//
// READINGS ARE THE WIZARD WALK'S OWN SMALL FILES. A few rules of the reader turn on a shape no
// corpus file is drawn in (a layer-name prefix, a source line wrapped by a pretty-printer, an event
// handler). Their files, each lifted verbatim from the `e2e/import-svg.spec.ts` test it replaced
// (`## Test maintenance` in docs/work-specs/svg-import-engine/spec.md), go through RECORD like any
// corpus file and then the export gate, and READINGS states what each must give: their sidecar, held
// in this file. They are asserted, never recorded.
//
// SIDECARS ARE THE TRUTH, NOT THIS RECORD. Every run cross-checks each file against its
// `.expect.json` (accepted, size, text fields ON, labels as a prefix, picture rows, outline rows,
// the growth default and the growing shape). A disagreement is a FINDING: listed in the snapshot's
// `findings` and printed on every run. The test fails only when the list changes, so a new
// disagreement cannot arrive silently and a fixed one is re-recorded on purpose.
//
//   node --test scripts/svg-import-passes.test.mjs
//   UPDATE_SVG_CORPUS_PASSES=1 node --test scripts/svg-import-passes.test.mjs   # re-record; name the reason in the pull request
//   UPDATE_SVG_CORPUS_PASSES=1 SVG_CORPUS_RUNTIME_FROM=<saved CI job log> node --test scripts/svg-import-passes.test.mjs
//                                                   # off Linux: the runtime records a failing CI run printed
//   SVG_CORPUS_RUNTIME_LOCAL=<file outside the repo> node --test scripts/svg-import-passes.test.mjs
//                                                   # off Linux: compare the runtime with this machine's own baseline
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { installDrivenPage } from './driven-clock.mjs';
import { LADDER_VALUES } from './ladder-values.mjs';
import { measured } from './measured.mjs';

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const CORPUS = root('e2e/fixtures/svg-corpus/');
export const FONTS_DIR = root('public/fonts/');
const SNAPSHOT = root('scripts/fixtures/svg-corpus-passes.json');
const UPDATE = process.env.UPDATE_SVG_CORPUS_PASSES === '1';
/** The origin the bundled font files are served from inside the page. Never a real host. */
export const ORIGIN = 'http://svg-corpus.harness';
/** Pixels or percentage points a runtime number may move and still match. */
const TOLERANCE = 1;
/** The same, for a record listed under `volatile`. */
const VOLATILE_TOLERANCE = 4;
/** THE RUNTIME RECORD IS LINUX'S, where CI runs it. With the same font files, Chromium on Windows
 *  lays text out a fraction of a pixel differently (its rasteriser hints the advances), which is
 *  enough to move a wrap: the first CI run of this harness disagreed with a Windows recording on
 *  14 of 48 files and on nothing else. Elsewhere the runtime is measured and its differences
 *  counted, but not compared, and a re-record keeps the committed runtime unless
 *  SVG_CORPUS_RUNTIME_FROM names a saved CI job log, whose `runtime-record` lines it takes. */
const RUNTIME_PINNED = process.platform === 'linux';
const RUNTIME_FROM = process.env.SVG_CORPUS_RUNTIME_FROM ?? null;
/** Off Linux, a runtime baseline of THIS machine (a JSON file outside the repository): written by
 *  the first run that names it, say on main, and compared against by every later one, so a
 *  Windows builder sees a runtime change before CI does. Same machine, same hinting. */
const RUNTIME_LOCAL = RUNTIME_PINNED ? null : process.env.SVG_CORPUS_RUNTIME_LOCAL ?? null;

export const SPECS = [
  ['assets/svgImport.ts', 'NOACG_SVG'],
  ['templates/behaviours/naming.ts', 'NOACG_NAMING'],
  ['components/wizard/import/draft.ts', 'NOACG_DRAFT'],
  ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
  ['preview/composeDocument.ts', 'NOACG_COMPOSE'],
  ['components/wizard/import/stageMeasure.ts', 'NOACG_STAGE'],
  ['components/wizard/import/fieldAutoMap.ts', 'NOACG_FILL'],
  ['model/fonts.ts', 'NOACG_FONTS'],
  ['validation/validateTemplate.ts', 'NOACG_VALIDATE'],
].map(([rel, globalName]) => ({ entry: root(`src/${rel}`), globalName }));

const PASSES = ['inventory', 'proposal', 'draft', 'fieldList', 'step', 'bind', 'layout', 'behaviour', 'fields', 'fontCss', 'emit', 'runtime'];

const corpus = readdirSync(CORPUS)
  .filter((f) => f.endsWith('.svg') && existsSync(`${CORPUS}${f.replace(/\.svg$/, '.expect.json')}`))
  .map((f) => {
    const name = f.replace(/\.svg$/, '');
    return { name, markup: readFileSync(`${CORPUS}${f}`, 'utf8'), sidecar: JSON.parse(readFileSync(`${CORPUS}${name}.expect.json`, 'utf8')) };
  })
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

/** Runs in the browser: one corpus file through every pass, as the wizard runs them at drop. */
export const RECORD = async ({ markup, origin, ladder }) => {
  const w0 = window;
  const { NOACG_SVG: R, NOACG_DRAFT: D, NOACG_STAGE: S, NOACG_FILL: F, NOACG_FONTS: FONTS } = w0;

  // READ.
  let svg;
  try {
    svg = R.importSvgMarkup(markup);
  } catch (e) {
    return { refused: String(e && e.message ? e.message : e) };
  }

  // PROPOSE and DRAFT, through the one function `CreationWizard.tsx` calls on drop. The drop's
  // patch is taken as it came, before the step below re-answers its fields and its growth, and
  // without the rows `proposal` and `fieldList` already pin, so one change fails one record.
  const draft = w0.__importDraft(svg);
  const behaviour = draft.svgBehaviour;
  const { designSvg: placed, ...dropped } = draft;
  for (const pinned of ['svgFields', 'svgImages', 'svgOutlines', 'svgFonts', 'svgBehaviour', 'svgExtras']) delete dropped[pinned];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const drop = JSON.parse(JSON.stringify({
    size: { width: placed.width, height: placed.height },
    restIsTheRead: Object.keys({ ...svg, ...placed }).every((k) => k === 'width' || k === 'height' || same(placed[k], svg[k])),
    ...dropped,
  }));

  // Every family the file names, on a bundled face: its own where the draft matched one, Inter
  // where nothing did. Declared for the step's stage here, and inside the graphic below.
  const inter = FONTS.fontById('inter').file;
  const face = (family, file) =>
    `@font-face{font-family:"${family}";src:url("${origin}/fonts/${file}") format("woff2");font-weight:100 900;}`;
  const stageFaces = draft.svgFonts.map((f) => face(f.family, f.fontId ? FONTS.fontById(f.fontId).file : inter)).join('\n');
  const unresolvedFaces = draft.svgFonts.filter((f) => !f.fontId).map((f) => face(f.family, inter)).join('\n');

  // MEASURE ON THE STEP: its off-screen stage (`MapSvgFieldsStep.tsx`, with the two rules of
  // `mapSvgFields.css` its measurements rely on), then in the step's order: text it finds outside
  // the frame taken off, the growth default its effect proposes, and the fill gap
  // `BehaviourSection.tsx` counts.
  const style = document.createElement('style');
  style.textContent = `${stageFaces}
.map-svg-stage svg{display:block;width:100%;height:auto;}
.map-svg-stage[data-reveal] svg *{display:inline !important;visibility:visible !important;}`;
  document.head.appendChild(style);
  const stage = document.createElement('div');
  stage.className = 'map-svg-stage';
  stage.style.cssText = `position:absolute;left:-20000px;top:0;width:${draft.designSvg.width}px;`;
  stage.innerHTML = draft.designSvg.markup;
  document.body.appendChild(stage);
  stage.getBoundingClientRect();
  await document.fonts.ready;
  const dsvg = draft.designSvg;
  const ids = [...new Set([...dsvg.groups, ...dsvg.shapes, ...dsvg.candidates, ...dsvg.images, ...dsvg.outlines].map((c) => c.id))];
  const boxes = S.measureBoxes(stage, ids);
  const frame = stage.querySelector('svg')?.getBoundingClientRect();
  const outside = new Set(frame ? dsvg.candidates.filter((c) => {
    const b = boxes.get(c.id);
    return b && (b.right <= 0 || b.bottom <= 0 || b.left >= frame.width || b.top >= frame.height);
  }).map((c) => c.id) : []);
  if (draft.svgFields.some((f) => f.on && outside.has(f.candidateId))) {
    draft.svgFields = draft.svgFields.map((f) => (outside.has(f.candidateId) ? { ...f, on: false, whenOff: 'keep' } : f));
  }
  const onIds = draft.svgFields.filter((f) => f.on).map((f) => f.candidateId);
  const banner = S.proposeBannerGrowth(stage, dsvg, onIds);
  const holders = S.panelsHoldingText(stage, dsvg, onIds, []);
  const grows = !!banner && !draft.svgBehaviour && !S.repeatsWithNewContent(stage, holders);
  const stretch = grows
    ? { on: true, shapeId: banner, axis: 'xy' }
    : { on: false, shapeId: banner ?? dsvg.shapes[0]?.id ?? null };
  let fillGap = null;
  if (behaviour) {
    const ink = F.artworkInk([...boxes.values()]);
    const kind = behaviour.kind;
    const text = kind === 'quiz' || kind === 'score'
      ? draft.svgFields.filter((f) => f.on).map((f) => ({ id: f.candidateId, label: f.title, numeric: f.numeric }))
      : dsvg.candidates.map((c) => ({ id: c.id, label: c.label, numeric: c.numeric }));
    const drawn = (kind === 'quiz' ? dsvg.groups : D.scoreDrawnPool(dsvg)).map((g) => ({ id: g.id, label: g.label, hidden: g.hidden }));
    const withBox = (l) => ({ ...l, box: boxes.get(l.id) ?? null });
    const recipeId = F.recipeIdOf(behaviour);
    fillGap = { recipe: recipeId, ...F.fillGap(recipeId, F.pickersOf(behaviour, text), text.map(withBox), drawn.map(withBox), draft.svgExtras.map((e) => e.candidateId), ink) };
  }
  stage.remove();
  style.remove();
  draft.svgStretch = stretch;

  // BUILD and PLACE.
  let template = w0.NOACG_IMPORTED.IMPORTED_SVG.create({ designSvg: D.svgDesignOptions(draft) });
  template = D.withSvgImportPasses(template, draft);

  // RUN: mount, settle on the bundled faces, then every ladder value into every text field.
  const w = await w0.__mountDesign(template, `<base href="${origin}/"><style id="hx-fonts">${unresolvedFaces}</style>`);
  const tables = {
    layout: w.eval('typeof NOACG_LAYOUT === "object" && NOACG_LAYOUT ? JSON.stringify(NOACG_LAYOUT) : "null"'),
    behaviour: w.eval('typeof NOACG_BEHAVIOUR === "object" && NOACG_BEHAVIOUR ? JSON.stringify(NOACG_BEHAVIOUR) : "null"'),
  };
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await w.document.fonts.ready;
      w.__advance(1000);
    }
  };
  // Read through the runtime's own globals, called plainly: a renamed one throws, and the run
  // fails naming the file rather than reading nothing.
  const read = () => {
    const r = (n) => Math.round(n);
    const lines = w.svgFitNodes().map((el) => {
      const drawnSize = w.svgFitSizes[el.id] || 0;
      const size = parseFloat(w.getComputedStyle(el).fontSize) || 0;
      return {
        id: el.id,
        lines: el.querySelectorAll('tspan[data-noacg-line]').length || 1,
        sizePct: drawnSize ? r((100 * size) / drawnSize) : null,
        over: !!w.svgFitOver[el.id],
      };
    });
    const rules = ((w.NOACG_LAYOUT && w.NOACG_LAYOUT.rules) || []).map((rule) => {
      const el = w.svgLayoutEl(rule.el);
      const b = el ? el.getBoundingClientRect() : null;
      return { el: rule.el, box: b ? { x: r(b.left), y: r(b.top), w: r(b.width), h: r(b.height) } : null };
    });
    return { lines, rules };
  };
  await settle();
  if (typeof w.play === 'function') w.play();
  await settle();
  const runtime = { rest: read() };
  const text = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea').map((f) => f.field);
  runtime.textFields = text.length;
  for (const [key, value] of Object.entries(ladder)) {
    w.update(JSON.stringify(Object.fromEntries(text.map((id) => [id, value]))));
    await settle();
    runtime[key] = read();
  }
  document.getElementById('fx')?.remove();

  const { markup: sanitized, ...inventory } = svg;
  return {
    markup: sanitized,
    inventory,
    proposal: { behaviour, extras: draft.svgExtras },
    draft: drop,
    fieldList: { size: { width: dsvg.width, height: dsvg.height }, fields: draft.svgFields, images: draft.svgImages, outlines: draft.svgOutlines, fonts: draft.svgFonts },
    step: { growth: { ...stretch, label: dsvg.shapes.find((s) => s.id === stretch.shapeId)?.label ?? null }, fillGap },
    template: { html: template.html, css: template.css, js: template.js, fields: template.fields },
    tables,
    runtime,
    // The export gate's refusals, read by the readings; no record carries them.
    gate: w0.NOACG_VALIDATE.validateTemplate(template).errors.map((e) => e.rule),
  };
};

/** Runs in the browser: the name a drop gives and a clear takes back, which the corpus (fresh
 *  drafts of files read without a name) never exercises. */
const NAMING = () => {
  const D = window.NOACG_DRAFT;
  const read = { ...window.NOACG_SVG.importSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><text x="10" y="50">Hello</text></svg>') };
  const drop = (fileName, previous) => D.svgDraftFromImport({ ...read, fileName }, { resolution: { width: 1920, height: 1080 }, previous }).name;
  const quiz = { fileName: 'quiz-board.svg' };
  return {
    drops: [
      drop('quiz-board.svg', { name: '', designSvg: null }),
      drop('quiz-board.svg', { name: '   ', designSvg: null }),
      drop('scoreboard.svg', { name: 'Final', designSvg: quiz }),
      drop('scoreboard.svg', { name: 'Quiz board', designSvg: quiz }),
      drop(undefined, { name: '', designSvg: null }),
    ],
    clears: [
      D.svgDraftCleared({ name: 'Quiz board', designSvg: quiz }),
      D.svgDraftCleared({ name: 'Final', designSvg: quiz }),
    ],
  };
};

/** The wizard walk's own small files, and what each must read as. `expect` is the case's sidecar:
 *  written from the promise the retired test stated, never from this harness's output. A row is
 *  the reader's candidate t0, t1, ... as the step names them. */
const READINGS = [
  {
    name: 'f-prefix',
    retired: 'svg import: the f: layer-name prefix names a field without switching the others off',
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="f_x3A_Name" x="20" y="80" font-size="30" fill="#fff">Alexandra Riva</text>
      <text id="Watermark" x="20" y="180" font-size="10" fill="#666">station ident</text>
    </svg>`,
    // The prefix names the field and guarantees it; it never turns an unmarked row off.
    expect: { rows: [{ title: 'Name', on: true }, { on: true }] },
  },
  {
    name: 'static-prefix',
    retired: 'svg import: the static: prefix says a text layer is DRAWING, and its words stay drawn',
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200">
      <text id="static_x3A_Rank" data-name="static:Rank" x="20" y="60" font-size="30" fill="#8a8f98">10.</text>
      <text id="Item" x="90" y="60" font-size="30" fill="#fff">The buzzer is a kazoo</text>
    </svg>`,
    // Offered unticked and kept ("stays as drawn"), and the template has one field while the
    // numeral stays drawn and unbound: not taken off the artwork, which would keep its words but
    // hide them under the removed class.
    expect: {
      rows: [{ title: 'Rank', on: false, kept: true }, { on: true }],
      fields: ['f0:Item'],
      bound: [/<text\b[^>]*data-name="static:Rank"[^>]*>\s*10\.\s*<\/text>/],
      notBound: [/<text[^>]*id="f1"/, /imported-design-removed/],
    },
  },
  {
    name: 'kerned-figma-wrapper',
    retired: 'svg import: kerning a Figma text layer does not turn its wrapper into a group of many',
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300">
      <g id="Venue"><text id="HelsinkiLive" font-size="24" fill="#fff"><tspan x="40" y="120">Helsinki</tspan><tspan x="300" y="120">Live</tspan></text></g>
    </svg>`,
    // Two rows out of one text layer, and it is still ONE layer, so its wrapper names both.
    expect: {
      rows: [{ title: 'Venue', sample: 'Helsinki', namedByGroup: true }, { title: 'Venue 2', sample: 'Live' }],
    },
  },
  {
    name: 'hidden-and-symbol-text',
    retired: 'svg import: text a designer switched off, or parked in a symbol, is never offered as a field',
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <defs><symbol id="Badge"><text id="In_x20_symbol" x="0" y="0">Never shown</text></symbol></defs>
      <g id="Old_x20_draft" style="display:none"><text id="Draft_x20_copy" x="20" y="40">Draft copy</text></g>
      <g id="Retired" display="none"><text id="Retired_x20_line" x="20" y="60">Retired line</text></g>
      <symbol id="Bug"><text id="Bare_x20_symbol" x="0" y="0">Bare symbol</text></symbol>
      <use href="#Badge" x="300" y="20"/>
      <use href="#Bug" x="300" y="60"/>
      <text id="Headline" x="20" y="120" font-size="30" fill="#fff">Alexandra Riva</text>
    </svg>`,
    // One text layer: hidden by style or by attribute, or defined in a symbol (inside <defs> or
    // bare), is never a row; the symbol's text, drawn by the <use>, is said out loud.
    expect: { rows: [{ title: 'Headline', on: true }], notices: [/reusable symbol/] },
  },
  {
    name: 'wrapped-source-line',
    retired: 'svg import: a wrapped source line becomes one clean sample, unless the file preserved it',
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="Body" x="20" y="80" font-size="20" fill="#fff">
        Breaking news from
        the capital
      </text>
      <text id="Spaced" xml:space="preserve" x="20" y="140" font-size="20" fill="#fff">A   B</text>
    </svg>`,
    expect: { rows: [{ sample: 'Breaking news from the capital' }, { sample: 'A   B' }] },
  },
  {
    name: 'text-on-path',
    retired: 'svg import: text on a path binds the path run, and keeps its curve when an operator types',
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <defs><path id="curve" d="M20 150 Q200 40 380 150"/></defs>
      <text id="Arc" font-size="24" fill="#fff"><textPath href="#curve">Around the bend</textPath></text>
    </svg>`,
    // The field is the <textPath>, so a write replaces its words and not the curve it runs on;
    // the SVG 2 `href` the corpus's Inkscape file (`xlink:href`) does not draw.
    expect: {
      rows: [{ sample: 'Around the bend' }],
      bound: [/<textPath\b[^>]*\bid="f0"/i, /<textPath\b[^>]*\shref="#curve"/i],
    },
  },
  {
    name: 'sanitizer',
    retired: 'svg import: sanitizer — script, handlers, foreignObject, SMIL and network refs never reach the template',
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <script>alert('never')</script>
      <foreignObject x="0" y="0" width="100" height="100"><div>html</div></foreignObject>
      <rect x="0" y="0" width="400" height="200" fill="#111" onload="alert('never')"/>
      <image href="https://evil.example/logo.png" x="0" y="0" width="50" height="50"/>
      <text id="Headline" x="20" y="100" font-size="30" fill="#fff">Breaking
        <animate attributeName="opacity" values="0;1" dur="1s" repeatCount="indefinite"/>
      </text>
    </svg>`,
    // The import says what it removed, none of it reaches the template, and the export gate
    // (its own SVG checks) agrees.
    expect: {
      notices: [/Script code inside the SVG was removed/, /Event-handler attributes/, /foreignObject block was removed/,
        /SVG-native \(SMIL\) animation was removed/, /References to files on the internet were removed/],
      notBound: [/<script/, /foreignObject/, /onload/, /evil\.example/, /<animate/],
    },
  },
];

export const sha = (s) => createHash('sha256').update(s ?? '').digest('hex');

/** The bound <svg> as the emitted html carries it, without the indent the assembler adds. */
export function boundSvg(html) {
  const start = html.indexOf('<svg');
  const end = html.lastIndexOf('</svg>');
  if (start < 0 || end < 0) return null;
  return html.slice(start, end + 6).split('\n').map((l) => l.replace(/^ {4}/, '')).join('\n');
}

/** What the font pass put in the css: its @font-face blocks and its unresolved-font note. */
function fontCss(css) {
  return [...css.matchAll(/@font-face\s*\{[^}]*\}|\/\* UNRESOLVED FONTS?:[\s\S]*?\*\//g)].map((m) => m[0]);
}

/** One file's records, keyed by pass. */
export function recordsOf(raw) {
  if (raw.refused) return { inventory: { refused: raw.refused } };
  return {
    inventory: { ...raw.inventory, markupSha256: sha(raw.markup) },
    proposal: raw.proposal,
    draft: raw.draft,
    fieldList: raw.fieldList,
    step: raw.step,
    bind: boundSvg(raw.template.html),
    layout: JSON.parse(raw.tables.layout),
    behaviour: JSON.parse(raw.tables.behaviour),
    fields: raw.template.fields,
    fontCss: fontCss(raw.template.css),
    emit: { html: sha(raw.template.html), css: sha(raw.template.css), js: sha(raw.template.js) },
    runtime: raw.runtime,
  };
}

/** The file against its sidecar: every disagreement, as one sentence each. */
function crossCheck(name, sidecar, rec) {
  const want = sidecar.expect ?? {};
  const out = [];
  const say = (s) => out.push(`${name}: ${s}`);
  const refused = !!rec.inventory.refused;
  if (want.accepted === false) {
    if (!refused) say('imported a file its sidecar says the door refuses');
    else if (sidecar.refusalAbout && !new RegExp(sidecar.refusalAbout, 'i').test(rec.inventory.refused)) {
      say(`refused without naming "${sidecar.refusalAbout}": ${rec.inventory.refused}`);
    }
    return out;
  }
  if (refused) return [`${name}: refused a file its sidecar accepts: ${rec.inventory.refused}`];
  const { size, fields, images, outlines } = rec.fieldList;
  if (want.width && want.height && (size.width !== want.width || size.height !== want.height)) {
    say(`size ${size.width} x ${size.height}, sidecar ${want.width} x ${want.height}`);
  }
  const on = fields.filter((f) => f.on).length;
  if (typeof want.textFields === 'number' && on !== want.textFields) say(`${on} text fields ON, sidecar ${want.textFields}`);
  (want.textLabels ?? []).forEach((label, i) => {
    if (fields[i]?.title !== label) say(`row ${i + 1} labelled "${fields[i]?.title ?? '(none)'}", sidecar "${label}"`);
  });
  if (typeof want.imageFields === 'number' && images.length !== want.imageFields) say(`${images.length} picture rows, sidecar ${want.imageFields}`);
  if (typeof want.outlineRows === 'number' && outlines.length !== want.outlineRows) say(`${outlines.length} outline rows, sidecar ${want.outlineRows}`);
  const growth = rec.step.growth;
  const mode = growth.on ? `grow-${growth.axis}` : 'shrink';
  if (want.growth && on > 0 && mode !== want.growth) say(`growth default ${mode}, sidecar ${want.growth}`);
  // Read off the shape that GROWS, as the corpus gate reads the box that grows: none, if nothing does.
  const grown = growth.on ? growth.label : null;
  if (want.growthShape && grown !== want.growthShape) say(`growing shape "${grown ?? '(none)'}", sidecar "${want.growthShape}"`);
  return out;
}

/** Every difference between two records, as `path: before -> after`. A runtime record's sizes and
 *  boxes may move by `tol`; everything else, line counts included, is exact. */
export function diff(before, after, tol, path = '', out = []) {
  if (out.length >= 12) return out;
  const show = (v) => (v === undefined ? 'absent' : JSON.stringify(v)?.slice(0, 160));
  if (typeof before === 'number' && typeof after === 'number' && tol > 0 && /\.(sizePct|x|y|w|h)$/.test(path)) {
    if (Math.abs(before - after) > tol) out.push(`${path}: ${before} -> ${after}`);
    return out;
  }
  // A long text (the bound markup) is shown where it starts to differ, not from its beginning.
  if (typeof before === 'string' && typeof after === 'string' && before !== after && Math.max(before.length, after.length) > 160) {
    let i = 0;
    while (before[i] === after[i]) i++;
    const at = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 80));
    out.push(`${path || '(whole)'} at character ${i}: ${at(before)} -> ${at(after)}`);
    return out;
  }
  if (before && after && typeof before === 'object' && typeof after === 'object' && Array.isArray(before) === Array.isArray(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    for (const k of keys) diff(before[k], after[k], tol, path ? `${path}.${k}` : k, out);
    return out;
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) out.push(`${path || '(whole)'}: ${show(before)} -> ${show(after)}`);
  return out;
}


/** Run these files through RECORD in one offline page with the bundled faces and the driven
 *  clock, keyed by name; `more(page, records)` runs on the same page afterwards. The jev-svg baseline
 *  (scripts/jev-svg-baseline.test.mjs) records its designs through this, so both read one path. */
export async function recordInPage(files, ladder, more = async () => {}) {
  const fontBytes = new Map();
  return withBundledPage(SPECS, async (page) => {
    // Offline and the same everywhere: the harness origin serves the bundled faces, nothing else
    // leaves the page.
    await page.route('**/*', (route) => {
      const url = route.request().url();
      const file = url.startsWith(`${ORIGIN}/fonts/`) ? url.slice(`${ORIGIN}/fonts/`.length) : null;
      if (file && /^[a-z0-9-]+\.woff2$/.test(file) && existsSync(`${FONTS_DIR}${file}`)) {
        if (!fontBytes.has(file)) fontBytes.set(file, readFileSync(`${FONTS_DIR}${file}`));
        return route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fontBytes.get(file) });
      }
      return route.abort();
    });
    await installDrivenPage(page);
    const out = {};
    for (const file of files) {
      out[file.name] = await page.evaluate(RECORD, { markup: file.markup, origin: ORIGIN, ladder })
        .catch((e) => { throw new Error(`${file.name}: ${e.message}`); });
    }
    await more(page, out);
    return out;
  });
}

/** Imported as `./svg-import-passes.test.mjs?library`, this file only lends the functions above:
 *  it runs no corpus and registers no test. */
const LIBRARY = new URL(import.meta.url).searchParams.has('library');

if (!LIBRARY) {
  const started = Date.now();
  let naming = null;
  let readings = null;
  const raws = await recordInPage(corpus, LADDER_VALUES, async (page) => {
    naming = await page.evaluate(NAMING);
    readings = {};
    for (const r of READINGS) {
      readings[r.name] = await page.evaluate(RECORD, { markup: r.markup, origin: ORIGIN, ladder: {} })
        .catch((e) => { throw new Error(`reading ${r.name}: ${e.message}`); });
    }
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const records = Object.fromEntries(corpus.map((f) => [f.name, recordsOf(raws[f.name])]));
  const findings = corpus.flatMap((f) => crossCheck(f.name, f.sidecar, records[f.name]));
  const recordCount = Object.values(records).reduce((n, r) => n + Object.keys(r).length, 0);
  measured(recordCount, 'corpus pass records');
  console.log(`[svg-import-passes] ${corpus.length} files, ${recordCount} records in ${seconds} s`);
  console.log(`[svg-import-passes] ${findings.length} findings against the sidecars:\n  ${findings.join('\n  ')}`);

  const before = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : null;
  let snapshot = before;
  if (UPDATE || !before) {
    // Off Linux the runtime record is not this machine's to write: it keeps the committed one, or
    // takes the lines a CI run printed (RUNTIME_FROM, a saved job log).
    const fromLog = RUNTIME_FROM
      ? Object.fromEntries([...readFileSync(RUNTIME_FROM, 'utf8').matchAll(/\[svg-import-passes\] runtime-record (\S+) (\{.*\})\s*$/gm)].map((m) => [m[1], JSON.parse(m[2])]))
      : {};
    const owed = [];
    const files = Object.fromEntries(Object.entries(records).map(([name, rec]) => {
      if (RUNTIME_PINNED || !rec.runtime) return [name, rec];
      const runtime = fromLog[name] ?? before?.files?.[name]?.runtime;
      if (runtime) return [name, { ...rec, runtime }];
      owed.push(name);
      const rest = { ...rec };
      delete rest.runtime;
      return [name, rest];
    }));
    // A file with no Linux runtime yet is written without one: CI then fails on it and prints it.
    if (owed.length) console.log(`[svg-import-passes] no runtime record for ${owed.join(', ')}: take it from a CI run's log`);
    snapshot = {
      $comment:
        'Every SVG corpus file through every import pass (scripts/svg-import-passes.test.mjs). Re-record only with UPDATE_SVG_CORPUS_PASSES=1 and the reason in the pull request; the diff is the review. The runtime records are Linux (CI) measurements.',
      findings,
      volatile: before?.volatile ?? {},
      files,
    };
    writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot, null, 1)}\n`);
    console.log(`[svg-import-passes] recorded ${SNAPSHOT}${RUNTIME_PINNED ? '' : ` (runtime records kept from the snapshot${RUNTIME_FROM ? ` or taken from ${RUNTIME_FROM}` : ''})`}`);
  }

  let localRuntime = null;
  if (RUNTIME_LOCAL) {
    if (!existsSync(RUNTIME_LOCAL)) {
      writeFileSync(RUNTIME_LOCAL, JSON.stringify(Object.fromEntries(Object.entries(records).map(([name, r]) => [name, r.runtime ?? null]))));
      console.log(`[svg-import-passes] wrote this machine's runtime baseline to ${RUNTIME_LOCAL}`);
    }
    localRuntime = JSON.parse(readFileSync(RUNTIME_LOCAL, 'utf8'));
  }

  test('the corpus is the files with a sidecar, and the record holds each of them', () => {
    assert.ok(corpus.length >= 49, `only ${corpus.length} corpus files`);
    assert.deepEqual(Object.keys(records), Object.keys(snapshot.files).sort(), 'a corpus file was added or removed: re-record');
  });

  test('a drop names the graphic after its file unless the reader named it, and a clear takes only that name back', () => {
    assert.deepEqual(naming.drops, ['Quiz board', 'Quiz board', 'Final', 'Scoreboard', '']);
    const empty = { designSvg: null, svgFields: [], svgImages: [], svgOutlines: [], svgBehaviour: null, svgExtras: [], svgStretch: { on: false, shapeId: null }, svgFonts: [], variantId: null, category: null };
    assert.deepEqual(naming.clears, [{ ...empty, name: '' }, { ...empty, name: 'Final' }]);
  });

  for (const { name, retired, expect } of READINGS) {
    test(`reading ${name}: ${retired}`, () => {
      const raw = readings[name];
      assert.ok(!raw.refused, `${name}: refused: ${raw.refused}`);
      // One row per text layer the reader found, in its order (t0, t1, ...), which is how the step
      // names its rows; the draft itself lists furniture last.
      const rowOf = new Map(raw.fieldList.fields.map((f) => [f.candidateId, f]));
      const rows = raw.inventory.candidates.map((c, i) => {
        assert.equal(c.id, `t${i}`, `${name}: the reader's text layers are t0, t1, ...`);
        const f = rowOf.get(c.id);
        assert.ok(f, `${name}: text layer ${c.id} has no row in the draft`);
        return { title: f.title, sample: f.sample, on: f.on, kept: !f.on && f.whenOff !== 'remove', namedByGroup: c.namedByGroup };
      });
      if (expect.rows) {
        const picked = rows.map((row, i) => Object.fromEntries(Object.keys(expect.rows[i] ?? {}).map((k) => [k, row[k]])));
        assert.deepEqual(picked, expect.rows, `${name}: the rows`);
      }
      const got = { notices: raw.inventory.notices, fields: raw.template.fields.map((f) => `${f.field}:${f.title}`), html: raw.template.html, gate: raw.gate };
      if (expect.fields) assert.deepEqual(got.fields, expect.fields, `${name}: the template's fields`);
      assert.deepEqual(got.gate, [], `${name}: the export gate refuses the template`);
      const bound = boundSvg(got.html);
      assert.ok(bound, `${name}: the template carries no bound <svg>`);
      for (const re of expect.bound ?? []) assert.match(bound, re, `${name}: the bound svg`);
      for (const re of expect.notBound ?? []) assert.doesNotMatch(bound, re, `${name}: the bound svg`);
      for (const re of expect.notices ?? []) assert.ok(got.notices.some((n) => re.test(n)), `${name}: no notice matching ${re}, only ${JSON.stringify(got.notices)}`);
    });
  }

  test('the findings against the sidecars are the recorded ones', () => {
    assert.deepEqual(findings, snapshot.findings);
  });

  /** Every file whose `pass` record differs from the snapshot, with what moved. */
  function changedIn(pass) {
    const changed = [];
    for (const { name } of corpus) {
      const volatile = snapshot.volatile?.[name]?.[pass];
      const tol = pass === 'runtime' ? (volatile ? VOLATILE_TOLERANCE : TOLERANCE) : 0;
      const was = pass === 'runtime' && localRuntime ? localRuntime[name] ?? undefined : snapshot.files[name]?.[pass];
      const lines = diff(was, records[name][pass], tol);
      if (lines.length) changed.push({ name, lines });
    }
    return changed;
  }

  for (const pass of PASSES) {
    // Measured everywhere; compared against Linux's record or this machine's own baseline, and
    // where there is neither, said so (see RUNTIME_PINNED).
    const skip = pass === 'runtime' && !RUNTIME_PINNED && !localRuntime
      ? `not compared on ${process.platform}: the record is Linux's (CI), and ${changedIn(pass).length} file(s) differ from it here; CI compares it, or set SVG_CORPUS_RUNTIME_LOCAL=<file> on main to compare against this machine`
      : false;
    test(`${pass}: every corpus file matches its record`, { skip }, () => {
      const changed = changedIn(pass);
      if (pass === 'runtime' && !localRuntime) {
        // The fresh records, one line each, so a re-record off Linux can take them from this log.
        for (const { name } of changed) console.log(`[svg-import-passes] runtime-record ${name} ${JSON.stringify(records[name].runtime)}`);
      }
      const said = changed.map(({ name, lines }) => `${name} / ${pass}\n    ${lines.join('\n    ')}`);
      assert.equal(changed.length, 0, `${changed.length} file(s) changed in ${pass}:\n  ${said.join('\n  ')}`);
    });
  }
}
