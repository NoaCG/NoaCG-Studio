import { accentColor, readOutputSetup, type ProductionOutputSetup, type RundownColors } from '../model/outputSetup';
// Hosted control (Phase 5): the client side of migration 0008. A local SHOW publishes as a
// control_shows row (id = the local Show.id); operating it is capability-addressed — the
// unguessable slug opens the hosted page at ?control=<slug>, no account needed. Commands
// are INSERTS into the control_events log (DB-ordered, recoverable); staging and the
// graphics' applied-state reports ride the same log as meta rows.
//
// The published `panel` spec also carries each graphic's saved ENTRIES, read out of the
// library at publish time (docs/SAVED_CONTENT_MODEL.md §4) — the hosted page renders them as
// a read-only switcher, so picking one stages its data and airing it stays a deliberate take.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '../backend/supabase';
import { publishAudio } from '../backend/productionAudio';
import { graphicLayer, type CueAuto, type CueEnd, type Show } from '../model/shows';
import { channelName, channelOf, loadPlayoutSettings } from './playoutLink';
import { profileForPublish, readPublishedProfile, type ShowProfile } from '../model/profile';
import type { ResolvedValues } from '../model/productionData';
import { designEditedAt, loadGraphics, entriesForSavedGraphic, resolveSavedGraphicDoc, templateForSavedGraphic, type GraphicDoc } from '../model/library';
import type { Resolution, SpxField, SpxTemplate, SoundAssetRef } from '../model/types';
import { DEFAULT_GRAPHICS_RESOLUTION } from '../model/projectFormat';
import { fileToDataUrl, isImageAsset } from '../assets/assetUtils';
// The audience plane owns the shape of its own brand (docs/ARCHITECTURE.md §3, control ->
// audience): publish is the courier, not the author.
import { audienceBrandFor } from '../audience/audienceBrand';
// The library->air gate (docs/ARCHITECTURE.md §3, control -> validation): publishing is the
// boundary where a library draft becomes something a renderer trusts.
import { assertProductionGate } from '../validation/productionGate';
import { joinNameCandidates } from './joinName';
import { COMMAND_EVENT, LOG_ROW_EVENT, SEQ_BATCH_EVENT, commandTopic, logTopic, readCommandFrame, seqTopic, withOid } from './commandRoads';
import { allOutWaves, BURST_WINDOW_MS } from './allOut';
import { ATTEMPT_TIMEOUT_MS, MIN_ATTEMPT_MS, RESEND_WINDOW_MS, rpcFailure, sendWithResend, unansweredError, unansweredStatus } from './failedSends';
import { noteSend, withSender } from './livePath';
import { graphicDigest, olderDesigns, readPayloadVersion, stampPayload, type PayloadVersion } from './payloadVersion';
import { createSeqFollower, seqJoinRetryDelay, type HeadSummary, type SeqFrame, type SeqHead, type SeqTail } from './seqFollow';
import { uuid } from '../model/id';
import {
  createGraphicFifo,
  createSeqSession,
  learnHead,
  readSendAnswer,
  senderBody,
  settleAnswer,
  type SendAnswer,
  type SenderBody,
  type SeqSession,
} from './seqSend';
import { fieldDescriptors, type ControlMessage } from './controlModel';
import { createLogFollower } from './logFollow';
import { cueDataRows, type CueDataRow } from './cueData';
import { nextGraphicCue, readAuto, takesNext, type ArmOp, type MarkerAuto, type WireArm } from './cueAuto';

/** The operator page's URL for a control slug — the one shape every surface mints. */
export function controlPageUrl(slug: string): string {
  return `${window.location.origin}/app?control=${encodeURIComponent(slug)}`;
}

/** The browser-output URL for an output slug (docs/CLOUD_PLAYOUT.md §3). */
export function outputPageUrl(outputSlug: string): string {
  return `${window.location.origin}/output?production=${encodeURIComponent(outputSlug)}`;
}

/** A saved data row published with the panel (model/library.ts ControlEntry, values only). */
export interface PanelEntry {
  id: string;
  label: string;
  values: Record<string, string>;
}

/** What the hosted page needs to render one graphic's card — never the full template. */
export interface PanelGraphicSpec {
  name: string;
  fields: SpxField[];
  js: string;
  images: { value: string; label: string }[];
  /**
   * The graphic's saved entries, published READ-ONLY (docs/SAVED_CONTENT_MODEL.md §4): the
   * operator picks one, its values STAGE like any typed edit, and nothing airs until a take.
   * Authoring entries stays in the app (`#/control/<id>`) — the hosted page never writes back.
   * Additive: `panel` is jsonb with no version of its own, so a row published by an older
   * build simply carries no entries and is normalized to `[]` on read.
   */
  entries: PanelEntry[];
  /**
   * The production DATASET rows this graphic can load, resolved at publish time by the shared
   * matcher (`control/cueData.ts`, the same one the in-app page runs live). The hosted page had
   * no data loading at all, so half of the Data workspace was unreachable from the surface a
   * class operates from.
   *
   * Published rather than matched on the page because the hosted page never sees the show
   * record - only what publishing wrote. That gives it the same freshness contract cues and
   * entries already have: edit a dataset, publish changes. Additive: an older row simply
   * carries none and normalizes to `[]` on read.
   */
  dataRows: CueDataRow[];
}

export interface ControlShowRow {
  id: string;
  slug: string;
  outputSlug: string | null;
  title: string;
}

// ── The browser-output payload (docs/CLOUD_PLAYOUT.md §2) ────────────────────
// PINNED at publish: the renderer's templates are a snapshot, deliberately inverting the
// panel spec's live resolution — a renderer on air must never change under the operator.

/** One renderer instance: everything the output page needs to compose the graphic. The key
 *  is the 0008 graphic NAME — the same routing key the log, staged and live maps use. */
export interface OutputGraphicSpec {
  key: string;
  html: string;
  css: string;
  js: string;
  /** Serialized assets — Blob data converted to data URLs at publish so the payload is JSON. */
  assets: { path: string; data: string; audio?: SoundAssetRef }[];
  resolution: Resolution;
  fps: number;
  /** The PLAYOUT LAYER the operator gave this graphic (docs/PLAYOUT_DASHBOARD.md §5) — the
   *  same number its exported package declares, used here as the output stage's paint order
   *  (higher = in front). ADDITIVE OPTIONAL: a payload published before the field falls back
   *  to its position in the array, which is exactly what the stage used to do. */
  layer?: number;
}

/** One cue as published — ShowCue re-keyed by graphic name (the wire key). */
export interface OutputCue {
  hotkey?: string;
  cueKind?: 'graphic' | 'image';
  accentColor?: string;
  id: string;
  graphic: string;
  label: string;
  values: Record<string, string>;
  note?: string;
  /** ADDITIVE OPTIONAL (timed cues, docs/RUNDOWN_AUTOMATION_PLAN.md §2.2): how the cue ends by
   *  itself, and `next`, the graphic cue `Next cue` takes, resolved at publish from the rundown's
   *  own order, which this split list no longer has. Absent: a manual cue, or a payload published
   *  before timed cues, and the hosted page then takes it as one. */
  auto?: CueAuto;
  next?: string;
}

/**
 * THE VALUES THE HOSTED PAGE'S OPERATOR SEES FOR ONE CUE: the published cue with the SHARED
 * staging buffer over them, so another operator typing is part of what a Take would send.
 *
 * One function because the page's ⟳ TAKE, ✎ Update, the snap's trailing write and the cue editor
 * all have to send the same values; two readings of "the cue as it stands" is how one
 * production's Take comes to mean two things. It lives outside the component so an offline spec
 * can measure it (`e2e/hosted-control.spec.ts`), since the page itself needs a configured backend.
 */
export function hostedCueValues(
  cue: OutputCue,
  staged: Record<string, Record<string, string>>,
  resolved: ResolvedValues,
): Record<string, string> {
  const own = (map: Record<string, Record<string, string>>, key: string) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
  // BOUND VALUES SIT ON TOP OF BOTH (plan §2.7): a bound field is never a cue value, so taking a
  // cue prepared at 1-0 while the tree says 3-2 airs 3-2, and neither the published cue nor an
  // operator typing into the shared buffer can push it back. Without this the page's own ± press
  // moved the shared value and the very next ⟳ Take put the old figure back on air.
  return { ...cue.values, ...(own(staged, cue.graphic) ?? {}), ...(own(resolved, cue.graphic) ?? {}) };
}

/** One cue over the playout server's own library (docs/BRIDGE.md §5), as published. The
 *  renderer ignores these - nothing here renders in a browser - and the hosted control page
 *  lists them so the two dashboards read the same rundown. ADDITIVE OPTIONAL. */
export interface OutputPlayoutCue {
  hotkey?: string;
  mediaKind?: 'still' | 'movie' | 'audio';
  accentColor?: string;
  id: string;
  label: string;
  kind: 'template' | 'media';
  name: string;
  layer: number;
  /** ADDITIVE OPTIONAL. The CasparCG channel, resolved at publish by the operator's studio (an
   *  item with no channel of its own plays on that studio's graphics channel), and the studio's
   *  word for it. The hosted page cannot read the operator's Settings, so it is told both. A
   *  payload published before 2026-09-23 has neither and the page shows the layer alone. */
  channel?: number;
  channelName?: string;
  note?: string;
}

export interface OutputPayload {
  outputSetup?: ProductionOutputSetup;
  rundownColors?: RundownColors;
  v: 1 | 2;
  soundAssets?: SoundAssetRef[];
  /** The production canvas — the stage the output page scales to the viewport. */
  resolution: Resolution;
  graphics: OutputGraphicSpec[];
  cues: OutputCue[];
  playoutCues?: OutputPlayoutCue[];
  /** THE VERSION THIS PAYLOAD IS (control/payloadVersion.ts; Phase 6 Step 3 R2): written by every
   *  publish from 2026-10 on. ADDITIVE OPTIONAL: a payload published before it has none, and is
   *  then never called behind. */
  ver?: PayloadVersion;
}

/** Per graphic: the renderer's last reported truth, plus (0033) `event` — the log row it had
 *  applied when the report was written. `event` is the graphic's RECOVERY BASELINE: on boot the
 *  renderer rebuilds from `data`/`state` and replays only rows after it. Absent on a pre-0033
 *  server or from a pre-0033 renderer, and then the entry is REPLAYED rather than trusted
 *  (control/outputRecovery.ts owns that rule). */
export type LiveReportMap = Record<
  string,
  {
    data?: Record<string, string>;
    state?: { groups?: Record<string, string> } | null;
    at?: string;
    event?: number;
    /** Protocol 2 only: the same baseline in the per-production sequence (0071). */
    seq?: number;
  }
>;

/**
 * Which cue is on air ON EACH LAYER — the row-persisted snapshot, keyed by the graphic NAME
 * (the 0008 wire key, which is also the layer identity). An absent key means that layer is off
 * air; a production with three graphics up has three entries.
 *
 * Format 2 (migration 0034). A pre-0034 row carries 0031's single `{cue, graphic}` snapshot and
 * MIGRATES ON READ into the one-entry map it describes, so an unupgraded server still reports
 * its one live layer correctly (rule 6). An empty map is the honest reading of both "nothing on
 * air" and "no snapshot yet" — the cue rows on the log correct it either way.
 */
export type LiveCueMap = Record<string, string>;

export interface ResolvedControlShow {
  id: string;
  title: string;
  panel: PanelGraphicSpec[];
  staged: Record<string, Record<string, string>>;
  live: LiveReportMap;
  /** The log baseline — follow live rows after it, tail-fill gaps (0008 contract). */
  lastEventId: number;
  /** The published output payload (null before the first output publish). */
  output: OutputPayload | null;
  /** The renderer's last heartbeat — staleness is the "renderer connected" indicator. */
  outputSeenAt: string | null;
  liveCue: LiveCueMap;
  /**
   * The production's control profile, or null for "render the generated panel" — which covers
   * both no profile and a profile written by a newer build (`readPublishedProfile` in
   * `model/profile.ts` says why both degrade the same way).
   *
   * `control_show_by_slug` returns the column from migration 0059 on. An instance that has not
   * applied 0059 returns no such key, `readPublishedProfile` reads that as no profile, and the
   * hosted page renders the generated panel — the same degradation deleting a profile gives, so
   * nothing here has to know which migrations an instance is on.
   */
  profile: ShowProfile | null;
  /**
   * PROTOCOL 2 (migration 0071): how this page follows the numbered log, or absent when the
   * server has no sequence road, in which case everything runs today's way. Present means the
   * page follows `seq-<show>` by seq (`followControlLog` takes it as `seq`) and sends through
   * `control_send_seq` (`sendControlVerb` finds the session by slug).
   */
  seq?: SeqPlan;
}

/** What a proto-2 operator page follows the log with: where to start, and what to keep current. */
export interface SeqPlan {
  /** The head's epoch at the resolve (null: the production has no head yet). */
  epoch: string | null;
  /** The head's seq at the resolve: rows after it are followed live. */
  from: number;
  /** One page of numbered rows after `after`, or null when the read failed. */
  tail: (after: number, epoch: string | null) => Promise<SeqTail<SeqLogRow> | null>;
  /** The revisions this page has seen, which every frame keeps current for the next press. */
  session: SeqSession;
}

/** A log row with its per-production number (0071). */
export type SeqLogRow = ControlEventRow & { seq: number };

/** What the output renderer resolves — payload + live snapshot, never panel/staged/slug. */
export interface ResolvedOutputShow {
  id: string;
  title: string;
  output: OutputPayload | null;
  /** Per graphic, the last report. On protocol 2 each entry also carries `seq`, its baseline in
   *  the numbered log (its own, or mapped by the server from `event`). */
  live: LiveReportMap;
  lastEventId: number;
  /**
   * PROTOCOL 2 (migration 0071), absent on an older server. `legacy` means rows written before
   * the migration exist that this renderer would need and that carry no seq: it then follows by
   * id for the whole session, exactly as before, and its reports move the baselines past them.
   */
  seq?: { epoch: string | null; legacy: boolean };
}

/** The cue STATUS row (docs/CLOUD_PLAYOUT.md §4): written on Take/Out so every open surface
 *  agrees on which cue is live. Receivers ignore it — pages render it. `cue: null` = off air. */
export interface CueStatusMsg {
  /** A direct secondary take must not acquire the rundown's Next automation. */
  direct?: boolean;
  t: 'cue';
  cue: string | null;
  /** ADDITIVE (timed cues, migration 0075): on a Take marker, what it arms; on an arm row, the arm
   *  as it now stands, absent once it has ended (control/cueAuto.ts `armRowEffect`). */
  auto?: MarkerAuto | WireArm;
  /** ADDITIVE: present on the rows `control_cue_arm` writes, so a follower and the log tell an arm
   *  change from a Take. Such a row keeps the lane's cue, so a reader of `cue` alone is unmoved. */
  arm?: ArmOp;
  /** On an arm row: the end action, so the log can word a fire or a Manual. */
  then?: CueEnd;
}

/** A log row as delivered by Realtime / the tail RPC. */
export interface ControlEventRow {
  id: number;
  /** The row's number in its production's sequence (migration 0071). Absent on the id road and on
   *  rows written before that migration. */
  seq?: number;
  graphic: string;
  /** When the row was written (0008's `control_tail` has always returned it, and a Realtime
   *  INSERT payload carries the whole row). Optional because a locally-authored row — a
   *  rehearsal's own commands — has no server time, and older callers never read it. */
  created_at?: string;
  msg:
    | ControlMessage
    | CueStatusMsg
    | { t: 'staged'; data: Record<string, string> }
    | { t: 'live'; data?: Record<string, string>; state?: { groups?: Record<string, string> } | null }
    // A ping through the command path (migration 0072): an empty graphic, and nothing to air.
    | { t: 'ping'; id: string; at: number };
}

/** The stored operator spec for a show — one entry per graphic, no template payload. The
 *  entries come from the library via the shared resolver (model/library.ts), by `graphicId`
 *  with a unique-name fallback, so hosted publish and show export agree on the lookup. */
export function buildPanelSpec(show: Show, library: GraphicDoc[] = loadGraphics()): PanelGraphicSpec[] {
  return show.graphics.map((g) => {
    // The LIVE template (templateForSavedGraphic), not the snapshot embedded when the graphic
    // was added — publishing a show that carried the stale fields/js would drive the hosted
    // operator page against a design the graphic no longer has.
    const template = templateForSavedGraphic(g, library);
    return {
      name: g.name,
      fields: template.fields,
      js: template.js,
      images: template.assets
        .filter((a) => isImageAsset(a.path))
        .map((a) => ({ value: a.path, label: a.path })),
      entries: entriesForSavedGraphic(g, library).map((e) => ({ id: e.id, label: e.label, values: e.values })),
      dataRows: cueDataRows(
        fieldDescriptors(template.fields).map((d) => ({ key: d.key, label: d.label })),
        show.datasets ?? [],
      ),
    };
  });
}

/** Normalize a stored panel row to the current shape (additive fields defaulted, never a crash). */
function readPanel(panel: unknown): PanelGraphicSpec[] {
  if (!Array.isArray(panel)) return [];
  return (panel as PanelGraphicSpec[]).map((g) => ({
    ...g,
    images: Array.isArray(g.images) ? g.images : [],
    entries: Array.isArray(g.entries) ? g.entries : [],
    dataRows: Array.isArray(g.dataRows) ? g.dataRows : [],
  }));
}

/** Normalize a stored output payload — unknown/absent shapes degrade to null, never a crash. */
export function readOutputPayload(output: unknown): OutputPayload | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as OutputPayload;
  if ((o.v !== 1 && o.v !== 2) || !Array.isArray(o.graphics)) return null;
  const ver = readPayloadVersion(o.ver);
  return {
    v: o.v,
    ...(readOutputSetup(o.outputSetup) ? { outputSetup: readOutputSetup(o.outputSetup)! } : {}),
    ...(o.rundownColors && typeof o.rundownColors === 'object' ? { rundownColors: o.rundownColors } : {}),
    ...(Array.isArray(o.soundAssets) ? { soundAssets: o.soundAssets } : {}),
    resolution: o.resolution ?? DEFAULT_GRAPHICS_RESOLUTION,
    graphics: o.graphics.map((g) => ({ ...g, assets: Array.isArray(g.assets) ? g.assets : [] })),
    cues: Array.isArray(o.cues) ? o.cues : [],
    // Carried through, not dropped: the hosted page lists these beside the graphics' cues.
    // Before 2026-09-23 this reader left them out and the list was never shown.
    ...(Array.isArray(o.playoutCues) && o.playoutCues.length ? { playoutCues: o.playoutCues } : {}),
    // The version stamp, when the publish wrote one (READY's guarantee 2).
    ...(ver ? { ver } : {}),
  };
}

/** Serialize one template's assets for the JSON payload (Blob bytes become data URLs). */
async function serializeAssets(template: SpxTemplate): Promise<OutputGraphicSpec['assets']> {
  return Promise.all(
    template.assets.map(async (a) => ({
      path: a.path,
      data: typeof a.data === 'string' ? a.data : await fileToDataUrl(a.data as File),
      ...(a.audio ? { audio: (({storageKey: _transport,...ref})=>ref)(a.audio) } : {}),
    })),
  );
}

/** One graphic as the output renders it: the payload's entry, and what its version digest covers. */
async function graphicSpec(g: Show['graphics'][number], template: SpxTemplate): Promise<OutputGraphicSpec> {
  return {
    key: g.name,
    html: template.html,
    css: template.css,
    js: template.js,
    assets: await serializeAssets(template),
    resolution: template.resolution,
    fps: template.fps,
    layer: graphicLayer(g),
  };
}

/** The PINNED renderable payload written at publish (docs/CLOUD_PLAYOUT.md §2): the pool
 *  graphics' live library templates snapshotted, plus the cue rundown re-keyed by the wire
 *  graphic name. Async because Blob assets serialize to data URLs. */
export async function buildOutputPayload(show: Show, library: GraphicDoc[] = loadGraphics()): Promise<OutputPayload> {
  const byId = new Map(show.graphics.map((g) => [g.id, g] as const));
  const graphics: OutputGraphicSpec[] = await Promise.all(show.graphics.map((g) => graphicSpec(g, templateForSavedGraphic(g, library))));
  // The stage: big enough for every graphic (they render 1:1 inside it, the page scales it).
  const resolution = graphics.reduce<Resolution>(
    (r, g) => ({
      width: Math.max(r.width, g.resolution.width),
      height: Math.max(r.height, g.resolution.height),
      label: r.label,
    }),
    DEFAULT_GRAPHICS_RESOLUTION,
  );
  const cues: OutputCue[] = (show.cues ?? [])
    .filter((c) => byId.has(c.sourceId))
    .map((c) => {
      const auto = readAuto(c);
      const next = auto && takesNext(auto.then) ? nextGraphicCue(show.cues ?? [], c.id) : null;
      return {
        id: c.id,
        graphic: byId.get(c.sourceId)!.name,
        cueKind: byId.get(c.sourceId)!.type === 'picture' ? 'image' : 'graphic',
        ...(c.hotkey ? { hotkey: c.hotkey } : {}),
        ...(accentColor(c.accentColor) ? { accentColor: accentColor(c.accentColor) } : {}),
        label: c.label,
        values: c.values,
        ...(c.note ? { note: c.note } : {}),
        ...(auto ? { auto } : {}),
        ...(next ? { next } : {}),
      };
    });
  const itemById = new Map((show.playoutItems ?? []).map((i) => [i.id, i] as const));
  const playout = loadPlayoutSettings();
  const playoutCues: OutputPlayoutCue[] = (show.cues ?? [])
    .filter((c) => c.source === 'playout' && itemById.has(c.sourceId))
    .map((c) => {
      const item = itemById.get(c.sourceId)!;
      const channel = channelOf(playout, item);
      const name = channelName(playout, channel);
      return {
        id: c.id,
        label: c.label,
        kind: item.kind,
        ...(c.hotkey ? { hotkey: c.hotkey } : {}),
        ...(item.mediaKind ? { mediaKind: item.mediaKind } : {}),
        ...(accentColor(c.accentColor) ? { accentColor: accentColor(c.accentColor) } : {}),
        name: item.name,
        layer: item.layer,
        channel,
        ...(name ? { channelName: name } : {}),
        ...(c.note ? { note: c.note } : {}),
      };
    });
  const soundAssets = [...new Map(graphics.flatMap(g => g.assets.flatMap(a => a.audio ? [a.audio] : [])).map(a => [a.hash,a])).values()];
  return { ...(show.outputSetup ? { outputSetup: show.outputSetup } : {}), ...(show.rundownColors ? { rundownColors: show.rundownColors } : {}), v: soundAssets.length ? 2 : 1, ...(soundAssets.length ? { soundAssets } : {}), resolution, graphics, cues, ...(playoutCues.length ? { playoutCues } : {}) };
}

/** Every capability a publish hands back. The audience pair is nullable on purpose: a server
 *  without migration 0035 simply has no such columns, which must degrade to "no join link"
 *  rather than to a failed publish. */
export interface PublishedCapabilities {
  slug: string;
  outputSlug: string | null;
  joinSlug: string | null;
  presenterSlug: string | null;
  /** The version stamp this publish wrote into the payload (payloadVersion.ts). */
  version?: PayloadVersion;
}

/** Digests already computed, by library record, its save time and the graphic's layer: a record
 *  that has not changed is not serialised and hashed again (its pictures can be megabytes). */
const libraryDigestMemo = new Map<string, string>();

/**
 * What a publish would write NOW for each graphic this browser resolves from ITS OWN library: the
 * stamp's per-graphic digest (payloadVersion.ts `g`), by key. Compared with the published stamp it
 * says whether publishing would change what the outputs render - which is how a graphic edited in
 * the library, never touching the production record, still counts as an unpublished change.
 *
 * A graphic that falls back to the snapshot embedded in the production record is left out: that
 * copy changes only with the record, whose own timestamp already says so. In a team production a
 * member without the publisher's library record therefore never reads the publisher's newer design
 * as a change of their own to publish over it (https://github.com/NoaCG/NoaCG-Studio/issues/779).
 */
export async function libraryGraphicDigests(show: Show, library: GraphicDoc[] = loadGraphics()): Promise<Record<string, string>> {
  const digests: Record<string, string> = {};
  for (const g of show.graphics) {
    const doc = resolveSavedGraphicDoc(g, library);
    if (!doc && g.graphicId) continue;
    const memoKey = doc
      ? `${doc.id}|${doc.updatedAt}|${graphicLayer(g)}|${g.name}|${JSON.stringify(g.soundConfig)}`
      : JSON.stringify(g);
    let digest = libraryDigestMemo.get(memoKey);
    if (digest === undefined) {
      digest = await graphicDigest(await graphicSpec(g, templateForSavedGraphic(g, library)));
      if (libraryDigestMemo.size > 200) libraryDigestMemo.clear();
      libraryDigestMemo.set(memoKey, digest);
    }
    digests[g.name] = digest;
  }
  return digests;
}

/** Publish (or update) a production's hosted pages: the operator panel spec (live-resolved,
 *  entries included) AND the pinned output payload, in one write (docs/CLOUD_PLAYOUT.md §2 —
 *  the two surfaces must agree on the cue list). Prunes log rows older than 7 days (the 0029
 *  owner DELETE policy) so a 24/7 output URL never grows the log without bound.
 *  Returns every capability slug, or null offline. */
export async function publishControlShow(show: Show): Promise<PublishedCapabilities | null> {
  // THE LIBRARY->AIR GATE, before anything else - including the backend check: an invalid
  // graphic cannot publish, and that is true of this function whoever calls it and wherever it
  // runs (validation/productionGate.ts - the same publishGate the community door runs). A
  // library record may be a broken draft; what is pinned to an output URL may not.
  const library = loadGraphics();
  assertProductionGate(show.graphics, library);
  const sb = await getSupabase();
  if (!sb) return null;
  const raw = await buildOutputPayload(show, library);
  const built = raw.soundAssets?.length ? await publishAudio(raw) : raw;
  // THE VERSION STAMP (payloadVersion.ts): the previous stamp, read as ONE field so the
  // multi-megabyte payload is not downloaded to learn it. A production published for the first
  // time, or last published before stamps existed, starts at 1. The write below lands only on this
  // same version (the publish guard, docs/work-specs/publish-guard/spec.md G4), so a read that
  // fails stops the publish.
  const previous = await sb.from('control_shows').select('ver:output->ver').eq('id', show.id).maybeSingle();
  if (previous.error) throw new Error(previous.error.message);
  const held = readPayloadVersion((previous.data as { ver?: unknown } | null)?.ver);
  const edited = Object.fromEntries(show.graphics.map((g) => [g.name, designEditedAt(g, library)]));
  const version = await stampPayload(built, held, undefined, edited);
  // NEVER AN OLDER DESIGN (G3): this page's copy of a graphic is older than the one on air - a
  // second device not yet synced, or a teammate whose production has not received the newer copy.
  const older = olderDesigns(version, held);
  if (older.length) {
    const one = older.length === 1;
    throw new PublishBehind(`${older.join(', ')} on air ${one ? 'is' : 'are'} newer than this page's copy. Reload this page to get ${one ? 'it' : 'them'}.`);
  }
  const expected: ExpectedVersion = { exists: !!previous.data, n: held?.n ?? null };
  const output: OutputPayload = { ...built, ver: version };
  // The upsert names only the columns it owns, which is what keeps `audience_state` (0035) —
  // open/mode/prompt/round/rev, all of it live operator state — from being reset by a
  // re-publish mid-show. A whole-row write here would close the audience door every time
  // somebody fixed a typo in a cue.
  const published = {
    id: show.id,
    title: show.name,
    panel: buildPanelSpec(show, library),
    output,
    // The production-data BINDINGS travel with the publish because they are authored state,
    // like the panel and the payload (docs/PRODUCTION_DATA_PLAN.md §5). The server-side patch
    // RPC resolves against this column, so a production published without it accepts data
    // and moves no graphic. The live TREE is deliberately not sent: it is runtime state and
    // the server's own column is its authority once published.
    bindings: show.bindings ?? {},
    // The control PROFILE travels at publish for the same reason the bindings do: how this
    // production arranges its controls is AUTHORED state, like the panel and the
    // payload, and the hosted surfaces must not have to guess it (migration 0058,
    // docs/CONTROL_PANEL_ANY_GRAPHIC.md §6e). An empty object rather than null, on the 0048
    // precedent, so a production published without one reads as "no profile" instead of being
    // null-checked at every use. The profile carries its own `v` inside the jsonb, so the
    // column never needs a version of its own. A profile this build reads is published in its
    // canonical form, which drops a removed `combine` list; one a newer build wrote goes verbatim.
    profile: profileForPublish(show.profile),
    // A TEAM production's published row belongs to the team (migration 0054), which is what lets
    // any member republish or operate it and keeps its four links fixed whoever publishes. Named
    // only for a team production, so a personal publish writes exactly the columns it always did
    // - and on a personal row the database would refuse a stamp nobody asked for anyway.
    ...(show.teamId ? { team_id: show.teamId } : {}),
  };
  // AN UPDATE, AND AN INSERT ONLY WHEN THERE WAS NOTHING TO UPDATE - not an upsert. PostgREST's
  // upsert sets every column of the payload, `id` included (`on conflict ("id") do update set "id"
  // = excluded."id", ...`, read off pg_stat_statements on a preview branch), and a key column in
  // the SET makes Postgres lock the existing row FOR UPDATE, which blocks every Take's KEY SHARE on
  // it for the whole multi-megabyte write. An update that leaves `id` out of the SET takes FOR NO
  // KEY UPDATE, which a Take passes (migration 0071, review finding ordering:F1).
  const error = await writeControlShow(sb, published, expected);
  // AN INSTANCE THAT HAS NOT RUN 0058 MUST STILL BE ABLE TO PUBLISH. PostgREST refuses the WHOLE
  // upsert when one named column is not in its schema cache, so naming `profile` unconditionally
  // would take the panel, the payload and the bindings down with it — every publish failing for
  // the window between this bundle going out and `db:push` applying the migration, and forever on
  // a self-hosted instance that is behind. This is the same policy the audience read-back below
  // already follows, stated there as "publishing a production must not start failing because an
  // instance has not run the latest migration", and the retry is the cheapest way to hold it: one
  // extra round trip, only on the instances that need it, and only until they are migrated.
  if (error === 'moved') throw new PublishBehind(RACED);
  if (error) {
    const { profile: _dropped, ...withoutProfile } = published;
    const retry = await writeControlShow(sb, withoutProfile, expected);
    if (retry === 'moved') throw new PublishBehind(RACED);
    // The retry failing means the error was never about this column — report the ORIGINAL, which
    // is the one that describes what is actually wrong.
    if (retry) throw new Error(error.message);
  }
  // The prune result is deliberately unread (best-effort retention; the 0029 owner DELETE
  // policy may not exist on an older instance) — run it beside the slug read-back.
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [, readBack] = await Promise.all([
    sb.from('control_events').delete().eq('show_id', show.id).lt('created_at', cutoff),
    sb
      .from('control_shows')
      .select('slug, outputSlug:output_slug, joinSlug:join_slug, presenterSlug:presenter_slug, audience_state')
      .eq('id', show.id)
      .single(),
  ]);
  // A server WITHOUT 0035 answers the audience columns with an error rather than with nulls,
  // so the fallback re-reads the two columns that have always existed. Publishing a production
  // must not start failing because an instance has not run the latest migration.
  if (readBack.error) {
    const legacy = await sb.from('control_shows').select('slug, outputSlug:output_slug').eq('id', show.id).single();
    if (legacy.error) throw new Error(legacy.error.message);
    const row = legacy.data as { slug: string; outputSlug: string | null };
    return { ...row, joinSlug: null, presenterSlug: null, version };
  }
  const row = readBack.data as {
    slug: string;
    outputSlug: string | null;
    joinSlug: string | null;
    presenterSlug: string | null;
    audience_state: Record<string, unknown> | null;
  };
  // The brand travels at publish, merged into the state rather than replacing it — `open`,
  // `mode` and the round pointer are the operator's, not the publisher's.
  const brand = audienceBrandFor(show.look);
  if (row.audience_state) {
    await sb
      .from('control_shows')
      .update({ audience_state: { ...row.audience_state, brand } })
      .eq('id', show.id);
  }
  // A production that has never had an audience slug gets a READABLE one derived from its name,
  // here, on its first publish - so a link an operator can read out exists without anyone typing
  // an ending. Only on the first publish: after that the name is a shared URL, and republishing
  // to fix a typo in a cue must not move it (the Links panel says as much beside the field).
  // `row.joinSlug` being non-null is also the proof that this server HAS the column: an instance
  // that predates 0035 must not spend six failing round-trips on every publish.
  const derive = !show.joinSlug && !!row.joinSlug;
  const joinSlug = derive ? (await adoptDerivedJoinName(show)) ?? row.joinSlug : row.joinSlug;
  return {
    slug: row.slug,
    outputSlug: row.outputSlug,
    joinSlug,
    presenterSlug: row.presenterSlug,
    version,
  };
}

/** The published version is ahead of what this page built from: another page published between
 *  this publish's read and its write (G4), or holds a newer design than this page's copy (G3).
 *  Nothing was written. The caller pulls the latest record and publishes once more, which settles
 *  both when the newer copy has reached the record; the message is for when it has not. */
export class PublishBehind extends Error {}

const RACED = 'Another page published at the same moment. Publish again.';

/** The published version a write may land on: no row yet, or the row as read, by its stamp's
 *  number (null: published before stamps). */
interface ExpectedVersion {
  exists: boolean;
  n: number | null;
}

/**
 * Write a published row by id, only over the version `expected` names: update it where it exists,
 * insert it where it does not. Answers the error that describes the failure, `'moved'` when the
 * row is no longer the version read (another publish landed first), or null. The columns are
 * exactly the ones given; `id` is the address and is never in the update's SET, so the row lock is
 * NO KEY UPDATE. The condition is a filter on the stamp inside the payload, so no migration.
 */
async function writeControlShow(
  sb: NonNullable<Awaited<ReturnType<typeof getSupabase>>>,
  row: { id: string } & Record<string, unknown>,
  expected: ExpectedVersion,
): Promise<{ message: string; code?: string } | 'moved' | null> {
  const { id, ...columns } = row;
  if (expected.exists) {
    const update = sb.from('control_shows').update(columns).eq('id', id);
    const landed = await (expected.n === null ? update.is('output->ver', null) : update.eq('output->ver->>n', String(expected.n))).select('id');
    if (landed.error) return landed.error;
    return (landed.data ?? []).length > 0 ? null : 'moved';
  }
  const inserted = await sb.from('control_shows').insert(row);
  if (!inserted.error) return null;
  if (inserted.error.code !== '23505') return inserted.error;
  // Taken: by a publish that inserted first, or by a row this account cannot see, which no retry
  // can fix, so that one keeps its own error.
  const seen = await sb.from('control_shows').select('id').eq('id', id).maybeSingle();
  return seen.data ? 'moved' : inserted.error;
}

/**
 * Claim the first free slug derived from the production's name, or null when none of the
 * candidates is available and the random one the database minted has to stand.
 *
 * The retry IS the availability check (see `claimJoinName`), so this walks the candidates rather
 * than asking which is free - and it stops at the first success, which is why a busy name lands
 * as `friday-night-live-2` rather than as a number nobody chose.
 */
async function adoptDerivedJoinName(show: Show): Promise<string | null> {
  for (const candidate of joinNameCandidates(show.name)) {
    const failure = await claimJoinName(show.id, candidate);
    if (!failure) return candidate;
  }
  return null;
}

/** The public audience URL for a join slug — the readable path form, which is what an operator
 *  reads out on air (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5). */
export function joinPageUrl(joinSlug: string): string {
  return `${window.location.origin}/join/${encodeURIComponent(joinSlug)}`;
}

/** The presenter's read-only view — a DIFFERENT capability on the same entry. */
export function presenterPageUrl(presenterSlug: string): string {
  return `${window.location.origin}/join?pv=${encodeURIComponent(presenterSlug)}`;
}

/**
 * Claim a READABLE join name, so an operator can say "noacg dot app slash join slash friday
 * night live" on air instead of spelling out base64.
 *
 * It is an ordinary owner UPDATE, not an RPC and not a migration: `control_shows_owner_all`
 * (0008) already lets an owner write their own row, and publishing has always done exactly
 * this. Every rule that makes a name safe is ON THE COLUMN in 0035 - the shape, the
 * reserved-word list, and the unique index - and that migration says in its own comment why a
 * second copy in TypeScript would be wrong. So this validates NOTHING itself; it asks, and
 * translates whatever the database answers.
 *
 * THERE IS DELIBERATELY NO AVAILABILITY CHECK. The owner policy means a lookup could only ever
 * see the caller's own rows, so "is this free?" is unanswerable without a function that reads
 * everyone's - which would be an enumeration oracle over every production's public URL. Trying
 * the claim IS the check, and a taken name comes back as a unique violation.
 */
export async function claimJoinName(showId: string, name: string): Promise<string | null> {
  const wanted = name.trim();
  if (!wanted) return 'Type a name first.';
  const sb = await getSupabase();
  if (!sb) return 'This build runs offline. Publish the production first.';
  const { error } = await sb.from('control_shows').update({ join_slug: wanted }).eq('id', showId);
  if (!error) return null;
  // 23505 unique_violation / 23514 check_violation are the two the constraints raise. The
  // check covers BOTH the shape and the reserved list, and the database does not say which -
  // so the message names both rather than guessing at one.
  if (error.code === '23505') return `“${wanted}” is already taken. Try another.`;
  if (error.code === '23514') {
    return `“${wanted}” cannot be used: 3–40 letters, numbers, - or _, and not a word the site reserves.`;
  }
  return error.message;
}

/** The signed-in owner's hosted control pages. */
export async function myControlShows(): Promise<ControlShowRow[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('control_shows')
    .select('id, slug, outputSlug:output_slug, title')
    .order('created_at');
  if (error) return [];
  return (data ?? []) as ControlShowRow[];
}

/** The renderer's last heartbeat, read as ONE column (the owner's cheap 30 s poll — resolving
 *  the whole row would re-download the multi-MB pinned payload to read a timestamp). */
export async function controlOutputSeenAt(showId: string): Promise<string | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('control_shows').select('output_seen_at').eq('id', showId).single();
  if (error) return null;
  return (data as { output_seen_at: string | null }).output_seen_at ?? null;
}

export async function unpublishControlShow(id: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.from('control_shows').delete().eq('id', id);
}

// ── The operator side (capability-addressed; works signed-out) ───────────────

/**
 * DOES THIS SERVER HAVE THE SEQUENCE ROAD (migration 0071)? Asked once per page load, by the first
 * resolve: the new resolve answers, or PostgREST says it has no such function (PGRST202) - or any
 * other answer that is not "unanswered" - and then this page runs today's protocol for the rest of
 * its life. A page is not switched mid-session: a live-path migration can land while it is open
 * (D7), and a page that changed protocol under an operator would have two cursors for one log.
 * "Unanswered" (the network, a 5xx gateway, 57014) decides nothing: the caller asks again.
 */
let seqRoad: 'unknown' | 'present' | 'absent' = 'unknown';
/** Statement timeouts (57014) the protocol-2 resolve has answered in a row. */
let seqTimeouts = 0;

/** Ask a protocol-2 resolve. `undefined` means use today's RPC (this server has no sequence road,
 *  learned now or before); a failure means the server did not answer and nothing was decided.
 *  `timeoutsBeforeAbsent`: after that many statement timeouts in a row, give up on the new road
 *  for this page's life, as if the server had none. */
async function askSeqRoad(
  sb: NonNullable<Awaited<ReturnType<typeof getSupabase>>>,
  rpc: string,
  args: Record<string, unknown>,
  timeoutsBeforeAbsent = Infinity,
): Promise<RpcAnswer<Record<string, unknown> | null> | undefined> {
  if (seqRoad === 'absent') return undefined;
  const { data, error, status } = await sb.rpc(rpc, args);
  seqTimeouts = error?.code === '57014' ? seqTimeouts + 1 : 0;
  if (!error) {
    seqRoad = 'present';
    return { ok: true, value: data && typeof data === 'object' ? (data as Record<string, unknown>) : null };
  }
  if (unansweredStatus(status, error.code) && seqTimeouts < timeoutsBeforeAbsent) return { ok: false, error: error.message };
  seqRoad = 'absent';
  console.info(
    `[control] ${rpc}: ${error.code ?? ''} ${error.message.slice(0, 160)} - ` +
      (error.code === '57014' ? `${seqTimeouts} statement timeouts in a row` : 'this server has no sequence road') +
      ', so this page follows and sends by row id, as before.',
  );
  return undefined;
}

/** Per control slug, what this page knows of the head (seqSend.ts). Set by the resolve, kept
 *  current by the follow's frames and by every answer; `sendControlVerb` sends proto 2 when one
 *  exists for its slug. */
const seqSessions = new Map<string, SeqSession>();

function seqPlanFor(slug: string, row: Record<string, unknown>): SeqPlan {
  const epoch = typeof row.epoch === 'string' ? row.epoch : null;
  const graphics = row.graphics && typeof row.graphics === 'object' ? (row.graphics as Record<string, HeadSummary>) : {};
  // A page that resolves again (a reconnect) keeps what it learned in the same epoch.
  const session = seqSessions.get(slug) ?? createSeqSession(epoch, {});
  learnHead(session, epoch, graphics);
  seqSessions.set(slug, session);
  return {
    epoch,
    from: Number(row.seq ?? 0),
    tail: (after, followed) => hostedControlTailSeq(slug, after, followed),
    session,
  };
}

/** Resolve the OPERATOR's view by the control capability. A null VALUE means no such production
 *  (a wrong link, or unpublished); a failure means the server did not answer - a database or
 *  PostgREST outage - and the operator page must say so and ask again, never "not found". */
export async function controlShowBySlug(slug: string): Promise<RpcAnswer<ResolvedControlShow | null>> {
  // A client that failed to load (its chunk did not arrive) is a failure to ask, like any other.
  const sb = await getSupabase().catch(() => null);
  if (!sb) return { ok: false, error: 'no backend client' };
  // PROTOCOL 2 FIRST, today's resolve when the server has no sequence road (`seqRoad`). A resolve
  // nobody answered is a failure on either road, and the caller asks again.
  const next = await askSeqRoad(sb, 'control_show_resolve', { p_slug: slug });
  if (next) {
    if (!next.ok) return next;
    return { ok: true, value: next.value ? readResolvedShow(next.value, seqPlanFor(slug, next.value)) : null };
  }
  seqSessions.delete(slug);
  const { data, error } = await sb.rpc('control_show_by_slug', { p_slug: slug });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: true, value: null };
  return { ok: true, value: readResolvedShow(row as Record<string, unknown>, undefined) };
}

/** One resolve's answer, whichever RPC gave it: the proto-2 resolve answers today's columns by
 *  the same names, plus the head. */
function readResolvedShow(row: Record<string, unknown>, seq: SeqPlan | undefined): ResolvedControlShow {
  return {
    id: row.id as string,
    title: row.title as string,
    panel: readPanel(row.panel),
    staged: (row.staged ?? {}) as ResolvedControlShow['staged'],
    live: (row.live ?? {}) as ResolvedControlShow['live'],
    // The log baseline (0008 returns it; the client used to drop it and start at 0, which
    // made the first live row look like a hole and tail-replay from the log's very start).
    lastEventId: Number(row.last_event_id ?? 0),
    output: readOutputPayload(row.output),
    outputSeenAt: (row.output_seen_at as string | null) ?? null,
    liveCue: readLiveCue(row.live_cue),
    profile: readPublishedProfile(row.profile),
    ...(seq ? { seq } : {}),
  };
}

/**
 * Normalize the row-persisted cue snapshot into the per-layer map (docs/CLOUD_PLAYOUT.md §4).
 * Three shapes reach this: format 2 (`{v:2, layers:{…}}`, migration 0034), format 1 (0031's
 * single `{cue, graphic}`, migrated here into the one entry it means), and nothing at all
 * (a pre-0031 server, or a production that has never taken a cue). An unrecognised version
 * degrades to an empty map rather than throwing — the log's cue rows repopulate it.
 */
export function readLiveCue(value: unknown): LiveCueMap {
  if (!value || typeof value !== 'object') return {};
  const v = value as { v?: number; layers?: unknown; cue?: string | null; graphic?: string | null };
  if ((v.v ?? 1) >= 2) {
    const layers = v.layers;
    if (!layers || typeof layers !== 'object') return {};
    const out: LiveCueMap = {};
    for (const [graphic, entry] of Object.entries(layers as Record<string, unknown>)) {
      const cue = (entry as { cue?: unknown } | null)?.cue;
      if (typeof cue === 'string' && cue) out[graphic] = cue;
    }
    return out;
  }
  return v.graphic && v.cue ? { [v.graphic]: v.cue } : {};
}

/** Apply one cue marker to the per-layer map: a cue id puts that layer on air, `null` takes it
 *  off. Off air is an ABSENT key, never a stored null, so "is this layer up" is one question.
 *  Returns the SAME map when nothing changed, so a repeated marker re-renders nothing. */
export function withLiveCue(map: LiveCueMap, graphic: string, cue: string | null): LiveCueMap {
  if (!cue) {
    if (!(graphic in map)) return map;
    const next = { ...map };
    delete next[graphic];
    return next;
  }
  return map[graphic] === cue ? map : { ...map, [graphic]: cue };
}

/**
 * AN RPC EITHER ANSWERED - possibly with nothing - OR FAILED, and the two must never collapse
 * into one value. "No such production" and "the request never arrived" look identical as a null,
 * and a caller that concludes from a failure puts a live graphic off air: the renderer's boot
 * used to paint its wrong-URL card over a real airing because one resolve was dropped. The RPCs
 * the RECOVERY path depends on therefore answer with this, and their callers retry.
 */
export type RpcAnswer<T> = { ok: true; value: T } | { ok: false; error: string };

/** Options for `untilAnswered`. `limit` of 0 (the default) retries for good. */
export interface UntilAnsweredOptions {
  /** The first backoff, doubling per attempt. */
  first?: number;
  /** The backoff ceiling — it keeps knocking at this rate. */
  max?: number;
  /** How many attempts in total; 0 means never give up. */
  limit?: number;
  onRetry?: (attempts: number, error: string) => void;
  /** Asked after every failure and every wait: true ends the walk with the last failure, so a
   *  page that has gone away stops asking. */
  stop?: () => boolean;
  /** Injected so a spec can drive the walk without spending its own seconds. */
  wait?: (ms: number) => Promise<void>;
}

/**
 * Call until it ANSWERS, backing off between attempts, and hand back the answer (or the last
 * failure once `limit` is reached). Retrying for good is the right default where there is no
 * fallback to degrade to: a browser source that never resolves its production has nothing else
 * to try, so giving up means dark until a human notices.
 */
export async function untilAnswered<T>(
  attempt: () => Promise<RpcAnswer<T>>,
  opts: UntilAnsweredOptions = {},
): Promise<RpcAnswer<T>> {
  const first = opts.first ?? 500;
  const max = opts.max ?? 10_000;
  const limit = opts.limit ?? 0;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let tries = 0; ; tries += 1) {
    // A THROW is a question nobody answered too (the client library's chunk failing to load is
    // one), never a reason to reject the whole walk: that left the renderer's boot dead.
    let answer: RpcAnswer<T>;
    try {
      answer = await attempt();
    } catch (err) {
      answer = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (answer.ok) return answer;
    if ((limit > 0 && tries + 1 >= limit) || opts.stop?.()) return answer;
    opts.onRetry?.(tries + 1, answer.error);
    await wait(Math.min(max, first * 2 ** tries));
    if (opts.stop?.()) return answer;
  }
}

/** Resolve the RENDERER's view by the output capability — payload + live snapshot only.
 *  A null VALUE means the capability is gone (unpublished or rotated); a failure means the
 *  question was never answered, and the caller must ask again rather than conclude. */
async function controlOutputBySlug(outputSlug: string): Promise<RpcAnswer<ResolvedOutputShow | null>> {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: 'no backend client' };
  const { data, error } = await sb.rpc('control_output_by_slug', { p_output_slug: outputSlug });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: true, value: null };
  return { ok: true, value: readResolvedOutput(row as Record<string, unknown>, false) };
}

/**
 * The renderer's resolve, protocol 2 first (`control_output_resolve`, migration 0071), today's
 * `controlOutputBySlug` when this server has no sequence road (`seqRoad`). Same answer shape as
 * that one; on protocol 2 it also carries `seq` and every report carries its seq baseline.
 */
export async function controlOutputResolve(outputSlug: string): Promise<RpcAnswer<ResolvedOutputShow | null>> {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: 'no backend client' };
  // A renderer is never left dark by the new road: its resolve reads more than today's (the
  // reports' seq baselines, the legacy check), and if that keeps running out of statement time
  // the renderer boots on today's resolve and follows by row id for this session (review
  // oldclients:F2). An operator page has a person to tell and keeps asking.
  const next = await askSeqRoad(sb, 'control_output_resolve', { p_output_slug: outputSlug }, OUTPUT_RESOLVE_TIMEOUTS);
  if (next) return next.ok ? { ok: true, value: next.value ? readResolvedOutput(next.value, true) : null } : next;
  return controlOutputBySlug(outputSlug);
}

/** Statement timeouts in a row on the renderer's protocol-2 resolve before it gives up on it. */
const OUTPUT_RESOLVE_TIMEOUTS = 3;

function readResolvedOutput(row: Record<string, unknown>, proto2: boolean): ResolvedOutputShow {
  return {
    id: row.id as string,
    title: row.title as string,
    output: readOutputPayload(row.output),
    live: (row.live ?? {}) as LiveReportMap,
    lastEventId: Number(row.last_event_id ?? 0),
    ...(proto2 ? { seq: { epoch: typeof row.epoch === 'string' ? row.epoch : null, legacy: row.legacy === true } } : {}),
  };
}

/** A numbered row off the wire, or not: a log row (`readLogRow`) that also carries its seq and names
 *  its command, which is everything the follower orders and applies by. */
function isSeqRow(value: unknown): value is SeqLogRow {
  const row = readLogRow(value);
  return !!row && typeof row.seq === 'number' && typeof (row.msg as { t?: unknown }).t === 'string';
}

/** A head off the wire, or undefined when it is not one. */
function readSeqHead(value: unknown): SeqHead | undefined {
  const head = value as Partial<SeqHead> | null | undefined;
  return head && typeof head.seq === 'number' && head.graphics && typeof head.graphics === 'object'
    ? { seq: head.seq, graphics: head.graphics as Record<string, HeadSummary> }
    : undefined;
}

/** A `batch` frame off `seq-<show>`, or null (the database is the only writer, and a frame is
 *  still checked before anything is applied from it). */
function readSeqFrame(payload: unknown): SeqFrame<SeqLogRow> | null {
  const p = payload as { epoch?: unknown; rows?: unknown; head?: unknown } | null;
  if (!p || typeof p !== 'object' || !Array.isArray(p.rows)) return null;
  const head = readSeqHead(p.head);
  return { epoch: typeof p.epoch === 'string' ? p.epoch : null, rows: p.rows.filter(isSeqRow), ...(head ? { head } : {}) };
}

/** A `control_*tail_seq` answer (a frame's shape, plus `reset`), or null when it is not one. */
function readSeqTail(data: unknown): SeqTail<SeqLogRow> | null {
  const frame = readSeqFrame(data);
  if (!frame) return null;
  return (data as { reset?: unknown }).reset === true ? { ...frame, reset: true } : frame;
}

/** The operator page's numbered tail (proto 2): rows after `after` in seq order, or null when the
 *  read failed - which is "nothing known", never "nothing missed". */
export async function hostedControlTailSeq(slug: string, after: number, epoch: string | null): Promise<SeqTail<SeqLogRow> | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('control_tail_seq', { p_slug: slug, p_after: after, p_epoch: epoch });
  if (error) return null;
  return readSeqTail(data);
}

/** The renderer's numbered tail, as an answer or a failure (the boot walks it with `untilAnswered`). */
export async function controlOutputTailSeq(
  outputSlug: string,
  after: number,
  epoch: string | null,
): Promise<RpcAnswer<SeqTail<SeqLogRow>>> {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: 'no backend client' };
  const { data, error } = await sb.rpc('control_output_tail_seq', { p_output_slug: outputSlug, p_after: after, p_epoch: epoch });
  if (error) return { ok: false, error: error.message };
  const tail = readSeqTail(data);
  return tail ? { ok: true, value: tail } : { ok: false, error: 'not a tail answer' };
}

/**
 * The renderer's report on protocol 2 (`control_output_report_seq`): the same truth as
 * `controlOutputReport`, stored on the head instead of the production's hot row, with both
 * baselines - the seq a proto-2 boot follows from, and the id an older renderer or page reads.
 */
export async function controlOutputReportSeq(
  outputSlug: string,
  graphic: string,
  data: Record<string, string>,
  state: { groups?: Record<string, string> } | null,
  baseline: {
    /** The last seq applied, and the epoch it belongs to: the server banks the seq only in that
     *  epoch (a republish the renderer has not seen yet must not get a baseline from a gone log). */
    seq: number;
    epoch: string | null;
    /** The highest row id applied: the baseline an older renderer or page reads. */
    event: number | null;
  },
): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.rpc('control_output_report_seq', {
    p_output_slug: outputSlug,
    p_graphic: graphic,
    p_data: data,
    p_state: state,
    p_seq: baseline.seq,
    p_event: baseline.event,
    p_epoch: baseline.epoch,
  });
}

/** The renderer's gap fill — control_tail addressed by the output capability. An empty ANSWER
 *  means the log holds nothing after that row; a failure means nothing is known, which is not
 *  the same as "nothing was missed" and must never be read as it. */
export async function controlOutputTail(outputSlug: string, afterId: number): Promise<RpcAnswer<ControlEventRow[]>> {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: 'no backend client' };
  const { data, error } = await sb.rpc('control_output_tail', { p_output_slug: outputSlug, p_after: afterId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data ?? []) as ControlEventRow[] };
}

/** The renderer's applied-state report (the output-slug sibling of control_report). */
export async function controlOutputReport(
  outputSlug: string,
  graphic: string,
  data: Record<string, string>,
  state: { groups?: Record<string, string> } | null,
  /** The last log row applied when this truth was captured — the graphic's recovery baseline. */
  lastEventId: number | null = null,
): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.rpc('control_output_report', {
    p_output_slug: outputSlug,
    p_graphic: graphic,
    p_data: data,
    p_state: state,
    p_last_event_id: lastEventId,
  });
}

/** The renderer's heartbeat — operator surfaces read output_seen_at staleness. */
export async function controlOutputSeen(outputSlug: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.rpc('control_output_seen', { p_output_slug: outputSlug });
}

// ── THE FAST ROAD (src/control/commandRoads.ts has the measurement and the whole argument) ────
//
// NOBODY HERE SENDS A BROADCAST. A verb leaves this machine once, as the `control_send_many` call
// it always was, and the database emits the command frame on the production's private topic
// inside that same transaction (migration 0056). So this file's job on the fast road is to say
// WHICH items may ride it - the rule below - and to JOIN the topic as a reader.
//
// The first version of this road had every client broadcasting for itself on a public topic, and
// that is what made a read-only output URL able to move a picture: the topic was derivable from
// the output capability and a public topic has no writers it can refuse. Moving the emission into
// the RPC is what puts the fast road behind the same authority as the durable one.

/**
 * SHOWS WHOSE FOLLOWER IS CATCHING UP, and why the fast road stands down while it is.
 *
 * `followControlLog`'s refill walk reads rows the socket could not deliver - after an outage, or
 * behind an id hole - and it is asynchronous. A broadcast arriving mid-walk is applied at once and
 * has no id to be ordered by, so it can land AHEAD of older rows the walk is still fetching: an
 * Out pressed during the outage, then a Take pressed now, and the renderer plays the graphic in
 * and then the arriving `stop` takes it back off. The final picture contradicts the operator's
 * last press, and no id reconciliation can see it because the two commands are genuinely
 * different.
 *
 * So while a walk is in flight the fast road is simply off - for followers AND for the sending
 * page's own optimistic apply, which would invert the same way. Nothing is lost: every command
 * still arrives on the durable road, in log order, which is what the walk is fetching.
 */
const recovering = new Set<string>();

/**
 * HOW LONG A GRAPHIC STAYS ON THE SLOW ROAD AFTER AN EVENT, and why events take it at all.
 *
 * A machine `event` is the one command whose correct handling needs the DATABASE's own clock: the
 * renderer stamps a graphic's clock origin from the row's `created_at`, precisely so that two
 * browser sources of one production agree to the millisecond and a replayed row resumes a match
 * from where it really started (src/control/matchClockWire.ts). A broadcast has no server time,
 * and substituting the sending laptop's clock would put its skew on air. So a clock's events keep
 * the road they have always had.
 *
 * ONLY A CLOCK'S. Every other graphic ignores the instant, and keeping its events slow cost a
 * quiz's Select, Lock and Reveal the whole round trip, 350 ms to a second on a published
 * production against about 90 ms for a Take on the same page (owner, 2026-09-22: the quiz "felt
 * slower than normal graphics"). A sender that knows its graphics says which are clock-free
 * (`fastEvents`), and those events ride exactly like a Take. A sender that says nothing keeps
 * every event slow.
 *
 * That leaves ORDER. If an event is slow and the Take after it is fast, the Take can overtake the
 * event and reach a renderer in the wrong order. So a graphic that has just been sent an event
 * goes slow with it, briefly: 1200 ms, comfortably past the fan-out's measured 650 ms slow mode.
 * It is a deadline rather than an acknowledgement on purpose - nothing can wedge a graphic on the
 * slow road forever, and a failed insert heals by itself.
 *
 * The same interleaving ACROSS DEVICES is not fixed by this and cannot be from one sender: an
 * event from one operator and a Take from another, inside one fan-out window, can still land in
 * different orders on different renderers. The durable log remains the record of what was asked
 * for; https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/playout-lag-when-working-the-queue.md carries it as a known limit.
 */
const SLOW_AFTER_EVENT_MS = 1200;
/** Keyed by SHOW and graphic: a graphic key is a per-production layer name and collides freely
 *  across productions, so a bare name would hold back a different show's layer of the same name. */
const slowUntil = new Map<string, number>();
const slowKey = (showId: string | null, graphic: string) => `${showId ?? '-'}:${graphic}`;

/** The newest send of each graphic, by control slug and graphic, so a failed send is never sent
 *  again after a later press of the same graphic (failedSends.ts `sendWithResend`). An entry
 *  leaves when its send settles, so the map holds only sends in flight. */
const newestSend = new Map<string, object>();

/** One item as `control_send_many` receives it: the command, plus the transport-only mark that
 *  says the database may put this one on the fast road (migration 0056 reads `fast` and inserts
 *  `graphic` and `msg`, so the mark never reaches the log or a receiver). */
type WireItem = ControlSendItem & { fast?: true };

/**
 * SEND ONE VERB, on both roads, from one press.
 *
 * The order is the design: this surface's own picture first, then the one call that writes the
 * durable row AND emits the command frame. The operator's own monitor therefore moves in zero
 * hops, and every other following surface moves when the RPC's transaction commits and the
 * private topic carries it - one road for authority, two speeds.
 *
 * WHEN THE SEND THEN FAILS, this page has already moved and nothing else has: the broadcast is
 * written in the same transaction as the row, so a refused verb aired nowhere but here. `play`
 * cannot be un-played, so the honest ending is to SAY so - this throws exactly as the plain send
 * always did, with `aired` telling the surfaces which sentence to use.
 */
export async function sendControlVerb(opts: {
  slug: string;
  /** The production's show id — the key the hold-back and the recovery stand-down are scoped by.
   *  Null when it is not known yet, which means no fast road for this verb: with no id there is
   *  no way to tell whether this surface is mid-catch-up, and the durable road is the honest
   *  answer to "I cannot tell". */
  showId: string | null;
  items: ControlSendItem[];
  /** Apply on THIS surface, called with the fast items before the send is awaited. */
  applyHere?: (items: ControlSendItem[]) => void;
  /** Which graphics' EVENTS may ride the fast road (see SLOW_AFTER_EVENT_MS): the ones with no
   *  clock, so no need for the row's server time (matchClockWire `eventsNeedServerTime`).
   *  Absent, every event takes the slow road, which is what every event did before. */
  fastEvents?: (graphic: string) => boolean;
  /** This batch is (part of) All out, the panic control: on protocol 2 it is never refused as
   *  stale and never waits behind another send of its graphics (seqSend.ts). */
  allOut?: boolean;
  /** Protocol 2: this batch's number and base, taken at the press of a verb that leaves as several
   *  batches (`sendControlVerbs`). Absent, they are taken now. */
  sender?: SenderBody | null;
}): Promise<VerbSent> {
  const now = Date.now();
  const { showId } = opts;
  // A follower that is catching up takes NOTHING fast, its own presses included (see `recovering`
  // above): the walk is fetching rows older than this press and a frame applied now would land
  // ahead of them.
  const fastRoad = !!showId && !recovering.has(showId);
  // PROTOCOL 2 when this page resolved its production on it: the press gets its number and what
  // the operator had seen, read NOW, at the press - not when the send leaves (seqSend.ts).
  const session = seqSessions.get(opts.slug);
  const sender = session ? (opts.sender ?? pressSender(opts.slug, session, opts.items, !!opts.allOut)) : null;
  // A batch numbered at an earlier press leaves this page's monitor alone on every graphic the page
  // has pressed again since: that later press is what stands, on air and here (the server leaves
  // it too, per graphic). Applied, the older batch put the graphic back on the monitor while air
  // kept the later press, and nothing ever corrected it (review 3 client:F1).
  const overtaken = (graphic: string) => !!sender && (newestPress.get(`${opts.slug}:${graphic}`) ?? 0) > sender.press;
  const wire: WireItem[] = [];
  const fast: ControlSendItem[] = [];
  const held: string[] = [];
  for (const item of opts.items) {
    // Who pressed, and when, ride beside the id (livePath.ts `withSender`), so an output can time
    // the command from the press to its screen.
    const stamped: ControlSendItem = { graphic: item.graphic, msg: withSender(withOid(item.msg), now) };
    const key = slowKey(showId, item.graphic);
    // Left to right, so an event EARLIER IN THE SAME BATCH already holds its graphic back — a
    // snap-then-update pair must not have its second half overtake its first.
    // A clock-free graphic's event is an ordinary command and rides by the same rule as a Take.
    const isEvent = item.msg.t === 'event';
    const mayBeFast = !isEvent || !!opts.fastEvents?.(item.graphic);
    const rides = mayBeFast && fastRoad && (slowUntil.get(key) ?? 0) <= now;
    // AN EVENT THAT DID NOT RIDE STILL HOLDS ITS GRAPHIC BACK, whichever reason kept it off: a
    // clock, a follower mid-catch-up, an unknown show, or an earlier hold. Otherwise the Take
    // behind it would ride the broadcast at about 90 ms while its own row was still in the
    // fan-out's 650 ms slow mode, and a renderer would apply the two in the wrong order.
    if (isEvent && !rides) {
      held.push(key);
      slowUntil.set(key, now + SLOW_AFTER_EVENT_MS);
    }
    if (rides && !overtaken(item.graphic)) fast.push(stamped);
    wire.push(rides ? { ...stamped, fast: true } : stamped);
  }
  // THIS PAGE'S OWN MONITOR, before the round trip. It is applying commands it has not sent yet,
  // which is safe for the same reason the two roads are: the minted id means the echo it gets
  // back - broadcast or durable row, whichever arrives - is recognised and dropped.
  if (fast.length > 0) opts.applyHere?.(fast);
  const send = {};
  const keys = [...new Set(opts.items.map((item) => `${opts.slug}:${item.graphic}`))];
  for (const key of keys) newestSend.set(key, send);
  const resend = { deadline: now + RESEND_WINDOW_MS, stillNewest: () => keys.every((key) => newestSend.get(key) === send) };
  const sent: VerbSent = { skipped: [], superseded: [] };
  try {
    if (session && sender) {
      const settled = await sendSeqVerb(opts.slug, wire, session, sender, resend, !!opts.allOut);
      sent.skipped = settled.skipped;
      if (settled.superseded) sent.superseded = Object.keys(sender.base);
    } else {
      // A server that did not answer gets the same items again, minted ids and all, for a few
      // seconds (failedSends.ts says why that is safe and why it stops). Each attempt is abandoned
      // at its own deadline, so a request still held on this side is cancelled rather than left to
      // commit after a later press.
      await sendWithResend((signal) => sendHostedControlBatch(opts.slug, wire, signal), resend);
    }
    noteSend(true);
  } catch (e) {
    noteSend(false);
    // THE PICTURE MOVED HERE AND NOWHERE ELSE. The surfaces word their notice off this flag,
    // because "Take failed" is a lie to an operator looking at the graphic on their own monitor.
    const failed = e as Error & { aired?: boolean };
    failed.aired = fast.length > 0;
    throw failed;
  } finally {
    // THE HOLD-BACK RUNS FROM WHEN THE ROW EXISTS, not from when the press left. The 1200 ms is
    // budgeted against the fan-out's 650 ms slow mode and assumes the insert itself was quick;
    // on the venue wifi this whole change exists for, `control_send_many` can take longer than
    // the window, and a Take pressed after it expired would then overtake the event's own row.
    // A send that ended abandoned (failedSends.ts ATTEMPT_TIMEOUT_MS) may still commit after this;
    // that is the late commit only a server-side revision check closes: on protocol 2 the server
    // refuses it as superseded by this page's later press (migration 0071).
    const landed = Date.now() + SLOW_AFTER_EVENT_MS;
    for (const key of held) slowUntil.set(key, landed);
    for (const key of keys) if (newestSend.get(key) === send) newestSend.delete(key);
  }
  return sent;
}

/**
 * WHAT A VERB'S SEND CAME TO, beyond landing (protocol 2 only; both lists are empty on protocol 1).
 * A caller that writes a picture after the answer (a chip, a cue marked on or off air) must not
 * write it for either list (`leftAlone`): what stands there is this page's LATER press, whose own
 * handler has already written it, and a write now would overwrite it with this older one.
 */
export interface VerbSent {
  /** Graphics the server left as this page's later press left them, the rest of the batch applied. */
  skipped: string[];
  /** Graphics of a batch refused whole: this page pressed it before its own All out. */
  superseded: string[];
}

/** Every graphic a send left alone, for a caller about to write what the send changed. */
export function leftAlone(sent: VerbSent): string[] {
  return [...sent.skipped, ...sent.superseded];
}

/** Per control slug and graphic, the newest press number this page has given it. */
const newestPress = new Map<string, number>();

/** One batch's number and base, read now. */
function pressSender(slug: string, session: SeqSession, items: readonly ControlSendItem[], allOut: boolean): SenderBody {
  const body = senderBody(session, SENDER_ID, (lastPress += 1), [...new Set(items.map((item) => item.graphic))], allOut);
  for (const graphic of Object.keys(body.base)) newestPress.set(`${slug}:${graphic}`, body.press);
  return body;
}

/**
 * ONE PRESS THAT LEAVES AS SEVERAL BATCHES (All out over more than four layers, an Out of several
 * graphics): every batch is numbered and based HERE, at the press, then the
 * batches are sent one after another, stopping at the first that fails. Numbered as each one
 * left, a later batch took a number above a press the operator made while an earlier batch was on
 * its way, so an All out could undo that later press, and it counted as "seen" whatever another
 * screen did in the meantime (review ordering:F1). The error thrown carries `landed`: how many
 * batches landed before it. Protocol 1 numbers nothing and sends exactly as one call per batch.
 */
export async function sendControlVerbs(
  opts: Omit<Parameters<typeof sendControlVerb>[0], 'items' | 'sender'> & { batches: ControlSendItem[][] },
): Promise<VerbSent> {
  const { batches, ...one } = opts;
  const session = seqSessions.get(one.slug);
  const senders = batches.map((batch) => (session ? pressSender(one.slug, session, batch, !!one.allOut) : null));
  const sent: VerbSent = { skipped: [], superseded: [] };
  // ALL OUT IS PACED to the server's burst cap: a press clearing more graphics than one window's
  // share leaves in waves a window apart, rather than being refused halfway with the rest of the
  // allowance spent. Numbered at the press, a later wave still skips what this page pressed since
  // (the server does), and it leaves out what another screen pressed since (here: the head moved
  // past the press's base), which the panic control was pressed before.
  const waves = one.allOut ? allOutWaves(batches.map((batch) => batch.length)) : [];
  let waveLanded = 0;
  let landed = 0;
  try {
    for (const [index, batch] of batches.entries()) {
      let items = batch;
      if (waves[index] > 0) {
        if (waves[index] !== waves[index - 1]) {
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, waveLanded + BURST_WINDOW_MS - Date.now())));
        }
        const base = senders[index]?.base;
        if (session && base) items = batch.filter((item) => (session.revs.get(item.graphic) ?? 0) <= (base[item.graphic] ?? 0));
        sent.skipped.push(...new Set(batch.filter((item) => !items.includes(item)).map((item) => item.graphic)));
      }
      const each = items.length ? await sendControlVerb({ ...one, items, sender: senders[index] }) : { skipped: [], superseded: [] };
      waveLanded = Date.now();
      sent.skipped.push(...each.skipped);
      sent.superseded.push(...each.superseded);
      landed += 1;
    }
  } catch (e) {
    throw Object.assign(e as Error, { landed });
  }
  return sent;
}

/** How many batches of a `sendControlVerbs` press landed before the one that failed. */
export function verbsLanded(e: unknown): number {
  const landed = (e as { landed?: unknown } | null)?.landed;
  return typeof landed === 'number' ? landed : 0;
}

/** Did this send put commands on THIS surface's screen before failing? Read off the thrown
 *  error. */
export function verbAired(e: unknown): boolean {
  return (e as { aired?: unknown } | null)?.aired === true;
}

/** Was the send refused because another screen changed a graphic first (protocol 2)? The pages
 *  word that notice with `staleSentence`. */
export { isStale as verbStale, staleSentence } from './seqSend';

/** THIS PAGE'S SENDER on the sequence road: one uuid per page load, in memory only, and one press
 *  number per payload (seqSend.ts says why neither may be persisted or shared). */
const SENDER_ID = uuid();
let lastPress = 0;

/**
 * HOW LONG A STALLED SEND HOLDS THE NEXT ONE OF ITS GRAPHIC: one attempt's deadline
 * (failedSends.ts ATTEMPT_TIMEOUT_MS), after which that attempt is abandoned and counts as
 * unanswered anyway. Past it, the next press leaves; if the abandoned one lands after all, the
 * server refuses it as superseded.
 */
const seqQueue = createGraphicFifo(ATTEMPT_TIMEOUT_MS);

/** One verb on protocol 2: queued behind the same graphic's send in flight (All out is not), sent
 *  and resent like any verb, and its answer settled - a stale refusal throws the plain sentence. */
async function sendSeqVerb(
  slug: string,
  wire: WireItem[],
  session: SeqSession,
  sender: SenderBody,
  resend: { deadline: number; stillNewest: () => boolean },
  allOut: boolean,
): Promise<{ skipped: string[]; superseded: boolean }> {
  const graphics = Object.keys(sender.base);
  let settled: { outcome: 'landed' | 'superseded'; skipped: string[] } = { outcome: 'landed', skipped: [] };
  const send = () =>
    // A press that waited in the queue past its own resend window has no fair attempt left: it
    // is unanswered, never a 0 ms attempt that may still reach the server (review ordering:F5).
    resend.deadline - Date.now() < MIN_ATTEMPT_MS
      ? Promise.reject(unansweredError())
      : sendWithResend(async (signal) => {
          settled = settleAnswer(session, await sendSeqBatch(slug, wire, sender, signal), graphics);
        }, resend);
  await (allOut ? send() : seqQueue.run(graphics, send));
  return { skipped: settled.skipped, superseded: settled.outcome === 'superseded' };
}

/**
 * `control_send_seq`: the batch `control_send_many` takes, plus who pressed it and what they had
 * seen (migration 0071). A lock timeout (55P03: the head held past the RPC's own 1 s, which is below
 * this page's 1.5 s attempt so the answer arrives) wrote nothing and the send is idempotent, so it
 * counts as unanswered and is sent again (review latency:F9 and latency:L2).
 */
async function sendSeqBatch(slug: string, items: WireItem[], sender: SenderBody, signal: AbortSignal): Promise<SendAnswer | null> {
  const sb = await getSupabase();
  if (!sb) throw unansweredError();
  const { data, error, status } = await sb
    .rpc('control_send_seq', { p_slug: slug, p_items: items, p_sender: sender })
    .abortSignal(signal);
  if (error) {
    if (error.code === '55P03') {
      console.warn(`[control] control_send_seq: ${status} 55P03 ${error.message.slice(0, 160)}`);
      throw unansweredError();
    }
    throw rpcFailure('control_send_seq', error, status);
  }
  return readSendAnswer(data);
}

/** What `control_ping_seq` answered: the server's clock at the commit, or why there was no ping. */
export type PingAnswer = { ok: true; at: number } | { ok: false; unavailable: boolean; detail: string };

/**
 * `control_ping_seq` (migration 0072, docs/work-specs/playout-ready/spec.md R9): one row through
 * the numbered send path that airs nothing; each output answers in its Presence entry. A server
 * without the migration answers PGRST202, which is `unavailable`, never an error on screen.
 */
export async function controlPingSeq(slug: string, id: string): Promise<PingAnswer> {
  const sb = await getSupabase();
  if (!sb) return { ok: false, unavailable: true, detail: 'no backend' };
  const { data, error } = await sb.rpc('control_ping_seq', { p_slug: slug, p_id: id });
  if (error) return { ok: false, unavailable: error.code === 'PGRST202', detail: error.message.slice(0, 160) };
  const at = (data as { at?: unknown } | null)?.at;
  return typeof at === 'number' ? { ok: true, at } : { ok: false, unavailable: false, detail: 'no answer' };
}

/** One wire item of a batched send. */
export interface ControlSendItem {
  graphic: string;
  msg: ControlMessage | CueStatusMsg;
}

/** A command as a FOLLOWING surface receives it. Wider than `ControlSendItem` on purpose: the
 *  log also carries the two meta rows nobody sends as a verb, and a surface reading one door for
 *  both roads has to be able to name them before ignoring them. */
export interface ControlCommandItem {
  graphic: string;
  msg: ControlEventRow['msg'];
}

/** Send several commands as ONE atomic, log-ordered insert (`control_send_many`, 0029) —
 *  a multi-part verb must not pay one RPC round-trip per command or fail halfway through. An item
 *  marked `fast` is also broadcast on the production's private topic by the same transaction
 *  (migration 0056); the mark itself is transport and is never written to the log. */
export async function sendHostedControlBatch(slug: string, items: WireItem[], signal: AbortSignal): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  const { error, status } = await sb.rpc('control_send_many', { p_slug: slug, p_items: items }).abortSignal(signal);
  if (error) throw rpcFailure('control_send_many', error, status);
}

// ── The cue verbs (docs/CLOUD_PLAYOUT.md §4) — ONE author for the wire sequence. ─────────────

// Each verb is defined ONCE, as the list of commands it is — and then either sent to the log or
// applied to a local rehearsal stage (docs/CLOUD_PLAYOUT.md §4a). Keeping the sequence as DATA
// is what makes a rehearsal faithful: rehearsing and airing are the same commands in the same
// order, not two implementations that have to be kept in step by hand.

/**
 * Take a cue: its data, its graphic in, and the shared cue status row. It touches ONE LAYER,
 * its own. Taking a lower third leaves the bug and the ticker on air, because those are other
 * graphics and therefore other layers (docs/CLOUD_PLAYOUT.md §4); taking a second cue on the
 * SAME graphic re-airs that one instance, which is what makes two cues over one lower third
 * replace each other and not stack.
 *
 * Clearing another layer is the operator's own verb (`clearCueItems` / `clearAllCueBatches`),
 * never a side effect of taking this one — an implicit stop is exactly what made a production
 * single-layer.
 */
export function takeCueItems(cue: {
  direct?: boolean;
  id: string;
  graphic: string;
  values: Record<string, string>;
  /** A timed cue's arm (control/cueAuto.ts `markerAuto`), carried on its marker so every follower
   *  learns the countdown from the Take's own row. */
  auto?: MarkerAuto | null;
}): ControlSendItem[] {
  return [
    { graphic: cue.graphic, msg: { t: 'update', data: cue.values } },
    { graphic: cue.graphic, msg: { t: 'play' } },
    { graphic: cue.graphic, msg: { t: 'cue', cue: cue.id, ...(cue.direct ? { direct: true } : {}), ...(cue.auto ? { auto: cue.auto } : {}) } },
  ];
}

/** Out ONE layer: play that graphic off and clear its cue status. */
export function clearCueItems(liveGraphic: string): ControlSendItem[] {
  return [
    { graphic: liveGraphic, msg: { t: 'stop' } },
    { graphic: liveGraphic, msg: { t: 'cue', cue: null } },
  ];
}

/**
 * THE MOST ITEMS ONE `control_send_many` CALL TAKES (migration 0029: a count outside 1..8 raises
 * `not a command batch` and the WHOLE insert is refused). It is a verb, not an ingest API.
 */
const COMMAND_BATCH_MAX = 8;

/** An all-layers clear pays two items per layer, so it goes out in batches of four layers. */
const LAYERS_PER_CLEAR_BATCH = COMMAND_BATCH_MAX / 2;

/**
 * Out EVERY live layer: the "clear the screen" verb a multi-layer production needs, since no
 * single Take does it any more. One batch per four layers, so a production bigger than that
 * clears in log order rather than not at all.
 */
/** Per graphic, whether the server's heads last called it on, as this page heard them; null where
 *  it follows no head (the id road, or not resolved yet). */
export function headsSay(slug: string): ReadonlyMap<string, boolean> | null {
  const session = seqSessions.get(slug);
  return session ? new Map(session.on) : null;
}

/** All out's confirmation: wait until the heads say none of `graphics` is on, or `ms` passes, and
 *  answer which still are. A page that follows no head has nothing to wait for. */
export async function headsStillOn(slug: string, graphics: readonly string[], ms: number): Promise<string[]> {
  const stillOn = () => graphics.filter((graphic) => headsSay(slug)?.get(graphic) === true);
  const deadline = Date.now() + ms;
  while (stillOn().length > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
  return stillOn();
}

export function clearAllCueBatches(liveGraphics: string[]): ControlSendItem[][] {
  const batches: ControlSendItem[][] = [];
  for (let i = 0; i < liveGraphics.length; i += LAYERS_PER_CLEAR_BATCH) {
    batches.push(liveGraphics.slice(i, i + LAYERS_PER_CLEAR_BATCH).flatMap(g => clearCueItems(g).map(item =>
      item.msg.t === 'stop' ? { ...item, msg: { ...item.msg, sound: false as const } } : item)));
  }
  return batches;
}

/**
 * Follow the command log with the FULL recovery discipline, owned once (docs/CLOUD_PLAYOUT.md
 * §3; previously hand-rolled per surface, which is how the same hole-handling bug shipped
 * three times): dedupe by row id; on an id hole recover from the tail INSTEAD of applying the
 * holed row (applying it would advance the cursor past the gap and the tail's older rows
 * would then be dropped as duplicates — a failed tail retries on the next row); tail-fill on
 * every (re)subscribe, because rows inserted while the socket was down produce no replay; and
 * apply a row that commits late BELOW the cursor instead of dropping it, because ids are taken at
 * insert and commit out of order (logFollow.ts).
 * `tail` is injected — the control and output capabilities read the log through different RPCs.
 */
/** The tail RPCs' page size, owned with the rest of the cursor in `logFollow.ts`. */
export { CONTROL_TAIL_PAGE } from './logFollow';

/**
 * THE FLOOR UNDER REALTIME: how often a following surface re-reads the log even when nothing has
 * happened on the socket.
 *
 * Every recovery above is driven by an EVENT — a row arriving with a hole in front of it, or a
 * `SUBSCRIBED` after a reconnect. A channel that never joins produces neither, and there is no
 * shortage of ways for that to happen on the surfaces this runs on: a venue proxy that passes the
 * WebSocket upgrade and eats the frames, a Realtime incident, a CasparCG CEF, a phone that
 * suspends the tab so long the rejoin never lands. The renderer then sits on whatever its boot
 * catch-up fetched and airs nothing else for the rest of the show, with nothing anywhere saying
 * why — the exact on-air failure the discipline above exists to prevent, reached from the one
 * direction it did not cover.
 *
 * 30 SECONDS, and the interval is a real decision rather than a round number:
 *
 * - It is a FLOOR, not a transport. When Realtime works it delivers in well under a second and
 *   every poll returns zero rows; the only thing this buys on a healthy production is load.
 * - The cost, against the numbers in docs/CLOUD_PLAYOUT.md's concurrency budget: one
 *   `control_tail` per following surface per 30 s is 0.03 req/s each, so 100 simultaneous
 *   productions with a renderer and two operator pages apiece cost ~10 req/s on PostgREST —
 *   under 2% of the ~600 req/s the audience plane already spends at that scale, which is the
 *   thing that actually breaks first. At 5 s it would be ~60 req/s, a tenth of that ceiling,
 *   spent almost entirely on empty answers.
 * - The benefit is bounded staleness: with Realtime dead, the worst a command can be late is one
 *   interval. Against today's alternative — silence until somebody reloads the browser source —
 *   30 s is the difference between a slow production and a dead one.
 * - Not longer. A take that airs a minute after the press is indistinguishable from a take that
 *   never aired; the operator has already pulled the URL and started debugging by then.
 *
 * A surface that needs commands to land instantly while Realtime is down does not want a faster
 * poll — it wants to know, which is what `onStatus` is for.
 */
export const CONTROL_POLL_MS = 30_000;

/** What a following surface can say about its live connection. `everJoined: false` after the
 *  first poll tick means the log is arriving ONLY through that poll. */
export interface ControlFollowStatus {
  /** The last status Realtime reported ('' until it reports anything). */
  status: string;
  /** Has the channel EVER joined? */
  everJoined: boolean;
}

export async function followControlLog(opts: {
  showId: string;
  /** The log baseline from the resolve call — rows after it follow live. */
  from: number;
  tail: (afterId: number) => Promise<ControlEventRow[]>;
  onRow: (row: ControlEventRow) => void;
  onReplay?: (replaying: boolean) => void;
  /**
   * THE FAST ROAD's tap: the same commands, broadcast on this channel and arriving hundreds of
   * milliseconds before their durable rows do (src/control/commandRoads.ts).
   *
   * `onRow` is untouched and keeps being the durable log - the action log, the staged buffer, the
   * renderer's report baseline and this follow's own cursor are all built from it. This is the
   * other question: "put it on the screen NOW." A surface that takes it therefore applies each
   * command from TWO places, and must reconcile them with `createAppliedOnce` so that whichever
   * road got here first wins and the other is dropped. Nothing else can catch a miss: a duplicate
   * `play` re-runs an animation and settles on the picture that was already there.
   *
   * These commands carry no server time and no row id, because neither exists yet. Anything that
   * needs either takes the slow road by construction (`sendControlVerb`).
   */
  onCommand?: (items: ControlCommandItem[]) => void;
  /** Called on every Realtime status change AND on every poll tick, so a surface with somewhere
   *  to show it can say "not joined — polling" instead of showing a stale picture in silence. */
  onStatus?: (status: ControlFollowStatus) => void;
  /** The FAST road's own join status - a different question from `onStatus`, and one only a
   *  surface with a debug line has anywhere to put. Never joining means commands still arrive,
   *  on the durable road, at yesterday's speed. */
  onCommandStatus?: (status: string) => void;
  /** Told each time a gap in the ids outlived the reorder window and sent the follow to the tail:
   *  a count the output reports (livePath.ts). */
  onHole?: () => void;
  /**
   * PROTOCOL 2 (the resolve's `seq`): follow the numbered log on `seq-<show>` instead, with the
   * same `onRow`, `onHole` and `onStatus`. `from`, `tail` and the fast road are the id road's and
   * are not used then: a numbered frame arrives at the same moment as the command frame (both are
   * written by one transaction), so there is nothing for a fast road to win, and every frame also
   * keeps the page's revisions current for its next press.
   */
  seq?: SeqPlan;
  /** Protocol 2: the production was published again, so every seq this page holds is from a log
   *  that is gone (a timed cue's arm rows are ordered by them, control/cueArmWire.ts). */
  onEpochReset?: () => void;
}): Promise<() => void> {
  if (opts.seq) {
    const plan = opts.seq;
    const { showId } = opts;
    return followSeqLog({
      showId,
      from: plan.from,
      epoch: plan.epoch,
      tail: plan.tail,
      onRows: (rows, replayed) => {
        if (replayed && rows.length) opts.onReplay?.(true);
        rows.forEach((row) => opts.onRow(row));
        if (replayed && rows.length) opts.onReplay?.(false);
      },
      onHead: (head, epoch) => learnHead(plan.session, epoch, head.graphics),
      onEpoch: (epoch, reset) => {
        learnHead(plan.session, epoch, {});
        if (reset) opts.onEpochReset?.();
      },
      // WHILE THE FOLLOWER HOLDS ROWS OR READS THE TAIL this page's own presses take the durable
      // road (see `recovering` above): applied to its monitor now, they would land ahead of older
      // rows still on their way, and their echo, dropped by the oid claim, could not put it right.
      onBusy: (busy) => (busy ? recovering.add(showId) : recovering.delete(showId)),
      onHole: opts.onHole,
      onStatus: opts.onStatus,
    });
  }
  // Dedupe by row id, the reorder window, hole recovery and the late-commit window all live in
  // `createLogFollower` (logFollow.ts, run in Node by scripts/log-follow.test.mjs). What stays here
  // is the wiring: Realtime, the poll floor and the fast road.
  //
  // WHILE A WALK IS IN FLIGHT THE FAST ROAD STANDS DOWN (see `recovering` above): the walk is
  // fetching rows OLDER than anything a broadcast can carry, and a broadcast has no id to be
  // ordered against them.
  const follower = createLogFollower<ControlEventRow>({
    from: opts.from,
    tail: opts.tail,
    onRow: opts.onRow,
    onReplay: opts.onReplay,
    onWalk: (walking) => (walking ? recovering.add(opts.showId) : recovering.delete(opts.showId)),
    onHole: opts.onHole,
  });
  const { onCommand } = opts;
  let everJoined = false;
  let status = '';
  const report = () => opts.onStatus?.({ status, everJoined });
  // The floor. It runs whatever the socket is doing: a poll that returns nothing costs one empty
  // RPC, and deciding when it is "needed" would mean trusting exactly the signal that is broken.
  // It re-reads the late-commit window behind the cursor, which is what catches a row that
  // committed late while the live channel was not delivering (logFollow.ts).
  const poll = setInterval(() => {
    report();
    void follower.refill('behind');
  }, CONTROL_POLL_MS);
  const unsubscribe = await subscribeControlEvents(opts.showId, follower.offer, (next) => {
    status = next;
    if (next === 'SUBSCRIBED') {
      everJoined = true;
      // At once on the first join; on a rejoin after a random spread, so outputs that dropped
      // together do not all read the tail in the same second.
      follower.joined();
    }
    report();
  }, onCommand && ((items) => {
    if (!follower.walking) onCommand(items);
  }), opts.onCommandStatus);
  return () => {
    clearInterval(poll);
    follower.stop();
    recovering.delete(opts.showId);
    unsubscribe();
  };
}

/**
 * FOLLOW THE NUMBERED LOG (protocol 2, migrations 0070 and 0071): `seq-<show>` frames through the
 * sequence follower (seqFollow.ts has every rule and why), a refill on every join (spread on a
 * rejoin) and every CONTROL_POLL_MS whatever the socket does, and the same status reporting as the
 * id road. The renderer calls this directly, because it needs each batch whole (`replayed` is where
 * a superseded animation may be elided); a page gets it through `followControlLog`'s `seq`.
 */
export function followSeqLog(opts: {
  showId: string;
  from: number;
  epoch: string | null;
  tail: (after: number, epoch: string | null) => Promise<SeqTail<SeqLogRow> | null>;
  onRows: (rows: SeqLogRow[], replayed: boolean) => void;
  onHead?: (head: SeqHead, epoch: string | null) => void;
  /** `reset`: the production was published again, and every seq held is from a log that is gone. */
  onEpoch?: (epoch: string | null, reset: boolean) => void;
  onBusy?: (busy: boolean) => void;
  /** A gap outlived the reorder window and sent the follow to the tail (livePath.ts counts it). */
  onHole?: () => void;
  onStatus?: (status: ControlFollowStatus) => void;
}): () => void {
  const follower = createSeqFollower<SeqLogRow>({
    from: opts.from,
    epoch: opts.epoch,
    tail: opts.tail,
    onRows: opts.onRows,
    onHead: opts.onHead,
    onEpoch: opts.onEpoch,
    onBusy: opts.onBusy,
    onHole: opts.onHole,
  });
  let everJoined = false;
  let status = '';
  const report = () => opts.onStatus?.({ status, everJoined });
  const poll = setInterval(() => {
    report();
    void follower.refill();
  }, CONTROL_POLL_MS);
  const leave = joinSeqTopic(opts.showId, {
    onBatch: (payload) => {
      const frame = readSeqFrame(payload);
      if (frame) follower.offer(frame);
    },
    onStatus: (next) => {
      status = next;
      if (next === 'SUBSCRIBED') {
        everJoined = true;
        follower.joined();
      }
      report();
    },
  });
  return () => {
    clearInterval(poll);
    follower.stop();
    leave();
  };
}

/** What one follower of a production's numbered topic hears. */
interface SeqTopicUser {
  onBatch: (payload: unknown) => void;
  /** Each status the join reports; a user that arrives after the join hears where it stands. */
  onStatus: (status: string) => void;
}

interface SeqTopicState {
  users: Set<SeqTopicUser>;
  channel: RealtimeChannel | null;
  /** The last status the join reported ('' before any). */
  status: string;
  everJoined: boolean;
  /** Failed joins (or server closes) in a row since the last SUBSCRIBED. */
  failures: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

/**
 * ONE JOIN OF `seq-<show>` PER PAGE, however many followers: supabase-js hands back the same
 * channel object for a topic a page already has, a second `subscribe` on it never reports, and
 * removing it for one user removes it for all, so the join lives here and leaves with its last
 * user. Nothing but the numbered frames is on this channel: no Presence, so no Presence limit can
 * close it (commandRoads.ts `seqTopic`).
 */
const seqTopics = new Map<string, SeqTopicState>();

function joinSeqTopic(showId: string, user: SeqTopicUser): () => void {
  let state = seqTopics.get(showId);
  if (!state) {
    state = { users: new Set(), channel: null, status: '', everJoined: false, failures: 0, retryTimer: null, closed: false };
    seqTopics.set(showId, state);
    void openSeqTopic(showId, state);
  }
  const joined = state;
  joined.users.add(user);
  if (joined.status) user.onStatus(joined.status);
  return () => {
    if (!joined.users.delete(user) || joined.users.size > 0) return;
    joined.closed = true;
    if (seqTopics.get(showId) === joined) seqTopics.delete(showId);
    if (joined.retryTimer) clearTimeout(joined.retryTimer);
    const ch = joined.channel;
    joined.channel = null;
    if (ch) void getSupabase().then((sb) => sb?.removeChannel(ch));
  };
}

async function openSeqTopic(showId: string, state: SeqTopicState): Promise<void> {
  state.retryTimer = null;
  const sb = await getSupabase().catch(() => null);
  if (state.closed) return;
  const tell = (status: string) => {
    state.status = status;
    for (const user of [...state.users]) user.onStatus(status);
  };
  if (!sb) {
    // No client (none configured, or its chunk failed to load): the poll floor carries on, and
    // the next attempt is on the same schedule as a refused join.
    tell('CHANNEL_ERROR');
    state.failures += 1;
    state.retryTimer = setTimeout(() => void openSeqTopic(showId, state), seqJoinRetryDelay(state.failures));
    return;
  }
  const ch = sb.channel(seqTopic(showId), { config: { private: true } });
  // supabase-js hands back a channel of this topic that is still leaving (a join right after the
  // last leave, on a connected socket that has not answered the leave yet), and subscribing it does
  // nothing and never reports. Wait for it to go, and open a fresh one (review 3 client:F4).
  if (ch.state !== 'closed') {
    await sb.removeChannel(ch);
    if (!state.closed) void openSeqTopic(showId, state);
    return;
  }
  state.channel = ch;
  ch.on('broadcast', { event: SEQ_BATCH_EVENT }, (frame: { payload?: unknown }) => {
    for (const user of [...state.users]) user.onBatch(frame.payload);
  });
  ch.subscribe((status) => {
    if (state.closed || state.channel !== ch) return;
    if (status === 'SUBSCRIBED') {
      state.everJoined = true;
      state.failures = 0;
    }
    tell(status);
    if (status === 'SUBSCRIBED') return;
    // Once joined, supabase-js rejoins by itself after an error or a timeout. It does not after the
    // server CLOSES the channel, and a join that never succeeded is asked again on this file's own
    // schedule (seqFollow.ts `seqJoinRetryDelay`) rather than supabase-js's quick loop.
    if (state.everJoined && status !== 'CLOSED') return;
    state.channel = null;
    void sb.removeChannel(ch);
    state.failures += 1;
    state.retryTimer = setTimeout(() => void openSeqTopic(showId, state), seqJoinRetryDelay(state.failures));
  });
}

/** Stage PREPARED data — shared with every operator page on this slug. A refusal THROWS: the
 *  RPC answers an error rather than rejecting, and the page keeps an edit on screen until the
 *  write either comes back round the log or is refused (components/control/ownStaged.ts). */
export async function stageHostedData(slug: string, graphic: string, data: Record<string, string>): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  const { error, status } = await sb.rpc('control_stage', { p_slug: slug, p_graphic: graphic, p_data: data });
  if (error) throw rpcFailure('control_stage', error, status);
}

/** The command tail after a known id — a reconnecting side fills its gap from here. */
export async function hostedControlTail(slug: string, afterId: number, graphic?: string): Promise<ControlEventRow[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc('control_tail', { p_slug: slug, p_graphic: graphic ?? null, p_after: afterId });
  if (error) return [];
  return (data ?? []) as ControlEventRow[];
}

/**
 * Every row of one production's log after `after`, up to and including `upTo` (a head this show
 * resolved with, so a row with that id exists), paged. Null when the read did not reach `upTo`:
 * a failed page (`hostedControlTail` answers a failure as no rows) or more than `maxPages`
 * pages. A recovery that replays half the rows would be worse than one that replays none.
 */
export async function hostedControlRange(
  slug: string,
  after: number,
  upTo: number,
  maxPages = 4,
): Promise<ControlEventRow[] | null> {
  const rows: ControlEventRow[] = [];
  let from = after;
  for (let page = 0; page < maxPages && from < upTo; page += 1) {
    const got = await hostedControlTail(slug, from);
    if (got.length === 0) return null;
    for (const row of got) if (row.id <= upTo) rows.push(row);
    from = got[got.length - 1].id;
  }
  return from >= upTo ? rows : null;
}

/**
 * Live log rows for one show (the show-chat pattern: Realtime nudges, the durable table is
 * the truth). Returns an unsubscribe. Rows are NOT guaranteed to arrive in id order - one
 * transaction's rows can reach the log topic shuffled - so the caller keeps its own last-seen id,
 * reorders what arrives close together and uses hostedControlTail after a real gap
 * (`followControlLog` does all three).
 */
export async function subscribeControlEvents(
  showId: string,
  onRow: (row: ControlEventRow) => void,
  onStatus?: (status: string) => void,
  /** The FAST road: the same commands, broadcast by the database on the production's PRIVATE
   *  topic and arriving before their durable rows do. Omitting it leaves the surface on the log
   *  alone - and leaves the private channel unjoined, which is why a surface that follows nothing
   *  costs nothing. */
  onCommand?: (items: ControlCommandItem[]) => void,
  /** The command channel's own join status, reported separately from the log's for the reason
   *  written at the join below: a surface with somewhere to show it can say the fast road is
   *  missing, which is otherwise INVISIBLE - a dead fast road looks exactly like yesterday. */
  onCommandStatus?: (status: string) => void,
): Promise<() => void> {
  const sb = await getSupabase();
  if (!sb) return () => {};

  // ── THE LOG, on the production's PRIVATE topic (migration 0064, commandRoads.ts `logTopic`). ──
  //
  // The database broadcasts every inserted `control_events` row here as `{ id, graphic, msg,
  // created_at }`, and a holder of the show id may read it. This is the log's ONLY live road.
  // Until 2026-09-24 the rows also came over `postgres_changes` on `control-<show id>`, and that
  // road needed a public read on the table - which let anybody with the anon key list every
  // production's log. Migration 0066 replaced that read with an owner-and-team one, so a
  // signed-out renderer receives nothing over `postgres_changes` any more and no longer joins it.
  //
  // EVERY STATUS, not only SUBSCRIBED. SUBSCRIBED fires on every (re)join, not only the first -
  // that is where a consumer tail-fills the gap a dropped socket left (a broadcast is never
  // replayed, so without it a sleeping tab misses commands until the NEXT row happens to arrive
  // with a visible id hole). The OTHER statuses (CHANNEL_ERROR, TIMED_OUT, CLOSED) are what make
  // a channel that never joins distinguishable from a quiet show: `followControlLog` both polls
  // under them and says so. A refused private join lands here too, and reads as "not joined -
  // polling", which is true: the log then arrives only through the poll floor.
  const log = sb
    .channel(logTopic(showId), { config: { private: true } })
    .on('broadcast', { event: LOG_ROW_EVENT }, (frame) => {
      const row = readLogRow((frame as { payload?: unknown }).payload);
      if (row) onRow(row);
    })
    .subscribe((status) => onStatus?.(status));

  // ── THE FAST ROAD, on its own PRIVATE channel (src/control/commandRoads.ts). ────────────────
  //
  // Same socket, second join. It carries only broadcasts, and only the database writes to it, so
  // a frame arriving here has already passed `control_send_many`'s checks and the control slug's
  // authority.
  //
  // ITS STATUS IS REPORTED SEPARATELY from the log's, and never through `onStatus`. That signal
  // drives "not joined - polling" and the tail-fill on rejoin, and both belong to the LOG: this
  // channel joining or failing changes only how FAST a command arrives, never whether it does, so
  // a refused command join must read as yesterday's speed rather than as a broken production.
  //
  // But it must read as SOMETHING. Nothing else on this page can tell: every command still
  // arrives on the durable road, every spec still passes, and a fast road that quietly stopped
  // being joined - a policy typo, a Realtime instance without `realtime.send` - is invisible
  // until somebody times a Take. `realtime.send` swallows its own errors into a warning nobody
  // reads (migration 0056), so this status is the one signal a surface has.
  const commands = onCommand
    ? sb
        .channel(commandTopic(showId), { config: { private: true } })
        .on('broadcast', { event: COMMAND_EVENT }, (frame) => {
          const items = readCommandFrame<ControlEventRow['msg']>((frame as { payload?: unknown }).payload);
          if (items) onCommand(items);
        })
        .subscribe((status) => onCommandStatus?.(status))
    : null;

  return () => {
    void sb.removeChannel(log);
    if (commands) void sb.removeChannel(commands);
  };
}

/** A broadcast log row, or null when the frame is not one. The database is the only writer on the
 *  topic, but a frame is still checked for the fields `followControlLog` orders and applies by. */
function readLogRow(payload: unknown): ControlEventRow | null {
  const row = payload as Partial<ControlEventRow> | null;
  if (!row || typeof row.id !== 'number' || typeof row.graphic !== 'string' || !row.msg || typeof row.msg !== 'object') {
    return null;
  }
  return row as ControlEventRow;
}
