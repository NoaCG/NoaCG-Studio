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

import { fillList, listFormatFor, type FilledRow, type ListAdapter, type ListFormat } from './contentFormats.ts';
import { parseDelimited } from '../model/csv.ts';
import { mergePatch, patchForPath, type JsonObject, type OfferedValue } from '../model/productionData.ts';
import type { SavedGraphic } from '../model/packets';

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
  const published = /^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{10,})\//.exec(url.pathname + '/');
  const shared = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/.exec(url.pathname);
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
export function sheetShapeFor(graphic: Pick<SavedGraphic, 'type'> & { template: { js?: string } }): SheetShape {
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
  const labels = Object.fromEntries(listLeaves(shape).map((l) => [l.leaf, l.label]));
  return { leaves: fill.values, labels, preview: fill.rows, problems: [], empty, byFieldId: false };
}

/**
 * What a source offers a graphic's mapping review: each leaf's path, label and sample, and the
 * field it was made for when the source says so (a list adapter's own field, a Field ID).
 */
export function offeredValues(sourceId: string, shape: SheetShape, content: SheetContent): OfferedValue[] {
  const prefix = sourcePrefix(sourceId);
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
  for (const [key, { rows: at, value, label }] of seen) {
    if (at.length > 1) {
      problems.push(`${key} is on rows ${at.join(' and ')}, so it keeps its value`);
      continue;
    }
    leaves[`values.${key}`] = value;
    labels[`values.${key}`] = label;
  }
  const preview = Object.keys(leaves).map((leaf) => ({ text: `${labels[leaf]}: ${leaves[leaf]}` }));
  return { leaves, labels, preview, problems, byFieldId: template };
}

/** The tree prefix a source writes under. */
export const sourcePrefix = (sourceId: string): string => `sheet.${sourceId}`;

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
): { patch: JsonObject; snapshot: Record<string, string>; missing: string[] } {
  const prefix = `${sourcePrefix(sourceId)}.`;
  let patch: JsonObject = {};
  const next: Record<string, string> = {};
  const missing: string[] = [];
  for (const path of [...connected].sort()) {
    if (!path.startsWith(prefix)) continue;
    const value = content.leaves[path.slice(prefix.length)];
    if (value === undefined) {
      missing.push(path.slice(prefix.length));
      if (snapshot[path] !== undefined) next[path] = snapshot[path];
      continue;
    }
    next[path] = value;
    if (snapshot[path] === value) continue;
    const one = patchForPath(path, value);
    if (one) patch = mergePatch(patch, one) as JsonObject;
  }
  return { patch, snapshot: next, missing };
}

// ── The reader ────────────────────────────────────────────────────────────────

/** What a source's line says. `reader` is whether THIS page reads it or another tab does. */
export interface SheetStatus {
  state: 'waiting' | 'ok' | 'empty' | 'failing' | 'paused';
  reader: 'this' | 'other';
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
}

/** One source's claim and memory in this browser, shared by its tabs. */
export interface SheetLease {
  owner: string;
  /** A new claim's id: renewing keeps it, a handover changes it. */
  claim: string;
  until: number;
  /** Which tree the snapshot was written into: an unpublished tree, or a published slug's. */
  world: string;
  /** Connected path -> the text last written there. */
  snapshot: Record<string, string>;
  /** The tab content's fingerprint, for "last changed". */
  content: string | null;
  status: SheetStatus;
}

export interface SheetReaderIo {
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
  fetch: SheetFetch;
  /** The browser's shared lease storage, keyed per production and source. */
  readLease: (key: string) => SheetLease | null;
  writeLease: (key: string, lease: SheetLease) => void;
}

export interface SheetReaderOptions {
  /** Unique per production and source: the lease's key. */
  key: string;
  sourceId: string;
  link: SheetLink;
  shape: SheetShape;
  /** This page, among the browser's tabs. */
  tab: string;
  /** The tree this page writes: switching it starts a fresh snapshot. */
  world: string;
  io: SheetReaderIo;
  /** The connected paths now: read at every read, so a new connection is written at once. */
  connected: () => ReadonlySet<string>;
  paused: () => boolean;
  /** The writer (productionDataSession.applySourcePatch); false when the write did not land. */
  write: (patch: JsonObject) => Promise<boolean>;
  /** The message-candidate consumer: rows only, and no way to write. */
  inbox?: (rows: readonly (readonly string[])[]) => void;
  onStatus: (status: SheetStatus) => void;
}

export interface SheetReader {
  /** Read now rather than at the next interval (Connect, Resume). */
  poke: () => void;
  /** Stop for good: an answer still in flight writes nothing, and the lease is let go. */
  stop: () => void;
}

const initialStatus = (reader: SheetStatus['reader']): SheetStatus => ({
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

let claims = 0;

export function createSheetReader(o: SheetReaderOptions): SheetReader {
  const { io } = o;
  let stopped = false;
  let timer: unknown = null;
  let busy = false;
  let last: string | null = null;

  const report = (status: SheetStatus) => {
    const text = JSON.stringify(status);
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

  /** This tab's claim on the source, taken or renewed; null when another tab holds it. */
  const claim = (): SheetLease | null => {
    const now = io.now();
    const held = io.readLease(o.key);
    if (held && held.owner !== o.tab && held.until > now) return null;
    const mine = held?.owner === o.tab && held.until > now;
    const fresh = held && held.world === o.world;
    const lease: SheetLease = {
      owner: o.tab,
      claim: mine ? held.claim : `${o.tab}:${(claims += 1)}`,
      until: now + SHEET_LEASE_MS,
      world: o.world,
      snapshot: fresh ? held.snapshot : {},
      content: fresh ? held.content : null,
      status: { ...(fresh ? held.status : initialStatus('this')), reader: 'this' },
    };
    io.writeLease(o.key, lease);
    // Two tabs claiming in one moment: the storage holds one of them, and the other stands down.
    return io.readLease(o.key)?.claim === lease.claim ? lease : null;
  };

  /** Still ours, unstopped, with the claim the read began under. */
  const ours = (claimId: string): SheetLease | null => {
    if (stopped) return null;
    const lease = io.readLease(o.key);
    return lease && lease.owner === o.tab && lease.claim === claimId && lease.until > io.now() ? lease : null;
  };

  const tick = async () => {
    if (stopped || busy) return;
    const started = io.now();
    const lease = claim();
    if (!lease) {
      const held = io.readLease(o.key);
      report({ ...(held?.status ?? initialStatus('other')), reader: 'other' });
      schedule(SHEET_READ_MS);
      return;
    }
    if (o.paused()) {
      // Paused keeps the snapshot as it was, so Resume writes only what changed meanwhile.
      const status: SheetStatus = { ...lease.status, state: 'paused', reader: 'this' };
      io.writeLease(o.key, { ...lease, status });
      report(status);
      schedule(SHEET_READ_MS);
      return;
    }
    busy = true;
    const abort = new AbortController();
    const cut = io.setTimer(() => abort.abort(), SHEET_TIMEOUT_MS);
    let read: SheetRead;
    try {
      read = await readSheet(io.fetch, o.link, abort.signal);
    } finally {
      io.clearTimer(cut);
      busy = false;
    }
    const now = io.now();
    let held = ours(lease.claim);
    if (!held) return; // handed over, disconnected or stopped meanwhile: this answer writes nothing
    if (!read.ok) {
      const missed = held.status.missed + 1;
      const status: SheetStatus = {
        ...held.status,
        state: 'failing',
        reader: 'this',
        failingSince: held.status.failingSince ?? now,
        error: read.error,
        fix: read.fix,
        missed,
        stale: missed >= SHEET_STALE_MISSES,
      };
      io.writeLease(o.key, { ...held, until: now + SHEET_LEASE_MS, status });
      report(status);
      schedule(Math.max(0, started + SHEET_READ_MS - now));
      return;
    }
    if (o.inbox) o.inbox(read.rows.map((r) => Object.freeze([...r])));
    const content = sheetContent(o.shape, read.rows);
    const fingerprint = JSON.stringify(content.leaves);
    const writes = sheetWrites(o.sourceId, content, o.connected(), held.snapshot);
    let snapshot = writes.snapshot;
    if (Object.keys(writes.patch).length > 0) {
      const landed = await o.write(writes.patch);
      held = ours(lease.claim);
      if (!held) return;
      // A write that did not land is tried again: the snapshot keeps what was there before.
      if (!landed) snapshot = { ...held.snapshot };
    }
    const problems = [...content.problems, ...writes.missing.map((leaf) => `${leaf.replace(/^values\./, '')} is missing from the tab, so it keeps its value`)];
    const status: SheetStatus = {
      state: content.empty ? 'empty' : 'ok',
      reader: 'this',
      checkedAt: now,
      changedAt: held.content === fingerprint ? held.status.changedAt ?? now : now,
      failingSince: null,
      error: null,
      fix: null,
      missed: 0,
      stale: false,
      problems,
    };
    io.writeLease(o.key, { ...held, until: io.now() + SHEET_LEASE_MS, snapshot, content: fingerprint, status });
    report(status);
    schedule(Math.max(0, started + SHEET_READ_MS - io.now()));
  };

  schedule(0);
  return {
    poke: () => schedule(0),
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (timer !== null) io.clearTimer(timer);
      // Let the lease go at once, so another open tab takes over at its next read.
      const lease = io.readLease(o.key);
      if (lease?.owner === o.tab) io.writeLease(o.key, { ...lease, until: 0 });
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
