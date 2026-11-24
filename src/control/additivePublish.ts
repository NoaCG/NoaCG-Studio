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
//                                            OBS scene, or the stored sounds are not under this
//                                            account's key (a write makes the writer their owner). The status
//                                            stays amber and says why.
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
import type { SoundAssetRef } from '../model/types';
import type { Show } from '../model/shows';
import { publishedRecordDigest } from '../model/publishedRecord';
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

/** The record digest to keep as published once the new graphics `names` are on the outputs, or
 *  null: only when the record, without them and their cues, is the one last published, so adding
 *  them was its only change and nothing is left for Publish changes (model/publishedRecord.ts). */
export function recordAfterAdd(show: Show, names: ReadonlySet<string>): string | null {
  if (!show.publishedRecord) return null;
  const ids = new Set(show.graphics.filter((g) => names.has(g.name)).map((g) => g.id));
  // A record with no cues key keeps none (the digest tells an absent list from an empty one). A
  // digest stored before live-publishing W2 (no format tag) never matches: Publish changes stays due.
  const before: Show = { ...show, graphics: show.graphics.filter((g) => !ids.has(g.id)), ...(show.cues ? { cues: show.cues.filter((c) => !ids.has(c.sourceId)) } : {}) };
  return publishedRecordDigest(before) === show.publishedRecord ? publishedRecordDigest(show) : null;
}

/** Why a publish would change what the outputs render (components/home/usePublishDrift.ts). */
export interface PublishDue {
  /** A published graphic renders differently now (a design edit). */
  drift: boolean;
  /** The pool has a graphic the published stamp does not name. */
  added: boolean;
  /** The published stamp names a graphic the pool no longer has. */
  removed: boolean;
  /** The record changed and the published digests are not known. */
  unstamped: boolean;
}

/** Whether Publish changes is due: something only it can send. Added graphics are not, while this
 *  page adds them by itself (`addsByItself`: it runs here and has not refused them); offering the
 *  press for them too showed a button that the add then took away under the operator's pointer. */
export function publishChangesDue(due: PublishDue, addsByItself: boolean): boolean {
  return due.drift || due.removed || due.unstamped || (due.added && !addsByItself);
}

/** What a graphic the outputs do not have yet waits for, said on its cue and at its Take. `adds`:
 *  this page adds new graphics by itself, and why it will not when it will not (null: it does not). */
export function notOnOutputsWhy(adds: { refusal: string | null } | null): string {
  if (adds && !adds.refusal) return 'It is being added to the outputs now.';
  if (adds?.refusal) {
    const reason = adds.refusal.replace(/[.\s]+$/, '');
    return `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. Publish changes to play it.`;
  }
  return 'Publish changes to play it.';
}

export const UNREADABLE ='the published version could not be read back exactly';
export const TOUCHES_PUBLISHED = 'adding it would change a graphic already on the outputs';
export const BIGGER_STAGE = 'it is larger than the published stage';
export const IN_SCENE = 'it is in an OBS scene';
export const OTHER_OWNER_SOUNDS = 'the sounds already on the outputs would stop playing';
export const SOUND_NOT_UPLOADED = 'its sound has not been uploaded';
export const SOUND_REFUSED = 'its sound cannot be uploaded';
export const SOUND_NOT_SENT = 'its sound could not be uploaded yet';

/** The storage key an output may fetch a published sound by: the publication's audio owner's
 *  (api/_lib/outputAudio.ts). Every write of `output` makes the writer that owner (migration 0121). */
export const soundKey = (owner: string, hash: string): string => `${owner}/audio-${hash}`;

/** Whether every sound the stored publication names stays fetchable once `uploader` writes it: each
 *  is stored under that account's key. A write by another account moves the audio owner to it, and
 *  the outputs would refuse the sounds a teammate uploaded. */
export function soundsStayFetchable(output: unknown, uploader: string | null): boolean {
  const stored = (output as { soundAssets?: unknown } | null)?.soundAssets;
  if (!Array.isArray(stored) || !stored.length) return true;
  return !!uploader && stored.every((s: { hash?: unknown; storageKey?: unknown }) => typeof s?.hash === 'string' && s.storageKey === soundKey(uploader, s.hash));
}
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

/** Stored payloads, as read, that were found to read back to their own stamp. */
const readBack = new WeakSet<object>();

type Checked =
  | { kind: 'refused'; reason: string }
  | { kind: 'nothing' }
  | { kind: 'ok'; raw: OutputPayload & Record<string, unknown>; base: PayloadVersion; added: AddedGraphic[] };

/** Every refusal that does not need the new sounds uploaded, so nothing is uploaded for an add that
 *  is refused anyway. */
async function check(output: unknown, candidates: readonly AddedGraphic[], uploader: string | null): Promise<Checked> {
  const raw = output as (OutputPayload & Record<string, unknown>) | null;
  const base = readPayloadVersion(raw?.ver);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.graphics) || !base) return { kind: 'refused', reason: UNREADABLE };
  // What is stored IS what its stamp says: every graphic reads back to its digest, and the stamp
  // names no other. Otherwise nothing is known to stay the same, so nothing is written.
  // Hashed once per payload read: the check before the upload and the plan after it share the result.
  if (!readBack.has(raw)) {
    const keys = new Set<string>();
    for (const spec of raw.graphics) {
      if (!spec || typeof spec.key !== 'string' || !Array.isArray(spec.assets) || !spec.resolution) return { kind: 'refused', reason: UNREADABLE };
      if (base.g[spec.key] !== (await graphicDigest(spec))) return { kind: 'refused', reason: UNREADABLE };
      keys.add(spec.key);
    }
    if (Object.keys(base.g).some((key) => !keys.has(key))) return { kind: 'refused', reason: UNREADABLE };
    readBack.add(raw);
  }
  const keys = new Set(raw.graphics.map((g) => g.key));
  const added = candidates.filter((a) => !(a.name in base.g) && !keys.has(a.name));
  if (!added.length) return { kind: 'nothing' };
  const stage = raw.resolution;
  for (const a of added) {
    if ((await graphicDigest(a.spec)) !== a.digest) return { kind: 'refused', reason: TOUCHES_PUBLISHED };
    if (!stage || a.spec.resolution.width > stage.width || a.spec.resolution.height > stage.height) return { kind: 'refused', reason: BIGGER_STAGE };
    if (a.inScene) return { kind: 'refused', reason: IN_SCENE };
  }
  // An output fetches a sound only by the key of the publication's audio owner (api/_lib/outputAudio.ts),
  // which this write makes the uploader (migration 0121): the stored sounds must be under its key.
  if (!soundsStayFetchable(raw, uploader)) return { kind: 'refused', reason: OTHER_OWNER_SOUNDS };
  return { kind: 'ok', raw, base, added };
}

/** Why nothing would be written for `added` over the stored `output`, before any sound is uploaded;
 *  null: the add can go on. */
export async function additiveRefusal(output: unknown, added: readonly AddedGraphic[], uploader: string | null): Promise<{ kind: 'refused'; reason: string } | { kind: 'nothing' } | null> {
  const checked = await check(output, added, uploader);
  return checked.kind === 'ok' ? null : checked;
}

/** The new graphics' sounds uploaded through `upload` (`publishAudio`), which takes the manifest with
 *  them and answers it with each sound's storage key, while it strips the key from the graphics' own
 *  references; or why not. A refusal of the sound itself (storage, a changed or missing file) holds
 *  until the graphics change; a sign-in or a failed send is tried again. */
export async function uploadSounds<G extends { assets: { audio?: SoundAssetRef }[] }>(
  specs: G[],
  upload: (body: { graphics: G[]; soundAssets: SoundAssetRef[] }) => Promise<{ graphics: G[]; soundAssets: SoundAssetRef[] }>,
): Promise<{ graphics: G[]; sounds: SoundAssetRef[] } | { kind: 'refused' | 'transient'; reason: string }> {
  const refs = [...new Map(specs.flatMap((s) => s.assets.flatMap((a) => (a.audio ? [a.audio] : []))).map((a) => [a.hash, a] as const)).values()];
  if (!refs.length) return { graphics: specs, sounds: [] };
  try {
    const uploaded = await upload({ graphics: specs, soundAssets: refs });
    return { graphics: uploaded.graphics, sounds: uploaded.soundAssets };
  } catch (e) {
    // Only a fault of the sound file itself, or one too big for the store (backend/assets.ts
    // `classifyAssetRefusal`, permanent), holds; anything else (storage full, signed out, no answer,
    // a copy this browser does not hold yet) is tried again.
    const message = String((e as Error)?.message ?? e);
    return /^(Sound changed|Invalid sound|Sound files must be|a file in it is larger)/.test(message)
      ? { kind: 'refused', reason: SOUND_REFUSED }
      : { kind: 'transient', reason: SOUND_NOT_SENT };
  }
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
  /** The new graphics' sounds as uploaded (`uploadSounds`, storage keys included). */
  sounds?: readonly SoundAssetRef[];
  /** The account that writes: the publication's audio owner after the write. */
  uploader: string | null;
  now?: Date;
}): Promise<AdditivePlan> {
  const checked = await check(input.output, input.added, input.uploader);
  if (checked.kind !== 'ok') return checked;
  const { raw, base, added } = checked;
  const stage = raw.resolution;
  // THE SOUND MANIFEST: each new sound comes with its uploaded key, as a full publish's do.
  const sounds = new Map((Array.isArray(raw.soundAssets) ? raw.soundAssets : []).map((s) => [s.hash, s] as const));
  for (const s of input.sounds ?? []) if (!sounds.has(s.hash)) sounds.set(s.hash, s);
  for (const a of added) {
    for (const asset of a.spec.assets) {
      const listed = asset.audio ? sounds.get(asset.audio.hash) : undefined;
      if (asset.audio && (!input.uploader || listed?.storageKey !== soundKey(input.uploader, asset.audio.hash))) return { kind: 'refused', reason: SOUND_NOT_UPLOADED };
    }
  }
  const names = new Set(added.map((a) => a.name));
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
  /** Why nothing is written for these graphics: a refusal, held until they change and the next
   *  attempt answers, or the reason of a third failure or tenth wait for a save in a row, while it
   *  is still tried again. */
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
/** Waits for a save in a row after which the status says why the graphic has not gone (still
 *  tried again): about 20 s. */
export const WAITS_SAID = 10;
export const SAVE_WAITING = 'its save has not reached the server yet';

export interface AdditivePublisher {
  /** What is new now (a key over the new graphics and their saves), or null: nothing. `names`: which
   *  graphics those are; a reason said for them stands through a new save of the same ones, and goes
   *  when they change. */
  want(key: string | null, names?: string): void;
  view(): AdditiveView;
  stop(): void;
}

export function createAdditivePublisher(io: AdditiveIo): AdditivePublisher {
  let wanted: string | null = null;
  let wantedNames: string | undefined;
  let running = false;
  let owed = false;
  let stopped = false;
  let failures = 0;
  let waits = 0;
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
        // A reason said before stands through waits and the first failures (the press stays offered
        // meanwhile); a write, or a newer reason, replaces it.
        switch (outcome.kind) {
          case 'published':
          case 'current':
            failures = 0;
            waits = 0;
            refusal = null;
            break;
          case 'wait':
            waits += 1;
            if (waits >= WAITS_SAID) refusal = SAVE_WAITING;
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
    want(key, names) {
      if (stopped || key === wanted) return;
      wanted = key;
      // A reason said for the same graphics stays until the next attempt answers, so the page never
      // takes its Publish changes away for the few seconds a new attempt takes. Other graphics have
      // no reason yet.
      if (key === null || names !== wantedNames) refusal = null;
      wantedNames = names;
      failures = 0;
      waits = 0;
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
