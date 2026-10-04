// THE OUTPUT PREPARES A NEWER VERSION (Phase 6 Step 3 landing b: docs/work-specs/playout-ready/spec.md
// R3, R4, AC-9). An open output keeps the version it booted with; when Prepare for Live asks, it
// loads the published payload, builds only the new and changed graphics in hidden frames beside the
// ones on air, one at a time, and runs READY's own checks on them ("Ready · 1 change preparing").
//
//   Every change prepared, nothing on air here   it reloads onto the new version, through the boot
//                                                recovery a manual reload uses, once its own URL
//                                                answers (a reload during an outage would put the
//                                                browser's error page on air).
//   A change failed                              it keeps running the version it has: "Ready · 1
//                                                change not prepared: Frost Quiz (script error)".
//   Something on air here                        it keeps its version and says so ("Behind"), with
//                                                what to do. It never reloads under a graphic on air.
//   The published version is the one it holds   it runs its checks again: pressing again re-runs
//                                                everything.
//
// Nothing here happens outside Prepare for Live, and a request can do no more than a real one: the
// payload is re-read from the server, so an output only ever moves onto what the server holds, and
// at most once every PREPARE_EVERY_MS.
//
// Old CEF: CasparCG 2.3 runs this in Chromium 71.

import type { OutputPayload } from '../control/hostedControl';
import { changedGraphics, type PayloadVersion } from '../control/payloadVersion';
import type { PrepRequest } from '../control/prepareLive';
import type { ChangePrep, ReadyIssue } from '../control/readiness';
import { createOutputStage } from './stage';
import type { OutputStageOptions } from './stage';

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
  /** A request seen on the live topic (or handed in by a spec): acted on once, in its turn. */
  request(prep: PrepRequest): void;
}

/** What one hidden frame found. */
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
  /** The published payload as the server holds it now, or null when it did not answer. */
  resolve: () => Promise<OutputPayload | null>;
  /** How many graphics are on air on this output now. */
  onAir: () => number;
  /** Run READY's checks of the running version again. */
  recheck: () => Promise<void>;
  /** What the preparation stands at, for the Presence entry (undefined: nothing to say). */
  report: (chg: ChangePrep | undefined) => void;
  /** Reload onto the published version if this page's own URL answers; false when it did not. */
  reload: () => Promise<boolean>;
  now?: () => number;
}): Preparer {
  const now = opts.now ?? (() => Date.now());
  let running = false;
  let lastStart = -Infinity;
  let queued: PrepRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = async (prep: PrepRequest) => {
    running = true;
    lastStart = now();
    markHandled(prep.id);
    try {
      const payload = await opts.resolve();
      const next = payload ? payload.ver : undefined;
      if (!payload || !next) return;
      const held = opts.held;
      if (held && held.h === next.h) {
        await opts.recheck();
        opts.report(undefined);
        return;
      }
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
        const issue = await testGraphic(payload, key, firstCue(key),opts.audio?.(payload) ?? {}).catch(
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
        opts.report({ s: 'waiting', v: version, of: changed.length, n: changed.length, air, id: prep.id });
        return;
      }
      if (!(await opts.reload())) opts.report({ s: 'waiting', v: version, of: changed.length, n: changed.length, air: 0, id: prep.id });
    } catch {
      // The server did not answer as expected: this page keeps its version and says nothing new.
      opts.report(undefined);
    } finally {
      running = false;
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
    request(prep) {
      if (handledIds().indexOf(prep.id) >= 0) return;
      if (queued && queued.id === prep.id) return;
      // Only the newest request matters: pressing again replaces one still waiting.
      queued = prep;
      pump();
    },
  };
}
