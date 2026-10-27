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
  appearanceEquals,
  appearanceOf,
  appearanceToSend,
  IDENTITY,
  effectiveAdjust,
  geometryLimit,
  measureId,
  pivotZone,
  resolveFrame,
  measureStyleKey,
  styleKey,
  type AppearanceFrame,
  type AppearanceStyle,
  type AppliedAppearance,
  type EffectiveAdjust,
  type GeometryLimit,
  type LookLayer,
  type Measurement,
  type Size,
} from './cueAdjust.ts';

/** What a cue's style resolves against (control/cueStyle.ts `styleContextFor`): the production's
 *  imported faces and the resolve that turns a fold into variables and faces. Handed in rather
 *  than imported: the face registry it reads (model/fonts.ts) loads a bundled text file, which
 *  the plain-Node tests of the playout modules that import this one cannot load. */
export interface StyleContext {
  imported: readonly { family: string; assetPath: string }[];
  resolve: (eff: Pick<EffectiveAdjust, 'vars' | 'font'>, imported: StyleContext['imported']) => AppearanceStyle | null;
  /** The production look on a pool graphic while it is on (phase 3, control/productionLook.ts
   *  `lookLayerFor`): the fold's widest scope, by pool graphic id. Absent or undefined: none. */
  lookFor?: (graphicId: string) => LookLayer | undefined;
}

/** No style: a surface that resolves none (a production's own context comes from cueStyle.ts). */
export const NO_STYLE_CONTEXT: StyleContext = { imported: [], resolve: () => null };

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
export function createMeasurer(
  part: StorePart<GeometryPart>,
  io: MeasurerIo,
  alive: () => boolean = () => true,
  timers: { setTimeout: (run: () => void, ms: number) => unknown; clearTimeout: (t: unknown) => void } = {
    setTimeout: (run, ms) => setTimeout(run, ms),
    clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  },
) {
  let wanted = new Map<string, MeasureJob>();
  /** Jobs a press or Publish waits on: measured before anything else, and kept when the background
   *  list is replaced (a render re-wanting it must not drop the job a press is waiting for). */
  const urgent = new Map<string, MeasureJob>();
  const waiters = new Set<(finished: MeasureJob) => void>();
  let running: MeasureJob | null = null;
  let idle: (() => void)[] = [];
  const settleIdle = () => {
    if (running || [...wanted.values(), ...urgent.values()].some(due)) return;
    const waiting = idle;
    idle = [];
    for (const done of waiting) done();
  };
  const due = (job: MeasureJob) => part.get().byCue[job.cueId]?.id !== job.id;
  const next = () => {
    if (running || !alive()) return settleIdle();
    const job = [...urgent.values()].find(due) ?? [...wanted.values()].find(due);
    if (!job) return settleIdle();
    running = job;
    void io
      .measure(job.input)
      .catch(() => null)
      .then((m) => {
        running = null;
        const asked = urgent.get(job.cueId)?.id === job.id || wanted.get(job.cueId)?.id === job.id;
        if (m && alive() && asked) part.set(measured(part.get(), job.cueId, job.graphicId, job.id, m));
        // A cue the document could not measure is not asked again for the same identity, unless a
        // press asks for it (`now`).
        if (!m && wanted.get(job.cueId)?.id === job.id) wanted.delete(job.cueId);
        if (urgent.get(job.cueId)?.id === job.id) urgent.delete(job.cueId);
        for (const wake of [...waiters]) wake(job);
        next();
      });
  };
  return {
    want: (jobs: readonly MeasureJob[]) => {
      wanted = new Map(jobs.map((j) => [j.cueId, j] as const));
      next();
    },
    /**
     * A PRESS THAT NEEDS THIS CUE'S BOX NOW (a Take of a cue with a preset and no measurement yet):
     * measured before every other cue, answering once it has a measurement for this identity, the
     * attempt ended, or `capMs` passed, whichever is first. The press then resolves with what the
     * session holds, never with nothing when a measurement could be had.
     */
    now: (job: MeasureJob, capMs: number): Promise<void> =>
      new Promise((resolve) => {
        if (!due(job)) return resolve();
        const wake = (finished: MeasureJob | null) => {
          // Another attempt ended (another cue's, or this cue's for an older identity): this one's
          // is still coming.
          if (finished !== null && (finished.cueId !== job.cueId || finished.id !== job.id) && due(job)) return;
          waiters.delete(wake);
          timers.clearTimeout(timer);
          resolve();
        };
        const timer = timers.setTimeout(() => wake(null), capMs);
        waiters.add(wake);
        urgent.set(job.cueId, job);
        next();
      }),
    /** Answers once nothing is queued or running, or after `capMs`, whichever is first. */
    drain: (capMs: number): Promise<void> =>
      new Promise((resolve) => {
        const timer = timers.setTimeout(resolve, capMs);
        idle.push(() => {
          timers.clearTimeout(timer);
          resolve();
        });
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
  /** The style half (phase 2), null for none, and its key, what a surface compares to know it changed. */
  style: AppearanceStyle | null;
  styleId: string;
  /** The part of the style the measured box depends on (cueAdjust.ts `measureStyleKey`). */
  measureStyleId: string;
  /** What a Take or a full Update carries (rule 2): undefined for a graphic nobody adjusted. */
  send: AppliedAppearance | undefined;
}

/** A waiting change (the fate line, the rundown row): what a Take or Update of the cue would carry
 *  differs from what its graphic holds applied. Nothing waits for a graphic nobody adjusted. */
export function placeWaiting(state: Pick<CueAdjustState, 'send'> | null, applied: AppliedAppearance | null | undefined): boolean {
  return !!state?.send && !appearanceEquals(state.send, applied ?? IDENTITY);
}

/** WHAT A SEND TO ON-AIR GRAPHICS CARRIES for the cue a graphic airs (phase 3): its style as the
 *  fold now gives it (the production look, under the graphic's and the cue's own), beside the
 *  place and size the graphic already holds, never a prepared one: the press sends a look, so a
 *  nudge still being made waits for its Update as a half-typed name does. Undefined when nothing
 *  would change. */
export function lookAppearance(state: Pick<CueAdjustState, 'style'> | null, applied: AppliedAppearance | null | undefined): AppliedAppearance | undefined {
  const next = appearanceOf(applied?.frame ?? null, state?.style ?? null);
  return appearanceEquals(next, applied ?? IDENTITY) ? undefined : next;
}

/** A Take or Update of this cue must wait (capped) for a measurement of its values as they are now:
 *  its preset or its size resolves against the box, and the box it holds is for other values or
 *  none (a longer name typed just before the press, a feed moving a bound value). */
export function pressWaitsForBox(state: Pick<CueAdjustState, 'eff' | 'fresh'> | null): boolean {
  return !!state && !state.fresh && (!!state.eff.place || (state.eff.scale ?? 1) !== 1);
}

/** How long a Take or Update waits for an Adjust press still being written. */
export const PRESS_WRITE_CAP_MS = 1_000;
/** How long a Take or Update waits for a measurement of the values it airs. */
export const PRESS_MEASURE_CAP_MS = 2_000;

/** Adjust writes still in the history's queue: a press waits for them (`pressAppearance`). */
export function pendingWrites() {
  let pending = 0;
  return {
    hold: (write: Promise<unknown>) => {
      pending += 1;
      void write.finally(() => {
        pending -= 1;
      });
    },
    pending: () => pending,
  };
}

/**
 * THE PLACE AND SIZE A TAKE OR UPDATE CARRIES, read after the press's flush. An Adjust press still
 * being written goes first (capped), and the record is then read from storage, not from a render:
 * ← then Take airs the ←. A cue whose preset or size has no measurement of the values it airs is
 * then measured first (capped, `pressWaitsForBox`). A production nobody adjusts answers at once,
 * without a promise.
 */
export function pressAppearance<R>(
  io: {
    pendingWrites: () => number;
    /** Answers once the queued writes have landed. */
    settleWrites: () => Promise<unknown>;
    /** The newest record the page rendered, and the stored one (read after a wait). */
    rendered: () => R | null;
    stored: () => R | null;
    stateOf: (record: R | null) => CueAdjustState | null;
    jobOf: (record: R) => MeasureJob | undefined;
    now: (job: MeasureJob, capMs: number) => Promise<void>;
    setTimeout: (run: () => void, ms: number) => unknown;
  },
  caps: { writeMs: number; measureMs: number } = { writeMs: PRESS_WRITE_CAP_MS, measureMs: PRESS_MEASURE_CAP_MS },
): AppliedAppearance | undefined | Promise<AppliedAppearance | undefined> {
  const resolveFor = (record: R | null) => {
    const state = io.stateOf(record);
    if (!state || !pressWaitsForBox(state) || !record) return state?.send;
    const job = io.jobOf(record);
    return job ? io.now(job, caps.measureMs).then(() => io.stateOf(record)?.send) : state.send;
  };
  if (io.pendingWrites() === 0) return resolveFor(io.rendered());
  return Promise.race([io.settleWrites(), new Promise<void>((resolve) => io.setTimeout(resolve, caps.writeMs))]).then(() =>
    resolveFor(io.stored() ?? io.rendered()),
  );
}

export function cueAdjustState(
  /** `savedAt`: when the design it resolves to was last edited (model/library.ts `designEditedAt`),
   *  part of the identity a measurement is for. */
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
  /** What the style resolves against (phase 2): the production's imported faces. */
  styleCtx: StyleContext = NO_STYLE_CONTEXT,
): CueAdjustState {
  const eff = effectiveAdjust(graphic.adjust, cue.adjust, styleCtx.lookFor?.(graphic.id));
  const style = styleCtx.resolve(eff, styleCtx.imported);
  const styleId = styleKey(appearanceOf(null, style));
  const measureStyleId = measureStyleKey(appearanceOf(null, style));
  const { m, fresh } = geometryOf(geometry, cue.id, graphic.id, measureId(graphic.id, graphic.savedAt, cue.id, values, stage, measureStyleId));
  const frame = resolveFrame(eff, m, frameSize, stage);
  return {
    style,
    styleId,
    measureStyleId,
    eff,
    m,
    fresh,
    limit: geometryLimit(m, frameSize),
    pivot: pivotZone(eff, m?.info ?? m?.paint ?? null, frameSize),
    frame,
    look: appearanceOf(frame, style),
    send: appearanceToSend(frame, eff, applied, adjustedElsewhere, style),
  };
}
