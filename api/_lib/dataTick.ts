// THE SERVER TICK (docs/work-specs/data-sources/spec.md, phase C2; sheet-data-flow AC-4, AC-5):
// once a minute, read the published Sheet sources no open page is reading, and write what changed
// through `control_data_apply` with the label 'sheet' (migration 0097). Published news feeds
// (C4, migration 0099) are read the same way, through the feed reader's shared cache
// (api/_lib/feedFetch.ts), so a feed is still fetched at most once every 5 minutes; their rows
// carry the same label, which names the server tick rather than the kind of source. A helper, not a function:
// the route is `/api/data/tick`, a guarded segment of api/data/[...path].ts, called by the Vercel
// cron in vercel.json with the project's `Authorization: Bearer <CRON_SECRET>`.
//
// It shares the browser reader's core (src/control/sheetSource.ts: the read, the adapters, the
// diff against the shared snapshot, the status rules) and the browser's lease, so the two never
// both read one source, and an unchanged cell after a handover never undoes an operator's
// override. Only the field kinds are restated (`descriptorsOf`), because the panel's own
// converter lives in a client module.
//
// THE COST GUARDS, each from evidence/tick-cost-estimate.md (its ceiling, $55-80 a month if every
// tick burned its 30 s, is above the $20 credit, so these are what keep it away): every read keeps
// the 10-second timeout (SHEET_TIMEOUT_MS) and at most READ_BYTES of body, no read starts after
// NO_NEW_READ_MS, reads run a few at a time, and vercel.json caps the function at 30 s. The switch
// (systemSettings.ts `dataTickOn`) expires within 48 hours.

import {
  SHEET_TIMEOUT_MS,
  connectedFields,
  initialStatus,
  nextReadState,
  pathValue,
  readSheet,
  sourcePaths,
  type SheetFetch,
  type SheetReadState,
  type SheetShape,
  type SheetStatus,
} from '../../src/control/sheetSource.js';
import { feedRead, type FeedRouteAnswer } from '../../src/control/feedSource.js';
import type { FieldDescriptor, FieldKind } from '../../src/model/fieldModel.js';

/** No read starts this long after the tick began (the record: 10 s reads, a 30 s function). */
export const NO_NEW_READ_MS = 20_000;
/** Every read is over by then, so its write, its release and the run's record still fit inside
 *  `maxDuration` 30: a read started late gets less than its 10 seconds. */
export const READS_END_MS = 26_000;
/** The tick's own lease on a source: longer than any one read and write, and let go at the end. */
export const TICK_LEASE_MS = 30_000;
/** Reads in flight at once. */
export const TICK_PARALLEL = 4;
/** Sources one tick takes on, least recently read first. */
export const TICK_SOURCES = 50;
/** A tab's CSV larger than this is not read (keeps parsing small, the record's advice). */
export const READ_BYTES = 1_000_000;
/** The lease owner the browser readers see as "the server". */
export const TICK_OWNER = 'tick';

/** One published source the tick may read (control_data_tick_due). */
export interface DueSource {
  slug: string;
  source:
    | { id: string; kind: 'sheet'; config: { sheetId: string; gid: string | null; published?: boolean; shape: SheetShape } }
    | { id: string; kind: 'feed'; config: { url: string } };
  bindings: Record<string, Record<string, string>>;
  /** Pool graphic name -> its published fields (the panel's `fields`). */
  fields: Record<string, PanelField[]>;
}

export interface PanelField {
  field: string;
  ftype?: string;
  items?: { text: string; value: string }[];
  /** A field a foreign OGraf manifest declares (E1.2a, src/control/hostedControl.ts `buildPanelSpec`). */
  typed?: unknown;
}

export type LeaseAnswer = { ok: boolean; claim?: string; paused?: boolean; snapshot?: Record<string, string>; content?: string | null; status?: Partial<SheetStatus> | null };
export type CommitAnswer = { ok: boolean; moved?: boolean; paused?: boolean };

/** Everything the tick touches, so scripts/data-tick.test.mjs runs it with fakes. */
export interface TickIo {
  now: () => number;
  due: (limit: number) => Promise<DueSource[]>;
  lease: (slug: string, source: string, claim: string | null, ttlMs: number) => Promise<LeaseAnswer>;
  commit: (slug: string, source: string, claim: string, writes: Record<string, string>, state: SheetReadState) => Promise<CommitAnswer>;
  record: (startedAt: number, durationMs: number, sources: TickOutcome[]) => Promise<void>;
  fetch: SheetFetch;
  /** One read of a feed through the shared cache (api/_lib/feedFetch.ts `readFeed`). */
  feed: (address: string, signal: AbortSignal) => Promise<FeedRouteAnswer>;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
}

export interface TickOutcome {
  slug: string;
  source: string;
  /** read: written; unchanged: read, nothing to write; failed: the read missed; leased: a page
   *  took it first; moved: the claim moved or the source was paused before the write; late: the
   *  20-second cut-off came first; error: the database refused. */
  outcome: 'read' | 'unchanged' | 'failed' | 'leased' | 'moved' | 'late' | 'error';
  ms?: number;
}

/** kindForField (src/control/controlModel.ts), as far as `valueFor` reads it. No `hidden`: the
 *  browser reader takes a graphic's fields as fieldDescriptors draws them, without hidden ones
 *  (scripts/data-tick.test.mjs pins the two together). */
const KINDS: Record<string, FieldKind> = {
  textfield: 'text',
  textarea: 'lines',
  number: 'number',
  filelist: 'image',
  dropdown: 'select',
  checkbox: 'toggle',
  color: 'color',
};

/** A published graphic's fields as the reader's descriptors. */
export function descriptorsOf(fields: PanelField[] | undefined): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  for (const f of fields ?? []) {
    const kind = f.ftype ? KINDS[f.ftype] : undefined;
    if (!kind || typeof f.field !== 'string') continue;
    out.push({
      key: f.field,
      label: f.field,
      kind,
      defaultValue: '',
      options: f.items?.map((it) => ({ label: it.text, value: it.value })),
      ...(f.typed === true ? { typed: true as const } : {}),
    });
  }
  return out;
}

/** The status a row holds, or a fresh one when it holds none yet. */
function rowState(answer: LeaseAnswer): SheetReadState {
  const status = answer.status && typeof answer.status.state === 'string' ? (answer.status as SheetStatus) : initialStatus('server');
  return {
    snapshot: answer.snapshot && typeof answer.snapshot === 'object' ? answer.snapshot : {},
    content: typeof answer.content === 'string' ? answer.content : null,
    status: { ...initialStatus('server'), ...status, reader: 'server', closedPage: true },
  };
}

/** A fetch that stops reading past `READ_BYTES`, so an oversized tab cannot burn the tick. */
export function cappedFetch(fetcher: typeof fetch): SheetFetch {
  return async (url, init) => {
    const response = await fetcher(url, { signal: init.signal, redirect: 'follow' });
    return {
      ok: response.ok,
      status: response.status,
      text: async () => {
        const reader = response.body?.getReader();
        if (!reader) return '';
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > READ_BYTES) {
            await reader.cancel();
            throw Object.assign(new Error('too large'), { code: 'too_large' });
          }
          chunks.push(value);
        }
        const all = new Uint8Array(size);
        let at = 0;
        for (const chunk of chunks) {
          all.set(chunk, at);
          at += chunk.byteLength;
        }
        return new TextDecoder().decode(all);
      },
    };
  };
}

/** Read one source under the tick's lease, write what changed, keep the state, let go. */
async function readOne(io: TickIo, due: DueSource, startedAt: number): Promise<TickOutcome> {
  const at = io.now();
  const base = { slug: due.slug, source: due.source.id };
  const answer = await io.lease(due.slug, due.source.id, null, TICK_LEASE_MS);
  if (!answer.ok || !answer.claim) return { ...base, outcome: 'leased' };
  const claim = answer.claim;
  try {
    // Paused on the row since the list was read.
    if (answer.paused) return { ...base, outcome: 'moved' };
    const held = rowState(answer);
    const abort = new AbortController();
    const cut = io.setTimer(() => abort.abort(), Math.max(0, Math.min(SHEET_TIMEOUT_MS, startedAt + READS_END_MS - io.now())));
    let result;
    try {
      if (due.source.kind === 'feed') {
        result = feedRead(await io.feed(due.source.config.url, abort.signal));
      } else {
        const { sheetId, gid, published } = due.source.config;
        result = await readSheet(io.fetch, { sheetId, gid, ...(published ? { published } : {}) }, abort.signal);
      }
    } finally {
      io.clearTimer(cut);
    }
    const connected = new Set(sourcePaths(due.bindings, due.source.id).map((p) => p.path));
    const descriptors = new Map<string, FieldDescriptor[]>();
    const fieldsOf = (graphic: string) => {
      if (!due.fields[graphic]) return null;
      if (!descriptors.has(graphic)) descriptors.set(graphic, descriptorsOf(due.fields[graphic]));
      return descriptors.get(graphic)!;
    };
    const accept = (path: string, text: string) => pathValue(connectedFields(due.bindings, path, fieldsOf), text);
    const shape = due.source.kind === 'feed' ? 'lines' : due.source.config.shape;
    const { next, writes } = nextReadState(held, result, { sourceId: due.source.id, shape, connected, accept }, io.now(), 'server');
    const kept = await io.commit(due.slug, due.source.id, claim, writes, next);
    const ms = io.now() - at;
    if (!kept.ok) return { ...base, outcome: 'moved', ms };
    if (!result.ok) return { ...base, outcome: 'failed', ms };
    return { ...base, outcome: Object.keys(writes).length > 0 ? 'read' : 'unchanged', ms };
  } finally {
    await io.lease(due.slug, due.source.id, claim, 0).catch(() => {});
  }
}

/**
 * One tick: the due sources, read a few at a time, none started after NO_NEW_READ_MS, and the
 * run recorded with its start, wall-clock duration and what each source came to.
 */
export async function runDataTick(io: TickIo): Promise<{ startedAt: number; durationMs: number; sources: TickOutcome[] }> {
  const startedAt = io.now();
  const queue = await io.due(TICK_SOURCES);
  const outcomes: TickOutcome[] = [];
  const worker = async () => {
    for (let due = queue.shift(); due; due = queue.shift()) {
      if (io.now() - startedAt >= NO_NEW_READ_MS) {
        outcomes.push({ slug: due.slug, source: due.source.id, outcome: 'late' });
        continue;
      }
      try {
        outcomes.push(await readOne(io, due, startedAt));
      } catch (error) {
        console.error('Data tick read failed:', error instanceof Error ? error.message : error);
        outcomes.push({ slug: due.slug, source: due.source.id, outcome: 'error' });
      }
    }
  };
  await Promise.all(Array.from({ length: TICK_PARALLEL }, worker));
  const durationMs = io.now() - startedAt;
  await io.record(startedAt, durationMs, outcomes);
  return { startedAt, durationMs, sources: outcomes };
}

/** The exact Bearer the project's cron sends, checked as api/render/cleanup.ts does. */
export function cronAuthorized(req: Request, secret = process.env.CRON_SECRET): boolean {
  const expected = (secret ?? '').trim();
  return expected !== '' && (req.headers.get('authorization') ?? '') === `Bearer ${expected}`;
}
