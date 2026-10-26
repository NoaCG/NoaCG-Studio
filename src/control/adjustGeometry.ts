// WHAT THE PAGE HAS MEASURED OF EACH CUE (docs/work-specs/playout-adjustments/spec.md, "Where the box
// lives" and "Stale geometry"), held in the session, never in the show: a settle on PREVIEW must not
// write the production (every write stamps `updatedAt`, which republishes, saves and syncs).
//
// One entry per cue: the last QUALIFIED measurement (./cueAdjust.ts `qualify`) and the identity it
// was taken for (`measureId`). A cue whose current identity has no measurement yet keeps its last
// one: the block says "measuring" and a Take sends the placement that one gives, never nothing and
// never a guess. A cue measured never takes its graphic's latest measurement of any cue instead.
//
// Two roads write it: PREVIEW's own document after each settle (home/PlayoutMonitors.tsx), and a
// background measurer for the adjusted cues PREVIEW has not shown (`createMeasurer`, its browser half
// behind `io.measure`, components/home/measureCue.ts). Node-tested with a fake `measure`.

import type { StorePart } from './storePart';
import type { Zone9 } from '../model/adjust';
import {
  appearanceOf,
  appearanceToSend,
  effectiveAdjust,
  geometryLimit,
  measureId,
  pivotZone,
  resolveFrame,
  type AppearanceFrame,
  type AppliedAppearance,
  type EffectiveAdjust,
  type GeometryLimit,
  type Measurement,
  type Size,
} from './cueAdjust.ts';

export interface GeometryEntry {
  /** The identity the measurement was taken for. */
  id: string;
  m: Measurement;
}

export interface GeometryPart {
  /** By cue id. */
  byCue: Readonly<Record<string, GeometryEntry>>;
  /** By pool graphic id: the newest measurement of any of its cues, for a cue never measured. */
  byGraphic: Readonly<Record<string, Measurement>>;
}

export const NO_GEOMETRY: GeometryPart = { byCue: {}, byGraphic: {} };

/** Keep a qualified measurement for a cue. */
export function measured(part: GeometryPart, cueId: string, graphicId: string, id: string, m: Measurement): GeometryPart {
  const was = part.byCue[cueId];
  if (was && was.id === id && JSON.stringify(was.m) === JSON.stringify(m)) return part;
  return { byCue: { ...part.byCue, [cueId]: { id, m } }, byGraphic: { ...part.byGraphic, [graphicId]: m } };
}

/** What the page resolves a cue against: its measurement for this identity (`fresh`), else its last
 *  one, else its graphic's newest, else none. */
export function geometryOf(part: GeometryPart, cueId: string, graphicId: string, id: string): { m: Measurement | null; fresh: boolean } {
  const own = part.byCue[cueId];
  if (own) return { m: own.m, fresh: own.id === id };
  return { m: part.byGraphic[graphicId] ?? null, fresh: false };
}

/** One cue the background measurer should measure. */
export interface MeasureJob {
  cueId: string;
  graphicId: string;
  /** Its identity now. */
  id: string;
  /** What the browser half needs to compose and settle it. */
  input: unknown;
}

export interface MeasurerIo {
  /** Compose, settle and measure twice, answering the qualified measurement or null. */
  measure: (input: unknown) => Promise<Measurement | null>;
}

/**
 * THE BACKGROUND MEASURER: one document at a time, for the adjusted cues whose identity has no
 * measurement. `want` replaces the list (the newest identity of each cue wins); an answer for an
 * identity no longer wanted is dropped, so a slow answer never overwrites a newer one. `drain`
 * answers when nothing is queued or running (Publish waits on it, capped by its caller).
 */
export function createMeasurer(part: StorePart<GeometryPart>, io: MeasurerIo, alive: () => boolean = () => true) {
  let wanted = new Map<string, MeasureJob>();
  let running: MeasureJob | null = null;
  let idle: (() => void)[] = [];
  const settleIdle = () => {
    if (running || [...wanted.values()].some(due)) return;
    const waiting = idle;
    idle = [];
    for (const done of waiting) done();
  };
  const due = (job: MeasureJob) => part.get().byCue[job.cueId]?.id !== job.id;
  const next = () => {
    if (running || !alive()) return settleIdle();
    const job = [...wanted.values()].find(due);
    if (!job) return settleIdle();
    running = job;
    void io
      .measure(job.input)
      .catch(() => null)
      .then((m) => {
        running = null;
        if (m && alive() && wanted.get(job.cueId)?.id === job.id) part.set(measured(part.get(), job.cueId, job.graphicId, job.id, m));
        // A cue the document could not measure is not asked again for the same identity.
        if (!m && wanted.get(job.cueId)?.id === job.id) wanted.delete(job.cueId);
        next();
      });
  };
  return {
    want: (jobs: readonly MeasureJob[]) => {
      wanted = new Map(jobs.map((j) => [j.cueId, j] as const));
      next();
    },
    drain: (): Promise<void> =>
      new Promise((resolve) => {
        idle.push(resolve);
        settleIdle();
      }),
  };
}

/** Everything the page knows of one cue's place and size, decided here so the editor, PREVIEW, the
 *  unsent comparison and the verbs read one answer. */
export interface CueAdjustState {
  /** The fold of both scopes. */
  eff: EffectiveAdjust;
  /** The measurement it resolves against, and whether it is this identity's. */
  m: Measurement | null;
  fresh: boolean;
  limit: GeometryLimit;
  /** The zone the size acts about, which the grid marks. */
  pivot: Zone9;
  /** The resolved transform, null for the identity. */
  frame: AppearanceFrame | null;
  /** What PREVIEW applies. */
  look: AppliedAppearance;
  /** What a Take or a full Update carries (rule 2): undefined for a graphic nobody adjusted. */
  send: AppliedAppearance | undefined;
}

export function cueAdjustState(
  graphic: { id: string; savedAt: string; adjust?: unknown },
  cue: { id: string; adjust?: unknown },
  frameSize: Size,
  stage: Size,
  values: Readonly<Record<string, string>>,
  geometry: GeometryPart,
  /** What the graphic holds applied now, as this page believes. */
  applied: AppliedAppearance | null | undefined,
  /** Another cue of the same graphic has its own record. */
  adjustedElsewhere: boolean,
): CueAdjustState {
  const eff = effectiveAdjust(graphic.adjust, cue.adjust);
  const { m, fresh } = geometryOf(geometry, cue.id, graphic.id, measureId(graphic.id, graphic.savedAt, cue.id, values, stage));
  const frame = resolveFrame(eff, m, frameSize, stage);
  return {
    eff,
    m,
    fresh,
    limit: geometryLimit(m, frameSize),
    pivot: pivotZone(eff, m?.info ?? m?.paint ?? null, frameSize),
    frame,
    look: appearanceOf(frame),
    send: appearanceToSend(frame, eff, applied, adjustedElsewhere),
  };
}
