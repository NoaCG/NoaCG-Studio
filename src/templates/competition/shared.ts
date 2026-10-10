// The COMPETITION PACK's assembler — one scaffold behind four categories
// (docs/COMPETITION_PACK.md):
//
//   esports-score   the series scorebug and the map / round / game indicator
//   matchup         the match-up card with a winner pick, the head-to-head, the player card
//   results-board   rosters and lineups, standings and leaderboards, result tables, brackets
//   reveal          nominees and winners, correct / incorrect verdicts, award and launch cards
//
// They share one assembler because they share one problem: the operator's DATA decides what
// the graphic says (which team leads, which nominee wins, how many rows there are), and the
// MACHINE decides what it is doing (pre-match, live, final; neutral, selected, locked). Neither
// is a per-category concern, so neither is a per-category scaffold. Only the class prefix, the
// SpxTemplate type and the geometry (a strip hugs its content, a reveal covers the frame)
// differ — that is `CompCategorySpec`.
//
// Structure contract — deliberately small, because the prefix-parameterized preset bank
// (compPresets.ts) tweens exactly these and nothing else:
//
//   <div class="<prefix>">                 root — zone positioned; opacity:0 until play()
//     <div class="<prefix>-box">           the panel / stage; presets move this first
//       [<div class="<prefix>-accent">]    the one accent flourish (optional)
//       <div class="<prefix>-head">        the top block: kicker, title, team names
//       <div class="<prefix>-body">        the content: rows, sides, the subject of a reveal
//     </div>
//     …hidden #fN data sources (a rows textarea, a winner pick)…
//   </div>
//
// Like infographics, the DESIGN owns its SPX fields and may ship runtime JS: a results board
// rebuilds its rows from a textarea, a match-up paints the picked winner. That runtime is
// emitted OUTSIDE the marked ANIMATION region (the clock precedent), so the Motion panel can
// never rewrite it and it survives every export untouched.
//
// The MACHINE seam is `refine`, exactly as in versus and quiz: a graphic type compiles its
// groups and branches and they ride into the converted animation data. Designs whose Continue
// press fires a runtime call (a nominee reveal) author that as a real middle STEP through
// `revealSteps` — the quiz precedent, and what keeps SPX's `steps` count DERIVED.

import type { SpxField, SpxTemplate, TemplateType } from '../../model/types';
import { definitionScriptBlock } from '../../model/spxDefinition';
import { resolveEasing } from '../../model/easings';
import {
  resolveOptions,
  type ResolvedOptions,
  type TemplateVariant,
  type WizardOptions,
} from '../../model/wizard';
import {
  baseSettings,
  computeScale,
  DATA_SOURCE_CLASS,
  dataSourceCss,
  documentHtml,
  maxTextWidthCss,
  stageBoxCss,
  resetCanvasCss,
  resolveHeadingFont,
  rootVarsCss,
  setFieldValueJs,
  zoneCssText,
} from '../shared/base';
import { composeRefine, convertToDataRegion } from '../shared/standard';
import { stageExtraJs } from '../shared/stageFit';
import type { AnimData, AnimStep } from '../../blocks/animData';
import type { PresetConfig } from '../lowerThirds/animPresets';
import { typeFieldsToSpx, type TypeField } from '../types/graphicType';
import { compPresetById } from './compPresets';
import { COMP_MOTION_JS } from './compMotion';
import { resolveTokens, type ThemeTokens, type TokenOverrides } from '../../model/themeTokens';

/** One competition category: the prefix, the SpxTemplate type, and the geometry. */
export interface CompCategorySpec {
  /** SpxTemplate.type — also what presetRegistry keys the competition preset bank on. */
  type: TemplateType;
  /** The structure contract's class prefix ('esports-score', 'reveal', …). */
  prefix: string;
  /** The one-line body comment above the root element. */
  rootComment: string;
  /**
   * Full-frame graphics (match-ups, reveals) cover the frame edge to edge; strips and boards
   * hug their content and wrap inside the auto-fit cap below.
   */
  fullFrame?: boolean;
  /** The auto-fit width cap for a content-hugging category, as a fraction of the frame. */
  widthFraction?: number;
}

/**
 * A middle STEP: one Continue press that fires a named runtime call (the quiz precedent).
 *
 * The reveal of a nominee or a result is chosen by the operator at play time — which name
 * lights up is field data — so it has no fixed target and no static keyframe can describe it.
 * It is honestly code-owned motion, so the data NAMES the function and the logic stays
 * readable JS outside the marked region. Authoring it as a real step is also what keeps SPX's
 * `steps` count DERIVED: without it the data would say one step and the first timeline edit
 * would rewrite `steps` to '1', after which SPX stops sending Continue at all.
 */
export interface CompStep {
  /** The step's name on the timeline ('Reveal', 'Result'). */
  name: string;
  /** The runtime function it calls. Must exist in the design's `runtimeExtraJs`. */
  call: string;
  /** Speed-relative seconds — as long as the motion the call fires. Default 0.45. */
  duration?: number;
}

export interface CompDesign {
  /** Inner HTML of the .<prefix> root — must carry .<prefix>-box > .<prefix>-head + -body. */
  html: string;
  /** Variant CSS. Colors via the :root vars, sizes via calc(Npx * var(--scale)). */
  css: string;
  /** The design's own SPX fields — the competition categories don't use the line editor. */
  fields: SpxField[];
  /** Whether the design carries a .<prefix>-accent element (presets animate it when it does). */
  hasAccent: boolean;
  /**
   * THE STAGE WIDTH, in px at 1080p: the room this board was drawn for (`stageBoxCss` in
   * shared/base.ts carries the whole contract).
   *
   * Every category on this assembler is a BOARD - a standings table, a head-to-head, a
   * nominee list, a series scorebug - and a board is on air with different content all
   * evening. Hugging makes it re-size itself between one competitor and the next. The
   * declared width holds a realistic worst case; short content leaves reserved room where the
   * anchor already reads.
   */
  stageWidth?: number;
  /**
   * Runtime JS the design owns: row rebuilds, the winner paint, the phase marks. Emitted
   * BEFORE the marked ANIMATION region, so the Motion panel never rewrites it. Any load-time
   * DOM work must use the DOM-ready guard (template.js loads in <head> when exported).
   */
  runtimeExtraJs?: string;
  /** Middle steps, in order, inserted before the Out step (see CompStep). */
  revealSteps?: CompStep[];
  /**
   * Where this design disagrees with its style family's shape tokens (model/themeTokens.ts).
   * Every entry is conformance debt — DESIGN_LANGUAGE §8's rule is "reuse the exact token
   * values, don't improvise new ones per category".
   */
  tokens?: TokenOverrides;
}

export interface CompMeta {
  name: string;
  description: string;
  /** SPX UI color label, "1".."7". */
  uicolor: string;
}

const DEFAULT_STEP_SECONDS = 0.45;

/** Insert the design's middle steps just before Out (the quiz's withRevealStep, generalized). */
function withRevealSteps(steps: CompStep[], ease: string) {
  return (data: AnimData): AnimData => {
    const authored: AnimStep[] = steps.map((step) => ({
      name: step.name,
      duration: step.duration ?? DEFAULT_STEP_SECONDS,
      ease,
      calls: [{ time: 0, call: step.call }],
      layers: {},
    }));
    const next = [...data.steps];
    next.splice(next.length - 1, 0, ...authored); // before the Out step
    return { ...data, steps: next };
  };
}

/** The competition runtime: the SPX entry points plus the pack's two optional design hooks. */
function compRuntimeJs(name: string, extraJs: string, animationBlock: string): string {
  return `// ${name} — generated by NoaCG Studio. SPX calls update(), play(), stop(), next().

${setFieldValueJs}

${COMP_MOTION_JS}

${extraJs}

// update(data): SPX sends field values as JSON, e.g. {"f0":"TEAM LIQUID","f1":"2"}.
// Each value is written into the element whose id matches the field name (f0 -> id="f0").
// A design that renders rows from a source field defines compRebuild(); one that repaints a
// mark from the data (a picked winner, a verdict) defines compRepaint(). Neither is assumed —
// each is called only when the design actually has one.
//
// Data NEVER moves the graphic's state (docs/STATE_MACHINE_SCHEMA.md §3): this repaints what
// is on air and returns. State changes come from events alone.
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (el) setFieldValue(el, fields[key]);
  }
  if (typeof compRebuild === 'function') compRebuild();
  if (typeof compRepaint === 'function') compRepaint();
  // Designs on a stage hold their lines to the rows they were drawn for (no-op otherwise).
  if (typeof fitStagedText === 'function') fitStagedText();
}

// The timeline currently on air. play()/stop() kill it before starting a new one —
// gsap.killTweensOf('*') only matches DOM elements, so it would MISS tweens that target
// plain objects, and an interrupted replay would leave the old one running.
var activeTl = null;

// play(): take the graphic on air. A replay is a full reuse: the visual marks a previous
// run left behind (a lit winner, a "FINAL" flag) are cleared first, then the rows are
// rebuilt from the current data, then the entrance runs. Resetting the LOOK is one
// operation and resetting the DATA is another — this is the first, never both.
function play() {
  if (activeTl) activeTl.kill();
  gsap.killTweensOf('*');
  if (typeof compClearMarks === 'function') compClearMarks();
  if (typeof compRebuild === 'function') compRebuild();
  if (typeof compRepaint === 'function') compRepaint();
  activeTl = buildInTimeline();
  return activeTl;
}

// stop(): take the graphic off air — run the exit timeline.
function stop() {
  if (activeTl) activeTl.kill();
  gsap.killTweensOf('*');
  activeTl = buildOutTimeline();
  return activeTl;
}

// next(): SPX Continue — advance one step along the default path. Returns the timeline it
// started, or null when there is nothing to advance to (a single-step graphic, or a state
// machine that refused the move) — a playout wrapper must not move its own step pointer
// past a refusal.
function next() {
  return (typeof revealNextStep === 'function') ? revealNextStep() : null;
}

${animationBlock}
`;
}

/** Build the complete competition SpxTemplate. */
export function assembleCompetition(
  cat: CompCategorySpec,
  meta: CompMeta,
  design: CompDesign,
  o: ResolvedOptions,
  /** Refine the converted animation data — the seam a graphic TYPE injects its machine
   *  through (see shared/standard.ts composeRefine for the ordering rule). */
  refine?: (data: AnimData) => AnimData,
  /** The design's resolved SHAPE tokens (model/themeTokens.ts), resolved by the caller: the
   *  family lives on the VARIANT (styleTag) and this function only sees the design. */
  tokens?: ThemeTokens,
): SpxTemplate {
  const font = resolveHeadingFont(o); // imported font wins over the bundled set
  const scale = computeScale(o);
  const settings = baseSettings(meta, o, { steps: '1' }); // the real count is derived below

  const html = documentHtml({
    title: meta.name,
    definitionBlock: definitionScriptBlock(settings, design.fields),
    body: `  <!-- ${cat.rootComment} -->
  <div class="${cat.prefix}">
${design.html}
  </div>`,
  });

  const geometry = cat.fullFrame
    ? `/* ── Root position — this graphic covers the whole frame. ── */
.${cat.prefix} {
  position: absolute;
${zoneCssText('mid-center', { x: 0, y: 0 }, o.resolution)}
  width: ${o.resolution.width}px;   /* edge to edge… */
  height: ${o.resolution.height}px;  /* …both ways */
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── The stage every layer is placed on. ── */
.${cat.prefix}-box {
  position: relative;              /* the placement context for the design's layers */
  width: 100%;                     /* fills the frame… */
  height: 100%;                    /* …both ways */
  display: flex;                   /* head above body… */
  flex-direction: column;          /* …stacked as one column */
  align-items: center;             /* centered on the frame's axis */
  justify-content: center;         /* and on its middle line */
  overflow: hidden;                /* nothing paints outside the frame */
  will-change: transform, opacity; /* hint the browser: this element animates */
}`
    : `/* ── Root position (anchor zone). ── */
.${cat.prefix} {
  position: absolute;
${zoneCssText(o.zone, o.nudge, o.resolution)}
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── ${design.stageWidth ? 'The stage: the board keeps its own width and the content fits inside it.' : 'Auto-fit: the panel hugs its content and wraps instead of overflowing.'} ── */
.${cat.prefix}-box {
  position: relative;              /* anchors the accent and any absolute chrome */
${
    design.stageWidth
      ? stageBoxCss(o.resolution, design.stageWidth, o.zone, 'the room this board was drawn for')
      : '  width: fit-content;              /* the panel hugs what the design puts in it */'
  }
  max-width: ${maxTextWidthCss(o.resolution, Math.round(o.resolution.width * (cat.widthFraction ?? 0.5)))};  /* the wrap cap — follows --scale, stops at the safe area */
  will-change: transform, opacity; /* hint the browser: this element animates */
}`;

  const css = `/* ${meta.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, font.stack, scale, { tokens, consumerCss: design.css })}

${font.face}

${resetCanvasCss(o.resolution)}

${dataSourceCss}

${geometry}

/* ── Text masks: a line can slide in from behind its own edge. ── */
.${cat.prefix}-mask {
  overflow: hidden;                /* the line reveals from behind this edge */
}
.${cat.prefix}-mask > span {
  display: inline-block;           /* so the line can move inside its mask */
  overflow-wrap: break-word;       /* break very long unbroken names */
}

/* ── Design ── */
${design.css}
`;

  const preset = compPresetById(o.animation.presetId);
  // 'auto' uses the preset's hand-tuned ease pair; a named easing preset overrides both phases.
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  const lines = visibleTextFields(design);
  const cfg: PresetConfig = {
    prefix: cat.prefix,
    lineCount: lines.length,
    hasAccent: design.hasAccent,
    steps: false, // the pack's presses are authored middle steps, never line reveals
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  const js = compRuntimeJs(meta.name, stageExtraJs(design.stageWidth || cat.fullFrame, cat.prefix, design.runtimeExtraJs), preset.emit(cfg));

  // Timeline v2: the pack creates as animation data blocks. Only the marked region converts —
  // the design's runtime around it stays byte-identical.
  return convertToDataRegion(
    {
      name: meta.name,
      type: cat.type,
      resolution: o.resolution,
      fps: o.fps,
      html,
      css,
      js,
      fields: design.fields,
      settings,
      assets: [...o.importedImages, ...(o.customFont ? [o.customFont.asset] : [])],
      layers: lines.map((f) => ({
        id: f.field,
        type: 'text' as const,
        label: f.title,
        fieldId: f.field,
        text: f.value,
        styles: {},
      })),
    },
    // Ordering: the design's own steps are authored FIRST, so a type's machine compiles
    // against the final step list (its default path has to be the walk the graphic really has).
    composeRefine(
      design.revealSteps?.length ? withRevealSteps(design.revealSteps, ease.easeIn) : undefined,
      refine,
    ),
  );
}

/** The authoring API for competition variant modules. */
export function defineCompetitionVariant(
  cat: CompCategorySpec,
  spec: Omit<TemplateVariant, 'create'>,
  meta: CompMeta,
  buildDesign: (o: ResolvedOptions) => CompDesign,
  /** Optional animation-data refinement (a graphic type's machine rides in here). Built per
   *  create() because a compiled machine depends on the resolved options. */
  refine?: (o: ResolvedOptions) => ((data: AnimData) => AnimData) | undefined,
): TemplateVariant {
  const variant: TemplateVariant = {
    ...spec,
    create(options?: WizardOptions) {
      const o = resolveOptions(variant, options);
      const design = buildDesign(o);
      // The family lives on the variant, the overrides on the design — resolved here because
      // this is the only place that holds both.
      const tokens = resolveTokens(spec.styleTag, design.tokens);
      return assembleCompetition(cat, meta, design, o, refine?.(o), tokens);
    },
  };
  return variant;
}

/**
 * The design's SPX fields, compiled from its TYPE's declaration with the wizard's line edits
 * folded in.
 *
 * A competition design owns its fields (the shapes are fixed — two teams and two scores, a
 * rows source, a winner pick — so there is no free line editor), but the operator-facing
 * TITLES and starting values of the visible lines are still theirs to change in the wizard's
 * Fields step. Compiling them here is what keeps that step honest: the ids stay exactly what
 * `typeFieldsToSpx` assigned, and only the label and sample of a `line` field move.
 */
/**
 * The design's fields that are WORDS ON SCREEN — what the presets count and what the block
 * tools list as text layers.
 *
 * Two things this is careful about, both learned by getting them wrong. A `number` field is a
 * visible line like any other: a series score is drawn in a mask beside the team name, and
 * filtering on `textfield` alone dropped it from the layer list the moment it stopped being
 * typed as text. And a field whose element is a `.noacg-data-source` holder is NOT on screen
 * at all — the phase words, the map index, the highlighted row — so listing those as text
 * layers offered the block tools an element nobody can see.
 */
export function visibleTextFields(design: CompDesign): SpxField[] {
  const hidden = new RegExp(`id="(f\\d+)"[^>]*class="[^"]*\\b${DATA_SOURCE_CLASS}\\b`, 'g');
  const holders = new Set([...design.html.matchAll(hidden)].map((m) => m[1]));
  return design.fields.filter(
    (f) => (f.ftype === 'textfield' || f.ftype === 'number') && !holders.has(f.field),
  );
}

export function compFieldsFor(typeFields: TypeField[], o: ResolvedOptions): SpxField[] {
  const fields = typeFieldsToSpx(typeFields);
  let lineIndex = 0;
  return fields.map((field, i) => {
    if (typeFields[i].role !== 'line') return field;
    const edit = o.lines[lineIndex++];
    return edit ? { ...field, title: edit.title || field.title, value: edit.sample } : field;
  });
}

/**
 * A hidden source element: SPX writes a field into it and the runtime reads it back.
 *
 * (Image slots follow the same "start hidden" rule, inline in each category's markup: an
 * `<img>` with no file picked is the normal state before a show, and `setFieldValue` reveals
 * it the moment a path arrives — so a design's placeholder styling is right from first paint
 * rather than only after the first update().)
 */
export function hiddenSource(id: string, value: string, comment: string): string {
  return `    <!-- ${comment} -->\n    <div id="${id}" class="${DATA_SOURCE_CLASS}">${value}</div>`;
}

/** The escapeHtml helper every rebuild runtime needs (rows are built with innerHTML).
 *  Defined once in shared/base.ts — re-exported here because the pack's four category files
 *  compose their runtimes out of this module. */
export { ESCAPE_HTML_JS } from '../shared/base';

/** The DOM-ready guard every load-time rebuild needs (template.js loads in <head>). */
export const READY_GUARD_JS = `// Render once on load so the preview shows the graphic before the first update().
// This file loads in <head>, before the elements exist — wait for the DOM.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', compBoot);
} else {
  compBoot();                      // DOM already parsed (e.g. an inline preview build)
}

// compBoot(): the design's own first paint — rows rendered, marks applied.
function compBoot() {
  if (typeof compRebuild === 'function') compRebuild();
  if (typeof compRepaint === 'function') compRepaint();
}`;

/** Widths a content-hugging competition category uses, so the four read as one system. */
export const COMP_WIDTH: Record<'strip' | 'panel' | 'board', number> = {
  strip: 0.46,
  panel: 0.5,
  board: 0.56,
};

