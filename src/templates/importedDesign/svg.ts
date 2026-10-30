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
import { creditsArtworkFields, creditsIndex, creditsRollCss, creditsRollRuntimeJs, isArtworkCredits } from './creditsRoll';
import { creditsArtworkCss, creditsArtworkRuntimeJs } from './creditsArtwork';
import type { AnimPreset, PresetConfig } from '../lowerThirds/animPresets';
import { DESIGN_PRESETS } from './designPresets';
import { PREFIX } from './shared';
import { bindSvgMarkup, candidateLabel } from './svgBind';
import { svgFontCss } from './svgFonts';
import { LAYOUT_EL_ATTR, layoutDataJs, layoutRules, saidLines } from './svgLayout';
import svgFitSource from './runtime/svgFit.js?raw';
import svgFitBootSource from './runtime/svgFitBoot.js?raw';
import svgGrowthSource from './runtime/svgGrowth.js?raw';
import svgShapeShiftSource from './runtime/svgShapeShift.js?raw';

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
// The runtime is `runtime/svgShapeShift.js`; it fills no value, so the guard is all it meets.
const SHAPE_SHIFT_JS = `\n${fillRuntime(svgShapeShiftSource, {})}`;

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
// The runtime is `runtime/svgGrowth.js`. The string always began with a line break and never
// ended with one; the file ends with one, as a file does, so it comes off here.
const SVG_GROWTH_JS = `\n${fillRuntime(svgGrowthSource, { PREFIX, LAYOUT_EL_ATTR }).replace(/\n$/, '')}`;

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
  const artworkRoll = isArtworkCredits(svg);
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
  const boundSvg = bindSvgMarkup(svg, o.previewMarkers);
  // Indenting every source line would also indent meaningful newlines inside SVG text runs.
  const inlineSvg = artworkRoll ? boundSvg : boundSvg.split('\n').map((line) => `    ${line}`).join('\n');

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
  const artworkCredits = creditsArtworkFields(svg);
  const creditsField = credits === -1 ? null : artworkFields[credits];
  const creditsHolder = artworkRoll
    ? artworkFields.filter((_, i) => artworkCredits.has(i)).map((field) => `\n    <div id="${field.field}" class="${DATA_SOURCE_CLASS}"></div>`).join('')
    : creditsField
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
${artworkRoll ? '    <!-- prettier-ignore -->\n' : ''}${inlineSvg}${clockHolder}${creditsHolder}${behaviour ? behaviour.html(artworkFields.length) : ''}
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
${artworkRoll ? creditsArtworkCss(PREFIX) : creditsRollCss(PREFIX)}
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
        )}${grows ? SVG_GROWTH_JS : ''}`
      : '') +
    '\n' +
    (clockField ? `\n${clockRuntimeJs(PREFIX, clockField.field)}\n` : '') +
    // The point shifters a path panel grows by and a path gauge fills by.
    (grows || behaviour?.fillsGauge ? `\n${SHAPE_SHIFT_JS}` : '') +
    (behaviour ? `\n${behaviour.js(artworkFields.length)}` : '') +
    // AFTER the behaviour's table: the roll engine reads its field ids out of NOACG_BEHAVIOUR the
    // moment it first renders, and in a document whose markup is already parsed that is now.
    (creditsField ? `\n${artworkRoll ? creditsArtworkRuntimeJs(PREFIX, o.resolution.height) : creditsRollRuntimeJs(PREFIX)}` : '') +
    SVG_FIT_BOOT;

  // The design presets know nothing of clocks, so the lifecycle hooks are added to the DATA
  // (the step-calls model, docs/STATE_MACHINE_SCHEMA.md): startClock as the entrance lands,
  // stopClock the moment the exit begins - exactly what the catalog's countdown presets emit.
  const withLifecycleCalls = clockField || artworkRoll
    ? (data: AnimData): AnimData => {
        const steps = data.steps.map((s) => ({ ...s }));
        const enter = steps[0];
        const out = steps[steps.length - 1];
        if (clockField) {
          enter.calls = [...(enter.calls ?? []), { time: enter.duration, call: 'startClock' }];
          out.calls = [...(out.calls ?? []), { time: 0, call: 'stopClock' }];
        }
        if (artworkRoll) {
          out.calls = [...(out.calls ?? []), { time: 0, call: 'stopCreditsRoll' }];
        }
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
      i === clock || i === credits || artworkCredits.has(i)
        ? []
        : [{ id: `f${i}`, type: 'text' as const, label: f.title, fieldId: `f${i}`, text: f.sample, styles: {} }],
    ),
  };

  // Compose the two data refinements: the clock's lifecycle calls, then the behaviour's own extra
  // step (the quiz's Reveal, the vote's Result). Order matters only in that the clock's
  // `stopClock` must stay on the LAST step, and the extra step is spliced in front of it - so
  // the behaviour's refinement runs second.
  const refine =
    withLifecycleCalls || behaviour
      ? (data: AnimData): AnimData => {
          const withCalls = withLifecycleCalls ? withLifecycleCalls(data) : data;
          return behaviour ? behaviour.steps(withCalls) : withCalls;
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
