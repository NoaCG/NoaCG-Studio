// The IMPORTED SVG DESIGN: a layered SVG the user made elsewhere, inlined VERBATIM, with its
// own <text> layers bound to operator fields (docs/SVG_IMPORT_PLAN.md).
//
// Architecture B from the plan: the SVG's own text nodes get id="fN" and the standard
// update() writes their textContent - the typography IS the designer's, nothing is redrawn.
// The only edits the markup takes are (a) id="fN" on the bound nodes, (b) sanitization
// (already done at import - assets/svgImport.ts), (c) the candidate markers stripped, and
// (d) a class on the root <svg> so the part registry can name it. Everything else ships
// byte-for-byte as the designer exported it.
//
// Like the raster imported design (shared.ts) this self-assembles from shared/base.ts: the
// ARTWORK decides the size, so the box is exactly the SVG's fitted width - never the standard
// assembler's fit-content text cap. The output is an ordinary standard-contract template
// (.imported-design-box), so the canvas, the timeline, the exports and the validation gate
// all work unchanged.

import type { SpxTemplate } from '../../model/types';
import { definitionScriptBlock } from '../../model/spxDefinition';
import { resolveEasing } from '../../model/easings';
import {
  paletteById,
  resolveOptions,
  type DesignSvg,
  type ResolvedOptions,
  type TemplateVariant,
  type WizardOptions,
} from '../../model/wizard';
import { svgFieldSelectors, svgLayerSelectors } from '../../model/structure';
import type { AnimData } from '../../blocks/animData';
import {
  baseSettings,
  computeScale,
  DATA_SOURCE_CLASS,
  dataSourceCss,
  documentHtml,
  resetCanvasCss,
  resolveHeadingFont,
  rootVarsCss,
  runtimeJs,
  zoneCssText,
} from '../shared/base';
import { clockRuntimeJs } from '../shared/clock';
import { convertToDataRegion } from '../shared/standard';
import { attachMachine } from '../types/graphicType';
import { boundBehaviour } from './behaviour';
import { countdownIndex, svgFields } from './artworkFields';
import { creditsIndex, creditsRollCss, creditsRollRuntimeJs } from './creditsRoll';
import type { AnimPreset, PresetConfig } from '../lowerThirds/animPresets';
import { DESIGN_PRESETS } from './designPresets';
import { PREFIX } from './shared';
import { bindSvgMarkup, candidateLabel } from './svgBind';
import { svgFontCss } from './svgFonts';
import { LAYOUT_EL_ATTR, layoutDataJs, layoutRules, saidLines } from './svgLayout';
import svgFitSource from './runtime/svgFit.js?raw';
import svgFitBootSource from './runtime/svgFitBoot.js?raw';

// Moved to the pass that owns them; the wizard keeps importing all four constants from here.
export { PANEL_SAFE, SVG_ALIGN_WORD } from './svgLayout';

/**
 * HOW NEAR THE MIDDLE COUNTS AS CENTRED, as a fraction of the box on the axis being asked about.
 *
 * A fraction rather than a constant because "near enough to be centred" scales with the thing it
 * is centred in, and it has to absorb the hand-placed wobble in a home-made file, where nothing
 * is ever exactly on the middle.
 *
 * EXPORTED because the wizard's mapping step reads the same answer off its own render of the
 * artwork, to show the reader which alignment was read from their drawing
 * (`MapSvgFieldsStep.boxFitOf`). Two numbers would be two answers, and the overlay would then
 * say "centred" over a line the runtime had left-aligned. It is filled into the fit runtime
 * (`runtime/svgFit.js`), so the emitted template carries the value rather than a reference to it.
 */
export const SVG_ALIGN_TOL = 0.05;

/**
 * A WRAPPED LINE'S STEP, IN EMS - the leading the ladder assumes where the file gives it none.
 *
 * EXPORTED for the same reason `SVG_ALIGN_TOL` is: the mapping step's overlay draws the room a
 * centred block has, and on that axis the room is HALF A LINE from each edge rather than the gap
 * the designer left, because that gap is half the centring rather than a margin (`measureSvgRoom`,
 * runtime/svgFit.js, owner 2026-09-02). Two spellings of half a line would be two rooms.
 */
export const SVG_LINE_HEIGHT = 1.2;

/** Stand-in used only when a preview (or the catalog baseline) renders the variant before an
 *  SVG exists. Deterministic on purpose - the baselines hash the emitted panes. */
const NO_SVG: DesignSvg = {
  markup:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 270">` +
    `<rect width="960" height="270" fill="rgba(10,12,16,0.86)"/></svg>`,
  width: 960,
  height: 270,
  fields: [],
  images: [],
  outlines: [],
  fonts: [],
};

/**
 * A RUNTIME FILE AS THE GRAPHIC GETS IT (`runtime/`, plain ES5 so it lints as what it is). Each
 * `__NAME__` token is replaced by its value, so the emitted text carries the value rather than a
 * reference to it. A Windows checkout writes the file with CRLF line ends; the graphic gets LF
 * either way, so the emitted bytes never depend on the machine that built them. A token left
 * without a value throws here, where every build and test meets it, rather than on air.
 */
function fillRuntime(text: string, values: Record<string, string | number>): string {
  let out = text.replace(/\r\n/g, '\n');
  for (const [name, value] of Object.entries(values)) out = out.split(`__${name}__`).join(String(value));
  const unfilled = /__[A-Z][A-Z0-9_]*__/.exec(out);
  if (unfilled) throw new Error(`fillRuntime: ${unfilled[0]} has no value`);
  return out;
}

/**
 * The overflow-only text fit (plan §3): SVG text neither wraps nor clips, so a longer
 * operator value would simply run past the artwork. The runtime records each bound node's
 * original length on first measure and applies `textLength` + `lengthAdjust` ONLY when a new
 * value overflows it - never distorting by default, mirroring the raster flow's
 * shrink-not-condense rule. Design-owned JS OUTSIDE the marked region, so the data
 * conversion and every export carry it untouched.
 *
 * ONE FIT PER GRAPHIC (plan §6b). This runtime measures BOTH kinds of line an imported SVG
 * can carry: the `<text>`/`<tspan>` layers the designer drew, and the HTML lines PLACED on the
 * artwork afterwards - an outlined-text stand-in (plan §1.A) or a field added later. The
 * placed ones used to have a fit of their own (`fitPlacedText`, templates/shared/textFit.ts,
 * which the RASTER import still uses) with no room measurement, no height check and no
 * overflow report - so the operator's too-long warning covered the drawn text and went silent
 * on an outlined-text field. `blocks/designLayout.ts` now leaves a template carrying this
 * ladder alone, and update() calls this one hook instead of two.
 *
 * The room a PLACED line gets is its own SLOT - the width its wrapper declares - because
 * nothing was drawn behind it to measure a margin from. The slot is authored (measured from
 * the outlined group's box, or dragged on the canvas), which is why it beats any rectangle a
 * container search might find under it; and being a width alone, a placed line does not wrap.
 * The full reasoning is plan §6b "THE ROOM RULE FOR A PLACED LINE".
 */
// The runtime is `runtime/svgFit.js`; the leading line break is the one the string always began with.
const SVG_FIT_JS = `\n${fillRuntime(svgFitSource, { PREFIX, SVG_ALIGN_TOL, SVG_LINE_HEIGHT })}`;

/**
 * THE FIT'S BOOT - the two load-time passes and the arrives-later observer - emitted LAST in the
 * design-owned JS, after the layout table and the growth runtime. In a page that is still
 * parsing the passes wait for DOMContentLoaded and the order never showed; in a document that
 * runs the template's JS after the markup is already in the DOM (an inline preview build, and the
 * OGraf wrapper until it held DOM-ready code for the end of the script, issue #964) the first
 * pass runs the moment this statement is reached, and reached before `var NOACG_LAYOUT` it read
 * a hoisted undefined - a growth rule threw, and a declared alignment was silently the derived
 * one, cached for the life of the document.
 */
const SVG_FIT_BOOT = `\n${fillRuntime(svgFitBootSource, { PREFIX })}`;

/** THE TWO POINT SHIFTERS, emitted for a design that grows a panel or fills a gauge: a panel
 *  drawn as a path or a polygon grows by them, and so does a behaviour's gauge drawn that way
 *  (behaviourRuntime.ts `noacgGauge`), which is why they are not inside the growth runtime. */
const SHAPE_SHIFT_JS = `
// ── Growing a PATH panel ──────────────────────────────────────────────────────
// A rounded rectangle exported as a <path> grows the way a 9-slice does: every point on the
// GROWING side of the shape's middle moves by the grant, so the two straight runs get longer
// and the drawn corner curves ride along unchanged. "dir" says which side that is - the far
// half for a panel growing right or down, the near half (moved the other way) for one growing
// up. The path data is parsed to absolute segments once per apply, shifted, and re-emitted;
// resting restores the drawn data verbatim.
function svgShiftPathD(d, axis, split, dir, delta) {
  var tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\\d*\\.\\d+|\\d+)(?:e[-+]?\\d+)?/gi);
  if (!tokens) return d;
  var ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  var x = 0, y = 0, sx = 0, sy = 0;
  var out = '';
  var i = 0, cmd = '';
  var moves = function (v) { return dir < 0 ? v < split : v > split; };
  var shift = function (vx, vy) {
    // Everything is emitted ABSOLUTE, the shifted coordinate included, so a relative source
    // command cannot smear the shift across the points that follow it.
    if (axis === 'y') return vx.toFixed(3) + ',' + (moves(vy) ? vy + dir * delta : vy).toFixed(3);
    return (moves(vx) ? vx + dir * delta : vx).toFixed(3) + ',' + vy.toFixed(3);
  };
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) cmd = tokens[i++];
    var upper = cmd.toUpperCase();
    var n = ARITY[upper];
    if (n === undefined) return d;                 // unknown command: hand the data back untouched
    if (upper === 'Z') { out += 'z'; x = sx; y = sy; continue; }
    var nums = [];
    for (var k = 0; k < n; k++) nums.push(parseFloat(tokens[i + k]));
    i += n;
    var rel = cmd !== upper;
    if (upper === 'H') { x = rel ? x + nums[0] : nums[0]; out += 'L' + shift(x, y); }
    else if (upper === 'V') { y = rel ? y + nums[0] : nums[0]; out += 'L' + shift(x, y); }
    else if (upper === 'A') {
      x = rel ? x + nums[5] : nums[5];
      y = rel ? y + nums[6] : nums[6];
      out += 'A' + nums[0] + ',' + nums[1] + ',' + nums[2] + ',' + nums[3] + ',' + nums[4] + ',' + shift(x, y);
    } else {
      var abs = [];
      for (var p = 0; p + 1 < n; p += 2) {
        abs.push(shift(rel ? x + nums[p] : nums[p], rel ? y + nums[p + 1] : nums[p + 1]));
      }
      x = rel ? x + nums[n - 2] : nums[n - 2];
      y = rel ? y + nums[n - 1] : nums[n - 1];
      out += upper + abs.join(',');
      if (upper === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
    }
  }
  return out;
}

// ── Growing a POLYGON panel ───────────────────────────────────────────────────
// Illustrator writes any straight-edged shape that is not a rectangle as a <polygon>: the
// slanted plates of a sports lower third are the common case. It grows exactly like a panel
// path - every corner on the growing side of the middle moves by the grant, so a slanted edge
// keeps its slant - with the points list rewritten instead of path data.
function svgShiftPoints(points, axis, split, dir, delta) {
  var nums = String(points).match(/-?(?:\\d*\\.\\d+|\\d+)(?:e[-+]?\\d+)?/gi);
  if (!nums || nums.length % 2) return points;
  var out = [];
  for (var i = 0; i + 1 < nums.length; i += 2) {
    var x = parseFloat(nums[i]);
    var y = parseFloat(nums[i + 1]);
    var v = axis === 'y' ? y : x;
    var moved = (dir < 0 ? v < split : v > split) ? v + dir * delta : v;
    out.push(axis === 'y' ? x + ',' + moved.toFixed(3) : moved.toFixed(3) + ',' + y);
  }
  return out.join(' ');
}
`;

/**
 * THE HUG (docs/SVG_IMPORT_PLAN.md §3), emitted only for a design whose author said its panel
 * grows. Its doctrine is the raster stretch runtime's (importedDesign/stretch.ts): ONE measured
 * value - how far the longest bound line overflows the width it was drawn at - widens the
 * panel, and the text fit above then answers only what the frame's safe margin could not give.
 *
 * Everything is measured in SCREEN px and converted back through each element's own CTM,
 * because a group between the artwork's root and a layer may carry a transform, and comparing
 * raw attribute numbers across two such spaces is how a banner ends up growing the wrong way.
 */
function growthRuntimeJs(): string {
  return `
// ── Panel hug (SVG) ───────────────────────────────────────────────────────────
// The panel below grows with its text: a longer value widens it instead of shrinking the type,
// which is what a lower third wants (a board wants the opposite, and simply has no such
// function). Everything drawn PAST the panel's right edge travels with it, and the growth stops
// at the frame's safe margin - past that, the text fit shrinks whatever is still over.
// Remove this block and the graphic becomes a fixed one.
//
// One limit worth knowing: a follower travels by its transform ATTRIBUTE, and a CSS transform
// beats an attribute - so a layer the timeline animates in its own right (a per-layer stagger,
// say) stays where its animation puts it instead of travelling with the edge.
// Per rule, measured at rest and rebuilt on every pass: the element's drawn size, what travels
// with its edge, and the bound lines inside it. Indexed by the rule's position in the table.
var svgGrowRest = [];

/** The element a table row names, by the stamp it carries in the artwork. The stamp is a LIST -
 *  a panel that both widens and wraps is named by two rows - so the match is word-wise. */
function svgLayoutEl(token) {
  return document.querySelector('.${PREFIX}-art [${LAYOUT_EL_ATTR}~="' + token + '"]');
}

/** Screen px per unit of the space an element's own measurements are written in - the frame a
 *  drawn layer's transform lives in (svgFrameScale, which says why it is the basis vector's
 *  LENGTH), and for a PLACED line the painted-to-layout ratio, since that is the space its width
 *  and its slot are both measured in.
 *
 *  ASKED OF PANELS AND FOLLOWERS AS WELL AS LINES. Growth is decided in screen px and spent by
 *  writing a rect's width, a path's points or a follower's transform, all of which are user
 *  units - so this is the only conversion between the two, and svgFitPlaced has to answer
 *  correctly for a shape and not only for a line. */
function svgUserScale(el) {
  // Both defined in the fit block above.
  return svgFitPlaced(el) ? svgPlacedScale(el) : svgFrameScale(el);
}

/** THE ATTRIBUTES A RULE'S GROWTH WRITES, with the values they hold right now: sideways a
 *  rect's width, downwards its height - and its y as well when it grows UPWARD, because a
 *  rect extends from its own y. A panel drawn as a PATH (Illustrator's rounded rectangle) has
 *  no width to change, so the half of its points past the middle is shifted instead
 *  (svgShiftPathD), which keeps the corner radii exactly as drawn.
 *
 *  Read at rest it is the design, and svgGrowSet puts that back verbatim; read at apply time
 *  it is the design plus whatever an earlier rule of the same pass granted, which is what lets
 *  one panel carry both a widening row and a wrapping one. */
function svgGrowBase(rule, el, dir) {
  var base = {};
  var tag = (el.tagName || '').toLowerCase();
  if (tag === 'path') {
    base.d = el.getAttribute('d');
    return base;
  }
  if (tag === 'polygon') {
    base.points = el.getAttribute('points');
    return base;
  }
  var ax = svgGrowAxis(rule, el);
  base[ax.attr] = el.getAttribute(ax.attr);
  // A shape extends from its own origin, so growing towards the origin has to move it back by
  // the same amount - the rect's y when a panel gets taller upwards, its x when one gets wider
  // leftwards. Captured only in that case, so a graphic that grows the other way emits and
  // restores exactly the attributes it always did.
  if (ax.sign !== dir) base[ax.origin] = el.getAttribute(ax.origin);
  return base;
}

/** WHICH OF A SHAPE'S OWN AXES RUNS ALONG THE SCREEN AXIS THE RULE NAMES, and which way.
 *
 *  A rect has no width on the screen's axes - it has a width along ITS OWN x, and a transform
 *  decides where that points. Plates written as a portrait rect plus a rotation are what
 *  hand-drawn artwork looks like: the owner's quiz board writes all five of its plates that way,
 *  its question plate a 231x1233 rect turned -88.68 degrees to paint a 1238x259 band. Growing
 *  that plate's width attribute made the painted band 100 px TALLER for a rule that says "the
 *  panel gets wider" (measured 2026-09-03), because width ran down the band rather than across
 *  it.
 *
 *  So the attribute to grow is chosen by asking the element's own matrix which of its axes the
 *  rule's screen axis is: local +x lands on screen at (a, b), local +y at (c, d), and the axis
 *  with the larger component along the wanted direction is the one that runs that way. The sign
 *  says whether extending that attribute moves the far edge the way the rule wants to go, so a
 *  plate rotated the other way grows from its origin instead. Without a matrix it answers what
 *  it always answered. */
function svgGrowAxis(rule, el) {
  var want = rule.axis === 'y' ? 'y' : 'x';
  var fallback = want === 'y'
    ? { attr: 'height', origin: 'y', sign: 1 }
    : { attr: 'width', origin: 'x', sign: 1 };
  var m = el.getScreenCTM ? el.getScreenCTM() : null;
  if (!m) return fallback;
  var alongLocalX = want === 'y' ? m.b : m.a;
  var alongLocalY = want === 'y' ? m.d : m.c;
  if (Math.abs(alongLocalX) >= Math.abs(alongLocalY)) {
    return { attr: 'width', origin: 'x', sign: alongLocalX < 0 ? -1 : 1 };
  }
  return { attr: 'height', origin: 'y', sign: alongLocalY < 0 ? -1 : 1 };
}

/** Write a base back, attribute by attribute. A null value means the element never carried
 *  that attribute, so it is removed rather than written as "null". */
function svgGrowSet(el, base) {
  for (var k in base) {
    if (base[k] == null) el.removeAttribute(k);
    else el.setAttribute(k, base[k]);
  }
}

/** Grow one element by delta user units along "dir": a rect by arithmetic on its numbers (an
 *  upward grower moves its y as well, since a rect extends from there), a path or a polygon by
 *  shifting the points on the growing side of its own middle. */
function svgGrowElBy(rule, el, base, dir, delta) {
  // Which of the shape's OWN axes the rule's screen axis is, and which way along it: a plate
  // written as a portrait rect plus a rotation grows on the other one (svgGrowAxis).
  var ax = svgGrowAxis(rule, el);
  var tag = (el.tagName || '').toLowerCase();
  if (tag === 'path' || tag === 'polygon') {
    // A path and a polygon are both a list of points: one shifter each, one way to spend it.
    var attr = tag === 'path' ? 'd' : 'points';
    var shiftBy = tag === 'path' ? svgShiftPathD : svgShiftPoints;
    var bb = el.getBBox();
    var local = ax.attr === 'height' ? 'y' : 'x';
    var split = local === 'y' ? bb.y + bb.height / 2 : bb.x + bb.width / 2;
    // The shape's own points move along ITS axis, so the screen direction the rule wants is
    // spent through the sign that axis lands on. Growing from the MIDDLE is the same shift run
    // once each way for half the width: the split is the shape's own middle and a symmetric
    // shift never moves it, so the second pass still finds the same two halves.
    if (dir === 0) {
      var half = shiftBy(base[attr], local, split, 1, delta / 2);
      el.setAttribute(attr, shiftBy(half, local, split, -1, delta / 2));
      return;
    }
    el.setAttribute(attr, shiftBy(base[attr], local, split, dir * ax.sign, delta));
    return;
  }
  el.setAttribute(ax.attr, String((parseFloat(base[ax.attr]) || 0) + delta));
  // FROM THE MIDDLE: delta is the whole width gained, so the origin moves back by half of it
  // and the shape's own centre does not move. One way, the origin moves the whole way or not at
  // all, depending on which side the growth is spent on.
  var back = dir === 0 ? delta / 2 : ax.sign !== dir ? delta : 0;
  if (back) el.setAttribute(ax.origin, String((parseFloat(base[ax.origin]) || 0) - back));
}

/** WHICH WAY A RULE GROWS: +1 towards the frame's right or bottom, -1 towards its left or top,
 * and 0 for a panel that widens BOTH WAYS from its own middle.
 *
 * SIDEWAYS the text answers it. A START-ANCHORED line gains room only to its RIGHT - its room
 * was measured from where it was drawn out to the panel's far edge - so the panel widens
 * rightward whatever else is true of the composition, and every lower third is that case.
 *
 * A line the designer CENTRED (or set against the right) takes its room from the BOX INSTEAD,
 * so it gains from whichever edge moves - and then a panel that widens one way only would slide
 * out from under its own composition. It widens from its MIDDLE, which is the same rule the
 * text already keeps inside its box, one level up: a block drawn in the middle grows both ways.
 * The owner's quiz plate is drawn 212 px in from the left and 120 from the right, so mirroring
 * the left margin onto the right put the ceiling 92 px BEHIND the plate's own right edge and
 * "the panel gets wider" did nothing at any value (measured 2026-09-03). From the middle it
 * gains the nearer margin twice over, and the offset he drew survives.
 *
 * DOWNWARDS nothing ties it, so the panel grows AWAY FROM THE FRAME EDGE IT IS ANCHORED TO -
 * the nearer of the two. A lower third is drawn against the frame's BOTTOM (130px below it and
 * 760 above, on the shipped Illustrator sample), so it gets taller UPWARDS, into empty screen,
 * and the edge the designer composed against never moves.
 *
 * That was the whole reason "the text wraps onto more lines" did nothing on the archetypal
 * file (owner walk, 2026-08-29): growth was always downward and the cap mirrored the inset from
 * the frame's TOP, which put the ceiling 630px ABOVE the panel's own bottom edge. Every lower
 * third therefore measured ZERO room to grow, the wrap rung had nowhere to go, and the ladder
 * fell straight through to shrinking - the one rung the owner ruled must come last.
 */
function svgGrowDir(rule, el, frame) {
  var box = el.getBoundingClientRect();
  if (rule.axis !== 'y') {
    // ONE line that reads its room from the panel's far edge settles it: that line needs the far
    // edge to move, and nothing else about the composition can outvote it. align.width is set
    // exactly for the lines whose room is the box's own inside (measureSvgRoom), and a PENNED
    // line is bounded by a neighbour rather than by the panel, so it votes for neither.
    var lines = svgLinesInside(el);
    if (!lines.length) return 1;
    for (var i = 0; i < lines.length; i++) {
      var a = svgFitAlign[lines[i].id];
      var room = svgFitRoom[lines[i].id];
      if (!a || !(a.width > 0) || (room && room.penned)) return 1;
    }
    // AND THE MIDDLE ONLY WHERE THERE IS ROOM IN IT. Growing from the middle is bounded by the
    // NEARER margin, so a panel drawn hard against one frame edge has none at all - and a panel
    // that could have widened 400 px into the empty half of the screen would then do nothing,
    // which is the complaint this whole change answers, moved onto a different composition.
    // Where the composition can be kept it is kept; where it cannot, the panel grows the way
    // there is room to.
    var middle = svgGrowRoom(rule, el, frame, 0);
    var right = svgGrowRoom(rule, el, frame, 1);
    var left = svgGrowRoom(rule, el, frame, -1);
    if (middle >= Math.max(right, left)) return 0;
    return right >= left ? 1 : -1;
  }
  return frame.bottom - box.bottom < box.top - frame.top ? -1 : 1;
}

/** THE FURTHEST THE GROWING EDGE MAY REACH, in screen px on the frame's own axis.
 *
 * GROWTH IS SYMMETRICAL (owner, 2026-08-26): the margin the design keeps on the side the element
 * is ANCHORED to is mirrored onto the side it grows towards, so a banner drawn 150px in from the
 * left stops 150px short of the right and the graphic keeps the composition it was drawn with.
 * The rule's own safe margin is the floor, for a panel drawn hard against its edge. An inset is
 * never negative, so this can never permit growth past the frame - "we cannot have templates
 * outgrow the screen" is structural here rather than a number somebody has to keep right.
 */
function svgGrowCap(rule, el, frame, dir) {
  var box = el.getBoundingClientRect();
  if (rule.axis !== 'y') {
    var mirroredX = dir < 0 ? frame.right - box.right : box.left - frame.left;
    var marginX = svgCapMargin(rule, frame.width, mirroredX);
    return dir < 0 ? frame.left + marginX : frame.right - marginX;
  }
  var mirroredY = dir < 0 ? frame.bottom - box.bottom : box.top - frame.top;
  var marginY = svgCapMargin(rule, frame.height, mirroredY);
  return dir < 0 ? frame.top + marginY : frame.bottom - marginY;
}

/** THE MARGIN THE GROWING EDGE KEEPS, in screen px: the author's own cap where the table carries
 *  one, else the design's mirrored margin.
 *
 *  A CAP REPLACES THE MIRRORED MARGIN RATHER THAN TIGHTENING IT, so it moves the limit either
 *  way: a smaller number than the design drew grants the element MORE room, which is the point -
 *  a plate drawn hard under something has almost no mirrored margin, and the reader dragging the
 *  line down is how it gets any. The one thing a cap cannot do is loosen the SAFE margin, so a
 *  declared cap can no more reach the screen's edge than a derived one can
 *  (docs/TEXT_BOX_BINDING.md, rung 4).
 *
 *  The span is the frame on this rule's axis, and the mirrored margin is the one the design left
 *  on the side the element is anchored to. A panel growing from its MIDDLE mirrors nothing -
 *  both its sides are the same side - and passes zero, which leaves the safe margin standing
 *  exactly as it did before caps existed. */
function svgCapMargin(rule, span, mirrored) {
  return Math.max(rule.cap != null ? span * rule.cap : mirrored, span * rule.safe);
}

/** EVERYTHING THAT MOVES WHEN THIS PANEL GROWS, as one screen rectangle: the panel and every
 *  layer that travels with it. The room measurement is taken from THIS box rather than from the
 *  panel's own edge, because the margin the cap keeps has to be kept by whatever ends up nearest
 *  the frame - and on a board where four answer plates are declared followers of the question,
 *  that is an answer plate, not the question.
 *
 *  MEASURED 2026-09-08 on the owner's quiz board: the question's plate had 384px of room to its
 *  own mirrored margin and 49px to the margin its lowest follower would have to keep. The offer
 *  read the first number, so the fit wrapped into 384px of height the apply could only deliver
 *  by pushing the bottom answer 48px off the board.
 *
 *  The followers are read once at rest (svgRestOneRule), so this is arithmetic on the same
 *  settled list the apply moves - never a second opinion about who travels. */
function svgMovingBox(rest, box) {
  var out = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  var list = (rest && rest.followers) || [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i].el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if (r.left < out.left) out.left = r.left;
    if (r.right > out.right) out.right = r.right;
    if (r.top < out.top) out.top = r.top;
    if (r.bottom > out.bottom) out.bottom = r.bottom;
  }
  return out;
}

/** How much room the cap still leaves this element, in screen px - never negative.
 *
 *  For a panel widening from its MIDDLE this is the TOTAL width it may gain, half spent on each
 *  side, and the bound is the NEARER of its two margins so the offset the designer drew survives
 *  the growth instead of being flattened onto the frame's centre.
 *
 *  The resting reading is optional for one caller only: svgGrowDir asks this while it is still
 *  DECIDING which way the panel grows, which is what settles who the followers are. Every caller
 *  that grows - or offers height to the fit - passes it, so the offer and the apply read one law
 *  rather than two. They read it at different moments on purpose: the offer at rest, before any
 *  rule has grown (growSvgLayout), and the apply live, so a rule running after another has moved
 *  these layers sees where they now are. */
function svgGrowRoom(rule, el, frame, dir, rest) {
  var box = svgMovingBox(rest, el.getBoundingClientRect());
  if (dir === 0) {
    var nearer = Math.min(box.left - frame.left, frame.right - box.right);
    return Math.max(0, 2 * (nearer - svgCapMargin(rule, frame.width, 0)));
  }
  var cap = svgGrowCap(rule, el, frame, dir);
  var edge = rule.axis === 'y'
    ? (dir < 0 ? box.top : box.bottom)
    : (dir < 0 ? box.left : box.right);
  return Math.max(0, (cap - edge) * dir);
}

/** Put the artwork back exactly as drawn, so every measurement starts from the design. The
 *  resting value is the set of base ATTRIBUTES the growth writes - a rect's width figure, a
 *  path's drawn data, an upward grower's y as well - so every kind restores verbatim. The
 *  bound LINES restore too: a wrapped block was lifted (or pushed) to keep the stack against
 *  the edge the panel is anchored to, and that travel is undone here like any other. */
function svgLayoutRest() {
  for (var i = 0; i < NOACG_LAYOUT.rules.length; i++) {
    var rule = NOACG_LAYOUT.rules[i];
    var rest = svgGrowRest[i];
    var el = svgLayoutEl(rule.el);
    if (!el) continue;
    if (!rest) { rest = svgGrowRest[i] = { base: null, dir: 1, followers: [], texts: [], textBase: [] }; }
    if (rest.base === null) rest.base = svgGrowBase(rule, el, rest.dir);
    svgGrowSet(el, rest.base);
    for (var j = 0; j < rest.followers.length; j++) {
      var f = rest.followers[j];
      if (f.mode === 'grow') svgGrowSet(f.el, f.base);
      else if (f.base === null) f.el.removeAttribute('transform');
      else f.el.setAttribute('transform', f.base);
    }
    for (var t = 0; t < rest.textBase.length; t++) {
      var tb = rest.textBase[t];
      if (tb.base === null) tb.el.removeAttribute('transform');
      else tb.el.setAttribute('transform', tb.base);
    }
  }
  svgFitExtra = {};
  svgFitShift = {};
}

// WHAT TRAVELS, when the table does not say. A shape drawn entirely past the growing edge has
// to move with it or the gap the designer left would close. A GROUP that straddles the edge is
// looked inside instead of moved whole - half of it belongs on each side. A straddling SHAPE is
// left alone: it is either the growing element itself or something drawn across the boundary,
// and moving it would tear the artwork. A rotated or skewed space is skipped for the same
// reason.
//
// This is a fair guess SIDEWAYS and a poor one DOWNWARDS: below a panel sit things that should
// move, things that should stretch, and things pinned to the frame that must stay, and no
// measurement separates them (plan §6c). So a rule that means it lists its followers, and this
// is only what an unlisted one falls back to.
function svgCollectFollowers(node, grower, edge, axis, dir, out) {
  var kids = node.children;
  for (var i = 0; i < kids.length; i++) {
    var el = kids[i];
    if (el === grower || (el.contains && el.contains(grower))) continue;
    var box = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!box || (box.width === 0 && box.height === 0)) continue;
    // "Past the growing edge" reads from the edge OUTWARDS, so it flips with the direction: a
    // panel growing up pushes what is drawn ABOVE it, exactly as one growing down pushes what
    // is below.
    var lo = axis === 'y' ? box.top : box.left;
    var hi = axis === 'y' ? box.bottom : box.right;
    var beyond = dir < 0 ? hi <= edge + 0.5 : lo >= edge - 0.5;
    var straddles = dir < 0 ? lo < edge - 0.5 : hi > edge + 0.5;
    if (beyond) {
      var ctm = el.parentNode.getScreenCTM ? el.parentNode.getScreenCTM() : null;
      if (ctm && (ctm.b || ctm.c)) continue;    // rotated/skewed: not ours to move
      out.push({ el: el, base: el.getAttribute('transform'), mode: 'move' });
    } else if (straddles && el.children && el.children.length) {
      svgCollectFollowers(el, grower, edge, axis, dir, out);
    }
  }
}

/** FURNITURE THAT SPANS THE PANEL on the growing axis - an accent rail down a banner's edge, a
 *  tint band behind it - drawn to the panel's own two edges. It is neither past the growing
 *  edge (so it never travels) nor the panel itself, and left alone it simply stops covering the
 *  part the panel gained: the shipped lower third's amber rail is drawn 760-950 exactly like
 *  its plate, so a plate that grew upward showed 67px of un-railed edge. A shape that spans the
 *  panel GROWS with it instead. Only a shape, and only one that really reaches both edges. */
function svgCollectSpanners(art, rule, grower, panel, dir, out) {
  var shapes = art.querySelectorAll('rect, path, polygon, ellipse, circle');
  var axis = rule.axis === 'y' ? 'y' : 'x';
  var tol = Math.max(2, (axis === 'y' ? panel.height : panel.width) * 0.02);
  for (var i = 0; i < shapes.length; i++) {
    var el = shapes[i];
    if (el === grower || el.contains(grower) || grower.contains(el)) continue;
    var r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if (r.width * r.height >= panel.width * panel.height) continue;   // that IS the panel
    if (axis === 'y') {
      if (Math.abs(r.top - panel.top) > tol || Math.abs(r.bottom - panel.bottom) > tol) continue;
      if (r.right < panel.left + 1 || r.left > panel.right - 1) continue;
    } else {
      if (Math.abs(r.left - panel.left) > tol || Math.abs(r.right - panel.right) > tol) continue;
      if (r.bottom < panel.top + 1 || r.top > panel.bottom - 1) continue;
    }
    // ONLY WHAT CAN ACTUALLY BE STRETCHED. A circle or an ellipse spans a panel as readily as a
    // rail does and carries none of the attributes growing writes, so collecting one bought a
    // follower that could not do the thing it was collected for. A polygon grows by its points.
    if (!svgCanGrow(rule, el)) continue;
    // ALREADY SPOKEN FOR - by identity, and by CONTAINMENT either way. A group the author
    // declared travels whole, so a rail inside it would otherwise be granted the group's
    // translate AND a stretch of its own, landing a full grant from the design at the wrong
    // size. svgCollectFollowers descends into a straddling group for the same reason.
    var listed = false;
    for (var j = 0; j < out.length; j++) {
      var o = out[j].el;
      if (o === el || (o.contains && (o.contains(el) || el.contains(o)))) listed = true;
    }
    if (!listed) out.push({ el: el, base: svgGrowBase(rule, el, dir), mode: 'grow' });
  }
}

/** The followers of one rule: the DECLARED list when there is one, else the derivation. */
function svgFollowersOf(rule, el, edge, dir) {
  var axis = rule.axis === 'y' ? 'y' : 'x';
  var out = [];
  if (rule.followers && rule.followers.length) {
    for (var i = 0; i < rule.followers.length; i++) {
      var node = svgLayoutEl(rule.followers[i].el);
      if (!node) continue;
      // A DECLARED 'grow' IS DEMOTED HERE, not at apply time, because the two modes keep
      // different KINDS of resting pose: growing remembers an attribute map, travelling
      // remembers the transform string. Demoted later, the layer travelled with the attribute
      // map as its base and svgTravel wrote 'translate(...) [object Object]' - which Blink
      // discards whole, taking the transform the designer wrote with it, and svgLayoutRest then
      // restored the size it never changed rather than the transform it destroyed. Deciding the
      // mode before the pose is captured is what keeps "a layer that cannot grow travels
      // instead" (svgCanGrow) true rather than merely intended.
      var mode = rule.followers[i].mode === 'grow' && svgCanGrow(rule, node) ? 'grow' : 'move';
      var base = mode === 'grow' ? svgGrowBase(rule, node, dir) : node.getAttribute('transform');
      out.push({ el: node, base: base, mode: mode });
    }
    return out;
  }
  var art = document.querySelector('.${PREFIX}-art');
  if (art) svgCollectFollowers(art, el, edge, axis, dir, out);
  return out;
}

/** WHERE A LINE IS ANCHORED SIDEWAYS, in screen px - the one point on it a longer value cannot
 *  move. A start-anchored line keeps its left edge and grows right; an end-anchored one keeps
 *  its right; a CENTRED one keeps only its middle and grows both ways. The alignment is the one
 *  the design was read for (svgAlignOf), so this asks the artwork rather than guessing. */
function svgAnchorX(el, r) {
  var align = svgFitAlign[el.id];
  var h = align && align.h;
  if (h === 'middle') return (r.left + r.right) / 2;
  if (h === 'end') return r.right;
  return r.left;
}

/** THE FOLLOWERS OF A PANEL THAT WIDENS FROM ITS MIDDLE, each tagged with the side it travels
 *  on. A one-way rule has one moving edge and therefore one set; this has two, and a layer drawn
 *  past the left edge has to travel LEFT while one past the right travels right, or half the
 *  artwork closes in on the panel it was drawn beside. */
function svgSidedFollowers(rule, panel, box) {
  var out = [];
  var sides = [{ edge: box.right, side: 1 }, { edge: box.left, side: -1 }];
  var declared = rule.followers && rule.followers.length;
  for (var s = 0; s < sides.length; s++) {
    var got = svgFollowersOf(rule, panel, sides[s].edge, sides[s].side);
    for (var i = 0; i < got.length; i++) {
      var f = got[i];
      var listed = false;
      for (var j = 0; j < out.length; j++) if (out[j].el === f.el) listed = true;
      if (listed) continue;
      if (!declared) f.side = sides[s].side;
      else {
        // A declared list comes back whole for EITHER edge, so its side is read off the artwork:
        // which half of the panel the layer was drawn past.
        var mid = f.el.getBoundingClientRect();
        f.side = (mid.left + mid.right) / 2 < (box.left + box.right) / 2 ? -1 : 1;
      }
      // THE RESTING POSE IS CAPTURED FOR THE RULE'S OWN DIRECTION, never the side it was found
      // on. A stretching follower is grown by svgApplyGrowth with dir 0, which writes its origin
      // back as well as its size - so a base captured for a one-way direction is missing the one
      // attribute the restore then needs, and the layer walks half a grant further from the
      // design on every pass. svgLayoutRest may only ever put the artwork back exactly as drawn.
      if (f.mode === 'grow') f.base = svgGrowBase(rule, f.el, 0);
      out.push(f);
    }
  }
  return out;
}

/** Which bound lines live inside the growing element: the ones ANCHORED inside it, on its own
 *  rows. They are what drives the growth - the copy the element has to hold.
 *
 *  ANCHORED, not "starting inside it" (owner walk, 2026-09-03). A line's left edge is only
 *  fixed while the line is anchored to it. His question is centred in its plate, so a long
 *  value grows the block both ways, its left edge leaves the plate, and the line dropped out of
 *  its own panel's list at exactly the value that needed the panel's room - so the wrap rung
 *  lost its height and the answer depended on which value had been typed before. "Sometimes it
 *  gets smaller; sometimes it works and goes to the next line" was that, and nothing else. */
function svgLinesInside(el) {
  var box = el.getBoundingClientRect();
  var nodes = svgFitNodes();
  var out = [];
  for (var i = 0; i < nodes.length; i++) {
    var r = nodes[i].getBoundingClientRect();
    var sameRows = r.top < box.bottom && r.bottom > box.top;
    var x = svgAnchorX(nodes[i], r);
    // The tolerance is on BOTH edges. It used to be on the left alone, which was invisible while
    // the x being tested was a line's left edge - that can never sit on the panel's right edge -
    // and became a hole the moment it became the line's ANCHOR: an end-anchored line is anchored
    // exactly at its plate's right edge, so a rounding tick dropped it out of its own panel's
    // list and the panel then never grew for the copy it holds.
    if (sameRows && x >= box.left - 1 && x < box.right + 1) out.push(nodes[i]);
  }
  return out;
}

function growSvgLayout() {
  svgLayoutRest();
  // WHO TRAVELS, AND WHICH LINES ARE INSIDE - read for EVERY rule while the artwork is still at
  // rest, before any of them has moved. A panel that both widens and wraps carries TWO rows on
  // one element, and a follower whose transform were captured after the first row had already
  // translated it would record that translation as its resting pose - so the artwork would never
  // come back to the design, which is the one thing this may not do.
  for (var i = 0; i < NOACG_LAYOUT.rules.length; i++) svgRestOneRule(NOACG_LAYOUT.rules[i], i);
  // THE HEIGHT ON OFFER IS READ AT REST, BEFORE ANY RULE HAS GROWN - which is what its own
  // doctrine says it is (svgOfferHeights: "measured on the artwork at rest"). Read after the
  // sideways rules had run, a panel carrying BOTH rows offered a ceiling measured against
  // itself already widened, so the wrap rung's room moved with the value that was in the node.
  // Small on a straight panel and not on a tilted one, and either way it is the one thing this
  // module may not do.
  svgOfferHeights();
  for (var r = 0; r < NOACG_LAYOUT.rules.length; r++) growOneRule(NOACG_LAYOUT.rules[r], r);
}

/** One rule's resting reading: the layers that travel with its edge, and the bound lines inside
 *  it. Split out of growOneRule so it can run for every rule BEFORE any of them grows. */
function svgRestOneRule(rule, index) {
  var panel = svgLayoutEl(rule.el);
  var rest = svgGrowRest[index];
  if (!panel || !rest) return;
  var art0 = document.querySelector('.${PREFIX}-art');
  var box = panel.getBoundingClientRect();
  // WHICH WAY, decided once on the artwork AT REST and remembered. Read again after a pass had
  // already moved the panel, the answer could flip mid-fit and the layout would never come back
  // to the design.
  rest.dir = art0 ? svgGrowDir(rule, panel, art0.getBoundingClientRect()) : 1;
  rest.base = svgGrowBase(rule, panel, rest.dir);
  if (rest.dir === 0) {
    // BOTH EDGES MOVE, so both sides have followers, and each one travels with the edge it sits
    // past. A DECLARED list is still the author's answer and is read once - each entry takes
    // the side of the panel it was drawn on.
    rest.followers = svgSidedFollowers(rule, panel, box);
  } else {
    var edge = rule.axis === 'y'
      ? (rest.dir < 0 ? box.top : box.bottom)
      : (rest.dir < 0 ? box.left : box.right);
    rest.followers = svgFollowersOf(rule, panel, edge, rest.dir);
  }
  // FURNITURE THAT SPANS THE PANEL STRETCHES, declared list or not - the same rule the end caps
  // below have, for the same reason. A rail drawn down the plate's own two edges is the panel's
  // furniture, not a layer an author decides about: a plate that grew and left a strip its rail
  // does not cover is simply wrong, whichever way the reader answered a different question.
  // This used to run only while the rule carried NO declared list, so touching any follower row -
  // dropping a strap, adding a layer - silently stopped the shipped lower third's amber rail
  // growing with its plate. A DECLARED entry still wins: svgCollectSpanners skips an element the
  // set already lists, so a layer the author named travels the way they said.
  if (art0) svgCollectSpanners(art0, rule, panel, box, rest.dir, rest.followers);
  // END CAPS RIDE THE MOVING EDGE, always - declared list or not. A cap is the panel's own
  // furniture (svgIsEndCap: a narrow shape hugging the far edge), so it is not a follower an
  // author decides about: a grown panel with its end-cap left behind mid-artwork is simply
  // wrong, and the room measurement already promises the cap stays on the edge the text is
  // kept off of.
  if (art0) {
    var axis = rule.axis === 'y' ? 'y' : 'x';
    var caps = art0.querySelectorAll('rect, path, polygon, ellipse, circle, image');
    for (var c = 0; c < caps.length; c++) {
      var el = caps[c];
      if (el === panel || el.contains(panel) || panel.contains(el)) continue;
      var r = el.getBoundingClientRect();
      if (!(r.width > 0) || !(r.height > 0)) continue;
      if (r.width * r.height >= box.width * box.height) continue;
      // BOTH EDGES MOVE on a panel widening from its middle, so the furniture closing EITHER end
      // is its own - asked one side at a time, because svgIsEndCap answers about one edge and a
      // rule with no direction would otherwise only ever collect the right-hand cap and leave
      // the left one standing mid-artwork.
      var capSide = 0;
      if (rest.dir !== 0) capSide = svgIsEndCap(el, r, box, axis, rest.dir) ? rest.dir : 0;
      else if (svgIsEndCap(el, r, box, axis, 1)) capSide = 1;
      else if (svgIsEndCap(el, r, box, axis, -1)) capSide = -1;
      if (!capSide) continue;
      var listed = false;
      for (var j = 0; j < rest.followers.length; j++) if (rest.followers[j].el === el) listed = true;
      if (!listed) {
        rest.followers.push({ el: el, base: el.getAttribute('transform'), mode: 'move', side: capSide });
      }
    }
  }
  // The bound lines inside, TOP FIRST - the order the stack is walked in when a wrapped block
  // has to be kept against the edge the panel is anchored to (growSvgHeights).
  rest.texts = svgLinesInside(panel).sort(function (a, b) {
    return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
  });
  rest.textBase = [];
  for (var t = 0; t < rest.texts.length; t++) {
    rest.textBase.push({ el: rest.texts[t], base: rest.texts[t].getAttribute('transform') });
  }
}

function growOneRule(rule, index) {
  var panel = svgLayoutEl(rule.el);
  if (!panel) return;
  var art = document.querySelector('.${PREFIX}-art');
  if (!art) return;
  var rest = svgGrowRest[index];
  if (!rest) return;
  var svgPanelTexts = rest.texts;
  // A DOWNWARD rule grows AFTER the fit, from the height the settled block actually needed
  // (growSvgHeights). All this pass owes it is who travels and which lines are inside.
  if (rule.axis === 'y') return;

  // THE DEFICIT: how far past the ROOM THE PANEL ALREADY OFFERS the widest line now runs, in
  // screen px. Measured against the room and not against the drawn text, or a banner would
  // start growing at the 403rd pixel of a name drawn 402px wide inside 1040px of panel - which
  // is the growth being spent before any of the design's own space is.
  var need = 0;
  for (var i = 0; i < svgPanelTexts.length; i++) {
    var el = svgPanelTexts[i];
    if (svgFitWidths[el.id] == null) measureSvgBudgets();
    if (svgFitRoom[el.id] == null) measureSvgRoom();
    // A LINE WITH NO ROOM RECORDED IS ONE NOBODY COULD MEASURE - it is inside a state that has
    // not fired, or in a document that is not on screen (svgFitLaidOut). It asks the panel for
    // nothing: whatever it needs cannot be known yet, and it will be measured, and the panel
    // grown, on the pass that can see it.
    if (svgFitRoom[el.id] == null) continue;
    // A PENNED line is bounded by whatever is drawn beside it, not by the panel, so widening
    // the panel gives it nothing and it may not ask for any. Its own room already stops it
    // short of its neighbour; the fit answers the rest.
    if (svgFitRoom[el.id].penned) continue;
    // EVERY TRACE OF THE LAST PASS COMES OFF FIRST, or the measurement compounds - the same rule
    // measureSvgBudgets keeps. A line left squeezed from a floored value answers
    // getComputedTextLength with the TEXTLENGTH it was given, so a short value arriving after a
    // long one measured as long as the long one and the panel never came back to the design.
    el.style.fontSize = '';                     // at the drawn size - the panel gives the room
    svgUnsqueeze(el);
    // …and as ONE line: a block still painted as wrapped tspans from a previous pass measures
    // its widest line, which understates what the panel actually has to hold. The fit below
    // repaints it either way.
    var whole = svgFitValue(el);
    if (el.textContent !== whole) el.textContent = whole;
    var over = (svgTextWidth(el) - svgFitRoom[el.id].width) * svgUserScale(el);
    if (over > need) need = over;
  }
  if (!(need > 0)) return;

  // THE CAP: GROWTH IS SYMMETRICAL, and nothing may outgrow the screen (owner, 2026-08-26).
  // The margin the designer left on the side the panel is ANCHORED to is mirrored onto the side
  // it grows towards - a banner drawn 150px in from the left stops 150px short of the right - so
  // the graphic keeps the composition it was drawn with instead of running out to a flat 4%.
  // The table's own safe margin is the floor for a panel drawn hard against its edge. An inset is
  // never negative, so this can never permit growth past the frame; anything the cap withholds
  // is what fitSvgText() answers by shrinking.
  var frame = art.getBoundingClientRect();
  var grant = Math.min(need, svgGrowRoom(rule, panel, frame, rest.dir, rest));
  if (!(grant > 0)) return;

  svgApplyGrowth(rule, panel, rest, grant);
  for (var k = 0; k < svgPanelTexts.length; k++) {
    // Same two skips as the measuring loop above, for the same reasons: a line nobody could
    // measure is not given a share of the grant, and a penned one never asked for any.
    if (svgFitRoom[svgPanelTexts[k].id] == null) continue;
    if (svgFitRoom[svgPanelTexts[k].id].penned) continue;
    var scale = svgUserScale(svgPanelTexts[k]);
    svgFitExtra[svgPanelTexts[k].id] = grant / scale;
    // AND HOW FAR THIS LINE'S OWN ANCHOR TRAVELLED, which is not the same distance for every
    // line in the panel. A panel that grew ONE way moved its centre by half the grant and its
    // growing edge by all of it; one that grew from its middle moved its centre not at all and
    // each edge by half. So a line anchored to the box's MIDDLE follows the centre and a line
    // anchored to its right edge follows that edge - and asked as one number, an end-anchored
    // line was handed the whole grant of budget and half a grant of movement, which walks the
    // text past the margin its room was measured to keep.
    // One expression for all nine cases, because there is one law: the box's MIDDLE travels by
    // half the grant in the direction of growth, its RIGHT EDGE is always half a grant further
    // right than the middle, and its LEFT EDGE half a grant further left. So a middle-anchored
    // line follows the first term and an edge-anchored one adds its edge's - including for a
    // panel growing from its middle, where the centre stays put and each edge moves half. A
    // start line only has an anchor to shift when the author sent it to the box's left inside
    // edge (svgAlignOf); the derived road leaves its x to the file.
    var anchored = (svgFitAlign[svgPanelTexts[k].id] || {}).h;
    svgFitShift[svgPanelTexts[k].id] =
      ((rest.dir * grant) / 2 + (anchored === 'end' ? grant / 2 : anchored === 'start' ? -grant / 2 : 0)) / scale;
  }
}

/** Grow one element by \`grant\` screen px along its axis, and take its followers with it.
 *  The base is the CURRENT attribute, not the resting one: every pass rests the whole layout
 *  first, so at apply time "current" is the design plus whatever an EARLIER rule of this same
 *  pass already granted - which is exactly what lets the wider-then-wrap combination name one
 *  PATH with two rows. Both of a path's rows rewrite the same \`d\`, so applying from rest
 *  would let the second row erase the first row's growth (a rect never had the problem - its
 *  two rows touch width and height). */
/** CAN THIS LAYER ACTUALLY BE MADE BIGGER?
 *
 *  Growing writes one attribute - a rect's width or height, a panel path's own points. A GROUP
 *  or a TEXT layer carries neither, so the write lands on an attribute those elements have no
 *  meaning for and the layer sits exactly where it was drawn. That is not a theoretical case: a
 *  text layer is added as a follower automatically, its dropdown offers "Grows by the same
 *  amount" like every other row, and choosing it silently turned the following OFF. The owner
 *  met it on his quiz board - "the text gets misaligned... the text didn't follow the box"
 *  (2026-09-05).
 *
 *  So a layer that cannot grow TRAVELS instead, which is the nearest honest thing and what the
 *  row did before the mode was changed. The wizard has stopped offering the option on rows where
 *  it cannot work; this is what protects the templates that were saved while it did. */
function svgCanGrow(rule, el) {
  var tag = (el.tagName || '').toLowerCase();
  if (tag === 'path') return el.getAttribute('d') != null;
  if (tag === 'polygon') return el.getAttribute('points') != null;
  return el.getAttribute(svgGrowAxis(rule, el).attr) != null;
}

function svgApplyGrowth(rule, el, rest, grant) {
  var dir = rest.dir == null ? 1 : rest.dir;
  svgGrowElBy(rule, el, svgGrowBase(rule, el, dir), dir, grant / svgUserScale(el));
  for (var j = 0; j < rest.followers.length; j++) {
    var f = rest.followers[j];
    // A panel widening from its MIDDLE spends half the grant on each side, so a layer past one
    // edge travels by half, on its own side. A layer that STRETCHES with the panel takes the
    // whole grant either way - it is the same shape change the panel made.
    if (f.mode === 'grow' && svgCanGrow(rule, f.el)) {
      // A background band behind a growing block, or a rail drawn down its edge, STRETCHES by
      // the same amount instead of sliding out from under it - the WHOLE grant, because that is
      // the shape change the panel itself just made, middle-growing or not.
      svgGrowElBy(rule, f.el, svgGrowBase(rule, f.el, dir), dir, grant / svgUserScale(f.el));
    } else {
      // A panel widening from its MIDDLE spends half the grant on each side, so a layer drawn
      // past one edge travels by half, on ITS OWN side - never on the rule's, which is zero
      // here and would leave every follower standing where the panel used to end.
      var side = dir === 0 ? f.side || 1 : dir;
      var step = (dir === 0 ? grant / 2 : grant) / svgUserScale(f.el);
      svgTravel(f.el, rule.axis === 'y' ? 'y' : 'x', side * step, f.base);
    }
  }
}

/** Move one layer along an axis by its transform ATTRIBUTE, keeping whatever transform the
 *  designer wrote on it. The one limit worth knowing is the same one a follower has: a CSS
 *  transform beats an attribute, so a layer the timeline animates in its own right stays where
 *  its animation puts it. */
function svgTravel(el, axis, step, base) {
  var move = axis === 'y' ? '0,' + step.toFixed(2) : step.toFixed(2) + ',0';
  el.setAttribute('transform', 'translate(' + move + ')' + (base ? ' ' + base : ''));
}

// ── GROWING DOWNWARDS ─────────────────────────────────────────────────────────
// Wrap and grow are circular: how many lines a value takes depends on the type size, how much
// height is available depends on the growth, and the growth depends on the line count. Iterating
// that would settle differently in the editor, in an exported package and under SPX, which is
// the one thing this may not do.
//
// So it is not iterated. The ceiling a block may fill is the MOST the rule could ever give,
// measured on the artwork at rest (svgOfferHeights, before the fit); the fit wraps and shrinks
// inside that fixed ceiling exactly as it always did; and then the panel is grown by what the
// SETTLED block actually needed. One measure, one fit, one apply - the same answer every time,
// in any order, and running it twice changes nothing because every pass starts from rest.
function svgOfferHeights() {
  svgFitExtraH = {};
  var art = document.querySelector('.${PREFIX}-art');
  if (!art) return;
  var frame = art.getBoundingClientRect();
  for (var r = 0; r < NOACG_LAYOUT.rules.length; r++) {
    var rule = NOACG_LAYOUT.rules[r];
    if (rule.axis !== 'y') continue;
    var el = svgLayoutEl(rule.el);
    var rest = svgGrowRest[r];
    if (!el || !rest) continue;
    var most = svgGrowRoom(rule, el, frame, rest.dir, rest);
    var texts = rest.texts.length ? rest.texts : svgLinesInside(el);
    // THE PANEL'S GROWTH IS ONE POT, AND THE BLOCKS INSIDE IT SHARE. Offered whole to each of
    // them, two wrapping blocks in one panel can between them wrap into twice the height the
    // panel will ever have - and the apply can then only pay each of them half of what it
    // spent, which is the second line of a name printing over the role under it. The pot is
    // split evenly because nothing at this point knows who will need it: the offer is read
    // BEFORE the fit, deliberately (one measure, one fit, one apply), so a share by need would
    // be a measurement of an answer that does not exist yet. One block in a panel - every board
    // and every lower third in the corpus - is the whole pot, exactly as before.
    //
    // A PLACED line is not a sharer and is offered nothing: its room is a slot with no height
    // (measureSvgRoom), it is one line filled and then shrunk, and it can neither claim the
    // growth (svgBlockExtras) nor wrap into it.
    var sharers = 0;
    for (var i = 0; i < texts.length; i++) if (!svgFitPlaced(texts[i])) sharers++;
    var each = sharers > 0 ? most / sharers : 0;
    for (var j = 0; j < texts.length; j++) {
      svgFitExtraH[texts[j].id] = svgFitPlaced(texts[j]) ? 0 : each / svgUserScale(texts[j]);
    }
  }
}

/** HOW MUCH EXTRA HEIGHT EACH LINE OF A PANEL TOOK, top line first, in screen px: how much
 *  TALLER the settled block is than the room the design gave it. Measured in the artwork's own
 *  units through getBBox, which ignores transforms - so an entrance in flight cannot change it.
 *
 *  IT IS A HEIGHT, NOT A FLOOR CROSSING, and that distinction is the whole of the defect this
 *  replaced (docs/backlog, 2026-09-05: "the panel gets taller" never grew the panel). The old
 *  reading asked how far the block ran past its room's top plus its room's height, which is
 *  where the room ends only for a block composed against the TOP of its box. A block the designer CENTRED grows
 *  both ways from its middle (svgRecentre), so on the owner's quiz board a question wrapped to
 *  342 units inside 216 units of room stood 63 units above the plate and 13 units short of that
 *  floor - and reported that it needed nothing. Measured as a height the same block asks for the
 *  126 units it is actually over by, whichever edge it is composed against.
 *
 *  A PLACED line asks for nothing: its room is a slot with no height at all (measureSvgRoom), it
 *  never wraps, and the ladder answers it by shrinking. */
function svgBlockExtras(rest) {
  var out = [];
  for (var i = 0; i < rest.texts.length; i++) {
    var t = rest.texts[i];
    var room = svgFitRoom[t.id];
    if (!room || !t.getBBox || svgFitPlaced(t)) { out.push(0); continue; }
    out.push(Math.max(0, (t.getBBox().height - room.height) * svgUserScale(t)));
  }
  return out;
}

/** HOW MUCH OF ITS OWN EXTRA HEIGHT A BLOCK TRAVELS BY, as a fraction, when the panel grows.
 *
 *  One law, read off where the block is composed in its box. The panel grows on one edge, so the
 *  room's TOP edge, its MIDDLE and its BOTTOM edge each move by a different share of what was
 *  granted: growing downwards the top edge does not move, the middle moves half and the bottom
 *  moves all of it. A block stays where it was composed by travelling with the edge it is
 *  composed against - so a top line stays put, a centred one takes half, a bottom one takes all.
 *  Growing upwards is the same sentence upside down.
 *
 *  Before this the answer was the TOP one on both directions, which is right for every stacked
 *  block the runtime had ever actually grown and wrong for a centred one: it would have left the
 *  owner's question standing where it was while the plate grew away underneath it. */
function svgGrowShare(room, dir) {
  var v = room && room.align ? room.align.v : 'top';
  if (v === 'middle') return 0.5;
  if (dir < 0) return v === 'top' ? 1 : 0;
  return v === 'top' ? 0 : 1;
}

function growSvgHeights() {
  var art = document.querySelector('.${PREFIX}-art');
  if (!art) return;
  var frame = art.getBoundingClientRect();
  for (var r = 0; r < NOACG_LAYOUT.rules.length; r++) {
    var rule = NOACG_LAYOUT.rules[r];
    if (rule.axis !== 'y') continue;
    var el = svgLayoutEl(rule.el);
    var rest = svgGrowRest[r];
    if (!el || !rest) continue;
    var extras = svgBlockExtras(rest);
    var total = 0;
    for (var e = 0; e < extras.length; e++) total += extras[e];
    var most = svgGrowRoom(rule, el, frame, rest.dir, rest);
    var grant = Math.min(total, most);
    if (!(grant > 0)) continue;

    // THE STACK STAYS AGAINST THE EDGE THE PANEL IS ANCHORED TO. A wrapped block grows
    // DOWNWARDS from its own first baseline - that is how SVG text is drawn - so every line
    // has to travel by exactly the extra height taken on the side the panel is NOT growing
    // towards, or the second line of a name would print through the role under it.
    //
    // Growing UP (the lower third: bottom edge composed against the frame): a line rises by the
    // extra its own block took plus everything BELOW it, so the lowest line never moves and the
    // panel's drawn bottom padding survives untouched.
    // Growing DOWN (a board hung from the top): a line descends by the extra taken ABOVE it, so
    // the top line never moves. Either way the drawn gaps between the lines are exactly kept.
    // Both sentences are the TOP-composed case of one law (svgGrowShare): a block travels with
    // the edge of its own box it is composed against, and a CENTRED block therefore takes half.
    //
    // AND EVERY BLOCK TRAVELS BY A SHARE OF WHAT WAS ACTUALLY GRANTED, never by what it asked
    // for. Where the cap could only pay part of the bill each block gets the same fraction of
    // its own extra, so the stack keeps its shape inside a panel that grew less than it needed
    // and the ladder's shrink answers the rest - the alternative moved the first block by the
    // whole grant and stood the ones under it on top of each other.
    var share = total > 0 ? grant / total : 0;
    var running = 0;
    for (var k = 0; k < rest.texts.length; k++) {
      var idx = rest.dir < 0 ? rest.texts.length - 1 - k : k;
      var line = rest.texts[idx];
      var got = extras[idx] * share;
      var travel = running + svgGrowShare(svgFitRoom[line.id], rest.dir) * got;
      if (!svgFitPlaced(line) && travel > 0) {
        svgTravel(line, 'y', (rest.dir * travel) / svgUserScale(line), rest.textBase[idx].base);
      }
      running += got;
    }
    svgApplyGrowth(rule, el, rest, grant);
  }
}`;
}

/** The shared update()'s optional placed-text hook line (templates/shared/base.ts runtimeJs).
 *  An imported SVG REPLACES it with its own: its ladder (runtime/svgFit.js) fits the placed
 *  lines too, so this design calls one fit rather than two (plan §6b). Matched by shape, like
 *  blocks/designLayout does. */
const PLACED_TEXT_HOOK = `  // Designs that fit text to a fixed slot re-measure here (no-op otherwise).
  if (typeof fitPlacedText === 'function') fitPlacedText();`;
const SVG_FIT_HOOK = `  // The fit ladder re-measures here - every text layer, the ones the SVG drew and the ones
  // placed on it alike (no-op otherwise).
  if (typeof fitSvgText === 'function') fitSvgText();`;

/** The preset to build with - always one of this category's, whatever a carried-over draft says. */
function designPreset(id: string): AnimPreset {
  return DESIGN_PRESETS.find((p) => p.id === id) ?? DESIGN_PRESETS[0];
}

/** Build the complete SpxTemplate for an imported SVG design. */
export function assembleImportedSvg(o: ResolvedOptions): SpxTemplate {
  const svg = o.designSvg ?? NO_SVG;
  const name = 'Imported SVG design';
  const artworkFields = svgFields(svg);
  // The behaviour's own fields sit AFTER the artwork's, and that order is load-bearing: the
  // behaviour's type shim mirrors it so a control's payload resolves to the right `fN`.
  const behaviour = boundBehaviour(svg, artworkFields);
  const fields = behaviour
    ? [...artworkFields, ...behaviour.fields(artworkFields.length)]
    : artworkFields;
  // Steps are off: the whole design is one unit - a layer can still be given its own press
  // later, from the timeline.
  const settings = baseSettings({ name, uicolor: '7' }, o, { steps: '1' });
  const scale = computeScale(o);

  // Same anchoring rule as the raster import: frame-sized artwork covers the canvas as
  // drawn; anything smaller is a free-floating object and gets a zone.
  const fullFrame = svg.width === o.resolution.width && svg.height === o.resolution.height;
  const rootPosition = fullFrame
    ? `  left: 0;                         /* the artwork is frame-sized - it covers the canvas as drawn */
  top: 0;`
    : zoneCssText(o.zone, o.nudge, o.resolution);

  // The SVG rides inline, indented to sit inside the box - no asset path, no fetch, so every
  // single-file export target stays single-file.
  const inlineSvg = bindSvgMarkup(svg, o.previewMarkers)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');

  // The countdown (plan P2 "clock ftype"): the chosen layer is the clock DISPLAY
  // (`.{prefix}-clock`, painted by the shared runtime), and the operator's minutes live in a
  // hidden data source the runtime reads - the exact contract every catalog countdown uses.
  const clock = countdownIndex(svg);
  const clockField = clock === -1 ? null : artworkFields[clock];
  const clockHolder = clockField
    ? `
    <!-- ${clockField.title} (${clockField.field}) - the countdown's length in minutes, written by SPX
         and read by the clock runtime in template.js; the drawn clock layer shows the count. -->
    <div id="${clockField.field}" class="${DATA_SOURCE_CLASS}">${clockField.value}</div>`
    : '';
  // The credits list (docs/END_CREDITS.md): the same contract as the clock - the drawn Credits
  // text is the SAMPLE the roll copies its looks from, and the operator's whole list lands in
  // this holder for the roll engine to render (creditsRoll.ts). Escaped, because a sample may
  // carry an ampersand and the holder is markup.
  const credits = creditsIndex(svg);
  const creditsField = credits === -1 ? null : artworkFields[credits];
  const creditsHolder = creditsField
    ? `
    <!-- ${creditsField.title} (${creditsField.field}) - the whole credit list, one line per name, written
         by SPX and rolled by the credits engine in template.js; the drawn Credits text is its sample. -->
    <div id="${creditsField.field}" class="${DATA_SOURCE_CLASS}">${creditsField.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
    : '';

  const html = documentHtml({
    title: name,
    definitionBlock: definitionScriptBlock(settings, fields),
    body: `  <!-- Imported SVG design - your artwork, exactly as exported. The text layers chosen at
       import carry id="f0", "f1", … and update() writes the operator's values straight into
       them; everything else is untouched. -->
  <div class="${PREFIX}">
    <div class="${PREFIX}-box">
${inlineSvg}${clockHolder}${creditsHolder}${behaviour ? behaviour.html(artworkFields.length) : ''}
    </div>
  </div>`,
  });

  const fontCss = svgFontCss(svg);
  const css = `/* ${name} - generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, resolveHeadingFont(o).stack, scale, { typeScale: false })}

${fontCss ? `${fontCss}\n\n` : ''}${resetCanvasCss(o.resolution)}

/* ── Root position ── */
.${PREFIX} {
  position: absolute;
${rootPosition}
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── The design unit: the SVG and its bound text animate together as one box. ── */
.${PREFIX}-box {
  position: relative;              /* a placed HTML field (over outlined text) positions against it */
  width: calc(${svg.width}px * var(--scale));  /* the artwork's own width drives the size */
  will-change: transform, opacity; /* hint the browser: this element animates */
}
.${PREFIX}-art {
  display: block;
  width: 100%;                     /* fills the box - so --scale resizes art and text together */
  height: auto;                    /* the viewBox keeps the aspect */
}
${svg.outlines.length > 0 ? `
/* Outlined text replaced by a live field: the original shapes stay in the file, hidden.
   Delete this rule to see them again beside the text that stands in for them. */
.${PREFIX}-outlined {
  display: none;
}
` : ''}${(svg.hidden?.length ?? 0) > 0 ? `
/* Text the author took off the artwork: the layer stays in the file, hidden.
   Delete this rule to put the designer's own words back. */
.${PREFIX}-removed {
  display: none;
}
` : ''}${clockField || behaviour ? `
${dataSourceCss}
` : ''}${behaviour?.css ? `
${behaviour.css}
` : ''}${creditsField ? `
${creditsRollCss(PREFIX)}
` : ''}`;

  const preset = designPreset(o.animation.presetId);
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  // What the design says about its layout: a growth rule, a line the author aligned.
  const grows = layoutRules(svg).length > 0;
  const aligned = saidLines(svg).length > 0;
  const cfg: PresetConfig = {
    prefix: PREFIX,
    lineCount: 0, // the design presets animate the whole box; the SVG's text is inside it
    hasAccent: false,
    // The artwork's own top-level layers - what the per-layer stagger walks. Read off the
    // emitted HTML by the same function emitPresetRegion uses, so create and re-apply agree.
    layers: svgLayerSelectors(html),
    fields: svgFieldSelectors(html),
    steps: false,
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  // The clock runtime is design-owned JS outside the marked region, like the SVG fit: the
  // data conversion and every preset swap leave it alone, and the presets only CALL it.
  // A bound behaviour repaints on every update() for the reason quiz/shared.ts gives: a data
  // write must never erase a state the machine still holds, and a snap recovery replays states
  // with callbacks suppressed, so the trailing update() is what puts the drawn states back. It
  // is also where a LIVE VOTE's bars move: data never causes a transition, so the tally animates
  // inside whatever state the board is in (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12).
  // A bound countdown re-derives its length from the value just written - the same hook the
  // catalog's own countdowns call, so an imported clock answers Update identically (the
  // reasoning is in shared/clock.ts). Emitted only for a design that actually bound one.
  const clockHook = `  if (typeof clockDataUpdated === 'function') clockDataUpdated();  // the countdown's length (below)`;
  // A bound credits list rebuilds its rows from the value just written, in the sample's looks.
  const creditsHook = `  if (typeof creditsDataUpdated === 'function') creditsDataUpdated();  // the credit roll's rows (below)`;
  const js =
    runtimeJs(name, preset.emit(cfg)).replace(
      PLACED_TEXT_HOOK,
      `${SVG_FIT_HOOK}${behaviour ? `\n${behaviour.updateHook}` : ''}${clockField ? `\n${clockHook}` : ''}${creditsField ? `\n${creditsHook}` : ''}`,
    ) +
    SVG_FIT_JS +
    // The relationship TABLE rides only for a design that declares something in it - a growth
    // rule, or a line's alignment - and the growth runtime that loops the rules only with a rule
    // to loop: a board emits neither and cannot move (plan §6c). A board whose author aligned one
    // line gets the table and no growth runtime, and still cannot move.
    (grows || aligned
      ? `\n${layoutDataJs(
          svg,
          // The comment above each rule names the element the way the reader knows it: a bound
          // field by its operator title, anything else (the usual case - a panel rect) by the
          // layer name the designer gave it in their own file.
          (id) =>
            svg.fields.find((f) => f.candidateId === id)?.title ?? candidateLabel(svg, id) ?? 'Layer',
        )}${grows ? growthRuntimeJs() : ''}`
      : '') +
    '\n' +
    (clockField ? `\n${clockRuntimeJs(PREFIX, clockField.field)}\n` : '') +
    // The point shifters a path panel grows by and a path gauge fills by.
    (grows || behaviour?.fillsGauge ? `\n${SHAPE_SHIFT_JS}` : '') +
    (behaviour ? `\n${behaviour.js(artworkFields.length)}` : '') +
    // AFTER the behaviour's table: the roll engine reads its field ids out of NOACG_BEHAVIOUR the
    // moment it first renders, and in a document whose markup is already parsed that is now.
    (creditsField ? `\n${creditsRollRuntimeJs(PREFIX)}` : '') +
    SVG_FIT_BOOT;

  // The design presets know nothing of clocks, so the lifecycle hooks are added to the DATA
  // (the step-calls model, docs/TIMELINE_V2_PLAN.md §3b): startClock as the entrance lands,
  // stopClock the moment the exit begins - exactly what the catalog's countdown presets emit.
  const withClockCalls = clockField
    ? (data: AnimData): AnimData => {
        const steps = data.steps.map((s) => ({ ...s }));
        const enter = steps[0];
        const out = steps[steps.length - 1];
        enter.calls = [...(enter.calls ?? []), { time: enter.duration, call: 'startClock' }];
        out.calls = [...(out.calls ?? []), { time: 0, call: 'stopClock' }];
        return { ...data, steps };
      }
    : undefined;

  const template: SpxTemplate = {
    name,
    type: 'imported-design',
    resolution: o.resolution,
    fps: o.fps,
    html,
    css,
    js,
    fields,
    settings,
    // The SVG is inline; only embedded font files ride as assets.
    assets: svg.fonts.filter((f) => f.customFont).map((f) => f.customFont!.asset),
    // The countdown's layer is the clock display and the credits layer is the roll's sample,
    // not text fields - both left out here.
    layers: svg.fields.flatMap((f, i) =>
      i === clock || i === credits
        ? []
        : [{ id: `f${i}`, type: 'text' as const, label: f.title, fieldId: `f${i}`, text: f.sample, styles: {} }],
    ),
  };

  // Compose the two data refinements: the clock's lifecycle calls, then the behaviour's own extra
  // step (the quiz's Reveal, the vote's Result). Order matters only in that the clock's
  // `stopClock` must stay on the LAST step, and the extra step is spliced in front of it - so
  // the behaviour's refinement runs second.
  const refine =
    withClockCalls || behaviour
      ? (data: AnimData): AnimData => {
          const withClock = withClockCalls ? withClockCalls(data) : data;
          return behaviour ? behaviour.steps(withClock) : withClock;
        }
      : undefined;
  const built = convertToDataRegion(template, refine);
  // The machine last, on the finished data: `attachMachine` derives the default path from the
  // steps, so the behaviour's own step has to already be there when the arc's path events
  // (`judge`, `result`) are compiled onto it.
  return behaviour ? attachMachine(behaviour.type(svg), built) : built;
}

export const IMPORTED_SVG: TemplateVariant = {
  id: 'svg01',
  category: 'imported-design',
  name: 'Imported SVG design',
  styleTag: 'minimal',
  description: 'Your own SVG artwork, its text layers bound as editable fields.',
  maxLines: 3,
  suggestedLines: [],
  // The fields are the SVG's own text layers, chosen at import - never an open line list.
  fieldPlan: { kind: 'fixed', reason: 'The fields are the SVG’s own text layers, chosen at import.' },
  // The artwork IS the design - a logo drawn into it needs no slot from us.
  logo: 'none',
  // The whole-unit presets plus the per-layer stagger - only an SVG has layers to stagger.
  animationPresets: ['design-fade', 'design-slide', 'design-pop', 'design-blur', 'design-stagger'],
  defaultPalette: paletteById('ivory'),
  defaultFontId: 'inter',
  defaultZone: 'bottom-left',
  create(options?: WizardOptions) {
    return assembleImportedSvg(resolveOptions(IMPORTED_SVG, options));
  },
};
