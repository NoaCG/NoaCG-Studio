// THE UNIVERSAL IN/OUT MOTION BANK — ten entrance/exit motions that apply to ANY graphic
// whose motion lives in the NOACG_ANIM data block (docs/STATE_MACHINE_SCHEMA.md): the
// catalog, the wizard's imports, the agent door's scaffolds, a hand-made data template.
//
// This is the no-code surface's engine (the wizard's Animation step and a saved graphic's
// control page both pick from it); the full timeline stays the Advanced-mode editor. It is
// deliberately NOT another category preset bank (blocks/presetRegistry.ts): those are the
// catalog's tuned choreographies — lines staggering out of masks, an accent drawing in —
// emitted as code and derived to keyframes through the importer, and each one needs the
// structure contract it was written for. A universal motion knows nothing about the
// design: it moves THE GRAPHIC AS ONE UNIT, so it can promise to work on every data-block
// graphic, and it is authored directly as DATA (plain keyframe tracks), so applying it is a
// pure `(data) => data` transform — deterministic, readable, undoable, and the same in the
// wizard, on the control page and under SPX.
//
// WHAT MOVES: the graphic's root's direct element children (its box, an accent beside it —
// whatever sits directly under the root), together, with one motion. The root itself never
// takes a track: the interpreter owns its opacity (the rest-hide and the on-air reveal), and
// a track there would fight it. Layers OUTSIDE the root keep their own motion — an inserted
// graphic shares the host's steps but is not the host's unit (blocks/templateInsert.ts).
//
// WHAT IS KEPT on the step being rewritten: lifecycle `calls` (a clock's startClock), measured
// `dynamics` (a ticker's marquee builder), `loops` (an ambient breath — it is behaviour, not
// the entrance), `reveals`/`hides` (the walk's mechanics), and every layer outside the root.
// Only the inside-the-root ENTRANCE/EXIT motion is swapped, which is what the picker says it
// does. A styled lifecycle edge (a machine's play/stop arrow carrying fade/push/wipe) would
// play INSTEAD of the step's keyframes, so the rewrite clears that style — what you picked
// is what plays.
//
// Values follow the catalog's own taste (templates/lowerThirds/animPresets.ts, the imported
// design's whole-unit bank): Out-direction eases on entrances, In-direction eases on exits
// that run ~45 % faster (docs/DESIGN_LANGUAGE.md §4).
//
// MEASURED, 2026-08-23 (the owner, after animating an imported SVG: "I used the wipe-write
// animation and didn't really see a difference … the speed, I don't notice the difference and
// everything looks too similar"). The wizard's Animation step was driven for real and the
// composed preview read back frame by frame (the method and the easing half of the result are
// in model/easings.ts). The motion half:
//
//  - The Speed knob REACHES the data (NOACG_ANIM.speed lands as 0.75 / 1 / 1.5 and the
//    interpreter genuinely time-scales by it). It was invisible because of what it scaled: at
//    a 0.55 s entrance, Slower/Normal/Faster meant 0.73 / 0.55 / 0.37 s — a 0.18 s step, and
//    the WHOLE range sat at or under the doctrine's 0.5 s floor, so every setting read as
//    "fast". The base durations below were lengthened (in ≈ 0.8 s, out ≈ 0.45 s) so the same
//    0.75/1.5 knob now spans ≈ 1.07 / 0.80 / 0.53 s — three settings inside the doctrine's
//    0.5–1.4 s band instead of three shades of the same one.
//  - "Everything looks too similar" and "no curve changes anything" were ONE fault: travel.
//    The bank moved 40 px (y) / 60 px (x) on a 1920×1080 frame — under 4 % — so neither the
//    motion nor the curve shaping it had room to read, and every out-direction ease landed
//    within 4–6 px of every other. Travel was widened to ~10 % of the frame, which is what
//    gives an easing choice something to be visible IN.
//
// The old note here read "short travel (a rise reads as 'arriving', not as movement)". That was
// the intent; the measurement is that at 40 px it read as neither.
//
// SECOND ROUND, 2026-08-26 (the owner's 2026-08-25 walk: easing accepted, Speed still "does not
// change, at least in the preview"). The lengthened durations were in and the knob still did not
// read - a ±33% step compared from MEMORY across two replays is below the noticing threshold on
// a smooth power curve, and his own hypothesis ("do I need an ease on it?") was the clue: bounce
// made it visible because the bounce COUNT changes, a rhythm rather than a duration. The knob's
// STEPS were widened instead (model/wizard.ts AnimSpeed, 0.6/1/1.8): the same 0.8 s entrance now
// spans ≈ 1.33 / 0.80 / 0.44 s. Nothing here changed - the bank's durations stay speed-relative.

import { EASINGS, type EasingId, type EasingPreset } from '../model/easings';
import type { SpxTemplate } from '../model/types';
import type { AnimData, AnimKeyframe, AnimLayerTracks, AnimStep } from './animData';

export type MotionPresetId =
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'rise'
  | 'drop'
  | 'pop'
  | 'zoom'
  | 'blur'
  | 'wipe-right'
  | 'wipe-left';

/** One half of a motion: the tracks written on EVERY target (times on [0, duration],
 *  speed-relative seconds), the step's pace and its curve. */
export interface MotionPhase {
  duration: number;
  ease: string;
  /** Written per target; `to` lands at `duration`. Values are GSAP values (numbers, or the
   *  strings GSAP tweens as strings — a filter, a clipPath). */
  from: Record<string, number | string>;
  to: Record<string, number | string>;
}

export interface MotionPreset {
  id: MotionPresetId;
  name: string;
  /** The card's one line (two at most in a 150 px cell). */
  hint: string;
  /** The full story, for the tooltip. */
  description: string;
  in: MotionPhase;
  out: MotionPhase;
}

const SHOWN = 'inset(0% 0% 0% 0%)';

export const MOTION_PRESETS: MotionPreset[] = [
  {
    id: 'fade',
    hint: 'Dissolves up, dissolves away.',
    name: 'Fade',
    description: 'Dissolves up, dissolves away. The calmest choice — no movement at all.',
    in: { duration: 0.8, ease: 'sine.out', from: { opacity: 0 }, to: { opacity: 1 } },
    out: { duration: 0.45, ease: 'sine.in', from: { opacity: 1 }, to: { opacity: 0 } },
  },
  {
    id: 'slide-left',
    hint: 'In from the right, back out that way.',
    name: 'Slide left',
    description: 'Glides in from the right edge and slips back out that way.',
    in: { duration: 0.8, ease: 'power3.out', from: { x: 170, opacity: 0 }, to: { x: 0, opacity: 1 } },
    out: { duration: 0.45, ease: 'power2.in', from: { x: 0, opacity: 1 }, to: { x: 140, opacity: 0 } },
  },
  {
    id: 'slide-right',
    hint: 'In from the left, back out that way.',
    name: 'Slide right',
    description: 'Glides in from the left edge and slips back out that way.',
    in: { duration: 0.8, ease: 'power3.out', from: { x: -170, opacity: 0 }, to: { x: 0, opacity: 1 } },
    out: { duration: 0.45, ease: 'power2.in', from: { x: 0, opacity: 1 }, to: { x: -140, opacity: 0 } },
  },
  {
    id: 'rise',
    hint: 'Up from below, sinks back down.',
    name: 'Rise',
    description: 'Rises into place from below and sinks back down to leave. Quiet and universal.',
    in: { duration: 0.8, ease: 'power3.out', from: { y: 110, opacity: 0 }, to: { y: 0, opacity: 1 } },
    out: { duration: 0.45, ease: 'power2.in', from: { y: 0, opacity: 1 }, to: { y: 80, opacity: 0 } },
  },
  {
    id: 'drop',
    hint: 'Down from above, lifts back up.',
    name: 'Drop',
    description: 'Settles in from above and lifts back up to leave. Headline-like.',
    in: { duration: 0.8, ease: 'power3.out', from: { y: -110, opacity: 0 }, to: { y: 0, opacity: 1 } },
    out: { duration: 0.45, ease: 'power2.in', from: { y: 0, opacity: 1 }, to: { y: -80, opacity: 0 } },
  },
  {
    id: 'pop',
    hint: 'Springs up to size, shrinks away.',
    name: 'Pop',
    description: 'Springs up to size with a soft overshoot, shrinks away. Energetic — sport, entertainment.',
    in: { duration: 0.7, ease: 'back.out(1.5)', from: { scale: 0.72, opacity: 0 }, to: { scale: 1, opacity: 1 } },
    out: { duration: 0.42, ease: 'power2.in', from: { scale: 1, opacity: 1 }, to: { scale: 0.86, opacity: 0 } },
  },
  {
    id: 'zoom',
    hint: 'Settles from larger, drifts off larger.',
    name: 'Zoom',
    description: 'Settles down from slightly larger, drifts away larger. Cinematic; best on full-frame graphics.',
    in: { duration: 0.9, ease: 'power3.out', from: { scale: 1.24, opacity: 0 }, to: { scale: 1, opacity: 1 } },
    out: { duration: 0.5, ease: 'power2.in', from: { scale: 1, opacity: 1 }, to: { scale: 1.14, opacity: 0 } },
  },
  {
    id: 'blur',
    hint: 'Focuses in from a blur, blurs away.',
    name: 'Blur',
    description: 'Resolves out of a soft blur, dissolves back into one. Filmic; best over calm footage.',
    in: { duration: 0.85, ease: 'power2.out', from: { filter: 'blur(26px)', opacity: 0 }, to: { filter: 'blur(0px)', opacity: 1 } },
    out: { duration: 0.5, ease: 'power2.in', from: { filter: 'blur(0px)', opacity: 1 }, to: { filter: 'blur(18px)', opacity: 0 } },
  },
  {
    id: 'wipe-right',
    hint: 'Revealed left to right, retracts.',
    name: 'Wipe right',
    description: 'Revealed left to right, as if a mask slid off; retracts back the same way.',
    in: { duration: 0.75, ease: 'power3.out', from: { clipPath: 'inset(0% 100% 0% 0%)' }, to: { clipPath: SHOWN } },
    out: { duration: 0.45, ease: 'power2.in', from: { clipPath: SHOWN }, to: { clipPath: 'inset(0% 100% 0% 0%)' } },
  },
  {
    id: 'wipe-left',
    hint: 'Revealed right to left, retracts.',
    name: 'Wipe left',
    description: 'Revealed right to left, as if a mask slid off; retracts back the same way.',
    in: { duration: 0.75, ease: 'power3.out', from: { clipPath: 'inset(0% 0% 0% 100%)' }, to: { clipPath: SHOWN } },
    out: { duration: 0.45, ease: 'power2.in', from: { clipPath: SHOWN }, to: { clipPath: 'inset(0% 0% 0% 100%)' } },
  },
];

export function motionPresetById(id: MotionPresetId): MotionPreset {
  const p = MOTION_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown motion preset: ${id}`);
  return p;
}

/**
 * THE SIX FAMILIES the picker actually draws. Ten cards was ten answers to a question that
 * only has six: Slide's four members and Wipe's two are one motion with a DIRECTION, exactly
 * as the wizard's own Slide family has always been (its Travel arrows, AnimationStep.tsx). The
 * bank keeps all ten ids — a saved graphic names one, and the control page reads one back — but
 * asking a student to choose between "Rise", "Drop", "Slide left" and "Slide right" as four
 * separate things is asking them to do the grouping in their head.
 *
 * Order is the order of the grid: the calm one first, then the one most graphics want, then
 * the energetic pair, then the two that need the right footage under them.
 */
export interface MotionDirection {
  id: MotionPresetId;
  arrow: string;
  /** The tooltip: which way the graphic travels, said as a direction and as an origin. */
  hint: string;
}

export interface MotionFamily {
  id: string;
  name: string;
  hint: string;
  /** What the card picks when the card itself is clicked rather than one of its arrows. */
  fallback: MotionPresetId;
  /** Empty for a family that is one motion. */
  directions: MotionDirection[];
}

export const MOTION_FAMILIES: MotionFamily[] = [
  { id: 'fade', name: 'Fade', hint: 'Dissolves up, dissolves away.', fallback: 'fade', directions: [] },
  {
    id: 'slide',
    name: 'Slide',
    hint: 'Travels in from one edge, back out the same way.',
    fallback: 'rise',
    directions: [
      { id: 'rise', arrow: '↑', hint: 'Up — enters from below' },
      { id: 'drop', arrow: '↓', hint: 'Down — enters from above' },
      { id: 'slide-right', arrow: '→', hint: 'Right — enters from the left edge' },
      { id: 'slide-left', arrow: '←', hint: 'Left — enters from the right edge' },
    ],
  },
  { id: 'pop', name: 'Pop', hint: 'Springs up to size, shrinks away.', fallback: 'pop', directions: [] },
  { id: 'zoom', name: 'Zoom', hint: 'Settles from larger, drifts off larger.', fallback: 'zoom', directions: [] },
  { id: 'blur', name: 'Blur', hint: 'Focuses in from a blur, blurs away.', fallback: 'blur', directions: [] },
  {
    id: 'wipe',
    name: 'Wipe',
    hint: 'Revealed behind a moving edge, retracts.',
    fallback: 'wipe-right',
    directions: [
      { id: 'wipe-right', arrow: '→', hint: 'Right — revealed left to right' },
      { id: 'wipe-left', arrow: '←', hint: 'Left — revealed right to left' },
    ],
  },
];

/** Every motion belongs to exactly one family; the grid depends on that being true. */
export function familyOf(id: MotionPresetId): MotionFamily {
  const f = MOTION_FAMILIES.find((x) => x.fallback === id || x.directions.some((d) => d.id === id));
  if (!f) throw new Error(`Motion ${id} is in no family — MOTION_FAMILIES has to cover the bank`);
  return f;
}

/**
 * The properties the renderer does NOT clamp — the transform channels, where a value is free
 * to go past its target and come back. Everything else a motion here animates is bounded at
 * one or both ends: `opacity` saturates at 1, an `inset()` percentage cannot be negative, a
 * blur radius cannot. This is the whole basis of `easingsForMotion` below, so it is written as
 * the renderer's rule rather than as a list of which motions get which curves.
 */
const UNCLAMPED_PROPS = new Set(['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY']);

/** Whether a motion moves the graphic through space or size — i.e. whether an overshooting or
 *  oscillating curve has anywhere to overshoot INTO. Read off the motion's own tracks. */
export function motionIsUnclamped(preset: MotionPreset): boolean {
  return [...Object.keys(preset.in.from), ...Object.keys(preset.out.from)].some((p) => UNCLAMPED_PROPS.has(p));
}

/**
 * The easing choices a motion can actually SHOW — the no-code list, in the order the dropdown
 * renders them ('auto' is not here; it is always first and always legal).
 *
 * Two filters, one rule each. `simple` drops the curves the measurement in model/easings.ts
 * found indistinguishable or wrong-direction (the same list for every motion). `needs` is the
 * per-motion half the owner asked for: a curve whose character is overshoot or oscillation is
 * offered only on a motion with an unclamped property to spend it on, so Fade, Blur and the
 * two Wipes stop offering Overshoot / Bounce / Spring — which on them render as, respectively,
 * a faster fade, a flicker, and nothing at all.
 *
 * Takes EVERY phase the choice will land on, because one easing setting drives both: a
 * displacement curve is offered only when it can be shown on all of them. "Rise in, Fade out"
 * therefore behaves like Fade for this question — an Overshoot that reads on the way on and
 * clamps on the way off is exactly the half-working control this list exists to remove.
 *
 * A phase that is `null` or absent is not on a universal motion (it holds one of the catalog's
 * own choreographies, which move whole boxes AND their parts) and asks nothing of the filter.
 */
export function easingsForMotions(ids: readonly (MotionPresetId | null | undefined)[]): EasingPreset[] {
  const presets = ids.filter((id): id is MotionPresetId => !!id).map(motionPresetById);
  const unclamped = presets.every(motionIsUnclamped);
  // …and a curve that IS one of these motions' own tuned pair is Auto under a second name.
  // Fade's tuned entrance is `sine.out`, so "Soft" on a Fade measured 0.00 different from
  // Auto at every frame of the entrance — the complaint this whole list exists to answer,
  // reproduced inside the answer. Exact string equality, deliberately: a similarity threshold
  // would be a number nobody could defend.
  const isAutoAgain = (e: EasingPreset) =>
    presets.some((p) => e.gsapIn === p.in.ease && e.gsapOut === p.out.ease);
  return EASINGS.filter((e) => e.simple && (unclamped || e.needs === 'time') && !isAutoAgain(e));
}

/** Whether a choice survives the motion(s) it sits beside — the picker falls back to 'auto'
 *  when it does not, rather than keeping a setting that is silently doing nothing. */
export function easingLegalForMotions(
  ids: readonly (MotionPresetId | null | undefined)[],
  choice: EasingId,
): boolean {
  return choice === 'auto' || easingsForMotions(ids).some((e) => e.id === choice);
}

export type MotionPhaseName = 'in' | 'out';

/** The step a phase rewrites: the entrance is steps[0], the exit is the final Out step. */
function phaseStepIndex(data: AnimData, phase: MotionPhaseName): number {
  return phase === 'in' ? 0 : data.steps.length - 1;
}

/** The tracks one phase writes on one target — two keyframes per property, the ease stamped
 *  INTO the landing keyframe so the motion keeps its curve whatever the step's own ease is
 *  (the step may still carry another graphic's tracks; see applyMotionPreset). `ease`
 *  overrides the preset's tuned curve (the wizard's Easing choice). */
export function motionTracks(phase: MotionPhase, ease: string = phase.ease): AnimLayerTracks {
  const tracks: AnimLayerTracks = {};
  for (const prop of Object.keys(phase.from)) {
    const from: AnimKeyframe = { time: 0, value: phase.from[prop] };
    const to: AnimKeyframe = { time: phase.duration, value: phase.to[prop], ease };
    tracks[prop] = [from, to];
  }
  return tracks;
}

/**
 * The graphic's UNIT(S): a selector for each direct element child of the data root, in
 * document order. Read off the HTML every time (the markup is the source of truth — an
 * import, a hand edit or an inserted part changes the answer). Each selector is the most
 * readable one that is UNIQUE in the document: the element's own id, else a class no other
 * element carries (`.lower-third-box`), else its position under the root. Empty when the
 * root is missing or childless — then there is nothing a unit motion can move, and the
 * picker says so instead of writing tracks at nothing.
 */
export function motionTargets(template: SpxTemplate, data: AnimData): string[] {
  const doc = parseHtml(template.html);
  const root = queryOne(doc, data.root);
  if (!root) return [];
  const children = Array.from(root.children);
  const targets: string[] = [];
  children.forEach((el, i) => {
    if (!isDrawn(el)) return;
    if (el.id && doc.querySelectorAll(`#${cssEscape(el.id)}`).length === 1) return targets.push(`#${el.id}`);
    for (const cls of Array.from(el.classList)) {
      if (doc.querySelectorAll(`.${cssEscape(cls)}`).length === 1) return targets.push(`.${cls}`);
    }
    targets.push(`${data.root} > :nth-child(${i + 1})`);
  });
  return targets;
}

/** The root children a template does not DRAW — the hidden data holders SPX writes into
 *  (`.noacg-data-source`, templates/shared/base.ts), script/style, form sources, anything
 *  hidden inline. A unit motion on those is noise in the data and nothing on screen. */
const UNDRAWN_TAGS = new Set(['script', 'style', 'template', 'link', 'meta', 'noscript', 'textarea', 'input', 'select']);
function isDrawn(el: Element): boolean {
  if (UNDRAWN_TAGS.has(el.tagName.toLowerCase())) return false;
  if (el.classList.contains('noacg-data-source') || el.hasAttribute('hidden')) return false;
  const style = (el.getAttribute('style') ?? '').replace(/\s+/g, '');
  return !/display:none|visibility:hidden/.test(style);
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** A tolerant querySelector: a selector the parser refuses (hand-written data) is "absent". */
function queryOne(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

function cssEscape(s: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, '\\$1');
}

/** Whether a layer's element lives INSIDE the root — the graphic's own part, whose entrance/
 *  exit the unit motion replaces — as opposed to beside it (an inserted graphic, a building
 *  block). A selector that resolves to nothing is treated as inside: a stale layer is this
 *  graphic's leftover, not another graphic's motion. */
function insideRoot(doc: Document, root: Element | null, selector: string): boolean {
  if (!root) return true;
  const el = queryOne(doc, selector);
  return !el || el === root || root.contains(el);
}

export interface MotionPick {
  in?: MotionPresetId;
  out?: MotionPresetId;
}

/** A curve choice over the presets' own (model/easings.ts resolves the wizard's named easing
 *  into this pair); absent = each preset's tuned ease. */
export interface MotionEases {
  easeIn?: string;
  easeOut?: string;
}

/**
 * Rewrite the entrance and/or exit of a data-block graphic with a universal motion. Pure:
 * returns new data, or null when nothing could be written (no unit to move, no phase
 * picked). The caller splices it in with writeAnimData + one applyTemplate / one save.
 *
 * Per rewritten step: the inside-the-root layers lose their non-looping tracks (the old
 * entrance/exit — a clean swap, exactly as the category presets do, so two picks never
 * blend), every target gets the motion's tracks, and the step is paced to the motion — or
 * longer, never shorter, when something kept (an outside layer, a loop, a call, a dynamic)
 * reaches further: a rewrite must never truncate motion it promised to keep.
 */
export function applyMotionPreset(
  template: SpxTemplate,
  data: AnimData,
  pick: MotionPick,
  eases: MotionEases = {},
): AnimData | null {
  const targets = motionTargets(template, data);
  if (targets.length === 0) return null;
  const phases: MotionPhaseName[] = (['in', 'out'] as const).filter((ph) => pick[ph] !== undefined);
  if (phases.length === 0) return null;

  const next = JSON.parse(JSON.stringify(data)) as AnimData;
  const doc = parseHtml(template.html);
  const root = queryOne(doc, data.root);

  for (const ph of phases) {
    const preset = motionPresetById(pick[ph]!);
    const phase = preset[ph];
    const ease = (ph === 'in' ? eases.easeIn : eases.easeOut) ?? phase.ease;
    const step = next.steps[phaseStepIndex(next, ph)];
    let foreignMotion = false;
    let reach = 0;

    // 1. Clear the old motion of this graphic's own parts; keep everything else.
    for (const selector of Object.keys(step.layers)) {
      const tracks = step.layers[selector];
      if (!insideRoot(doc, root, selector)) {
        foreignMotion = true;
        reach = Math.max(reach, lastTime(tracks));
        continue;
      }
      const loops = step.loops?.[selector] ?? {};
      const kept: AnimLayerTracks = {};
      for (const prop of Object.keys(tracks)) {
        if (loops[prop]) kept[prop] = tracks[prop]; // an ambient loop is behaviour, not the entrance
      }
      if (Object.keys(kept).length > 0) {
        step.layers[selector] = kept;
        reach = Math.max(reach, lastTime(kept));
      } else {
        delete step.layers[selector];
      }
    }

    // 2. Write the unit motion on every target. A target that carried a loop on one of the
    //    motion's own properties loses that loop: the written track owns the property now.
    for (const selector of targets) {
      const layer = step.layers[selector] ?? {};
      const written = motionTracks(phase, ease);
      for (const prop of Object.keys(written)) {
        layer[prop] = written[prop];
        if (step.loops?.[selector]?.[prop]) delete step.loops[selector][prop];
      }
      step.layers[selector] = layer;
    }
    tidyLoops(step);

    // 3. Pace the step: the motion's own length, stretched only by what was kept.
    for (const tracks of Object.values(step.loops ?? {})) {
      for (const loop of Object.values(tracks)) if (loop.range) reach = Math.max(reach, loop.range[1]);
    }
    for (const c of step.calls ?? []) reach = Math.max(reach, c.time);
    for (const d of step.dynamics ?? []) reach = Math.max(reach, d.time ?? 0);
    step.duration = round(Math.max(phase.duration, reach));
    // With no other graphic's tracks on the step, the step's own ease becomes the motion's
    // (the keyframes carry it either way; this keeps the Inspector's step ease honest).
    if (!foreignMotion) step.ease = ease;

    // 4. A styled lifecycle arrow plays INSTEAD of these keyframes — clear it.
    const main = next.machine?.groups[0];
    const edge = main?.transitions.find(
      (t) => t.trigger === 'lifecycle' && t.event === (ph === 'in' ? 'play' : 'stop'),
    );
    if (edge?.style !== undefined) {
      delete edge.style;
      delete edge.duration;
      delete edge.ease;
    }
  }
  return next;
}

/**
 * Which universal motion a phase currently holds, read back from the data — the picker's
 * active card. Nothing is stamped into the block for this (code is the single source of
 * truth, and a stamp could lie after a timeline edit): it matches when every target carries
 * exactly one preset's tracks and no other part inside the root animates in that step. A
 * hand-tuned or category choreography answers null — no card lit — which is the honest
 * state for motion this bank did not write. The curve is not part of the match: an easing
 * is a modifier picked beside the motion (the wizard's Easing select), not another motion.
 */
export function currentMotionPreset(template: SpxTemplate, data: AnimData, ph: MotionPhaseName): MotionPresetId | null {
  const targets = motionTargets(template, data);
  if (targets.length === 0) return null;
  const step = data.steps[phaseStepIndex(data, ph)];
  const doc = parseHtml(template.html);
  const root = queryOne(doc, data.root);
  const targetSet = new Set(targets);
  // Any inside-the-root layer that is not a target and animates (beyond its loops) means a
  // choreography richer than a unit motion is in place.
  for (const selector of Object.keys(step.layers)) {
    if (targetSet.has(selector) || !insideRoot(doc, root, selector)) continue;
    const loops = step.loops?.[selector] ?? {};
    if (Object.keys(step.layers[selector]).some((prop) => !loops[prop])) return null;
  }
  for (const preset of MOTION_PRESETS) {
    const expected = motionTracks(preset[ph]);
    const matches = targets.every((selector) => {
      const layer = step.layers[selector];
      if (!layer) return false;
      const loops = step.loops?.[selector] ?? {};
      const motionProps = Object.keys(layer).filter((prop) => !loops[prop]);
      if (motionProps.length !== Object.keys(expected).length) return false;
      return motionProps.every((prop) => sameTrack(layer[prop], expected[prop]));
    });
    if (matches) return preset.id;
  }
  return null;
}

/**
 * The ease STRING a phase currently carries, or null when its targets disagree (a hand edit) or
 * carry no motion. Read off the landing keyframes, which is where `motionTracks` stamps it — the
 * step's own `ease` is only a fallback for tracks that named none, so asking the keyframes is
 * asking what actually plays.
 */
function phaseEase(template: SpxTemplate, data: AnimData, ph: MotionPhaseName): string | null {
  const targets = motionTargets(template, data);
  if (targets.length === 0) return null;
  const step = data.steps[phaseStepIndex(data, ph)];
  let found: string | null = null;
  for (const selector of targets) {
    const layer = step.layers[selector];
    if (!layer) return null;
    const loops = step.loops?.[selector] ?? {};
    for (const prop of Object.keys(layer)) {
      if (loops[prop]) continue; // an ambient loop's curve is not the entrance's
      const kfs = layer[prop];
      const ease = kfs[kfs.length - 1]?.ease ?? step.ease;
      if (ease === undefined) return null;
      if (found === null) found = ease;
      else if (found !== ease) return null;
    }
  }
  return found;
}

/**
 * Which EASING CHOICE the data currently holds — the read-back behind a no-code Easing control,
 * derived from the code like the lit card is, never stamped into the block.
 *
 * One easing setting drives every phase that holds a universal motion, so all of them are read
 * and they have to agree. A phase sitting on its motion's own tuned curve is 'auto' — that is
 * literally what Auto means here (applyMotionPreset falls back to `phase.ease` when given no
 * override), so a graphic that was never given a curve reads back as Auto rather than as
 * whichever named preset happens to share that GSAP string.
 *
 * Anything the list cannot name — a hand-tuned curve from the timeline, a phase whose targets
 * disagree — also answers 'auto': the honest thing for a control that cannot show it, and the
 * pick that leaves the existing motion alone until the operator chooses something.
 */
export function currentMotionEasing(
  template: SpxTemplate,
  data: AnimData,
  ids: { in: MotionPresetId | null; out: MotionPresetId | null },
): EasingId {
  const phases = (['in', 'out'] as const).filter((ph) => ids[ph]);
  if (phases.length === 0) return 'auto';
  const held = phases.map((ph) => ({ ph, ease: phaseEase(template, data, ph) }));
  if (held.some((h) => h.ease === null)) return 'auto';
  if (held.every((h) => h.ease === motionPresetById(ids[h.ph]!)[h.ph].ease)) return 'auto';
  const named = EASINGS.find((e) => held.every((h) => h.ease === (h.ph === 'in' ? e.gsapIn : e.gsapOut)));
  return named?.id ?? 'auto';
}

/** The { easeIn, easeOut } overrides a choice hands `applyMotionPreset`: 'auto' overrides
 *  nothing, so each motion keeps its own tuned pair. */
export function easesForChoice(choice: EasingId): MotionEases {
  if (choice === 'auto') return {};
  const e = EASINGS.find((x) => x.id === choice);
  return e ? { easeIn: e.gsapIn, easeOut: e.gsapOut } : {};
}

function sameTrack(a: AnimKeyframe[] | undefined, b: AnimKeyframe[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((k, i) => k.time === b[i].time && k.value === b[i].value);
}

function lastTime(tracks: AnimLayerTracks): number {
  let t = 0;
  for (const kfs of Object.values(tracks)) for (const k of kfs) t = Math.max(t, k.time);
  return t;
}

/** Drop emptied loop maps so the serialized block never carries `"loops": {}` noise. */
function tidyLoops(step: AnimStep): void {
  if (!step.loops) return;
  for (const selector of Object.keys(step.loops)) {
    if (Object.keys(step.loops[selector]).length === 0) delete step.loops[selector];
  }
  if (Object.keys(step.loops).length === 0) delete step.loops;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
