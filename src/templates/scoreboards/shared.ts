// Scoreboard scaffolding. A scoreboard carries four FIXED data fields by default (they never
// come from o.lines — the wizard's line editor doesn't apply here):
//   f0 "Team A" (name) · f1 "Score A" · f2 "Team B" (name) · f3 "Score B"
//
// A design may OWN its fields instead (SbDesign.fields), which is what the sports pack's
// bigger boards do: a match board adds a clock, a period, two logos and two team colours, and
// a match-event card is not a two-team graphic at all. They are all still scoreboards — a
// strip that says where the match stands — so they share this assembler, its score-pop and
// its match clock rather than growing a parallel one. The four-field contract stays the
// default, so every board written before the sports pack emits exactly what it always did.
//
// Structure contract (mirrors the standard .lower-third contract so the six standard lowerThirds
// animation presets work unchanged with prefix 'scoreboard' and lineCount 4):
//   <div class="scoreboard">                 root — zone positioned; opacity:0 until play()
//     <div class="scoreboard-box">           the panel; presets tween this
//       team group A:
//         <div class="scoreboard-mask"><span id="f0" class="scoreboard-team">HOME</span></div>
//         <div class="scoreboard-mask"><span id="f1" class="scoreboard-score">0</span></div>
//       …divider of the design's choice…
//       team group B:
//         <div class="scoreboard-mask"><span id="f2" class="scoreboard-team">AWAY</span></div>
//         <div class="scoreboard-mask"><span id="f3" class="scoreboard-score">0</span></div>
//     </div>
//   </div>
//
// The runtime adds a score-pop: while the graphic is on air, a score value (f1/f3) that
// actually changes scales up briefly and springs back — the classic broadcast score bump.

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
  resetCanvasCss,
  resolveHeadingFont,
  rootVarsCss,
  setFieldValueJs,
  stageBoxCss,
  zoneCssText,
} from '../shared/base';
import { presetById, type PresetConfig } from '../lowerThirds/animPresets';
import { matchClockJs } from '../shared/matchClock';
import type { AnimData } from '../../blocks/animData';
import { convertToDataRegion } from '../shared/standard';
import { stageExtraJs } from '../shared/stageFit';
import { resolveTokens, type ThemeTokens, type TokenOverrides } from '../../model/themeTokens';

export interface SbDesign {
  /** Inner HTML of .scoreboard — must contain .scoreboard-box with the four .scoreboard-mask > span#fN lines. */
  html: string;
  /** Variant CSS (panel, team names, scores, divider). Colors via :root vars only. */
  css: string;
  /** Whether the design includes a .scoreboard-accent element (line-reveal draws it first). */
  hasAccent: boolean;
  /**
   * The design's own SPX fields, when four is not the shape of the graphic. Absent = the fixed
   * four-field contract below, which is what every scorebug built before the sports pack used.
   *
   * A scorebug is four fields; a match board carries a clock, a period, two logos and two team
   * colours as well, and a match-event card is not a two-team graphic at all. The SCOREBOARD is
   * still what all of them ARE — a strip that says where the match stands — so they share this
   * assembler and its score-pop rather than growing a parallel one, exactly as the infographic
   * category already lets its designs own their fields.
   */
  fields?: SpxField[];
  /**
   * Field ids whose value POPS when it changes on air. Absent = the fixed contract's two
   * scores. A design with sets and games pops both; a match-event card pops nothing.
   */
  popFields?: string[];
  /** How many masked lines the animation presets choreograph. Absent = the fixed contract's 4. */
  lineCount?: number;
  /**
   * THE STAGE WIDTH, in px at 1080p: the room this scorebug was drawn for.
   *
   * A scorebug is the category where a hugging panel fails worst, because the operator does not
   * even have to do anything for it to move — `update()` writes team names and scores while the
   * graphic is ON AIR, so the bar physically re-sizes itself when a substitute with a longer
   * name comes on. Measured 2026-08-20 (`scripts/footprint-stability-sweep.mjs`): 23 of 25
   * designs move and 18 of them move the drawn panel itself, sb03 by 86% (505 -> 940px).
   *
   * The declared number is what the design settles at with its own sample content, so the look
   * at design content is unchanged and only the movement around it goes away. Omit it and the
   * panel keeps hugging, which is the pre-2026-08-20 behaviour and still right for a design
   * whose whole idea is a chip cut to its label.
   */
  stageWidth?: number;
  /**
   * Extra design-owned runtime JS — a rows rebuild, a design's own painter — emitted OUTSIDE
   * the marked ANIMATION region, before it, so the timeline can never rewrite it. Same seam
   * (and same rule) as the infographic category's `runtimeExtraJs`.
   */
  runtimeExtraJs?: string;
  /**
   * Whether this board carries the shared MATCH CLOCK (shared/matchClock.ts). Absent = yes,
   * which is what every board written before this flag emitted.
   *
   * The match clock is ONE clock: `matchClockEl()` finds a single `.scoreboard-clock`. A board
   * that runs a DIFFERENT number of clocks — the debate floor's two, alternating — brings its
   * own engine in `runtimeExtraJs`, and shipping the shared one beside it would put ~250 lines
   * of runtime into the export that can never find an element to paint. That is the same
   * complaint the holding screens already answer for their own clock ("a clock-less screen must
   * not carry a clock repaint in update() — dead code that reads as though it works"), and the
   * house rule it answers to is that generated code is READ and edited by the user.
   *
   * `update()` calls `matchClockUpdate` through a `typeof` guard, so opting out costs the
   * runtime nothing else.
   */
  matchClock?: boolean;
  /**
   * Where this design disagrees with its style family's shape tokens
   * (model/themeTokens.ts). Every entry is conformance debt - DESIGN_LANGUAGE §8's rule is
   * "reuse the exact token values, don't improvise new ones per category".
   */
  tokens?: TokenOverrides;
}

export interface SbMeta {
  name: string;
  description: string;
  /** SPX UI color label, "1".."7". */
  uicolor: string;
}

/** The four fixed scoreboard fields — every variant emits exactly these.
 *  The scores are `number` so every control surface gives them +/− steppers: a score is bumped
 *  far more often than it is typed, and adding a goal should be one press. See the field-kind
 *  note on the scorebug contract in scorebugShared.ts for what that costs. */
const SB_FIELDS: SpxField[] = [
  { field: 'f0', ftype: 'textfield', title: 'Team A', value: 'HOME' },
  { field: 'f1', ftype: 'number', title: 'Score A', value: '0' },
  { field: 'f2', ftype: 'textfield', title: 'Team B', value: 'AWAY' },
  { field: 'f3', ftype: 'number', title: 'Score B', value: '0' },
];

/** The scoreboard runtime: the standard scaffold plus an on-air score-pop in update(). */
function sbRuntimeJs(name: string, animationBlock: string, popFields: string[], extraJs: string, matchClock: boolean): string {
  return `// ${name} — generated by NoaCG Studio. SPX calls update(), play(), stop(), next().

var onAir = false;               // true between play() and stop() — pops only happen on air
var scoreIds = [${popFields.map((f) => `'${f}'`).join(', ')}];     // the fields that pop when they change on air

// motionSpeed(): the template's speed knob. The NOACG_ANIM data block owns it; a legacy
// animSpeed variable is honored too, and hand-written animation code defaults to 1.
function motionSpeed() {
  if (typeof NOACG_ANIM !== 'undefined' && NOACG_ANIM.speed) return NOACG_ANIM.speed;
  if (typeof animSpeed !== 'undefined' && animSpeed) return animSpeed;
  return 1;
}

${setFieldValueJs}

// update(data): SPX sends field values as JSON, e.g. {"f0":"HOME","f1":"2"}.
// Each value is written into the element whose id matches the field name (f0 -> id="f0").
// A score that CHANGES while on air gets a pop: scale up, then spring back down.
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (!el) continue;
    var changed = el.textContent !== String(fields[key]);  // textContent: exactly what the operator typed
    setFieldValue(el, fields[key]);
    // A CHANGED value in the CLOCK element is a correction to the running clock, not just
    // text — re-seed the tick from it, or the next second would overwrite the fix. An
    // UNCHANGED one is the wire resending the cue's whole value set (a score bump), and
    // matchClockUpdate repaints the ticked time over what setFieldValue just wrote above.
    if (typeof matchClockUpdate === 'function') matchClockUpdate(key, fields[key]);
    // A board that runs CLOCKS OF ITS OWN (the debate floor's two) adopts the wire's value on
    // the same beat and by the same rule: a stamped value says a clock is running and when it
    // read that time, a plain one is a held time or the chair's correction, and a resend of the
    // cue's own text is neither. Guarded, so every other board emits nothing extra.
    if (typeof speakingClockUpdate === 'function') speakingClockUpdate(key, fields[key]);
    if (changed && onAir && scoreIds.indexOf(key) !== -1) {
      // Pop the MASK (the span's parent), not the span: the span is clipped by the mask's
      // overflow:hidden, so scaling it would chop the outer digits of a two-digit score.
      // Scaling the mask scales its clip region together with the digits — nothing is cut.
      // No preset ever tweens a mask, so the pop can't collide with an entrance or exit.
      gsap.fromTo(el.parentNode,
        { scale: 1.35 },
        { scale: 1, duration: 0.4 / motionSpeed(), ease: 'back.out(1.7)' }
      );
    }
  }
  // Row-based boards (a period breakdown, a set-by-set line) re-render from their hidden
  // source; a plain scorebug defines no rebuild, so it is only called when it exists.
  if (typeof rebuildScoreboard === 'function') rebuildScoreboard();
  paintMatchState();
  // Designs on a stage hold their lines to the rows they were drawn for (no-op otherwise).
  if (typeof fitStagedText === 'function') fitStagedText();
}

// paintMatchState(): make the board's LOOK agree with the machine's state.
//
// The interval and full-time treatments are CLASSES on the root, and a class is the one thing
// a visual reset does not touch: noacgResetGraphic clears inline props, and noacgSnap replays
// states with callbacks suppressed AND skips any group already at its initial - so the call
// that would have removed the class never runs. Left alone, a board recovered mid-match comes
// back still wearing FULL TIME while the machine reports it live, which is the same recovery
// lie the quiz board's repaint fixed (see paintQuizState in quiz/shared.ts).
//
// Repainting from the machine rather than clearing unconditionally is what makes it safe to
// call on every update: a genuinely finished board keeps its treatment while an operator edits
// the score, and only a board whose machine says otherwise loses it.
function paintMatchState() {
  if (typeof noacgMachineState !== 'function') return;   // a design with no machine has no state to paint
  var root = document.querySelector('.scoreboard');
  if (!root) return;
  var groups = (noacgMachineState() || {}).groups || {};
  var atBreak = false;
  var atFinal = false;
  // Read every group by VALUE, not by name: the two-team boards carry the interval and the
  // result as separate parallel groups, the status card carries both in one - and both spell
  // the states the same way, so neither shape needs a special case here.
  for (var id in groups) {
    if (groups[id] === 'interval') atBreak = true;
    if (groups[id] === 'final') atFinal = true;
  }
  root.classList.toggle('scoreboard-break', atBreak && !atFinal);
  root.classList.toggle('scoreboard-final', atFinal);
}

// play(): take the scoreboard on air — run the entrance timeline.
function play() {
  gsap.killTweensOf('*');          // stop any animation that is still running
  resetScorePop();                 // a killed mid-pop score must not enter enlarged
  onAir = true;
  buildInTimeline();
}

// stop(): take the scoreboard off air — run the exit timeline.
function stop() {
  gsap.killTweensOf('*');
  resetScorePop();                 // don't freeze a half-finished pop at scale > 1
  onAir = false;
  // A board that RUNS something (the debate floor's speaking clocks) has to be told the
  // graphic is going down, or its interval outlives the thing it was painting — the same leak
  // the scoreboard type's comment records from a clock group whose element was not there.
  // Defined only by a design that has something to stop, so a plain scorebug emits no call
  // site's worth of behaviour it does not need. There is deliberately no play() twin: a board
  // comes up in its machine's initial state, and starting something is what an operator event
  // is for.
  if (typeof boardOffAir === 'function') boardOffAir();
  buildOutTimeline();
}

// resetScorePop(): killTweensOf() can freeze a score mid-pop at scale ~1.x; the
// entrance/exit timelines never touch the masks, so snap both score masks back to 1 here.
function resetScorePop() {
  for (var i = 0; i < scoreIds.length; i++) {
    var el = document.getElementById(scoreIds[i]);
    if (el) gsap.set(el.parentNode, { scale: 1 });  // the mask is what update() pops
  }
}

// next(): SPX Continue — advance one step along the default path. This design ships
// single-step, so it normally does nothing; it still funnels to the interpreter so a
// template that GROWS a step (or a state machine) stays drivable through the SPX contract.
function next() {
  return (typeof revealNextStep === 'function') ? revealNextStep() : null;
}

${matchClock ? matchClockJs('scoreboard') : '// This board runs its own clocks (below) — the shared single-clock match runtime is not emitted.'}
${extraJs === '' ? '' : `\n${extraJs}\n`}
${animationBlock}
`;
}

/** Build the complete scoreboard SpxTemplate. */
export function assembleScoreboard(meta: SbMeta, design: SbDesign, o: ResolvedOptions,
  /** Refine the converted animation data — the seam a graphic TYPE injects its machine
   *  through (see shared/standard.ts composeRefine for the ordering rule). */
  refine?: (data: AnimData) => AnimData,
  /** The design's resolved SHAPE tokens (model/themeTokens.ts). Resolved by the caller,
   *  because the family lives on the VARIANT (styleTag) and this function only sees the
   *  design. Absent = emit no token lines, which is what every template did before they
   *  existed. */
  tokens?: ThemeTokens,
): SpxTemplate {
  const font = resolveHeadingFont(o); // imported font wins over the bundled set
  const scale = computeScale(o);
  // Scoreboards span two team groups side by side — cap wider than a single strap.
  const maxTextWidth = Math.round(o.resolution.width * 0.6);
  // A design owns its fields only when four is the wrong shape (a match board's clock and
  // logos, a match-event card); everything else keeps the fixed contract.
  const fields = design.fields ?? SB_FIELDS;

  const settings = baseSettings(meta, o, { steps: '1' }); // scoreboards have no steps

  const html = documentHtml({
    title: meta.name,
    definitionBlock: definitionScriptBlock(settings, fields),
    body: `  <!-- Scoreboard root — two team groups (name + score) inside one panel. -->
  <div class="scoreboard">
${design.html}
  </div>`,
  });

  const css = `/* ${meta.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, font.stack, scale, { tokens, consumerCss: design.css })}

${font.face}

${resetCanvasCss(o.resolution)}

/* ── Root position (anchor zone) ── */
.scoreboard {
  position: absolute;
${zoneCssText(o.zone, o.nudge, o.resolution)}
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── ${design.stageWidth ? 'The stage: the bar keeps its own width and the names fit inside it.' : 'Auto-fit: the panel hugs its content and wraps instead of overflowing.'} ── */
.scoreboard-box {
${
    design.stageWidth
      ? stageBoxCss(o.resolution, design.stageWidth, o.zone, 'the room this bar was drawn for')
      : '  width: fit-content;              /* the panel hugs the two team groups */'
  }
  max-width: ${maxTextWidthCss(o.resolution, maxTextWidth)};  /* the wrap cap — follows --scale, stops at the safe area */
  will-change: transform, opacity; /* hint the browser: this element animates */
}
.scoreboard-mask {
  overflow: hidden;                /* lines animate in from behind this mask */
}
.scoreboard-mask > span {
  display: inline-block;           /* so the line can move (and pop) inside its mask */
  overflow-wrap: break-word;       /* break very long unbroken team names */
  text-wrap: balance;              /* wrapped rows get even lengths */
}

${design.html.includes(DATA_SOURCE_CLASS) ? `\n${dataSourceCss}\n` : ''}
/* ── Design ── */
${design.css}
`;

  const preset = presetById(o.animation.presetId);
  // 'auto' uses the preset's hand-tuned ease pair; a named easing preset overrides both phases.
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  const cfg: PresetConfig = {
    prefix: 'scoreboard',
    // The MASKED lines the presets choreograph — the fixed contract's four (f0 team A ·
    // f1 score A · f2 team B · f3 score B) unless the design says otherwise. A board with a
    // clock and two logos still only wants its text lines staggered, so this is the design's
    // count of masks, not its count of fields.
    lineCount: design.lineCount ?? 4,
    hasAccent: design.hasAccent,
    steps: false, // scoreboards never step — the whole board enters at once
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  const js = sbRuntimeJs(
    meta.name,
    preset.emit(cfg),
    design.popFields ?? ['f1', 'f3'],
    stageExtraJs(design.stageWidth, 'scoreboard', design.runtimeExtraJs).trim(),
    design.matchClock ?? true,
  );

  // Timeline v2: scoreboards create as animation data blocks. Only the marked region
  // converts — the score-pop runtime wrapping it (onAir, update()'s mask pop) is
  // scoreboard-owned code outside the markers and stays byte-identical.
  return convertToDataRegion({
    name: meta.name,
    type: 'scoreboard',
    resolution: o.resolution,
    fps: o.fps,
    html,
    css,
    js,
    fields,
    settings,
    assets: [...o.importedImages, ...(o.customFont ? [o.customFont.asset] : [])],
    // Only the visible text lines become timeline layers: an image slot and a hidden rows
    // source are data, not something the canvas selects or the timeline animates.
    layers: fields.filter((f) => f.ftype === 'textfield').map((f) => ({
      id: f.field,
      type: 'text' as const,
      label: f.title,
      fieldId: f.field,
      text: f.value,
      styles: {},
    })),
  }, refine);
}

/** The authoring API for scoreboard variant modules. */
export function defineScoreboardVariant(
  spec: Omit<TemplateVariant, 'create'>,
  meta: SbMeta,
  buildDesign: (o: ResolvedOptions) => SbDesign,
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
      return assembleScoreboard(meta, design, o, refine?.(o), tokens);
    },
  };
  return variant;
}
