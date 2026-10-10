// Poll scaffolding — the LIVE VOTE board: a question, the options an audience is voting on,
// the share each one has, and the moment a winner is called. It covers the audience poll, the
// on-stream vote, the referendum call and the election-style result board, because on air those
// are one graphic with different copy.
//
// Polls are DATA-DRIVEN, like tickers and credits: a textarea field (f1) holds the options —
// one "Label | count" per line — and the template's JS renders them. That is what lets the same
// board carry two options or six without a second design, and it is why the bars are MEASURED
// motion (poll/pollMotion.ts): both the widths and the number of bars are the operator's
// content, and no static keyframe can hold either.
//
// Structure contract:
//   <div class="poll">                    root — zone positioned; opacity:0 until play()
//     <div class="poll-box">              the panel; presets tween this
//       <div class="poll-mask"><span id="f0">…</span></div>   the question (mask-up reveal)
//       <div class="poll-cue">…</div>     the VOTE NOW badge — it LEAVES when voting closes
//       <div id="poll-rows"></div>        the option rows, rendered by pollRebuild()
//       <div class="poll-foot"><span id="f2">…</span></div>   the count / "% reporting" line
//     </div>
//     hidden #f1 source SPX writes the options into
//   </div>
//
// One row, as the design's renderPollRow() builds it:
//   <div class="poll-row">
//     <div class="poll-row-top">
//       <span class="poll-row-label">Streaming</span>
//       <span class="poll-row-value" data-target="42.3%">42.3%</span>
//     </div>
//     <div class="poll-bar"><div class="poll-bar-fill" data-value="42.3"></div></div>
//   </div>
//
// THE TWO RULES A DESIGN MUST HONOUR, both enforced by the shared CSS below rather than by
// trust: a fill starts at zero width, and a figure starts invisible. Voting is open when the
// board arrives, and a board that showed the result before the vote closed would be lying.

import type { SpxField, SpxTemplate } from '../../model/types';
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
import { stageFitRuntimeJs } from '../shared/stageFit';
import type { AnimData, AnimStep } from '../../blocks/animData';
import type { PresetConfig } from '../lowerThirds/animPresets';
import { pollPresetById } from './pollPresets';
import { POLL_MOTION_JS } from './pollMotion';
import { resolveTokens, type ThemeTokens, type TokenOverrides } from '../../model/themeTokens';

export interface PollDesign {
  /**
   * THE STAGE WIDTH, in px at 1080p: the room this graphic was drawn for (`stageBoxCss` in
   * shared/base.ts carries the whole contract).
   *
   * With one declared, the panel stops hugging the operator's text and the text lives inside
   * it instead - which is what a BOARD needs, because the same panel is on air with different
   * content all evening and an audience reads a graphic that re-sizes itself as a broken one.
   * The number holds a realistic worst case; shorter content leaves reserved room where the
   * anchor already reads.
   */
  stageWidth?: number;
  /** Inner HTML of .poll — must contain .poll-box with .poll-mask > span#f0, .poll-cue,
   *  #poll-rows and .poll-foot > span#f2. */
  html: string;
  /** Variant CSS (panel, question, badge, rows, bars, footnote). Colors via :root vars only.
   *  MUST style .poll-winner (the called leader) and .poll-tied (nobody leads). */
  css: string;
  /** JS defining renderPollRow(row) — the markup for one option row. `row` carries
   *  `{ label, count, percent, percentText }`; the fill's `data-value` must be `row.percent`
   *  and the figure's `data-target` `row.percentText`, or the growth builder has nothing to
   *  tween to and nothing to restore. */
  rowBuilderJs: string;
  /** Whether the design includes a .poll-accent element. */
  hasAccent: boolean;
  /**
   * Where this design disagrees with its style family's shape tokens
   * (model/themeTokens.ts). Every entry is conformance debt - DESIGN_LANGUAGE §8's rule is
   * "reuse the exact token values, don't improvise new ones per category".
   */
  tokens?: TokenOverrides;
}

export interface PollMeta {
  name: string;
  description: string;
  /** SPX UI color label, "1".."7". */
  uicolor: string;
}

/** The board's starting content. Exported so a design renders the same strings the SPX field
 *  defaults carry — the two can never drift into showing different things before update(). */
export const POLL_CONTENT = {
  question: 'How are you watching tonight?',
  options: 'On the stream | 1840\nOn TV | 1215\nCatching up later | 640',
  footnote: '3,695 votes · voting open',
  cue: 'VOTE NOW',
};

/** The complete field set — four fields, and every board emits exactly these. */
function pollFields(o: ResolvedOptions): SpxField[] {
  return [
    { field: 'f0', ftype: 'textfield', title: o.lines[0]?.title || 'Question', value: o.lines[0]?.sample || POLL_CONTENT.question },
    { field: 'f1', ftype: 'textarea', title: o.lines[1]?.title || 'Options', value: o.lines[1]?.sample || POLL_CONTENT.options },
    { field: 'f2', ftype: 'textfield', title: o.lines[2]?.title || 'Vote count', value: o.lines[2]?.sample || POLL_CONTENT.footnote },
    // The badge's WORDS are operator content, not design furniture: the same board runs a
    // Finnish vote, an SMS poll ("TEXT TO VOTE") and a floor count ("HANDS UP"). Only its
    // LEAVING is choreography — that stays a keyframe on .poll-cue.
    { field: 'f3', ftype: 'textfield', title: o.lines[3]?.title || 'Vote badge', value: o.lines[3]?.sample || POLL_CONTENT.cue },
  ];
}

/**
 * The shared board CSS — the contract half of the look, so a design cannot forget it.
 *
 * A fill at zero width and a figure at zero opacity ARE the "voting open" state: the state
 * timelines grow and fade them in, and `noacgSnap` replays those keyframes, so jumping straight
 * to the result (recovery, a control-page snap, a parked preview) shows the result while the
 * ordinary walk still starts with nothing revealed.
 */
const BOARD_CSS = `/* ── The board contract: voting is OPEN until a state says otherwise. ── */
.poll-bar-fill {
  width: 0;                        /* every bar starts empty — the result step grows it */
  will-change: width;              /* hint the browser: this element's width animates */
}
.poll-row-value {
  opacity: 0;                      /* every figure starts hidden — the result step fades it in */
}
.poll-row {
  will-change: transform, opacity; /* the rows cascade in and the winner pops */
}`;

/**
 * How long the result takes: the bars' growth plus their stagger. It is BOTH the step's
 * authored duration and roughly the builder's own length, so the clip on the timeline is as
 * long as the motion it fires. Speed-relative, like every other time in the data model.
 */
const RESULT_SECONDS = 1.2;

/**
 * The result as a real STEP (Timeline v2), inserted just before Out.
 *
 * Same shape as the quiz's Continue reveal, and for the same reason: the growth is MEASURED
 * motion, which the keyframe model deliberately cannot express, so the legacy region has no
 * shape for it and the importer builds nothing here. Authoring it as data is also what makes
 * SPX's `steps: '2'` DERIVED — board + result + Out is three steps, and the timeline computes
 * the Continue count as steps − 1. Without it the data would say one step and the first
 * timeline edit would rewrite `steps` to '1', after which SPX stops sending Continue and the
 * result never appears.
 *
 * The badge is keyframed OUT here rather than left to the "voting closed" state, so a board
 * driven straight from the entrance to the result by a bare `next()` — the SPX degrade path,
 * with no control page at all — never shows VOTE NOW over a finished chart.
 */
function withResultStep(ease: string) {
  return (data: AnimData): AnimData => {
    const result: AnimStep = {
      name: 'Result',
      duration: RESULT_SECONDS,
      ease,
      // The bars grow to the operator's own shares, and the figures count up with them.
      dynamics: [{ time: 0, build: 'pollBarsGrow', target: '.poll-bar-fill' }],
      layers: {
        // One keyframe at the step's start: the badge is simply gone by the time the result
        // is on screen. Arriving from "voting closed" it is already at zero, so this is a
        // no-op there rather than a flash back to full.
        '.poll-cue': { opacity: [{ time: 0, value: 0 }] },
      },
    };
    const steps = [...data.steps];
    steps.splice(steps.length - 1, 0, result); // before the Out step
    return { ...data, steps };
  };
}

/** The poll runtime: the standard scaffold plus the board's rebuild and reset. */
function pollRuntimeJs(name: string, animationBlock: string): string {
  return `// ${name} — generated by NoaCG Studio. SPX calls update(), play(), stop(), next().

${setFieldValueJs}

// update(data): SPX sends field values as JSON, e.g. {"f0":"…","f1":"On TV | 1215"}.
// The question (f0) and the count line (f2) are written straight into their elements, the
// options (f1) into the hidden source — then the rows re-render.
//
// Re-typing the counts while the result is ON AIR moves the bars rather than blanking them
// (pollRebuild puts the board back the way it was), which is what a live vote actually does.
// Data still changes no STATE: showing the figures and calling a winner remain events.
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (el) setFieldValue(el, fields[key]);
  }
  pollRebuild();
  // Designs on a stage hold their lines to the rows they were drawn for (no-op otherwise).
  if (typeof fitStagedText === 'function') fitStagedText();
}

// play(): take the board on air with voting OPEN — no figures, no bars, no winner.
function play() {
  gsap.killTweensOf('*');          // stop any animation that is still running
  pollResetBoard();                // a replay never starts on the previous poll's result
  pollRebuild();                   // fresh rows and fresh shares
  buildInTimeline();
}

// stop(): take the board off air — run the exit timeline.
function stop() {
  gsap.killTweensOf('*');
  buildOutTimeline();
}

// next(): SPX Continue — advance one step along the default path. Step 2 is the result: the
// animation data below fires the bar growth on it, so a poll dropped into a playout server
// with no control page still degrades to "show the question, show the result, take it off".
function next() {
  return (typeof revealNextStep === 'function') ? revealNextStep() : null;
}

// Render once on load so the preview shows the options before the first update().
// This file loads in <head>, before the board exists — wait for the DOM.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pollRebuild);
} else {
  pollRebuild();                   // DOM already parsed (e.g. an inline preview build)
}

${animationBlock}
`;
}

/** Build the complete poll SpxTemplate. */
export function assemblePoll(
  meta: PollMeta,
  design: PollDesign,
  o: ResolvedOptions,
  /** Refine the converted animation data — the seam a graphic TYPE injects its machine
   *  through (see shared/standard.ts composeRefine for the ordering rule). */
  refine?: (data: AnimData) => AnimData,
  /** The design's resolved SHAPE tokens (model/themeTokens.ts), resolved by the caller. */
  tokens?: ThemeTokens,
): SpxTemplate {
  const font = resolveHeadingFont(o); // imported font wins over the bundled set
  const scale = computeScale(o);
  // A question over labelled bars needs measure: wider than a strap, narrower than a full card.
  const maxTextWidth = Math.round(o.resolution.width * 0.46);
  const fields = pollFields(o);
  const optionsText = fields[1].value;

  // steps '2': phase 1 = the board with voting open, phase 2 (Continue) = the result.
  const settings = baseSettings(meta, o, { steps: '2' });

  const html = documentHtml({
    title: meta.name,
    definitionBlock: definitionScriptBlock(settings, fields),
    body: `  <!-- Poll root — the question, the vote badge, the option rows, and the count line. -->
  <div class="poll">
${design.html}
    <!-- Hidden options source — SPX writes field f1 here; pollRebuild() renders it as rows.
         One option per line, written "Label | count". -->
    <div id="f1" class="${DATA_SOURCE_CLASS}">${optionsText}</div>
  </div>`,
  });

  const css = `/* ${meta.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, font.stack, scale, { tokens, consumerCss: design.css })}

${font.face}

${resetCanvasCss(o.resolution)}

/* ── Root position (anchor zone) ── */
.poll {
  position: absolute;
${zoneCssText(o.zone, o.nudge, o.resolution)}
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── Auto-fit: the panel hugs its content and wraps instead of overflowing. ── */
.poll-box {
${
    design.stageWidth
      ? stageBoxCss(o.resolution, design.stageWidth, o.zone, 'the room this poll was drawn for')
      : "  width: fit-content;              /* the panel hugs the question and the bars */"
  }
  max-width: ${maxTextWidthCss(o.resolution, maxTextWidth)};  /* the wrap cap — follows --scale, stops at the safe area */
  will-change: transform, opacity; /* hint the browser: this element animates */
}
.poll-mask {
  overflow: hidden;                /* the question animates in from behind this mask */
}
.poll-mask > span {
  display: inline-block;           /* so the question can move inside its mask */
  overflow-wrap: break-word;       /* break very long unbroken words */
  text-wrap: balance;              /* wrapped rows get even lengths */
}

${BOARD_CSS}

${dataSourceCss}

/* ── Design ── */
${design.css}
`;

  const preset = pollPresetById(o.animation.presetId);
  // 'auto' uses the preset's hand-tuned ease pair; a named easing preset overrides both phases.
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  const cfg: PresetConfig = {
    prefix: 'poll',
    lineCount: 3, // f0 question · f1 options source · f2 count line
    hasAccent: design.hasAccent,
    steps: false, // the one Continue is the result step, not a line reveal
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  const js = pollRuntimeJs(meta.name, `${design.rowBuilderJs}

${POLL_MOTION_JS}

${preset.emit(cfg)}`);
  const jsWithStage = design.stageWidth
    ? `${js}

${stageFitRuntimeJs('poll')}`
    : js;

  const template: SpxTemplate = {
    name: meta.name,
    type: 'poll',
    resolution: o.resolution,
    fps: o.fps,
    html,
    css,
    js: jsWithStage,
    fields,
    settings,
    assets: [...o.importedImages, ...(o.customFont ? [o.customFont.asset] : [])],
    layers: [
      { id: 'f0', type: 'text' as const, label: fields[0].title, fieldId: 'f0', text: fields[0].value, styles: {} },
      { id: 'f2', type: 'text' as const, label: fields[2].title, fieldId: 'f2', text: fields[2].value, styles: {} },
    ],
  };

  // Timeline v2: the preset's region becomes the NOACG_ANIM data block. The row cascade rides
  // across as a `dynamics` segment naming its builder, and the operator's Continue becomes a
  // real middle step (the result) on top of it.
  // The result step must be inserted BEFORE a machine compiles, because the machine derives its
  // default path from the final step list (shared/standard.ts composeRefine).
  return convertToDataRegion(template, composeRefine(withResultStep(ease.easeIn), refine));
}

/** The authoring API for poll variant modules. */
export function definePollVariant(
  spec: Omit<TemplateVariant, 'create'>,
  meta: PollMeta,
  buildDesign: (o: ResolvedOptions) => PollDesign,
  /** Optional animation-data refinement (a graphic type's machine rides in here). It is
   *  built per create() because a type's compiled machine depends on the resolved options. */
  refine?: (o: ResolvedOptions) => ((data: AnimData) => AnimData) | undefined,
): TemplateVariant {
  const variant: TemplateVariant = {
    ...spec,
    create(options?: WizardOptions) {
      const o = resolveOptions(variant, options);
      const design = buildDesign(o);
      // The family lives on the variant, the overrides on the design — resolved here
      // because this is the only place that holds both.
      const tokens = resolveTokens(spec.styleTag, design.tokens);
      return assemblePoll(meta, design, o, refine?.(o), tokens);
    },
  };
  return variant;
}
