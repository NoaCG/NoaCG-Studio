// gate: factory
// needs: browser
// guards: src/assets/svgImport.ts, src/templates/importedDesign/**, src/templates/behaviours/**, src/components/wizard/import/**, src/preview/composeDocument.ts, src/model/fonts.ts, e2e/fixtures/svg-corpus/**, scripts/fixtures/svg-corpus-passes.json, scripts/ladder-values.mjs
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
const FONTS_DIR = root('public/fonts/');
const SNAPSHOT = root('scripts/fixtures/svg-corpus-passes.json');
const UPDATE = process.env.UPDATE_SVG_CORPUS_PASSES === '1';
/** The origin the bundled font files are served from inside the page. Never a real host. */
const ORIGIN = 'http://svg-corpus.harness';
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

const SPECS = [
  ['assets/svgImport.ts', 'NOACG_SVG'],
  ['templates/behaviours/naming.ts', 'NOACG_NAMING'],
  ['components/wizard/import/draft.ts', 'NOACG_DRAFT'],
  ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
  ['preview/composeDocument.ts', 'NOACG_COMPOSE'],
  ['components/wizard/import/stageMeasure.ts', 'NOACG_STAGE'],
  ['components/wizard/import/fieldAutoMap.ts', 'NOACG_FILL'],
  ['model/fonts.ts', 'NOACG_FONTS'],
].map(([rel, globalName]) => ({ entry: root(`src/${rel}`), globalName }));

const PASSES = ['inventory', 'proposal', 'fieldList', 'step', 'bind', 'layout', 'behaviour', 'fields', 'fontCss', 'emit', 'runtime'];

const corpus = readdirSync(CORPUS)
  .filter((f) => f.endsWith('.svg') && existsSync(`${CORPUS}${f.replace(/\.svg$/, '.expect.json')}`))
  .sort()
  .map((f) => {
    const name = f.replace(/\.svg$/, '');
    return { name, markup: readFileSync(`${CORPUS}${f}`, 'utf8'), sidecar: JSON.parse(readFileSync(`${CORPUS}${name}.expect.json`, 'utf8')) };
  });

/** Runs in the browser: one corpus file through every pass, as the wizard runs them at drop. */
const RECORD = async ({ markup, origin, ladder }) => {
  const w0 = window;
  const { NOACG_SVG: R, NOACG_DRAFT: D, NOACG_STAGE: S, NOACG_FILL: F, NOACG_FONTS: FONTS } = w0;

  // READ.
  let svg;
  try {
    svg = R.importSvgMarkup(markup);
  } catch (e) {
    return { refused: String(e && e.message ? e.message : e) };
  }

  // PROPOSE and DRAFT, as `CreationWizard.tsx` does on drop.
  const behaviour = D.proposeSvgBehaviour({ ...svg, candidates: svg.candidates.filter((c) => !c.outsideCanvas) });
  const draft = w0.__importDraft(svg, behaviour);

  // Every family the file names, on a bundled face: its own where the draft matched one, Inter
  // where nothing did. Declared for the step's stage here, and inside the graphic below.
  const fileOf = (id) => FONTS.FONTS.find((f) => f.id === id)?.file;
  const inter = FONTS.FONTS.find((f) => f.id === 'inter').file;
  const face = (family, file) =>
    `@font-face{font-family:"${family}";src:url("${origin}/fonts/${file}") format("woff2");font-weight:100 900;}`;
  const stageFaces = draft.svgFonts.map((f) => face(f.family, fileOf(f.fontId) ?? inter)).join('\n');
  const unresolvedFaces = draft.svgFonts.filter((f) => !f.fontId).map((f) => face(f.family, inter)).join('\n');

  // MEASURE ON THE STEP: its off-screen stage (`MapSvgFieldsStep.tsx`, `.map-svg-stage`), the
  // growth default its effect proposes, and the fill gap `BehaviourSection.tsx` counts.
  const style = document.createElement('style');
  style.textContent = `${stageFaces}\n.hx-stage svg{display:block;width:100%;height:auto;}`;
  document.head.appendChild(style);
  const stage = document.createElement('div');
  stage.className = 'hx-stage';
  stage.style.cssText = `position:absolute;left:-20000px;top:0;width:${draft.designSvg.width}px;`;
  stage.innerHTML = draft.designSvg.markup;
  document.body.appendChild(stage);
  stage.getBoundingClientRect();
  await document.fonts.ready;
  const dsvg = draft.designSvg;
  const onIds = draft.svgFields.filter((f) => f.on).map((f) => f.candidateId);
  const banner = S.proposeBannerGrowth(stage, dsvg, onIds);
  const holders = S.panelsHoldingText(stage, dsvg, onIds, []);
  const grows = !!banner && !draft.svgBehaviour && !S.repeatsWithNewContent(stage, holders);
  const stretch = grows
    ? { on: true, shapeId: banner, axis: 'xy' }
    : { on: false, shapeId: banner ?? dsvg.shapes[0]?.id ?? null };
  let fillGap = null;
  if (behaviour) {
    const ids = [...new Set([...dsvg.groups, ...dsvg.shapes, ...dsvg.candidates, ...dsvg.images, ...dsvg.outlines].map((c) => c.id))];
    const boxes = S.measureBoxes(stage, ids);
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
  // Read through the runtime's own globals, called plainly: a renamed one throws and fails the
  // file loudly rather than reading nothing.
  const read = () => {
    const r = (n) => Math.round(n);
    const lines = w.svgFitNodes().map((el) => {
      const drawnSize = w.svgFitSizes[el.id] || 0;
      const size = parseFloat(w.getComputedStyle(el).fontSize) || 0;
      return {
        id: el.id,
        lines: el.querySelectorAll('tspan[data-noacg-line]').length || 1,
        sizePct: drawnSize ? r((100 * size) / drawnSize) : null,
        over: !!w.svgFitOver[el.id],      };
    });
    const rules = ((w.NOACG_LAYOUT && w.NOACG_LAYOUT.rules) || []).map((rule) => {
      const el = w.svgLayoutEl(rule.el);
      const b = el ? el.getBoundingClientRect() : null;
      return { el: rule.el, box: b ? { x: r(b.left), y: r(b.top), w: r(b.width), h: r(b.height) } : null };
    });
    return { lines, rules };
  };
  let runtime;
  try {
    await settle();
    if (typeof w.play === 'function') w.play();
    await settle();
    runtime = { rest: read() };
    const text = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea').map((f) => f.field);
    runtime.textFields = text.length;
    for (const [key, value] of Object.entries(ladder)) {
      w.update(JSON.stringify(Object.fromEntries(text.map((id) => [id, value]))));
      await settle();
      runtime[key] = read();
    }
  } catch (e) {
    runtime = { error: String(e && e.message ? e.message : e) };
  }
  document.getElementById('fx')?.remove();

  const { markup: sanitized, ...inventory } = svg;
  return {
    markup: sanitized,
    inventory,
    proposal: { behaviour, extras: draft.svgExtras },
    fieldList: { size: { width: dsvg.width, height: dsvg.height }, fields: draft.svgFields, images: draft.svgImages, outlines: draft.svgOutlines, fonts: draft.svgFonts },
    step: { growth: { ...stretch, label: dsvg.shapes.find((s) => s.id === stretch.shapeId)?.label ?? null }, fillGap },
    template: { html: template.html, css: template.css, js: template.js, fields: template.fields },
    tables,
    runtime,
  };
};

const sha = (s) => createHash('sha256').update(s ?? '').digest('hex');

/** The bound <svg> as the emitted html carries it, without the indent the assembler adds. */
function boundSvg(html) {
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
function recordsOf(raw) {
  if (raw.refused) return { inventory: { refused: raw.refused } };
  return {
    inventory: { ...raw.inventory, markupSha256: sha(raw.markup) },
    proposal: raw.proposal,
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
  if (want.growthShape && growth.label !== want.growthShape) say(`growing shape "${growth.label}", sidecar "${want.growthShape}"`);
  return out;
}

/** Every difference between two records, as `path: before -> after`. A runtime record's sizes and
 *  boxes may move by `tol`; everything else, line counts included, is exact. */
function diff(before, after, tol, path = '', out = []) {
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

const started = Date.now();
const raws = await withBundledPage(SPECS, async (page) => {
  // Offline and the same everywhere: the harness origin serves the bundled faces, nothing else
  // leaves the page.
  await page.route('**/*', (route) => {
    const url = route.request().url();
    const file = url.startsWith(`${ORIGIN}/fonts/`) ? url.slice(`${ORIGIN}/fonts/`.length) : null;
    if (file && /^[a-z0-9-]+\.woff2$/.test(file) && existsSync(`${FONTS_DIR}${file}`)) {
      return route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(`${FONTS_DIR}${file}`) });
    }
    return route.abort();
  });
  await installDrivenPage(page);
  const out = {};
  for (const file of corpus) out[file.name] = await page.evaluate(RECORD, { markup: file.markup, origin: ORIGIN, ladder: LADDER_VALUES });
  return out;
});
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const records = Object.fromEntries(corpus.map((f) => [f.name, recordsOf(raws[f.name])]));
const findings = corpus.flatMap((f) => crossCheck(f.name, f.sidecar, records[f.name]));
const recordCount = Object.values(records).reduce((n, r) => n + Object.keys(r).length, 0);
measured(recordCount, 'corpus pass records');
console.log(`[svg-import-passes] ${corpus.length} files, ${recordCount} records in ${seconds} s`);
console.log(`[svg-import-passes] ${findings.length} findings against the sidecars:\n  ${findings.join('\n  ')}`);

const before = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : null;
if (UPDATE || !before) {
  // Off Linux the runtime record is not this machine's to write: it keeps the committed one, or
  // takes the lines a CI run printed (RUNTIME_FROM, a saved job log).
  const fromLog = RUNTIME_FROM
    ? Object.fromEntries([...readFileSync(RUNTIME_FROM, 'utf8').matchAll(/\[svg-import-passes\] runtime-record (\S+) (\{.*\})\s*$/gm)].map((m) => [m[1], JSON.parse(m[2])]))
    : {};
  const files = Object.fromEntries(Object.entries(records).map(([name, rec]) => {
    if (RUNTIME_PINNED || !rec.runtime) return [name, rec];
    const runtime = fromLog[name] ?? before?.files?.[name]?.runtime ?? rec.runtime;
    return [name, { ...rec, runtime }];
  }));
  writeFileSync(
    SNAPSHOT,
    `${JSON.stringify({
      $comment:
        'Every SVG corpus file through every import pass (scripts/svg-import-passes.test.mjs). Re-record only with UPDATE_SVG_CORPUS_PASSES=1 and the reason in the pull request; the diff is the review. The runtime records are Linux (CI) measurements.',
      findings,
      volatile: before?.volatile ?? {},
      files,
    }, null, 1)}\n`,
  );
  console.log(`[svg-import-passes] recorded ${SNAPSHOT}${RUNTIME_PINNED ? '' : ` (runtime records kept from the snapshot${RUNTIME_FROM ? ` or taken from ${RUNTIME_FROM}` : ''})`}`);
}
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

test('the corpus is the files with a sidecar, and the record holds each of them', () => {
  assert.ok(corpus.length >= 49, `only ${corpus.length} corpus files`);
  assert.deepEqual(Object.keys(records), Object.keys(snapshot.files).sort(), 'a corpus file was added or removed: re-record');
});

test('the findings against the sidecars are the recorded ones', () => {
  assert.deepEqual(findings, snapshot.findings);
});

/** Every file whose `pass` record differs from the snapshot, with what moved. */
function changedIn(pass) {
  const changed = [];
  for (const { name } of corpus) {
    const volatile = snapshot.volatile?.[name]?.[pass];
    const tol = pass === 'runtime' ? (volatile ? VOLATILE_TOLERANCE : TOLERANCE) : 0;
    const lines = diff(snapshot.files[name]?.[pass], records[name][pass], tol);
    if (lines.length) changed.push({ name, lines });
  }
  return changed;
}

for (const pass of PASSES) {
  // Measured everywhere; compared only where it was recorded (see RUNTIME_PINNED), and said so.
  const skip = pass === 'runtime' && !RUNTIME_PINNED
    ? `the runtime record is Linux's (CI) and this is ${process.platform}: ${changedIn(pass).length} file(s) lay text out differently here, which is font hinting rather than a change`
    : false;
  test(`${pass}: every corpus file matches its record`, { skip }, () => {
    const changed = changedIn(pass);
    if (pass === 'runtime') {
      // The fresh records, one line each, so a re-record off Linux can take them from this log.
      for (const { name } of changed) console.log(`[svg-import-passes] runtime-record ${name} ${JSON.stringify(records[name].runtime)}`);
    }
    const said = changed.map(({ name, lines }) => `${name} / ${pass}\n    ${lines.join('\n    ')}`);
    assert.equal(changed.length, 0, `${changed.length} file(s) changed in ${pass}:\n  ${said.join('\n  ')}`);
  });
}
