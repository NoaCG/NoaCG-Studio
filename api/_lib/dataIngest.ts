// The Production Data API's logic: validate an ingest request, resolve which graphic it
// addresses, and map field LABELS to the graphic's own fN ids (docs/DATA_API.md).
//
// Everything here is pure and unit-tested; the Supabase glue lives at the bottom behind the
// same lazy-client pattern as funnelEvents.ts. The routed handler (api/data/[...path].ts)
// stays a thin pipe: guard, gate, parse, resolve, map, send.
//
// LABELS ARE THE CONTRACT. An integrator addresses "Score A", never f1 - the same binding the
// dataset workspace uses (datasetValuesForFields in src/model/shows.ts: column labels match
// field TITLES, trimmed and case-insensitive). That module is a client bundle with storage
// side effects, so the two-line normalization is restated here rather than imported; if the
// dataset binding ever changes its normalization, change this one with it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseSecretKey } from './jobStore.js';

/** trim + case-fold — the dataset binding's normalization, verbatim. */
export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

// ── The published panel spec, as far as this API reads it ────────────────────────────────────
// control_shows.panel is [{ name, fields: SpxField[], ... }] per pool graphic
// (buildPanelSpec in src/control/hostedControl.ts). Only these three keys matter here.

export interface PanelFieldLike {
  field: string;
  ftype?: string;
  title?: string;
}

export interface PanelGraphicLike {
  name: string;
  fields?: PanelFieldLike[];
}

export interface CueLike {
  graphic?: string;
  label?: string;
}

/** The ftypes that carry a data value an update row may write - the same set the control
 *  panel generator accepts (kindForField in src/control/controlModel.ts), hidden included:
 *  an input-only value (a countdown duration, a match clock) is exactly what a data feed
 *  legitimately drives. */
const DATA_FTYPES = new Set([
  'textfield',
  'textarea',
  'number',
  'filelist',
  'dropdown',
  'checkbox',
  'color',
  'hidden',
]);

// ── Request parsing ──────────────────────────────────────────────────────────────────────────

export interface DataUpdateRequest {
  graphic?: string;
  cue?: string;
  /** Field values by LABEL. Scalars only; everything is written as a string. */
  values: Record<string, string>;
}

export type ParseResult = { ok: true; req: DataUpdateRequest } | { ok: false; error: string };

/** Validate the POST body. Values must be a non-empty object of scalars - a nested object is
 *  an integrator bug worth naming, not something to stringify into a field. */
export function parseDataUpdate(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'The body must be a JSON object.' };
  }
  const b = body as { graphic?: unknown; cue?: unknown; values?: unknown };
  if (b.graphic !== undefined && (typeof b.graphic !== 'string' || b.graphic.trim() === '')) {
    return { ok: false, error: '`graphic` must be a non-empty string when given.' };
  }
  if (b.cue !== undefined && (typeof b.cue !== 'string' || b.cue.trim() === '')) {
    return { ok: false, error: '`cue` must be a non-empty string when given.' };
  }
  if (b.graphic !== undefined && b.cue !== undefined) {
    return { ok: false, error: 'Give `graphic` or `cue`, not both.' };
  }
  if (!b.values || typeof b.values !== 'object' || Array.isArray(b.values)) {
    return { ok: false, error: '`values` must be an object of field values by label.' };
  }
  const values: Record<string, string> = {};
  for (const [label, v] of Object.entries(b.values as Record<string, unknown>)) {
    if (typeof v === 'string') values[label] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') values[label] = String(v);
    else return { ok: false, error: `The value for "${label}" must be a string, number or boolean.` };
  }
  if (Object.keys(values).length === 0) {
    return { ok: false, error: '`values` is empty - nothing to update.' };
  }
  return {
    ok: true,
    req: {
      graphic: typeof b.graphic === 'string' ? b.graphic : undefined,
      cue: typeof b.cue === 'string' ? b.cue : undefined,
      values,
    },
  };
}

// ── Target resolution ────────────────────────────────────────────────────────────────────────

export type TargetResult =
  | { ok: true; graphic: PanelGraphicLike }
  | { ok: false; error: string };

/** Resolve which pool graphic the request addresses. By graphic name, by cue label (a cue is
 *  addressing, not data - it names the graphic it drives), or - the single-graphic production,
 *  the scorebug case - by there being nothing to choose. Names and labels match normalized. */
export function resolveTargetGraphic(
  panel: PanelGraphicLike[],
  cues: CueLike[],
  req: Pick<DataUpdateRequest, 'graphic' | 'cue'>,
): TargetResult {
  const names = panel.map((g) => g.name);
  if (req.graphic !== undefined) {
    const wanted = normalizeLabel(req.graphic);
    const hit = panel.filter((g) => normalizeLabel(g.name) === wanted);
    if (hit.length === 1) return { ok: true, graphic: hit[0] };
    return {
      ok: false,
      error:
        hit.length === 0
          ? `No graphic named "${req.graphic}" in this production. Graphics: ${names.map((n) => `"${n}"`).join(', ')}.`
          : `More than one graphic matches "${req.graphic}".`,
    };
  }
  if (req.cue !== undefined) {
    const wanted = normalizeLabel(req.cue);
    const hits = cues.filter((c) => typeof c.label === 'string' && normalizeLabel(c.label) === wanted);
    const graphics = [...new Set(hits.map((c) => c.graphic))].filter((g): g is string => typeof g === 'string');
    if (graphics.length === 1) {
      const g = panel.find((p) => p.name === graphics[0]);
      if (g) return { ok: true, graphic: g };
      return { ok: false, error: `Cue "${req.cue}" names a graphic that is not in the published panel. Re-publish the production.` };
    }
    return {
      ok: false,
      error:
        graphics.length === 0
          ? `No cue labelled "${req.cue}" in this production.`
          : `Cue "${req.cue}" is ambiguous - cues with that label drive different graphics. Address the graphic instead.`,
    };
  }
  if (panel.length === 1) return { ok: true, graphic: panel[0] };
  return {
    ok: false,
    error:
      panel.length === 0
        ? 'This production has no published graphics. Publish it first.'
        : `This production has several graphics - name one. Graphics: ${names.map((n) => `"${n}"`).join(', ')}.`,
  };
}

// ── Label mapping ────────────────────────────────────────────────────────────────────────────

export interface MappedValues {
  /** fN -> value, ready to ride an `update` row. */
  data: Record<string, string>;
  /** Labels that matched nothing - reported, never silently dropped (a feed sending extra
   *  columns is normal; a feed whose every column is ignored is a broken mapping). */
  ignored: string[];
  /** Labels that match MORE than one field - skipped, because guessing writes the wrong box. */
  ambiguous: string[];
}

/** Map incoming values-by-label onto a graphic's fields. The label of a field is its title,
 *  falling back to its fN id (fieldDescriptors' rule), so `{"f1": "5"}` also works when a
 *  design never titled its fields.
 *
 *  IDS AND TITLES ARE SEPARATE MAPS, ids consulted first. In one map, a field TITLED "F1"
 *  would capture (or poison as ambiguous) the id address of the real f1 depending on panel
 *  order - a silent wrong-field write on air. Two maps keep the documented contract true:
 *  the fN id always addresses its own field, and only non-id labels compete over titles. */
export function mapLabelsToFields(fields: PanelFieldLike[], values: Record<string, string>): MappedValues {
  const byId = new Map<string, PanelFieldLike>();
  const byTitle = new Map<string, PanelFieldLike[]>();
  for (const f of fields) {
    if (!DATA_FTYPES.has(f.ftype ?? '')) continue;
    byId.set(normalizeLabel(f.field), f);
    const title = normalizeLabel(f.title || f.field);
    const list = byTitle.get(title);
    if (list) list.push(f);
    else byTitle.set(title, [f]);
  }
  const data: Record<string, string> = {};
  const ignored: string[] = [];
  const ambiguous: string[] = [];
  for (const [label, value] of Object.entries(values)) {
    const key = normalizeLabel(label);
    const idHit = byId.get(key);
    if (idHit) {
      data[idHit.field] = value;
      continue;
    }
    const hit = byTitle.get(key);
    if (!hit) ignored.push(label);
    else if (hit.length > 1) ambiguous.push(label);
    else data[hit[0].field] = value;
  }
  return { data, ignored, ambiguous };
}

// ── Supabase glue (service role - the key never meets an anon RPC) ───────────────────────────

export function dataApiConfigured(): boolean {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  return Boolean(url && supabaseSecretKey());
}

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (client) return client;
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(url, supabaseSecretKey(), { auth: { persistSession: false } });
  return client;
}

export interface ProductionRow {
  id: string;
  panel: PanelGraphicLike[];
  cues: CueLike[];
}

/** Resolve the production a data key addresses, via control_data_resolve (0047): the RPC
 *  selects the panel and ONLY the cue list out of the pinned output payload - the payload's
 *  graphics carry base64 assets and this route must never read megabytes to write a score.
 *  An RPC rather than a table read ON PURPOSE: PostgREST puts a `.eq()` filter in the GET
 *  query string, which the API gateway logs - the key must travel in a POST body only.
 *  Null = unknown key. */
export async function productionForDataKey(key: string): Promise<ProductionRow | null> {
  const { data, error } = await (await sb()).rpc('control_data_resolve', { p_key: key });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; panel: unknown; cues: unknown }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    panel: Array.isArray(row.panel) ? (row.panel as PanelGraphicLike[]) : [],
    cues: Array.isArray(row.cues) ? (row.cues as CueLike[]) : [],
  };
}

/** Append the update row through control_data_send (0047) - the ingest twin of control_send.
 *  It mirrors the operator RPC's checks (entitlement, the 50-per-5s per-show cap), marks the
 *  row `src: 'api'`, and enforces the INGEST BUDGET in the database: at most 25 of a 5 s
 *  window's rows may be feed rows, so operator headroom holds globally, not per serverless
 *  instance. Ordering against operator commands is the log's own. Returns the event id, or null
 *  when the production has paused Another system and the values were HELD for Resume (0100). */
export async function sendDataUpdate(key: string, graphic: string, data: Record<string, string>): Promise<number | null> {
  const { data: eventId, error } = await (await sb()).rpc('control_data_send', {
    p_key: key,
    p_graphic: graphic,
    p_data: data,
  });
  if (error) throw new Error(error.message);
  return eventId === null || eventId === undefined ? null : Number(eventId);
}

// ── Production DATA: addressed by PATH, never by graphic (0048) ──────────────────────────────
// This is the pair `/api/data/update` should have been. A caller patches `match.home.score`,
// and every field any graphic BOUND to that path follows - so a scoreboard never learns which
// graphic is on air, which is the coupling docs/PRODUCTION_DATA_PLAN.md exists to remove.

/** One graphic the patch actually moved. */
export interface DataPatchWrite {
  graphic: string;
  event: number;
  applied: Record<string, string>;
}

export interface DataPatchResult {
  /** The production's whole tree AFTER the merge - what the caller can reconcile against. */
  data: Record<string, unknown>;
  writes: DataPatchWrite[];
  /** The production has paused Another system: the tree took the patch, nothing aired (0100). */
  paused: boolean;
}

/**
 * Merge a patch into the production's tree through control_data_patch (0048).
 *
 * Everything that makes this safe happens in the DATABASE, in one transaction with the row
 * locked: the RFC 7386 merge, the binding resolution, the diff against the pre-patch tree, the
 * rate gates, and the append. Two feeds racing through separate serverless instances therefore
 * cannot lose an update between a read and a write - which is exactly what a merge computed
 * here, in the function, would allow.
 *
 * A patch that changes no bound value writes NO log rows and still succeeds: re-sending the
 * same score is the normal shape of a polling connector and must not spend the production's
 * budget.
 */
export async function patchProductionData(key: string, patch: Record<string, unknown>): Promise<DataPatchResult> {
  const { data, error } = await (await sb()).rpc('control_data_patch', { p_key: key, p_patch: patch });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as { data?: unknown; writes?: unknown; paused?: unknown };
  return {
    data: (row.data ?? {}) as Record<string, unknown>,
    writes: Array.isArray(row.writes) ? (row.writes as DataPatchWrite[]) : [],
    paused: row.paused === true,
  };
}

/** What NoaCG currently believes this production's state is - the read an integrator makes
 *  after a restart or a partition instead of blindly pushing a whole snapshot. Null = unknown
 *  key. Deliberately returns no capability: the data key never widens into an operator one. */
export async function readProductionData(
  key: string,
): Promise<{ data: Record<string, unknown>; bindings: Record<string, Record<string, string>> } | null> {
  const { data, error } = await (await sb()).rpc('control_data_read', { p_key: key });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as { data?: unknown; bindings?: unknown };
  return {
    data: (row.data ?? {}) as Record<string, unknown>,
    bindings: (row.bindings ?? {}) as Record<string, Record<string, string>>,
  };
}

/** A patch body is any JSON OBJECT - there is no schema, by design. The refusals here are the
 *  two that are never a caller's intent: a non-object, and a top-level array. */
export function parseDataPatch(body: unknown): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'The body must be a JSON object of production data.' };
  }
  const raw = body as Record<string, unknown>;
  // A caller wrapping the tree in `{"data": {...}}` is the most likely mistake, so accept it
  // rather than writing a literal `data` branch nobody bound anything to.
  const patch = raw.data !== undefined && typeof raw.data === 'object' && raw.data !== null && !Array.isArray(raw.data) && Object.keys(raw).length === 1
    ? (raw.data as Record<string, unknown>)
    : raw;
  return { ok: true, patch };
}
