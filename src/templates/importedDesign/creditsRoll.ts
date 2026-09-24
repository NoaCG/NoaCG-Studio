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
// the catalog roll's clamp, and it applies from the next take because the travel is measured
// when the take starts.
//
// Design-owned JS OUTSIDE the marked ANIMATION region, like the clock engine: the timeline only
// CALLS it (the recipe's entrance names `noacgCreditsRoll`), so a preset swap never rewrites it
// and a reader can change the pace here.

import { SVG_CANDIDATE_ATTR } from '../../assets/svgImport';
import type { DesignSvg } from '../../model/wizard';
import {
  CREDITS_BOX_ROLE,
  CREDITS_FIELD_ROLE,
  CREDITS_RECIPE_ID,
  CREDITS_ROLL_CALL,
  CREDITS_SPEED_KEY,
} from '../behaviours/credits';
import { CREDITS_PARSER_JS } from '../endCredits/shared';

/**
 * THE AUTHORED PACE, in lines per second at Scroll speed 100. Chosen so a list of about twenty
 * lines rolls through a 1080-tall frame in about thirty seconds (the owner's brief for the
 * classroom credits, 2026-09-24): at a 52px leading the list is about 1,100px, the frame adds
 * 1,080, and 2,180px at 70px a second is 31 s. A show that wants it slower types 80 into
 * Scroll speed; the constant is what 100 means.
 */
export const CREDITS_LINES_PER_SECOND = 1.35;

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

/**
 * The sample as the operator first sees it in the Credits box: one line per drawn baseline.
 * The import's own `sample` joins a block's lines with a SPACE, which is right for a question
 * that wraps and wrong for a list whose line breaks are the format - so the lines are read back
 * off the markup here, grouped by baseline the way the engine below groups them.
 */
export function creditsSampleText(svg: DesignSvg): string {
  const field = svg.fields[creditsIndex(svg)];
  if (!field) return '';
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
// at the same speed. About twenty lines pass through a 1080 frame in about thirty seconds.
var NOACG_CREDITS_LINES_PER_SECOND = ${CREDITS_LINES_PER_SECOND};

${CREDITS_PARSER_JS}

// creditsSample(): the drawn Credits text - the sample the looks and the leading are read from.
function creditsSample() {
  return document.querySelector('.${cls}');
}

// creditsField(role): the holder behind one of the recipe's fields - the pasted list, the
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
}

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

// creditsWindow(sample): where the roll runs, as a rectangle in the rows' own space - the
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
// What the last take measured, for a reader (and for the spec that pins the pace): where the
// list started and ended, how far it travelled, how long it took, and how many rows it carried.
var noacgCreditsLast = null;

// ${CREDITS_ROLL_CALL}(): THE TAKE. Rebuild the rows, size the window, and run the whole list
// from below it to above it at a constant speed - never eased, because a credit roll reads at
// one pace. Named by the entrance's own call in the animation data, so every playout road that
// takes the graphic rolls it.
function ${CREDITS_ROLL_CALL}() {
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
  if (noacgCreditsTween) noacgCreditsTween.kill();
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
  var perSecond = step * NOACG_CREDITS_LINES_PER_SECOND * creditsSpeed() * (typeof motionSpeed === 'function' ? motionSpeed() : 1);
  var duration = distance / perSecond;
  noacgCreditsLast = { startY: startY, endY: endY, distance: distance, duration: duration, rows: rows.children.length, step: step, boxed: win.boxed };
  noacgCreditsTween = gsap.fromTo(roll, { y: startY }, { y: endY, duration: duration, ease: 'none' });
  return noacgCreditsTween;
}

// creditsDataUpdated(): update() wrote the fields - rebuild the rows in place. A roll already
// running keeps travelling with the new rows; the speed applies from the next take.
function creditsDataUpdated() {
  creditsRender();
}

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
