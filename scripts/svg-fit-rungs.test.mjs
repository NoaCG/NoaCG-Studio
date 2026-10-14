// gate: factory
// needs: browser
// guards: src/templates/importedDesign/**, src/assets/svgImport.ts, src/templates/behaviours/**, src/components/wizard/import/**, src/model/fonts.ts, public/fonts/**, e2e/fixtures/svg-corpus/**, scripts/ladder-values.mjs
//
// THE FIT LADDER'S RUNGS AND THE STEP'S MIRROR OF THEM, ON EVERY CORPUS FILE, WITHOUT THE WIZARD.
//
// The runtime every imported SVG carries (`src/templates/importedDesign/runtime/*.js`) is loaded
// here as text, filled the way `svg.ts` fills it, into a blank page holding one corpus file's bound
// artwork and its layout table, and nothing else: no template script, no boot, no timeline. The
// rungs are then driven by calling the runtime's own functions (`svgRestAndMeasure`, `fitSvgText`,
// `refitSvgText`, which run `measureSvgRoom`, `growSvgLayout` and `growSvgHeights`), and each
// contract rule of `src/templates/importedDesign/AGENTS.md` is asserted on every file it applies
// to, at rest and at every `LADDER_VALUES` length:
//
//   room          a line's room stops at its box's edge and at what is drawn beside it on its own
//                 rows: unless it is reported too long, it never paints out of its box sideways
//                 or across a neighbour that pens it
//   snap          a line the designer centred is anchored on its box's middle, and a block centred
//                 vertically sits on its band's middle, whatever its length
//   margin        growth never passes the margin the design kept on the anchored side, mirrored
//                 and floored at the row's safe margin, and never leaves the frame
//   settle        a second pass, and a full re-measure, give the same artwork to the byte
//   fits          the artwork at rest is the design, and a value the room holds is painted at the
//                 drawn size on one line, unreported, and moves nothing
//   floors        type never goes below 30% of its drawn size, anything below 55% is reported, and
//                 a squeeze never goes past 70% of the glyphs' own advance and is always reported
//
// Every rule must hold on at least MIN_FILES corpus files, so a corpus or a rule that stops
// reaching the case it is about fails here rather than passing on nothing. Where the runtime
// breaks a rule today, the file is a finding (D10, below) in RUNG_FINDINGS, fixed in its own
// pull request and never here; the test fails when that list changes.
//
// THE MIRROR GATE. The mapping step measures each line's box, alignment and insets on its own
// render of the artwork (`stageMeasure.ts`: `panelOfEachLine`, `withoutBackplates`, `boxFitOf`),
// and the runtime measures the same things in the graphic (`svgFitContainer`, `svgAlignOf`,
// `measureSvgRoom`). The two cannot share code, so this compares them for every bound line of every
// corpus file, twice: which BOX each side chose, and, on the runtime's box, what each side READS
// (the box in the line's own units, the alignment, the nudge and the inset on each axis). A
// disagreement is a finding (docs/work-specs/svg-import-engine/spec.md D10): listed in
// MIRROR_FINDINGS below and printed on every run, never fixed here. The test fails only when the
// list changes (compared on Linux, where CI runs it: MIRROR_PINNED), so a new drift cannot land
// silently and a fixed one is taken off on purpose.
//
//   node --test scripts/svg-fit-rungs.test.mjs
//   SVG_FIT_RUNGS_SHOW=1 node --test scripts/svg-fit-rungs.test.mjs   # print every mirror finding as code to paste
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { LADDER_VALUES } from './ladder-values.mjs';
import { measured } from './measured.mjs';

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const CORPUS = root('e2e/fixtures/svg-corpus/');
const FONTS_DIR = root('public/fonts/');
const RUNTIME = root('src/templates/importedDesign/runtime/');
/** The origin the bundled font files are served from inside the page. Never a real host. */
const ORIGIN = 'http://svg-fit-rungs.harness';
/** A rule must reach at least this many corpus files, or it is not testing the corpus. */
const MIN_FILES = 10;
/** THE MIRROR'S RECORD IS LINUX'S, where CI runs it. Two lines sit on an edge another platform's
 *  glyph hinting crosses (a webfont's fallback moves which plate the step groups a line under; an
 *  inset lands either side of its tolerance), so elsewhere the findings are measured and their
 *  differences listed in the skip message, not compared - the pass harness's RUNTIME_PINNED rule. */
const MIRROR_PINNED = process.platform === 'linux';
/** What the step and the runtime were last recorded disagreeing about (D10). Re-recorded on purpose,
 *  with the reason in the pull request: SVG_FIT_RUNGS_SHOW=1 prints the list as code. Issue #1145. */
const MIRROR_FINDINGS = [
  'affinity-point-sized-nameplate f0: law: inset y',
  'effects-css-import-webfont f0: box: the step groups it under no box, the runtime measures it in one',
  'effects-css-import-webfont f1: box: the step groups it under no box, the runtime measures it in one',
  'effects-css-import-webfont f1: law: inset y',
  'effects-external-ref-and-script f0: box: the step groups it under no box, the runtime measures it in one',
  'effects-external-ref-and-script f1: box: the step groups it under no box, the runtime measures it in one',
  'effects-external-ref-and-script f1: law: inset y',
  'effects-figma-masked-reveal f0: law: inset y',
  'effects-gradient-shadow-lower-third f0: law: inset y',
  'effects-symbol-library-ticker f0: law: inset x (penned by a neighbour)',
  'figma-centred-title-card f0: law: inset y',
  'figma-duplicate-ids-scorebug f0: law: inset x (penned by a neighbour)',
  'figma-duplicate-ids-scorebug f2: law: inset x (penned by a neighbour)',
  'figma-embedded-raster-card f0: law: inset y',
  'figma-frame-export-lower-third f0: law: inset y',
  'figma-offset-centred-endboard f0: law: inset y',
  'figma-photo-strap-backplate f0: law: inset y',
  'geometry-optimized-no-ids f1: law: inset y',
  'geometry-optimized-no-ids f2: law: inset y',
  'geometry-percent-viewport-strap f0: law: inset x (penned by a neighbour), inset y',
  'geometry-percent-viewport-strap f1: law: inset y',
  'illustrator-embedded-image-card f0: law: inset y',
  'illustrator-four-team-scoreboard f1: law: inset x, inset y',
  'illustrator-four-team-scoreboard f2: law: inset y',
  'illustrator-four-team-scoreboard f3: law: inset x, inset y',
  'illustrator-four-team-scoreboard f4: law: inset y',
  'illustrator-four-team-scoreboard f5: law: inset x',
  'illustrator-four-team-scoreboard f7: law: inset x',
  'illustrator-internal-css-lower-third f0: law: inset y',
  'illustrator-kerned-headline f0: box: the step and the runtime choose different boxes',
  'illustrator-kerned-headline f1: box: the step groups it under no box, the runtime measures it in one',
  'illustrator-mixed-outlines f0: law: nudge x, inset y',
  'illustrator-owner-quiz-board-rotated f1: law: inset y',
  'illustrator-owner-quiz-board-rotated f3: law: inset y',
  'illustrator-owner-quiz-board-rotated f4: law: inset y',
  'illustrator-question-timer-board f2: law: inset y',
  'illustrator-quiz-board-multiline f0: law: nudge x, inset y',
  'illustrator-rotated-sidebar-strip f0: law: inset x, inset y',
  'illustrator-save-as-foreignobject f0: law: inset y',
  'illustrator-save-as-quiz-board f0: law: inset x (penned by a neighbour), inset y',
  'illustrator-scoreboard-lower-third f1: law: inset x (penned by a neighbour)',
  'illustrator-scoreboard-lower-third f3: law: inset x (penned by a neighbour)',
  'inkscape-flowed-text-card f0: law: inset y',
  'inkscape-flowed-text-card f1: law: inset y',
  'inkscape-lower-third-layers f0: law: inset y',
  'inkscape-millimetre-scorebug f0: law: inset x (penned by a neighbour)',
  'inkscape-millimetre-scorebug f1: law: inset x (penned by a neighbour)',
  'inkscape-millimetre-scorebug f2: law: inset x (penned by a neighbour)',
  'inkscape-text-on-path-bumper f1: box: the step groups it under no box, the runtime measures it in one',
  'logo-square-badge f0: law: inset y',
  'nested-svg-sub-artboard f0: box: the step groups it under no box, the runtime measures it in one',
  'nested-svg-sub-artboard f1: box: the step groups it under no box, the runtime measures it in one',
  'nested-svg-sub-artboard f1: law: inset y',
  'no-viewbox-px-and-pt f0: law: inset y',
  'no-viewbox-px-and-pt f2: law: inset y',
  'origin-shifted-quiz-board f0: box: the step groups it under no box, the runtime measures it in one',
  'student-illustrator-scoreboard f0: law: inset x (penned by a neighbour)',
  'student-illustrator-scoreboard f1: law: inset x (penned by a neighbour)',
  'ticker-strip-3840 f1: box: the step groups it under no box, the runtime measures it in one',
  'ticker-strip-3840 f1: law: inset x (penned by a neighbour)',
  'ticker-strip-3840 f2: box: the step groups it under no box, the runtime measures it in one',
];
const RULES = ['room', 'snap', 'margin', 'settle', 'fits', 'floors'];
/** The corpus files on which the runtime breaks a rung today (D10), by rung: room #1148 and #1144, settle #1143. */
const RUNG_FINDINGS = {
  room: ['effects-symbol-library-ticker', 'illustrator-rotated-sidebar-strip'],
  settle: [
    'effects-smil-animated-bug',
    'figma-offset-centred-endboard',
    'geometry-optimized-no-ids',
    'illustrator-embedded-image-card',
    'illustrator-four-team-scoreboard',
    'illustrator-mixed-outlines',
    'inkscape-text-on-path-bumper',
    'logo-small-favicon',
    'logo-tall-crest',
    'logo-transparent-ground',
    'nested-svg-sub-artboard',
    'ticker-strip-3840',
  ],
};

const SPECS = [
  ['assets/svgImport.ts', 'NOACG_SVG'],
  ['components/wizard/import/draft.ts', 'NOACG_DRAFT'],
  ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
  ['components/wizard/import/stageMeasure.ts', 'NOACG_STAGE'],
  ['model/fonts.ts', 'NOACG_FONTS'],
].map(([rel, globalName]) => ({ entry: root(`src/${rel}`), globalName }));

const corpus = readdirSync(CORPUS)
  .filter((f) => f.endsWith('.svg') && existsSync(`${CORPUS}${f.replace(/\.svg$/, '.expect.json')}`))
  .map((f) => ({
    name: f.replace(/\.svg$/, ''),
    markup: readFileSync(`${CORPUS}${f}`, 'utf8'),
    refuses: JSON.parse(readFileSync(`${CORPUS}${f.replace(/\.svg$/, '.expect.json')}`, 'utf8')).expect?.accepted === false,
  }))
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

// ── THE RUNTIME, FILLED AS svg.ts FILLS IT ────────────────────────────────────────────────────
// The token values are read from the files that declare them, and the page checks that every
// filled text is in the template the real build emitted, so this runs the shipped bytes or fails.
function constant(rel, name) {
  const m = new RegExp(`export const ${name} = (?:'([^']*)'|([0-9.]+));`).exec(readFileSync(root(rel), 'utf8'));
  if (!m) throw new Error(`${rel} declares no ${name}`);
  return m[1] ?? m[2];
}
const TOKENS = {
  PREFIX: constant('src/templates/importedDesign/shared.ts', 'PREFIX'),
  SVG_ALIGN_TOL: constant('src/templates/importedDesign/svg.ts', 'SVG_ALIGN_TOL'),
  SVG_LINE_HEIGHT: constant('src/templates/importedDesign/svg.ts', 'SVG_LINE_HEIGHT'),
  LAYOUT_EL_ATTR: constant('src/templates/importedDesign/svgLayout.ts', 'LAYOUT_EL_ATTR'),
};
function filled(file) {
  let out = readFileSync(`${RUNTIME}${file}`, 'utf8').replace(/\r\n/g, '\n');
  for (const [name, value] of Object.entries(TOKENS)) out = out.split(`__${name}__`).join(value);
  const unfilled = /__[A-Z][A-Z0-9_]*__/.exec(out);
  if (unfilled) throw new Error(`${file}: ${unfilled[0]} has no value`);
  return out;
}
const CODE = { fit: filled('svgFit.js'), growth: filled('svgGrowth.js'), shapes: filled('svgShapeShift.js') };

/** Runs in the browser: one corpus file built as the wizard builds it, the step's mirror measured
 *  on the step's own stage, then the runtime loaded alone over the bound artwork and every rung
 *  driven and checked. Returns the observations; the assertions are made in Node. */
const RUNG = async ({ markup, origin, ladder, prefix, ruleNames }) => {
  const code = window.__RUNG_CODE;               // the filled runtime, sent once (below)
  const { NOACG_SVG: R, NOACG_DRAFT: D, NOACG_STAGE: S, NOACG_IMPORTED: B, NOACG_FONTS: FONTS } = window;
  let svg;
  try {
    svg = R.importSvgMarkup(markup);
  } catch (e) {
    return { refused: String(e && e.message ? e.message : e) };
  }
  const draft = D.svgDraftFromImport(svg, { resolution: { width: 1920, height: 1080 }, previous: { name: '', designSvg: null } });
  const dsvg = draft.designSvg;
  const inter = FONTS.fontById('inter').file;
  const face = (family, file) =>
    `@font-face{font-family:"${family}";src:url("${origin}/fonts/${file}") format("woff2");font-weight:100 900;}`;
  const stageFaces = draft.svgFonts.map((f) => face(f.family, f.fontId ? FONTS.fontById(f.fontId).file : inter)).join('\n');
  const unresolvedFaces = draft.svgFonts.filter((f) => !f.fontId).map((f) => face(f.family, inter)).join('\n');

  // ── THE STEP'S STAGE, as `MapSvgFieldsStep.tsx` renders and reads it (and as the pass harness
  // does): text outside the frame taken off, the growth default its effect proposes.
  const style = document.createElement('style');
  style.textContent = `${stageFaces}
.map-svg-stage svg{display:block;width:100%;height:auto;}
.map-svg-stage[data-reveal] svg *{display:inline !important;visibility:visible !important;}`;
  document.head.appendChild(style);
  const stage = document.createElement('div');
  stage.className = 'map-svg-stage';
  stage.style.cssText = `position:absolute;left:-20000px;top:0;width:${dsvg.width}px;`;
  stage.innerHTML = dsvg.markup;
  document.body.appendChild(stage);
  stage.getBoundingClientRect();
  await document.fonts.ready;
  const ids = [...new Set([...dsvg.groups, ...dsvg.shapes, ...dsvg.candidates, ...dsvg.images, ...dsvg.outlines].map((c) => c.id))];
  const boxes = S.measureBoxes(stage, ids);
  const frameRect = stage.querySelector('svg')?.getBoundingClientRect();
  const outside = new Set(frameRect ? dsvg.candidates.filter((c) => {
    const b = boxes.get(c.id);
    return b && (b.right <= 0 || b.bottom <= 0 || b.left >= frameRect.width || b.top >= frameRect.height);
  }).map((c) => c.id) : []);
  if (draft.svgFields.some((f) => f.on && outside.has(f.candidateId))) {
    draft.svgFields = draft.svgFields.map((f) => (outside.has(f.candidateId) ? { ...f, on: false, whenOff: 'keep' } : f));
  }
  const onIds = draft.svgFields.filter((f) => f.on).map((f) => f.candidateId);
  const banner = S.proposeBannerGrowth(stage, dsvg, onIds);
  const holders = S.panelsHoldingText(stage, dsvg, onIds, []);
  const grows = !!banner && !draft.svgBehaviour && !S.repeatsWithNewContent(stage, holders);
  draft.svgStretch = grows ? { on: true, shapeId: banner, axis: 'xy' } : { on: false, shapeId: banner ?? dsvg.shapes[0]?.id ?? null };

  // THE STEP'S HALF OF THE MIRROR: the box each row is grouped under and what `boxFitOf` reads in
  // it, exactly as the step's layout effect asks (every text row, ticked or not, for the grouping).
  const allMarkerIds = [
    ...draft.svgFields.map((f) => f.candidateId),
    ...draft.svgOutlines.filter((f) => f.box).map((f) => f.candidateId),
  ];
  const grouped = S.withoutBackplates(stage, S.panelOfEachLine(stage, dsvg, allMarkerIds));
  const SHAPES = 'rect, path, polygon, ellipse, circle';
  const stageShapes = [...stage.querySelector('svg').querySelectorAll(SHAPES)];
  const shapeIndex = (el) => (el ? stageShapes.indexOf(el) : -1);
  const markerEl = (id) => stage.querySelector(`[data-noacg-candidate="${id}"]`);
  const fitWords = (fit) => fit && {
    box: { x: fit.box.x, y: fit.box.y, w: fit.box.width, h: fit.box.height },
    h: fit.drawn.h, v: fit.drawn.v, nudgeX: fit.nudge.x, nudgeY: fit.nudge.y, insetX: fit.insetX, insetY: fit.insetY, type: fit.type,
  };
  // The runtime's own box is offered to `boxFitOf` under a marker of its own, which is how the
  // step names a box: the law is then compared on one box, whichever box each side would choose.
  const stepOn = (lineId, shapeIdx) => {
    const el = stageShapes[shapeIdx];
    if (!el) return null;
    const was = el.getAttribute('data-noacg-candidate');
    el.setAttribute('data-noacg-candidate', '__mirror__');
    try {
      return fitWords(S.boxFitOf(stage, lineId, '__mirror__'));
    } finally {
      if (was == null) el.removeAttribute('data-noacg-candidate');
      else el.setAttribute('data-noacg-candidate', was);
    }
  };
  const options = D.svgDesignOptions(draft);
  const lineOf = options.fields.map((f, i) => ({ id: `f${i}`, candidateId: f.candidateId }));
  const stepSide = {};
  for (const l of lineOf) {
    const boxId = grouped[l.candidateId] ?? null;
    // -1: no box; -2: a box that is not a shape (a group), which the runtime never measures in;
    // -3: a box the step names and its stage does not hold.
    const boxEl = boxId ? markerEl(boxId) : null;
    stepSide[l.id] = {
      boxIndex: !boxId ? -1 : !boxEl ? -3 : shapeIndex(boxEl) < 0 ? -2 : shapeIndex(boxEl),
      candidateId: l.candidateId,
    };
  }

  // ── BUILD, as the harness and the wizard build it.
  let template = B.IMPORTED_SVG.create({ designSvg: options });
  template = D.withSvgImportPasses(template, draft);
  // The table rides for a growth rule OR a line an author aligned; the growth runtime and its
  // shifters only for a rule (svg.ts), so the page loads what the template carries.
  const table = (template.js.match(/var NOACG_LAYOUT = \{[\s\S]*?\n\};/) || [null])[0];
  const shipped = { fit: template.js.includes(`\n${code.fit}`) };

  // ── THE RUNG PAGE: the template's css, the bound artwork and its placed lines, no script.
  const parsed = new DOMParser().parseFromString(template.html, 'text/html');
  for (const s of [...parsed.querySelectorAll('script')]) s.remove();
  document.getElementById('rung')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'rung';
  frame.style.cssText = `position:fixed;left:0;top:0;width:${template.resolution.width}px;height:${template.resolution.height}px;border:0;`;
  await new Promise((resolve) => {
    frame.onload = resolve;
    frame.srcdoc = `<!doctype html><html><head><base href="${origin}/"><style>${unresolvedFaces}</style><style>${template.css}</style></head><body>${parsed.body.innerHTML}</body></html>`;
    document.body.appendChild(frame);
  });
  const w = frame.contentWindow;
  const doc = w.document;
  doc.body.getBoundingClientRect();
  await Promise.all([...doc.fonts].map((f) => f.load().catch(() => null)));
  await doc.fonts.ready;

  const art = doc.querySelector(`.${prefix}-art`);
  const box = doc.querySelector(`.${prefix}-box`);
  const artShapes = [...art.querySelectorAll(SHAPES)];
  // The two renders are one parse of one markup, so a shape is the same shape at the same index.
  const sameShapes = artShapes.length === stageShapes.length
    && artShapes.every((el, i) => el.tagName === stageShapes[i].tagName);

  // LOAD THE RUNTIME, in the order the template carries it: the fit (its parse-time pass records
  // the drawn values), the table, and the growth and its shifters only where a rule exists.
  w.eval(code.fit);
  if (table) w.eval(table);
  const rules = !!table && w.NOACG_LAYOUT.rules.length > 0;
  shipped.growth = template.js.includes(`\n${code.growth.replace(/\n$/, '')}`) === rules;
  shipped.shapes = !rules || template.js.includes(`\n${code.shapes}`);
  if (rules) {
    w.eval(code.shapes);
    w.eval(code.growth);
  }
  const nodes = w.svgFitNodes();
  /** Every attribute of everything drawn that is not a bound line - what may never move at rest. */
  const lineSet = new Set(nodes);
  const inLine = (el) => {
    for (let n = el; n && n !== art; n = n.parentNode) if (lineSet.has(n)) return true;
    return false;
  };
  const furniture = () => [...art.querySelectorAll('*')]
    .filter((el) => !inLine(el))
    .map((el) => [...el.attributes].map((a) => `${a.name}=${a.value}`).join(' '))
    .join('\n');
  const pristineFurniture = furniture();
  const drawnNodes = nodes.filter((el) => !w.svgFitPlaced(el));
  // A bound field drawn as SVG text that the fit does not walk would drop out of every rung.
  const unfitted = lineOf.filter((l) => {
    const el = art.querySelector(`[id="${l.id}"]`);
    return el && /^(text|tspan)$/i.test(el.tagName) && !nodes.includes(el);
  }).map((l) => l.id);
  const r2 = (n) => Math.round(n * 100) / 100;
  const rect = (el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
  };

  // THE FIRST PASS, taken apart where the mirror reads it: rest and measure, then the box each line
  // was measured in (nothing has moved yet - the anchors are written by the fit, not the measure).
  w.svgRestAndMeasure();
  const runtimeSide = {};
  const containers = {};
  const restLocal = {};
  const neighbours = {};
  for (const el of drawnNodes) {
    const align = w.svgFitAlign[el.id];
    const room = w.svgFitRoom[el.id];
    if (!align || !room) { runtimeSide[el.id] = { measured: false }; continue; }
    const panel = w.svgFitContainer(el);
    const local = panel ? w.svgLocalBox(panel, el) : null;
    containers[el.id] = panel;
    restLocal[el.id] = local;
    // The neighbour that pens a line, found the way its room found it.
    // Kept as the element, so its edge is read where it stands after a panel has grown.
    if (panel && room.penned) {
      const edge = w.svgFitNeighbour(el, panel.getBoundingClientRect()).edge;
      neighbours[el.id] = [...art.querySelectorAll(`text, tspan, image, ${SHAPES}`)]
        .find((o) => o !== el && !o.contains(el) && !el.contains(o) && Math.abs(o.getBoundingClientRect().left - edge) < 0.01);
    }
    const own = el.getBBox();
    const b = local;                              // the box, in the line's own units
    // The inset the runtime's room keeps, on each axis, read back off the room it measured: the
    // margin left between the room's far end and the box, on the side a longer value fills.
    let insetX = null;
    let insetY = null;
    if (b) {
      const W = room.width;
      if (align.h === 'middle') insetX = Math.min(align.anchor - b.left, b.right - align.anchor) - W / 2;
      else if (align.h === 'end') insetX = (align.anchor != null ? align.anchor : own.x + own.width) - b.left - W;
      else insetX = b.right - (align.anchor != null ? align.anchor : own.x) - W;
      const band = align.band || { top: b.top, bottom: b.bottom, cy: b.cy };
      if (align.v === 'middle') {
        const mid = align.boxCy != null ? align.boxCy : band.cy;
        insetY = Math.min(mid - band.top, band.bottom - mid) - room.height / 2;
      } else if (align.v === 'bottom') insetY = room.top + own.height - room.height - band.top;
      else insetY = band.bottom - (room.top + room.height);
      insetX = Math.max(0, insetX);
      insetY = Math.max(0, insetY);
    }
    const shapeIdx = panel ? artShapes.indexOf(panel) : -1;
    runtimeSide[el.id] = {
      measured: true,
      boxIndex: shapeIdx,
      penned: !!room.penned,
      read: b && {
        box: { x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top },
        h: { start: 'left', middle: 'centred', end: 'right' }[align.h],
        v: align.v,
        // Sideways the runtime keeps a nudge only for a middle line; downwards for a middle block.
        nudgeX: align.h === 'middle' ? align.nudge || 0 : 0,
        nudgeY: align.v === 'middle' ? align.nudgeY || 0 : 0,
        insetX,
        insetY,
      },
      // The step's law on the runtime's own box.
      stepLaw: shapeIdx >= 0 && sameShapes ? stepOn(stepSide[el.id]?.candidateId, shapeIdx) : null,
    };
  }
  stage.remove();
  style.remove();
  w.fitSvgText();
  w.refitSvgText();                               // the load pass and the fonts.ready pass

  // ── THE RUNGS.
  const rulesOut = Object.fromEntries(ruleNames.map((n) => [n, []]));
  const exercised = Object.fromEntries(ruleNames.map((n) => [n, false]));
  // Where each line is painted at rest, holding the drawn value.
  const restRects = {};
  for (const el of drawnNodes) if (w.svgFitLaidOut(el)) restRects[el.id] = rect(el);
  const say = (rule, s) => { if (rulesOut[rule].length < 6) rulesOut[rule].push(s); };
  const sizeOf = (el) => parseFloat(el.style.fontSize) || w.svgFitSizes[el.id] || 0;
  const squeezed = (el) => [el, ...el.children].filter((k) => k.hasAttribute && k.hasAttribute('textLength'));
  const painted = () => box.innerHTML + JSON.stringify(w.svgFitOver);
  const layoutEls = rules ? w.NOACG_LAYOUT.rules.map((rule) => w.svgLayoutEl(rule.el)) : [];

  // AT REST the artwork is the design: nothing grown, nothing shrunk, squeezed or reported.
  if (furniture() !== pristineFurniture) say('fits', 'rest: the artwork outside its lines is not as drawn');
  for (const el of nodes) {
    if (!w.svgFitLaidOut(el)) continue;
    if (el.style.fontSize || squeezed(el).length || w.svgFitOver[el.id]) say('fits', `rest: ${el.id} is not at its drawn size`);
  }
  // The geometry each rule reads at rest, before any value. What MOVES with a rule is its element
  // and its followers, as one rectangle (the runtime's svgMovingBox).
  const artRect = rect(art);
  const movingBox = (el, i) => {
    const rest = w.svgGrowRest[i];
    const rs = [el, ...((rest && rest.followers) || []).map((f) => f.el)].map(rect).filter((r) => r.width > 0 && r.height > 0);
    return {
      left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)),
      top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)),
    };
  };
  const restRules = layoutEls.map((el, i) => (el ? { panel: rect(el), moving: movingBox(el, i) } : null));
  const values = Object.entries(ladder);
  for (const [key, value] of values) {
    // Does the value fit the room at the drawn size, as one line? Measured on a copy of the line,
    // so the line itself is written only the way update() writes it.
    const fitsRoom = {};
    for (const el of drawnNodes) {
      const room = w.svgFitRoom[el.id];
      if (!room || !w.svgFitLaidOut(el)) continue;
      const copy = el.cloneNode(false);
      copy.removeAttribute('id');
      copy.style.fontSize = '';
      copy.removeAttribute('textLength');
      copy.textContent = value;
      el.parentNode.insertBefore(copy, el);
      fitsRoom[el.id] = copy.getComputedTextLength() <= room.width - 0.5;
      copy.remove();
    }
    for (const el of nodes) el.textContent = value;
    w.fitSvgText();
    const first = painted();

    // SETTLE: the same value again, and a full re-measure, change nothing.
    w.fitSvgText();
    const second = painted();
    w.refitSvgText();
    const third = painted();
    if (nodes.length) exercised.settle = true;
    // Where two paintings first differ, so a broken settle says what moved.
    const where = (a, b) => { let i = 0; while (a[i] === b[i]) i++; return `at ${JSON.stringify(a.slice(Math.max(0, i - 60), i + 40))} -> ${JSON.stringify(b.slice(Math.max(0, i - 60), i + 40))}`; };
    if (second !== first) say('settle', `${key}: a second fitSvgText moved the artwork ${where(first, second)}`);
    if (third !== first) say('settle', `${key}: refitSvgText moved the artwork ${where(first, third)}`);

    // FITS: a value the room holds stays as drawn, and when every line holds it nothing moves.
    // A placed line asks its panel for growth by its own slot, so only an all-drawn design is asked.
    let allFit = Object.keys(fitsRoom).length > 0 && nodes.length === drawnNodes.length;
    for (const el of drawnNodes) {
      if (!(el.id in fitsRoom)) continue;
      if (!fitsRoom[el.id]) { allFit = false; continue; }
      exercised.fits = true;
      const lines = el.querySelectorAll('tspan[data-noacg-line]').length;
      if (el.style.fontSize || squeezed(el).length || w.svgFitOver[el.id] || lines > 1) {
        say('fits', `${key}: ${el.id} holds the value at its drawn size, yet was ${el.style.fontSize ? `set to ${el.style.fontSize}` : lines > 1 ? `wrapped onto ${lines} lines` : 'squeezed or reported'}`);
      }
    }
    if (allFit && furniture() !== pristineFurniture) say('fits', `${key}: every line holds the value, yet the artwork moved`);

    // FLOORS: never below 30%, reported below 55%, squeezed no narrower than 70% and reported.
    for (const el of nodes) {
      if (!w.svgFitLaidOut(el) || !w.svgFitRoom[el.id]) continue;
      const drawn = w.svgFitSizes[el.id];
      if (!(drawn > 0)) continue;
      const ratio = sizeOf(el) / drawn;
      const over = !!w.svgFitOver[el.id];
      if (over) exercised.floors = true;
      if (ratio < 0.3 - 0.001) say('floors', `${key}: ${el.id} shrank to ${Math.round(ratio * 100)}%, under the 30% floor`);
      if (ratio < 0.55 - 0.001 && !over) say('floors', `${key}: ${el.id} shrank to ${Math.round(ratio * 100)}% and was not reported`);
      for (const k of squeezed(el)) {
        if (!over) say('floors', `${key}: ${el.id} is squeezed and was not reported`);
        const plain = k.cloneNode(true);
        plain.removeAttribute('id');
        plain.removeAttribute('textLength');
        plain.removeAttribute('lengthAdjust');
        k.parentNode.insertBefore(plain, k.nextSibling);
        const natural = plain.getComputedTextLength();
        plain.remove();
        const given = parseFloat(k.getAttribute('textLength'));
        if (given < natural * 0.7 - 0.05) say('floors', `${key}: ${el.id} squeezed to ${Math.round((100 * given) / natural)}% of its advance, past the 70% floor`);
      }
    }

    // ROOM: a line stays inside its box sideways and short of a neighbour that pens it, unless it
    // is reported too long. A line the designer drew past either may stand where it was drawn.
    for (const el of drawnNodes) {
      const panel = containers[el.id];
      if (!panel || !restRects[el.id] || w.svgFitOver[el.id] || !w.svgFitLaidOut(el)) continue;
      exercised.room = true;
      const now = rect(el);
      const drawn = restRects[el.id];
      const p = rect(panel);
      const pen = neighbours[el.id];
      const right = Math.max(pen ? Math.min(rect(pen).left, p.right) : p.right, drawn.right);
      const left = Math.min(p.left, drawn.left);
      if (now.right > right + 1) {
        say('room', `${key}: ${el.id} paints to ${r2(now.right)}, past ${pen ? 'the neighbour that pens it' : 'its box'} at ${r2(right)}`);
      }
      if (now.left < left - 1) say('room', `${key}: ${el.id} paints from ${r2(now.left)}, left of its box at ${r2(left)}`);
    }

    // SNAP: a centred line stays on its box's middle, sideways and down.
    for (const el of drawnNodes) {
      const align = w.svgFitAlign[el.id];
      const panel = containers[el.id];
      if (!align || !panel || !w.svgFitLaidOut(el)) continue;
      const local = w.svgLocalBox(panel, el);
      const bb = el.getBBox();
      if (!local || !(bb.width > 0)) continue;
      const tol = 1;
      // SNAPPED: the anchor svgAlignOf wrote is the box's own middle - a line drawn and read as
      // centred. A stated middle drawn elsewhere keeps where it was drawn and is not a snap.
      const rest = restLocal[el.id];
      if (align.h === 'middle' && rest && align.anchor != null && Math.abs(align.anchor - rest.cx) < 0.01) {
        exercised.snap = true;
        if (el.getAttribute('text-anchor') !== 'middle') say('snap', `${key}: ${el.id} is centred and anchored "${el.getAttribute('text-anchor')}"`);
        // Where the box's middle is NOW, which a panel widening one way has moved.
        const off = bb.x + bb.width / 2 - local.cx;
        if (Math.abs(off) > tol) say('snap', `${key}: ${el.id} sits ${r2(off)} off its box's middle sideways`);
      }
      // Downwards, on a design that does not grow: a panel that grew taller carries the block by
      // a transform the line's own box does not see.
      if (!rules && align.v === 'middle' && align.boxCy != null && el.querySelector('tspan[data-noacg-line]')) {
        exercised.snap = true;
        const off = bb.y + bb.height / 2 - align.boxCy;
        if (Math.abs(off) > tol) say('snap', `${key}: ${el.id} sits ${r2(off)} off its band's middle vertically`);
      }
    }

    // MARGIN: growth stops at the design's own margin, mirrored, and inside the frame.
    layoutEls.forEach((el, i) => {
      const rest = restRules[i];
      if (!el || !rest) return;
      const rule = w.NOACG_LAYOUT.rules[i];
      const now = rect(el);
      const m = movingBox(el, i);
      const y = rule.axis === 'y';
      const span = y ? artRect.height : artRect.width;
      const lo = y ? 'top' : 'left';
      const hi = y ? 'bottom' : 'right';
      const grewLo = rest.panel[lo] - now[lo] > 0.5;
      const grewHi = now[hi] - rest.panel[hi] > 0.5;
      if (!grewLo && !grewHi) return;
      exercised.margin = true;
      const safe = span * rule.safe;
      // An author's cap replaces the mirrored margin; the safe margin floors either (svgCapMargin).
      const capped = rule.cap != null ? Math.max(span * rule.cap, safe) : null;
      if (m[lo] < artRect[lo] - 1 || m[hi] > artRect[hi] + 1) say('margin', `${key}: rule ${i} grew out of the frame`);
      // How far the moving edge stands from the frame, now and at rest, on one side.
      const inset = (box, side) => (side === lo ? box[lo] - artRect[lo] : artRect[hi] - box[hi]);
      if (grewLo && grewHi) {
        // From the middle: the nearer margin, spent half on each side.
        const room = Math.max(0, Math.min(inset(rest.moving, lo), inset(rest.moving, hi)) - (capped ?? safe));
        if (inset(rest.moving, lo) - inset(m, lo) > room + 1 || inset(rest.moving, hi) - inset(m, hi) > room + 1) {
          say('margin', `${key}: rule ${i} widened from its middle past its nearer margin`);
        }
      } else {
        // One way: the margin the panel keeps on the side it is anchored to, mirrored.
        const side = grewHi ? hi : lo;
        const keep = capped ?? Math.max(inset(rest.panel, side === hi ? lo : hi), safe);
        if (inset(m, side) < Math.min(keep, inset(rest.moving, side)) - 1) {
          say('margin', `${key}: rule ${i} grew to ${r2(inset(m, side))} from the frame, inside the ${r2(keep)} it mirrors`);
        }
      }
    });
  }

  // Back to the drawn values: the artwork comes back to the design (svgLayoutRest).
  for (const el of nodes) el.textContent = w.svgFitDrawn[el.id];
  w.refitSvgText();
  if (furniture() !== pristineFurniture) say('fits', 'the drawn values again: the artwork did not come back to the design');
  frame.remove();

  return { shipped, sameShapes, unfitted, penned: Object.keys(neighbours).length, lines: lineOf.map((l) => l.id), stepSide, runtimeSide, rules: rulesOut, exercised };
};

const started = Date.now();
const fontBytes = new Map();
const raws = await withBundledPage(SPECS, async (page) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**/*', (route) => {
    const url = route.request().url();
    const file = url.startsWith(`${ORIGIN}/fonts/`) ? url.slice(`${ORIGIN}/fonts/`.length) : null;
    if (file && /^[a-z0-9-]+\.woff2$/.test(file) && existsSync(`${FONTS_DIR}${file}`)) {
      if (!fontBytes.has(file)) fontBytes.set(file, readFileSync(`${FONTS_DIR}${file}`));
      return route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fontBytes.get(file) });
    }
    return route.abort();
  });
  await page.evaluate((code) => { window.__RUNG_CODE = code; }, CODE);
  const out = {};
  for (const file of corpus) {
    out[file.name] = await page.evaluate(RUNG, { markup: file.markup, origin: ORIGIN, ladder: LADDER_VALUES, prefix: TOKENS.PREFIX, ruleNames: RULES })
      .catch((e) => { throw new Error(`${file.name}: ${e.message}`); });
  }
  return out;
});
const seconds = ((Date.now() - started) / 1000).toFixed(1);
const accepted = corpus.filter((f) => !raws[f.name].refused);
console.log(`[svg-fit-rungs] ${corpus.length} files (${accepted.length} built) in ${seconds} s`);

// ── THE MIRROR, compared ──────────────────────────────────────────────────────────────────────
/** One unit of the line's own space: the box agrees to this, as the same arithmetic on one artwork. */
const UNIT = 1;
const near = (a, b, tol = UNIT) => Math.abs(a - b) <= tol;
/** What the step and the runtime disagree about on one line, as words; empty when they agree. */
function mirrorOf(step, run) {
  if (!run || !run.measured) return { measured: false, box: [], law: [], detail: [] };
  const box = [];
  if (step.boxIndex !== run.boxIndex) {
    box.push(step.boxIndex === -1 ? 'box: the step groups it under no box, the runtime measures it in one'
      : run.boxIndex < 0 ? 'box: the step groups it under a box, the runtime finds none'
      : step.boxIndex === -2 ? 'box: the step groups it under a group, the runtime measures it in a shape'
      : step.boxIndex === -3 ? 'box: the step names a box its stage does not hold'
      : 'box: the step and the runtime choose different boxes');
  }
  const law = [];
  const detail = [];
  const a = run.stepLaw;
  const b = run.read;
  if (a && b) {
    if (!(near(a.box.x, b.box.x) && near(a.box.y, b.box.y) && near(a.box.w, b.box.w) && near(a.box.h, b.box.h))) law.push('box in the line\'s units');
    if (a.h !== b.h) law.push(`h: step ${a.h}, runtime ${b.h}`);
    if (a.v !== b.v) law.push(`v: step ${a.v}, runtime ${b.v}`);
    const n = (v) => Math.round(v * 10) / 10;
    // A margin or a nudge agrees within a tenth of the drawn type: less than that is the wobble
    // between two laws that read one composition, invisible on air, and it moves with a
    // platform's glyph hinting; a quarter of the type is where an offset starts to read
    // (`nudgeOffered`).
    const tol = Math.max(UNIT, a.type / 10);
    if (!near(a.nudgeX, b.nudgeX, tol)) law.push('nudge x');
    if (!near(a.nudgeY, b.nudgeY, tol)) law.push('nudge y');
    if (!near(a.insetX, b.insetX, tol)) law.push(run.penned ? 'inset x (penned by a neighbour)' : 'inset x');
    if (!near(a.insetY, b.insetY, tol)) law.push('inset y');
    // The numbers behind them, printed and not pinned: step -> runtime, in the line's units.
    if (law.length) {
      detail.push(`nudge ${n(a.nudgeX)},${n(a.nudgeY)} -> ${n(b.nudgeX)},${n(b.nudgeY)}; inset ${n(a.insetX)},${n(a.insetY)} -> ${n(b.insetX)},${n(b.insetY)}; ${a.h} ${a.v}, type ${n(a.type)}`);
    }
  } else if (!!a !== !!b) {
    law.push(a ? 'the runtime reads no box' : 'the step reads no box');
  }
  return { measured: true, box, law, detail };
}

const mirror = [];
const mirrorDetail = [];
let mirrorLines = 0;
let agreeing = 0;
let unmeasured = 0;
const sameBox = { yes: 0, no: 0 };
const sameLaw = { yes: 0, no: 0 };
for (const { name } of accepted) {
  const raw = raws[name];
  for (const id of raw.lines) {
    const run = raw.runtimeSide[id];
    if (!run) continue;                           // not a drawn line (a clock display, a credits sample)
    mirrorLines++;
    const m = mirrorOf(raw.stepSide[id], run);
    if (!m.measured) { unmeasured++; continue; }
    (m.box.length ? sameBox.no++ : sameBox.yes++);
    (m.law.length ? sameLaw.no++ : sameLaw.yes++);
    if (!m.box.length && !m.law.length) agreeing++;
    for (const s of [...m.box, ...(m.law.length ? [`law: ${m.law.join(', ')}`] : [])]) mirror.push(`${name} ${id}: ${s}`);
    for (const s of m.detail) mirrorDetail.push(`${name} ${id}: ${s}`);
  }
}
measured(mirrorLines, 'bound lines mirrored');
console.log(`[svg-fit-rungs] mirror: ${mirrorLines} bound lines, ${agreeing} agree on box and law, ${unmeasured} hidden at rest (the runtime cannot measure them); box ${sameBox.yes} agree / ${sameBox.no} differ; law ${sameLaw.yes} agree / ${sameLaw.no} differ`);
console.log(`[svg-fit-rungs] ${mirror.length} mirror findings:\n  ${mirror.join('\n  ')}`);
console.log(`[svg-fit-rungs] the numbers behind the law findings, step -> runtime:\n  ${mirrorDetail.join('\n  ')}`);
if (process.env.SVG_FIT_RUNGS_SHOW === '1') console.log(`const MIRROR_FINDINGS = ${JSON.stringify(mirror, null, 2)};`);

test('the corpus is every file with a sidecar, and each built file runs the runtime it ships', () => {
  assert.ok(corpus.length >= 49, `only ${corpus.length} corpus files`);
  const notShipped = accepted.filter((f) => !Object.values(raws[f.name].shipped).every(Boolean)).map((f) => f.name);
  assert.deepEqual(notShipped, [], 'the filled runtime files are not what the build emitted');
  const unpaired = accepted.filter((f) => !raws[f.name].sameShapes).map((f) => f.name);
  assert.deepEqual(unpaired, [], 'the step\'s stage and the bound artwork do not hold the same shapes');
  // Only a file its sidecar says the door refuses is left out of the rungs and the mirror.
  assert.deepEqual(corpus.filter((f) => raws[f.name].refused).map((f) => f.name), corpus.filter((f) => f.refuses).map((f) => f.name));
  const unfitted = accepted.flatMap((f) => raws[f.name].unfitted.map((id) => `${f.name} ${id}`));
  assert.deepEqual(unfitted, [], 'a bound text field the fit does not walk');
});

for (const rule of RULES) {
  test(`rung "${rule}" holds on every file it reaches but its recorded findings, and on at least ${MIN_FILES}`, () => {
    const reached = accepted.filter((f) => raws[f.name].exercised[rule]).map((f) => f.name);
    const brokenOn = accepted.filter((f) => raws[f.name].rules[rule].length).map((f) => f.name);
    const said = accepted.flatMap((f) => raws[f.name].rules[rule].map((s) => `${f.name}: ${s}`));
    const holds = reached.filter((n) => !brokenOn.includes(n)).length;
    const penned = rule === 'room' ? ` (${accepted.filter((f) => raws[f.name].penned).length} with a line a neighbour pens)` : '';
    console.log(`[svg-fit-rungs] ${rule}: holds on ${holds} of the ${reached.length} files it reaches${penned}${said.length ? `; broken:\n  ${said.join('\n  ')}` : ''}`);
    assert.deepEqual(brokenOn, RUNG_FINDINGS[rule] ?? [], `the files the "${rule}" rung breaks on are not the recorded ones:\n  ${said.join('\n  ')}`);
    assert.ok(holds >= MIN_FILES, `the "${rule}" rung holds on only ${holds} corpus files`);
  });
}

test('the mirror gate covers every bound line', () => {
  assert.ok(mirrorLines > 0, 'no bound line was mirrored');
  // Every line the runtime fits in the artwork has the step's answer beside it.
  const uncovered = accepted.flatMap((f) => Object.keys(raws[f.name].runtimeSide)
    .filter((id) => !raws[f.name].stepSide[id]).map((id) => `${f.name} ${id}`));
  assert.deepEqual(uncovered, [], 'a bound line the step never measured');
});

const mirrorMoved = [
  ...mirror.filter((s) => !MIRROR_FINDINGS.includes(s)).map((s) => `+ ${s}`),
  ...MIRROR_FINDINGS.filter((s) => !mirror.includes(s)).map((s) => `- ${s}`),
];
test('the mirror\'s findings are the recorded ones', {
  skip: MIRROR_PINNED ? false : `not compared on ${process.platform}: the record is Linux's (CI), and ${mirrorMoved.length} finding(s) differ from it here${mirrorMoved.length ? `:\n  ${mirrorMoved.join('\n  ')}` : ''}`,
}, () => {
  assert.deepEqual(mirror, MIRROR_FINDINGS, `the mirror moved:\n  ${mirrorMoved.join('\n  ')}`);
});

