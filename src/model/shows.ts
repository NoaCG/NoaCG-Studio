// The SHOW data layer (Phase 5). A show is the rundown-level unit: an ORDERED set of
// graphics that run together on air (bug + lower third + ticker), each keeping its own
// state machine. Its control page aggregates every graphic's controls — the single-graphic
// case is just a show of one. Shows reuse the packet manager's storage conventions
// (localStorage, updatedAt for LWW sync, soft-delete tombstones) so the cloud sync engine
// can adopt the kind without a second pattern.

import type { SpxTemplate } from './types';
import type { SavedGraphic } from './packets';
import type { ProjectBrand } from './brand';
import type { JsonObject, ProductionBindings } from './productionData';
import { durable } from './durableStore';
import { uuid } from './id';

/**
 * One prepared, orderable data row of a production — "what airs next", not a graphic.
 * Cues are data rows OVER the graphic pool (`Show.graphics`): many cues may point at the
 * same pool graphic (`sourceId`), which is how one lower third airs Anna at cue 2 and Ben
 * at cue 7 without a second copy of the template (docs/CLOUD_PLAYOUT.md §2).
 */
export interface ShowCue {
  id: string;
  /** The pool entry this cue drives (SavedGraphic.id). */
  sourceId: string;
  /** The operator-facing name — "Anna Andersson — Presenter". */
  label: string;
  /** fieldId -> value, the cue's prepared data. A cue OWNS its values (an entry is only a
   *  starting point — editing a cue never writes back to a ControlEntry). */
  values: Record<string, string>;
  /** Operator note shown in the rundown. */
  note?: string;
}

/** One column of a production dataset. `key` is the stable id values are stored under;
 *  `label` is what the operator reads AND what field binding matches against (a column named
 *  like a field's title loads into that field — visible, deterministic, no mapping UI). */
export interface DatasetColumn {
  key: string;
  label: string;
}

/** One row of a production dataset — column key -> value, all strings (the same currency as
 *  cue values and SPX fields, so a row loads into a cue with no conversion layer). */
export interface DatasetRow {
  id: string;
  values: Record<string, string>;
}

/**
 * A production-owned DATA TABLE (docs/INTERACTIVE_PLAYOUT_PLAN.md, D3): a quiz's question
 * bank, a match's teams, a roster — the show's working data, editable in the Data workspace
 * and loaded into cues by DELIBERATE operator action, never a live wire. Lives inside the
 * Show record (ADDITIVE OPTIONAL, rule 6): it syncs with the production, works offline, and
 * needs no server table. `kind` only picks the starter columns and the workspace's wording —
 * the shape is one honest table either way.
 */
export interface ShowDataset {
  id: string;
  name: string;
  kind: 'quiz' | 'teams' | 'roster' | 'generic';
  columns: DatasetColumn[];
  rows: DatasetRow[];
}

export interface Show {
  id: string;
  name: string;
  /** Format stamp. Absent = a pre-stamp record, normalized to 2 on read and written on every
   *  save. A no-op today - it exists so a FUTURE breaking change has a field to bump and
   *  migrate on (`root/version-every-persisted-format-ship-breaking`); 2 matches the packet
   *  lineage this store follows. */
  version?: 2;
  /** The production's LOOK (palette + font + style family) - the unified brand its graphics
   *  share. Set when a kit creates the production or from the first graphic added; the wizard
   *  pre-applies it when creating a graphic FOR this production. Absent = none chosen (the
   *  global project brand stays the default outside a production). ADDITIVE OPTIONAL - an
   *  older build reads and rewrites the record untouched. */
  look?: ProjectBrand;
  /** The BRAND this production is in, by saved-look id (model/brand.ts). The wizard's chooser
   *  preselects it when a graphic is created FOR this production, and "Apply brand to all
   *  graphics" sets it.
   *
   *  It sits BESIDE `look` rather than replacing it, and when both exist the REFERENCE wins: a
   *  reference stays right when the brand is edited, while `look` is a copy taken from whichever
   *  graphic happened to be added first. `look` remains the fallback for every production that
   *  never chose a brand - which is all of them until somebody does. ADDITIVE OPTIONAL
   *  (`root/version-every-persisted-format-ship-breaking`): absent = no brand chosen, an older build reads and rewrites the record
   *  untouched. */
  brandId?: string;
  /** The graphic POOL — which templates the production can air, each once. The order here is
   *  authoring order, NOT the layer stack: a graphic airs on the layer NUMBER its own entry
   *  carries (`graphicLayer`), which is what every z-order consumer reads. */
  graphics: SavedGraphic[];
  /** The cue rundown, in playout order (docs/CLOUD_PLAYOUT.md). ADDITIVE OPTIONAL — an older
   *  build reads and rewrites the record untouched; absent = no cues authored. */
  cues?: ShowCue[];
  /** The production's DATA TABLES (the Data workspace — docs/INTERACTIVE_PLAYOUT_PLAN.md D3).
   *  ADDITIVE OPTIONAL like cues; absent = none authored. */
  datasets?: ShowDataset[];
  /**
   * The production-data SEED (docs/PRODUCTION_DATA_PLAN.md §2.1) — the tree this production
   * STARTS from, and what "Reset" returns the live tree to. Authored, so it travels: it syncs,
   * duplicates and exports with the record.
   *
   * The LIVE tree is deliberately NOT here (model/productionState.ts says why at length): it
   * moves at feed rate, and this record syncs last-write-wins with conflict copies that drop
   * the production's slugs. ADDITIVE OPTIONAL — absent = no data authored.
   */
  data?: JsonObject;
  /** Field BINDINGS: graphic name -> field id -> production-data path. A bound field takes its
   *  value from the live tree at Take and on every change, never from a stored cue value
   *  (docs/PRODUCTION_DATA_PLAN.md §2.7). ADDITIVE OPTIONAL. */
  bindings?: ProductionBindings;
  /**
   * Run a vote board's percentage FIGURES live while the vote is open, instead of holding them
   * for Show result (the owner's ruling, 2026-08-30 — see setShowPollLiveFigures below). It
   * travels to the graphic as an ordinary field value on the staged cue, never as a second
   * mechanism: `tallyValues` writes it and the board's own runtime obeys it
   * (templates/importedDesign/pollBehaviour.ts).
   *
   * ADDITIVE OPTIONAL, and ABSENT MEANS OFF — which is what every existing production did.
   */
  pollLiveFigures?: boolean;
  /** The hosted control page's capability slug, once published (control/hostedControl.ts).
   *  Kept on the record so the URL survives reloads and the show export can bake the hosted
   *  receiver into its graphics. Rotating/unpublishing clears it. */
  hostedSlug?: string;
  /** The browser-output URL's capability slug, once published (docs/CLOUD_PLAYOUT.md §3).
   *  ADDITIVE OPTIONAL, stripped from conflict copies exactly like hostedSlug. */
  outputSlug?: string;
  /** When the operator first TOOK the output URL for this production (ISO) - copied the link or
   *  downloaded the template file. Publishing mints the slug whether or not anybody wants an
   *  output, so the slug cannot answer "is there an output here"; this can. The production
   *  page's renderer heartbeat is a question about a browser source somebody set up, so it is
   *  asked only once one has been set up (or has ever reported in). ADDITIVE OPTIONAL. */
  outputOpenedAt?: string;
  /** The PUBLIC audience URL's capability slug (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5,
   *  migration 0035) — what a viewer's phone opens at `/join/<slug>`. Minted by the database at
   *  publish and read back, never chosen here. */
  joinSlug?: string;
  /** The PRESENTER view's own capability slug (`/join?pv=<slug>`) — a read-only window onto
   *  what the operator has lined up, deliberately a different capability from the join link so
   *  handing a presenter their page never hands them the audience's, or the reverse. */
  presenterSlug?: string;
  /** When the hosted pages were last published (ISO). The output payload is PINNED at publish,
   *  so updatedAt > publishedAt means the renderer and operators run an older snapshot — the
   *  production page's "changes not yet published" hint reads exactly this. */
  publishedAt?: string;
  /** When the show last changed (ISO). Bumped on every mutation; drives cloud sync (LWW). */
  updatedAt: string;
  /** Soft-delete tombstone (hidden from the UI, kept so the delete syncs). See Packet.deleted. */
  deleted?: boolean;
}

const SHOWS_KEY = 'spx-gfx-shows';

const nowIso = () => new Date().toISOString();

/** See packets.ts BACKFILL_TS — a stable old timestamp for records saved before updatedAt. */
const BACKFILL_TS = '1970-01-01T00:00:00.000Z';

function notifyDataChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('spx-data-changed'));
  }
}

function saveAll(list: Show[]): string | null {
  try {
    durable.setItem(SHOWS_KEY, JSON.stringify(list));
    notifyDataChanged();
    return null;
  } catch {
    return 'Browser storage is full — remove a graphic from the show or delete an old show.';
  }
}

/** All shows INCLUDING tombstones — for the sync engine. Back-fills a stable sync timestamp
 *  and normalizes the format stamp on read (pure read-shape: no updatedAt bump, so a record
 *  never looks freshly edited just because a newer build read it). */
export function loadAllShows(): Show[] {
  try {
    const list = JSON.parse(durable.getItem(SHOWS_KEY) ?? '[]') as Show[];
    return list.map((s) => ({ ...s, version: 2 as const, updatedAt: s.updatedAt || BACKFILL_TS }));
  } catch {
    return [];
  }
}

/** Live shows for the UI (tombstones hidden). */
export function loadShows(): Show[] {
  return loadAllShows().filter((s) => !s.deleted);
}

/** The live productions whose pool holds a copy of this LIBRARY graphic (SavedGraphic's
 *  `graphicId` back-link) - "in 2 productions" on a Home row, and the guard that says what a
 *  library delete would orphan. */
export function productionsContaining(graphicId: string): Show[] {
  return loadShows().filter((s) => s.graphics.some((g) => g.graphicId === graphicId));
}

/**
 * WHAT A PRODUCTION NOBODY NAMED IS CALLED.
 *
 * One spelling, because two doors used to answer this differently and the wizard's answer was
 * wrong: its Finish step filled an empty production box with the GRAPHIC's name, so a first
 * import produced a graphic called "Imported SVG design" sitting in a production also called
 * "Imported SVG design" (e2e/import-svg.spec.ts, "an unnamed production is not named after the
 * graphic"). A show holding one strap
 * is not called "Interview strap". The floor below was already the app's answer everywhere
 * else, and Finish never let it be reached; it is exported now so the UI can PRINT the name a
 * save is about to write instead of guessing one.
 *
 * Deliberately plain. A default that reads as a deliberate name teaches the reader nothing; one
 * that reads as "you have not named this yet" is the invitation to name it.
 */
export const UNTITLED_PRODUCTION = 'Untitled production';

export function createShow(name: string): Show[] {
  createShowNamed(name);
  return loadShows();
}

/**
 * Create a production and return the RECORD itself - the wizard's kit and Finish doors need
 * the new id to navigate to, and `createShow` above only returns the list.
 *
 * `createShowNamedChecked` is the form that reports a FAILED write, and every caller that then
 * navigates to the new production should use it: on a full quota the row never persists, so the
 * very next `addGraphicToShow` reports "That show no longer exists" - true, but a description of
 * a symptom rather than of what went wrong. `createShowNamed` stays for the callers that go on
 * to make a checked write anyway (their own error is the one that matters).
 */
export function createShowNamedChecked(name: string): { show: Show; error: string | null } {
  const show: Show = {
    id: uuid(),
    name: name.trim() || UNTITLED_PRODUCTION,
    version: 2,
    graphics: [],
    updatedAt: nowIso(),
  };
  const all = loadAllShows();
  all.push(show);
  return { show, error: saveAll(all) };
}

export function createShowNamed(name: string): Show {
  return createShowNamedChecked(name).show;
}

/** Insert or replace a whole show by id (the storage seam's put('show'), incl. tombstones). */
export function upsertShow(show: Show): void {
  const all = loadAllShows();
  const i = all.findIndex((s) => s.id === show.id);
  if (i >= 0) all[i] = show;
  else all.push(show);
  saveAll(all);
}

/**
 * Add the current graphic to a show. Same rule as packets: a graphic with the same NAME is
 * replaced in place (adding twice = updating it, keeping its rundown position); a new name
 * appends at the end of the rundown.
 */
export function addGraphicToShow(
  showId: string,
  template: SpxTemplate,
  opts?: { graphicId?: string | null },
): { shows: Show[]; error: string | null } {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId && !s.deleted);
  if (!show) return { shows: all.filter((s) => !s.deleted), error: 'That show no longer exists.' };
  const existing = show.graphics.findIndex((g) => g.name === template.name);
  const graphic: SavedGraphic = {
    // Replacing by name KEEPS the pool entry's id — cues reference it (ShowCue.sourceId), so
    // updating a graphic must never orphan the cues prepared against it.
    id: existing >= 0 ? show.graphics[existing].id : uuid(),
    name: template.name,
    type: template.type,
    savedAt: nowIso(),
    template,
    // Which LIBRARY record this copy came from, when the document was a saved graphic - the
    // link the hosted control page follows to publish that graphic's entries.
    ...(opts?.graphicId ? { graphicId: opts.graphicId } : {}),
    // The playout layer (docs/PLAYOUT_DASHBOARD.md §5). A REPLACEMENT keeps whatever the
    // operator chose — re-adding an edited graphic must not silently move it off its layer
    // mid-show. A NEW graphic takes the next free number from 20 up, so no two graphics of a
    // production ever start on one layer: two on the same layer replace each other on air, and
    // there is no reason to begin from a state the operator then has to repair.
    layer: existing >= 0 ? graphicLayer(show.graphics[existing]) : nextFreeLayer(show.graphics),
  };
  if (existing >= 0) show.graphics[existing] = graphic;
  else {
    show.graphics.push(graphic);
    // A new pool graphic starts with one cue seeded from its field defaults, so the cue
    // rundown is never empty-but-working (docs/CLOUD_PLAYOUT.md §2).
    show.cues = [
      ...(show.cues ?? []),
      { id: uuid(), sourceId: graphic.id, label: template.name, values: seedValues(template.fields) },
    ];
  }
  show.updatedAt = nowIso();
  return { shows: all.filter((s) => !s.deleted), error: saveAll(all) };
}

export function removeShowGraphic(showId: string, graphicId: string): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId);
  if (show) {
    show.graphics = show.graphics.filter((g) => g.id !== graphicId);
    // Cues over a removed pool graphic have nothing left to drive — they go with it.
    if (show.cues?.length) show.cues = show.cues.filter((c) => c.sourceId !== graphicId);
    show.updatedAt = nowIso();
  }
  saveAll(all);
  return all.filter((s) => !s.deleted);
}

// ── Cues (docs/CLOUD_PLAYOUT.md §2) ──────────────────────────────────────────

/** The mutator envelope, once: resolve the LIVE (non-tombstoned) record, run the mutation,
 *  stamp + persist only when it reports a change, return the visible list. Hand-rolling this
 *  per mutator is how four of the first five cue mutators forgot the tombstone guard. */
/**
 * One write against one show, stamped with ONE timestamp.
 *
 * The mutator receives that timestamp because a stamp of its own would be a DIFFERENT
 * millisecond: `setShowOutputSlug` set `publishedAt = nowIso()` here and the write below then
 * set `updatedAt = nowIso()` again, so a clock tick between two adjacent statements left
 * `updatedAt > publishedAt` — and the production page reads exactly that comparison as "the
 * production changed after the last publish". Publishing could therefore tell the operator to
 * publish again, immediately, about a change nobody made. Rare enough to pass in isolation
 * almost always, which is how it survived until a loaded suite hit the boundary.
 */
function patchShow(showId: string, mutate: (show: Show, at: string) => boolean): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId && !s.deleted);
  if (show) {
    const at = nowIso();
    if (mutate(show, at)) {
      show.updatedAt = at;
      saveAll(all);
    }
  }
  return all.filter((s) => !s.deleted);
}

/** A cue's starting values: the template's own field defaults (what update() falls back to). */
export function seedValues(fields: SpxTemplate['fields']): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) values[f.field] = f.value ?? '';
  return values;
}

/** Append a cue for a pool graphic. `seed` prefills label/values (e.g. from a ControlEntry —
 *  a starting point only; the cue owns its values from here on). */
export function addShowCue(
  showId: string,
  sourceId: string,
  seed?: { label?: string; values?: Record<string, string>; note?: string },
): { shows: Show[]; cueId: string | null } {
  let cueId: string | null = null;
  const shows = patchShow(showId, (show) => {
    const source = show.graphics.find((g) => g.id === sourceId);
    if (!source) return false;
    const cue: ShowCue = {
      id: uuid(),
      sourceId,
      label: seed?.label?.trim() || source.name,
      values: { ...seedValues(source.template.fields), ...(seed?.values ?? {}) },
      ...(seed?.note ? { note: seed.note } : {}),
    };
    show.cues = [...(show.cues ?? []), cue];
    cueId = cue.id;
    return true;
  });
  return { shows, cueId };
}

/** Patch a cue's label / values / note in place. Values merge per field. */
export function updateShowCue(
  showId: string,
  cueId: string,
  patch: { label?: string; values?: Record<string, string>; note?: string | null },
): Show[] {
  return patchShow(showId, (show) => {
    const cue = show.cues?.find((c) => c.id === cueId);
    if (!cue) return false;
    if (patch.label !== undefined) cue.label = patch.label;
    if (patch.values) cue.values = { ...cue.values, ...patch.values };
    if (patch.note === null) delete cue.note;
    else if (patch.note !== undefined) cue.note = patch.note;
    return true;
  });
}

/**
 * Replace the WHOLE cue rundown in one write - the pack installer's ordered-rundown path
 * (src/packs/graphicsPack.ts): a pack may carry one cue list ORDERED ACROSS graphics (the
 * show walk), which per-cue appends cannot express without a reorder dance. Every entry must
 * reference a pool graphic; an unknown sourceId refuses the whole write, because a rundown
 * that "mostly installed" would air with rows silently missing. Values seed from the source
 * template's defaults exactly as addShowCue seeds them.
 */
export function setShowCues(
  showId: string,
  cues: Array<{ sourceId: string; label: string; values?: Record<string, string>; note?: string }>,
): { shows: Show[]; error: string | null } {
  let error: string | null = null;
  const shows = patchShow(showId, (show) => {
    const bySource = new Map(show.graphics.map((g) => [g.id, g]));
    const missing = cues.find((c) => !bySource.has(c.sourceId));
    if (missing) {
      error = `The cue "${missing.label}" points at a graphic that is not in the pool.`;
      return false;
    }
    show.cues = cues.map((c) => {
      const source = bySource.get(c.sourceId)!;
      return {
        id: uuid(),
        sourceId: c.sourceId,
        label: c.label.trim() || source.name,
        values: { ...seedValues(source.template.fields), ...(c.values ?? {}) },
        ...(c.note ? { note: c.note } : {}),
      };
    });
    return true;
  });
  return { shows, error };
}

/** Move a cue one slot up or down the rundown (the moveShowGraphic swap, over cues). */
export function moveShowCue(showId: string, cueId: string, dir: -1 | 1): Show[] {
  return patchShow(showId, (show) => {
    const cues = show.cues;
    if (!cues) return false;
    const i = cues.findIndex((c) => c.id === cueId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cues.length) return false;
    [cues[i], cues[j]] = [cues[j], cues[i]];
    return true;
  });
}

/**
 * Remove a cue - and, when it was its graphic's LAST cue, the pool graphic with it.
 *
 * The RUNDOWN is the whole truth about what a production holds (docs/PLAYOUT_DASHBOARD.md §5).
 * A pool graphic with no cues appears nowhere in it, yet it still ships in the published payload
 * and still loads as an iframe on its own layer in the output page - an orphan nobody could see
 * or reach once the layer list is gone. Pruning it here is what lets the rundown be the only list.
 */
export function removeShowCue(showId: string, cueId: string): Show[] {
  return patchShow(showId, (show) => {
    const cue = show.cues?.find((c) => c.id === cueId);
    if (!cue) return false;
    show.cues = (show.cues ?? []).filter((c) => c.id !== cueId);
    if (!show.cues.some((c) => c.sourceId === cue.sourceId)) {
      show.graphics = show.graphics.filter((g) => g.id !== cue.sourceId);
    }
    return true;
  });
}

// ── Datasets (the Data workspace — docs/INTERACTIVE_PLAYOUT_PLAN.md D3) ──────

/** Each kind's starter columns. Labels matter: field binding matches a column's LABEL against
 *  a field's TITLE (case-insensitive), so the quiz preset spells its columns exactly as the
 *  quiz templates title their fields — a fresh quiz bank loads into every board with zero
 *  setup. Teams/roster presets are authoring conveniences; their load story arrives with the
 *  sports pilot (Phase 4). */
const DATASET_PRESETS: Record<ShowDataset['kind'], { name: string; labels: string[] }> = {
  quiz: { name: 'Quiz questions', labels: ['Question', 'Answer A', 'Answer B', 'Answer C', 'Answer D', 'Correct answer'] },
  // ONE ROW IS ONE TEAM, and a two-team board has an A side and a B side — so these labels are
  // the SIDELESS half of a scoreboard's field titles ("Team A" minus the side is "Team"), which
  // is what lets the operator pick a side and load a row into it. Every column here binds a
  // real field; 'Code' was dropped because a starter column that matches nothing teaches the
  // wrong thing about how the binding works.
  teams: { name: 'Teams', labels: ['Team', 'Score', 'Team colour', 'Team logo'] },
  roster: { name: 'Line-up', labels: ['Name', 'Number', 'Position'] },
  generic: { name: 'Data table', labels: ['Column 1', 'Column 2', 'Column 3'] },
};

/**
 * A kind's starter columns, for anything that needs the SHAPE without creating a table - the
 * Data tab's downloadable CSV template being the one caller. It reads this table rather than
 * carrying its own list, so a template file can never describe a shape the workspace itself
 * would not have made, and adding a column above changes both at once.
 */
export function datasetPreset(kind: ShowDataset['kind']): { name: string; labels: string[] } {
  return DATASET_PRESETS[kind];
}

function datasetOf(show: Show, datasetId: string): ShowDataset | undefined {
  return show.datasets?.find((d) => d.id === datasetId);
}

/** Create a dataset with its kind's starter columns and one empty row to type into. */
export function addShowDataset(
  showId: string,
  kind: ShowDataset['kind'],
  name?: string,
): { shows: Show[]; datasetId: string | null } {
  let datasetId: string | null = null;
  const shows = patchShow(showId, (show) => {
    const preset = DATASET_PRESETS[kind];
    const columns = preset.labels.map((label, i) => ({ key: `c${i}`, label }));
    const dataset: ShowDataset = { id: uuid(), name: name?.trim() || preset.name, kind, columns, rows: [{ id: uuid(), values: {} }] };
    show.datasets = [...(show.datasets ?? []), dataset];
    datasetId = dataset.id;
    return true;
  });
  return { shows, datasetId };
}

export function renameShowDataset(showId: string, datasetId: string, name: string): Show[] {
  return patchShow(showId, (show) => {
    const ds = datasetOf(show, datasetId);
    if (!ds) return false;
    ds.name = name;
    return true;
  });
}

export function removeShowDataset(showId: string, datasetId: string): Show[] {
  return patchShow(showId, (show) => {
    if (!show.datasets?.some((d) => d.id === datasetId)) return false;
    show.datasets = show.datasets.filter((d) => d.id !== datasetId);
    return true;
  });
}

export function addDatasetRow(showId: string, datasetId: string): { shows: Show[]; rowId: string | null } {
  let rowId: string | null = null;
  const shows = patchShow(showId, (show) => {
    const ds = datasetOf(show, datasetId);
    if (!ds) return false;
    const row: DatasetRow = { id: uuid(), values: {} };
    ds.rows = [...ds.rows, row];
    rowId = row.id;
    return true;
  });
  return { shows, rowId };
}

/** Patch one row's cells (column key -> value; merge, like cue values). */
export function updateDatasetRow(
  showId: string,
  datasetId: string,
  rowId: string,
  values: Record<string, string>,
): Show[] {
  return patchShow(showId, (show) => {
    const row = datasetOf(show, datasetId)?.rows.find((r) => r.id === rowId);
    if (!row) return false;
    row.values = { ...row.values, ...values };
    return true;
  });
}

export function removeDatasetRow(showId: string, datasetId: string, rowId: string): Show[] {
  return patchShow(showId, (show) => {
    const ds = datasetOf(show, datasetId);
    if (!ds?.rows.some((r) => r.id === rowId)) return false;
    ds.rows = ds.rows.filter((r) => r.id !== rowId);
    return true;
  });
}

export function addDatasetColumn(showId: string, datasetId: string, label: string): Show[] {
  return patchShow(showId, (show) => {
    const ds = datasetOf(show, datasetId);
    if (!ds) return false;
    // Keys are minted monotonically, never reused: values live under keys, so a removed
    // column's data must not resurface under a later one's.
    const next = ds.columns.reduce((max, c) => Math.max(max, Number(c.key.slice(1)) + 1 || 0), 0);
    ds.columns = [...ds.columns, { key: `c${next}`, label: label.trim() || `Column ${ds.columns.length + 1}` }];
    return true;
  });
}

export function renameDatasetColumn(showId: string, datasetId: string, columnKey: string, label: string): Show[] {
  return patchShow(showId, (show) => {
    const col = datasetOf(show, datasetId)?.columns.find((c) => c.key === columnKey);
    if (!col) return false;
    col.label = label;
    return true;
  });
}

export function removeDatasetColumn(showId: string, datasetId: string, columnKey: string): Show[] {
  return patchShow(showId, (show) => {
    const ds = datasetOf(show, datasetId);
    if (!ds?.columns.some((c) => c.key === columnKey)) return false;
    ds.columns = ds.columns.filter((c) => c.key !== columnKey);
    return true;
  });
}

/**
 * IMPORT a parsed table as a NEW dataset (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 7).
 *
 * The file's header row becomes the COLUMN LABELS verbatim, which is the whole design: the
 * binding is by name (`datasetValuesForFields`), so a spreadsheet whose columns are already
 * called "Question" / "Answer A" binds to the quiz boards with no mapping step, and one whose
 * columns are called something else says so instead of pretending. What lands is ORDINARY
 * dataset rows — editable, synced with the production, with no link back to the file. There is
 * deliberately no "re-import from source": a live file dependency would put the show's data
 * somewhere the show does not travel.
 *
 * `kind` stays 'generic' unless the caller says otherwise, because kind only picks starter
 * columns and an import brings its own.
 */
export function importShowDataset(
  showId: string,
  table: { header: string[]; rows: string[][] },
  opts?: { name?: string; kind?: ShowDataset['kind'] },
): { shows: Show[]; datasetId: string | null; error: string | null } {
  const labels = table.header.map((h) => h.trim()).filter((h) => h !== '');
  if (labels.length === 0) {
    return { shows: loadShows(), datasetId: null, error: 'That file has no column names in its first row.' };
  }
  let datasetId: string | null = null;
  const shows = patchShow(showId, (show) => {
    // Columns follow the header's ORDER and count; a header cell that was blank is dropped
    // above, so its cells are dropped here too rather than landing under a nameless column
    // nothing can ever bind or edit.
    const keep = table.header.map((h, i) => [h.trim(), i] as const).filter(([h]) => h !== '');
    const columns: DatasetColumn[] = keep.map(([label], i) => ({ key: `c${i}`, label }));
    const rows: DatasetRow[] = table.rows.map((cells) => ({
      id: uuid(),
      values: Object.fromEntries(keep.map(([, from], i) => [`c${i}`, cells[from] ?? ''])),
    }));
    const dataset: ShowDataset = {
      id: uuid(),
      name: opts?.name?.trim() || 'Imported table',
      kind: opts?.kind ?? 'generic',
      // An import with no data rows still lands: the columns are the useful half and the
      // operator can type into them. One empty row so there is something to type into.
      rows: rows.length > 0 ? rows : [{ id: uuid(), values: {} }],
      columns,
    };
    show.datasets = [...(show.datasets ?? []), dataset];
    datasetId = dataset.id;
    return true;
  });
  return { shows, datasetId, error: null };
}

/**
 * The BINDING: which of a template's fields a dataset row can fill, by matching column LABELS
 * to field TITLES (trimmed, case-insensitive). Returns fieldId -> value for the matches only —
 * unmatched columns are skipped, unmatched fields keep their cue values. Deterministic and
 * fully visible (rename a column or a field title and the match changes with it); loading is
 * always a deliberate operator action into a CUE, never a live wire to air.
 */
export function datasetValuesForFields(
  dataset: ShowDataset,
  row: DatasetRow,
  fields: { key: string; label: string }[],
): Record<string, string> {
  const byLabel = new Map(dataset.columns.map((c) => [c.label.trim().toLowerCase(), c.key] as const));
  const out: Record<string, string> = {};
  for (const f of fields) {
    const columnKey = byLabel.get(f.label.trim().toLowerCase());
    if (columnKey === undefined) continue;
    const v = row.values[columnKey];
    if (v !== undefined) out[f.key] = v;
  }
  return out;
}

/**
 * Save the production-data SEED — what Reset returns the live tree to.
 *
 * This is the ONE write that puts data values on the show record, and it is a deliberate
 * operator action ("Save as seed"), never something a value change triggers. That is the whole
 * anti-churn rule of docs/PRODUCTION_DATA_PLAN.md §2.1, enforced by there being no other door.
 */
export function setShowSeedData(showId: string, data: JsonObject | undefined): Show[] {
  return patchShow(showId, (show) => {
    if (data && Object.keys(data).length > 0) show.data = data;
    else delete show.data;
    return true;
  });
}

/** Bind a field to a production-data path, or unbind it with `null` — the operator's one and
 *  only override gesture (docs/PRODUCTION_DATA_PLAN.md §2.7). */
export function setFieldBinding(
  showId: string,
  graphic: string,
  fieldId: string,
  path: string | null,
): Show[] {
  return patchShow(showId, (show) => {
    const bindings: ProductionBindings = { ...(show.bindings ?? {}) };
    const forGraphic = { ...(bindings[graphic] ?? {}) };
    if (path && path.trim() !== '') forGraphic[fieldId] = path.trim();
    else delete forGraphic[fieldId];
    if (Object.keys(forGraphic).length > 0) bindings[graphic] = forGraphic;
    else delete bindings[graphic];
    if (Object.keys(bindings).length > 0) show.bindings = bindings;
    else delete show.bindings;
    return true;
  });
}

/**
 * Should this production's vote boards show the percentage figures WHILE the vote is running?
 *
 * Off is the shipped answer and the owner's (2026-08-30): most shows put a vote board up to
 * reveal a result, so the figures wait for Show result. This is the opt-in for the shows that
 * want the numbers moving on air, and it is one fact for the whole production rather than a
 * per-round choice, because it is a decision about how a show looks rather than about a vote.
 *
 * ABSENT means off, so no migration: an older record reads as off, which is what it did.
 */
export function setShowPollLiveFigures(showId: string, on: boolean): Show[] {
  return patchShow(showId, (show) => {
    if (on) show.pollLiveFigures = true;
    else delete show.pollLiveFigures;
    return true;
  });
}

/** Set (or clear, with undefined) the production's unified look. */
export function setShowLook(showId: string, look: ProjectBrand | undefined): Show[] {
  return patchShow(showId, (show) => {
    if (look) show.look = look;
    else delete show.look;
    return true;
  });
}

/** Point the production at a saved BRAND (or clear it, with undefined). The reference the
 *  wizard's chooser preselects; `setShowLook` above still records the captured copy. */
export function setShowBrand(showId: string, brandId: string | undefined): Show[] {
  return patchShow(showId, (show) => {
    if (brandId) show.brandId = brandId;
    else delete show.brandId;
    return true;
  });
}

/** Record (or clear, with undefined) a show's browser-output slug after (un)publishing.
 *  Publishing also stamps publishedAt; clearing removes it (nothing is live any more). */
export function setShowOutputSlug(showId: string, slug: string | undefined): Show[] {
  return patchShow(showId, (show, at) => {
    if (slug) {
      show.outputSlug = slug;
      // The SAME instant the write is stamped with, so a freshly published record reads clean.
      show.publishedAt = at;
    } else {
      delete show.outputSlug;
      delete show.publishedAt;
      // The URL somebody set their browser source to is gone with the slug, so the record that
      // one was ever set up goes with it - a re-publish mints a NEW slug, and the old source
      // will never report in again.
      delete show.outputOpenedAt;
    }
    return true;
  });
}

/** Note that the operator has TAKEN the output URL - copied the link, or downloaded the
 *  template file that wraps it. Stamped once and left alone: the fact being recorded is that an
 *  output was set up at all, not when it was last touched. */
export function noteShowOutputOpened(showId: string): Show[] {
  return patchShow(showId, (show, at) => {
    if (show.outputOpenedAt) return false;      // already known - nothing to write
    show.outputOpenedAt = at;
    return true;
  });
}

/**
 * Record (or clear, with undefined) the AUDIENCE capabilities after (un)publishing.
 *
 * Both slugs travel together because they are minted together, by the database, at publish: the
 * app never chooses one, it reads back what was assigned. Kept separate from
 * `setShowOutputSlug` so the audience plane can be absent from a production that has one -
 * an older server has no 0035 columns to read back, and that must degrade to "no join link",
 * never to a broken publish.
 */
export function setShowAudienceSlugs(
  showId: string,
  slugs: { joinSlug?: string | null; presenterSlug?: string | null } | undefined,
): Show[] {
  return patchShow(showId, (show) => {
    if (slugs?.joinSlug) show.joinSlug = slugs.joinSlug;
    else delete show.joinSlug;
    if (slugs?.presenterSlug) show.presenterSlug = slugs.presenterSlug;
    else delete show.presenterSlug;
    return true;
  });
}

/** Move a graphic one slot up or down the rundown. */
// ── Playout layers (docs/PLAYOUT_DASHBOARD.md §5) ──────────────────────────────────────────
//
// A pool graphic airs on a layer NUMBER the operator types, not on one derived from its
// position in the pool. CasparCG offers 1-100 and a teaching install's rundowns live around
// 20, so counting starts there: the first graphic is 20, the next 21, and so on. Distinct by
// construction (owner decision, 2026-08-05) — two graphics on one layer replace each other on
// air, and nothing is gained by starting from a state the operator has to repair. The number
// stays fully editable; nobody has to think about it.

/** Where the count starts, and what a record saved before the field reads as. */
export const DEFAULT_PLAYOUT_LAYER = 20;
/** The range CasparCG accepts, and therefore the range the control offers. */
export const MIN_PLAYOUT_LAYER = 1;
export const MAX_PLAYOUT_LAYER = 100;

/** A pool graphic's layer — the stored number, or the default for a record saved before the
 *  field existed (additive-optional read, `root/version-every-persisted-format-ship-breaking`). */
export function graphicLayer(graphic: Pick<SavedGraphic, 'layer'>): number {
  const n = Number(graphic.layer);
  return Number.isFinite(n) && n >= MIN_PLAYOUT_LAYER && n <= MAX_PLAYOUT_LAYER
    ? Math.round(n)
    : DEFAULT_PLAYOUT_LAYER;
}

/** The lowest layer no graphic of the pool is using, from the default upward — what the
 *  duplicate-layer warning offers as its one-click fix. */
export function nextFreeLayer(graphics: Pick<SavedGraphic, 'layer'>[]): number {
  const used = new Set(graphics.map(graphicLayer));
  for (let n = DEFAULT_PLAYOUT_LAYER; n <= MAX_PLAYOUT_LAYER; n++) if (!used.has(n)) return n;
  for (let n = MIN_PLAYOUT_LAYER; n < DEFAULT_PLAYOUT_LAYER; n++) if (!used.has(n)) return n;
  return DEFAULT_PLAYOUT_LAYER;
}

/**
 * Which pool graphics SHARE a layer, keyed by that layer. Two graphics on one layer evict each
 * other the moment both are taken - in CasparCG, in SPX, and in the browser output alike - so
 * the surface says so rather than letting it be found live (docs/PLAYOUT_DASHBOARD.md §5).
 * Defaulting everything to one number is the deliberate choice; this is what keeps it honest.
 */
export function duplicateLayers(graphics: SavedGraphic[]): Map<number, SavedGraphic[]> {
  const byLayer = new Map<number, SavedGraphic[]>();
  for (const g of graphics) {
    const layer = graphicLayer(g);
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), g]);
  }
  return new Map([...byLayer].filter(([, gs]) => gs.length > 1));
}

/** Set one pool graphic's playout layer. Out-of-range values clamp rather than refuse — the
 *  control is a number input and a half-typed "1" must not be rejected mid-keystroke. */
export function setShowGraphicLayer(showId: string, graphicId: string, layer: number): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId && !s.deleted);
  const graphic = show?.graphics.find((g) => g.id === graphicId);
  if (show && graphic) {
    const clamped = Math.min(MAX_PLAYOUT_LAYER, Math.max(MIN_PLAYOUT_LAYER, Math.round(layer) || DEFAULT_PLAYOUT_LAYER));
    graphic.layer = clamped;
    show.updatedAt = nowIso();
    saveAll(all);
  }
  return all.filter((s) => !s.deleted);
}

export function moveShowGraphic(showId: string, graphicId: string, dir: -1 | 1): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId);
  if (show) {
    const i = show.graphics.findIndex((g) => g.id === graphicId);
    const j = i + dir;
    if (i >= 0 && j >= 0 && j < show.graphics.length) {
      const g = show.graphics[i];
      show.graphics[i] = show.graphics[j];
      show.graphics[j] = g;
      show.updatedAt = nowIso();
      saveAll(all);
    }
  }
  return all.filter((s) => !s.deleted);
}

/** Record (or clear, with undefined) a show's hosted control slug after (un)publishing. */
export function setShowHostedSlug(showId: string, slug: string | undefined): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId);
  if (show) {
    if (slug) show.hostedSlug = slug;
    else delete show.hostedSlug;
    show.updatedAt = nowIso();
    saveAll(all);
  }
  return all.filter((s) => !s.deleted);
}

/** Delete = tombstone (strip payload, keep the id + fresh timestamp) so the delete syncs. */
export function deleteShow(showId: string): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId);
  if (show) {
    show.deleted = true;
    show.graphics = [];
    show.updatedAt = nowIso();
  }
  saveAll(all);
  return all.filter((s) => !s.deleted);
}

/** Drop local tombstones older than the cutoff (the sync controller's coordinated purge). */
export function purgeOldShowTombstones(beforeIso: string): void {
  const all = loadAllShows();
  const kept = all.filter((s) => !s.deleted || s.updatedAt >= beforeIso);
  if (kept.length !== all.length) saveAll(kept);
}
