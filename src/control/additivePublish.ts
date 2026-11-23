// NEW GRAPHICS REACH THE OUTPUTS WITHOUT A PUBLISH (live-production-reliability P2, AC-2).
//
// While automatic updates are off, a graphic added to a published production changes only the saved
// record, and a full publish would carry every other saved edit with it. This writes the narrow
// thing instead: the publication as it is stored, read back whole, plus only the graphics its stamp
// does not name, their sounds, their panel entries and the cues that point at them. Every graphic
// already published stays byte for byte as it was (same digests), and so do its cues, the settings,
// the scenes and the server cues. An output takes the new graphics in beside what it runs (new
// graphics join at once, output/prepare.ts), so nothing on air is touched.
//
//   Not additive, so nothing is written      the stored payload does not read back to its own stamp;
//                                            a new graphic would change a published one (the look's
//                                            face moving to it), needs a bigger stage, or sits in an
//                                            OBS scene. The status stays amber and says why.
//   Left for Publish changes                 a cue on a graphic already published (new or edited),
//                                            and every design edit of a published graphic.
//
// The stamp keeps the stored `r` (the saved revision whose content it still shows) and drops `c`, so
// a later automatic publish never takes this publication for a whole revision.
//
// Pure: the plan, and the scheduler that runs one attempt at a time (the browser comes in through
// `io`). scripts/additive-publish.test.mjs runs both in Node; control/publishNewGraphics.ts is the
// browser half.

import type { OutputCue, OutputGraphicSpec, OutputPayload, PanelGraphicSpec } from './hostedControl';
import { graphicDigest, readPayloadVersion, stampFromDigests, type PayloadVersion } from './payloadVersion';
import { retryDelay } from './autoPublish';

/** One graphic of the saved pool the stored stamp does not name, built as a full publish would. */
export interface AddedGraphic {
  name: string;
  /** Its payload entry (sounds already uploaded). */
  spec: OutputGraphicSpec;
  /** The stamp digest a full publish would write for it (hostedControl.ts `copyDigest`). */
  digest: string;
  /** When its design was last edited, ISO, when known. */
  edited?: string;
  /** Its panel entry. */
  panel: PanelGraphicSpec;
  /** An OBS scene of the production names it. */
  inScene: boolean;
}

export type AdditivePlan =
  | { kind: 'nothing' }
  | { kind: 'refused'; reason: string }
  | { kind: 'publish'; output: OutputPayload; panel: unknown[]; ver: PayloadVersion; base: PayloadVersion };

/** The pool's graphics the published stamp does not name, in pool order. */
export function newGraphicNames(pool: readonly string[], published: Record<string, string>): string[] {
  return pool.filter((name) => !(name in published));
}

/** What a graphic the outputs do not have yet waits for, said on its cue and at its Take. `adds`:
 *  this page adds new graphics by itself, and why it will not when it will not (null: it does not). */
export function notOnOutputsWhy(adds: { refusal: string | null } | null): string {
  if (adds && !adds.refusal) return 'It is being added to the outputs now.';
  if (adds?.refusal) return `It is not added by itself: ${adds.refusal}. Publish changes to play it.`;
  return 'Publish changes to play it.';
}

export const UNREADABLE ='the published version could not be read back exactly';
export const TOUCHES_PUBLISHED = 'adding it would change a graphic already on the outputs';
export const BIGGER_STAGE = 'it is larger than the published stage';
export const IN_SCENE = 'it is in an OBS scene';
export const GONE = 'this page cannot reach the published production';

/** The cues of `cues` (the saved rundown, in order) on the graphics `added`, placed among the stored
 *  ones after the nearest earlier cue the stored list holds. A `next` naming a cue the result lacks
 *  is dropped: that cue is not on the outputs. */
export function mergeCues(stored: readonly OutputCue[], cues: readonly OutputCue[], added: ReadonlySet<string>): OutputCue[] {
  const result = [...stored];
  const ids = new Set(stored.map((c) => c.id));
  let after: string | null = null;
  for (const cue of cues) {
    if (added.has(cue.graphic) && !ids.has(cue.id)) {
      const at = after === null ? 0 : result.findIndex((c) => c.id === after) + 1;
      result.splice(at, 0, cue);
      ids.add(cue.id);
    }
    if (ids.has(cue.id)) after = cue.id;
  }
  return result.map((cue) => (cue.next && !ids.has(cue.next) ? (({ next: _gone, ...rest }) => rest)(cue) : cue));
}

/**
 * The additive publication over the stored row (`output` and `panel` as read), or why there is none.
 * `added` are the saved pool's graphics the stored stamp does not name; `cues` the saved rundown's
 * graphic cues as a full publish would write them.
 */
export async function planAdditive(input: {
  output: unknown;
  panel: unknown;
  added: readonly AddedGraphic[];
  cues: readonly OutputCue[];
  now?: Date;
}): Promise<AdditivePlan> {
  const raw = input.output as (OutputPayload & Record<string, unknown>) | null;
  const base = readPayloadVersion(raw?.ver);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.graphics) || !base) return { kind: 'refused', reason: UNREADABLE };
  // What is stored IS what its stamp says: every graphic reads back to its digest, and the stamp
  // names no other. Otherwise nothing is known to stay the same, so nothing is written.
  const keys = new Set<string>();
  for (const spec of raw.graphics) {
    if (!spec || typeof spec.key !== 'string' || !Array.isArray(spec.assets) || !spec.resolution) return { kind: 'refused', reason: UNREADABLE };
    if (base.g[spec.key] !== (await graphicDigest(spec))) return { kind: 'refused', reason: UNREADABLE };
    keys.add(spec.key);
  }
  if (Object.keys(base.g).some((key) => !keys.has(key))) return { kind: 'refused', reason: UNREADABLE };
  const added = input.added.filter((a) => !(a.name in base.g) && !keys.has(a.name));
  if (!added.length) return { kind: 'nothing' };
  const stage = raw.resolution;
  for (const a of added) {
    if ((await graphicDigest(a.spec)) !== a.digest) return { kind: 'refused', reason: TOUCHES_PUBLISHED };
    if (!stage || a.spec.resolution.width > stage.width || a.spec.resolution.height > stage.height) return { kind: 'refused', reason: BIGGER_STAGE };
    if (a.inScene) return { kind: 'refused', reason: IN_SCENE };
  }
  const names = new Set(added.map((a) => a.name));
  const sounds = new Map((Array.isArray(raw.soundAssets) ? raw.soundAssets : []).map((s) => [s.hash, s] as const));
  for (const a of added) for (const asset of a.spec.assets) if (asset.audio && !sounds.has(asset.audio.hash)) sounds.set(asset.audio.hash, asset.audio);
  const g = { ...base.g, ...Object.fromEntries(added.map((a) => [a.name, a.digest])) };
  const editedNew = Object.fromEntries(added.flatMap((a) => (a.edited ? [[a.name, a.edited] as const] : [])));
  const t = base.t || Object.keys(editedNew).length ? { ...(base.t ?? {}), ...editedNew } : undefined;
  const stamped = await stampFromDigests(g, stage, base, input.now ?? new Date(), t);
  const ver: PayloadVersion = { ...stamped, ...(base.r !== undefined ? { r: base.r } : {}) };
  const output = {
    ...raw,
    ...(sounds.size ? { v: 2 as const, soundAssets: [...sounds.values()] } : {}),
    graphics: [...raw.graphics, ...added.map((a) => a.spec)],
    cues: mergeCues(Array.isArray(raw.cues) ? raw.cues : [], input.cues, names),
    ver,
  } as OutputPayload;
  const panel = [...(Array.isArray(input.panel) ? input.panel : []), ...added.map((a) => a.panel)];
  return { kind: 'publish', output, panel, ver, base };
}

// ── THE SCHEDULER: one attempt at a time, shortly after the new graphics are saved ──────────────

/** What one attempt came to. */
export type AdditiveOutcome =
  /** Written: the outputs are asked to take it. */
  | { kind: 'published' }
  /** The stored publication already names every graphic. */
  | { kind: 'current' }
  /** A save of this page is on its way, or the server holds a newer one: tried again shortly. */
  | { kind: 'wait' }
  /** No answer, or another page published at the same moment: tried again with a backoff. */
  | { kind: 'transient'; reason: string }
  /** Not additive, or not allowed: held until the new graphics change. */
  | { kind: 'refused'; reason: string }
  /** The production is no longer published. */
  | { kind: 'gone' };

export interface AdditiveView {
  running: boolean;
  /** Why nothing is written for these graphics: a refusal, held until they change, or the reason
   *  of a third failure in a row, while it is still tried again. */
  refusal: string | null;
}

export interface AdditiveIo {
  setTimer(ms: number, run: () => void): () => void;
  /** Another publish of this page is running: this one waits for it. */
  busy(): boolean;
  attempt(): Promise<AdditiveOutcome>;
  changed(view: AdditiveView): void;
}

/** How long the new graphics sit still before an attempt: "shortly after they are saved". */
export const SETTLE_MS = 1_500;
/** How long an attempt waits for a save on its way, or for another publish. */
export const WAIT_MS = 2_000;

export interface AdditivePublisher {
  /** What is new now (a key over the new graphics and their saves), or null: nothing. */
  want(key: string | null): void;
  view(): AdditiveView;
  stop(): void;
}

export function createAdditivePublisher(io: AdditiveIo): AdditivePublisher {
  let wanted: string | null = null;
  let running = false;
  let owed = false;
  let stopped = false;
  let failures = 0;
  let refusal: string | null = null;
  let cancel: (() => void) | null = null;
  let current: AdditiveView = { running: false, refusal: null };

  const emit = () => {
    const next = { running, refusal };
    if (next.running === current.running && next.refusal === current.refusal) return;
    current = next;
    io.changed(next);
  };
  const schedule = (ms: number) => {
    if (cancel) cancel();
    cancel = io.setTimer(ms, () => {
      cancel = null;
      run();
    });
  };
  const run = () => {
    if (stopped || wanted === null) return;
    if (running) {
      owed = true;
      return;
    }
    if (io.busy()) {
      schedule(WAIT_MS);
      return;
    }
    running = true;
    owed = false;
    const key = wanted;
    emit();
    void io
      .attempt()
      .catch((e: unknown): AdditiveOutcome => ({ kind: 'transient', reason: String((e as Error)?.message ?? e) }))
      .then((outcome) => {
        running = false;
        if (stopped) return;
        if (owed || wanted !== key) {
          // The new graphics changed during the attempt: the next one reads them afresh.
          emit();
          if (wanted !== null) schedule(SETTLE_MS);
          return;
        }
        switch (outcome.kind) {
          case 'published':
          case 'current':
            failures = 0;
            refusal = null;
            break;
          case 'wait':
            schedule(WAIT_MS);
            break;
          case 'transient':
            failures += 1;
            // Still tried again, but after three failures the status says why it has not gone.
            if (failures >= 3) refusal = outcome.reason;
            schedule(retryDelay(failures));
            break;
          case 'refused':
            refusal = outcome.reason;
            break;
          case 'gone':
            // Never "Adding" again from here: the status says nothing will.
            stopped = true;
            refusal = GONE;
            break;
        }
        emit();
      });
  };

  return {
    want(key) {
      if (stopped || key === wanted) return;
      wanted = key;
      refusal = null;
      failures = 0;
      if (cancel) cancel();
      cancel = null;
      if (key !== null) schedule(SETTLE_MS);
      emit();
    },
    view: () => current,
    stop() {
      stopped = true;
      if (cancel) cancel();
    },
  };
}
