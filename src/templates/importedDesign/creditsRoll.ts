// THE CREDITS ROLL on imported artwork - the engine behind the credits recipe
// (templates/behaviours/credits.ts, docs/END_CREDITS.md "The same field on an imported SVG").
//
// The designer draws ONE text layer named Credits and types a short sample into it: a title line
// ending in ":" and the names under it, in the two looks they want. That layer is the operator's
// field, and the assembler treats it exactly as it treats a countdown's drawn readout: the node
// takes a CLASS instead of the field id (`bindSvgMarkup`), the operator's paste lands in a hidden
// holder, and this engine renders the holder's text into rows styled after the sample. The
// sample stays in the file, hidden on air, so the two looks can be read off it on every rebuild.
//
// THE STYLING IDEA, and the only one a student has to learn: a title line takes the look of the
// sample's first line ending in ":", and a name line takes the look of the line drawn under it.
// The leading is the sample's own: title to name, name to name, and the gap before the next
// title, each read where the sample shows it. The rows are `<tspan>`s inside a copy of the
// sample's own `<text>`, so its transform, its class and its font travel with them, and every
// row carries the attributes of the sample line it copies - Illustrator's per-run class, an
// inline style, a presentation attribute alike.
//
// THE ROLL runs the list from below the window to above it, the whole list, at a pace in LINES
// PER SECOND rather than pixels: a 30px credit and a 60px one read at the same speed. The
// window is the Credits box where one is drawn, else the artwork's own frame, and it is an
// inner `<svg>` viewport rather than a clipPath, so the export carries no id and nothing that
// could be read as a reference. The operator's Scroll speed is a percentage of that pace, with
// the catalog roll's clamp. The travel is measured when the take starts, and a speed retyped
// with the roll on air rescales the running roll from that frame (creditsDataUpdated).
//
// Design-owned JS OUTSIDE the marked ANIMATION region, like the clock engine: the timeline only
// CALLS it (the recipe's entrance names `noacgCreditsRoll`), so a preset swap never rewrites it
// and a reader can change the pace here.

import { SVG_CANDIDATE_ATTR } from '../../assets/svgImport';
import type { DesignSvg } from '../../model/wizard';
import type { CreditsLayout, CreditsPlayback, DesignSvgCredits, DesignSvgCreditsAnchor } from './designTypes';
import {
  CREDITS_BOX_ROLE,
  CREDITS_CARD_SECONDS,
  CREDITS_FIELD_ROLE,
  CREDITS_LAYOUTS,
  CREDITS_PLAYBACKS,
  CREDITS_RECIPE_ID,
  CREDITS_ROLL_CALL,
  CREDITS_SPEED_KEY,
} from '../behaviours/credits';
import { CREDITS_PARSER_JS } from '../endCredits/shared';

/**
 * THE AUTHORED PACE, in lines per second at Scroll speed 100. Chosen so the SVG examples'
 * default credits roll through in about thirty seconds (the owner's brief, 2026-09-24, and a broadcaster's
 * guideline of at most thirty): its 32 lines and section gaps run about 36 lines of leading, its
 * 800-tall Credits box adds 16, and 52 lines at 1.75 a second is 30 s. At 1.35 the same list took
 * 38.8 s (e2e/svg-examples.spec.ts measures the roll). Through a whole 1080 frame at a 52px
 * leading, about thirty lines take thirty seconds. A show that wants it slower types 80 into
 * Scroll speed; the constant is what 100 means.
 */
export const CREDITS_LINES_PER_SECOND = 1.75;

/** The class the drawn Credits text wears instead of a field id: the sample, hidden on air. */
export function creditsClass(prefix: string): string {
  return `${prefix}-credits`;
}

/** The index of the artwork field bound as the credits recipe's Credits text, or -1 when the
 *  design carries no credits roll - which is every import before this existed. */
export function creditsIndex(svg: DesignSvg): number {
  const behaviour = svg.behaviour;
  if (behaviour?.kind !== 'recipe' || behaviour.recipe !== CREDITS_RECIPE_ID) return -1;
  const at = behaviour.fields?.[CREDITS_FIELD_ROLE];
  return typeof at === 'number' && at >= 0 && at < svg.fields.length ? at : -1;
}

/** New imports scroll original artwork. Absence preserves previously saved editable bindings.
 *  A styled binding that cannot build styled builds this too: its declared fallback. */
export function isArtworkCredits(svg: DesignSvg): boolean {
  return creditsEngine(svg) === 'artwork';
}

/** A composed text can expose several field candidates. Protect its entire original subtree,
 *  not just the candidate chosen as Credits, from field writes and automatic text fitting. */
export function creditsArtworkFields(svg: DesignSvg, root?: Element): Set<number> {
  const indices = new Set<number>();
  if (!isArtworkCredits(svg)) return indices;
  const field = svg.fields[creditsIndex(svg)];
  if (!field) return indices;
  const scope = root ?? new DOMParser().parseFromString(svg.markup, 'image/svg+xml').documentElement;
  const selected = scope.querySelector(`[${SVG_CANDIDATE_ATTR}="${field.candidateId}"]`);
  const text = selected?.closest('text') ?? selected;
  if (!text) return indices;
  svg.fields.forEach((candidate, i) => {
    const node = scope.querySelector(`[${SVG_CANDIDATE_ATTR}="${candidate.candidateId}"]`);
    if (node && (node.closest('text') ?? node) === text) indices.add(i);
  });
  return indices;
}

/**
 * The sample as the operator first sees it in the Credits box: one line per drawn baseline.
 * The import's own `sample` joins a block's lines with a SPACE, which is right for a question
 * that wraps and wrong for a list whose line breaks are the format - so the lines are read back
 * off the markup here, grouped by baseline the way the engine below groups them.
 */
export function creditsSampleText(svg: DesignSvg): string {
  const field = svg.fields[creditsIndex(svg)];
  if (!field) return '';
  // Drawn as separate role and name layers, the sample is the list those layers spell.
  const styled = styledCredits(svg);
  if (styled) return styled.list;
  // Memoised on the markup and the layer: `svgFields` is asked several times per assemble, and
  // the wizard's previews assemble on every change, so a large Illustrator export would otherwise
  // be parsed three times over for one string that cannot change between them.
  if (sampleMemo && sampleMemo.markup === svg.markup && sampleMemo.candidateId === field.candidateId) return sampleMemo.text;
  const text = readSampleText(svg.markup, field.candidateId) ?? field.sample;
  sampleMemo = { markup: svg.markup, candidateId: field.candidateId, text };
  return text;
}

let sampleMemo: { markup: string; candidateId: string; text: string } | null = null;

function readSampleText(markup: string, candidateId: string): string | null {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const el = doc.querySelector(`[${SVG_CANDIDATE_ATTR}="${candidateId}"]`);
  const text = el?.closest('text') ?? el;
  if (!text) return null;
  const runs = Array.from(text.children).filter((k) => k.tagName.toLowerCase() === 'tspan');
  if (runs.length === 0) return null;
  const lines: { y: number; text: string }[] = [];
  let prev = 0;
  for (const run of runs) {
    const y = parseFloat(run.getAttribute('y') ?? '');
    const dy = parseFloat(run.getAttribute('dy') ?? '');
    const base = Number.isFinite(y) ? y : prev + (Number.isFinite(dy) ? dy : 0);
    const last = lines[lines.length - 1];
    if (!last || Math.abs(base - last.y) > 0.5) lines.push({ y: base, text: run.textContent ?? '' });
    else last.text += run.textContent ?? '';
    prev = base;
  }
  const drawn = lines.map((l) => ({ y: l.y, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
  if (drawn.length === 0) return null;
  // THE SECTION GAPS THE DESIGNER DREW BECOME BLANK LINES, which is what the format spells a
  // section break as. The steps are read the way the engine reads them - title to name, name
  // to name, the gap before a title - and a step clearly wider than the one expected there (an
  // empty line left before the closing credit) is a break. Without this the closing line joined
  // the last role's names and lost the air the sample gave it.
  const isTitle = (l: { text: string }) => /[:;]$/.test(l.text);
  const titleAt = Math.max(0, drawn.findIndex(isTitle));
  const nameAt = Math.min(titleAt + 1, drawn.length - 1);
  const step = (a: number, b: number, fallback: number) => (b > a && b < drawn.length && drawn[b].y - drawn[a].y > 0 ? drawn[b].y - drawn[a].y : fallback);
  const afterTitle = step(titleAt, nameAt, 0);
  const afterName = step(nameAt, nameAt + 1 < drawn.length && !isTitle(drawn[nameAt + 1]) ? nameAt + 1 : -1, afterTitle);
  const second = drawn.findIndex((l, i) => i > titleAt && isTitle(l));
  const beforeTitle = second > 0 ? step(second - 1, second, afterName) : afterName;
  const out: string[] = [drawn[0].text];
  for (let i = 1; i < drawn.length; i++) {
    const expected = isTitle(drawn[i]) ? beforeTitle : isTitle(drawn[i - 1]) ? afterTitle : afterName;
    if (expected > 0 && drawn[i].y - drawn[i - 1].y > expected * 1.5) out.push('');
    out.push(drawn[i].text);
  }
  return out.join('\n');
}

/** The stylesheet part: the sample is laid out, never painted. */
export function creditsRollCss(prefix: string): string {
  return `/* ── The credits roll ──
   The Credits text you drew is the SAMPLE. It is hidden on air, and its two looks - the first
   line ending in ":" and the line under it - are copied onto every line the operator pastes
   (template.js, "Credits roll"). Delete this rule to see the sample as you drew it. */
.${creditsClass(prefix)} {
  visibility: hidden;              /* laid out, so its looks can be measured; never painted */
}`;
}

/** The engine, emitted once for a design that bound a Credits text. */
export function creditsRollRuntimeJs(prefix: string): string {
  const cls = creditsClass(prefix);
  return `
// ── Credits roll (SVG) ────────────────────────────────────────────────────────
// ONE PASTED LIST rolls through the frame, bottom to top, at the operator's Scroll speed. The
// Credits text you drew is the SAMPLE: it is hidden on air (template.css hides .${cls}) and
// its two looks are copied onto every line the operator pastes. A line ending in ":" is a TITLE
// and takes the look of the sample's first line ending in ":"; every other line is a NAME and
// takes the look of the line drawn under it. Change the sample's font, size or colour in your
// design app and every title and name follows. The rows are rebuilt on every update() and the
// roll restarts on every take. Remove this block and the sample shows as drawn.

// The authored pace at Scroll speed 100, in LINES a second - a 30px credit and a 60px one read
// at the same speed. About thirty lines pass through a 1080 frame in about thirty seconds.
var NOACG_CREDITS_LINES_PER_SECOND = ${CREDITS_LINES_PER_SECOND};

${CREDITS_PARSER_JS}

// creditsSample(): the drawn Credits text - the sample the looks and the leading are read from.
function creditsSample() {
  return document.querySelector('.${cls}');
}

${creditsFieldJs()}

// creditsLength(el, name, fallback): one positional attribute of a run, in user units. A
// designer's file may state a step in ems ("dy=1.2em", the SVG idiom Inkscape and hand-written
// files use), and a unit read as a bare number would stack every row a unit apart.
function creditsLength(el, name, fallback) {
  var raw = el.getAttribute(name);
  if (raw === null || raw.trim() === '') return fallback;
  var n = parseFloat(raw);
  if (!isFinite(n)) return fallback;
  if (/em\\s*$/i.test(raw)) return n * (parseFloat(getComputedStyle(el).fontSize) || 16);
  return n;
}

// creditsSampleLines(sample): the sample's lines, one per baseline. Illustrator writes a line
// as one tspan, or as several runs on one y where it kerned a pair, so runs are joined by
// baseline. Each line keeps the x it starts at (the text's own where the run states none),
// its baseline, its runs, and the FIRST run - whose attributes are the look a row of that kind
// is painted with. Blank lines are dropped; they still show in the gaps measured around them.
function creditsSampleLines(sample) {
  var lines = [];
  var kids = sample.children;
  var prev = null;
  var textX = creditsLength(sample, 'x', 0);
  for (var i = 0; i < kids.length; i++) {
    var run = kids[i];
    if ((run.tagName || '').toLowerCase() !== 'tspan') continue;
    var y = creditsLength(run, 'y', NaN);
    var base = isFinite(y) ? y : prev === null ? 0 : prev + creditsLength(run, 'dy', 0);
    var last = lines[lines.length - 1];
    if (!last || Math.abs(base - last.y) > 0.5) {
      lines.push({ y: base, x: creditsLength(run, 'x', textX), text: run.textContent, run: run, runs: [run] });
    } else {
      last.text += run.textContent;
      last.runs.push(run);
    }
    prev = base;
  }
  // A sample typed as plain text with no runs at all is one line, in the text's own look.
  if (!lines.length) {
    lines.push({ y: 0, x: textX, text: sample.textContent, run: null, runs: [] });
  }
  var out = [];
  for (var j = 0; j < lines.length; j++) {
    lines[j].text = String(lines[j].text).replace(/\\s+/g, ' ').trim();
    if (lines[j].text) out.push(lines[j]);
  }
  return out;
}

// creditsLineWidth(line): the width of one sample line, in the artwork's own units. Needs a
// laid-out sample; answers 0 before there is one.
function creditsLineWidth(line) {
  var width = 0;
  for (var i = 0; i < line.runs.length; i++) {
    if (line.runs[i].getComputedTextLength) width += line.runs[i].getComputedTextLength();
  }
  return width;
}

// creditsAnchor(sample, lines): how the sample's lines line up, read off the drawing. Illustrator
// centres a block by giving every line its own x - half its width left of the text's origin -
// and states no text-anchor, so the lines of a centred sample start at different x. Lines that
// all start at one x are left-aligned and keep it; lines whose middles agree are centred on that
// middle; lines whose right edges agree are right-aligned on that edge. A stated text-anchor is
// the file saying so and is kept as is. Widths need a laid-out sample, so nothing is decided
// (and nothing remembered) until there is one - the next rebuild asks again.
function creditsAnchor(sample, lines) {
  var stated = getComputedStyle(sample).textAnchor;
  if ((stated && stated !== 'start') || lines.length < 2) return null;
  var lefts = [], mids = [], rights = [], widest = 0;
  for (var i = 0; i < lines.length; i++) {
    var width = creditsLineWidth(lines[i]);
    if (!(width > 0)) return null;
    lefts.push(lines[i].x);
    mids.push(lines[i].x + width / 2);
    rights.push(lines[i].x + width);
    if (width > widest) widest = width;
  }
  var spread = function (list) { return Math.max.apply(null, list) - Math.min.apply(null, list); };
  var mean = function (list) { var s = 0; for (var k = 0; k < list.length; k++) s += list[k]; return s / list.length; };
  var tol = Math.max(1, widest * 0.02);
  if (spread(lefts) <= tol) return null;                          // one x for every line: as drawn
  if (spread(mids) <= tol) return { anchor: 'middle', x: mean(mids) };
  if (spread(rights) <= tol) return { anchor: 'end', x: mean(rights) };
  return null;
}

// creditsLooks(): the two looks and the three steps, read off the sample. The TITLE is the
// sample's first line ending in ":" (or ";"), the NAME the first line under it; a sample with
// no colon reads its first line as the title and its second as the name, and a one-line sample
// uses that line for both. The steps are the sample's own leading: title to name, name to name,
// and the gap before the next title - each measured where the sample shows it, and each
// falling back to the one before it where it does not.
function creditsLooks() {
  var sample = creditsSample();
  if (!sample) return null;
  var lines = creditsSampleLines(sample);
  if (!lines.length) return null;
  var isTitle = function (line) { return /[:;]$/.test(line.text); };
  var titleAt = 0;
  for (var i = 0; i < lines.length; i++) if (isTitle(lines[i])) { titleAt = i; break; }
  var nameAt = titleAt + 1 < lines.length ? titleAt + 1 : titleAt;
  var size = parseFloat(getComputedStyle(sample).fontSize) || 40;
  var step = function (a, b, fallback) {
    var d = a >= 0 && b > a && b < lines.length ? lines[b].y - lines[a].y : 0;
    return d > 0 ? d : fallback;
  };
  var afterTitle = step(titleAt, nameAt, size * 1.2);
  var afterName = step(nameAt, nameAt + 1 < lines.length && !isTitle(lines[nameAt + 1]) ? nameAt + 1 : -1, afterTitle);
  var beforeTitle = afterName;
  for (var k = titleAt + 1; k < lines.length; k++) {
    if (isTitle(lines[k])) { beforeTitle = step(k - 1, k, afterName); break; }
  }
  return {
    title: lines[titleAt],
    name: lines[nameAt],
    afterTitle: afterTitle,
    afterName: afterName,
    beforeTitle: beforeTitle,
    anchor: creditsAnchor(sample, lines),
  };
}

// The <text> the rows are painted into, made once beside the sample and kept.
var noacgCreditsRows = null;

// creditsRender(): build the rows from the pasted list in the sample's two looks, and hand back
// the text element that holds them with the looks they were built from. Runs at load, on every
// update() and at the start of every take. Until a roll moves them the rows stand where the
// sample was drawn.
function creditsRender() {
  var sample = creditsSample();
  var looks = creditsLooks();
  if (!sample || !looks) return null;
  var rows = noacgCreditsRows;
  if (!rows) {
    // The WINDOW the roll runs through: an inner <svg> viewport, which clips what is inside it
    // to its own box - no clipPath and no id, so the export carries nothing to reference.
    // Placed right after the sample, so the roll paints in the sample's own place in the stack.
    var window_ = document.createElementNS(sample.namespaceURI, 'svg');
    window_.setAttribute('class', '${cls}-window');
    window_.setAttribute('overflow', 'hidden');
    // THE ROLL MOVES A GROUP OF ITS OWN, never the text: the text keeps the designer's transform
    // (Illustrator writes the position there), and a reset that clears GSAP's properties takes
    // the transform ATTRIBUTE off an SVG element it once tweened - so tweened directly, one snap
    // recovery would drop the rows at the layer's origin. The group has nothing to lose, and its
    // box (getBBox spans the children, transforms included) is the list's true extent whatever
    // matrix the text carries.
    var roll = document.createElementNS(sample.namespaceURI, 'g');
    roll.setAttribute('class', '${cls}-roll');
    // A copy of the sample's element - its transform, its class, its style - with the hiding
    // class taken off and the designer's id left behind, so no id appears twice.
    rows = sample.cloneNode(false);
    rows.removeAttribute('id');
    var own = (rows.getAttribute('class') || '').split(/\\s+/).filter(function (c) { return c && c !== '${cls}'; });
    own.push('${cls}-rows');
    rows.setAttribute('class', own.join(' '));
    var names = [];
    for (var a = 0; a < rows.attributes.length; a++) if (rows.attributes[a].name.indexOf('data-noacg') === 0) names.push(rows.attributes[a].name);
    for (var n = 0; n < names.length; n++) rows.removeAttribute(names[n]);
    roll.appendChild(rows);
    window_.appendChild(roll);
    sample.parentNode.insertBefore(window_, sample.nextSibling);
    noacgCreditsRows = rows;
  }
  var holder = creditsField('${CREDITS_FIELD_ROLE}');
  var text = holder ? holder.textContent : creditsSampleLines(sample).map(function (l) { return l.text; }).join('\\n');
  // Written as textContent, so nothing here is escaped: the identity is the escape.
  var sections = parseCredits(text, function (s) { return s; });
  while (rows.firstChild) rows.removeChild(rows.firstChild);
  var y = looks.title.y;              // the first row sits on the sample's first baseline
  var count = 0;
  var prevKind = null;
  var sectionBreak = false;
  var paint = function (kind, line) {
    var look = kind === 'title' ? looks.title : looks.name;
    if (count > 0) {
      // A title keeps the gap the sample leaves before a title; a name follows at the step the
      // sample shows after a title or after a name. A blank line in the paste is a section
      // break: before a title the title's gap is the break, and before a name it adds the same
      // air the sample gives a title (the gap less the name step), or one empty line where the
      // sample gives a title none.
      y += kind === 'title' ? looks.beforeTitle : prevKind === 'title' ? looks.afterTitle : looks.afterName;
      if (sectionBreak && kind !== 'title') {
        var air = looks.beforeTitle - looks.afterName;
        y += air > 0.5 ? air : looks.afterName;
      }
    }
    var t = document.createElementNS(rows.namespaceURI, 'tspan');
    var attrs = look.run ? look.run.attributes : [];
    for (var i = 0; i < attrs.length; i++) {
      var name = attrs[i].name;
      // Position and bookkeeping are this row's own; everything else IS the look.
      if (/^(x|y|dx|dy|rotate|id|textLength|lengthAdjust)$/i.test(name) || name.indexOf('data-') === 0) continue;
      t.setAttribute(name, attrs[i].value);
    }
    t.setAttribute('x', String(looks.anchor ? looks.anchor.x : look.x));
    if (looks.anchor) t.setAttribute('text-anchor', looks.anchor.anchor);
    t.setAttribute('y', y.toFixed(2));
    t.setAttribute('data-noacg-credits', kind);
    t.textContent = line;
    rows.appendChild(t);
    prevKind = kind;
    sectionBreak = false;
    count++;
  };
  for (var s = 0; s < sections.length; s++) {
    sectionBreak = s > 0;
    for (var e = 0; e < sections[s].length; e++) {
      var entry = sections[s][e];
      if (entry.type === 'group') {
        // The role, written the way the sample writes a title - with its colon - and every
        // name credited with it on its own line beneath.
        paint('title', entry.role + ':');
        for (var m = 0; m < entry.names.length; m++) paint('name', entry.names[m]);
      } else if (entry.type === 'heading') {
        paint('title', entry.text);
      } else {
        paint('name', entry.text);
      }
    }
  }
  return { rows: rows, looks: looks };
}

${creditsTakeJs()}

// Render once on load, so a preview shows the list before the first update(); again when the
// real typeface arrives, because the sample's line widths decide how the rows line up.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', creditsRender);
} else {
  creditsRender();                  // DOM already parsed (e.g. an inline preview build)
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(creditsRender);
`;
}

/** The holders behind the recipe's fields and the operator's Scroll speed: shared by the editable
 *  roll and the styled one, so both read the speed the same way. */
function creditsFieldJs(): string {
  return `// creditsField(role): the holder behind one of the recipe's fields - the pasted list, the
// operator's Scroll speed - by the fN the NOACG_BEHAVIOUR table compiled it to.
function creditsField(role) {
  var id = typeof noacgFieldFor === 'function' ? noacgFieldFor(role, null) : null;
  return id ? document.getElementById(id) : null;
}

// creditsSpeed(): the operator's Scroll speed as a factor of the authored pace - 100 is as
// authored, 200 twice as fast. Blank, nonsense and zero all mean 100 rather than "stop", and
// the clamp (10%-400%) is the catalog roll's, so a roll always finishes.
function creditsSpeed() {
  var el = creditsField('${CREDITS_SPEED_KEY}');
  var percent = el ? parseFloat(el.textContent) : NaN;
  if (!isFinite(percent) || percent <= 0) return 1;
  return Math.min(400, Math.max(10, percent)) / 100;
}`;
}

/** THE TAKE, shared by the editable roll and the styled one: the window, the travel, the pace and
 *  a live speed change. Each engine supplies `creditsSample()` (the layer whose parent the rows
 *  sit in) and `creditsRender()` (the rows and the name step they were built with). */
function creditsTakeJs(): string {
  return `// creditsWindow(sample): where the roll runs, as a rectangle in the rows' own space - the
// Credits box where one is drawn, else the artwork's whole frame. Both are read through the
// screen, so a box inside a moved or scaled group lands where it paints. Null until the design
// is laid out, and then the take measures nothing rather than something wrong.
function creditsWindow(sample) {
  var art = typeof noacgArt === 'function' ? noacgArt() : null;
  var parent = sample.parentNode;
  if (!art || !parent || !parent.getScreenCTM || !art.getScreenCTM) return null;
  var toLocal = parent.getScreenCTM();
  if (!toLocal) return null;
  var box = typeof noacgRoleEls === 'function' ? noacgRoleEls('${CREDITS_BOX_ROLE}', null)[0] : null;
  var from = null, rect = null;
  if (box && box.getBBox && box.getScreenCTM) {
    from = box.getScreenCTM();
    try { rect = box.getBBox(); } catch (e) { rect = null; }
  } else {
    box = null;
    from = art.getScreenCTM();
    var vb = art.viewBox && art.viewBox.baseVal;
    rect = vb && vb.width > 0 ? { x: vb.x, y: vb.y, width: vb.width, height: vb.height } : null;
  }
  if (!from || !rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  var m = toLocal.inverse().multiply(from);
  var xs = [], ys = [];
  var corners = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]];
  for (var i = 0; i < corners.length; i++) {
    xs.push(m.a * corners[i][0] + m.c * corners[i][1] + m.e);
    ys.push(m.b * corners[i][0] + m.d * corners[i][1] + m.f);
  }
  return {
    left: Math.min.apply(null, xs),
    right: Math.max.apply(null, xs),
    top: Math.min.apply(null, ys),
    bottom: Math.max.apply(null, ys),
    boxed: !!box,
  };
}

var noacgCreditsTween = null;
var noacgCreditsBuiltAt = 1;       // the speed the running take was built at (creditsDataUpdated)
// What the last take measured, for a reader (and for the spec that pins the pace): where the
// list started and ended, how far it travelled, how long it took, and how many rows it carried.
var noacgCreditsLast = null;

// ${CREDITS_ROLL_CALL}(): THE TAKE. Rebuild the rows, size the window, and run the whole list
// from below it to above it at a constant speed - never eased, because a credit roll reads at
// one pace. Named by the entrance's own call in the animation data, so every playout road that
// takes the graphic rolls it.
function ${CREDITS_ROLL_CALL}() {
  // A new take ends the last one first, so a take that cannot measure leaves no old roll for a
  // later speed change to rescale.
  if (noacgCreditsTween) noacgCreditsTween.kill();
  noacgCreditsTween = null;
  var built = creditsRender();
  var sample = creditsSample();
  if (!built || !sample || typeof gsap === 'undefined') return null;
  var rows = built.rows;
  var roll = rows.parentNode;                // the group the roll moves (creditsRender)
  var frame = roll.parentNode;               // the window it moves inside
  var win = creditsWindow(sample);
  // The list's extent in the window's own space: the group's box spans the text, transform and
  // all, and leaves the group's own travel out - so it reads the same mid-roll as at rest.
  var bb = null;
  try { bb = roll.getBBox(); } catch (e) { bb = null; }
  if (!win || !bb || !(bb.height > 0)) return null;
  frame.setAttribute('x', String(win.left));
  frame.setAttribute('y', String(win.top));
  frame.setAttribute('width', String(win.right - win.left));
  frame.setAttribute('height', String(win.bottom - win.top));
  frame.setAttribute('viewBox', win.left + ' ' + win.top + ' ' + (win.right - win.left) + ' ' + (win.bottom - win.top));
  // The list's top starts at the window's bottom edge and travels until its bottom has left
  // the window's top: the whole list passes, however long it is. Measured now, at the take,
  // because it depends on what the operator pasted.
  var startY = win.bottom - bb.y;
  var endY = win.top - bb.y - bb.height;
  var distance = startY - endY;
  // The pace rides the sample's name-to-name step, scaled the way the text's own transform
  // scales it: the step is read in the text's units and the travel in the window's.
  var textHeight = rows.getBBox().height;
  var step = built.looks.afterName * (textHeight > 0 ? bb.height / textHeight : 1);
  var speed = creditsLiveSpeed();
  var perSecond = step * NOACG_CREDITS_LINES_PER_SECOND * speed;
  var duration = distance / perSecond;
  noacgCreditsLast = { startY: startY, endY: endY, distance: distance, duration: duration, rows: rows.children.length, step: step, boxed: win.boxed };
  noacgCreditsBuiltAt = speed;
  noacgCreditsTween = gsap.fromTo(roll, { y: startY }, { y: endY, duration: duration, ease: 'none' });
  return noacgCreditsTween;
}

// The operator's speed times the author's knob: the one number the take is built at, and the
// one a live change is measured against.
function creditsLiveSpeed() {
  return creditsSpeed() * (typeof motionSpeed === 'function' ? motionSpeed() : 1);
}

// creditsDataUpdated(): update() wrote the fields - rebuild the rows in place. A roll already
// running keeps travelling with the new rows, and a new Scroll speed changes its pace from this
// frame: the production dashboard's LIVE NUMBERS row offers the field and says one press acts on
// air. A timeScale rather than a new take, because a new take would honour the number and snap
// the list back below the window. No jump either: the take is started from a timeline CALL, so
// the tween lives on GSAP's root timeline, which holds a child's playhead still across a
// timeScale by itself (the catalog roll, nested in a step timeline, has to lend it that).
function creditsDataUpdated() {
  creditsRender();
  if (noacgCreditsTween) noacgCreditsTween.timeScale(creditsLiveSpeed() / noacgCreditsBuiltAt);
}`;
}

// ── The styled engine: credits in the artwork's own role and name layers ──────────────────────
//
// The designer drew a few roles and names as separate text layers (DesignSvgCredits). Those
// layers stay in the file as drawn, hidden on air, and are the SOURCE the rows copy: every role
// row is a copy of the first role layer read and every name row a copy of the first name layer,
// keeping their classes, runs, paint and transform, with only the words and the position changed.
// The spacing is the drawing's own (`analyseCreditsStyle`), read at build from the stored anchors;
// where each row is drawn is measured on the page, in the first role layer's own frame.

/** The attribute that marks each source layer of a styled binding: its place and kind. */
export const CREDITS_ANCHOR_ATTR = 'data-noacg-credit';

/** Stamp the source layers of a styled binding (svgBind.ts, before the markers come off): each
 *  text takes the sample's class, hidden on air, and its place in reading order with its kind. */
export function creditsMarkAnchors(svg: DesignSvg, root: Element, prefix: string): void {
  const style = styledCredits(svg);
  if (!style) return;
  style.anchors.forEach((a, i) => {
    const text = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${a.candidateId}"]`)?.closest('text');
    if (!text) return;
    text.setAttribute(CREDITS_ANCHOR_ATTR, `${i} ${a.kind}`);
    const own = (text.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    if (!own.includes(creditsClass(prefix))) own.push(creditsClass(prefix));
    text.setAttribute('class', own.join(' '));
  });
}

/** What the styled runtime is built with, read off the drawing at build. */
export interface CreditsStyledConfig {
  align: CreditsAlign;
  /** Baseline steps in the layers' own units. A step the sample does not show falls back as the
   *  editable roll's do: name to name to role to name, the group gap to name to name. */
  roleToName: number;
  nameToName: number;
  groupGap: number;
  /** What the drawn roles end with (`:` or nothing), so a row reads as the drawing does. */
  roleSuffix: string;
}

/** What the styled runtime of a design is built with, or null when it builds another engine.
 *  A step the sample does not show falls back as the editable roll's do. */
export function styledCreditsConfig(svg: DesignSvg): CreditsStyledConfig | null {
  const style = styledCredits(svg);
  if (!style) return null;
  const roleToName = style.steps.roleToName ?? style.steps.nameToName ?? 0;
  const nameToName = style.steps.nameToName ?? roleToName;
  return { align: style.align.role, roleToName, nameToName, groupGap: style.steps.groupGap ?? nameToName, roleSuffix: style.roleSuffix };
}

/**
 * The design as it builds: a styled binding that cannot build styled (`creditsEngine` answers
 * 'artwork') builds as the original-text roll it falls back to, marker and all, so the emitted
 * behaviour table and every reader of it agree that the list field is inert.
 */
export function creditsBuildSvg(svg: DesignSvg): DesignSvg {
  const behaviour = svg.behaviour;
  if (behaviour?.kind !== 'recipe' || !behaviour.credits || behaviour.options?.artwork === true) return svg;
  if (styledCredits(svg)) return svg;
  const { credits: _dropped, ...rest } = behaviour;
  return { ...svg, behaviour: { ...rest, options: { ...behaviour.options, artwork: true } } };
}

/** The stylesheet part: the drawn source layers are laid out, never painted. */
export function creditsStyledCss(prefix: string): string {
  return `/* ── The credits, in your own role and name layers ──
   The role and name layers you drew are the SOURCE. They are hidden on air, and every role and
   name the operator types is a copy of the first role or the first name, spaced as you spaced
   them (template.js, "Credits in the artwork's own styling"). Delete this rule to see them. */
.${creditsClass(prefix)} {
  visibility: hidden;              /* laid out, so they can be measured; never painted */
}`;
}

/** The styled engine, emitted once for a design whose styled binding builds (`styledCredits`). */
export function creditsStyledRuntimeJs(prefix: string, config: CreditsStyledConfig): string {
  const cls = creditsClass(prefix);
  return `
// ── Credits in the artwork's own styling (SVG) ────────────────────────────────────────────────
// ONE PASTED LIST rolls through the frame, bottom to top, at the operator's Scroll speed. The role
// and name layers you drew are the SOURCE: they stay in the file, hidden on air (template.css
// hides .${cls}), and every role the operator types is a copy of your first role layer and every
// name a copy of your first name layer - class, runs, paint and transform kept, only the words
// and the position changed. The spacing below is yours, read off the drawing when this was built;
// change a layer's font, size or colour in your design app and every row follows.

var NOACG_CREDITS_LINES_PER_SECOND = ${CREDITS_LINES_PER_SECOND};

// The drawing's spacing, in the layers' own units: role to its first name, name to name, and the
// gap before the next role; and the edge every row lines up on.
var NOACG_CREDITS_STYLE = ${JSON.stringify(config)};

// Past this share of its size a row is reported too long, and it never shrinks below the floor
// (the SVG fit ladder's numbers; CREDITS_OVERFLOW).
var NOACG_CREDITS_REPORT = 0.55;
var NOACG_CREDITS_FLOOR = 0.3;

${CREDITS_PARSER_JS}

// creditsAnchors(): the source layers in reading order, each with its kind.
function creditsAnchors() {
  var found = document.querySelectorAll('[${CREDITS_ANCHOR_ATTR}]');
  var out = [];
  for (var i = 0; i < found.length; i++) {
    var mark = found[i].getAttribute('${CREDITS_ANCHOR_ATTR}').split(' ');
    out.push({ at: parseFloat(mark[0]), kind: mark[1], el: found[i] });
  }
  out.sort(function (a, b) { return a.at - b.at; });
  return out;
}

// creditsSample(): the roll's window, once built - the take reads the frame it runs in from the
// window's parent, the group shared by every source layer.
function creditsSample() {
  return noacgCreditsRows ? noacgCreditsRows.parentNode.parentNode : null;
}

${creditsFieldJs()}

// creditsFrom(a, b): the matrix taking a's own units into b's, through the screen, so any two
// elements of the drawing answer in one frame.
function creditsFrom(a, b) {
  var ma = a.getScreenCTM ? a.getScreenCTM() : null;
  var mb = b.getScreenCTM ? b.getScreenCTM() : null;
  return ma && mb ? mb.inverse().multiply(ma) : null;
}

// creditsAt(m, x, y): a point through a matrix.
function creditsAt(m, x, y) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

// creditsEdge(el): where a drawn layer's aligned edge meets its baseline, in its own units: along
// its ADVANCE, which is what text-anchor places (the ink box starts a side bearing away). start is
// the right end of right-to-left text, as text-anchor reads it.
function creditsEdge(el) {
  if (!el.getNumberOfChars || el.getNumberOfChars() === 0) return null;
  var advance = el.getComputedTextLength();
  var at = el.getStartPositionOfChar(0);
  var rtl = getComputedStyle(el).direction === 'rtl';
  var edge = NOACG_CREDITS_STYLE.align;
  var f = edge === 'start' ? 0 : edge === 'middle' ? 0.5 : 1;
  if (rtl) f = 1 - f;
  return { x: (rtl ? at.x - advance : at.x) + f * advance, y: at.y };
}

// creditsFirstText(el): the text node holding a layer's first character - the run that paints it
// is the look a copy keeps.
function creditsFirstText(el) {
  var kids = el.childNodes;
  for (var i = 0; i < kids.length; i++) {
    var k = kids[i];
    if (k.nodeType === 3 && /[^ \\t\\r\\n]/.test(k.nodeValue)) return k;
    if (k.nodeType === 1) {
      var inner = creditsFirstText(k);
      if (inner) return inner;
    }
  }
  return null;
}

// creditsCopy(source, words): a row - a copy of the drawn layer with its words replaced. Its id,
// its marks, the hiding class and every position attribute come off; the run that painted the
// first character keeps the new words and every other run is emptied, so the look is that run's.
function creditsCopy(source, words) {
  var row = source.cloneNode(true);
  var all = [row].concat(Array.prototype.slice.call(row.getElementsByTagName('*')));
  for (var i = 0; i < all.length; i++) {
    var names = [];
    for (var a = 0; a < all[i].attributes.length; a++) {
      var n = all[i].attributes[a].name;
      if (n === 'id' || n.indexOf('data-noacg') === 0 || /^(x|y|dx|dy|rotate|textLength|lengthAdjust|transform)$/.test(n)) names.push(n);
    }
    for (var r = 0; r < names.length; r++) all[i].removeAttribute(names[r]);
  }
  var own = (row.getAttribute('class') || '').split(' ').filter(function (c) { return c && c !== '${cls}'; });
  own.push('${cls}-row');
  row.setAttribute('class', own.join(' '));
  var first = creditsFirstText(row);
  var texts = [];
  var walk = function (node) {
    for (var k = 0; k < node.childNodes.length; k++) {
      var c = node.childNodes[k];
      if (c.nodeType === 3) texts.push(c);
      else if (c.nodeType === 1) walk(c);
    }
  };
  walk(row);
  for (var t = 0; t < texts.length; t++) texts[t].nodeValue = texts[t] === first ? words : '';
  if (!first) row.textContent = words;
  return { row: row, run: first ? first.parentNode : row };
}

// creditsLookOf(source, container): what a copy placed in the shared group would lose when its
// source sits in a group of its own: the inherited look, and the opacity of the groups between.
// Empty when the source is drawn straight in the shared group, which is how layers usually are.
function creditsLookOf(source, container) {
  if (source.parentNode === container) return '';
  var first = creditsFirstText(source);
  var cs = getComputedStyle(first ? first.parentNode : source);
  var props = ['font-family', 'font-size', 'font-weight', 'font-style', 'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'letter-spacing', 'text-transform', 'direction'];
  var out = [];
  for (var i = 0; i < props.length; i++) out.push(props[i] + ':' + cs.getPropertyValue(props[i]));
  var opacity = parseFloat(getComputedStyle(source).opacity);
  if (!isFinite(opacity)) opacity = 1;
  for (var el = source.parentNode; el && el !== container; el = el.parentNode) {
    var v = parseFloat(getComputedStyle(el).opacity);
    if (isFinite(v)) opacity *= v;
  }
  if (opacity < 1) out.push('opacity:' + opacity);
  return out.join(';');
}

// creditsShared(anchors): the nearest group holding every source layer - the rows are built in
// it, so a row inherits what its source inherits there and nothing from another source's group.
function creditsShared(anchors) {
  var at = anchors[0].el.parentNode;
  for (var i = 1; i < anchors.length; i++) {
    while (at && !at.contains(anchors[i].el)) at = at.parentNode;
  }
  return at;
}

// The rows, made once in the shared group and kept, with the stylesheet that paints them: the
// rows' looks and sizes live there rather than inline, so a reset that clears inline styles
// leaves them as built.
var noacgCreditsRows = null;
var noacgCreditsSheet = null;
// What the last build fitted, for a reader: each row's shrink and whether it was reported.
var noacgCreditsFit = [];

// creditsRender(): build the rows from the pasted list in the drawn layers' looks, spaced as
// drawn, and hand back the group that holds them with the step the pace rides. Runs at load, on
// every update() and at the start of every take.
function creditsRender() {
  var anchors = creditsAnchors();
  if (!anchors.length) return null;
  var ref = anchors[0].el;
  var container = creditsShared(anchors);
  var sources = {};
  for (var i = 0; i < anchors.length; i++) if (!sources[anchors[i].kind]) sources[anchors[i].kind] = anchors[i].el;
  if (!sources.role || !sources.name || !container) return null;
  // THE SHARED EDGE, the mean over every drawn layer in the first role's frame: the drawing put
  // them all on one aligned edge, and the rows keep it.
  var sum = 0;
  for (var j = 0; j < anchors.length; j++) {
    var m = creditsFrom(anchors[j].el, ref);
    var edge = creditsEdge(anchors[j].el);
    if (!m || !edge) return null;
    sum += creditsAt(m, edge.x, edge.y).x;
  }
  var x = sum / anchors.length;
  var top = creditsEdge(ref).y;
  var toContainer = creditsFrom(ref, container);
  if (!toContainer) return null;
  var rows = noacgCreditsRows;
  if (!rows) {
    // The window the roll runs through, and the group it moves, as the editable roll makes them:
    // an inner <svg> viewport clips without an id, and the roll moves a group of its own.
    var window_ = document.createElementNS(ref.namespaceURI, 'svg');
    window_.setAttribute('class', '${cls}-window');
    window_.setAttribute('overflow', 'hidden');
    var roll = document.createElementNS(ref.namespaceURI, 'g');
    roll.setAttribute('class', '${cls}-roll');
    noacgCreditsSheet = document.createElementNS(ref.namespaceURI, 'style');
    rows = document.createElementNS(ref.namespaceURI, 'g');
    rows.setAttribute('class', '${cls}-rows');
    roll.appendChild(noacgCreditsSheet);
    roll.appendChild(rows);
    window_.appendChild(roll);
    // Painted where the first role is in the stack.
    var after = ref;
    while (after.parentNode !== container) after = after.parentNode;
    container.insertBefore(window_, after.nextSibling);
    noacgCreditsRows = rows;
  }
  // The rows sit in the first role's own frame, so every step is in its units.
  rows.setAttribute('transform', 'matrix(' + [toContainer.a, toContainer.b, toContainer.c, toContainer.d, toContainer.e, toContainer.f].join(' ') + ')');
  var holder = creditsField('${CREDITS_FIELD_ROLE}');
  var text = holder ? holder.textContent : '';
  // Written as textContent, so nothing here is escaped: the identity is the escape.
  var sections = parseCredits(text, function (s) { return s; });
  while (rows.firstChild) rows.removeChild(rows.firstChild);
  var S = NOACG_CREDITS_STYLE;
  // One look rule per kind: what a copy outside its source's group needs, and the shared edge.
  var sel = '.${cls}-rows > .${cls}-row';
  var base = '';
  var kinds = ['role', 'name'];
  var frames = {};
  for (var q = 0; q < kinds.length; q++) {
    var kind = kinds[q];
    frames[kind] = creditsFrom(sources[kind], ref);
    if (!frames[kind]) return null;
    var look = creditsLookOf(sources[kind], container);
    var where = sel + '[data-noacg-credits="' + kind + '"]';
    base += where + ', ' + where + ' [data-noacg-run] {' + (look ? look + ';' : '') + 'text-anchor:' + S.align + ' !important}\\n';
  }
  noacgCreditsSheet.textContent = base;
  // FIRST PASS: every row, spaced as drawn, appended at once.
  var made = [];
  var y = top;
  var prev = null;
  var sectionBreak = false;
  var paint = function (kind, words) {
    if (made.length > 0) {
      y += kind === 'role' ? S.groupGap : prev === 'role' ? S.roleToName : S.nameToName;
      // A blank line before a name adds the air the drawing gives a group, or one name step.
      if (sectionBreak && kind !== 'role') {
        var air = S.groupGap - S.nameToName;
        y += air > 0.5 ? air : S.nameToName;
      }
    }
    var m = frames[kind];
    var copy = creditsCopy(sources[kind], words);
    var row = copy.row;
    row.setAttribute('transform', 'matrix(' + [m.a, m.b, m.c, m.d, m.e, m.f].join(' ') + ')');
    var p = creditsAt(m.inverse(), x, y);
    row.setAttribute('x', p.x.toFixed(2));
    row.setAttribute('y', p.y.toFixed(2));
    row.setAttribute('data-noacg-credits', kind);
    row.setAttribute('data-noacg-row', String(made.length));
    if (copy.run !== row) copy.run.setAttribute('data-noacg-run', '');
    rows.appendChild(row);
    made.push({ row: row, run: copy.run, kind: kind, words: words, m: m });
    prev = kind;
    sectionBreak = false;
  };
  for (var s = 0; s < sections.length; s++) {
    sectionBreak = s > 0;
    for (var e = 0; e < sections[s].length; e++) {
      var entry = sections[s][e];
      if (entry.type === 'group') {
        paint('role', entry.role + S.roleSuffix);
        for (var k = 0; k < entry.names.length; k++) paint('name', entry.names[k]);
      } else if (entry.type === 'heading') {
        paint('role', entry.text);
      } else {
        paint('name', entry.text);
      }
    }
  }
  // SECOND PASS, TOO WIDE: each row measured once, in one layout. A row wider than its room
  // shrinks to it, is reported past 55% and stops at the 30% floor (CREDITS_OVERFLOW). The room
  // is the window (the Credits box, else the frame) in the first role's frame, less half a row's
  // type at the side it meets, spent from the aligned edge.
  var win = creditsWindow(rows.parentNode.parentNode);
  var toRef = win ? creditsFrom(container, ref) : null;
  var lo = null, hi = null;
  if (win && toRef) {
    var c = [creditsAt(toRef, win.left, win.top), creditsAt(toRef, win.right, win.top), creditsAt(toRef, win.left, win.bottom), creditsAt(toRef, win.right, win.bottom)];
    lo = Math.min(c[0].x, c[1].x, c[2].x, c[3].x);
    hi = Math.max(c[0].x, c[1].x, c[2].x, c[3].x);
  }
  noacgCreditsFit = [];
  var over = false;
  var sizes = '';
  for (var r = 0; r < made.length; r++) {
    var one = made[r];
    var fit = { kind: one.kind, words: one.words, scale: 1, reported: false };
    var box = null;
    try { box = one.row.getBBox(); } catch (err) { box = null; }
    if (lo !== null && box && box.width > 0) {
      var scale = Math.sqrt(Math.abs(one.m.a * one.m.d - one.m.b * one.m.c)) || 1;
      var size = parseFloat(getComputedStyle(one.run).fontSize) || 16;
      var margin = 0.5 * size * scale;
      var rtl = getComputedStyle(one.row).direction === 'rtl';
      var side = S.align === 'middle' ? 'middle' : (S.align === 'start') !== rtl ? 'left' : 'right';
      var room = side === 'middle' ? 2 * Math.min(x - lo, hi - x) - 2 * margin : side === 'left' ? hi - x - margin : x - lo - margin;
      var width = box.width * scale;
      if (width > room) {
        fit.scale = Math.max(NOACG_CREDITS_FLOOR, room / width);
        fit.reported = fit.scale < NOACG_CREDITS_REPORT;
        var at = sel + '[data-noacg-row="' + r + '"]';
        sizes += at + ', ' + at + ' [data-noacg-run] {font-size:' + (size * fit.scale) + 'px !important}\\n';
      }
    }
    if (fit.reported) over = true;
    noacgCreditsFit.push(fit);
  }
  if (sizes) noacgCreditsSheet.textContent = base + sizes;
  // The operator hears about a row past the report line through the graphic's overflow report,
  // under the one Credits field.
  if (holder && typeof svgFitOver !== 'undefined') svgFitOver[holder.id] = over;
  return { rows: rows, looks: { afterName: S.nameToName } };
}

// stopCreditsRoll(): Out ends the roll, so nothing keeps moving the list off air.
function stopCreditsRoll() {
  if (noacgCreditsTween) noacgCreditsTween.kill();
  noacgCreditsTween = null;
}

${creditsTakeJs()}

// Render once on load, so a preview shows the list before the first update(); again when the
// real typeface arrives, because the drawn widths decide where an aligned row starts.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', creditsRender);
} else {
  creditsRender();                  // DOM already parsed (e.g. an inline preview build)
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(creditsRender);
`;
}

// ── Credits in the artwork's own styling (DesignSvgCredits) ──────────────────────────────────
//
// The designer draws a few roles and names as SEPARATE text layers, the way a credits page is
// drawn; the looks and the spacing between them are the style. This part reads that style back
// and says plainly when it cannot: nothing here renders, and nothing here ever falls back to a
// catalog design. A drawing it cannot describe stays the artwork it is (the original-text roll or
// fixed artwork), with the reason named.

/** Which edge of a line the drawing lines up, in `text-anchor` words. */
export type CreditsAlign = 'start' | 'middle' | 'end';

/** One drawn text layer as the analysis reads it. Positions are in the artwork's frame. */
export interface CreditsReading {
  candidateId: string;
  text: string;
  /** The point the layer's stated anchor sits on, and that anchor. */
  x: number;
  y: number;
  anchor: CreditsAlign;
  /** Right to left: its start is the right end and its end the left. */
  rtl?: true;
  /** The drawn advance in the layer's own units, where the text is laid out. */
  width?: number;
  /** The font size in the layer's own units. */
  size: number;
  /** Everything that makes the look, as one comparable string. */
  look: string;
  /** The rotation, scale and skew the layer is drawn with: a, b, c, d of its matrix. */
  linear: [number, number, number, number];
  /** How many baselines the one layer draws. */
  lines: number;
}

export type CreditsUnsupported =
  | 'unknown-anchor'
  | 'too-few'
  | 'several-lines'
  | 'mixed-angles'
  | 'one-look'
  | 'many-looks'
  | 'mixed-layout'
  | 'side-by-side'
  | 'misaligned'
  | 'not-list-format';

/** The style the drawing repeats, ready for an engine to copy. */
export interface CreditsStyle {
  layout: CreditsLayout;
  anchors: DesignSvgCreditsAnchor[];
  align: { role: CreditsAlign; name: CreditsAlign };
  /** Steps between baselines, in the layers' own units; each only where the sample shows it.
   *  `column` is the name column's distance from the role column, beside only. */
  steps: { roleToName?: number; nameToName?: number; groupGap?: number; column?: number };
  /** The sample as the credits list: what the one content field starts with. */
  list: string;
  /** What the drawn roles end with (`:` or nothing), so a rendered role reads as drawn. */
  roleSuffix: string;
}

export type CreditsAnalysis =
  | { ok: true; style: CreditsStyle }
  | { ok: false; code: CreditsUnsupported; message: string; anchors: string[]; fallback: 'artwork' };

/** The longest role the list format reads before its colon (`ROLE_LABEL_MAX` in the parser). */
const CREDITS_ROLE_MAX = 48;

/**
 * Read the given text layers for `analyseCreditsStyle`. A layer the markup does not hold reads
 * as null. Widths come only from a laid-out document; a parsed one gives positions and looks.
 */
export function readCreditsAnchors(root: Element, candidateIds: readonly string[]): (CreditsReading | null)[] {
  return candidateIds.map((candidateId) => {
    const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${candidateId}"]`);
    const text = el?.closest('text');
    return text ? readOne(root, text, candidateId) : null;
  });
}

function readOne(root: Element, text: Element, candidateId: string): CreditsReading {
  // The runs that hold characters, at any depth: a wrapper run around runs holds none.
  const runs = Array.from(text.querySelectorAll('tspan')).filter((t) => !t.querySelector('tspan'));
  // THE ELEMENT THAT PAINTS THE FIRST CHARACTER: the run holding it, or the text itself where
  // loose characters come before any run (#1941 point 2). Its look and position are the layer's.
  const firstNode = firstCharNode(text);
  const first = firstNode ? (firstNode.parentElement === text ? null : firstNode.parentElement) : runs[0] ?? null;
  // The first value of a position list, in user units; an `em` step is a multiple of the size.
  let size = 16;
  const num = (el: Element | null, name: string) => {
    const raw = (el?.getAttribute(name) ?? '').trim().split(/[\s,]+/)[0];
    const n = parseFloat(raw);
    return Number.isFinite(n) ? (/em$/i.test(raw) ? n * size : n) : null;
  };
  const view = text.ownerDocument.defaultView;
  // Laid out, the browser's own answer, so a stylesheet class counts; parsed, the layer's
  // attributes and inline styles from its first run up through each ancestor.
  const laid = !!view && text.isConnected;
  const computed = laid ? view.getComputedStyle(first ?? text) : null;
  const prop = (name: string): string => {
    if (computed) return computed.getPropertyValue(name).trim();
    for (let el: Element | null = first ?? text; el && el !== root.parentElement; el = el.parentElement) {
      const inline = (el.getAttribute('style') ?? '').split(';').map((d) => d.split(':')).find(([k]) => k?.trim() === name);
      if (inline && inline[1] !== undefined) return parsedValue(name, inline.slice(1).join(':').trim());
      const attr = el.getAttribute(name);
      if (attr !== null) return parsedValue(name, attr.trim());
    }
    return '';
  };
  size = parseFloat(prop('font-size')) || 16;
  // THE LOOK IS WHAT THE FIRST RUN IS PAINTED WITH. Inherited properties are the run's own
  // resolved value. Two are not inherited and act from every enclosing element instead: opacity
  // multiplies down the chain, and a text-decoration drawn by an ancestor draws through the run.
  const chain: Element[] = [];
  for (let el: Element | null = first ?? text; el && el !== root.parentElement; el = el.parentElement) chain.push(el);
  const own = (el: Element, name: string): string => {
    if (laid) return view.getComputedStyle(el).getPropertyValue(name).trim();
    const inline = (el.getAttribute('style') ?? '').split(';').map((d) => d.split(':')).find(([k]) => k?.trim() === name);
    return (inline && inline[1] !== undefined ? inline.slice(1).join(':') : el.getAttribute(name) ?? '').trim();
  };
  const opacity = chain.reduce((product, el) => {
    const v = parseFloat(own(el, 'opacity'));
    return product * (Number.isFinite(v) ? v : 1);
  }, 1);
  const decoration = chain.map((el) => own(el, 'text-decoration-line') || own(el, 'text-decoration'))
    .filter((v) => v && !/^none\b/.test(v)).join('+');
  const look = [
    ...['font-family', 'font-size', 'font-weight', 'font-style', 'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'letter-spacing'].map((p) => `${p}=${prop(p)}`),
    `opacity=${Math.round(opacity * 1000) / 1000}`,
    `text-decoration=${decoration}`,
    // Parsed, a stylesheet class is the only sign of what it sets; laid out, its effect is
    // already in the computed values, and two class spellings of one look are one look.
    ...(laid ? [] : [`class=${text.getAttribute('class') ?? ''}/${first?.getAttribute('class') ?? ''}`]),
  ].join(';');
  const anchorWord = prop('text-anchor');
  const anchor: CreditsAlign = anchorWord === 'middle' || anchorWord === 'end' ? anchorWord : 'start';
  const rtl = prop('direction') === 'rtl';
  // WHERE THE FIRST CHARACTER IS DRAWN, in the layer's own units. Laid out, the browser says so
  // (its start is the line's left end, so the anchor point is found along the drawn advance).
  // Parsed, SVG's rule: each of x, y, dx and dy for that character is the NEAREST element's
  // value - the run's where it states one, else the text's - and the steps are never summed.
  let advance = 0;
  // A run's position attribute is the one for its first character, then each enclosing element's
  // while the run starts it, up to the text.
  const nearest = (run: Element | null, name: string): number | null => {
    const own = firstCharNode(run ?? text);
    for (let el: Element | null = run ?? text; el; el = el === text ? null : el.parentElement) {
      const v = num(el, name);
      if (v !== null) return v;
      // An enclosing element's value is this run's only while its first character is the run's.
      if (el !== text && el.parentElement && firstCharNode(el.parentElement) !== own) return null;
    }
    return null;
  };
  let lx = (nearest(first, 'x') ?? 0) + (nearest(first, 'dx') ?? 0);
  let ly = (nearest(first, 'y') ?? 0) + (nearest(first, 'dy') ?? 0);
  // Laid out, the line's drawn box gives its left end whichever way it runs (the first
  // character of right-to-left text is at its right end), and the first character its baseline.
  const box = laid && (text as SVGTextContentElement).getNumberOfChars() > 0 ? (text as SVGGraphicsElement).getBBox() : null;
  if (box && box.width > 0) {
    advance = box.width;
    lx = box.x + creditsEdgeFraction(anchor, rtl) * advance;
    ly = (text as SVGTextContentElement).getStartPositionOfChar(0).y;
  }
  // Every transform from the layer up to the root, composed: the layer's frame in the artwork's.
  let m = new DOMMatrix();
  for (let el: Element | null = text; el && el !== root; el = el.parentElement) {
    // Item by item: `consolidate()` would rewrite the designer's transform attribute.
    const list = (el as SVGGraphicsElement).transform?.baseVal;
    let own = new DOMMatrix();
    for (let i = 0; list && i < list.numberOfItems; i++) {
      const t = list.getItem(i).matrix;
      own = own.multiply(new DOMMatrix([t.a, t.b, t.c, t.d, t.e, t.f]));
    }
    m = own.multiply(m);
  }
  const p = m.transformPoint(new DOMPoint(lx, ly));
  // HOW MANY LINES the one layer draws. Laid out, the browser's baseline under each character;
  // parsed, each run's start by the same nearest rule, plus the text's own loose characters.
  const baselines = new Set<number>();
  const chars = laid ? (text as SVGTextContentElement).getNumberOfChars() : 0;
  if (chars > 0) {
    for (let i = 0; i < Math.min(chars, 500); i++) {
      baselines.add(Math.round((text as SVGTextContentElement).getStartPositionOfChar(i).y * 2) / 2);
    }
  } else {
    let at = (num(text, 'y') ?? 0) + (num(text, 'dy') ?? 0);
    if (Array.from(text.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) baselines.add(Math.round(at * 2) / 2);
    for (const run of runs) {
      at = (nearest(run, 'y') ?? at) + (nearest(run, 'dy') ?? 0);
      if ((run.textContent ?? '').trim()) baselines.add(Math.round(at * 2) / 2);
    }
  }
  return {
    candidateId,
    text: (text.textContent ?? '').replace(/\s+/g, ' ').trim(),
    x: p.x,
    y: p.y,
    anchor,
    ...(rtl ? { rtl: true as const } : {}),
    ...(advance > 0 ? { width: advance } : {}),
    size,
    look,
    linear: [m.a, m.b, m.c, m.d],
    lines: Math.max(1, baselines.size),
  };
}

/** The text node holding an element's first non-blank character, in document order. */
function firstCharNode(el: Element): Text | null {
  const walk = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if ((n.textContent ?? '').trim()) return n as Text;
  return null;
}

let colourProbe: CanvasRenderingContext2D | null | undefined;

/**
 * A value as the parsed reading compares it. Colours are spelt one way, so `white` and `#ffffff`
 * are one look as they are laid out (#1941 point 3); anything a canvas does not read as a colour
 * (`none`, `currentColor`, a paint server) is compared as written.
 */
function parsedValue(name: string, value: string): string {
  if (name !== 'fill' && name !== 'stroke') return value;
  if (colourProbe === undefined) colourProbe = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!colourProbe || !value || /^(none|currentcolor|inherit)$/i.test(value) || /^url\(/i.test(value)) return value;
  // A colour the canvas cannot read leaves the probe's last value; that value is read back
  // rather than spelt here, since engines serialise it their own way.
  colourProbe.fillStyle = 'rgba(1, 2, 3, 0.5)';
  const unset = String(colourProbe.fillStyle);
  colourProbe.fillStyle = value;
  const read = String(colourProbe.fillStyle);
  if (read !== unset) return read;
  colourProbe.fillStyle = 'rgba(3, 2, 1, 0.5)';
  colourProbe.fillStyle = value;
  return String(colourProbe.fillStyle) === unset ? read : value;
}

/** Where an edge sits along a drawn line, from its left end: `start` is the right end of a
 *  right-to-left line, as `text-anchor` reads it. */
function creditsEdgeFraction(edge: CreditsAlign, rtl: boolean): number {
  const f = edge === 'start' ? 0 : edge === 'middle' ? 0.5 : 1;
  return rtl ? 1 - f : f;
}

/**
 * THE STYLE A DRAWING REPEATS, or the reason it repeats none. Rules, in order:
 *
 * - Every layer is real, there are at least two, and each draws one line.
 * - They share one angle and scale; positions are then compared in that shared frame, so a block
 *   turned as a whole is read as drawn and islands turned differently are refused.
 * - Exactly two looks. Reading order is top to bottom, then along the line in the text's own
 *   direction (right to left when every layer on it is right-to-left); the look of the first
 *   layer read is the ROLE look, the other the NAME look. `choice.swap` reads each line the other
 *   way, which is the one answer an author gives where the columns are ambiguous
 *   (`creditsColumnsAmbiguous`): geometry cannot tell a role column from a name column.
 * - A line holds one layer, or a role and then its first name: role BESIDE. A first name on a
 *   lower line is role ABOVE. Every role with names must agree.
 * - Above, roles and names share one aligned edge; beside, the roles share one and the names
 *   another. Read from the stated anchor, or from the drawn widths where the layout gives them.
 * - Every role and name can be written in the list format as it is.
 */
export function analyseCreditsStyle(readings: readonly (CreditsReading | null)[], ids: readonly string[], choice: CreditsChoice = {}): CreditsAnalysis {
  const refuse = (code: CreditsUnsupported, message: string, anchors: string[]): CreditsAnalysis =>
    ({ ok: false, code, message, anchors, fallback: 'artwork' });
  const missing = ids.filter((_, i) => !readings[i]);
  if (missing.length > 0) return refuse('unknown-anchor', 'A chosen layer is not a text layer of this artwork.', missing);
  const all = readings as CreditsReading[];
  if (all.length < 2) return refuse('too-few', 'Credits need at least one role and one name drawn.', all.map((r) => r.candidateId));
  const several = all.filter((r) => r.lines > 1);
  if (several.length > 0) return refuse('several-lines', 'A layer draws several lines; each role and name needs its own layer.', several.map((r) => r.candidateId));

  const [a, b, c, d] = all[0].linear;
  const close = (x: number, y: number) => Math.abs(x - y) <= 1e-3 * Math.max(1, Math.abs(x), Math.abs(y));
  const turned = all.filter((r) => !r.linear.every((v, i) => close(v, all[0].linear[i])));
  if (turned.length > 0) return refuse('mixed-angles', 'The roles and names are drawn at different angles or scales, so no one style describes them.', turned.map((r) => r.candidateId));
  // Into the shared frame: undo the common angle and scale, keep each layer's own offset.
  const det = a * d - b * c || 1;
  const items = all.map((r) => ({ r, x: (d * r.x - c * r.y) / det, y: (-b * r.x + a * r.y) / det }));

  const looks = [...new Set(all.map((r) => r.look))];
  if (looks.length === 1) return refuse('one-look', 'Roles and names share one look, so they cannot be told apart.', all.map((r) => r.candidateId));
  if (looks.length > 2) return refuse('many-looks', 'More than two looks are drawn; credits repeat one role look and one name look.', all.map((r) => r.candidateId));

  const minSize = Math.min(...all.map((r) => r.size));
  const tolY = 0.25 * minSize;
  const tolX = Math.max(1, 0.1 * minSize);
  const byY = [...items].sort((p, q) => p.y - q.y || p.x - q.x);
  const rows: (typeof items)[] = [];
  for (const it of byY) {
    const row = rows[rows.length - 1];
    if (row && it.y - row[0].y <= tolY) row.push(it);
    else rows.push([it]);
  }
  // Along the line in its reading direction: right to left when every layer on it says so.
  rows.forEach((row) => {
    const leftward = row.every((it) => it.r.rtl === true) !== (choice.swap === true);
    row.sort((p, q) => (leftward ? q.x - p.x : p.x - q.x));
  });
  const roleLook = rows[0][0].r.look;
  const kindOf = (it: (typeof items)[number]) => (it.r.look === roleLook ? 'role' : 'name');
  const crowded = rows.filter((row) => row.length > 2 || (row.length === 2 && (kindOf(row[0]) !== 'role' || kindOf(row[1]) !== 'name')));
  if (crowded.length > 0) return refuse('side-by-side', 'Names or roles are drawn side by side; a line holds one layer, or a role and its first name.', crowded.flat().map((it) => it.r.candidateId));

  const order = rows.flat();
  type Item = (typeof items)[number];
  const groups: { role: Item; names: Item[]; beside: boolean }[] = [];
  for (const it of order) {
    // The first layer read is a role by definition, so every name has a role above it.
    if (kindOf(it) === 'role') groups.push({ role: it, names: [], beside: false });
    else {
      const g = groups[groups.length - 1];
      if (g.names.length === 0) g.beside = rows.some((row) => row.includes(g.role) && row.includes(it));
      g.names.push(it);
    }
  }
  // Two looks and the role look first: at least one role has a name.
  const paired = groups.filter((g) => g.names.length > 0);
  if (new Set(paired.map((g) => g.beside)).size > 1) return refuse('mixed-layout', 'Some roles sit beside their names and others above them.', paired.map((g) => g.role.r.candidateId));
  const layout: CreditsLayout = paired[0].beside ? 'role-beside' : 'role-above';

  const edgeAt = (it: Item, edge: CreditsAlign): number | null => {
    if (edge === it.r.anchor) return it.x;
    if (it.r.width === undefined) return null;
    const at = (e: CreditsAlign) => creditsEdgeFraction(e, it.r.rtl === true) * it.r.width!;
    return it.x - at(it.r.anchor) + at(edge);
  };
  const alignOf = (list: Item[]): { edge: CreditsAlign; at: number } | null => {
    const edges: CreditsAlign[] = [list[0].r.anchor, 'start', 'middle', 'end'];
    for (const edge of edges) {
      const at = list.map((it) => edgeAt(it, edge));
      if (at.some((v) => v === null)) continue;
      const v = at as number[];
      if (Math.max(...v) - Math.min(...v) <= tolX) return { edge, at: v.reduce((s, n) => s + n, 0) / v.length };
    }
    return null;
  };
  const roles = groups.map((g) => g.role);
  const names = groups.flatMap((g) => g.names);
  let align: CreditsStyle['align'];
  let column: number | undefined;
  if (layout === 'role-above') {
    const one = alignOf(order);
    if (!one) return refuse('misaligned', 'The roles and names do not line up on one edge.', order.map((it) => it.r.candidateId));
    align = { role: one.edge, name: one.edge };
  } else {
    const r = alignOf(roles);
    const n = alignOf(names);
    if (!r || !n) return refuse('misaligned', `The ${r ? 'names' : 'roles'} do not line up in one column.`, (r ? names : roles).map((it) => it.r.candidateId));
    align = { role: r.edge, name: n.edge };
    column = n.at - r.at;
  }

  const firstWith = (min: number) => paired.find((g) => g.names.length >= min);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const step = (from: Item | undefined, to: Item | undefined) => (from && to ? round2(to.y - from.y) : undefined);
  const twoNames = firstWith(2);
  const gapFrom = groups.length > 1 ? groups[0] : undefined;
  const steps: CreditsStyle['steps'] = {
    ...(layout === 'role-above' ? { roleToName: step(paired[0].role, paired[0].names[0]) } : {}),
    ...(twoNames ? { nameToName: step(twoNames.names[0], twoNames.names[1]) } : {}),
    ...(gapFrom ? { groupGap: step(gapFrom.names[gapFrom.names.length - 1] ?? gapFrom.role, groups[1].role) } : {}),
    ...(column !== undefined ? { column: round2(column) } : {}),
  };

  const roleWord = (s: string) => s.replace(/\s*[:;]\s*$/, '');
  const badRole = roles.filter((it) => {
    const w = roleWord(it.r.text);
    return !w || /[:;|\t]/.test(w) || w.startsWith('#') || w.length > CREDITS_ROLE_MAX;
  });
  const badName = names.filter((it) => {
    const mark = it.r.text.search(/[:;]/);
    return !it.r.text || /[|\t]/.test(it.r.text) || it.r.text.startsWith('#') || (mark > 0 && mark <= CREDITS_ROLE_MAX);
  });
  const bad = [...badRole, ...badName];
  if (bad.length > 0) return refuse('not-list-format', 'A role or name cannot be written in the credits list format as drawn.', bad.map((it) => it.r.candidateId));

  const list = groups.flatMap((g) => [`${roleWord(g.role.r.text)}:`, ...g.names.map((it) => it.r.text)]).join('\n');
  return {
    ok: true,
    style: {
      layout,
      anchors: order.map((it) => ({ candidateId: it.r.candidateId, kind: kindOf(it) })),
      align,
      steps,
      list,
      roleSuffix: /\s*[:;]\s*$/.exec(roles[0].r.text)?.[0].trim() ?? '',
    },
  };
}

/** The author's one answer where a drawing's columns are ambiguous: read each line the other
 *  way, so the other column is the role. Absent reads in the text's own direction. */
export interface CreditsChoice {
  swap?: boolean;
}

/**
 * Whether a drawing's two columns could each be the roles: both readings describe credits and
 * name different layers as roles. Only a role-beside drawing can be read both ways; then the
 * author gets the one choice, `CreditsChoice.swap`, and nothing is guessed further.
 */
export function creditsColumnsAmbiguous(readings: readonly (CreditsReading | null)[], ids: readonly string[]): boolean {
  const read = analyseCreditsStyle(readings, ids);
  const swapped = analyseCreditsStyle(readings, ids, { swap: true });
  if (!read.ok || !swapped.ok || read.style.layout !== 'role-beside') return false;
  const kinds = (a: CreditsStyle) => a.anchors.map((x) => `${x.candidateId}:${x.kind}`).sort().join(',');
  return kinds(read.style) !== kinds(swapped.style);
}

/** One section of a credits list as the shipped parser reads it, in order. */
export type CreditsListItem =
  | { type: 'heading'; text: string }
  | { type: 'group'; role: string; names: string[] }
  | { type: 'entry'; text: string };

let listParser: ((text: string, escape: (s: string) => string) => CreditsListItem[][]) | null = null;

/**
 * A credits list as the operator's field holds it, read by the parser every credits roll ships
 * (`CREDITS_PARSER_JS`), so a preview cannot read the list differently from the graphic: headings,
 * each role with its zero, one or several names, and loose names, in the list's order. Sections
 * are what blank lines separate. The text is never escaped here; a preview writes it as text.
 */
export function readCreditsList(text: string): CreditsListItem[][] {
  listParser ??= new Function(`${CREDITS_PARSER_JS}\nreturn parseCredits;`)() as typeof listParser;
  return listParser!(text, (s) => s);
}

/** What the wizard previews for the layer picked as Credits. */
export type CreditsPreview =
  | { styled: true; layout: CreditsLayout; rtl: boolean; ambiguous: boolean; anchors: DesignSvgCreditsAnchor[]; list: CreditsListItem[][] }
  | { styled: false; list: CreditsListItem[][] };

/**
 * THE PREVIEW OF THE ONE CREDITS LIST the picked layer declares. Where the picked layer is one
 * line of roles and names drawn as separate layers, the anchors are every text layer read at or
 * below it (a title drawn above stays artwork) and the list is the one
 * `analyseCreditsStyle` writes; the layout is the drawing's, and `ambiguous` says whether the
 * columns need the author's one choice. Anything else previews the layer's own text as the list.
 * Either way the list is read by the shipped parser, never a second grammar.
 */
export function creditsPreview(root: Element, candidateIds: readonly string[], creditsId: string, choice: CreditsChoice = {}): CreditsPreview {
  const all = readCreditsAnchors(root, candidateIds);
  const picked = all[candidateIds.indexOf(creditsId)];
  const own = (): CreditsPreview => ({ styled: false, list: readCreditsList(creditsLayerText(root, creditsId)) });
  if (!picked || picked.lines > 1) return own();
  // "Below" in the block's own frame, as the analysis reads it: a turned block's lines are not
  // level in the artwork's.
  const [a, b, c, d] = picked.linear;
  const down = (r: CreditsReading) => (-b * r.x + a * r.y) / (a * d - b * c || 1);
  const ids = candidateIds.filter((_, i) => {
    const r = all[i];
    return r && down(r) >= down(picked) - 0.25 * Math.min(r.size, picked.size);
  });
  const readings = readCreditsAnchors(root, ids);
  const analysis = analyseCreditsStyle(readings, ids, choice);
  if (!analysis.ok || !analysis.style.anchors.some((a) => a.candidateId === creditsId)) return own();
  return {
    styled: true,
    layout: analysis.style.layout,
    rtl: readings.every((r) => r?.rtl === true),
    ambiguous: creditsColumnsAmbiguous(readings, ids),
    anchors: analysis.style.anchors,
    list: readCreditsList(analysis.style.list),
  };
}

/** A text layer's drawn lines, one per baseline with section gaps as blank lines (the editable
 *  roll's sample reading), or its plain text where it draws no runs. */
function creditsLayerText(root: Element, candidateId: string): string {
  const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${candidateId}"]`);
  const text = el?.closest('text') ?? el;
  if (!text) return '';
  return readSampleText(new XMLSerializer().serializeToString(text), candidateId) ?? (text.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Which credits engine a saved design selects: the original-text roll, the artwork's own
 *  styling, the editable roll, or none. One answer per design. The original-text marker wins, as
 *  it does in the assembler, so a binding carrying both (`conflicting-engine`) never half-builds
 *  as styled. A styled binding builds styled only where it validates and a row has rendered its
 *  layout and playback (`CREDITS_RENDERED`); otherwise it builds its declared fallback, the
 *  original-text roll, and never half-applies. */
export function creditsEngine(svg: DesignSvg): 'styled' | 'artwork' | 'editable' | null {
  const behaviour = svg.behaviour;
  if (behaviour?.kind !== 'recipe' || behaviour.recipe !== CREDITS_RECIPE_ID) return null;
  if (behaviour.options?.artwork === true) return 'artwork';
  if (!behaviour.credits) return 'editable';
  return styledCredits(svg) ? 'styled' : 'artwork';
}

/**
 * THE LAYOUTS AND PLAYBACKS THE STYLED ENGINE RENDERS. Row 19 renders role above as a roll; role
 * beside (row 20), static (row 22) and cards (row 23) are added by the rows that render them, so a
 * binding nothing renders yet builds the original-text roll instead of an untested picture.
 */
export const CREDITS_RENDERED: Readonly<Record<CreditsLayout, readonly CreditsPlayback[]>> = {
  'role-above': ['roll'],
  'role-beside': [],
};

/** The style a saved styled binding builds with, or null when it builds anything else. */
export function styledCredits(svg: DesignSvg): CreditsStyle | null {
  const behaviour = svg.behaviour;
  if (behaviour?.kind !== 'recipe' || behaviour.recipe !== CREDITS_RECIPE_ID || !behaviour.credits) return null;
  if (behaviour.options?.artwork === true) return null;
  if (!CREDITS_RENDERED[behaviour.credits.layout]?.includes(behaviour.credits.playback)) return null;
  const read = readBindingMemo(svg);
  return read.errors.length === 0 ? read.style : null;
}

/**
 * WHAT HAPPENS WHEN THE CREDITS DO NOT FIT, decided once per playback. Nothing is ever dropped,
 * clipped, or moved to another layout or a catalog design.
 *
 * - `wide`: a role or name wider than its column's room shrinks, is reported past 55% through the
 *   graphic's overflow report and stops at the 30% floor (the SVG fit ladder's numbers).
 * - `tall`, roll: the list runs through whatever its length.
 * - `tall`, static: the whole list shrinks together to the same floor; past it the take is refused
 *   with the overflow reported.
 * - `tall`, cards: a group that fits stays whole on one card; a longer one continues on the next
 *   card at a name boundary under its role repeated; one name taller than a card is reported.
 */
export const CREDITS_OVERFLOW: Readonly<Record<CreditsPlayback, { wide: 'shrink-report'; tall: 'run-through' | 'shrink-then-refuse' | 'next-card' }>> = {
  roll: { wide: 'shrink-report', tall: 'run-through' },
  static: { wide: 'shrink-report', tall: 'shrink-then-refuse' },
  cards: { wide: 'shrink-report', tall: 'next-card' },
};

/**
 * Every reason a saved styled credits binding cannot be built as it stands, empty when it can.
 * The stored layout and anchor kinds must be what the markup still shows, so a stale binding
 * fails whole rather than half-applying.
 */
export function validateCreditsBinding(svg: DesignSvg, root?: Element): string[] {
  return (root ? readBinding(svg, root) : readBindingMemo(svg)).errors;
}

interface CreditsBindingRead {
  errors: string[];
  /** The style the markup shows, read the way the binding's stored kinds say. */
  style: CreditsStyle | null;
}

// The assembler asks for the same binding several times per build, and the wizard rebuilds on
// every change: one laid-out reading per markup and binding.
let bindingMemo: { key: string; read: CreditsBindingRead } | null = null;

function readBindingMemo(svg: DesignSvg): CreditsBindingRead {
  // Drawn widths change when a face arrives, so a reading taken before is not reused after.
  const fonts = typeof document !== 'undefined' && document.fonts ? `${document.fonts.status}:${document.fonts.size}` : '';
  const key = JSON.stringify([svg.behaviour, svg.fields.map((f) => f.candidateId), fonts]) + svg.markup;
  if (bindingMemo?.key === key) return bindingMemo.read;
  const read = readBinding(svg);
  bindingMemo = { key, read };
  return read;
}

function readBinding(svg: DesignSvg, root?: Element): CreditsBindingRead {
  const behaviour = svg.behaviour;
  if (behaviour?.kind !== 'recipe' || !behaviour.credits) return { errors: [], style: null };
  const model = behaviour.credits;
  const errors: string[] = [];
  let style: CreditsStyle | null = null;
  if (behaviour.recipe !== CREDITS_RECIPE_ID) errors.push('wrong-recipe: only the credits recipe carries a credits style.');
  if (behaviour.options?.artwork === true) errors.push('conflicting-engine: the original-artwork roll and the styled credits cannot both be chosen.');
  if (model.v !== 1) errors.push(`unknown-version: ${String(model.v)}.`);
  if (!(CREDITS_LAYOUTS as readonly string[]).includes(model.layout)) errors.push(`invalid-layout: ${String(model.layout)}.`);
  if (!(CREDITS_PLAYBACKS as readonly string[]).includes(model.playback)) errors.push(`invalid-playback: ${String(model.playback)}.`);
  if (model.advance !== undefined) {
    if (model.playback !== 'cards') errors.push('invalid-advance: only cards advance on a timer.');
    else if (!Number.isFinite(model.advance) || model.advance < CREDITS_CARD_SECONDS.min || model.advance > CREDITS_CARD_SECONDS.max) {
      errors.push(`invalid-advance: a card holds ${CREDITS_CARD_SECONDS.min} to ${CREDITS_CARD_SECONDS.max} seconds.`);
    }
  }
  const content = creditsIndex(svg);
  if (content === -1) errors.push('no-content-field: the credits list needs its one field.');
  const ids = (model.anchors ?? []).map((x) => x.candidateId);
  // Laid out where there is a page, so drawn widths and stylesheet looks read as the wizard
  // read them; a parsed document only where there is none.
  const laid = root ? null : creditsLaidOut(svg.markup);
  const scope = root ?? laid?.root ?? new DOMParser().parseFromString(svg.markup, 'image/svg+xml').documentElement;
  try {
    // Layers compared as the text each one draws, since a run's id names its whole text.
    const textOf = (id: string | undefined) => (id ? scope.querySelector(`[${SVG_CANDIDATE_ATTR}="${id}"]`)?.closest('text') ?? null : null);
    const texts = ids.map(textOf).filter((el) => el !== null);
    if (new Set(texts).size !== texts.length) errors.push('duplicate-anchor: a layer is named twice.');
    const contentText = textOf(svg.fields[content]?.candidateId);
    const perName = svg.fields.filter((f) => {
      const own = textOf(f.candidateId);
      return own !== null && own !== contentText && texts.includes(own);
    });
    if (perName.length > 0) errors.push(`field-per-name: ${perName.map((f) => f.candidateId).join(', ')} would each be a field.`);
    const readings = readCreditsAnchors(scope, ids);
    // Where the columns are ambiguous, the author's answer is the one the stored kinds give.
    const read = analyseCreditsStyle(readings, ids);
    const swapped = creditsColumnsAmbiguous(readings, ids) ? analyseCreditsStyle(readings, ids, { swap: true }) : null;
    const chosen = swapped?.ok && sameAnchors(swapped.style.anchors, model.anchors) ? swapped : read;
    analyseInto(errors, model, chosen);
    if (chosen.ok) style = chosen.style;
  } finally {
    laid?.done();
  }
  return { errors, style };
}

/** The markup placed on the page, unseen, for as long as a reading takes; null without a page. */
function creditsLaidOut(markup: string): { root: Element; done: () => void } | null {
  if (typeof document === 'undefined' || !document.body) return null;
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  host.appendChild(parsed);              // adopted into the page by the append
  document.body.appendChild(host);
  return { root: host.firstElementChild as Element, done: () => host.remove() };
}

const anchorKey = (anchors: readonly DesignSvgCreditsAnchor[]) => anchors.map((x) => `${x.candidateId}:${x.kind}`).join(',');
const sameAnchors = (a: readonly DesignSvgCreditsAnchor[], b: readonly DesignSvgCreditsAnchor[]) => anchorKey(a) === anchorKey(b);

function analyseInto(errors: string[], model: DesignSvgCredits, analysis: CreditsAnalysis): void {
  if (!analysis.ok) {
    errors.push(`${analysis.code}: ${analysis.message} (${analysis.anchors.join(', ')})`);
    return;
  }
  if (analysis.style.layout !== model.layout) errors.push(`stale-layout: the artwork shows ${analysis.style.layout}.`);
  if (!sameAnchors(analysis.style.anchors, model.anchors)) errors.push('stale-anchors: the layers no longer read in this order or role.');
}
