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
import type { GraphicCheck, ReadyIssue } from '../control/readiness';
import type { SoundAssetRef } from '../model/types';
import type { OutputStage, StagedFrame } from './stage';
import { planPublish, swapsNow } from './swapPlan';

/** A prepared frame that has not loaded after this long is a change that did not prepare. */
const LOAD_MS = 20_000;
/** How often a frame that has just gone off air is asked whether its exit has finished. */
const SETTLE_POLL_MS = 150;
/** A frame still moving this long after it went off air takes the change anyway: an exit is a
 *  second or two, and an off-air graphic that never stands still is not one anybody can see. */
const SETTLE_CAP_MS = 10_000;

export interface Swapper {
  /** Build what `payload` changes for this output, one frame at a time, swapping each change in as
   *  soon as the rule allows. Resolves once every change has been tried. `progress` counts them. */
  apply(payload: OutputPayload, progress: (n: number, of: number) => void): Promise<void>;
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
  /** Every graphic holds the version `next` stamps, and nothing is building, waiting or failed. */
  holds(next: Readonly<Record<string, string>>, keys: readonly string[]): boolean;
}

export interface SwapperOptions {
  stage: Pick<OutputStage, 'prepare' | 'swapIn' | 'add' | 'remove' | 'requestState' | 'motion' | 'replies'>;
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
  /** Something `waiting`, `failed` or `holds` answers has changed. */
  changed(): void;
  now?: () => number;
}

interface Ready {
  digest: string;
  frame: StagedFrame;
  check: GraphicCheck;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createSwapper(opts: SwapperOptions): Swapper {
  const now = opts.now ?? (() => Date.now());
  const stage = opts.stage;
  const held: Record<string, string> = { ...opts.held };
  const ready = new Map<string, Ready>();
  /** Graphics the published version no longer has: they leave once off air. */
  const gone = new Set<string>();
  const failures = new Map<string, ReadyIssue>();
  /** Graphics whose frame is being watched to stand still, with how to stop watching. */
  const settling = new Map<string, () => void>();
  let building = false;

  /** Load `spec` in a hidden frame and check it: the frame with its check, or what failed. */
  const build = async (spec: OutputGraphicSpec, payload: OutputPayload): Promise<{ frame: StagedFrame; check: GraphicCheck } | ReadyIssue> => {
    const key = spec.key;
    const frame = stage.prepare(spec, { loadSound: opts.loadSound?.(payload) });
    try {
      const loaded = await Promise.race([frame.whenLoaded.then(() => true), wait(LOAD_MS).then(() => false)]);
      if (!loaded) throw { k: 'silent', g: key } as ReadyIssue;
      const answer = await frame.warm(opts.warmData(key, payload));
      const error = frame.error() ?? (answer ? answer.error : null);
      if (answer?.sounds?.error && !answer.scriptError && error === answer.sounds.error) throw { k: 'audio', g: key, d: error.slice(0, 120) } as ReadyIssue;
      if (error !== null && error !== undefined) throw { k: 'script', g: key, d: error.slice(0, 120) } as ReadyIssue;
      if (!answer) throw { k: 'silent', g: key } as ReadyIssue;
      return {
        frame,
        check: {
          done: true,
          error: null,
          audio: answer.sounds,
          silent: false,
          fontsFailed: answer.fonts.failed,
          fontsLoading: answer.fonts.loading,
          imagesBroken: answer.images.broken,
        },
      };
    } catch (thrown) {
      frame.discard();
      const issue = thrown as Partial<ReadyIssue> | null;
      return issue && typeof issue.k === 'string'
        ? (issue as ReadyIssue)
        : { k: 'script', g: key, d: String((thrown as Error)?.message ?? thrown).slice(0, 120) };
    }
  };

  const stopSettling = (graphic: string) => {
    settling.get(graphic)?.();
    settling.delete(graphic);
  };

  /** Watch `graphic`'s frame until two answered asks in a row find it where it was (catchUp.ts
   *  reads stillness the same way), or the cap, then `done` if it is still off air. */
  const settle = (graphic: string, done: () => void) => {
    if (settling.has(graphic)) return;
    let cancelled = false;
    settling.set(graphic, () => {
      cancelled = true;
    });
    const deadline = now() + SETTLE_CAP_MS;
    const read = () => ({ replies: stage.replies.get(graphic) ?? 0, motion: stage.motion.get(graphic) ?? -1 });
    void (async () => {
      let previous = read();
      let still = 0;
      while (!cancelled) {
        stage.requestState(graphic);
        await wait(SETTLE_POLL_MS);
        if (cancelled) return;
        if (opts.onAir(graphic)) break;
        const reading = read();
        still = reading.replies > previous.replies && reading.motion === previous.motion ? still + 1 : 0;
        previous = reading;
        if (still >= 2 || now() >= deadline) {
          settling.delete(graphic);
          done();
          return;
        }
      }
      settling.delete(graphic);
    })();
  };

  const swap = (graphic: string) => {
    const entry = ready.get(graphic);
    if (!entry) return;
    stopSettling(graphic);
    ready.delete(graphic);
    stage.swapIn(entry.frame, opts.data(graphic));
    held[graphic] = entry.digest;
    opts.onSwapped(graphic, entry.frame.spec, entry.check);
    opts.changed();
  };

  const leave = (graphic: string) => {
    if (!gone.has(graphic) || opts.onAir(graphic)) return;
    gone.delete(graphic);
    stage.remove(graphic);
    delete held[graphic];
    opts.onRemoved(graphic);
    opts.changed();
  };

  /** Take over every change the rule allows now, and start watching those about to be allowed. */
  const advance = () => {
    const pending = Array.from(ready.keys()).concat(Array.from(gone)).filter((g) => !settling.has(g));
    // Stillness is learned by watching (`settle`), so nothing here is still yet.
    const next = swapsNow(pending, (graphic) => ({ onAir: opts.onAir(graphic), still: false }));
    for (const graphic of next.settle) settle(graphic, () => (ready.has(graphic) ? swap(graphic) : leave(graphic)));
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
        stopSettling(graphic);
        ready.get(graphic)?.frame.discard();
        ready.delete(graphic);
      }
      // A newer publish decides afresh what failed: a failure it builds again is tried again.
      failures.clear();
      for (const graphic of keys) gone.delete(graphic);
      for (const graphic of plan.remove) gone.add(graphic);
      for (const graphic of plan.add) {
        const spec = payload.graphics.filter((g) => g.key === graphic)[0];
        stage.add(spec);
        held[graphic] = next[graphic] ?? '';
        opts.onAdded(spec, payload);
      }
      building = plan.build.length > 0;
      opts.changed();
      // One at a time: a playout box's main thread is the one that must not miss frames.
      for (let i = 0; i < plan.build.length; i += 1) {
        progress(i, plan.build.length);
        const graphic = plan.build[i];
        const spec = payload.graphics.filter((g) => g.key === graphic)[0];
        const result = await build(spec, payload);
        if ('frame' in result) ready.set(graphic, { digest: next[graphic] ?? '', frame: result.frame, check: result.check });
        else failures.set(graphic, result);
        advance();
      }
      building = false;
      progress(plan.build.length, plan.build.length);
      advance();
      opts.changed();
    },
    beforePlay(graphic) {
      swap(graphic);
    },
    afterStop(graphic) {
      if (ready.has(graphic) || gone.has(graphic)) advance();
    },
    tick() {
      if (ready.size > 0 || gone.size > 0) advance();
    },
    waiting() {
      return Array.from(ready.keys()).concat(Array.from(gone)).filter((g) => opts.onAir(g));
    },
    failed() {
      return Array.from(failures.values());
    },
    holds(next, keys) {
      if (building || ready.size > 0 || gone.size > 0 || failures.size > 0) return false;
      return Object.keys(held).length === keys.length && keys.every((key) => held[key] !== undefined && held[key] !== '' && held[key] === next[key]);
    },
  };
}
