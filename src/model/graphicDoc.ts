// The library record's SHAPE, and the one PURE builder that mints it.
//
// `GraphicDoc` used to be declared beside the store that persists it (library.ts), which was
// fine while only the browser ever created one. Two more writers now need the same record
// without the store: the /bridge page (an external agent's CLI saves what the bridge built) and,
// in the save API, a Vercel function that stamps a document the server never executes. Both
// must agree with `createGraphic` byte for byte on what a fresh record looks like - version,
// nulled AI provenance, empty entries, ISO timestamps - and a second opinion about that shape is
// how a synced library grows records an older build cannot read.
//
// PURE on purpose (the render-purity-trio rule, docs/ARCHITECTURE.md §3): no DOM, no storage,
// no `import.meta`, and the AI-provenance fields are GENERIC so this module never imports the
// browser-only modules that declare them (`model/generationSpec.ts` keeps a localStorage draft).
// `library.ts` binds the generics to the real types and re-exports the result as `GraphicDoc`,
// so every existing importer is untouched; `api/` imports THIS file under tsconfig.api.json's
// DOM-less lib and typechecks.

import type { SpxTemplate, TemplateType } from './types';

/** One named, saved data row for a graphic's control panel ("Anna Andersson — Presenter"). */
export interface ControlEntry {
  id: string;
  /** The operator-facing label. Defaults to the entry's first field value when created. */
  label: string;
  /** Field values by SPX field id (f0, f1, …) — the exact shape update() consumes. */
  values: Record<string, string>;
  updatedAt: string; // ISO
}

/**
 * The persisted library record, version 1. `TSpec`/`TThread`/`TLegibility` are the AI
 * provenance and legibility shapes (`GenerationSpec`, `AiThread`, `ProjectLegibility`) -
 * generic here so this file stays pure; `library.ts` binds them.
 */
export interface GraphicDocBase<TSpec = unknown, TThread = unknown, TLegibility = unknown> {
  /** Format version — bump only on a breaking shape change, migrating in loadAllGraphics. */
  version: 1;
  id: string;
  name: string;
  type: TemplateType;
  /** @deprecated Packages are retired; INERT data, never read by the UI. Kept (not nulled)
   *  because rewriting every record would bump updatedAt across the whole library - a sync
   *  storm whose LWW could stomp a genuinely newer remote edit. New records write null. */
  packageId: string | null;
  template: SpxTemplate;
  /** The pristine create-time template — the editor's Reset target travels with the save. */
  baseline?: SpxTemplate;
  /** The control panel's saved data entries, in list order. */
  entries: ControlEntry[];
  /** Which entry is selected in the control panel (null = the template's own defaults). */
  activeEntryId: string | null;
  createdAt: string; // ISO
  /** Last change (ISO). Bumped on every mutation; drives cloud sync (LWW). */
  updatedAt: string;
  /** Soft-delete tombstone (hidden from the UI, kept so the delete syncs). See Packet.deleted. */
  deleted?: boolean;
  /** The AI generation spec this graphic was created from (the "More control" setup) — kept
   *  with the save so a later refine can start from the same structured decisions. Additive
   *  optional; rides the sync record unchanged. */
  aiSpec?: TSpec | null;
  /** The Create-with-AI conversation this graphic was created from (model/aiThread.ts) — kept
   *  with the save so the graphic carries the reasoning that produced it. Additive optional,
   *  same rails as aiSpec (no version bump: rule 6, additive fields never bump). */
  aiThread?: TThread | null;
  /** The ONE flat folder this graphic is sorted into (Home's library organisation — a light
   *  grouping, deliberately not the retired packages: no export unit, no embedded copies,
   *  just a name). Absent/undefined = unfiled. Additive optional, same rails as aiSpec
   *  (no version bump: rule 6; rides the sync record unchanged). */
  folder?: string;
  /** The project's legibility settings (viewing target + size-floor tri-state,
   *  model/designRules.ts). Additive optional, same rails as aiSpec — the default state
   *  serializes to nothing, so pre-existing records are untouched. */
  legibility?: TLegibility | null;
  /**
   * WHERE the record came from, when it was not made in the studio itself: the external agent
   * CLI / MCP save path writes `{ tool: 'noacg-cli', version }`. PROVENANCE, never proof - an
   * admin usage count and a library badge read it, nothing gates on it. Additive optional
   * (rule 6), absent on every record the app itself creates.
   */
  origin?: { tool: string; version?: string } | null;
  /**
   * The COMMUNITY PACK this graphic was installed from (docs/work-specs/community-packs/spec.md
   * D7): the shelf's pack id (a seed's slug, or `community:<row id>`), its version and the name
   * it was published under. Install writes it; the submit picker leaves a stamped graphic out,
   * and the design lock (AC-5) reads it. Additive optional (rule 6), absent on everything else.
   */
  fromPack?: { id: string; version: number; author: string } | null;
}

/** What `newGraphicDoc` needs beyond the template. Every field optional; the defaults are
 *  exactly what `createGraphic` has always written. */
export interface NewGraphicDocOptions<TSpec = unknown, TThread = unknown, TLegibility = unknown> {
  name: string;
  /** The record id. Omit to mint one; a SERVER minting the record passes its own (a
   *  client-chosen id on a service-role write could overwrite another user's row). */
  id?: string;
  /** The creation instant (ISO). Omit for "now"; a server stamps its own clock so LWW never
   *  reads a client clock. */
  now?: string;
  packageId?: string | null;
  baseline?: SpxTemplate;
  entries?: ControlEntry[];
  activeEntryId?: string | null;
  aiSpec?: TSpec | null;
  aiThread?: TThread | null;
  legibility?: TLegibility | null;
  folder?: string;
  origin?: { tool: string; version?: string } | null;
  fromPack?: { id: string; version: number; author: string } | null;
}

/**
 * Build a fresh library record from a template. Pure: no storage write, no clock of its own
 * unless asked (`now`), no id of its own unless asked (`id`). The ONE shape every writer -
 * `createGraphic`, the bridge, the save API - mints, so none of them can drift.
 */
export function newGraphicDoc<TSpec = unknown, TThread = unknown, TLegibility = unknown>(
  template: SpxTemplate,
  opts: NewGraphicDocOptions<TSpec, TThread, TLegibility>,
): GraphicDocBase<TSpec, TThread, TLegibility> {
  const name = opts.name.trim() || template.name || 'Untitled graphic';
  const now = opts.now ?? new Date().toISOString();
  const doc: GraphicDocBase<TSpec, TThread, TLegibility> = {
    version: 1,
    id: opts.id ?? uuid(),
    name,
    type: template.type,
    packageId: opts.packageId ?? null,
    template: { ...template, name: opts.name.trim() || template.name },
    baseline: opts.baseline,
    entries: opts.entries ?? [],
    activeEntryId: opts.activeEntryId ?? null,
    aiSpec: opts.aiSpec ?? null,
    aiThread: opts.aiThread ?? null,
    ...(opts.legibility ? { legibility: opts.legibility } : {}),
    ...(opts.folder ? { folder: opts.folder } : {}),
    ...(opts.origin ? { origin: opts.origin } : {}),
    ...(opts.fromPack ? { fromPack: opts.fromPack } : {}),
    createdAt: now,
    updatedAt: now,
  };
  return doc;
}

/**
 * Is this JSON the SHAPE of a version-1 record? Shape only: strings are strings, the template
 * carries html/css/js, the timestamps parse. It never parses or evaluates the template code -
 * the server that calls this holds the service key, and `parseDefinition` runs the definition
 * literal through `new Function` (src/model/spxDefinition.ts) - so the CODE is judged only where
 * it runs in a sandbox (the bridge's gate in the user's own browser, the app's own re-gate on
 * open). A record can be SHAPED right and still be a broken graphic; that is the library's
 * ordinary condition (the editor saves broken drafts too) and export/publish gate it later.
 */
export function isGraphicDocShape(value: unknown): value is GraphicDocBase {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.name) || !isNonEmptyString(value.type)) return false;
  if (!isRecord(value.template)) return false;
  const t = value.template;
  if (typeof t.html !== 'string' || typeof t.css !== 'string' || typeof t.js !== 'string') return false;
  if (!Array.isArray(value.entries)) return false;
  if (!isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt)) return false;
  return true;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

// A uuid that is always a valid RFC-4122 v4, in every runtime this file runs in: the browser,
// Node (the save API), and engines with no `crypto.randomUUID` (CasparCG's CEF, a plain-HTTP
// LAN host). The same recipe as model/id.ts, repeated rather than imported so that this pure
// file depends on nothing; id.ts stays the app's canonical generator.
function uuid(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}
