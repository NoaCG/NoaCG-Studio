// Starting-soon scaffolding — the HOLDING SCREEN category. A holding screen is whatever the
// audience looks at while the show is not happening: before it starts, during a break, through
// a technical problem, and after it ends. They all share one shape (a calm full-frame card that
// may hold for a very long time) and differ in what they say and whether they count.
//
// A design declares three things about itself and the assembler does the rest:
//   lineCount  — how many text lines its markup carries (#f0 … #f{n-1}); default 2
//   clock      — 'minutes' (a plain duration), 'start-time' (a wall-clock time the count
//                chases, with the duration as fallback), or 'none' (a screen with no numbers:
//                a technical pause has nothing honest to promise)
//   extras     — any further SPX fields it owns
//
// Structure contract:
//   <div class="starting-soon">                  root — positioned by zone; opacity:0 until play()
//     <div class="starting-soon-box">            the panel; presets fade + raise this
//       .starting-soon-mask > #f0 / #f1 spans    the text lines (mask-wrapped, auto-fit)
//       [<div class="starting-soon-clock">]      JS paints the remaining time here (clockRuntimeJs)
//       one element with class "starting-soon-pulse"   the hold-loop preset breathes it
//     </div>
//     [hidden #fN sources SPX writes the countdown into]
//   </div>

import type { SpxField, SpxTemplate } from '../../model/types';
import { definitionScriptBlock } from '../../model/spxDefinition';
import { resolveEasing } from '../../model/easings';
import {
  resolveOptions,
  type LineSpec,
  type ResolvedOptions,
  type TemplateVariant,
  type WizardOptions,
} from '../../model/wizard';
import {
  baseSettings,
  computeScale,
  dataSourceCss,
  documentHtml,
  maskImageCss,
  maxTextWidthCss,
  stageBoxCss,
  resetCanvasCss,
  resolveHeadingFont,
  rootVarsCss,
  setFieldValueJs,
  zoneCssText,
} from '../shared/base';
import { clockRuntimeJs } from '../shared/clock';
import { applyLogoSlot, designHasLogoSlot } from '../shared/logoSlot';
import type { AnimData } from '../../blocks/animData';
import { convertToDataRegion } from '../shared/standard';
import { stageExtraJs } from '../shared/stageFit';
import type { PresetConfig } from '../lowerThirds/animPresets';
import { ssPresetById } from './ssPresets';
import { resolveTokens, type ThemeTokens, type TokenOverrides } from '../../model/themeTokens';

/**
 * What a holding screen counts, if anything.
 * - `minutes`    a plain duration the operator types ("5"). The count restarts from the top
 *                every time the graphic is taken on air — right for a break.
 * - `start-time` the same, plus an optional wall-clock time ("19:30") that WINS when it is
 *                filled in. Right for "we start at half past": the number on screen agrees
 *                with the clock on the wall no matter how long the hold has been up.
 * - `none`       no clock at all. A technical pause has no honest number to show, and a wrong
 *                promise on air is worse than no promise.
 */
export type SsClock = 'minutes' | 'start-time' | 'none';

/** A holding screen's default text for one line, used when the caller supplies none. */
export interface SsLineDefault {
  title: string;
  sample: string;
}

export interface StartingSoonDesign {
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
  /**
   * Inner HTML of .starting-soon — must contain .starting-soon-box with mask-wrapped #f0…
   * spans, a .starting-soon-clock element when the design has a clock, and exactly one
   * element carrying class "starting-soon-pulse".
   */
  html: string;
  /** Variant CSS (panel, lines, clock, pulse; done-state via .starting-soon-done). */
  css: string;
  /** How many text lines the markup above carries. Default 2 (title + show name). */
  lineCount?: number;
  /** Per-line fallbacks when the caller passes fewer lines than the design draws. */
  lineDefaults?: SsLineDefault[];
  /** What this screen counts. Default 'minutes'. */
  clock?: SsClock;
  /** The countdown field's default value, in whole minutes. Default '5'. */
  clockMinutes?: string;
  /** The start-time field's default value ("19:30"), for `clock: 'start-time'` designs.
   *  Empty by default — an unset start time means "use the duration", which is the
   *  behaviour a template should ship with. */
  clockStartTime?: string;
  /**
   * Extra runtime JS the design owns. Emitted BEFORE the marked ANIMATION region — same
   * doctrine as every other category — so preset swaps can never rewrite it. Any load-time
   * DOM work must use the DOM-ready guard (template.js loads in <head> when exported).
   */
  runtimeExtraJs?: string;
  /** SPX fields the design owns beyond its lines and its clock (appended last). */
  extraFields?: SpxField[];
  /**
   * Where this design disagrees with its style family's shape tokens
   * (model/themeTokens.ts). Every entry is conformance debt - DESIGN_LANGUAGE §8's rule is
   * "reuse the exact token values, don't improvise new ones per category".
   */
  tokens?: TokenOverrides;
}

export interface StartingSoonMeta {
  name: string;
  description: string;
  uicolor: string;
}

/**
 * The full-frame programme background shared by every holding screen.
 *
 * The dark base is deliberately opaque. `--panel-bg` is often translucent because it was
 * authored for a card over picture; using it as the only canvas paint would preserve the
 * audit defect. Family classes change the light, grid, and shape language while the one
 * accent remains the only chromatic voice.
 */
function holdingBackgroundCss(family: TemplateVariant['styleTag']): string {
  const familyLight: Record<TemplateVariant['styleTag'], string> = {
    minimal: `radial-gradient(circle at 72% 24%, color-mix(in srgb, var(--accent) 13%, transparent) 0%, transparent 38%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.025), transparent 44%)`,
    editorial: `linear-gradient(90deg, transparent 0 8%, color-mix(in srgb, var(--accent) 26%, transparent) 8% 8.12%, transparent 8.12%),
    radial-gradient(circle at 76% 18%, rgba(255, 255, 255, 0.07), transparent 38%)`,
    cinematic: `linear-gradient(180deg, rgba(0, 0, 0, 0.66), transparent 24% 72%, rgba(0, 0, 0, 0.78)),
    radial-gradient(ellipse at 50% 44%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 52%)`,
    sport: `linear-gradient(118deg, transparent 0 58%, color-mix(in srgb, var(--accent) 14%, transparent) 58% 72%, transparent 72%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 36%)`,
    glass: `radial-gradient(circle at 28% 22%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 34%),
    radial-gradient(circle at 78% 76%, rgba(255, 255, 255, 0.09), transparent 38%)`,
    noacg: `radial-gradient(circle at 76% 28%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 34%),
    linear-gradient(125deg, transparent 0 62%, rgba(246, 166, 35, 0.055) 62% 62.3%, transparent 62.3%)`,
    // The three game-show families. Each paints its OWN ground over the neutral base, because a
    // full frame is where a look either carries or collapses: a flat accent field printed with
    // ink halftone dots, a burgundy curtain lit from above, and a violet screen with scanlines
    // and a horizon glow. The last layer of each is a solid wash of a palette colour, so the
    // Style panel retints the whole frame. These are IMAGES only: this value lands in
    // `background-image`, which takes no position or size, and one stray `/ 26px` drops the whole
    // declaration. A design that wants its dots tiled sets `background-size` itself (ss22 does).
    sticker: `radial-gradient(color-mix(in srgb, var(--text-color) 22%, transparent) 3px, transparent 3.5px),
    linear-gradient(var(--accent), var(--accent))`,
    showtime: `radial-gradient(ellipse at 50% -10%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 58%),
    repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.16) 0 46px, transparent 46px 92px),
    linear-gradient(180deg, color-mix(in srgb, var(--panel-bg) 78%, #000000), color-mix(in srgb, var(--panel-bg) 30%, #000000))`,
    arcade: `repeating-linear-gradient(0deg, transparent 0 3px, rgba(0, 0, 0, 0.35) 3px 4px),
    radial-gradient(ellipse at 50% 108%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 52%),
    linear-gradient(180deg, color-mix(in srgb, var(--panel-bg) 60%, #000000), var(--panel-bg))`,
  };

  return `/* Full-frame programme background. The solid base guarantees opaque output. */
.starting-soon-background {
  position: absolute;              /* fills the programme frame */
  inset: 0;                        /* edge to edge */
  overflow: hidden;                /* ambient light never escapes the canvas */
  background-color: #080b10;       /* opaque neutral base - never a transparent card */
  background-image: ${familyLight[family]};  /* family-specific light and structure */
  pointer-events: none;            /* decorative only */
  will-change: transform, opacity; /* the entrance and idle drift animate this layer */
}

/* A very soft pool of accent light. GSAP drifts it by only a few percent while the hold airs. */
.starting-soon-ambient {
  position: absolute;              /* free-floating inside the programme background */
  inset: 3%;                       /* transform-safe inset keeps the idle field on canvas */
  background: radial-gradient(circle at 92% 18%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 64%);
  filter: blur(calc(36px * var(--scale)));  /* soft atmospheric light */
  opacity: 0.72;                   /* restrained - content stays dominant */
  will-change: transform;          /* the idle drift is transform-only */
}

/* A low-contrast technical grid gives large empty areas authored structure. */
.starting-soon-grid {
  position: absolute;              /* covers the same programme surface */
  inset: 0;                        /* edge to edge */
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.024) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.024) 1px, transparent 1px);
  background-size: calc(96px * var(--scale)) calc(96px * var(--scale));  /* broad, quiet rhythm */
  ${maskImageCss('linear-gradient(90deg, transparent, #000 34%, #000 100%)', 'keep the text side calm')}
  opacity: ${family === 'sport' || family === 'noacg' ? '0.72' : '0.36'};  /* stronger for control-room families */
}`;
}

/** The two lines every holding screen had before designs could declare their own. */
const DEFAULT_LINES: SsLineDefault[] = [
  { title: 'Title', sample: 'STARTING SOON' },
  { title: 'Show name', sample: 'The Evening Show' },
];

/** Resolve the design's lines: the caller's where given, the design's defaults otherwise. */
function resolveLines(design: StartingSoonDesign, o: ResolvedOptions): LineSpec[] {
  const count = design.lineCount ?? 2;
  const defaults = design.lineDefaults ?? DEFAULT_LINES;
  const lines: LineSpec[] = [];
  for (let i = 0; i < count; i++) {
    const fallback = defaults[i] ?? { title: `Line ${i + 1}`, sample: '' };
    lines.push({
      title: o.lines[i]?.title || fallback.title,
      sample: o.lines[i]?.sample || fallback.sample,
    });
  }
  return lines;
}

/** The shared runtime: field updates + (when the design has one) the countdown clock. */
function ssRuntimeJs(
  name: string,
  animationBlock: string,
  opts: { clockJs: string | null; extraJs?: string },
): string {
  // A clock-less screen must not carry a clock repaint in update() — dead code that reads as
  // if the graphic counted something. The interpreter resolves a step's calls by NAME and
  // treats a missing function as a no-op, so a preset swapped onto a clock-less screen after
  // creation degrades to "no countdown" rather than throwing.
  // ONE line, and the decision behind it lives in shared/clock.ts: a changed countdown length
  // (or start time) re-derives the clock immediately - idle, paused or running - and an update
  // that did not touch those fields leaves the count alone.
  const clockRepaint = opts.clockJs
    ? `
  // The countdown re-derives its length from the fields just written (shared/clock.ts).
  clockDataUpdated();`
    : '';

  const blocks = [
    `// ${name} — generated by NoaCG Studio. SPX calls update(), play(), stop(), next().`,
    ...(opts.clockJs ? [opts.clockJs] : []),
    ...(opts.extraJs ? [opts.extraJs] : []),
    setFieldValueJs,
    `// update(data): SPX sends field values as JSON; each value is written into the element
// whose id matches the field name (the hidden countdown sources are fields too).
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (el) setFieldValue(el, fields[key]);
  }${clockRepaint}
  // Designs on a stage hold their lines to the rows they were drawn for (no-op otherwise).
  if (typeof fitStagedText === 'function') fitStagedText();
}

// play(): take the holding screen on air${opts.clockJs ? ' — the entrance also starts the countdown' : ''}.
function play() {
  gsap.killTweensOf('*');          // stop any animation that is still running
  buildInTimeline();
}

// stop(): take the screen off air${opts.clockJs ? ' (the exit also stops the countdown)' : ''}.
function stop() {
  gsap.killTweensOf('*');
  buildOutTimeline();
}

// next(): SPX Continue — advance one step along the default path. This design ships
// single-step, so it normally does nothing; it still funnels to the interpreter so a
// template that GROWS a step (or a state machine) stays drivable through the SPX contract.
function next() {
  return (typeof revealNextStep === 'function') ? revealNextStep() : null;
}`,
    animationBlock,
  ];
  return `${blocks.join('\n\n')}\n`;
}

/** Build the complete starting-soon SpxTemplate. */
export function assembleStartingSoon(
  meta: StartingSoonMeta,
  design: StartingSoonDesign,
  o: ResolvedOptions,
  /** Refine the converted animation data — the seam a graphic TYPE injects its machine
   *  through (see shared/standard.ts composeRefine for the ordering rule). */
  refine?: (data: AnimData) => AnimData,
  /** The design's resolved SHAPE tokens (model/themeTokens.ts). Resolved by the caller,
   *  because the family lives on the VARIANT (styleTag) and this function only sees the
   *  design. Absent = emit no token lines, which is what every template did before they
   *  existed. */
  tokens?: ThemeTokens,
  /** The variant's family selects the programme background's shape language. */
  family: TemplateVariant['styleTag'] = 'minimal',
): SpxTemplate {
  const font = resolveHeadingFont(o);
  const scale = computeScale(o);
  const backgroundCss = holdingBackgroundCss(family);
  // Holding screens are the show's front door: wider cap than a strap (~70% of the canvas).
  const maxTextWidth = Math.round(o.resolution.width * 0.7);

  const lines = resolveLines(design, o);
  const clock: SsClock = design.clock ?? 'minutes';
  const minutesId = `f${lines.length}`;
  const startTimeId = `f${lines.length + 1}`;
  const minutesValue = design.clockMinutes ?? '5';
  const startTimeValue = design.clockStartTime ?? '';

  const fields: SpxField[] = lines.map((line, i) => ({
    field: `f${i}`,
    ftype: 'textfield',
    title: line.title,
    value: line.sample,
  }));
  if (clock !== 'none') {
    // A NUMBER field, so the countdown gets steppers on every control surface (gameTimers/
    // shared.ts carries the same decision). The START TIME below stays a text field — "19:30"
    // is not a number, and the clock runtime parses it on the colon.
    fields.push({ field: minutesId, ftype: 'number', title: 'Countdown (minutes)', value: minutesValue });
  }
  if (clock === 'start-time') {
    fields.push({
      field: startTimeId,
      ftype: 'textfield',
      title: 'Start time (HH:MM, optional)',
      value: startTimeValue,
    });
  }
  fields.push(...(design.extraFields ?? []));

  // ── THE MARK, when the operator turns one on ─────────────────────────────────────────
  //
  // A HOLDING SCREEN TAKES A MARK - it is the graphic a channel sits on longest, and the one a
  // viewer stares at while waiting. Until 2026-08-21 this assembler had no path for one, exactly
  // like the game timer's (docs/MARK_CAPABILITY_AUDIT.md): the SIGN-OFF designs beside it draw
  // their own slot in `signOffShared.ts`, so the CATEGORY carried a mark while these designs
  // could not be given one at all.
  //
  // The id is computed HERE rather than by the shared slot's own arithmetic, because this
  // category numbers its fields itself: the lines come first, then the clock sources, then the
  // design's own extras. Whatever the design asked for, the mark is the next free id - which is
  // why this sits after every push above and takes `fields.length`.
  //
  // Gated on `logoEnabled`, so a design nobody gave a mark to emits exactly what it always did.
  const slotInput = { html: design.html, css: design.css, hasAccent: false };
  let ssHtml = design.html;
  let ssCss = design.css;
  if (o.logoEnabled && !designHasLogoSlot(slotInput, 'starting-soon')) {
    const slotted = applyLogoSlot(slotInput, 'starting-soon', o, `f${fields.length}`);
    ssHtml = slotted.html;
    ssCss = slotted.css;
    for (const extra of slotted.extraFields ?? []) {
      if (!fields.some((f) => f.field === extra.field)) fields.push(extra);
    }
  }

  const settings = baseSettings(meta, o, { steps: '1', playlayer: '4', webplayout: '4' });

  // The hidden countdown sources. They are ordinary SPX fields with nowhere visible to go:
  // the operator types a duration, the clock runtime reads it and paints the result.
  const clockSources =
    clock === 'none'
      ? ''
      : clock === 'start-time'
        ? `
    <!-- Hidden countdown sources — SPX writes the fields here; the clock reads them.
         A start time (e.g. "19:30") wins; leave it empty to count the duration instead. -->
    <div id="${minutesId}" class="noacg-data-source">${minutesValue}</div>
    <div id="${startTimeId}" class="noacg-data-source">${startTimeValue}</div>`
        : `
    <!-- Hidden countdown source — SPX writes field ${minutesId} (minutes) here; the clock reads it. -->
    <div id="${minutesId}" class="noacg-data-source">${minutesValue}</div>`;

  const html = documentHtml({
    title: meta.name,
    definitionBlock: definitionScriptBlock(settings, fields),
    body: `  <!-- ${meta.name}.${clock === 'none' ? '' : ' The clock is painted by JS from the hidden source below.'} -->
  <div class="starting-soon starting-soon--${family}">
    <!-- Full-frame programme background. Only camera and screen frames stay transparent. -->
    <div class="starting-soon-background" aria-hidden="true">
      <div class="starting-soon-ambient"></div>
      <div class="starting-soon-grid"></div>
    </div>
${ssHtml}${clockSources}
  </div>`,
  });

  const css = `/* ${meta.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, font.stack, scale, { tokens, consumerCss: `${backgroundCss}\n${ssCss}` })}

${font.face}

${resetCanvasCss(o.resolution)}

/* ── Root position (anchor zone) ── */
.starting-soon {
  position: absolute;
  left: 0;                         /* full-frame graphics ignore anchor zones */
  top: 0;                          /* begin at the programme origin */
  width: ${o.resolution.width}px;  /* paint every horizontal pixel */
  height: ${o.resolution.height}px; /* paint every vertical pixel */
  overflow: hidden;                /* nothing may leak outside the programme */
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── Auto-fit: the panel hugs its text and wraps instead of overflowing. ── */
.starting-soon-box {
  position: absolute;              /* content still honours the chosen safe-area zone */
${zoneCssText(o.zone, o.nudge, o.resolution)}
${
    design.stageWidth
      ? stageBoxCss(o.resolution, design.stageWidth, o.zone, 'the room this screen was drawn for')
      : "  width: fit-content;              /* the panel hugs the text */"
  }
  max-width: ${maxTextWidthCss(o.resolution, maxTextWidth)};  /* the wrap cap — follows --scale, stops at the safe area */
  will-change: transform, opacity; /* hint the browser: this element animates */
}
.starting-soon-mask {
  overflow: hidden;                /* lines animate in from behind this mask */
}
.starting-soon-mask > span {
  display: inline-block;           /* so the line can move inside its mask */
  overflow-wrap: break-word;       /* break very long unbroken words */
  text-wrap: balance;              /* wrapped rows get even lengths */
}

/* ── Design ── */
${backgroundCss}

${ssCss}

${dataSourceCss}
`;

  const preset = ssPresetById(o.animation.presetId);
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  const cfg: PresetConfig = {
    prefix: 'starting-soon',
    lineCount: lines.length,
    hasAccent: false,
    steps: false,
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  const js = ssRuntimeJs(meta.name, preset.emit(cfg), {
    clockJs: clock === 'none' ? null : clockRuntimeJs('starting-soon', minutesId, clock === 'start-time' ? startTimeId : undefined),
    extraJs: stageExtraJs(design.stageWidth, 'starting-soon', design.runtimeExtraJs).trim() || undefined,
  });

  const template: SpxTemplate = {
    name: meta.name,
    type: 'starting-soon',
    resolution: o.resolution,
    fps: o.fps,
    html,
    css,
    js,
    fields,
    settings,
    assets: [...o.importedImages, ...(o.customFont ? [o.customFont.asset] : [])],
    layers: [],
  };

  // Timeline v2: convert the marked region into the NOACG_ANIM data block + interpreter.
  // The ambient breath is now describable as data (a looping scale track — gap 6), and the
  // step-calls model (§3b) carries startClock()/stopClock(), so the hold loop and countdown
  // both survive the flip; the clock runtime lives OUTSIDE the region and is untouched. A
  // conversion failure keeps the legacy emit — never a broken template.
  return convertToDataRegion(template, refine);
}

/** The authoring API for starting-soon variant modules. */
export function defineStartingSoonVariant(
  spec: Omit<TemplateVariant, 'create'>,
  meta: StartingSoonMeta,
  buildDesign: (o: ResolvedOptions) => StartingSoonDesign,
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
      return assembleStartingSoon(meta, design, o, refine?.(o), tokens, spec.styleTag);
    },
  };
  return variant;
}
