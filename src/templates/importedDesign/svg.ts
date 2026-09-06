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
import { customFontFaceCss, fontFaceCss, FONTS, type BundledFont } from '../../model/fonts';
import {
  paletteById,
  resolveOptions,
  type DesignSvg,
  type DesignSvgFollower,
  type DesignSvgGrowth,
  type ResolvedOptions,
  type TemplateVariant,
  type WizardOptions,
} from '../../model/wizard';
import { SVG_CANDIDATE_ATTR, svgPictureTarget } from '../../assets/svgImport';
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
import type { AnimPreset, PresetConfig } from '../lowerThirds/animPresets';
import { DESIGN_PRESETS } from './designPresets';
import { PREFIX } from './shared';

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
 * Bind the chosen candidates: each gets id="fN" (in field order), every remaining candidate
 * marker is stripped, and the root <svg> gains the artwork class so the part registry names
 * it. Any pre-existing id that collides with a bound one is prefixed out of the way - the
 * field ids are the one namespace the platform owns inside the file.
 *
 * `keepMarkers` is the ONE preview-only exception (`ResolvedOptions.previewMarkers`): the
 * mapping step's hover highlight needs a handle on the layer a checklist row means, and the
 * preview iframe is the only canvas that has the fit runtime. A ticked OUTLINE group still
 * loses its marker there - that group is hidden and its live stand-in wears the marker
 * instead (components/wizard/import/draft.ts `withSvgOutlineFields`), so one marker always points at
 * whatever actually airs.
 */
/** The attribute every element a layout rule names carries. One stamp kind for the feature. */
const LAYOUT_EL_ATTR = 'data-noacg-el';
/** The emitted relationship table's schema (docs/SVG_IMPORT_PLAN.md §6c). Additive optional
 *  fields never bump it; a breaking shape change bumps it and migrates on read in the SAME
 *  commit, the doctrine docs/STATE_MACHINE_SCHEMA.md §5 states and `blocks/animData.ts` keeps. */
const LAYOUT_VERSION = 1;
/** How close to the frame's edge a growing element may get, as a fraction of the frame. The
 *  hug's original constant: growing off the screen was never a fit (plan §3). */
const PANEL_SAFE = 0.04;

const growToken = (i: number) => `g${i}`;
const followToken = (i: number, j: number) => `g${i}f${j}`;

/**
 * THE LAYOUT RELATIONSHIPS OF A DESIGN, in one shape (plan §6c).
 *
 * A NORMALIZING read, the same idiom `parseAnimData` uses: the hug's original one-rectangle
 * `stretch` becomes one axis-'x' rule with derived followers - which is exactly what it always
 * meant - so a draft, a saved wizard option or a project from before this change still builds
 * the graphic it described, and nothing downstream ever sees two shapes.
 */
function layoutRules(svg: DesignSvg): DesignSvgGrowth[] {
  if (svg.growth?.length) return svg.growth;
  return svg.stretch ? [{ candidateId: svg.stretch.candidateId, axis: 'x' }] : [];
}

/**
 * The designer's own name for a marked element, off the markup - `data-name` carries the
 * original spelling where an exporter uniquified the id. Null when nothing named it, so the
 * caller can fall back honestly.
 *
 * IT LOOKS UP THE TREE, as the step's own naming does (`candidateName`, assets/svgImport.ts).
 * Illustrator writes the layer name on the GROUP and leaves the rect inside it anonymous, so a
 * plate the step calls "q bg" was read here as unnamed and every growth rule on it emitted the
 * comment `// "Layer" grows wider` - a comment about the generated code that named the wrong
 * thing, on the one file the owner walks.
 *
 * IT STOPS AT THE FIRST ANCESTOR THAT HOLDS SOMEBODY ELSE. A name only belongs to this layer
 * while the group wearing it wraps this layer alone; a group holding two marked layers is a
 * container, and its name would be handed to every plate inside it. Stopping at the ROOT is not
 * enough for that: Illustrator writes `id="Layer_1"` on the `<svg>`, but Figma and Inkscape wrap
 * the artwork in a NAMED group under the root, which would emit `// "Frame 1" grows wider` on
 * every row - the same wrong comment in a different exporter's spelling.
 */
function candidateLabel(svg: DesignSvg, candidateId: string): string | null {
  const doc = new DOMParser().parseFromString(svg.markup, 'image/svg+xml');
  const root = doc.documentElement;
  let el = doc.querySelector(`[${SVG_CANDIDATE_ATTR}="${candidateId}"]`);
  // The marked element itself is allowed a name whatever it contains - it IS the layer.
  const own = el?.getAttribute('data-name') ?? el?.getAttribute('id');
  if (own?.trim()) return own.trim();
  el = el?.parentElement ?? null;
  while (el && el !== root && el.querySelectorAll(`[${SVG_CANDIDATE_ATTR}]`).length <= 1) {
    const name = el.getAttribute('data-name') ?? el.getAttribute('id');
    if (name?.trim()) return name.trim();
    el = el.parentElement;
  }
  return null;
}

/**
 * THE SWAP AND THE RESTORE BOTH SPEAK `href`, so a bound picture keeps exactly one spelling.
 *
 * Illustrator and Figma both write the SVG 1.1 `xlink:href` on a placed picture, while
 * `setFieldValue` (templates/shared/base.ts) remembers and rewrites the SVG 2 `href`. Left as
 * exported that half-works in the worst way: an operator's swap paints (a browser prefers
 * `href`), and CLEARING the field restores an empty string over a picture the `xlink:href`
 * beside it can no longer bring back - the field's own promise, "empty keeps the picture you
 * drew", failing only on the second click. Moving the value rather than copying it also keeps
 * one base64 payload in the export instead of two.
 */
function normalizePictureHref(el: Element): void {
  const legacy = el.getAttribute('xlink:href');
  if (legacy === null) return;
  if (!el.getAttribute('href')) el.setAttribute('href', legacy);
  el.removeAttribute('xlink:href');
}

/**
 * Rename an element's id and move every in-document reference to it with the rename. An SVG
 * refers to its own nodes by `#id` all over - a `<use>` inside a `<pattern>`, a gradient, a clip
 * path - so an id changed on its own turns a painted shape into an empty one.
 *
 * References are COMPARED, never selected. The old id is the DESIGNER'S text - Figma names a
 * text layer after the words in it - and an id carrying a quote or a backslash makes
 * `[href="#…"]` an invalid selector, which throws out of here and out of Create project. This
 * used to run only for the handful of layer ids that collided with ours (`f0`, `q-sel-1`), all
 * of them safe tokens; it now runs for every bound field.
 *
 * A DUPLICATE id moves nothing. Figma writes a duplicated layer's name into `id` verbatim, so a
 * file really can carry the same id twice (corpus: `figma-duplicate-ids-scorebug`), and a
 * browser answers `#id` with the FIRST one. A later twin was therefore never what any reference
 * pointed at, and repointing them here would silently hand this node's picture to another shape.
 */
function setIdKeepingRefs(root: Element, el: Element, id: string): void {
  const was = el.getAttribute('id');
  el.setAttribute('id', id);
  if (!was || was === id) return;
  const all = Array.from(root.querySelectorAll('*'));
  const twin = all.findIndex((n) => n.getAttribute('id') === was);
  if (twin !== -1 && twin < all.indexOf(el)) return; // an earlier twin owns the references
  for (const ref of all) {
    if (ref.getAttribute('href') === `#${was}`) ref.setAttribute('href', `#${id}`);
    if (ref.getAttribute('xlink:href') === `#${was}`) ref.setAttribute('xlink:href', `#${id}`);
  }
}

function bindSvgMarkup(svg: DesignSvg, keepMarkers = false): string {
  const doc = new DOMParser().parseFromString(svg.markup, 'image/svg+xml');
  const root = doc.documentElement;

  // The artwork identity (model/structure.ts `.{prefix}-art`) - appended, never replacing
  // classes the designer put there.
  const classes = (root.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  if (!classes.includes(`${PREFIX}-art`)) classes.push(`${PREFIX}-art`);
  root.setAttribute('class', classes.join(' '));

  // Field ids are ours: a layer Illustrator happened to name "f0" would collide with the
  // binding, so any such id moves aside (references to it inside the file move with it). The
  // behaviour's own fields count here too - its holders carry `fN` ids like any other field,
  // and the stamped layer ids (`q-sel-1`, `p-bar-1`, …) are ours for the same reason.
  const behaviour = boundBehaviour(svg, svgFields(svg));
  const taken = new Set([
    ...[...svg.fields, ...svg.images, ...Array(behaviour?.fieldCount ?? 0)].map((_, i) => `f${i}`),
    ...(behaviour?.layerIds ?? []),
  ]);
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    const id = el.getAttribute('id')!;
    if (taken.has(id)) setIdKeepingRefs(root, el, `layer-${id}`);
  }

  const clock = countdownIndex(svg);
  [...svg.fields, ...svg.images].forEach((field, i) => {
    const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${field.candidateId}"]`);
    if (!el) return;
    if (i === clock) {
      // The countdown DISPLAY: the clock runtime paints into `.{prefix}-clock`, and the
      // operator's minutes land in the hidden #fN holder instead - so this node takes the
      // class and NOT the field id, or update() would write "10" over the ticking readout.
      const own = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
      if (!own.includes(`${PREFIX}-clock`)) own.push(`${PREFIX}-clock`);
      el.setAttribute('class', own.join(' '));
      return;
    }
    // A PICTURE field binds the node whose href paints the picture, which is not always the node
    // the mapping step offered: Figma's placed raster is a `<rect fill="url(#pattern0)">` painted
    // by an `<image>` parked in `<defs>`, and only that `<image>` responds to a swap
    // (assets/svgImport.ts `svgPictureTarget` states why the two are chosen separately). Taking
    // the id KEEPS the references: the pattern's `<use>` points at the picture by id, so an
    // unaccompanied `setAttribute('id', …)` would leave the shape painting nothing.
    if (i < svg.fields.length) {
      setIdKeepingRefs(root, el, `f${i}`);
      return;
    }
    const picture = svgPictureTarget(el, root);
    normalizePictureHref(picture);
    setIdKeepingRefs(root, picture, `f${i}`);
  });
  // An outlined-text group the user chose to replace (plan §1.A) is HIDDEN, not deleted:
  // the class below is what the `.{prefix}-outlined { display: none }` rule in template.css
  // matches, so a professional can compare the live text against the shapes by deleting
  // one line, and the file still carries everything the designer exported. The HTML field
  // that stands in for it is placed afterwards (components/wizard/import/draft.ts).
  for (const outline of svg.outlines) {
    const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${outline.candidateId}"]`);
    if (!el) continue;
    const own = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    if (!own.includes(`${PREFIX}-outlined`)) own.push(`${PREFIX}-outlined`);
    el.setAttribute('class', own.join(' '));
  }
  // A text layer the author said should come OFF the artwork, hidden the same way and for the
  // same reason: the designer's own shapes stay in the file, and one rule takes them off air.
  // Its own class rather than the outlined one, because the two are different statements - a
  // replaced outline has a live field standing where it was, and this has nothing.
  for (const gone of svg.hidden ?? []) {
    const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${gone.candidateId}"]`);
    if (!el) continue;
    const own = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    if (!own.includes(`${PREFIX}-removed`)) own.push(`${PREFIX}-removed`);
    el.setAttribute('class', own.join(' '));
  }
  // THE ELEMENTS A LAYOUT RELATIONSHIP NAMES (plan §6c): every participant - an element that
  // may GROW, and anything DECLARED to travel with it - is stamped with one token, and the
  // emitted NOACG_LAYOUT table says what each token does. One stamp kind for the whole
  // feature, so a rule can name several elements without minting a class per role.
  for (const [i, rule] of layoutRules(svg).entries()) {
    // A SPACE-SEPARATED list of tokens, not a single value: one element may be named by two
    // rules at once - the wider-then-wrap ladder is one panel growing on both axes - and a
    // plain `setAttribute` would let the second rule erase the first one's stamp.
    const stamp = (candidateId: string, token: string) => {
      const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${candidateId}"]`);
      if (!el) return;
      const own = (el.getAttribute(LAYOUT_EL_ATTR) ?? '').split(/\s+/).filter(Boolean);
      if (!own.includes(token)) own.push(token);
      el.setAttribute(LAYOUT_EL_ATTR, own.join(' '));
    };
    stamp(rule.candidateId, growToken(i));
    rule.followers?.forEach((f: DesignSvgFollower, j: number) => stamp(f.candidateId, followToken(i, j)));
  }
  // The layers a bound behaviour claims: our id, plus the state class on the ones that are drawn
  // MOMENTS. Before the markers are stripped - that is what they are for.
  behaviour?.markLayers(root);
  const replaced = new Set(svg.outlines.map((o) => o.candidateId));
  for (const el of Array.from(root.querySelectorAll(`[${SVG_CANDIDATE_ATTR}]`))) {
    if (keepMarkers && !replaced.has(el.getAttribute(SVG_CANDIDATE_ATTR) ?? '')) continue;
    el.removeAttribute(SVG_CANDIDATE_ATTR);
  }
  return new XMLSerializer().serializeToString(root);
}

/**
 * Every @font-face the template ships (plan §4): a bundled face whose family name matches
 * what the SVG references, or a fetched/uploaded face embedded as an asset. An UNRESOLVED
 * family is stated in a comment - never blocked, because the designer may know the playout
 * machine has the face installed; the wizard already warned out loud.
 */
/** A bundled face declared under the name the artwork asks for - same file, second name. The
 *  comment says which face it really is, so the emitted CSS is readable rather than mysterious. */
function aliasFontFaceCss(font: BundledFont, family: string): string {
  return `/* Bundled open-source font (the file ships with the export - no internet at playout).
   Declared as "${family}" because that is the name this artwork's own CSS asks for; the file is ${font.family}. */
@font-face {
  font-family: "${family}";
  src: url("fonts/${font.file}") format("woff2");
  font-weight: ${font.weights[0]} ${font.weights[1]};  /* variable font: covers this weight range */
  font-display: swap;          /* show fallback text until the font loads */
}`;
}

function svgFontCss(svg: DesignSvg): string {
  const blocks: string[] = [];
  const unresolved: string[] = [];
  for (const font of svg.fonts) {
    const bundled = font.fontId ? FONTS.find((f) => f.id === font.fontId) : undefined;
    if (bundled) {
      // A face is declared under the name the ARTWORK asks for. Illustrator writes PostScript
      // names ("Archivo-Bold"), which the import matches to the bundled family they plainly are
      // - but a `@font-face` declared as "Archivo" answers nothing in an SVG whose own CSS says
      // `font-family: Archivo-Bold`, so the alias is the whole point of the match.
      blocks.push(
        bundled.family === font.family ? fontFaceCss(bundled) : aliasFontFaceCss(bundled, font.family),
      );
    } else if (font.customFont) blocks.push(customFontFaceCss(font.customFont));
    else unresolved.push(font.family);
  }
  if (unresolved.length > 0) {
    blocks.push(
      `/* UNRESOLVED ${unresolved.length === 1 ? 'FONT' : 'FONTS'}: ${unresolved.join(', ')} - the SVG references ${unresolved.length === 1 ? 'this family' : 'these families'} but no file ships
   with the template, so playout falls back to whatever the machine has installed. If the
   playout machine has the ${unresolved.length === 1 ? 'font' : 'fonts'}, this is fine; otherwise import the file in the Style panel. */`,
    );
  }
  return blocks.join('\n\n');
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
const SVG_FIT_JS = `
// ── Text fit (SVG) ────────────────────────────────────────────────────────────
// SVG text neither wraps nor clips: a longer value would run past the artwork. So each bound
// layer has a BUDGET - the width of the text the DESIGNER drew - and a value wider than that
// is SHRUNK until it fits: a smaller line of the designer's own type, never a squeezed one.
// (Condensing to the drawn width, which is what this did before, distorts tracking and glyph
// shapes, so one extra letter visibly broke the typeface.) A value that fits is left exactly
// as drawn. Remove this block to let text run free instead.
//
// The budget is measured from the DRAWN text, never from whatever happens to be on screen.
// A playout renderer replays its control log the moment the page exists, so the first value
// measured there is usually the operator's: a graphic that took its budget from that never
// condensed at all, and the same file squished in the editor while running past the artwork
// on air. The drawn text is remembered before update() can be called, and the budget is
// re-measured once the real typeface has loaded (the first pass may have measured a
// fallback face). The shrink is set on the bound node; a run carrying its OWN font-size
// keeps it, which Illustrator only writes when a designer sized one word by hand.
var svgFitDrawn = {};                           // id -> the text the designer drew
var svgFitLines = {};                           // id -> the LINES they drew it on, for a block
var svgFitStep = {};                            // id -> the LEADING they drew those lines at, px
var svgFitWidths = {};                          // id -> that text's width, in the real face
var svgFitSizes = {};                           // id -> the font size it was drawn at, in px
var svgFitRoom = {};                            // id -> { width, lines } the design offers it
var svgFitAlign = {};                           // id -> { h, v } read off where the line was drawn
var svgFitExtra = {};                           // id -> WIDTH a growing panel gave this line
var svgFitShift = {};                           // id -> how far that panel's MIDDLE moved doing it
var svgFitExtraH = {};                          // id -> HEIGHT a growing panel may still give it
var svgFitOver = {};                            // id -> true when even the floor could not fit
var svgFitOwed = {};                            // id -> this line still needs measuring (below)
var SVG_FIT_FLOOR = 0.55;                       // REPORTED as too long below 55% of the drawn size
var SVG_FIT_HARD_FLOOR = 0.3;                   // …but it keeps shrinking to 30% rather than condensing
var SVG_SQUEEZE_FLOOR = 0.7;                    // never narrower than 70% of the glyphs' own width
var SVG_LINE_HEIGHT = 1.2;                      // a wrapped line's step, in ems

// EVERY line this design fits, of both kinds. The layers the DESIGNER drew are <text>/<tspan>
// inside the artwork; a PLACED line is an HTML span the design got afterwards - a stand-in for
// text that was exported as outlines, or a field added later - and it lives after </svg>, in
// the same box. One list, so one ladder walks them and one report names them.
function svgFitNodes() {
  var out = [];
  var drawn = document.querySelectorAll('.${PREFIX}-art text[id], .${PREFIX}-art tspan[id]');
  for (var i = 0; i < drawn.length; i++) {
    if (/^f\\d+$/.test(drawn[i].id) && typeof drawn[i].getComputedTextLength === 'function') out.push(drawn[i]);
  }
  // data-fit="shrink" is the mode a placed line is born in and the only one that ever had a
  // runtime: a line the author set to run free, or to reflow in CSS, is saying the cap does
  // not apply to it, so the ladder leaves it exactly as it was.
  var placed = document.querySelectorAll('.${PREFIX}-box [data-fit="shrink"]');
  for (var j = 0; j < placed.length; j++) {
    if (/^f\\d+$/.test(placed[j].id)) out.push(placed[j]);
  }
  return out;
}

// ── A MEASUREMENT NOBODY COULD TAKE IS NOT AN ANSWER ──────────────────────────
// Every number below is read off the LAID-OUT design, and the design is not always laid out
// when this file first runs. A playout renderer preloads its templates before anything is on
// air; a control page keeps its monitors in a display:none column while the operator is on
// another workspace; and a drawn state (drawnState.ts) is display:none from the first frame
// until the moment its state fires, so a bound layer inside one has no box at load BY DESIGN.
//
// A node in that condition measures 0 for everything. Recording that zero is what made the fit
// depend on WHEN it first ran rather than on the artwork and the value: the room was cached as
// nothing, the "have I measured this line?" test then read false forever, and the ladder skipped
// the line for the life of the graphic - it painted at the drawn size, on one line, across the
// artwork. Nothing could recover it, because every re-measure is a re-measure of a design that
// already has its answer.
//
// So an unmeasurable node records NOTHING and is marked OWED, and nothing fits a line it cannot
// measure. The debt is per LINE rather than per document, because the condition is: a quiz board
// always has a state that is off, so one flag for the whole graphic would be raised for the life
// of it and every update() would pay for a full re-measure that could never settle anything.
function svgFitLaidOut(el) {
  var box = el.getBoundingClientRect();
  if (box.width > 0 || box.height > 0) return true;
  // An EMPTY value has no box of its own and is perfectly measurable all the same, so the
  // parent answers for it: inside a display:none subtree nothing has a box at all. Without this
  // the two passes below would disagree about the same node - one skipping it and the other
  // measuring its room against a width that was never recorded.
  var parent = el.parentNode;
  var pbox = parent && parent.getBoundingClientRect ? parent.getBoundingClientRect() : null;
  return !!pbox && (pbox.width > 0 || pbox.height > 0);
}

/** Is any owed line NOW measurable? The one statement of it, read by the ladder, by the drawn
 *  states and by the load-time recovery, so the three cannot disagree about what is outstanding.
 *  A line that is owed and still hidden is not due: re-measuring would answer nothing and the
 *  next reveal asks again. */
function svgFitDue(within) {
  var nodes = svgFitNodes();
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    // Owed either because a pass could not measure it, or because no pass has reached it at
    // all - the second is what a fit running before the load-time measurement would meet.
    var owed = svgFitOwed[el.id] || svgFitRoom[el.id] == null || svgFitWidths[el.id] == null;
    if (!owed || !svgFitLaidOut(el)) continue;
    if (within && within !== el && !(within.contains && within.contains(el))) continue;
    return true;
  }
  return false;
}

/** A line PLACED on the artwork rather than drawn in it - an HTML span, which measures and
 *  paints through different calls than an SVG text node does. */
function svgFitPlaced(el) {
  return typeof el.getComputedTextLength !== 'function';
}

/** Painted px per LAYOUT px for a placed line - what an entrance that scales the whole design
 *  puts between the two. A drawn layer never needs this: getComputedTextLength answers in the
 *  SVG's own user units, which no transform above it can move. */
function svgPlacedScale(el) {
  var slot = el.parentNode;
  var layout = slot && slot.offsetWidth;
  return layout > 0 ? slot.getBoundingClientRect().width / layout : 1;
}

/** The width of whatever text the node holds right now, in the space its room is measured in:
 *  user units for a drawn layer, LAYOUT px for a placed one. Each is compared only against its
 *  own room, and both spaces stand still while an entrance is mid-flight - so a value the design
 *  cannot hold is caught during the animation exactly as it is at rest. */
function svgTextWidth(el) {
  return svgFitPlaced(el)
    ? el.getBoundingClientRect().width / svgPlacedScale(el)
    : el.getComputedTextLength();
}

// THE ROOM A PLACED LINE GETS IS ITS OWN SLOT - the max-width its wrapper declares. Nothing was
// drawn behind it (it sits on empty artwork, or over shapes this template hides), so there is no
// shape to take a margin from, and the slot is the only statement anybody made about how much
// room the line has: measured from the outlined group's own box at import, or dragged on the
// canvas. That is the same sentence as the drawn line's fallback - a layer with no shape behind
// it keeps the width it was DRAWN at - and it is a WIDTH, so a placed line never wraps: the room
// below it belongs to artwork drawn for something else.
function svgFitSlot(el) {
  var slot = el.parentNode;
  if (!slot || !slot.offsetWidth) return 0;
  var cap = parseFloat(getComputedStyle(slot).maxWidth);
  // No cap at all: the wrapper hugs its line, so its own box is the only room on offer.
  return cap > 0 ? cap : slot.offsetWidth;
}

// ── THE LAST RUNG: NOTHING PAINTS OUTSIDE ITS ROOM (owner ruling, 2026-08-26) ──
// The ladder used to stop at the readability floor and simply REPORT a value it could not fit,
// which left the floored line running straight across whatever the designer drew beside it. So a
// floored block is squeezed into its budget as well: the same glyphs, narrower. It is deliberately
// ugly, it is still reported as too long, and it comes off the moment a shorter value arrives.
//
// Never a default. Filling the room, growing the panel, wrapping and shrinking all happen first;
// this only ever runs on a value no size and no line count could hold.
//
// ── …BUT IT STOPS BEING TYPE FIRST (owner ruling, 2026-09-05) ──
// That rung had no bottom. SVG's textLength compresses to whatever number it is given, so a value
// eight times its room came out as an eight-times-condensed smear - the same glyphs in name only,
// a grey texture nobody can read. The owner met one on an imported quiz board:
//
//   "the text should always be readable, and if it becomes too small, then that's the user's own
//    fault, but the text should never grow on top of each other or get so dense that it's
//    impossible to read, like in this screenshot."
//
// So the squeeze now has a floor of its own: 70% of the glyphs' natural advance, the point past
// which condensed type stops reading as words. Below that the compression simply stops, the value
// stays legible, and the graphic accepts that it is wider than the shape it was drawn in.
//
// The two rulings only ever collide on a value no legible rendering could contain, and the newer
// one wins there BECAUSE the older one's promise cannot be kept honestly: type that has stopped
// being readable is not "inside the panel" in any sense an audience would recognise. Every value
// that could be squeezed legibly is squeezed exactly as before, and both are still reported
// through noacgTextOverflow(), which is what puts the warning in front of the operator.
function svgUnsqueeze(el) {
  if (svgFitPlaced(el)) {
    el.style.transform = '';
    el.style.transformOrigin = '';
    return;
  }
  var kids = el.children.length ? el.children : [el];
  for (var i = 0; i < kids.length; i++) {
    kids[i].removeAttribute('textLength');
    kids[i].removeAttribute('lengthAdjust');
  }
}

function svgSqueeze(el, budget) {
  svgUnsqueeze(el);
  if (!(budget > 0)) return;
  // A PLACED line is HTML and has no textLength, so it takes a horizontal scale pinned to
  // whichever edge its own alignment reads from. Same caveat as a growth follower's transform:
  // a line the TIMELINE animates in its own right is transformed by GSAP too, and the tween
  // wins - so a floored value on a separately-animated placed line loses its squeeze. The
  // artwork's own layers are what the design presets move, so this does not bite by default.
  if (svgFitPlaced(el)) {
    var w = svgTextWidth(el);
    if (!(w > budget + 0.5)) return;
    var align = getComputedStyle(el).textAlign;
    el.style.transformOrigin =
      (align === 'right' ? 'right' : align === 'center' ? 'center' : 'left') + ' center';
    // Never past the legibility floor - see the ruling above the function.
    el.style.transform = 'scaleX(' + Math.max(budget / w, SVG_SQUEEZE_FLOOR).toFixed(4) + ')';
    return;
  }
  // A DRAWN layer takes SVG's own fit-to-width. Per painted line, because a wrapped block's
  // tspans each have their own length and only the ones actually over need squeezing.
  var kids = el.children.length ? el.children : [el];
  for (var j = 0; j < kids.length; j++) {
    var k = kids[j];
    if (!k.getComputedTextLength) continue;
    var natural = k.getComputedTextLength();
    if (!(natural > budget + 0.5)) continue;
    // The budget, or the legibility floor - whichever is WIDER. A line that fits inside its room
    // once condensed is condensed exactly as far as it needs to be; one that would have to go
    // past 70% of its own advance stops there and is left sticking out, legibly, and reported.
    k.setAttribute('textLength', Math.max(budget, natural * SVG_SQUEEZE_FLOOR).toFixed(2));
    k.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  }
}

// Runs as the page parses, with the artwork above it and update() not yet callable. Through
// svgFitValue, never textContent: a block the designer drew as three stacked lines is one value
// with two spaces in it, and taken raw those spaces are the ones that go missing. The LINES they
// drew are kept beside it, because the drawn state has to be reproducible after the first fit has
// repainted the node (svgShowDrawn).
(function () {
  var nodes = svgFitNodes();
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (svgFitDrawn[el.id] != null) continue;
    svgFitDrawn[el.id] = svgFitValue(el);
    if (!svgWrappedBlock(el)) continue;
    var lines = [];
    var steps = [];
    var prevY = null;
    for (var k = 0; k < el.children.length; k++) {
      var kid = el.children[k];
      lines.push(kid.textContent);
      // THE LEADING IS THE DESIGNER'S, and it is written two ways: a baked-in y per line
      // (Illustrator, Inkscape) or a dy step off the one before it. Both are read, because a
      // block repainted at some constant instead is a design nobody drew - a 30px standfirst
      // set on 50px steps tightens to 36 the first time the ladder runs.
      var y = parseFloat(kid.getAttribute('y'));
      var dy = parseFloat(kid.getAttribute('dy'));
      if (isFinite(y) && prevY !== null && y > prevY) steps.push(y - prevY);
      else if (k > 0 && isFinite(dy) && dy > 0) steps.push(dy);
      if (isFinite(y)) prevY = y;
    }
    svgFitLines[el.id] = lines;
    // The FIRST step, not an average: a designer who set one leading set it for every line, and
    // a block whose steps differ is doing something this rule has no reading of.
    if (steps.length) svgFitStep[el.id] = steps[0];
  }
})();

/** THE STEP BETWEEN TWO LINES OF THIS BLOCK, in ems - the leading the designer drew where they
 *  drew one, and the house 1.2 where nothing says. Out-of-range values are not leadings: a
 *  block whose lines overlap, or sit a paragraph apart, is not a wrapping block's step and the
 *  constant is the safer answer. */
function svgLineHeight(el) {
  var step = svgFitStep[el.id];
  var drawn = svgFitSizes[el.id];
  if (!(step > 0) || !(drawn > 0)) return SVG_LINE_HEIGHT;
  var ems = step / drawn;
  return ems >= 0.8 && ems <= 3 ? ems : SVG_LINE_HEIGHT;
}

/** PUT THE DRAWN VALUE BACK ON A NODE, to measure the design rather than the operator's copy.
 *
 *  A BLOCK is repainted line for line. Writing its drawn value as textContent would leave ONE
 *  long line standing, and that width becomes the floor of the room below - a budget the block
 *  could never overflow, so a question that wrapped correctly at load stopped wrapping the moment
 *  anybody typed into it. The lines are the ones the designer drew, kept since parse, so this is
 *  the same measurement whenever it is taken and in whatever face has finished loading. */
function svgShowDrawn(el, drawn) {
  var lines = svgFitLines[el.id];
  if (!lines) { el.textContent = drawn; return; }
  svgPaintLines(el, lines, parseFloat(getComputedStyle(el).fontSize) || 0, svgLineHeight(el));
}

/** Is what this node is SHOWING no longer the drawn design - a different value, or the same one
 *  in a different shape? A block is repainted by every fit, so its form goes stale even while
 *  its value does not, and a measurement taken off the previous pass's answer is the previous
 *  pass's answer. */
function svgFitStale(el, showing) {
  return showing !== svgFitDrawn[el.id] || svgWrappedBlock(el) || !!svgFitLines[el.id];
}

function measureSvgBudgets() {
  var nodes = svgFitNodes();
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var live = svgFitValue(el);
    // The DRAWN VALUE is textContent, not geometry, so it is remembered whether or not this
    // layer is on screen - and it has to be, because update() may arrive before the layer's
    // state ever fires and there would then be nothing left to measure the design from.
    if (svgFitDrawn[el.id] == null) svgFitDrawn[el.id] = live;
    var drawn = svgFitDrawn[el.id];
    if (!svgFitLaidOut(el)) { svgFitOwed[el.id] = true; continue; }   // no box to read (above)
    // Any previous fit has to come off first, or the measurement compounds.
    el.style.fontSize = '';
    svgUnsqueeze(el);
    // Measure the design, put the value back. A BLOCK is restored even when the value matches,
    // because the previous pass repainted its lines - see measureSvgRoom for what that cost.
    var stale = svgFitStale(el, live);
    if (stale) svgShowDrawn(el, drawn);
    // A BLOCK'S DRAWN WIDTH IS ITS WIDEST LINE, not the sum of its lines. getComputedTextLength()
    // adds up every tspan under the node, so a question drawn as three stacked lines reported a
    // width three lines long - and that number is the FLOOR of the room below, so the block could
    // never overflow anything and never wrapped.
    svgFitWidths[el.id] = svgBlockWidth(el);
    svgFitSizes[el.id] = parseFloat(getComputedStyle(el).fontSize) || 0;
    // PUT BACK WHAT WAS THERE, in the shape it was in. Writing textContent leaves one flat line,
    // which the ladder normally repaints straight afterwards - but not on the paths that skip a
    // node (no budget, no drawn size), and a block left flat there is a design nobody drew.
    // Where the value IS the drawn one, the drawn lines are the shape to put back.
    if (stale) { if (live === drawn) svgShowDrawn(el, drawn); else el.textContent = live; }
  }
}

// ── THE ROOM THE DESIGN GIVES A LINE ──────────────────────────────────────────
// The budget is NOT the width of the text the designer typed. A name drawn 402px wide inside a
// 1040px banner has 588px of empty banner beside it, and taking the drawn text as the budget
// spent none of it: the 403rd pixel shrank the type while more than half the panel stood
// empty. So the budget is the ROOM - the shape drawn behind the line, out to a right margin
// mirroring the left one the designer left. A line with no shape behind it keeps the drawn
// width as its budget, which is the honest answer when nothing says otherwise.
//
// The same measurement answers how many LINES the design can hold: the gap from this line down
// to the nearest thing drawn below it (a second text layer, or the panel's own bottom margin).
// A name in a three-line strap measures no room and stays one line, exactly as drawn; a
// question alone on a board measures several and may wrap. Nothing is asked of the designer
// and nothing about the artwork changes - which is the rule this ladder exists to keep.
// It returns the ELEMENT, not a rectangle. A rectangle is enough to bound a line sideways, and
// it is what this used to answer; it is not enough to say where the line sits INSIDE the shape,
// because a plate drawn on an angle has a screen rectangle bigger than the plate. The alignment
// work (svgLocalBox) needs the shape itself so it can ask the question in the shape's own frame.
function svgFitContainer(el) {
  var art = document.querySelector('.${PREFIX}-art');
  if (!art) return null;
  var box = el.getBoundingClientRect();
  var shapes = art.querySelectorAll('rect, path, polygon, ellipse, circle');
  var best = null;
  var bestArea = 0;
  for (var i = 0; i < shapes.length; i++) {
    var r = shapes[i].getBoundingClientRect();
    // Contains the line, and is genuinely bigger than it - a highlight rule under a word is
    // not the panel the word sits in.
    if (r.left > box.left + 1 || r.right < box.right - 1) continue;
    if (r.top > box.top + 1 || r.bottom < box.bottom - 1) continue;
    if (r.width * r.height <= box.width * box.height) continue;
    if (!best || r.width * r.height < bestArea) { best = shapes[i]; bestArea = r.width * r.height; }
  }
  return best;
}

/** THE PANEL, IN THE LINE'S OWN COORDINATE SYSTEM.
 *
 *  Screen rectangles are the wrong instrument for alignment. A plate turned three degrees has a
 *  screen rectangle wider and taller than the plate, so "the middle of the box" read off that
 *  rectangle is not the middle of the plate - and a board drawn on an angle is the normal case in
 *  hand-made artwork, not an edge one (owner, 2026-09-02: "my design here is wonky on purpose to
 *  see how we manage it when we import it").
 *
 *  So the panel's own corners are mapped THROUGH the line's coordinate system: panel local ->
 *  screen -> line local. Text and plate almost always carry the same rotation, because the
 *  designer turned them together, and then the mapped quad is axis-aligned in the line's frame
 *  and this is exact. Where they differ the axis-aligned extent of the quad is used, which is the
 *  same approximation the rest of the ladder makes and is never worse than the screen rectangle.
 *
 *  Returns null rather than guessing when either matrix is unavailable - an entrance mid-flight,
 *  a detached node - and every caller falls back to what it did before. */
function svgLocalBox(panelEl, textEl) {
  if (!panelEl || !panelEl.getBBox || !panelEl.getScreenCTM || !textEl.getScreenCTM) return null;
  var to = textEl.getScreenCTM();
  var from = panelEl.getScreenCTM();
  if (!to || !from) return null;
  var m = to.inverse().multiply(from);
  var bb = panelEl.getBBox();
  var xs = [];
  var ys = [];
  var corners = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x + bb.width, bb.y + bb.height], [bb.x, bb.y + bb.height]];
  for (var i = 0; i < corners.length; i++) {
    xs.push(m.a * corners[i][0] + m.c * corners[i][1] + m.e);
    ys.push(m.b * corners[i][0] + m.d * corners[i][1] + m.f);
  }
  var left = Math.min.apply(null, xs);
  var right = Math.max.apply(null, xs);
  var top = Math.min.apply(null, ys);
  var bottom = Math.max.apply(null, ys);
  return { left: left, right: right, top: top, bottom: bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
}

/** HOW THE DESIGNER ALIGNED THIS LINE IN ITS BOX, read off where they put it.
 *
 *  Nothing is asked and nothing new is stored: the file already says it. On each axis the two
 *  drawn insets are compared, and the line is CENTRED when the block's centre sits within
 *  SVG_ALIGN_TOL of the box's centre - otherwise it is aligned to whichever side it was drawn
 *  nearer. A designer who centred a question centred it; one who set answers against the left of
 *  their plates meant left.
 *
 *  The tolerance is a fraction of the BOX, not a constant, because "near enough to be centred"
 *  scales with the thing it is centred in - and it has to absorb the hand-placed wobble in a
 *  home-made file, where nothing is ever exactly on the middle.
 *
 *  AN EXPLICIT text-anchor IS THE EXPORTER STATING THE ANCHOR, WHICH IS INFORMATION - never a
 *  request to be left out. It used to skip the whole SIDEWAYS half of this - the anchor, the
 *  room measured from the box, and the growth from the middle that hangs off that room - because
 *  all three were gated on having DERIVED the alignment. The vertical half ran either way. Eight
 *  of the 43 corpus files state one, including every centre-aligned Figma export, which is how a
 *  title card and most scoreboards are built: an end-anchored team name in a 680-unit plate
 *  measured 123 units of room - the width of the word already standing there - and shrank at the
 *  first longer name.
 *
 *  So the anchor is believed, and WHERE THE LINE WAS DRAWN is still measured, because they are
 *  two facts and a file can state one while drawing the other. Where they agree the line is
 *  treated exactly as a derived one. Where they disagree - a centre-anchored line composed away
 *  from its box's middle, which is what negative space looks like in a file - the anchor stays
 *  WHERE IT WAS DRAWN and the room is measured about it, because moving it would invent a
 *  centring the designer did not draw, and this module never moves artwork.
 *
 *  Both answers matter to a different half of the fit. Horizontally the anchor decides which way
 *  a longer value fills and where wrapped lines start. Vertically it decides whether the room
 *  below the line is the whole of the room (a line drawn against the top of its box) or only half
 *  of it (a line drawn in the middle, with as much space above it as below). */
var SVG_ALIGN_TOL = 0.05;

function svgAlignOf(el, panelEl) {
  if (svgFitAlign[el.id]) return svgFitAlign[el.id];
  var align = { h: 'start', v: 'top', derived: false };
  var box = svgLocalBox(panelEl, el);
  var own = el.getBBox ? el.getBBox() : null;
  if (box && own && own.width > 0 && own.height > 0) {
    // WHERE THEY DREW IT, measured whatever the file says - it is the artwork's own answer, and
    // the only one available for the thirty-five corpus files in forty-three that state nothing.
    var cx = own.x + own.width / 2;
    var placed = Math.abs(cx - box.cx) <= (box.right - box.left) * SVG_ALIGN_TOL
      ? 'middle'
      : (cx < box.cx ? 'start' : 'end');
    var stated = el.getAttribute('text-anchor');
    if (stated !== 'middle' && stated !== 'end' && stated !== 'start') stated = null;
    align.h = stated || placed;
    // Which of the two this came from, kept because it is what tells a measurement apart from a
    // statement when somebody is reading the sweep's table (scripts/svg-import-sweep.mjs).
    align.derived = !stated;
    var cy = own.y + own.height / 2;
    align.v = Math.abs(cy - box.cy) <= (box.bottom - box.top) * SVG_ALIGN_TOL
      ? 'middle'
      : (cy < box.cy ? 'top' : 'bottom');
    // WHERE THE ANCHOR GOES, measured HERE because here is the one place the DRAWN value is
    // standing on the node (measureSvgRoom restores it before measuring). Asked later, with an
    // operator's value in place, "the middle of the text" would be the middle of whatever was
    // last typed.
    //
    // Centring SNAPS to the box's real centre (owner, 2026-09-02: "that just usually looks
    // better"), so a short value and a long one both sit where a designer would have put them.
    // What the file recorded is not thrown away: the nudge is the distance from that anchor to
    // where the text was actually drawn - the number a deliberately off-centre composition needs
    // back - and it is measured whether or not anything reads it yet.
    if (align.h !== 'start') {
      // THE SNAP IS FOR A LINE THE DESIGNER PUT ON THE LANDMARK, and for no other. A derived
      // 'middle' is within SVG_ALIGN_TOL of the box's centre by construction, so the snap is
      // always a small correction. A STATED 'middle' carries no such promise: the exporter is
      // describing how the line's own words grow, and the designer may have composed that line
      // anywhere in the box. Where the statement and the drawing agree, snap; where they do not,
      // the anchor is where they drew it.
      //
      // AN 'end' LINE NEVER SNAPS, stated or derived. Its landmark would be the box's own right
      // edge, and moving text onto it would spend the margin the designer left rather than keep
      // it - the opposite of what the centring snap does.
      align.anchor = align.h === 'end'
        ? own.x + own.width
        : (align.h === placed ? box.cx : cx);
      align.nudge = own.x + (align.h === 'middle' ? own.width / 2 : own.width) - align.anchor;
      // AND THE ROOM, from the box rather than from where the text happens to be standing.
      // Moving the anchor moves the text, so a budget measured off the text's own left edge
      // would answer differently on the second pass than the first - and an iterated answer
      // settles differently in the editor, in an export and under SPX, which is the one thing
      // this module refuses to do. Measured from the box, at rest, once: the margin the designer
      // left on the tighter side, kept on both.
      // SPENT FROM THE ANCHOR, which is what makes it an answer for a line drawn anywhere in its
      // box rather than only for one sitting on the box's own landmark. A middle-anchored line
      // fills both ways, so it may reach the nearer margin twice over; an end-anchored one fills
      // leftwards until it meets the other margin. For a line whose anchor IS the landmark this
      // is arithmetically the old mirror, to the unit - it just no longer needs that to be true.
      // The run a line gets when a margin of m is kept on both sides of its box: twice the
      // shorter reach for a line that fills BOTH ways, the reach to the far margin for one that
      // fills leftwards. Written once because it is asked twice, with two different margins.
      var reach = function (m) {
        return align.h === 'middle'
          ? 2 * Math.min(align.anchor - (box.left + m), (box.right - m) - align.anchor)
          : align.anchor - (box.left + m);
      };
      var pad = Math.min(own.x - box.left, box.right - (own.x + own.width));
      if (pad > 0) align.width = reach(pad);
      // A CENTRED LINE HAS NO SIDE MARGINS TO READ.
      //
      // Row P measured this on 2026-09-04 and put it to the owner rather than choosing
      // (docs/acceptance/owner-queue/2026-09-04-a-stated-anchor-is-not-an-opt-out.md, call 2):
      // "a centred line never FILLS - the first longer value goes straight to wrapping, and if it
      // cannot wrap, to shrinking", named as the likeliest thing still behind *"when I add a
      // longer text it gets smaller"*. He answered it the day before, walking his vote board:
      // *"it shrank it down, and it doesn't fill the whole shape. It could."*
      //
      // Everything above reads the gap the designer left beside the words as MARGIN. That is a
      // true reading for a line composed against one side of its box. It is empty for a line the
      // designer CENTRED: both gaps are then exactly half the leftover by construction, so the
      // mirror hands the line back its own drawn width and the box around it is invisible to the
      // ladder. His VOTE NOW badge - 260 units of pill, 142 units of word - measured 143 units of
      // room, so one extra word cost it a quarter of its size and anything longer floored at 55%
      // and was squeezed into the same 143 units, which reads on air as the badge having gone.
      //
      // This is the sideways half of the argument settled downwards on 2026-09-02 (the room a
      // centred block has vertically). Same rule, same shape: the margin kept is TYPOGRAPHIC
      // rather than read off the composition - half the drawn type, which is the same side
      // bearing measureSvgRoom already keeps between a line and a neighbour drawn beside it - and
      // it is symmetric about the anchor, because that is the point a longer value grows from.
      //
      // IT MAY ONLY EVER ADD ROOM, exactly as the vertical rule may: a composition the mirror
      // already served keeps precisely what it had, so no graphic gets tighter because of this.
      if (align.h === 'middle') {
        var open = reach((svgFitSizes[el.id] || own.height || 0) * 0.5);
        if (open > (align.width || 0)) align.width = open;
      }
    }
    // AND THE SAME SNAP ON THE OTHER AXIS (owner, 2026-09-02: "by default a centered text should
    // snap both vertically and horizontally"). What shipped first centred sideways and kept
    // whatever height the line was drawn at - 9 units above the true middle of his own plate,
    // held constant at every length, which is a composition nobody chose rather than one the
    // designer did. So a block the designer CENTRED in its box is moved onto the box's middle,
    // by the distance between the two, and the drawn offset is kept as the nudge for the same
    // reason the horizontal one is: an off-centre composition may be deliberate.
    //
    // Only for a MIDDLE line. Text drawn against the top or the bottom of its box was composed
    // against that edge, and moving it would be inventing a centring the designer did not draw.
    if (align.v === 'middle') {
      align.snapY = box.cy - cy;
      align.nudgeY = -align.snapY;
      // The middle itself is kept as well, because the snap alone only answers for the block as
      // DRAWN: a block the ladder shrank or wrapped is a different height, and svgRecentre needs
      // the line it is putting that block back onto.
      align.boxCy = box.cy;
    }
  }
  svgFitAlign[el.id] = align;
  return align;
}

/** HOW FAR THE PAINTED BLOCK DROPS to sit on its box's middle - zero for anything but a line the
 *  designer centred, and zero while the room could not be measured at all.
 *
 *  Rounded away below half a unit, and that floor is what keeps the promise above it: a snap
 *  nobody can see would still cost every single-line graphic a tspan it did not have before,
 *  because a dy is the only thing that can carry it. A designer who centred a line exactly is
 *  answered by leaving it exactly where they put it. */
function svgSnapY(room) {
  var align = room && room.align;
  var d = align && align.snapY ? align.snapY : 0;
  return Math.abs(d) < 0.5 ? 0 : d;
}

/** SCREEN PX PER USER UNIT in the space this element's own numbers are written in - the LENGTH of
 *  that space's x basis vector, never its x COMPONENT.
 *
 *  The matrix entry "a" is that length times the cosine of the frame's rotation, so the two agree
 *  exactly while nothing above the element is turned and disagree by any amount once something is.
 *  A plate drawn PORTRAIT and laid flat - the owner's own board, and the ordinary way anybody
 *  makes a horizontal band out of a tall box - is a rotation of very nearly 90 degrees, where the
 *  cosine is very nearly nothing. Illustrator writes that rotation on the rect, where "a" never
 *  sees it; Inkscape and Figma write it on the LAYER GROUP, where it lands in the parent's CTM.
 *
 *  Measured on inkscape-layer-rotated-quiz-plate (2026-09-04): 0.0087 against a true 1, so the
 *  fit handed one line 123,760 units of room inside a plate 1,240 units wide. A budget nothing
 *  can overflow means the ladder never wraps and never shrinks, and the words simply run out of
 *  the plate and off the frame - which is what the sweep saw.
 *
 *  Artwork carries a uniform scale plus a rotation, and for that hypot(a, b) is exact rather than
 *  approximate. A degenerate matrix falls back to 1, as it always did. */
function svgFrameScale(el) {
  var ctm = el.parentNode && el.parentNode.getScreenCTM ? el.parentNode.getScreenCTM() : null;
  var s = ctm ? Math.sqrt(ctm.a * ctm.a + ctm.b * ctm.b) : 0;
  return s || 1;
}

/** Is this drawn thing INSIDE the panel? The one question that separates the furniture sharing a
 *  line's box from the rest of the artwork, asked with a pixel of tolerance because a plate and
 *  the rule drawn along its edge are flush by intent. Anything hanging out of the panel is
 *  somebody else's furniture and bounds nothing here. */
function svgInsidePanel(r, panel) {
  return r.left >= panel.left - 1 && r.right <= panel.right + 1
    && r.top >= panel.top - 1 && r.bottom <= panel.bottom + 1;
}

/** THE PANEL'S OWN TOP PADDING - the gap the designer left between the panel's top edge and the
 *  first line drawn inside it, MIRRORED onto the bottom to bound a wrapped block.
 *
 *  Sideways a line's room already stops one drawn left-inset short of the far edge; downwards
 *  there was no such rule at all, so a wrapped block could paint right onto the panel's bottom
 *  edge - a graphic with no safe space around its own text (owner walk, 2026-08-29). It is the
 *  same mirror, on the other axis, and it is MEASURED off the rest pose the designer drew rather
 *  than invented as a constant. Mirroring the TOP (rather than reading the drawn bottom gap) is
 *  what keeps a lone line drawn high in a tall panel free to wrap into the space below it: that
 *  space is room, while the space above the first line is the margin. A panel with no bound line
 *  drawn in it keeps its own edge, which is the honest fallback. */
function svgPanelTopPad(panel, nodes) {
  var first = null;
  for (var i = 0; i < nodes.length; i++) {
    var r = nodes[i].getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if (r.left < panel.left - 1 || r.left >= panel.right) continue;
    if (r.top < panel.top - 1 || r.top >= panel.bottom) continue;
    if (first === null || r.top < first) first = r.top;
  }
  return first === null ? 0 : Math.max(0, first - panel.top);
}

/** How far down this line's block may run before it starts changing the design.
 *
 *  Two bounds, and the nearer wins. Anything drawn BELOW the line keeps THE WHOLE GAP THE
 *  DESIGNER DREW between them - a name with a role under it therefore has no room of its own at
 *  all, and a second line has to be bought by growing the panel. The leading between two lines
 *  is the composition, not spare room: filling it was how a wrapped name came to sit hard
 *  against the role beneath it (owner walk, 2026-08-29 - "the panel doesn't have a safe space").
 *  With nothing drawn below, the bound is the panel's own bottom edge less its top padding
 *  mirrored. Only things that overlap the line horizontally count; a crest off to one side does
 *  not.
 *
 *  AND ONLY WHAT IS DRAWN INSIDE THE PANEL COUNTS AT ALL (owner walk, 2026-09-02, on his own quiz
 *  board). This used to search the whole artwork, so on a board of separate plates the ANSWER
 *  plates - which sit below the question and overlap it horizontally, but are nowhere near its
 *  plate - left the question no room to wrap inside a plate drawn tall enough for three lines,
 *  and the ladder went straight to shrinking: "it immediately shrinks, which doesn't make any
 *  sense because we have room in the box". The inside of the box is the room, and nothing outside
 *  the box bounds it. Nothing can paint below the panel either way, because the panel's own
 *  bottom is where this starts. */
function svgFitCeiling(el, panel, pad) {
  var art = document.querySelector('.${PREFIX}-art');
  var box = el.getBoundingClientRect();
  var others = art.querySelectorAll('text, tspan, image, rect, path, polygon, ellipse, circle');
  var top = panel.bottom - (pad || 0);
  for (var i = 0; i < others.length; i++) {
    var o = others[i];
    if (o === el || o.contains(el) || el.contains(o)) continue;
    var r = o.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if (r.width * r.height >= panel.width * panel.height) continue;   // that IS the panel
    if (!svgInsidePanel(r, panel)) continue;                          // drawn outside this box
    if (r.right < box.left + 1 || r.left > box.right - 1) continue;   // no horizontal overlap
    if (r.top < box.bottom - 1) continue;                             // not below this line
    // The gap the designer drew between the two is kept WHOLE, so the bound is this line's own
    // drawn bottom rather than the neighbour's top.
    if (box.bottom < top) top = box.bottom;
  }
  return top;
}

/** A CAP: panel FURNITURE rather than a neighbour - a narrow shape drawn hugging the panel's
 *  far edge (a gradient end-cap, an accent bar). Text must stay off it (owner, 2026-08-28:
 *  "text stays between the caps, never on top of them"), so it bounds a line's room exactly
 *  like a neighbour does - but it TRAVELS when the panel grows, so it must not PEN the line:
 *  widening the panel moves the cap and genuinely buys the line room. Only a shape or an image
 *  can be one; a text beside a text is a real neighbour. */
function svgIsEndCap(o, r, panel, axis, dir) {
  var tag = (o.tagName || '').toLowerCase();
  if (tag === 'text' || tag === 'tspan') return false;
  // The cap hugs the edge that MOVES, which is not always the far one: a panel growing upward
  // (a lower third keeping its drawn bottom) carries the furniture on its TOP edge and leaves
  // anything closing its bottom exactly where the designer drew it.
  if (axis === 'y') {
    if (r.height > panel.height * 0.25) return false;
    return dir < 0
      ? r.top <= panel.top + Math.max(2, panel.height * 0.02) && r.bottom < panel.bottom - 1
      : r.bottom >= panel.bottom - Math.max(2, panel.height * 0.02) && r.top > panel.top + 1;
  }
  if (r.width > panel.width * 0.25) return false;
  return dir < 0
    ? r.left <= panel.left + Math.max(2, panel.width * 0.02) && r.right < panel.right - 1
    : r.right >= panel.right - Math.max(2, panel.width * 0.02) && r.left > panel.left + 1;
}

/** The nearest drawn thing to the RIGHT of this line, on its own rows - what a longer value would
 *  run into (owner, 2026-08-26: "a line's room is bounded by what is drawn next to it"). Two
 *  labels placed apart on ONE baseline is how an exporter writes a strap's place and its time, and
 *  the panel behind them says nothing about where the first one has to stop: HELSINKI is bounded by
 *  19:30, not by the banner, and widening the banner moves neither. The panel's own right edge is
 *  the backstop, so a line with nothing beside it is unchanged. The bound is returned WITH what
 *  it is - an end CAP bounds the room without penning the line (see svgIsEndCap).
 *
 *  Only what is drawn INSIDE the panel is a neighbour, for the same reason svgFitCeiling only
 *  looks inside it: a plate standing beside this one is not this line's furniture. */
function svgFitNeighbour(el, panel) {
  var art = document.querySelector('.${PREFIX}-art');
  var box = el.getBoundingClientRect();
  var others = art.querySelectorAll('text, tspan, image, rect, path, polygon, ellipse, circle');
  var left = panel.right;
  var cap = false;
  for (var i = 0; i < others.length; i++) {
    var o = others[i];
    if (o === el || o.contains(el) || el.contains(o)) continue;
    var r = o.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if (r.width * r.height >= panel.width * panel.height) continue;   // that IS the panel
    if (!svgInsidePanel(r, panel)) continue;                          // drawn outside this box
    if (r.bottom < box.top + 1 || r.top > box.bottom - 1) continue;   // not on this line's rows
    if (r.left < box.right - 1) continue;                             // not to the right of it
    if (r.left < left) { left = r.left; cap = svgIsEndCap(o, r, panel, 'x', 1); }
  }
  return { edge: left, cap: cap };
}

function measureSvgRoom() {
  var nodes = svgFitNodes();
  // THE WHOLE DESIGN AT REST BEFORE ANY OF IT IS MEASURED, never one line at a time. A
  // neighbour still holding a WRAPPED operator value is taller than the designer drew it, and
  // it is exactly what the line above measures its ceiling against - so a per-line swap reads
  // one line of the design against everybody else's screen. Restoring every value afterwards
  // costs one extra loop and makes the room a pure function of the artwork.
  //
  // A node holding exactly what the designer drew is NOT rewritten, only read: writing
  // textContent flattens whatever markup is underneath, and a kerned headline's own per-glyph
  // tspans are the artwork arriving verbatim.
  //
  // A BLOCK is the exception, and it is restored on every pass even when the VALUE has not
  // changed - because its FORM has. The first fit repaints it at whatever line count that pass
  // settled on, so the second pass (the one document.fonts.ready fires) would measure the room
  // against the previous pass's own answer: a question drawn on three lines and first fitted
  // onto two then reported two lines' worth of height as the room the design offers, and each
  // pass shrank it again. Same failure as an un-rested layout (refitSvgText), same fix - and
  // svgShowDrawn puts the drawn LINES back, so nothing is lost by restoring it.
  var live = [];
  var swapped = [];
  for (var a = 0; a < nodes.length; a++) {
    var was = svgFitValue(nodes[a]);
    var drawn = svgFitDrawn[nodes[a].id];
    live.push(was);
    swapped.push(drawn != null && svgFitStale(nodes[a], was));
    nodes[a].style.fontSize = '';
    if (swapped[a]) svgShowDrawn(nodes[a], drawn);
  }
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    // No box to read, so nothing is recorded and the line stays owed (svgFitLaidOut). Asked
    // here, with the design's own values back in place, for the same reason measureSvgBudgets
    // asks it there: two passes disagreeing about which lines are measurable is a room measured
    // against a width nobody wrote.
    if (!svgFitLaidOut(el)) { svgFitOwed[el.id] = true; continue; }
    // A PLACED line's room is its slot, and a slot has no height - one line, filled and then
    // shrunk. Nothing else about it is measured, because nothing else about it was drawn.
    if (svgFitPlaced(el)) {
      svgFitRoom[el.id] = { width: svgFitSlot(el), height: 0, top: 0, penned: false };
      continue;
    }
    var box = el.getBoundingClientRect();
    // Screen px -> the artwork's own units, read off the element's CTM. This used to be derived
    // from the line's own two widths (advance length / ink box), which is CLOSE and not exact:
    // a glyph's side bearings are in one and not the other, so the ratio carried a per-typeface
    // error of a percent or two straight into the ROOM - and a grown banner then missed the
    // margin it was mirroring by a pixel or so (measured 2026-08-26: 51.4px against a drawn 50).
    var scale = 1 / svgFrameScale(el);
    var panelEl = svgFitContainer(el);
    var panel = panelEl ? panelEl.getBoundingClientRect() : null;
    var align = svgAlignOf(el, panelEl);
    // "height" is the room the BLOCK has, measured from this line's own top - not a line
    // count, because the count depends on the size and the size is what the ladder changes.
    // A 112px board panel holds one 44px line and three 24px ones, and only the height knows
    // that. Zero height (a line drawn hard against whatever is below it) means no wrapping.
    var room = { width: svgFitWidths[el.id], height: 0, top: 0, penned: false, align: align };
    if (panel && box.width > 0) {
      var inset = box.left - panel.left;
      // Where this line has to stop: its neighbour if it has one, else the panel's own right
      // edge less the margin the designer left on the left. A PENNED line (one bounded by a
      // neighbour rather than by the panel) is marked, because widening the panel gives it
      // nothing - so it must not drive the growth either. A bound that is an end CAP does not
      // pen: the cap is the panel's own furniture and travels with its growing edge, so
      // widening genuinely buys the line room - the text just stays off the cap meanwhile.
      var bound = svgFitNeighbour(el, panel);
      var edge = bound.edge;
      room.penned = edge < panel.right - 0.5 && !bound.cap;
      // The gap to keep: half the drawn type beside a neighbour (a readable space between two
      // labels), the design's own left margin mirrored when the panel - or its cap - is the
      // bound.
      var pad = room.penned ? ((svgFitSizes[el.id] || 0) * 0.5) / scale : inset;
      room.width = Math.max(svgFitWidths[el.id], (edge - pad - box.left) * scale);
      // A line anchored to the middle or the right of its box fills BOTH ways, so its room is
      // the box's own inside rather than the distance from where it was drawn to the far margin.
      // Not for a PENNED line: something else drawn beside it is the real bound, and the box
      // says nothing about where that is.
      if (align.width > 0 && !room.penned) room.width = Math.max(svgFitWidths[el.id], align.width);
      // A LINE ALWAYS HAS ROOM FOR ITSELF, whatever the margins say - the floor is the block as
      // drawn, never zero. Zero would read as "this line overflows its room by its own height"
      // to everything downstream, and the lowest line of a stack (whose ceiling is the panel's
      // mirrored top padding, drawn tighter than that on most artwork) is exactly that case.
      room.height = Math.max(
        box.height * scale,
        (svgFitCeiling(el, panel, svgPanelTopPad(panel, nodes)) - box.top) * scale,
      );
      // Where the drawn line starts, in the artwork's own units - the datum the painted block's
      // height is checked against. getBBox() answers in user units and ignores transforms, so
      // the check holds while an entrance is mid-flight.
      room.top = el.getBBox ? el.getBBox().y : 0;
      // A LINE DRAWN IN THE MIDDLE OF ITS BOX GROWS BOTH WAYS (owner walk, 2026-09-02).
      //
      // Everything above measures DOWNWARD from the drawn line, and bounds that with the panel's
      // own top padding mirrored. That is right for a line composed against the top of its box:
      // the space above it is margin, and mirroring it keeps the block off the bottom edge.
      //
      // It is wrong, and badly, for a line the designer CENTRED in a tall box. There the space
      // above is not margin at all - it is half the centring - so mirroring it hands back a
      // fraction of the box: his question, one line drawn in the middle of a plate 259 units
      // tall, measured 64 units of room and shrank to 62% of the size it was drawn at rather
      // than taking the second line the plate plainly had space for.
      //
      // So where the line is CENTRED, the room is symmetric about the drawn block's own centre,
      // and the margin kept from each edge is TYPOGRAPHIC rather than read off the composition:
      // half of the leading the designer set. A line may come within half a line of its box, and
      // that is the only quantity in the file that is a real answer when the drawn gaps are
      // centring rather than margin. Bottom-aligned text is the same argument upside down and
      // takes the room above it.
      var localBox = svgLocalBox(panelEl, el);
      if (localBox && align.v !== 'top' && !svgFitPlaced(el)) {
        var half = (svgFitStep[el.id] || (svgFitSizes[el.id] || 0) * SVG_LINE_HEIGHT) / 2;
        var inside = { top: localBox.top + half, bottom: localBox.bottom - half };
        // Symmetric about where the block will actually STAND, which for a centred one is the
        // box's middle rather than the height it happened to be drawn at (svgSnapY moves it
        // there). Measured about the drawn centre instead, a block drawn a few units off the
        // middle was granted only twice its SHORTER side - room the design has and the ladder
        // could not see, for no reason once the block no longer sits there.
        var mid = align.v === 'middle'
          ? localBox.cy
          : room.top + (el.getBBox ? el.getBBox().height : 0) / 2;
        var symmetric = align.v === 'middle'
          ? 2 * Math.min(mid - inside.top, inside.bottom - mid)
          : mid + (el.getBBox ? el.getBBox().height : 0) / 2 - inside.top;
        // Never LESS than the downward answer: this rule may only ever find room the old one
        // could not see, so a design the mirror already served keeps exactly what it had.
        if (symmetric > room.height) room.height = symmetric;
      }
    }
    svgFitRoom[el.id] = room;
  }
  // Put each value back in the shape it was in - the drawn LINES where the value is the drawn
  // one, so a block skipped by the ladder is not left flattened (measureSvgBudgets says why).
  for (var b = 0; b < nodes.length; b++) {
    if (!swapped[b]) continue;
    if (live[b] === svgFitDrawn[nodes[b].id]) svgShowDrawn(nodes[b], live[b]);
    else nodes[b].textContent = live[b];
  }
}

/** Break a value into at most "max" lines no wider than "budget", at the current size. A word
 *  longer than the budget stays whole and simply overflows - the shrink answers that. */
function svgWrapLines(el, value, budget, max) {
  var words = value.split(/\\s+/);
  var lines = [];
  var line = '';
  for (var i = 0; i < words.length; i++) {
    var next = line ? line + ' ' + words[i] : words[i];
    el.textContent = next;
    if (line && el.getComputedTextLength() > budget && lines.length + 1 < max) {
      lines.push(line);
      line = words[i];
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** IS THIS NODE A BLOCK OF LINES - one value spread over several tspans?
 *
 *  True for the lines this runtime paints, and true for the DESIGNER'S own stacked lines, which
 *  the import stamps with the same attribute the moment they read as one wrapping field
 *  (assets/svgImport.ts markWrappedBlock). One stamp, so a block measures and reads back the
 *  same way before its first update() and after it.
 *
 *  False for the tspans a kerned headline is written as: those are RUNS of one line, they carry
 *  no stamp, and every measurement of them is the line's own - the whole advance, read straight
 *  off the text node. */
function svgWrappedBlock(el) {
  var kids = el.children;
  return !!(kids.length && kids[0].hasAttribute && kids[0].hasAttribute('data-noacg-line'));
}

/** THE VALUE A BOUND NODE HOLDS RIGHT NOW.
 *
 *  A BLOCK holds it as one tspan per line, and textContent concatenates those with nothing
 *  between them - so re-reading it that way loses one space per break, and the next pass fits a
 *  different value than the one the operator typed ("Ada Lovelace" comes back as "AdaLovelace").
 *  The lines are stamped, so they are read back as the value they were made from. Anything else -
 *  a plain line, or a kerned line's runs - is its own textContent, untouched. */
function svgFitValue(el) {
  if (!svgWrappedBlock(el)) return el.textContent;
  var kids = el.children;
  var parts = [];
  for (var i = 0; i < kids.length; i++) parts.push(kids[i].textContent);
  return parts.join(' ');
}

/** Paint a wrapped value as tspans on the node's own x, stepping down by the line height - in
 *  ems, the designer's where they drew one (svgLineHeight). One line is written as plain text,
 *  so a graphic that neither wraps nor moves emits nothing new. */
function svgPaintLines(el, lines, size, lineHeight, room) {
  var lh = lineHeight > 0 ? lineHeight : SVG_LINE_HEIGHT;
  // A ONE-LINE VALUE STILL NEEDS A TSPAN WHEN IT HAS TO MOVE. The vertical snap rides the first
  // line's dy exactly as the rise does, and plain text has no dy to ride - so a single line that
  // is being centred in its box is painted as one marked tspan instead. Everything else is
  // written as text, which is what keeps a graphic that neither wraps nor snaps byte-identical
  // to the artwork the designer exported.
  if (lines.length < 2 && !svgSnapY(room)) { el.textContent = lines[0] || ''; return; }
  // EVERY LINE RESTARTS AT THE TEXT'S OWN X, and a layer with no x attribute starts at 0 -
  // which is SVG's own default and exactly where Illustrator puts it, since Illustrator writes
  // the position in the element's TRANSFORM instead. Left off, a tspan continues from wherever
  // the previous one ended and the wrap paints a staircase running out of the panel.
  var x = el.getAttribute('x');
  if (x === null) x = '0';
  el.textContent = '';
  for (var i = 0; i < lines.length; i++) {
    // The namespace comes from the node itself rather than a literal URL: an XML namespace is
    // not a network reference, but the export gate scans emitted code for URLs and cannot tell
    // the two apart - and it is right not to try (pillar 3: emitted code reaches no network).
    var t = document.createElementNS(el.namespaceURI, 'tspan');
    t.setAttribute('x', x);
    // THE FIRST LINE CARRIES THE BLOCK'S RISE. A wrapped block is painted downward from the
    // drawn baseline, so a block the designer centred in its box slides down as it gains lines
    // and stops being centred. Lifting the first line by the lines it gained puts the block back
    // where it was composed: half a step per gained line for centred text, a whole step for text
    // sitting on the bottom of its box. It rides the first line dy rather than a transform because the
    // editor's entrance reset clears inline styles, and because it is repainted every pass
    // anyway - nothing accumulates.
    // AND THE FIRST LINE ALSO CARRIES THE SNAP - how far the whole block drops to sit on its
    // box's middle (svgSnapY). The rise keeps a growing block where it was composed; the snap
    // says where "composed" is, and the two are one number by the time they reach the dy.
    var rise = i === 0 ? svgSnapY(room) - svgRise(room, lines.length) * size * lh : size * lh;
    t.setAttribute('dy', rise.toFixed(2));
    // MARKED AS OURS, so svgFitValue can read the value back with its spaces intact.
    t.setAttribute('data-noacg-line', '');
    t.textContent = lines[i];
    el.appendChild(t);
  }
}

/** HOW FAR A BLOCK OF n LINES HAS TO RISE to stay where it was composed. A block grows downward
 *  from its first baseline, so text drawn in the middle of its box slides down half a step per
 *  gained line and text sitting on the bottom slides a whole step. Top-aligned text was already
 *  composed downward and never moves. */
function svgRise(room, lines) {
  var v = room && room.align ? room.align.v : 'top';
  if (lines < 2 || v === 'top') return 0;
  return v === 'middle' ? (lines - 1) / 2 : lines - 1;
}

/** PUT A CENTRED BLOCK BACK ON ITS BOX'S MIDDLE, once, after the ladder has settled.
 *
 *  The snap svgAlignOf measured says where the DRAWN block had to move to sit on the middle, and
 *  a block the ladder has shrunk is not the drawn block: a smaller face has a shorter ink box
 *  above the same baseline, so the block ends up sitting low. On the owner's quiz board a value
 *  that reached the floor settled 1.5 units below the middle every time - small, and his ruling
 *  is that the text stays centred "so it looks like it's aligned with everything else".
 *
 *  MEASURED AFTER THE SIZE SEARCH, never predicted from it. The correction is a pure
 *  translation, so it cannot change the size or the line count it was measured against, and one
 *  pass is therefore exact rather than the start of an iteration.
 *
 *  Only a block that is already painted as marked lines can carry it, because the correction
 *  rides the first line's dy. A line drawn EXACTLY on its box's middle is painted as plain text
 *  (svgPaintLines, so a graphic that neither wraps nor snaps stays byte-identical to the artwork
 *  the designer exported) and keeps its drift when a value shrinks it - under two units on the
 *  boards measured, and the alternative is spending a text node on every single-line graphic in
 *  the catalog. */
function svgRecentre(el, room) {
  var align = room && room.align;
  if (!align || align.v !== 'middle' || align.boxCy == null || !el.getBBox) return;
  var first = el.querySelector('tspan[data-noacg-line]');
  if (!first) return;
  var bb = el.getBBox();
  var off = align.boxCy - (bb.y + bb.height / 2);
  if (Math.abs(off) < 0.5) return;
  first.setAttribute('dy', ((parseFloat(first.getAttribute('dy')) || 0) + off).toFixed(2));
}

/** Write the anchor svgAlignOf worked out, in the artwork's own coordinates so it survives
 *  whatever rotation the layer carries. Idempotent, and silent for a line that is already
 *  anchored where SVG's default puts it. */
function svgApplyAnchor(el, room) {
  var align = room && room.align;
  if (!align || align.h === 'start' || align.anchor == null) return;
  if (el.getAttribute('text-anchor') !== align.h) el.setAttribute('text-anchor', align.h);
  // The anchor is measured at rest, and a panel that grew ONE way has moved its box since - so
  // the anchor travels with it (svgFitShift). Still one measurement rather than an iteration:
  // the growth is applied once per pass, before the fit, so this is arithmetic on a settled
  // number rather than a budget read off wherever the text happens to be standing.
  var x = (align.anchor + (svgFitShift[el.id] || 0)).toFixed(2);
  if (el.getAttribute('x') !== x) el.setAttribute('x', x);
}

/** The widest of a block's lines, which is what has to fit the budget. Anything that is not a
 *  block - a placed line, a plain line, a kerned line's runs - measures as one line, because it
 *  IS one: summing a kerned headline's runs is the correct answer for it and taking the widest
 *  would report a fraction of the line as its width. */
function svgBlockWidth(el) {
  if (svgFitPlaced(el) || !svgWrappedBlock(el)) return svgTextWidth(el);
  var widest = 0;
  for (var i = 0; i < el.children.length; i++) {
    var w = el.children[i].getComputedTextLength();
    if (w > widest) widest = w;
  }
  return widest;
}

// THE LADDER (owner-ruled 2026-08-23): fill the panel, then wrap inside the height the design
// already has, then shrink to the readability floor, then say so. The artwork is never
// reshaped to make copy fit - a panel grows only where the author opted into it (stretchSvgPanel
// below), and past the floor the value is reported as too long rather than clipped.
function fitSvgText() {
  // A LINE THAT HAS FINALLY GOT A BOX IS MEASURED HERE, AT REST, BEFORE ANY PANEL GROWS. Both
  // passes run together because the room is measured against the budgets, and both run BEFORE
  // growSvgLayout for the reason refitSvgText gives: measured while a panel is still grown from
  // the last pass, the room already contains the grant that svgFitExtra is about to add to it,
  // and the same value would be fitted against its budget twice over. One re-measure for the
  // pass, never one per line, and only while a line that is owed one can actually take it -
  // otherwise a board with a state that is off in its default look (which is every quiz board)
  // would pay for a full re-measure on every single update() and settle nothing.
  if (svgFitDue()) svgRestAndMeasure();
  if (typeof growSvgLayout === 'function') growSvgLayout();
  var nodes = svgFitNodes();
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var room = svgFitRoom[el.id];
    // NOTHING IS FITTED AGAINST A MEASUREMENT NOBODY CAN TAKE. Two ways to be in that state and
    // they are the same rule: no room recorded yet, or a room recorded when this line was last
    // on screen and it is not on screen now - a drawn state that has been shown once keeps its
    // room, and running the ladder on it while it is hidden measures every width as zero, so the
    // value would be painted as one whole line at the drawn size and air that way on the next
    // reveal. Owed instead, and the reveal pays it.
    if (!room || !svgFitLaidOut(el)) { svgFitOwed[el.id] = true; continue; }
    svgFitOwed[el.id] = false;
    el.style.fontSize = '';                     // back to the drawn size before measuring
    svgUnsqueeze(el);                           // …and out of any previous pass's squeeze
    svgApplyAnchor(el, room);                   // before any line is painted: a tspan reads it
    var budget = room.width + (svgFitExtra[el.id] || 0);
    var drawnSize = svgFitSizes[el.id];
    var value = svgFitValue(el);
    svgFitOver[el.id] = false;
    if (!(budget > 0) || !(drawnSize > 0)) continue;

    var size = drawnSize;
    var floor = drawnSize * SVG_FIT_FLOOR;
    var hardFloor = drawnSize * SVG_FIT_HARD_FLOOR;
    var lineHeight = svgLineHeight(el);         // the designer's leading, or the house 1.2
    // WHERE A GROWING PANEL PUTS ITS CEILING. Sideways, growth is more BUDGET (above). Downwards
    // it is not a budget at all - it is somewhere to WRAP into, so it raises the ceiling this
    // block may fill and the panel is then grown to whatever the settled block actually needed
    // (growSvgHeights below). The ceiling is the MAXIMUM the rule could ever give, measured at
    // rest, so the wrap never chases a height that is itself still moving.
    var ceiling = room.height + (svgFitExtraH[el.id] || 0);
    // WRAP AND SHRINK TOGETHER. How many lines fit is a function of the SIZE - the quiz board's
    // 112px panel holds one line of 44px type and three of 24px - so every pass re-asks. While
    // more lines are still reachable the size comes down in small steps, because the next step
    // may buy a whole line rather than a few pixels of width; once the block can only ever be
    // one line, the exact ratio settles it in one move.
    // THE LAST THREE RUNGS, IN THE OWNER'S ORDER (2026-09-05, correcting the same day's first
    // attempt). Shrink to the REPORTING floor; condense a little, never past legibility; and only
    // if that still will not fit, shrink further. Two attempts, because the third rung must not
    // be reached by anything the second can hold - condensing to 70% fills the panel the designer
    // drew, where shrinking on past it leaves the growth unspent (measured: 16px of a lower
    // third's grown banner standing empty).
    for (var attempt = 0; attempt < 2; attempt++) {
      var stopAt = attempt === 0 ? floor : hardFloor;
      for (var pass = 0; pass < 8; pass++) {
      el.style.fontSize = size === drawnSize ? '' : size.toFixed(2) + 'px';
      // HOW MANY LINES THE ROOM COULD HOLD - an upper bound the measured check below prunes,
      // never the answer on its own. A block of n lines is (n-1) line STEPS plus one line's own
      // box, not n steps: counting it as n steps loses the last line of every block that fills
      // its room, which is exactly the block a designer drew to fill it. The question drawn on
      // three lines was offered two, so it shrank to fit a room it already fitted.
      var maxLines = Math.max(1, 1 + Math.floor((ceiling - size) / (size * lineHeight)));
      // HEIGHT IS CHECKED, NOT CALCULATED, and a block that does not fit loses a LINE rather
      // than keeping one that prints through the layer below it. A wrapped block starts at the
      // first line's baseline and grows down, so the line count is arithmetic with an ascender
      // and a descender in it; measuring the painted block is exact. Falling back through the
      // counts is what guarantees the last line stays inside the shape it was drawn in - at the
      // floor this settles on one long line, which overruns sideways where somebody can see it
      // rather than over somebody else's artwork.
      var width = 0;
      var tall = false;
      for (var n = maxLines; n >= 1; n--) {
        svgPaintLines(el, n > 1 ? svgWrapLines(el, value, budget, n) : [value], size, lineHeight, room);
        width = svgBlockWidth(el);
        // THE BLOCK'S OWN HEIGHT against the room, rather than where its bottom lands. The two
        // were the same answer while every block grew downward from its drawn line; a block that
        // rises to stay centred (svgRise) has a bottom that no longer moves with its height, and
        // the room it is being checked against is symmetric about the drawn line.
        tall = ceiling > 0 && !!el.getBBox && el.getBBox().height > ceiling + 0.5;
        if (!tall) break;
      }
      if (width <= budget + 0.5 && !tall) break;
      // TWO FLOORS, AND THEY ANSWER DIFFERENT QUESTIONS (owner ruling, 2026-09-05).
      //
      // 55% is where the value is REPORTED as too long - the operator's warning, unchanged, and
      // the moment the design stops being able to hold the copy at a size anyone would have
      // chosen. It used to be where shrinking STOPPED as well, and everything past it was spent
      // condensing the glyphs instead. That is the one thing the owner ruled out: "the text
      // should never grow on top of each other or get so dense that it's impossible to read".
      //
      // The same sentence says what IS acceptable - "if it becomes too small, then that's the
      // user's own fault" - so where condensing cannot hold a value legibly, the type SHRINKS on
      // past this floor instead (the second attempt, below the loop). Scaling leaves every
      // letterform the shape the designer chose; condensing is what turns words into a texture.
      //
      // Both of those keep the OLDER ruling (2026-08-26, nothing paints outside its panel) intact.
      // Measured while getting this wrong twice in one day: condensing without a floor smeared the
      // owner's question into grey texture, and flooring the condensing WITHOUT the second attempt
      // stood a corpus endboard's sign-off 354px outside its plate.
      if (size <= floor + 0.01) svgFitOver[el.id] = true;
      if (size <= stopAt + 0.01) break;
      // COULD A SMALLER SIZE STILL BUY A LINE? Counted the SAME WAY as maxLines above, or the
      // two disagree by one and the ladder takes the width-ratio jump past the very size at
      // which the extra line would have fitted.
      var atFloor = Math.max(1, 1 + Math.floor((ceiling - stopAt) / (stopAt * lineHeight)));
      var canGrowLines = atFloor > maxLines;
      var ratio = width > budget ? budget / width : 0.94;
      size = Math.max(stopAt, canGrowLines || tall ? size * 0.9 : size * ratio);
    }
    // Fitted without needing the last rungs at all - much the commonest case, and untouched.
    if (!svgFitOver[el.id]) break;
    // CONDENSE, bounded by legibility (svgSqueeze). Where that is enough the block fills the room
    // the design gave it, and the ladder is done.
    svgSqueeze(el, budget);
    if (svgBlockWidth(el) <= budget + 0.5) break;
    // Not enough, and the alternative to shrinking further is words standing outside the panel.
    // Take the condensing off and let the second attempt spend size instead.
    if (attempt === 0) svgUnsqueeze(el);
    }
    // The ladder has settled, so where the block actually STANDS can be measured rather than
    // predicted - and a block that is centred in its box goes back onto the middle.
    svgRecentre(el, room);
    el.classList.toggle('${PREFIX}-overflow', !!svgFitOver[el.id]);
  }
  if (typeof growSvgHeights === 'function') growSvgHeights();
}

/**
 * WHICH VALUES ARE TOO LONG FOR THIS GRAPHIC - the field ids whose copy could not be made to
 * fit even at the floor, after filling the panel and using every line the design has room for.
 * The artwork is never reshaped and the copy is never cut to hide it (owner ruling 2026-08-23),
 * so this is how an operator surface can say so before the graphic goes to air.
 */
function noacgTextOverflow() {
  var out = [];
  for (var id in svgFitOver) if (svgFitOver[id]) out.push(id);
  return out;
}

// THE ROOM IS THE DESIGN'S, NEVER THE LAST PASS'S. A re-measure has to start from the artwork
// AT REST: measured while a panel is still grown from the previous pass, the room reads as
// bigger than the designer drew, the block looks like it already fits, and the growth is
// quietly dropped - the same fit answering the same value differently on its second run. That
// is the one thing this may not do (docs/SVG_IMPORT_PLAN.md §6c), so every re-measure rests
// first and the pass is a pure function of the value and the design.
function svgRestAndMeasure() {
  if (typeof svgLayoutRest === 'function') svgLayoutRest();
  measureSvgBudgets();
  measureSvgRoom();
}
function refitSvgText() {
  svgRestAndMeasure();
  fitSvgText();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refitSvgText);
} else {
  refitSvgText();                               // DOM already parsed (e.g. an inline preview build)
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(refitSvgText);
}
// A DESIGN THAT WAS NOT ON SCREEN WHEN IT LOADED FITS WHEN IT ARRIVES. Both passes above run
// once, at load, and a document that is preloaded hidden (a playout renderer, a control page
// whose monitors are behind another workspace) has nothing for them to measure. It stays owed
// rather than wrong (svgFitLaidOut), and this is what pays the debt when no update() ever comes
// to. Guarded on the debt itself, so a hide-and-show cycle on a design that already has its
// answers costs nothing, and the panel growth this fit performs can never re-enter it.
if (typeof ResizeObserver === 'function') {
  var svgFitArt = document.querySelector('.${PREFIX}-art');
  if (svgFitArt) {
    new ResizeObserver(function () {
      if (svgFitDue()) refitSvgText();
    }).observe(svgFitArt);
  }
}`;

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
/**
 * THE RELATIONSHIP TABLE, emitted as data the runtime below loops over (plan §6c).
 *
 * It is DATA, and versioned, because it is a persisted format: the author declares which
 * element grows, which way, how far and what travels with it, and principle 6 applies to
 * anything a saved template carries. Emitted as a HIDDEN model it would be the second scene
 * model the architecture forbids; emitted as a commented literal the code reads - and the code
 * still the truth - it is not. A reader can delete a row and the relationship is gone.
 */
function layoutDataJs(svg: DesignSvg, labelOf: (candidateId: string) => string): string {
  const rules = layoutRules(svg);
  const rows = rules.map((rule, i) => {
    const axis = rule.axis ?? 'x';
    const way = axis === 'x' ? 'wider' : 'taller';
    const followers = rule.followers?.length
      ? `,\n      followers: [${rule.followers
          .map((f: DesignSvgFollower, j: number) => `{ el: '${followToken(i, j)}', mode: '${f.mode ?? 'move'}' }`)
          .join(', ')}]`
      : '';
    const note = rule.followers?.length
      ? `${rule.followers.length} layer(s) travel with it`
      : 'whatever is drawn past its moving edge travels with it';
    return `    // "${labelOf(rule.candidateId)}" grows ${way}; ${note}.
    { el: '${growToken(i)}', axis: '${axis}', safe: ${PANEL_SAFE}${followers} }`;
  });
  return `
// ── Layout relationships (SVG) ────────────────────────────────────────────────
// WHICH ELEMENT MAY GROW, WHICH WAY, HOW FAR, AND WHAT TRAVELS WITH IT.
//
// Nothing here is elastic by default: a graphic with an empty table never moves, which is what
// every board and every scorebug wants. Each row names one element by the data-noacg-el stamp
// it carries in the artwork above, the axis it may grow on, and how close to the frame's edge
// it may get (\`safe\`, a fraction of the frame). A row with its own \`followers\` list moves
// exactly those layers; a row without one falls back to measuring what sits past the growing
// edge, which is a fair guess sideways and a poor one downwards - so a vertical rule is
// normally written with its followers spelled out.
//
// A follower travels by default (\`mode: 'move'\`): it keeps its distance and its size. Write
// \`mode: 'grow'\` instead and the layer is STRETCHED by what the panel gained, which is what a
// rail or a tint band wants. You rarely need to: furniture drawn to the panel's own two edges is
// measured and stretched automatically, and never appears in this list.
//
// Delete a row and that element stops growing. Edit \`axis\` and it grows the other way.
var NOACG_LAYOUT = {
  version: ${LAYOUT_VERSION},
  rules: [
${rows.join(',\n')}
  ]
};
`;
}

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
 *  and its slot are both measured in. */
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
  if ((el.tagName || '').toLowerCase() === 'path') {
    base.d = el.getAttribute('d');
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

/** Grow one element by delta user units along "dir": a rect by arithmetic on its numbers (an
 *  upward grower moves its y as well, since a rect extends from there), a path by shifting the
 *  points on the growing side of its own middle. */
function svgGrowElBy(rule, el, base, dir, delta) {
  // Which of the shape's OWN axes the rule's screen axis is, and which way along it: a plate
  // written as a portrait rect plus a rotation grows on the other one (svgGrowAxis).
  var ax = svgGrowAxis(rule, el);
  if ((el.tagName || '').toLowerCase() === 'path') {
    var bb = el.getBBox();
    var local = ax.attr === 'height' ? 'y' : 'x';
    var split = local === 'y' ? bb.y + bb.height / 2 : bb.x + bb.width / 2;
    // The path's own points move along ITS axis, so the screen direction the rule wants is
    // spent through the sign that axis lands on. Growing from the MIDDLE is the same shift run
    // once each way for half the width: the split is the shape's own middle and a symmetric
    // shift never moves it, so the second pass still finds the same two halves.
    if (dir === 0) {
      var half = svgShiftPathD(base.d, local, split, 1, delta / 2);
      el.setAttribute('d', svgShiftPathD(half, local, split, -1, delta / 2));
      return;
    }
    el.setAttribute('d', svgShiftPathD(base.d, local, split, dir * ax.sign, delta));
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
    return dir < 0
      ? frame.left + Math.max(frame.right - box.right, frame.width * rule.safe)
      : frame.right - Math.max(box.left - frame.left, frame.width * rule.safe);
  }
  return dir < 0
    ? frame.top + Math.max(frame.bottom - box.bottom, frame.height * rule.safe)
    : frame.bottom - Math.max(box.top - frame.top, frame.height * rule.safe);
}

/** How much room the cap still leaves this element, in screen px - never negative.
 *
 *  For a panel widening from its MIDDLE this is the TOTAL width it may gain, half spent on each
 *  side, and the bound is the NEARER of its two margins so the offset the designer drew survives
 *  the growth instead of being flattened onto the frame's centre. */
function svgGrowRoom(rule, el, frame, dir) {
  var box = el.getBoundingClientRect();
  if (dir === 0) {
    var nearer = Math.min(box.left - frame.left, frame.right - box.right);
    return Math.max(0, 2 * (nearer - frame.width * rule.safe));
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
    // ONLY WHAT CAN ACTUALLY BE STRETCHED. A circle, an ellipse and a polygon all span a panel
    // as readily as a rail does and none of them carries the attribute growing writes, so
    // collecting one bought a follower that could not do the thing it was collected for.
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
  var grant = Math.min(need, svgGrowRoom(rule, panel, frame, rest.dir));
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
    // One expression for all six cases, because there is one law: the box's MIDDLE travels by
    // half the grant in the direction of growth, and its RIGHT EDGE is always half a grant
    // further right than the middle. So a middle-anchored line follows the first term and an
    // end-anchored one adds the second - including for a panel growing from its middle, where
    // the centre stays put and each edge moves half.
    var anchoredRight = (svgFitAlign[svgPanelTexts[k].id] || {}).h === 'end';
    svgFitShift[svgPanelTexts[k].id] =
      ((rest.dir * grant) / 2 + (anchoredRight ? grant / 2 : 0)) / scale;
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
  if ((el.tagName || '').toLowerCase() === 'path') return el.getAttribute('d') != null;
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
    var most = svgGrowRoom(rule, el, frame, rest.dir);
    var texts = rest.texts.length ? rest.texts : svgLinesInside(el);
    for (var i = 0; i < texts.length; i++) {
      svgFitExtraH[texts[i].id] = most / svgUserScale(texts[i]);
    }
  }
}

/** HOW MUCH EXTRA HEIGHT EACH LINE OF A PANEL TOOK, top line first, in screen px: how far the
 *  settled block runs past the room the design gave it. Measured in the artwork's own units
 *  through getBBox, which ignores transforms - so an entrance in flight cannot change it. */
function svgBlockExtras(rest) {
  var out = [];
  for (var i = 0; i < rest.texts.length; i++) {
    var t = rest.texts[i];
    var room = svgFitRoom[t.id];
    if (!room || !t.getBBox) { out.push(0); continue; }
    var bottom = t.getBBox().y + t.getBBox().height;
    out.push(Math.max(0, (bottom - (room.top + room.height)) * svgUserScale(t)));
  }
  return out;
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
    var most = svgGrowRoom(rule, el, frame, rest.dir);
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
    var running = 0;
    for (var k = 0; k < rest.texts.length; k++) {
      var idx = rest.dir < 0 ? rest.texts.length - 1 - k : k;
      var line = rest.texts[idx];
      if (rest.dir < 0) running += extras[idx];
      var travel = Math.min(running, most);
      if (!svgFitPlaced(line) && travel > 0) {
        svgTravel(line, 'y', (rest.dir * travel) / svgUserScale(line), rest.textBase[idx].base);
      }
      if (rest.dir > 0) running += extras[idx];
    }
    svgApplyGrowth(rule, el, rest, grant);
  }
}`;
}

/** The shared update()'s optional placed-text hook line (templates/shared/base.ts runtimeJs).
 *  An imported SVG REPLACES it with its own: the ladder below fits the placed lines too, so
 *  this design calls one fit rather than two (plan §6b). Matched by shape, like
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

  const html = documentHtml({
    title: name,
    definitionBlock: definitionScriptBlock(settings, fields),
    body: `  <!-- Imported SVG design - your artwork, exactly as exported. The text layers chosen at
       import carry id="f0", "f1", … and update() writes the operator's values straight into
       them; everything else is untouched. -->
  <div class="${PREFIX}">
    <div class="${PREFIX}-box">
${inlineSvg}${clockHolder}${behaviour ? behaviour.html(artworkFields.length) : ''}
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
` : ''}`;

  const preset = designPreset(o.animation.presetId);
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
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
  const js =
    runtimeJs(name, preset.emit(cfg)).replace(
      PLACED_TEXT_HOOK,
      `${SVG_FIT_HOOK}${behaviour ? `\n${behaviour.updateHook}` : ''}${clockField ? `\n${clockHook}` : ''}`,
    ) +
    SVG_FIT_JS +
    // The relationship TABLE and the runtime that loops it ride together, and only for a design
    // that declares one: a board emits neither and cannot move (plan §6c).
    (layoutRules(svg).length > 0
      ? `\n${layoutDataJs(
          svg,
          // The comment above each rule names the element the way the reader knows it: a bound
          // field by its operator title, anything else (the usual case - a panel rect) by the
          // layer name the designer gave it in their own file.
          (id) =>
            svg.fields.find((f) => f.candidateId === id)?.title ?? candidateLabel(svg, id) ?? 'Layer',
        )}${growthRuntimeJs()}`
      : '') +
    '\n' +
    (clockField ? `\n${clockRuntimeJs(PREFIX, clockField.field)}\n` : '') +
    (behaviour ? `\n${behaviour.js(artworkFields.length)}` : '');

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
    // The countdown's layer is the clock display, not a text field - left out here.
    layers: svg.fields.flatMap((f, i) =>
      i === clock
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
