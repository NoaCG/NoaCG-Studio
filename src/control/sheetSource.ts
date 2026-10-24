// A GOOGLE SHEET AS A SOURCE: its link, its CSV, what its rows write into the production tree,
// and the one browser reader that follows it (docs/work-specs/sheet-data-flow/spec.md, "While the
// show runs"; docs/work-specs/data-sources/spec.md, phase C1b).
//
// The reader stores the sheet id and tab and builds the export address itself, so a pasted link
// is never fetched as given. The export answers a browser from any origin and needs only "Anyone
// with the link can view" (measured 2026-10-16); "Publish to the web" CSV is the documented
// fallback and is accepted too.
//
// Its cadence is measured, not chosen: an edit shows in the export within 441 to 1,011 ms
// (docs/work-specs/data-sources/evidence/sheet-latency.md, 20 edits) and an hour of 5-second reads
// met no refusal, slowest read 855 ms (evidence/sheet-endurance.md). So the browser reads every
// 5 s with a 10 s timeout, an edit reaches the graphic in about 5.9 s at worst, and three missed
// reads (15 s) mark the data stale.
//
// What a read writes. Rows go through the graphic's own format adapter (./contentFormats.ts) into
// strings under the source's own prefix, `sheet.<id>.lines` (`.rows` and `.headers` for
// standings) or `sheet.<id>.values.<key>` for Name/Value and `Field ID,Label,Value` rows. Only
// paths a field is connected to are written, and only those whose text differs from what this
// reader last wrote: the diff is against the reader's own snapshot, never against the tree, so an
// operator's ± on a connected value holds until that cell changes (sheet D4), and Resume after a
// Pause writes only cells that changed while paused. A failed read writes nothing; a valid list
// read with no rows writes "" (it clears the field on air); a missing keyed row writes nothing
// and says so.
//
// One active reader per source: a lease in this browser's storage, renewed with every read. A
// second tab shows the owner's status and does not read. An answer that arrives after the lease
// moved, after Disconnect or after the reader stopped writes nothing.
//
// A source can also feed message candidates (`inbox`). That consumer receives rows and has no
// writer: nothing it is handed can reach the tree or the command log.
//
// Pure and Node-importable (production-page spec §5.2): every door arrives through `io`, so
// scripts/sheet-source.test.mjs drives it with a fake clock, fetch and storage.

import { fillList, listFormatFor, valueFor, type FilledRow, type GraphicShape, type ListAdapter, type ListFormat } from './contentFormats.js';
import { parseDelimited } from '../model/csv.js';
import { isSourcePath, mergePatch, patchForPath, sourcePrefix, type JsonObject, type OfferedValue } from '../model/productionData.js';

export { isSourcePath, sourceIdOf, sourcePaths, sourcePrefix } from '../model/productionData.js';
// The one value a path writes for all its fields: the shared evaluator's rule (./sourceMapping.ts).
export { pathValue } from './sourceMapping.js';
import type { FieldDescriptor } from '../model/fieldModel';

/** How often the open page reads a Sheet (evidence/sheet-endurance.md). */
export const SHEET_READ_MS = 5_000;
/** How long one read may take before it counts as missed (sheet-endurance: slowest 855 ms). */
export const SHEET_TIMEOUT_MS = 10_000;
/** Missed reads before the data is marked stale: 15 s in the browser (sheet AC-6). */
export const SHEET_STALE_MISSES = 3;
/** How long a reader's claim lasts unrenewed: three reads, so a closed tab hands over soon. */
export const SHEET_LEASE_MS = 3 * SHEET_READ_MS;

// ── The link ──────────────────────────────────────────────────────────────────

/** A Sheet tab as the reader stores it. `gid` null is "the first tab", which the operator
 *  confirmed because the link named none. `published` is a "Publish to the web" address. */
export interface SheetLink {
  sheetId: string;
  gid: string | null;
  published?: boolean;
}

/** Read a pasted link: an ordinary share link, a tab's address, an export or a published CSV. */
export function parseSheetLink(text: string): { link: SheetLink } | { error: string } {
  const notSheet = { error: 'That is not a Google Sheets link. In the Sheet, use Share, then Copy link.' };
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return notSheet;
  }
  if (url.hostname !== 'docs.google.com') return notSheet;
  // A browser signed in to several Google accounts puts `/u/<n>` before the id.
  const path = url.pathname.replace(/^\/spreadsheets\/u\/\d+\//, '/spreadsheets/');
  const published = /^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{10,})\//.exec(path + '/');
  const shared = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/.exec(path);
  const id = published?.[1] ?? (shared && shared[1] !== 'e' ? shared[1] : null);
  if (!id) return notSheet;
  const gid = /(?:^|[#&?])gid=(\d+)/.exec(`${url.search}${url.hash}`)?.[1] ?? null;
  return { link: published ? { sheetId: id, gid, published: true } : { sheetId: id, gid } };
}

/** The address the reader fetches, built from the stored id and tab, never from the pasted text. */
export function sheetCsvUrl(link: SheetLink): string {
  const id = encodeURIComponent(link.sheetId);
  if (link.published) {
    return `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv${link.gid !== null ? `&gid=${link.gid}&single=true` : ''}`;
  }
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${link.gid !== null ? `&gid=${link.gid}` : ''}`;
}

// ── One read ──────────────────────────────────────────────────────────────────

/** The part of `fetch` a read uses. */
export type SheetFetch = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export type SheetRead =
  | { ok: true; rows: string[][] }
  | { ok: false; error: string; fix: string };

const NOT_SHARED = 'In the Sheet, use Share and set General access to “Anyone with the link”, Viewer.';

/** Fetch the tab once and read its cells. Every failure names its fix; none returns rows. */
export async function readSheet(fetcher: SheetFetch, link: SheetLink, signal: AbortSignal): Promise<SheetRead> {
  let response: Awaited<ReturnType<SheetFetch>>;
  let text: string;
  try {
    response = await fetcher(sheetCsvUrl(link), { signal });
    text = await response.text();
  } catch (error) {
    if (signal.aborted) return { ok: false, error: 'Google did not answer in 10 seconds', fix: 'Reading carries on by itself.' };
    // The server tick reads at most so many bytes of a tab (api/_lib/dataTick.ts READ_BYTES).
    if ((error as { code?: string }).code === 'too_large') return { ok: false, error: 'the tab is too large to read', fix: 'Keep the tab under 1 MB, or move older rows to another tab.' };
    // An unshared Sheet answers with a redirect to Google's sign-in, which a browser refuses to
    // read from another origin: it arrives here as a network error, like being offline.
    void error;
    return { ok: false, error: 'can’t read it (not shared, or offline)', fix: `${NOT_SHARED} Check this computer is online.` };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, error: 'can’t read it (not shared)', fix: NOT_SHARED };
  if (response.status === 400 || response.status === 404) {
    return link.gid !== null
      ? { ok: false, error: 'can’t find the tab', fix: 'The tab or the Sheet was deleted, or the link is wrong. Connect the tab again.' }
      : { ok: false, error: 'can’t find the Sheet', fix: 'It was deleted, or the link is wrong. Connect it again.' };
  }
  if (!response.ok) return { ok: false, error: `Google refused the read (${response.status})`, fix: 'Reading carries on by itself.' };
  // A sign-in page that did come back (same origin, or a proxy) is not the Sheet's cells.
  if (/^\s*<(!doctype|html)/i.test(text)) return { ok: false, error: 'can’t read it (not shared)', fix: NOT_SHARED };
  return { ok: true, rows: parseDelimited(text, ',') };
}

// ── What the rows write ───────────────────────────────────────────────────────

/** How a source's rows become values: one of the list adapters, or keyed values. */
export type SheetShape = ListAdapter | 'values';

/** The shape a graphic's connection reads, decided by what the graphic is (contentFormats). */
export function sheetShapeFor(graphic: GraphicShape): SheetShape {
  for (const field of ['f0', 'f2']) {
    const format = listFormatFor(graphic, field);
    if (format) return format.adapter;
  }
  return 'values';
}

/** What one read of a tab holds, as leaves under the source's prefix (`lines`, `values.f2`). */
export interface SheetContent {
  /** leaf (relative to `sheet.<id>`) -> the string it writes. */
  leaves: Record<string, string>;
  /** leaf -> what the operator reads it as: a label from the tab, or the adapter's name. */
  labels: Record<string, string>;
  /** The lines a list writes, each malformed one flagged, for the preview. */
  preview: FilledRow[];
  /** Rows the read could not use, said plainly. Nothing in them is written. */
  problems: string[];
  /** Keyed leaves the tab names on more than one row: said once in `problems`, never again as missing. */
  doubled?: string[];
  /** A valid read with no rows. */
  empty: boolean;
  /** Keyed by the data template's Field ID, so each key names a field of the graphic. */
  byFieldId: boolean;
}

/** The leaves a list adapter writes, and the field each one fills on its graphic. */
export function listLeaves(shape: ListAdapter): { leaf: string; field: string; label: string }[] {
  if (shape === 'standings') {
    return [
      { leaf: 'rows', field: 'f2', label: 'Rows' },
      { leaf: 'headers', field: 'f3', label: 'Column headings' },
    ];
  }
  return [{ leaf: 'lines', field: 'f0', label: 'Lines' }];
}

/** Read a tab's rows in a shape. */
export function sheetContent(shape: SheetShape, rows: string[][]): SheetContent {
  const empty = rows.every((r) => r.every((c) => c.trim() === ''));
  if (shape === 'values') return { ...keyedValues(rows), empty };
  const format: ListFormat = shape === 'standings' ? { adapter: shape, main: 'rows', headers: 'headers' } : { adapter: shape, main: 'lines' };
  const fill = fillList(format, rows);
  // A list's labels are its adapter's (`listLeaves`), so the read carries none.
  return { leaves: fill.values, labels: {}, preview: fill.rows, problems: [], empty, byFieldId: false };
}

/**
 * What a source offers a graphic's mapping review: each leaf's path, label and sample, and the
 * field it was made for when the source says so (a list adapter's own field, a Field ID).
 */
export function offeredValues(sourceId: string, shape: SheetShape, content: SheetContent, kind: 'sheet' | 'feed'): OfferedValue[] {
  const prefix = sourcePrefix(sourceId, kind);
  if (shape !== 'values') {
    return listLeaves(shape).map((l) => ({ path: `${prefix}.${l.leaf}`, label: l.label, sample: content.leaves[l.leaf] ?? '', key: l.field }));
  }
  return Object.keys(content.leaves).map((leaf) => ({
    path: `${prefix}.${leaf}`,
    label: content.labels[leaf] ?? leaf,
    sample: content.leaves[leaf],
    ...(content.byFieldId ? { key: leaf.slice('values.'.length) } : {}),
  }));
}

/** A key as a path segment: dots would split it, and an all-digit segment indexes an array. */
const keyOf = (cell: string): string | null => {
  const key = cell.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  return key === '' || /^\d+$/.test(key) ? null : key;
};

/**
 * Name/Value rows, or the data template's `Field ID,Label,Value` rows, as `values.<key>`.
 *
 * Every row is read before anything is decided, so a duplicate is caught whichever copy comes
 * first, and then neither copy is written: the field keeps its value (data-sources AC-13). An
 * empty Value is a value, and clears its field.
 */
function keyedValues(rows: string[][]): Omit<SheetContent, 'empty'> {
  const filled = rows.map((cells, i) => ({ cells, row: i + 1 })).filter((r) => r.cells.some((c) => c.trim() !== ''));
  const head = filled[0]?.cells.map((c) => c.trim().toLowerCase()) ?? [];
  const template = head.includes('field id') && head.includes('value');
  const idAt = template ? head.indexOf('field id') : 0;
  const valueAt = template ? head.indexOf('value') : 1;
  const labelAt = template ? head.indexOf('label') : 0;
  const named = !template && head[0] !== undefined && ['name', 'field'].includes(head[0]) && head[1] === 'value';
  const body = template || named ? filled.slice(1) : filled;

  const problems: string[] = [];
  const seen = new Map<string, { rows: number[]; value: string; label: string }>();
  for (const { cells, row } of body) {
    const key = keyOf(cells[idAt] ?? '');
    if (!key) {
      problems.push(`Row ${row} has no usable ${template ? 'Field ID' : 'name'}`);
      continue;
    }
    const before = seen.get(key);
    const value = (cells[valueAt] ?? '').replace(/\r\n?/g, '\n');
    const label = (cells[labelAt] ?? '').trim() || key;
    seen.set(key, { rows: [...(before?.rows ?? []), row], value, label: before?.label ?? label });
  }
  const leaves: Record<string, string> = {};
  const labels: Record<string, string> = {};
  const doubled: string[] = [];
  for (const [key, { rows: at, value, label }] of seen) {
    if (at.length > 1) {
      problems.push(`${key} is on rows ${at.join(' and ')}, so it keeps its value`);
      doubled.push(`values.${key}`);
      continue;
    }
    leaves[`values.${key}`] = value;
    labels[`values.${key}`] = label;
  }
  const preview = Object.keys(leaves).map((leaf) => ({ text: `${labels[leaf]}: ${leaves[leaf]}` }));
  return { leaves, labels, preview, problems, doubled, byFieldId: template };
}

/**
 * What one read writes: the connected paths whose text differs from what this reader last
 * wrote, as one merge patch, and the snapshot to diff the next read against.
 *
 * A connected path the read does not carry (a keyed row that went missing) writes nothing and is
 * reported; its snapshot entry stays, so it is written again only once the row returns changed.
 */
export function sheetWrites(
  sourceId: string,
  content: Pick<SheetContent, 'leaves'>,
  connected: ReadonlySet<string>,
  snapshot: Readonly<Record<string, string>>,
  accept: (path: string, text: string) => string | null = (_path, text) => text,
): { patch: JsonObject; snapshot: Record<string, string>; missing: string[]; unfit: string[] } {
  let patch: JsonObject = {};
  const next: Record<string, string> = {};
  const missing: string[] = [];
  const unfit: string[] = [];
  for (const path of [...connected].sort()) {
    if (!isSourcePath(sourceId, path)) continue;
    // The leaf after `<kind>.<id>.`.
    const leaf = path.split('.').slice(2).join('.');
    const cell = content.leaves[leaf];
    // A row gone from the tab, or a cell its field cannot hold ("abc" for a score), writes nothing
    // and is reported: the field keeps its last good value, as after a failed read. What is
    // written is the field's own form of the cell ("TRUE" is "1" for a toggle).
    const value = cell === undefined ? null : accept(path, cell);
    if (value === null) {
      (cell === undefined ? missing : unfit).push(leaf);
      if (snapshot[path] !== undefined) next[path] = snapshot[path];
      continue;
    }
    next[path] = value;
    if (snapshot[path] === value) continue;
    const one = patchForPath(path, value);
    if (one) patch = mergePatch(patch, one) as JsonObject;
  }
  return { patch, snapshot: next, missing, unfit };
}

/** The form a field of this kind takes a cell in, or null when it cannot hold it (contentFormats'
 *  `valueFor`, which the data template's importer uses). Empty always clears. */
export const fieldValue: (d: FieldDescriptor, text: string) => string | null = valueFor;

/**
 * Every field connected to one path, across the production's graphics. `fieldsOf` answers a pool
 * graphic's fields as the editor draws them (its library version), or null when it has none. The
 * reader and the Connect review both ask this, so they agree on what a cell becomes.
 */
export function connectedFields(
  bindings: Record<string, Record<string, string>> | undefined,
  path: string,
  fieldsOf: (graphic: string) => FieldDescriptor[] | null,
): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  for (const [graphic, fields] of Object.entries(bindings ?? {})) {
    const ids = Object.keys(fields).filter((fieldId) => fields[fieldId] === path);
    if (ids.length === 0) continue;
    const declared = fieldsOf(graphic) ?? [];
    for (const id of ids) {
      const d = declared.find((f) => f.key === id);
      if (d) out.push(d);
    }
  }
  return out;
}


// ── The reader ────────────────────────────────────────────────────────────────

/** What a source's line says. `reader` is whether THIS page reads it, another tab does, or the
 *  server tick does (published, with every page that could read it closed). */
export interface SheetStatus {
  state: 'waiting' | 'ok' | 'empty' | 'failing' | 'paused';
  reader: 'this' | 'other' | 'server';
  /** The last good read, and the last read that changed what the tab holds (ms). */
  checkedAt: number | null;
  changedAt: number | null;
  /** When reads started failing, and why, with the fix. */
  failingSince: number | null;
  error: string | null;
  fix: string | null;
  /** Reads missed in a row; three make the data stale until the next good read. */
  missed: number;
  stale: boolean;
  /** Rows the last good read could not use, or connected rows it no longer carries. */
  problems: string[];
  /** Published only: whether the server reads this source once every page is closed. Absent
   *  when unpublished, where nothing reads with the page closed. */
  closedPage?: boolean;
}

/** What a reader keeps between reads, wherever its lease lives. */
export interface SheetReadState {
  /** Connected path -> the text last written there. */
  snapshot: Record<string, string>;
  /** The tab content's fingerprint, for "last changed". */
  content: string | null;
  status: SheetStatus;
}

/** One source's claim and memory in this browser, shared by its tabs. */
export interface SheetLease extends SheetReadState {
  owner: string;
  /** A new claim's id: renewing keeps it, a handover changes it. */
  claim: string;
  until: number;
  /** Which tree the snapshot was written into: an unpublished tree, or a published slug's. */
  world: string;
}

/**
 * Where a source's lease and read state live, and the one road its reads write by: this
 * browser's storage while unpublished, the published row once published (migration 0097, through
 * control/hostedControl.ts), so the browser readers and the server tick share one lease.
 */
export interface SheetLeaseDoor {
  /** Take or renew the lease. `held` false: another reader has it, and this is what it says. */
  claim: (claim: string | null) => Promise<
    | { held: true; claim: string; state: SheetReadState; paused?: boolean }
    | { held: false; status: SheetStatus | null; reader: 'other' | 'server' }
  >;
  /**
   * Write a read's changed paths (text by path) and keep `next`, under the claim, in one step.
   * `false`: the claim moved, or the source was paused or let go, and nothing was written or kept.
   * A path the destination refused keeps its earlier snapshot.
   */
  settle: (claim: string, writes: Record<string, string>, next: SheetReadState) => Promise<boolean>;
  /** Let the lease go, so another reader takes over at once. */
  release: () => void;
}

export interface SheetReaderIo {
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
  fetch: SheetFetch;
  /** The browser's shared lease storage, keyed per production and source (unpublished). */
  readLease: (key: string) => SheetLease | null;
  /** False when the storage refused the write (full, or unavailable). */
  writeLease: (key: string, lease: SheetLease) => boolean | void;
  /** The published row's lease (control/hostedControl.ts `publishedLeaseDoor`): when given, the
   *  storage above is not used. */
  door?: SheetLeaseDoor;
}

export interface SheetReaderOptions {
  /** Unique per production and source: the lease's key. */
  key: string;
  sourceId: string;
  /** The tab a Sheet reader reads (absent when `read` is given). */
  link?: SheetLink;
  /** One read of another kind of source, in a Sheet read's form (control/feedSource.ts). */
  read?: (signal: AbortSignal) => Promise<SheetRead>;
  /** How often it reads (SHEET_READ_MS), and how long one read may take (SHEET_TIMEOUT_MS). */
  everyMs?: number;
  timeoutMs?: number;
  /** How often the lease is renewed between reads (everyMs): a published row holds a lease at most
   *  a minute (0097), so a source read every 5 minutes renews it in between. The lease lasts three
   *  renewals, as a Sheet's lasts three reads. */
  renewMs?: number;
  shape: SheetShape;
  /** This page, among the browser's tabs. */
  tab: string;
  /** The tree this page writes: switching it starts a fresh snapshot. */
  world: string;
  io: SheetReaderIo;
  /** The connected paths now: read at every read, so a new connection is written at once. */
  connected: () => ReadonlySet<string>;
  /** The text in the form the fields connected to a path take it, or null when one cannot hold
   *  it; absent, every text is written as it is. */
  accept?: (path: string, text: string) => string | null;
  paused: () => boolean;
  /** The writer behind this browser's own lease (productionDataSession.applySourcePatch): true when
   *  the write landed, false when nothing did, or the paths it left out while the rest landed. */
  write: (patch: JsonObject) => Promise<boolean | string[]>;
  /** The message-candidate consumer: rows only, and no way to write. */
  inbox?: (rows: readonly (readonly string[])[]) => void;
  onStatus: (status: SheetStatus) => void;
}

export interface SheetReader {
  /** Read now rather than at the next interval (Connect, Resume). */
  poke: () => void;
  /** Stop for good: an answer still in flight writes nothing, and the lease is let go. */
  stop: () => void;
  /** Let the lease go now and claim it again at the next read: the page is going away (a reload
   *  or a closed tab runs no cleanup), so the next page or the tick need not wait out the lease. */
  release: () => void;
  /** This page holds the source's lease as of its last read (the inbox consumer's fence). */
  holds: () => boolean;
}

export const initialStatus = (reader: SheetStatus['reader']): SheetStatus => ({
  state: 'waiting',
  reader,
  checkedAt: null,
  changedAt: null,
  failingSince: null,
  error: null,
  fix: null,
  missed: 0,
  stale: false,
  problems: [],
});

/** A missed read: the values hold, and three in a row mark the data stale (sheet AC-6). */
export function missedStatus(before: SheetStatus, read: { error: string; fix: string }, now: number, reader: SheetStatus['reader']): SheetStatus {
  const missed = before.missed + 1;
  return {
    ...before,
    state: 'failing',
    reader,
    failingSince: before.failingSince ?? now,
    error: read.error,
    fix: read.fix,
    missed,
    stale: missed >= SHEET_STALE_MISSES,
  };
}

/** A good read: checked now, changed now only when the tab's content moved, and what it could
 *  not use said plainly. Clears stale, even when nothing changed. */
export function readStatus(
  before: SheetReadState,
  content: SheetContent,
  writes: Pick<ReturnType<typeof sheetWrites>, 'missing' | 'unfit'>,
  now: number,
  reader: SheetStatus['reader'],
): { status: SheetStatus; fingerprint: string } {
  const fingerprint = JSON.stringify(content.leaves);
  const problems = [
    ...content.problems,
    ...writes.missing.filter((leaf) => !content.doubled?.includes(leaf)).map((leaf) => `${leaf.replace(/^values\./, '')} is missing from the tab, so it keeps its value`),
    ...writes.unfit.map((leaf) => `${leaf.replace(/^values\./, '')} holds “${content.leaves[leaf]}”, which not every field connected to it can show, so it keeps its value`),
  ];
  const status: SheetStatus = {
    ...initialStatus(reader),
    state: content.empty ? 'empty' : 'ok',
    checkedAt: now,
    changedAt: before.content === fingerprint ? before.status.changedAt ?? now : now,
    problems,
    ...(before.status.closedPage === undefined ? {} : { closedPage: before.status.closedPage }),
  };
  return { status, fingerprint };
}

/**
 * What one read comes to, for the browser reader and the server tick alike: the state to keep and
 * the changed paths as text by path. A failed read keeps the snapshot and counts a miss.
 */
export function nextReadState(
  held: SheetReadState,
  result: SheetRead,
  source: { sourceId: string; shape: SheetShape; connected: ReadonlySet<string>; accept?: (path: string, text: string) => string | null },
  now: number,
  reader: SheetStatus['reader'],
): { next: SheetReadState; writes: Record<string, string> } {
  if (!result.ok) return { next: { ...held, status: missedStatus(held.status, result, now, reader) }, writes: {} };
  const content = sheetContent(source.shape, result.rows);
  const written = sheetWrites(source.sourceId, content, source.connected, held.snapshot, source.accept);
  const { status, fingerprint } = readStatus(held, content, written, now, reader);
  const writes: Record<string, string> = {};
  for (const [path, text] of Object.entries(written.snapshot)) if (held.snapshot[path] !== text) writes[path] = text;
  return { next: { snapshot: written.snapshot, content: fingerprint, status }, writes };
}

/** Text by path as one merge patch. */
function patchOf(writes: Record<string, string>): JsonObject {
  let patch: JsonObject = {};
  for (const [path, text] of Object.entries(writes)) {
    const one = patchForPath(path, text);
    if (one) patch = mergePatch(patch, one) as JsonObject;
  }
  return patch;
}

let claims = 0;

/** A reader's lease: three of its renewals (its reads, for a Sheet), so a closed tab hands over soon. */
export const leaseOf = (o: Pick<SheetReaderOptions, 'everyMs' | 'renewMs'>): number => 3 * (o.renewMs ?? o.everyMs ?? SHEET_READ_MS);

/** The unpublished lease: this browser's storage, shared by its tabs. */
function localLeaseDoor(o: SheetReaderOptions, alive: () => boolean): SheetLeaseDoor {
  const { io } = o;
  // When the browser's storage refuses the lease (full, or private mode), this page keeps its lease
  // in memory and goes on reading: an open page never stands down silently. Tabs then cannot see
  // each other's lease, so two such tabs may both read; their writes are the same values.
  let memory: SheetLease | null = null;
  const readLease = (): SheetLease | null => memory ?? io.readLease(o.key);
  const writeLease = (lease: SheetLease): void => {
    if (memory || io.writeLease(o.key, lease) === false) memory = lease;
  };
  /** Still ours, unstopped, with this claim. */
  const ours = (claimId: string): SheetLease | null => {
    if (!alive()) return null;
    const lease = readLease();
    return lease && lease.owner === o.tab && lease.claim === claimId && lease.until > io.now() ? lease : null;
  };
  return {
    claim: async () => {
      const now = io.now();
      const held = readLease();
      if (held && held.owner !== o.tab && held.until > now) return { held: false, status: held.status, reader: 'other' };
      const mine = held?.owner === o.tab && held.until > now;
      const fresh = held && held.world === o.world;
      const lease: SheetLease = {
        owner: o.tab,
        claim: mine ? held.claim : `${o.tab}:${(claims += 1)}`,
        until: now + leaseOf(o),
        world: o.world,
        snapshot: fresh ? held.snapshot : {},
        content: fresh ? held.content : null,
        status: { ...(fresh ? held.status : initialStatus('this')), reader: 'this' },
      };
      writeLease(lease);
      // Two tabs claiming in one moment: the storage holds one of them, and the other stands down.
      if (readLease()?.claim !== lease.claim) return { held: false, status: readLease()?.status ?? null, reader: 'other' };
      return { held: true, claim: lease.claim, state: lease };
    },
    settle: async (claimId, writes, next) => {
      let held = ours(claimId);
      if (!held) return false;
      let snapshot = next.snapshot;
      if (Object.keys(writes).length > 0) {
        const landed = await o.write(patchOf(writes));
        held = ours(claimId);
        if (!held) return false;
        // What did not land is tried again: the snapshot keeps what was there before for it.
        if (!landed) snapshot = { ...held.snapshot };
        else if (Array.isArray(landed)) {
          snapshot = { ...snapshot };
          for (const path of landed) {
            if (held.snapshot[path] === undefined) delete snapshot[path];
            else snapshot[path] = held.snapshot[path];
          }
        }
      }
      writeLease({ ...held, until: io.now() + leaseOf(o), ...next, snapshot });
      return true;
    },
    release: () => {
      const lease = readLease();
      if (lease?.owner === o.tab) writeLease({ ...lease, until: 0 });
    },
  };
}

export function createSheetReader(o: SheetReaderOptions): SheetReader {
  const { io } = o;
  const every = o.everyMs ?? SHEET_READ_MS;
  const renew = o.renewMs ?? every;
  /** When this page last read, and whether the next turn must read whatever the time (Connect, Resume). */
  let lastRead: number | null = null;
  let forced = false;
  let stopped = false;
  let timer: unknown = null;
  let busy = false;
  let last: string | null = null;
  let door = io.door ?? localLeaseDoor(o, () => !stopped);
  /** The claim this page holds, as far as it knows: renewed at every read. */
  let claimId: string | null = null;
  /** What the line last said, for a lease the door could not reach. */
  let shown: SheetStatus | null = null;

  const report = (status: SheetStatus) => {
    const text = JSON.stringify(status);
    shown = status;
    if (text === last) return;
    last = text;
    o.onStatus(status);
  };

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer !== null) io.clearTimer(timer);
    timer = io.setTimer(() => {
      timer = null;
      void tick();
    }, ms);
  };

  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await read();
    } finally {
      busy = false;
    }
  };

  const read = async () => {
    const started = io.now();
    const answer = await door.claim(claimId).catch((error: Error) => error);
    if (stopped) return;
    if (answer instanceof Error && (answer as { code?: string }).code === 'no_lease') {
      // An instance that has not run migration 0097 (or holds it back while outputs are live):
      // this browser's own lease and the operator door, as before published leases existed.
      door = localLeaseDoor(o, () => !stopped);
      claimId = null;
      schedule(0);
      return;
    }
    if (answer instanceof Error) {
      // The published lease could not be reached (offline, or an instance behind on its
      // migrations): a missed read, said as one, so the line goes stale rather than silent.
      claimId = null;
      const fix = 'Reading carries on by itself.';
      report(missedStatus(shown ?? initialStatus('this'), { error: `the published production did not answer (${answer.message})`, fix }, io.now(), 'this'));
      schedule(renew);
      return;
    }
    if (!answer.held) {
      claimId = null;
      report({ ...(answer.status ?? initialStatus(answer.reader)), reader: answer.reader });
      schedule(renew);
      return;
    }
    claimId = answer.claim;
    const held = answer.state;
    // Paused here, or on the published row by another page.
    if (o.paused() || answer.paused) {
      // Paused keeps the snapshot as it was, so Resume writes only what changed meanwhile.
      const status: SheetStatus = { ...held.status, state: 'paused', reader: 'this' };
      await door.settle(answer.claim, {}, { ...held, status }).catch(() => false);
      if (!stopped) report(status);
      schedule(renew);
      return;
    }
    // Between reads, the claim above has only renewed the lease.
    if (!forced && lastRead !== null && io.now() - lastRead < every) {
      schedule(Math.min(renew, lastRead + every - io.now()));
      return;
    }
    forced = false;
    lastRead = started;
    const abort = new AbortController();
    const cut = io.setTimer(() => abort.abort(), o.timeoutMs ?? SHEET_TIMEOUT_MS);
    let result: SheetRead;
    try {
      result = o.read ? await o.read(abort.signal) : await readSheet(io.fetch, o.link!, abort.signal);
    } finally {
      io.clearTimer(cut);
    }
    // Stopped or paused while the read was in flight: this answer writes nothing. A handover
    // meanwhile is the door's to find, in the same step as the write.
    if (stopped) return;
    if (o.paused()) {
      schedule(0);
      return;
    }
    const { next, writes } = nextReadState(held, result, { ...o, connected: o.connected() }, io.now(), 'this');
    const kept = await door.settle(answer.claim, writes, next).catch(() => false);
    if (stopped) return;
    if (!kept) {
      // Handed over, disconnected or let go meanwhile: claim again at the next read, and show the
      // owner's status then rather than inventing one now.
      claimId = null;
      schedule(renew);
      return;
    }
    // Only the lease's holder feeds the inbox: an old owner's late read would put back what the
    // new owner's newer read took out.
    if (result.ok && o.inbox) o.inbox(result.rows.map((r) => Object.freeze([...r])));
    report(next.status);
    schedule(Math.max(0, started + renew - io.now()));
  };

  schedule(0);
  return {
    poke: () => {
      forced = true;
      schedule(0);
    },
    holds: () => !stopped && claimId !== null,
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (timer !== null) io.clearTimer(timer);
      // Let the lease go at once, so another open tab, or the tick, takes over at its next read.
      door.release();
    },
    release: () => {
      if (stopped) return;
      claimId = null;
      door.release();
    },
  };
}

/**
 * ONE WRITE AT A TIME, THE NEWEST VALUE LAST: how a page keeps a published row's sources in step
 * with its own (ProductionPage, data-sources C2). A value pushed while a write is in flight waits
 * for it and replaces any value still waiting, so a slow Pause can never land after the Resume
 * that followed it. A failed write is tried again after `retryMs`, unless a newer value is waiting.
 */
export function latestWriter<T>(
  write: (value: T) => Promise<void>,
  io: Pick<SheetReaderIo, 'setTimer' | 'clearTimer'> & { retryMs: number; failed: (error: Error) => void },
): { push: (value: T) => void; stop: () => void } {
  let waiting: { value: T } | null = null;
  let busy = false;
  let stopped = false;
  let timer: unknown = null;
  const pump = () => {
    if (busy || stopped || !waiting) return;
    const { value } = waiting;
    waiting = null;
    busy = true;
    write(value).then(
      () => {
        busy = false;
        pump();
      },
      (error: Error) => {
        busy = false;
        if (stopped) return;
        waiting ??= { value };
        io.failed(error);
        if (timer !== null) io.clearTimer(timer);
        timer = io.setTimer(() => {
          timer = null;
          pump();
        }, io.retryMs);
      },
    );
  };
  return {
    push: (value) => {
      waiting = { value };
      pump();
    },
    stop: () => {
      stopped = true;
      if (timer !== null) io.clearTimer(timer);
    },
  };
}

// ── The page's view of its readers ────────────────────────────────────────────

/** Each source's status, held outside React so a read every 5 s re-renders only the lines that
 *  show it, never the page. `poke` asks a source's reader to read now. */
export interface SourceStatusStore {
  get: (sourceId: string) => SheetStatus | undefined;
  set: (sourceId: string, status: SheetStatus | undefined) => void;
  subscribe: (listener: () => void) => () => void;
  poke: (sourceId: string) => void;
  /** The page's readers answer pokes through this. */
  onPoke: (handler: (sourceId: string) => void) => void;
}

export function createSourceStatusStore(): SourceStatusStore {
  const statuses = new Map<string, SheetStatus>();
  const listeners = new Set<() => void>();
  let poker: (sourceId: string) => void = () => {};
  return {
    get: (id) => statuses.get(id),
    set: (id, status) => {
      if (status) statuses.set(id, status);
      else statuses.delete(id);
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    poke: (id) => poker(id),
    onPoke: (handler) => {
      poker = handler;
    },
  };
}
