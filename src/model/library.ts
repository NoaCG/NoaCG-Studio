// The GRAPHICS LIBRARY (docs/SAVED_CONTENT_MODEL.md): every durably saved graphic is ONE
// GraphicDoc record with a STABLE id — renaming never breaks references. The library is FLAT
// (packages retired - docs/GOALS_ARCHIVE.md "Student release" step 3): grouping for air is a
// PRODUCTION's pool (model/shows.ts), which copies with a `graphicId` back-link.
// Control-panel ENTRIES (named data rows an operator switches between) live ON the graphic,
// so they save, reopen, and sync with it.
//
// Storage follows the packet conventions exactly: one durable list, `updatedAt` LWW,
// soft-delete tombstones, sync kind 'graphic' (supabase migration 0009). The list lives in the
// DURABLE STORE (model/durableStore.ts - IndexedDB behind a synchronous mirror), not in
// localStorage: a library record carries data-URL assets and the Reset baseline, so ten
// image-carrying graphics used to exhaust the ~5 MB origin quota and block every save.

import type { SpxTemplate } from './types';
import type { GenerationSpec } from './generationSpec';
import type { AiThread } from './aiThread';
import type { ProjectLegibility } from './designRules';
import { loadAllPackets, upsertPacket, type Packet, type SavedGraphic } from './packets';
import { durable } from './durableStore';
import { uuid } from './id';
import { newGraphicDoc, type GraphicDocBase } from './graphicDoc';

// The record SHAPE and its pure builder live in model/graphicDoc.ts (DOM-free, storage-free,
// so the /bridge page and the save API mint the identical record); this module binds the AI
// provenance generics to the real types and owns the STORE around it.
export type { ControlEntry } from './graphicDoc';

/** The persisted library record, version 1 (`model/graphicDoc.ts` holds the field-by-field
 *  contract; every additive field there rides the sync record unchanged - rule 6). */
export type GraphicDoc = GraphicDocBase<GenerationSpec, AiThread, ProjectLegibility>;
import type { ControlEntry } from './graphicDoc';

const GRAPHICS_KEY = 'spx-gfx-graphics';

const nowIso = () => new Date().toISOString();

function notifyDataChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('spx-data-changed'));
  }
}

function saveAll(list: GraphicDoc[]): string | null {
  try {
    durable.setItem(GRAPHICS_KEY, JSON.stringify(list));
    notifyDataChanged();
    return null;
  } catch {
    return 'Browser storage is full — delete an old graphic (large fonts/images count) or export and remove one.';
  }
}

/** Normalize a stored record to the current shape (additive fields defaulted, never a crash). */
function normalize(doc: GraphicDoc): GraphicDoc {
  return {
    ...doc,
    version: 1,
    packageId: doc.packageId ?? null,
    entries: Array.isArray(doc.entries) ? doc.entries : [],
    activeEntryId: doc.activeEntryId ?? null,
    createdAt: doc.createdAt ?? doc.updatedAt ?? '1970-01-01T00:00:00.000Z',
    updatedAt: doc.updatedAt ?? '1970-01-01T00:00:00.000Z',
  };
}

/** All graphics INCLUDING tombstones — for the sync engine. Runs the packet migration first. */
export function loadAllGraphics(): GraphicDoc[] {
  migrateEmbeddedGraphics();
  try {
    const list = JSON.parse(durable.getItem(GRAPHICS_KEY) ?? '[]') as GraphicDoc[];
    return list.map(normalize);
  } catch {
    return [];
  }
}

/** Live graphics for the UI (tombstones hidden). */
export function loadGraphics(): GraphicDoc[] {
  return loadAllGraphics().filter((g) => !g.deleted);
}

export function graphicById(id: string): GraphicDoc | null {
  return loadGraphics().find((g) => g.id === id) ?? null;
}

/** As much of a live record as the name question needs: who holds a name, and what a save
 *  written over that record would stop carrying. Cheap enough to re-read on every library
 *  change, which is what keeps the wizard's answer live (`librarySaveEffect`). */
export interface LibraryNameEntry {
  id: string;
  name: string;
  updatedAt: string;
  /** Its operator fields, so a replacement can NAME the cue values it strands. */
  fields: { field: string; title: string }[];
}

/** Every live graphic, reduced to that. In library order - the same derive-from-the-data shape
 *  as `graphicFolders` below. */
export function graphicNameIndex(): LibraryNameEntry[] {
  return loadGraphics().map((g) => ({
    id: g.id,
    name: g.name,
    updatedAt: g.updatedAt,
    // `?? []` because a STORED template is whatever an older client or a migrated v1 packet
    // wrote, and `normalize` above defaults the record's own fields but never the template's.
    // Every wizard save reads this index, so one malformed record would otherwise throw inside
    // a door's promise and leave the reader with nothing saved and nothing said.
    fields: (g.template.fields ?? []).map((f) => ({ field: f.field, title: f.title || f.field })),
  }));
}

/**
 * WHAT A NAME ALREADY MEANS, over any list that carries a name and a timestamp.
 *
 * NEWEST WINS where a library already holds twins: that is the record the pool's back-link
 * points at after a re-import, so later saves converge on one record instead of writing to
 * whichever happened to be stored first. It is a tie-break, not a discriminator - if a
 * production pooled the OLDER twin, this picks the newer one and that production keeps airing
 * the old artwork. The tie-break is only ever consulted when twins ALREADY EXIST:
 * docs/backlog/two-doors-still-mint-a-twin-under-a-taken-name.md names the doors that make them.
 */
function holderIn<T extends { name: string; updatedAt: string }>(list: T[], name: string): T | undefined {
  const wanted = name.trim();
  if (!wanted) return undefined;
  return list.filter((g) => g.name === wanted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/**
 * The live record a save under `name` writes OVER, or undefined when the name is free.
 *
 * A saved graphic's name is its identity — the production pool has always worked that way
 * (`addGraphicToShow` replaces by name so the cues prepared against the entry survive), and
 * the library did not: every wizard save minted a fresh id, so re-importing your own artwork
 * under the name you already use left TWO indistinguishable rows on Home, silently detached
 * the first from the production that pooled it, and made the name ambiguous for
 * `resolveSavedGraphicDoc` below. Measured 2026-09-08 (e2e/import-name-collision.spec.ts);
 * this lookup is what makes the two halves agree.
 */
export function graphicHoldingName(name: string): GraphicDoc | undefined {
  return holderIn(loadGraphics(), name);
}

/**
 * WHAT PRESSING A FINISH DOOR DOES TO THE LIBRARY, under the name now in the field.
 *
 * ONE answer, for both the save and the sentence the reader gets before pressing. The two used
 * to be separate lookups over separate snapshots, and a disclosure that can disagree with the
 * write is worse than none: it is a promise.
 *
 * THE WALK'S OWN RECORD DECIDES WHENEVER IT EXISTS. A name lookup cannot tell "this is my
 * graphic, renamed" from "this name is somebody else's graphic", so before 2026-09-09 a rename
 * mid-walk resolved to the stranger and wrote today's artwork into a graphic the walk had never
 * opened - destroying it, with no undo and no history (reproduced in
 * e2e/import-name-collision.spec.ts). Renaming the walk's own record instead can leave two
 * graphics sharing a name, which Home's own rename has always allowed and which one rename
 * puts right; the destruction had nothing that put it right. Only a walk that owns NOTHING
 * resolves its name against the library, which is exactly the case that rule was written for.
 */
export type LibrarySaveEffect =
  /** Nothing holds this name and this walk holds nothing: a new record. */
  | { kind: 'mint'; targetId: null }
  /**
   * The record this walk already made, kept under whatever the field now says.
   * `renamedFrom` is the name it is moving off, and `sharesWith` a DIFFERENT graphic already
   * carrying the new one - the two together are the rename that walks into a taken name, and
   * `sharesWith` alone is the state that press left behind.
   */
  | {
      kind: 'update';
      targetId: string;
      renamedFrom: string | null;
      sharesWith: LibraryNameEntry | null;
    }
  /** No record of this walk's own, so the name is the identity and it is written over. */
  | { kind: 'over'; targetId: string; holder: LibraryNameEntry };

export function librarySaveEffect(
  index: LibraryNameEntry[],
  name: string,
  /** The record this stretch of wizard has already made. Its name comes from the INDEX, not
   *  from the caller: the walk remembers the name it saved under, and the record is what it is
   *  now (another tab may have renamed it). */
  madeId: string | null,
): LibrarySaveEffect {
  const wanted = name.trim();
  const mine = madeId ? index.find((g) => g.id === madeId) : undefined;
  if (mine) {
    return {
      kind: 'update',
      targetId: mine.id,
      renamedFrom: mine.name === wanted ? null : mine.name,
      sharesWith: holderIn(index.filter((g) => g.id !== mine.id), wanted) ?? null,
    };
  }
  const holder = holderIn(index, wanted);
  return holder ? { kind: 'over', targetId: holder.id, holder } : { kind: 'mint', targetId: null };
}

/** Insert or replace a whole graphic by id (the storage seam's put('graphic'), incl. tombstones). */
export function upsertGraphic(doc: GraphicDoc): void {
  const all = rawGraphics();
  const i = all.findIndex((g) => g.id === doc.id);
  if (i >= 0) all[i] = doc;
  else all.push(doc);
  saveAll(all);
}

/** Create a new library record from the working template. Returns the doc (or an error). */
export function createGraphic(
  template: SpxTemplate,
  opts: {
    name: string;
    packageId?: string | null;
    baseline?: SpxTemplate;
    entries?: ControlEntry[];
    activeEntryId?: string | null;
    aiSpec?: GenerationSpec | null;
    aiThread?: AiThread | null;
    legibility?: ProjectLegibility | null;
  },
): { doc: GraphicDoc; error: string | null } {
  // ONE shape, minted by the pure builder every other writer uses (the bridge, the save API).
  const doc: GraphicDoc = newGraphicDoc<GenerationSpec, AiThread, ProjectLegibility>(template, {
    ...opts,
    id: uuid(),
    now: nowIso(),
  });
  const all = rawGraphics();
  all.push(doc);
  return { doc, error: saveAll(all) };
}

/** Update fields of an existing graphic (the Save path, rename, move, entries…). */
export function updateGraphic(
  id: string,
  patch: Partial<Pick<GraphicDoc, 'name' | 'packageId' | 'template' | 'baseline' | 'entries' | 'activeEntryId' | 'aiSpec' | 'aiThread' | 'folder' | 'legibility'>>,
): { doc: GraphicDoc | null; error: string | null } {
  const all = rawGraphics();
  const doc = all.find((g) => g.id === id && !g.deleted);
  if (!doc) return { doc: null, error: 'That graphic no longer exists.' };
  Object.assign(doc, patch);
  if (patch.name) doc.template = { ...doc.template, name: patch.name };
  doc.type = doc.template.type;
  doc.updatedAt = nowIso();
  return { doc, error: saveAll(all) };
}

/** Duplicate a graphic (same package), returning the fresh copy. */
export function duplicateGraphic(id: string): { doc: GraphicDoc | null; error: string | null } {
  const src = graphicById(id);
  if (!src) return { doc: null, error: 'That graphic no longer exists.' };
  const name = `${src.name} copy`;
  return createGraphic({ ...src.template, name }, {
    name,
    packageId: src.packageId,
    baseline: src.baseline,
    entries: src.entries.map((e) => ({ ...e, id: uuid() })),
    activeEntryId: null,
  });
}

/** Delete = tombstone (strip payload, keep the id + fresh timestamp) so the delete syncs. */
export function deleteGraphic(id: string): void {
  deleteGraphics([id]);
}

/** Bulk delete (Home's multi-select): every tombstone in ONE storage write + one change
 *  event, instead of N of each — each record still gets its own fresh updatedAt for LWW. */
export function deleteGraphics(ids: string[]): void {
  const wanted = new Set(ids);
  const all = rawGraphics();
  for (const doc of all) {
    if (!wanted.has(doc.id)) continue;
    doc.deleted = true;
    doc.template = { ...doc.template, html: '', css: '', js: '', assets: [], fields: [], layers: [] };
    doc.baseline = undefined;
    doc.entries = [];
    doc.updatedAt = nowIso();
  }
  saveAll(all);
}

/** Bulk move into (or out of: undefined) a flat folder — one storage write, LWW per record. */
export function setGraphicsFolder(ids: string[], folder: string | undefined): string | null {
  const wanted = new Set(ids);
  const name = folder?.trim() || undefined;
  const all = rawGraphics();
  for (const doc of all) {
    if (!wanted.has(doc.id) || doc.deleted) continue;
    doc.folder = name;
    doc.updatedAt = nowIso();
  }
  return saveAll(all);
}

/** The distinct folder names in use, sorted — the Home chips derive from the data, so an
 *  emptied folder disappears by itself (folders have no record of their own to orphan). */
export function graphicFolders(): string[] {
  const names = new Set<string>();
  for (const g of loadGraphics()) if (g.folder) names.add(g.folder);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Drop local tombstones older than the cutoff (the sync controller's coordinated purge). */
export function purgeOldGraphicTombstones(beforeIso: string): void {
  const all = rawGraphics();
  const kept = all.filter((g) => !g.deleted || g.updatedAt >= beforeIso);
  if (kept.length !== all.length) saveAll(kept);
}

/** The raw stored list without triggering the migration (internal, and for the migration itself). */
function rawGraphics(): GraphicDoc[] {
  try {
    const list = JSON.parse(durable.getItem(GRAPHICS_KEY) ?? '[]') as GraphicDoc[];
    return list.map(normalize);
  } catch {
    return [];
  }
}

// ── The packet migration (v1 embedded graphics → library records) ────────────────────────────
//
// Pre-library packets EMBED their graphics (Packet.graphics: SavedGraphic[]). On read, any
// embedded graphic found — in a v1 packet, or written into a v2 one by an older build — is
// extracted into the library under the EMBEDDED RECORD'S OWN id (already a real uuid), so two
// devices migrating the same packet converge on the same library rows instead of minting
// duplicates. The packet is then rewritten with graphics: [] + version: 2. Convergent:
// re-running finds nothing embedded and does nothing. An older build reading a v2 packet sees
// an empty-but-valid packet (its own writes re-embed, which the next migration extracts), and
// never touches the library key, so no data is ever eaten.

export function migrateEmbeddedGraphics(): void {
  let packets: Packet[];
  try {
    packets = loadAllPackets();
  } catch {
    return;
  }
  const pending = packets.filter((p) => !p.deleted && Array.isArray(p.graphics) && p.graphics.length > 0);
  if (pending.length === 0) return;

  const all = rawGraphics();
  for (const packet of pending) {
    for (const g of packet.graphics) {
      if (!g?.template || !g.id) continue;
      const existing = all.find((doc) => doc.id === g.id);
      if (existing) {
        // Already migrated on another device — keep whichever copy is newer (LWW).
        if (!existing.deleted && g.savedAt > existing.updatedAt) {
          existing.template = g.template;
          existing.name = g.name;
          existing.type = g.type;
          existing.packageId = packet.id;
          existing.updatedAt = g.savedAt;
        }
        continue;
      }
      all.push({
        version: 1,
        id: g.id,
        name: g.name,
        type: g.type,
        packageId: packet.id,
        template: g.template,
        entries: [],
        activeEntryId: null,
        createdAt: g.savedAt,
        updatedAt: g.savedAt,
      });
    }
    upsertPacket({ ...packet, graphics: [], version: 2, updatedAt: nowIso() });
  }
  saveAll(all);
}


// ── Entry helpers (pure, over one doc's entries list) ────────────────────────────────────────

export function newEntry(label: string, values: Record<string, string>): ControlEntry {
  return { id: uuid(), label, values: { ...values }, updatedAt: nowIso() };
}

/**
 * A show/packet graphic's saved ENTRIES, resolved out of the library — the seam that lets a
 * SavedGraphic copy (shows.ts / packets.ts) carry its live entries without embedding them
 * (they stay authored in ONE place, the GraphicDoc, re-read wherever the graphic is used).
 * A graphic added since the library landed records `graphicId`, the exact record. An older
 * embedded copy carries none: fall back to a UNIQUE name match (a saved graphic's name IS its
 * identity — adding the same name updates it in place), and resolve NO entries when the name is
 * ambiguous rather than guessing which graphic the operator meant. The hosted control page
 * (control/hostedControl.ts) and the show export (export/showExport.ts) share this one lookup.
 */
export function resolveSavedGraphicDoc(graphic: SavedGraphic, library: GraphicDoc[]): GraphicDoc | undefined {
  if (graphic.graphicId) return library.find((d) => d.id === graphic.graphicId);
  const byName = library.filter((d) => d.name === graphic.name);
  return byName.length === 1 ? byName[0] : undefined;
}

export function entriesForSavedGraphic(graphic: SavedGraphic, library: GraphicDoc[]): ControlEntry[] {
  const doc = resolveSavedGraphicDoc(graphic, library);
  return (doc?.entries ?? []).map((e) => ({ ...e, values: { ...e.values } }));
}

/**
 * A show/packet graphic's live TEMPLATE. A SavedGraphic embeds a snapshot of the template from
 * when it was added, but the graphic keeps being EDITED in the library afterwards - so a
 * published or exported show that shipped the snapshot would air a stale design. Resolve the
 * current template out of the library (the same record entriesForSavedGraphic uses); the
 * embedded copy is the fallback ONLY when the record is gone (deleted, another profile) or was
 * never a library graphic (added from an unsaved working document). One authored source, re-read
 * wherever the graphic runs - the entries seam, now for the template too.
 */
export function templateForSavedGraphic(graphic: SavedGraphic, library: GraphicDoc[]): SpxTemplate {
  return resolveSavedGraphicDoc(graphic, library)?.template ?? graphic.template;
}
