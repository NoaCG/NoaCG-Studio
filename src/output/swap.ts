// THE OUTPUT TAKES A PUBLISH ONE GRAPHIC AT A TIME
// (docs/work-specs/per-graphic-replacement/spec.md; the rule is ./swapPlan.ts).
//
// What a publish changes is built one graphic at a time in a hidden frame beside the running ones
// (stage.ts `prepare`), and checked as READY checks a boot (load, fonts, script error: D1). A frame
// that passes takes over its graphic when ./swapPlan.ts says so; one that fails is removed, and its
// graphic keeps the frame it has and is named (AC-4). New graphics join the way a boot builds them
// (D4); a graphic the publish dropped leaves once it is off air. Nothing here reloads the page (D2)
// or sends a command: each output does this on its own (G2).
//
// A graphic's DATA is not a version (G1): every command keeps reaching the frame airing, and a frame
// that takes over is first handed the values its graphic holds, so a Take after the swap airs them.
//
// Old CEF: CasparCG 2.3 runs this in Chromium 71.

import type { OutputGraphicSpec, OutputPayload } from '../control/hostedControl';
import { warmVerdict, type GraphicCheck, type ReadyIssue } from '../control/readiness';
import type { SoundAssetRef } from '../model/types';
import { CATCH_UP_TIMING, readGraphic, stoodStill, wait } from './catchUp';
import { FRAME_LOAD_MS, type OutputStage, type StagedFrame } from './stage';
import { planPublish, swapsNow } from './swapPlan';

/** A frame still moving this long after its Out takes the change anyway: an exit is a second or
 *  two, and an off-air graphic that never stands still is not one anybody can see. A graphic off
 *  air for longer than this takes its change at once. */
const SETTLE_CAP_MS = 10_000;

export interface Swapper {
  /** Build what `payload` changes for this output, one frame at a time, swapping each change in as
   *  soon as the rule allows. `progress` counts the builds; resolves with how many there were. */
  apply(payload: OutputPayload, progress: (n: number, of: number) => void): Promise<number>;
  /** A Take reached `graphic`: a change waiting for it takes over first, so the Take airs it, and
   *  the frame it replaces is cut as a Re-take cuts its own entrance (G1). */
  beforePlay(graphic: string): void;
  /** `graphic` went off air here: what waits for it takes over once its exit has finished. */
  afterStop(graphic: string): void;
  /** Look again at everything waiting: air can clear without a stop reaching this graphic. */
  tick(): void;
  /** Graphics with a change waiting because they are on air here. */
  waiting(): string[];
  /** The changes that failed, one issue each. */
  failed(): ReadyIssue[];
  /** Every graphic holds the version `next` stamps, and nothing waits or failed. */
  holds(next: Readonly<Record<string, string>>, keys: readonly string[]): boolean;
}

export interface SwapperOptions {
  stage: Pick<OutputStage, 'prepare' | 'add' | 'remove' | 'requestState' | 'motion' | 'replies'>;
  /** Per graphic, the digest of the frame the boot built ('' when the boot payload had no stamp). */
  held: Record<string, string>;
  /** Whether `graphic` is on air on this output now. */
  onAir(graphic: string): boolean;
  /** The values `graphic` holds now (handed to a frame as it takes over), or null. */
  data(graphic: string): Record<string, string> | null;
  /** The values a new frame is warmed with: what the graphic holds, or its first cue's. */
  warmData(graphic: string, payload: OutputPayload): Record<string, string> | null;
  /** How a frame built for `payload` loads its sounds. */
  loadSound?(payload: OutputPayload): ((asset: SoundAssetRef) => Promise<Blob>) | undefined;
  /** A graphic took a new frame, with what READY found checking it. */
  onSwapped(graphic: string, spec: OutputGraphicSpec, check: GraphicCheck): void;
  /** A graphic joined the stage, from `payload`. */
  onAdded(spec: OutputGraphicSpec, payload: OutputPayload): void;
  onRemoved(graphic: string): void;
  /** A change took over, or a graphic left: what `waiting` and `holds` answer may have moved. */
  changed(): void;
  now?: () => number;
}

interface Ready {
  digest: string;
  frame: StagedFrame;
  check: GraphicCheck;
}

export function createSwapper(opts: SwapperOptions): Swapper {
  const now = opts.now ?? (() => Date.now());
  const stage = opts.stage;
  const held: Record<string, string> = { ...opts.held };
  const ready = new Map<string, Ready>();
  /** Graphics the published version no longer has: they leave once off air. */
  const gone = new Set<string>();
  const failures = new Map<string, ReadyIssue>();
  /** When each graphic last went off air here: an exit may still be running for a moment after. */
  const stoppedAt = new Map<string, number>();
  /** Graphics whose frame is being watched to stand still, each with its own watch. */
  const settling = new Map<string, object>();

  /** Load `spec` in a hidden frame and check it: the frame with its check, or why it failed. */
  const build = async (spec: OutputGraphicSpec, payload: OutputPayload): Promise<GraphicCheck | ReadyIssue> => {
    const frame = stage.prepare(spec, { loadSound: opts.loadSound?.(payload) });
    const verdict = await (async () => {
      const loaded = await Promise.race([frame.whenLoaded.then(() => true), wait(FRAME_LOAD_MS).then(() => false)]);
      if (!loaded) return { k: 'silent', g: spec.key } as ReadyIssue;
      // The document's own error is read AFTER its answer: the message that reports a throw while
      // loading may land behind the load event.
      const answer = await frame.warm(opts.warmData(spec.key, payload));
      return warmVerdict(spec.key, frame.error(), answer);
    })().catch((e: unknown): ReadyIssue => ({ k: 'script', g: spec.key, d: String((e as Error)?.message ?? e).slice(0, 120) }));
    if ('done' in verdict) ready.set(spec.key, { digest: payload.ver?.g[spec.key] ?? '', frame, check: verdict });
    else frame.discard();
    return verdict;
  };

  const swap = (graphic: string) => {
    const entry = ready.get(graphic);
    if (!entry) return;
    settling.delete(graphic);
    ready.delete(graphic);
    entry.frame.swapIn(opts.data(graphic));
    held[graphic] = entry.digest;
    opts.onSwapped(graphic, entry.frame.spec, entry.check);
    opts.changed();
  };

  const leave = (graphic: string) => {
    if (!gone.has(graphic) || opts.onAir(graphic)) return;
    settling.delete(graphic);
    gone.delete(graphic);
    stage.remove(graphic);
    delete held[graphic];
    opts.onRemoved(graphic);
    opts.changed();
  };

  const takeOver = (graphic: string) => (ready.has(graphic) ? swap(graphic) : leave(graphic));

  /** Watch a frame that went off air a moment ago until two answered asks in a row find it where it
   *  was (catchUp.ts reads stillness the same way), or until the cap after its Out, then take over
   *  if it is still off air. */
  const settle = (graphic: string, deadline: number) => {
    const watch = {};
    settling.set(graphic, watch);
    void (async () => {
      let previous = readGraphic(stage, graphic);
      let still = 0;
      while (settling.get(graphic) === watch && !opts.onAir(graphic)) {
        stage.requestState(graphic);
        await wait(CATCH_UP_TIMING.pollMs);
        const reading = readGraphic(stage, graphic);
        still = stoodStill(previous, reading) ? still + 1 : 0;
        previous = reading;
        if (settling.get(graphic) !== watch || opts.onAir(graphic)) break;
        if (still >= 2 || now() >= deadline) {
          settling.delete(graphic);
          takeOver(graphic);
          return;
        }
      }
      if (settling.get(graphic) === watch) settling.delete(graphic);
    })();
  };

  const pending = () => Array.from(ready.keys()).concat(Array.from(gone));
  /** Take over every pending change that is off air here: at once when it has been off air for
   *  longer than an exit lasts, else once its frame stands still. */
  const advance = () => {
    for (const graphic of swapsNow(pending(), opts.onAir).settle) {
      if (settling.has(graphic)) continue;
      const deadline = (stoppedAt.get(graphic) ?? -Infinity) + SETTLE_CAP_MS;
      if (now() >= deadline) takeOver(graphic);
      else settle(graphic, deadline);
    }
  };

  return {
    async apply(payload, progress) {
      const next = payload.ver ? payload.ver.g : {};
      const keys = payload.graphics.map((g) => g.key);
      const readyDigests: Record<string, string> = {};
      ready.forEach((entry, graphic) => {
        readyDigests[graphic] = entry.digest;
      });
      const plan = planPublish({ held, ready: readyDigests }, next, keys);
      for (const graphic of plan.drop) {
        settling.delete(graphic);
        ready.get(graphic)?.frame.discard();
        ready.delete(graphic);
      }
      // A newer publish decides afresh what failed: a failure it builds again is tried again.
      failures.clear();
      for (const graphic of keys) gone.delete(graphic);
      for (const graphic of plan.remove) gone.add(graphic);
      const specOf = (graphic: string) => payload.graphics.find((g) => g.key === graphic)!;
      for (const graphic of plan.add) {
        stage.add(specOf(graphic));
        held[graphic] = next[graphic] ?? '';
        opts.onAdded(specOf(graphic), payload);
      }
      // One at a time: a playout box's main thread is the one that must not miss frames.
      for (let i = 0; i < plan.build.length; i += 1) {
        progress(i, plan.build.length);
        const verdict = await build(specOf(plan.build[i]), payload);
        if (!('done' in verdict)) failures.set(plan.build[i], verdict);
        advance();
      }
      advance();
      return plan.build.length;
    },
    beforePlay(graphic) {
      swap(graphic);
    },
    afterStop(graphic) {
      stoppedAt.set(graphic, now());
      advance();
    },
    tick() {
      advance();
    },
    waiting() {
      return swapsNow(pending(), opts.onAir).wait;
    },
    failed() {
      return Array.from(failures.values());
    },
    holds(next, keys) {
      if (ready.size > 0 || gone.size > 0 || failures.size > 0) return false;
      const plan = planPublish({ held, ready: {} }, next, keys);
      return plan.build.length === 0 && plan.add.length === 0 && plan.remove.length === 0;
    },
  };
}
