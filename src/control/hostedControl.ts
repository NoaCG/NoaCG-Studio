// Hosted control (Phase 5): the client side of migration 0008. A local SHOW publishes as a
// control_shows row (id = the local Show.id); operating it is capability-addressed — the
// unguessable slug opens the hosted page at ?control=<slug>, no account needed. Commands
// are INSERTS into the control_events log (DB-ordered, recoverable); staging and the
// graphics' applied-state reports ride the same log as meta rows.
//
// The published `panel` spec also carries each graphic's saved ENTRIES, read out of the
// library at publish time (docs/SAVED_CONTENT_MODEL.md §4) — the hosted page renders them as
// a read-only switcher, so picking one stages its data and airing it stays a deliberate take.

import { getSupabase } from '../backend/supabase';
import { graphicLayer, type Show } from '../model/shows';
import { loadGraphics, entriesForSavedGraphic, templateForSavedGraphic, type GraphicDoc } from '../model/library';
import type { Resolution, SpxField, SpxTemplate } from '../model/types';
import { DEFAULT_GRAPHICS_RESOLUTION } from '../model/projectFormat';
import { fileToDataUrl, isImageAsset } from '../assets/assetUtils';
// The audience plane owns the shape of its own brand (docs/ARCHITECTURE.md §3, control ->
// audience): publish is the courier, not the author.
import { audienceBrandFor } from '../audience/audienceBrand';
// The library->air gate (docs/ARCHITECTURE.md §3, control -> validation): publishing is the
// boundary where a library draft becomes something a renderer trusts.
import { assertProductionGate } from '../validation/productionGate';
import { joinNameCandidates } from './joinName';
import { COMMAND_EVENT, commandTopic, readCommandFrame, withOid } from './commandRoads';
import { fieldDescriptors, type ControlMessage } from './controlModel';
import { cueDataRows, type CueDataRow } from './cueData';

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
  assets: { path: string; data: string }[];
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
  id: string;
  graphic: string;
  label: string;
  values: Record<string, string>;
  note?: string;
}

export interface OutputPayload {
  v: 1;
  /** The production canvas — the stage the output page scales to the viewport. */
  resolution: Resolution;
  graphics: OutputGraphicSpec[];
  cues: OutputCue[];
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
}

/** What the output renderer resolves — payload + live snapshot, never panel/staged/slug. */
export interface ResolvedOutputShow {
  id: string;
  title: string;
  output: OutputPayload | null;
  live: LiveReportMap;
  lastEventId: number;
}

/** The cue STATUS row (docs/CLOUD_PLAYOUT.md §4): written on Take/Out so every open surface
 *  agrees on which cue is live. Receivers ignore it — pages render it. `cue: null` = off air. */
export interface CueStatusMsg {
  t: 'cue';
  cue: string | null;
}

/** A log row as delivered by Realtime / the tail RPC. */
export interface ControlEventRow {
  id: number;
  graphic: string;
  /** When the row was written (0008's `control_tail` has always returned it, and a Realtime
   *  INSERT payload carries the whole row). Optional because a locally-authored row — a
   *  rehearsal's own commands — has no server time, and older callers never read it. */
  created_at?: string;
  msg:
    | ControlMessage
    | CueStatusMsg
    | { t: 'staged'; data: Record<string, string> }
    | { t: 'live'; data?: Record<string, string>; state?: { groups?: Record<string, string> } | null };
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
  if (o.v !== 1 || !Array.isArray(o.graphics)) return null;
  return {
    v: 1,
    resolution: o.resolution ?? DEFAULT_GRAPHICS_RESOLUTION,
    graphics: o.graphics.map((g) => ({ ...g, assets: Array.isArray(g.assets) ? g.assets : [] })),
    cues: Array.isArray(o.cues) ? o.cues : [],
  };
}

/** Serialize one template's assets for the JSON payload (Blob bytes become data URLs). */
async function serializeAssets(template: SpxTemplate): Promise<{ path: string; data: string }[]> {
  return Promise.all(
    template.assets.map(async (a) => ({
      path: a.path,
      data: typeof a.data === 'string' ? a.data : await fileToDataUrl(a.data as File),
    })),
  );
}

/** The PINNED renderable payload written at publish (docs/CLOUD_PLAYOUT.md §2): the pool
 *  graphics' live library templates snapshotted, plus the cue rundown re-keyed by the wire
 *  graphic name. Async because Blob assets serialize to data URLs. */
export async function buildOutputPayload(show: Show, library: GraphicDoc[] = loadGraphics()): Promise<OutputPayload> {
  const byId = new Map(show.graphics.map((g) => [g.id, g] as const));
  const graphics: OutputGraphicSpec[] = await Promise.all(
    show.graphics.map(async (g) => {
      const template = templateForSavedGraphic(g, library);
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
    }),
  );
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
    .map((c) => ({
      id: c.id,
      graphic: byId.get(c.sourceId)!.name,
      label: c.label,
      values: c.values,
      ...(c.note ? { note: c.note } : {}),
    }));
  return { v: 1, resolution, graphics, cues };
}

/** Every capability a publish hands back. The audience pair is nullable on purpose: a server
 *  without migration 0035 simply has no such columns, which must degrade to "no join link"
 *  rather than to a failed publish. */
export interface PublishedCapabilities {
  slug: string;
  outputSlug: string | null;
  joinSlug: string | null;
  presenterSlug: string | null;
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
  const output = await buildOutputPayload(show, library);
  // The upsert names only the columns it owns, which is what keeps `audience_state` (0035) —
  // open/mode/prompt/round/rev, all of it live operator state — from being reset by a
  // re-publish mid-show. A whole-row write here would close the audience door every time
  // somebody fixed a typo in a cue.
  const { error } = await sb.from('control_shows').upsert(
    {
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
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);
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
    return { ...row, joinSlug: null, presenterSlug: null };
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
  };
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
  if (!sb) return 'This build runs offline — publish the production first.';
  const { error } = await sb.from('control_shows').update({ join_slug: wanted }).eq('id', showId);
  if (!error) return null;
  // 23505 unique_violation / 23514 check_violation are the two the constraints raise. The
  // check covers BOTH the shape and the reserved list, and the database does not say which -
  // so the message names both rather than guessing at one.
  if (error.code === '23505') return `“${wanted}” is already taken — try another.`;
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

export async function controlShowBySlug(slug: string): Promise<ResolvedControlShow | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('control_show_by_slug', { p_slug: slug });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
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
    const answer = await attempt();
    if (answer.ok) return answer;
    if (limit > 0 && tries + 1 >= limit) return answer;
    opts.onRetry?.(tries + 1, answer.error);
    await wait(Math.min(max, first * 2 ** tries));
  }
}

/** Resolve the RENDERER's view by the output capability — payload + live snapshot only.
 *  A null VALUE means the capability is gone (unpublished or rotated); a failure means the
 *  question was never answered, and the caller must ask again rather than conclude. */
export async function controlOutputBySlug(outputSlug: string): Promise<RpcAnswer<ResolvedOutputShow | null>> {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: 'no backend client' };
  const { data, error } = await sb.rpc('control_output_by_slug', { p_output_slug: outputSlug });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: true, value: null };
  return {
    ok: true,
    value: {
      id: row.id as string,
      title: row.title as string,
      output: readOutputPayload(row.output),
      live: (row.live ?? {}) as LiveReportMap,
      lastEventId: Number(row.last_event_id ?? 0),
    },
  };
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
 * and substituting the sending laptop's clock would put its skew on air. So events keep the road
 * they have always had.
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
 * for; docs/backlog/playout-lag-when-working-the-queue.md carries it as a known limit.
 */
const SLOW_AFTER_EVENT_MS = 1200;
/** Keyed by SHOW and graphic: a graphic key is a per-production layer name and collides freely
 *  across productions, so a bare name would hold back a different show's layer of the same name. */
const slowUntil = new Map<string, number>();
const slowKey = (showId: string | null, graphic: string) => `${showId ?? '-'}:${graphic}`;

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
}): Promise<void> {
  const now = Date.now();
  const { showId } = opts;
  // A follower that is catching up takes NOTHING fast, its own presses included (see `recovering`
  // above): the walk is fetching rows older than this press and a frame applied now would land
  // ahead of them.
  const fastRoad = !!showId && !recovering.has(showId);
  const wire: WireItem[] = [];
  const fast: ControlSendItem[] = [];
  const held: string[] = [];
  for (const item of opts.items) {
    const stamped: ControlSendItem = { graphic: item.graphic, msg: withOid(item.msg) };
    const key = slowKey(showId, item.graphic);
    // Left to right, so an event EARLIER IN THE SAME BATCH already holds its graphic back — a
    // snap-then-update pair must not have its second half overtake its first.
    if (item.msg.t === 'event') {
      held.push(key);
      slowUntil.set(key, now + SLOW_AFTER_EVENT_MS);
      wire.push(stamped);
      continue;
    }
    const rides = fastRoad && (slowUntil.get(key) ?? 0) <= now;
    if (rides) fast.push(stamped);
    wire.push(rides ? { ...stamped, fast: true } : stamped);
  }
  // THIS PAGE'S OWN MONITOR, before the round trip. It is applying commands it has not sent yet,
  // which is safe for the same reason the two roads are: the minted id means the echo it gets
  // back - broadcast or durable row, whichever arrives - is recognised and dropped.
  if (fast.length > 0) opts.applyHere?.(fast);
  try {
    await sendHostedControlBatch(opts.slug, wire);
  } catch (e) {
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
    const landed = Date.now() + SLOW_AFTER_EVENT_MS;
    for (const key of held) slowUntil.set(key, landed);
  }
}

/** Did this send put commands on THIS surface's screen before failing? Read off the thrown
 *  error. */
export function verbAired(e: unknown): boolean {
  return (e as { aired?: unknown } | null)?.aired === true;
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
export async function sendHostedControlBatch(slug: string, items: WireItem[]): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  const { error } = await sb.rpc('control_send_many', { p_slug: slug, p_items: items });
  if (error) throw new Error(error.message);
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
export function takeCueItems(cue: { id: string; graphic: string; values: Record<string, string> }): ControlSendItem[] {
  return [
    { graphic: cue.graphic, msg: { t: 'update', data: cue.values } },
    { graphic: cue.graphic, msg: { t: 'play' } },
    { graphic: cue.graphic, msg: { t: 'cue', cue: cue.id } },
  ];
}

/** Out ONE layer: play that graphic off and clear its cue status. */
export function clearCueItems(liveGraphic: string): ControlSendItem[] {
  return [
    { graphic: liveGraphic, msg: { t: 'stop' } },
    { graphic: liveGraphic, msg: { t: 'cue', cue: null } },
  ];
}

/** `control_send_many` takes at most 8 items — a verb, not an ingest API — so an all-layers
 *  clear pays two items per layer and goes out in batches of four layers. */
const LAYERS_PER_CLEAR_BATCH = 4;

/**
 * Out EVERY live layer: the "clear the screen" verb a multi-layer production needs, since no
 * single Take does it any more. One batch per four layers, so a production bigger than that
 * clears in log order rather than not at all.
 */
export function clearAllCueBatches(liveGraphics: string[]): ControlSendItem[][] {
  const batches: ControlSendItem[][] = [];
  for (let i = 0; i < liveGraphics.length; i += LAYERS_PER_CLEAR_BATCH) {
    batches.push(liveGraphics.slice(i, i + LAYERS_PER_CLEAR_BATCH).flatMap(clearCueItems));
  }
  return batches;
}

/**
 * Follow the command log with the FULL recovery discipline, owned once (docs/CLOUD_PLAYOUT.md
 * §3; previously hand-rolled per surface, which is how the same hole-handling bug shipped
 * three times): dedupe by row id; on an id hole recover from the tail INSTEAD of applying the
 * holed row (applying it would advance the cursor past the gap and the tail's older rows
 * would then be dropped as duplicates — a failed tail retries on the next row); tail-fill on
 * every (re)subscribe, because rows inserted while the socket was down produce no replay.
 * `tail` is injected — the control and output capabilities read the log through different RPCs.
 */
/** The tail RPCs' page size (0008/0029: `limit 500`) — a full page means "there is more". */
export const CONTROL_TAIL_PAGE = 500;
/** Runaway guard on the catch-up walk: 20k rows is far past any real outage after pruning. */
const MAX_TAIL_PAGES = 40;

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
}): Promise<() => void> {
  let lastId = opts.from;
  const apply = (row: ControlEventRow) => {
    if (row.id <= lastId) return;
    lastId = row.id;
    opts.onRow(row);
  };
  // The tail RPC answers at most CONTROL_TAIL_PAGE rows, so ONE call only ever recovers that much of
  // the gap. A renderer booting after an outage can be much further behind than a reconnecting
  // socket ever is, so keep pulling while pages come back full. Every page advances `lastId`
  // (the RPC returns rows AFTER it), so the walk always terminates; the page ceiling is a
  // runaway guard, not a design limit.
  // WHILE A WALK IS IN FLIGHT THE FAST ROAD STANDS DOWN (see `recovering` above): the walk is
  // fetching rows OLDER than anything a broadcast can carry, and a broadcast has no id to be
  // ordered against them. Counted rather than a boolean, because the 30 s poll and a hole
  // recovery can overlap.
  let walks = 0;
  const refill = () =>
    void (async () => {
      walks += 1;
      recovering.add(opts.showId);
      try {
        for (let page = 0; page < MAX_TAIL_PAGES; page += 1) {
          const rows = await opts.tail(lastId);
          rows.forEach(apply);
          if (rows.length < CONTROL_TAIL_PAGE) return;
        }
      } finally {
        walks = Math.max(0, walks - 1);
        if (walks === 0) recovering.delete(opts.showId);
      }
    })();
  const { onCommand } = opts;
  let everJoined = false;
  let status = '';
  const report = () => opts.onStatus?.({ status, everJoined });
  // The floor. It runs whatever the socket is doing: a poll that returns nothing costs one empty
  // RPC, and deciding when it is "needed" would mean trusting exactly the signal that is broken.
  const poll = setInterval(() => {
    report();
    refill();
  }, CONTROL_POLL_MS);
  const unsubscribe = await subscribeControlEvents(opts.showId, (row) => {
    if (row.id > lastId + 1) {
      refill();
      return;
    }
    apply(row);
  }, (next) => {
    status = next;
    if (next === 'SUBSCRIBED') {
      everJoined = true;
      refill();
    }
    report();
  }, onCommand && ((items) => {
    if (walks === 0) onCommand(items);
  }), opts.onCommandStatus);
  return () => {
    clearInterval(poll);
    walks = 0;
    recovering.delete(opts.showId);
    unsubscribe();
  };
}

/** Stage PREPARED data — shared with every operator page on this slug. */
export async function stageHostedData(slug: string, graphic: string, data: Record<string, string>): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.rpc('control_stage', { p_slug: slug, p_graphic: graphic, p_data: data });
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
 * Live log rows for one show (the show-chat pattern: Realtime nudges, the durable table is
 * the truth). Returns an unsubscribe. Rows arrive in id order per the DB; the caller keeps
 * its own last-seen id and uses hostedControlTail after a gap.
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
  const channel = sb
    .channel(`control-${showId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'control_events', filter: `show_id=eq.${showId}` },
      (payload) => onRow(payload.new as ControlEventRow),
    )
    // EVERY status, not only SUBSCRIBED. SUBSCRIBED fires on every (re)join, not only the first
    // — that is where a consumer tail-fills the gap a dropped socket left (rows inserted while
    // away produce no postgres_changes replay, so without it a sleeping tab misses commands
    // until the NEXT row happens to arrive with a visible id hole). The OTHER statuses
    // (CHANNEL_ERROR, TIMED_OUT, CLOSED) were swallowed here, which is what made a channel that
    // never joins indistinguishable from a quiet show: the consumer decides what to do with
    // them, and `followControlLog` both polls under them and says so.
    .subscribe((status) => onStatus?.(status));

  // ── THE FAST ROAD, on its own PRIVATE channel (src/control/commandRoads.ts). ────────────────
  //
  // Same socket, second join. It carries only broadcasts, and only the database writes to it, so
  // a frame arriving here has already passed `control_send_many`'s checks and the control slug's
  // authority - which is the difference between this and the public channel above, where anyone
  // holding the show id could push a command until 2026-09-10.
  //
  // ITS STATUS IS REPORTED SEPARATELY from the log's, and never through `onStatus`. That signal
  // drives "not joined — polling" and the tail-fill on rejoin, and both belong to the LOG: this
  // channel joining or failing changes only how FAST a command arrives, never whether it does, so
  // a refused private join must read as yesterday's speed rather than as a broken production.
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
    void sb.removeChannel(channel);
    if (commands) void sb.removeChannel(commands);
  };
}
