// THE OUTPUT TAKES A NEWER VERSION (docs/work-specs/per-graphic-replacement/spec.md; before it,
// docs/work-specs/playout-ready/spec.md R3, R4, AC-9). An open output keeps the version it booted
// with until a publish or Prepare for Live asks (the request rides the production page's Presence
// entry); then it loads the published payload and takes it one graphic at a time (./swap.ts):
//
//   A graphic changed, off air here       its new frame is built hidden beside it, checked, and
//                                         takes over: no reload, nothing else touched.
//   A graphic changed, on air here        it keeps its frame until it is cleared or replaced (G1),
//                                         and says so: "Waiting for clear: Scorebug".
//   A change failed                       the graphic keeps the frame it has, and says which.
//   New and removed graphics              join at once; leave once off air.
//   The published version is the one it holds   it runs its checks again: pressing again re-runs
//                                         everything.
//
// THE WHOLE PAGE RELOADS only for what a frame cannot take (D2): another stage resolution, or a new
// build of this renderer deployed since it loaded, and only when nothing is on air here, through the
// boot recovery a manual reload uses and once its own URL answers (a reload during an outage would
// put the browser's error page on air).
//
// An output only ever moves onto what the server holds, at most once every PREPARE_EVERY_MS.
//
// Old CEF: CasparCG 2.3 runs this in Chromium 71.

import type { OutputPayload } from '../control/hostedControl';
import { changedGraphics, type PayloadVersion } from '../control/payloadVersion';
import type { PrepRequest } from '../control/prepareLive';
import type { ChangePrep, ReadyIssue } from '../control/readiness';
import type { Resolution } from '../model/types';
import { createOutputStage } from './stage';
import type { OutputStageOptions } from './stage';
import type { Swapper } from './swap';
import { swapStatus } from './swapPlan';

/** A preparation starts at most this often; a request in between waits for its turn. */
export const PREPARE_EVERY_MS = 15_000;
/** A hidden frame that has not loaded after this long is a change that did not prepare. */
const TEST_LOAD_MS = 20_000;
/** Prepare requests this page has acted on, kept across its own reload so it never acts twice. */
const HANDLED_KEY = 'noacg-ready-prep';

function handledIds(): string[] {
  try {
    const raw = window.sessionStorage.getItem(HANDLED_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function markHandled(id: string): void {
  try {
    window.sessionStorage.setItem(HANDLED_KEY, JSON.stringify(handledIds().concat(id).slice(-20)));
  } catch {
    // no storage: a reload may act on the same request once more, and finds nothing to do
  }
}

export interface Preparer {
  /** Swap in what air has let go of, and retry a reload that waits for air to clear. */
  tick(): void;
  /** A request seen on the live topic (or handed in by a spec): acted on once, in its turn. */
  request(prep: PrepRequest): void;
  /** Something the swapper reports has changed: say where the version stands again. */
  refresh(): void;
}

/** What one hidden frame found, in a stage of its own (the whole-reload path only). */
async function testGraphic(payload: OutputPayload, key: string, values: Record<string, string> | null, options: OutputStageOptions): Promise<ReadyIssue | null> {
  const spec = payload.graphics.filter((g) => g.key === key)[0];
  if (!spec) return null;
  const box = document.createElement('div');
  // Out of sight and out of the way: nothing here may reach air or take a click.
  box.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(box);
  const stage = createOutputStage(box, { ...payload, graphics: [spec] }, { ...options, sound: 'program', soundQuiet: true, fit: () => ({ width: 2, height: 2 }) });
  try {
    const loaded = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), TEST_LOAD_MS);
      stage.onLoaded(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    if (!loaded) return { k: 'silent', g: key };
    const answer = await stage.warm(key, values);
    const error = stage.errors.get(key) ?? (answer ? answer.error : null);
    if (answer?.sounds?.error && !answer.scriptError && error === answer.sounds.error) return { k: 'audio', g: key, d: error.slice(0,120) };
    if (error !== null && error !== undefined) return { k: 'script', g: key, d: error.slice(0, 120) };
    return answer ? null : { k: 'silent', g: key };
  } finally {
    stage.destroy();
    box.remove();
  }
}

export function createPreparer(opts: {
  audio?: (payload: OutputPayload) => OutputStageOptions;
  /** The version this page booted with. */
  held: PayloadVersion | null;
  /** The stage resolution this page booted with: another one needs a reload. */
  resolution: Resolution;
  /** The published payload as the server holds it now, or null when it did not answer. */
  resolve: () => Promise<OutputPayload | null>;
  /** How many graphics are on air on this output now. */
  onAir: () => number;
  /** Takes the published version one graphic at a time. */
  swapper: Swapper;
  /** Whether this page's own URL now serves another build of the renderer. */
  newBuild: () => Promise<boolean>;
  /** Run READY's checks of the running version again. */
  recheck: () => Promise<void>;
  /** What the preparation stands at, for the Presence entry (undefined: nothing to say). */
  report: (chg: ChangePrep | undefined) => void;
  /** Reload onto the published version if this page's own URL answers; false when it did not. */
  reload: () => Promise<boolean>;
  /** Take `payload` as the version this page holds: cue metadata, its label and sounds. */
  adopt?: (payload: OutputPayload) => boolean;
  now?: () => number;
}): Preparer {
  const now = opts.now ?? (() => Date.now());
  let held = opts.held;
  let running = false;
  let lastStart = -Infinity;
  let queued: PrepRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** A whole-page preparation that waits for air to clear (another resolution). */
  let waiting: PrepRequest | null = null;
  /** The publish the swapper is taking: what `refresh` reports against. */
  let taking: { payload: OutputPayload; version: PayloadVersion; of: number; id: string } | null = null;
  /** A new renderer build is served: reload once nothing is on air, no more than every PREPARE_EVERY_MS. */
  let reloadForBuild = false;
  let lastBuildReload = -Infinity;

  const sameResolution = (payload: OutputPayload) =>
    payload.resolution.width === opts.resolution.width && payload.resolution.height === opts.resolution.height;

  /** Say where the swapper has the version, and take it as held once every graphic holds it. */
  const refresh = () => {
    if (!taking || running) return;
    const { payload, version, of, id } = taking;
    const keys = payload.graphics.map((g) => g.key);
    const holds = opts.swapper.holds(version.g, keys);
    const chg = swapStatus({ version: { n: version.n, h: version.h }, of, id, waiting: opts.swapper.waiting(), failed: opts.swapper.failed(), holds });
    if (holds && opts.adopt?.(payload) !== false) {
      held = version;
      taking = null;
    }
    opts.report(chg);
  };

  /** The whole page, as before per-graphic replacement: every change prepared in a stage of its
   *  own, then a reload once nothing is on air here. */
  const reloadOnto = async (payload: OutputPayload, next: PayloadVersion, prep: PrepRequest) => {
    const version = { n: next.n, h: next.h };
    const changed = changedGraphics(held, next, payload.graphics.map((g) => g.key));
    const chg: ChangePrep = { s: 'preparing', v: version, of: changed.length, n: 0, id: prep.id };
    opts.report(chg);
    const firstCue = (key: string) => {
      const cue = payload.cues.filter((c) => c.graphic === key)[0];
      return cue ? cue.values : null;
    };
    const failed: ReadyIssue[] = [];
    // One at a time: a playout box's main thread is the one that must not miss frames.
    for (const key of changed) {
      const issue = await testGraphic(payload, key, firstCue(key), opts.audio?.(payload) ?? {}).catch(
        (e: unknown): ReadyIssue => ({ k: 'script', g: key, d: String((e as Error)?.message ?? e).slice(0, 120) }),
      );
      if (issue) failed.push(issue);
      chg.n += 1;
      opts.report({ ...chg });
    }
    if (failed.length > 0) {
      opts.report({ s: 'failed', v: version, of: changed.length, n: changed.length, is: failed.slice(0, 6), id: prep.id });
      return;
    }
    const air = opts.onAir();
    if (air > 0) {
      waiting = prep;
      opts.report({ s: 'waiting', v: version, of: changed.length, n: changed.length, air, id: prep.id });
      return;
    }
    if (!(await opts.reload())) {
      waiting = prep;
      opts.report({ s: 'waiting', v: version, of: changed.length, n: changed.length, air: 0, id: prep.id });
    }
  };

  const run = async (prep: PrepRequest) => {
    running = true;
    waiting = null;
    lastStart = now();
    markHandled(prep.id);
    try {
      const payload = await opts.resolve();
      const next = payload ? payload.ver : undefined;
      if (!payload || !next) return;
      if (!sameResolution(payload)) {
        taking = null;
        await reloadOnto(payload, next, prep);
        return;
      }
      if (held && held.h === next.h) {
        if (held.n !== next.n && opts.adopt?.(payload)) held = next;
        taking = null;
        // A change an earlier publish left waiting or failed, which this one takes back.
        if (!opts.swapper.holds(next.g, payload.graphics.map((g) => g.key))) await opts.swapper.apply(payload, () => {});
        await opts.recheck();
        opts.report(undefined);
      } else {
        const version = { n: next.n, h: next.h };
        taking = { payload, version: next, of: 0, id: prep.id };
        const at = taking;
        await opts.swapper.apply(payload, (n, of) => {
          at.of = of;
          opts.report({ s: 'preparing', v: version, of, n, id: prep.id });
        });
      }
      // A renderer deployed since this page loaded: the graphics are taken above either way, and
      // the page itself follows once nothing is on air here.
      if (await opts.newBuild().catch(() => false)) reloadForBuild = true;
    } catch {
      // The server did not answer as expected: this page keeps its version and says nothing new.
      if (!taking) opts.report(undefined);
    } finally {
      running = false;
      refresh();
      pump();
    }
  };

  const pump = () => {
    if (running || !queued || timer) return;
    const wait = lastStart + PREPARE_EVERY_MS - now();
    if (wait > 0) {
      timer = setTimeout(() => {
        timer = null;
        pump();
      }, wait);
      return;
    }
    const prep = queued;
    queued = null;
    void run(prep);
  };

  return {
    tick() {
      opts.swapper.tick();
      if (waiting && !running && !queued && opts.onAir() === 0) {
        queued = waiting;
        waiting = null;
        pump();
      }
      if (reloadForBuild && !running && !taking && opts.onAir() === 0 && now() - lastBuildReload >= PREPARE_EVERY_MS) {
        lastBuildReload = now();
        void opts.reload();
      }
    },
    request(prep) {
      if (handledIds().indexOf(prep.id) >= 0) return;
      if (queued && queued.id === prep.id) return;
      // Only the newest request matters: pressing again replaces one still waiting.
      queued = prep;
      pump();
    },
    refresh,
  };
}
