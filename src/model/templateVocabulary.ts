// THE TEMPLATE VOCABULARY: the handful of types a generation spec, a brand and a structural
// intent are written in - a line, an extra field, a zone, a palette, an animation preset and its
// speed. They are kernel (layer 0): model/ files read them, and model/ imports nothing above
// itself (docs/ARCHITECTURE.md §3). The catalog contract (templates/contract.ts) re-exports them
// so a design reads one file; the PALETTES themselves, the field plans and the option resolvers
// are catalog data and live there.
import type { StyleTag } from './fonts';

/** One visible text line in the design (becomes data field fN + a styled element). */
export interface LineSpec {
  /** Operator-facing label in SPX, e.g. "Name". */
  title: string;
  /** Sample/default text shown in the design. */
  sample: string;
  /**
   * Per-line placement and type. ONLY the imported-design category uses this: artwork made
   * elsewhere carries its own look, so its text has to be placed and styled to match what is
   * baked into the image. Every catalog design lays its own lines out and ignores this —
   * their typography is the design's decision, not the operator's.
   * Absent = the imported-design assembler's defaults for that line index.
   */
  style?: LineStyle;
}

/** Placement + type for one manually positioned text line (see LineSpec.style). */
export interface LineStyle {
  /** Position within the artwork, in design px from its top-left (before --scale). */
  x: number;
  y: number;
  /** Which edge of the text sits at `x` — a free-placed line has no column to align inside. */
  align: 'left' | 'center' | 'right';
  /** Type size in design px (before --scale). */
  fontSize: number;
  /** CSS font-weight (400 regular · 700 bold). */
  weight: number;
  /** Any CSS color. */
  color: string;
  /** A bundled font id, or null to inherit the graphic's --font-heading. */
  fontId: string | null;
}

/**
 * An extra, non-visual data field added to the SPX definition only.
 * The offered types are the ones live broadcast graphics actually use: text, long text,
 * a number, or an image ("filelist" — the operator picks a file from the project's
 * images/ folder). SPX also knows dropdown/checkbox/color, but those are reserved for
 * designs with a genuinely constrained choice (e.g. the quiz's correct-answer dropdown).
 */
export interface ExtraFieldSpec {
  title: string;
  ftype: 'textfield' | 'textarea' | 'number' | 'filelist';
  value: string;
}

/** The nine anchor zones, snapped to safe areas. */
export type Zone9 =
  | 'top-left' | 'top-center' | 'top-right'
  | 'mid-left' | 'mid-center' | 'mid-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/** A curated color set. `panel` is the box background; accent appears in small sharp doses. */
export interface Palette {
  id: string;
  name: string;
  styleTags: StyleTag[];
  accent: string;
  text: string;
  textDim: string;
  panel: string;
}

export type AnimPresetId =
  // The Slide family — one choreography, four directions of travel (slide-up enters
  // rising from below, slide-left enters travelling left from the right edge, …):
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'line-reveal'
  | 'mask-wipe'
  | 'pop-spring'
  | 'snap-stinger'
  | 'blur-in'
  | 'fade'
  | 'flip-3d'
  // End-credits motion formats (templates/endCredits/creditsPresets.ts):
  | 'credits-roll'
  | 'credits-loop'
  | 'credits-board'
  | 'credits-pages'
  | 'credits-crawl'
  // Ticker motion formats (templates/tickers/tickerPresets.ts):
  | 'ticker-marquee'
  | 'ticker-flip'
  | 'ticker-rotate'
  // Countdown-clock formats (templates/startingSoon + templates/gameTimers):
  | 'hold-loop'
  | 'hold-still'
  | 'timer-run'
  | 'timer-line-reveal'
  // Versus-card formats (templates/versus/vsPresets.ts):
  | 'vs-slam'
  | 'vs-glide'
  // Live-vote motion format (templates/poll/pollPresets.ts):
  | 'poll-open'
  // Audience-graphic motion formats (templates/audience/audiencePresets.ts):
  | 'audience-rise'
  | 'audience-slide'
  // Infographic motion formats (templates/infographics/igPresets.ts):
  | 'count-up'
  | 'bars-grow'
  | 'ring-fill'
  | 'rows-cascade'
  // The goal/milestone motions: a ring drawn to raised/goal (its angle and the counted
  // figure are different values, which is why it is not 'ring-fill'), and a progress line
  // that pops each milestone it passes.
  | 'goal-ring'
  | 'milestone-run'
  // Camera-frame motion (templates/frames/framePresets.ts): the window edge, then the plate.
  | 'frame-draw'
  | 'frame-fade'
  | 'frame-slide'
  // Transition motion (templates/transitions/transitionPresets.ts): the entrance COVERS the
  // frame and holds there — the exit is what clears it again.
  | 'transition-slam'
  | 'transition-wipe'
  | 'transition-sweep'
  | 'transition-iris'
  | 'transition-spin'
  // Quiz format (templates/quiz/quizPresets.ts) — Continue plays the Reveal step, which
  // calls revealAnswer() to light up the correct row:
  | 'quiz-reveal'
  // Competition-pack motion (templates/competition/compPresets.ts) — one bank shared by the
  // four competition categories, prefix-parameterized like the standard one:
  | 'comp-rise'
  | 'comp-impact'
  | 'comp-bloom'
  | 'comp-cascade'
  // Imported-design motion (templates/importedDesign/designPresets.ts): the artwork and its
  // text move as ONE unit, so these animate the box and never the individual lines.
  | 'design-fade'
  | 'design-slide'
  | 'design-pop'
  | 'design-blur'
  // …except the SVG road's per-layer stagger, which walks the artwork's OWN top-level layers
  // in (PresetConfig.layers) — a designer-drawn structure, unlike a flat picture's.
  | 'design-stagger';

/**
 * The speed knob's multiplier. The wizard offers 0.6 · 1 · 1.8 (2026-08-26, GOALS goal 6):
 * the earlier 0.75/1.5 steps were a REAL ±33% on the timings and still read as "no change" on
 * the owner's walk, because two replays of a smooth power-curve entrance seconds apart are
 * compared from memory, where a third is below the noticing threshold. 0.75 and 1.5 stay in
 * the union - saved AI specs and projects carry them, and the interpreter divides by any
 * number - they are just no longer what the buttons write.
 */
export type AnimSpeed = 0.6 | 0.75 | 1 | 1.5 | 1.8;
