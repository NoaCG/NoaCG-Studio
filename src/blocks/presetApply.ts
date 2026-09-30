// Timeline v2 Phase 5 — presets as keyframe generators (docs/TIMELINE_V2_PLAN.md,
// decision 8). A preset's keyframe form is DERIVED from its legacy emitter through the
// parity-proven importer: emit the preset's region for a scratch copy of this template,
// convert it, and lift out the entrance/exit tracks. One choreography source, zero taste
// drift, and the result is ordinary editable keyframes.
//
// Application semantics (ratified: a preset apply is a CLEAN SWAP, not a merge):
// - applying REPLACES the targeted layer's motion in the chosen direction — the layer's
//   tracks in that step are cleared first, so switching presets never leaves the previous
//   preset's (or a hand-keyed) track behind. Apply is a true swap, predictable and
//   first-class; keep hand-authored motion in the OTHER direction or on other layers;
// - the operator picks the direction (In/Out/Both), an easing, and a duration; easing rides
//   on the written keyframes (per-layer, so it never disturbs a shared step), duration sets
//   the target step's length and scales the donor keyframes to fit;
// - "In" is relative to the layer: it targets the step where THAT layer becomes active;
// - "Out" always targets the final step; "Both" writes both, independently editable after;
// - selecting the WHOLE GRAPHIC applies the preset's full choreography (every donor layer),
//   adopting the chosen (or the donor's) step duration and ease — the whole-preset swap.

import type { SpxTemplate } from '../model/types';
import type { AnimPresetId } from '../model/wizard';
import { emitPresetRegion } from './presetRegistry';
import { importAnimData } from './animImport';
import { layerPress } from './animEdit';
import { activationStep } from './animEval';
import type { AnimData } from './animData';

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Build a preset's donor data for THIS template: its legacy emit (steps off — press
 *  choreography lives in the target's own reveal steps), converted via the importer.
 *  Returns null for presets/templates outside the standard structure contract. */
export function presetDonor(
  template: SpxTemplate,
  data: AnimData,
  presetId: AnimPresetId,
  eases?: { easeIn?: string; easeOut?: string },
): AnimData | null {
  const region = emitPresetRegion(template, presetId, { speed: data.speed, ...eases });
  return region ? importAnimData({ ...template, js: region }) : null;
}

export type PresetScope = 'all' | string; // 'all' = the whole graphic, else one selector

/** Optional per-direction duration/delay overrides (in EFFECTIVE seconds — what the
 *  operator sees; stored times are speed-relative, so we multiply by data.speed). */
export interface PresetDurations {
  /** Entrance length; targets the step where the scope becomes active. */
  inDuration?: number;
  /** Exit length; targets the final (Out) step. */
  outDuration?: number;
  /** Hold before the entrance motion starts: the keyframes shift later within the step,
   *  and the layer holds its first keyframe's pose through the wait (the interpreter
   *  applies a track's first keyframe at the step start). The step grows to fit. */
  inDelay?: number;
  /** Hold before the exit motion starts (same shift, on the final step). */
  outDelay?: number;
}

/**
 * Write a donor's tracks onto one layer of a target step as a CLEAN SWAP: the layer's
 * prior tracks in that step are cleared first, so a new preset never blends with the one
 * it replaces (ratification: applying a preset replaces the element's motion in that
 * direction). `refDurStored` is the donor phase's designed length (stored clock) used to
 * scale the keyframes when the operator picks a duration; returns the step's new stored
 * length so 'all'-scope can settle one shared duration for the whole phase.
 */
function swapLayerTracks(
  targetStep: AnimData['steps'][number],
  selector: string,
  tracks: import('./animData').AnimLayerTracks,
  refDurStored: number,
  chosenEffSec: number | undefined,
  speed: number,
  stepEase: string,
  delayStored = 0,
): number {
  const layer: import('./animData').AnimLayerTracks = {};
  targetStep.layers[selector] = layer; // clean swap — drop whatever this step held for the layer
  let maxT = 0;
  for (const [prop, kfs] of Object.entries(tracks)) {
    // Carry the phase's easing onto each keyframe (ease INTO it). The donor's easing lives
    // on its step; stamping it here keeps a single-layer apply's easing choice intact
    // without touching the other layers that share the target step. Keyframes that already
    // carry their own ease (multi-segment presets) are left as-authored.
    layer[prop] = kfs.map((k) => (k.ease ? { ...k } : { ...k, ease: stepEase }));
    for (const k of kfs) maxT = Math.max(maxT, k.time);
  }
  let end = maxT;
  if (chosenEffSec !== undefined && Number.isFinite(chosenEffSec) && chosenEffSec > 0 && refDurStored > 0) {
    const storedD = round(chosenEffSec * speed);
    const scale = storedD / refDurStored;
    for (const prop of Object.keys(layer)) {
      layer[prop] = layer[prop].map((k) => ({ ...k, time: round(k.time * scale) }));
    }
    end = storedD;
  }
  // The delay is a plain time shift: the layer holds its first keyframe's pose (applied at
  // the step start by the interpreter) until the motion begins.
  if (delayStored > 0) {
    for (const prop of Object.keys(layer)) {
      layer[prop] = layer[prop].map((k) => ({ ...k, time: round(k.time + delayStored) }));
    }
    end = round(end + delayStored);
  }
  return end;
}

/**
 * Apply a donor's keyframes onto the data. Pure; returns new data (or null when the donor
 * offers nothing for the scope). The targeted layer's motion in each direction is REPLACED
 * (a clean swap), so switching presets never leaves the previous preset's tracks behind.
 * Other layers and the untouched direction are left alone.
 */
export function applyPresetData(
  data: AnimData,
  donor: AnimData,
  phase: 'in' | 'out' | 'both',
  scope: PresetScope,
  durations?: PresetDurations,
): AnimData | null {
  const next = JSON.parse(JSON.stringify(data)) as AnimData;
  const speed = data.speed || 1;
  const phases: ('in' | 'out')[] = phase === 'both' ? ['in', 'out'] : [phase];
  let touched = false;

  for (const ph of phases) {
    const donorStep = ph === 'in' ? donor.steps[0] : donor.steps[donor.steps.length - 1];
    const refDur = donorStep.duration;
    const chosen = ph === 'in' ? durations?.inDuration : durations?.outDuration;
    const delayEff = ph === 'in' ? durations?.inDelay : durations?.outDelay;
    const delay = delayEff !== undefined && Number.isFinite(delayEff) && delayEff > 0 ? round(delayEff * speed) : 0;

    if (scope === 'all') {
      const targetStep = ph === 'in' ? next.steps[0] : next.steps[next.steps.length - 1];
      // Clean swap for the WHOLE step: drop everything it held so switching presets never
      // leaves the previous preset's tracks behind on layers the new preset doesn't touch.
      targetStep.layers = {};
      delete targetStep.carried;
      let longest = 0;
      for (const [selector, tracks] of Object.entries(donorStep.layers)) {
        // A press-revealed layer's entrance belongs to its » press, not to ▶ Play —
        // exactly the classic rule (assigned parts drop from the intro choreography).
        if (ph === 'in' && layerPress(next, selector) !== -1) continue;
        longest = Math.max(longest, swapLayerTracks(targetStep, selector, tracks, refDur, chosen, speed, donorStep.ease, delay));
        touched = true;
      }
      // The whole-graphic swap adopts one pace for the phase: the operator's choice, else
      // the preset's designed length (plus any hold before the motion). Easing rides on
      // the donor's keyframes/step ease.
      const t = ph === 'in' ? next.steps[0] : next.steps[next.steps.length - 1];
      t.duration =
        chosen !== undefined && chosen > 0
          ? round(chosen * speed + delay)
          : Math.max(round(donorStep.duration + delay), longest);
      t.ease = donorStep.ease;
      // Lifecycle hooks are step-level, not layer motion — the whole-graphic swap replaces
      // the target phase's calls with the donor's (a clock preset carries its start/stop),
      // scaled to the settled MOTION length (the duration minus the hold) and shifted with
      // it, so the call keeps its place in the entrance.
      const motionDur = t.duration - delay;
      const scale = donorStep.duration > 0 ? motionDur / donorStep.duration : 1;
      if (donorStep.calls && donorStep.calls.length > 0) {
        t.calls = donorStep.calls.map((c) => ({ time: round(c.time * scale + delay), call: c.call }));
        touched = true;
      } else {
        delete t.calls;
      }
      // Measured motion is step-level too, and it is the WHOLE point of a dynamic category's
      // preset: swapping a ticker from Marquee to Item flip is swapping which builder the
      // step names. Carrying the donor's `dynamics` here is what makes that swap a pure data
      // edit — the builders themselves already ship in the template, outside the region, so
      // nothing outside the marked block has to be rewritten (docs/DYNAMIC_MOTION_SCOPE.md §7).
      if (donorStep.dynamics && donorStep.dynamics.length > 0) {
        t.dynamics = donorStep.dynamics.map((d) => ({
          time: round((d.time ?? 0) * scale + delay),
          build: d.build,
          ...(d.target ? { target: d.target } : {}),
        }));
        touched = true;
      } else {
        delete t.dynamics;
      }
    } else {
      // One layer: its own donor tracks when the donor animates it; otherwise the donor's
      // first line's motion, retargeted (so an image/block can take a line-style preset);
      // otherwise the donor's box motion — the whole-unit presets (an imported design's
      // Fade/Slide/Pop/Blur) animate ONLY `.{prefix}-box`, and this retarget is what lets
      // them apply to a single layer (the artwork, one placed line) from the Inspector.
      let tracks: import('./animData').AnimLayerTracks | undefined = donorStep.layers[scope];
      if (!tracks) {
        const lineSel = Object.keys(donorStep.layers).find((s) => /^#f\d+$/.test(s));
        tracks = lineSel ? donorStep.layers[lineSel] : undefined;
      }
      if (!tracks) {
        const boxSel = Object.keys(donorStep.layers).find((s) => s.endsWith('-box'));
        tracks = boxSel ? donorStep.layers[boxSel] : undefined;
      }
      if (!tracks) continue;
      const targetIdx = ph === 'out' ? next.steps.length - 1 : activationStep(next, scope);
      const targetStep = next.steps[targetIdx];
      const written = swapLayerTracks(targetStep, scope, tracks, refDur, chosen, speed, donorStep.ease, delay);
      touched = true;
      // Honour the chosen duration (plus the hold); otherwise stretch so the delayed
      // motion never truncates.
      if (chosen !== undefined && chosen > 0) targetStep.duration = round(chosen * speed + delay);
      else if (targetStep.duration < written) targetStep.duration = round(written);
    }
  }
  return touched ? next : null;
}
