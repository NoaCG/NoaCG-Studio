// A MESSAGE SHEET: a Sheet tab whose rows become message candidates (docs/work-specs/data-sources
// spec, phase C3; audience spec, "Identity"; sheet AC-11).
//
// The tab is an ordinary `sheet` source with `inbox: true`, read by the one browser reader under
// its lease (control/sheetSource.ts). The reader hands its rows to the consumer below and nothing
// else: the consumer reaches the inbox through the audience backend's operator door
// (`addCandidates`, at most 100 a call) and `settleImported`, and has no way to write a value or a
// command. A candidate airs only as a cue the operator prepares and Takes.
//
// IDENTITY. A row is the hash of its Name, Message, Source and Reference cells plus an occurrence
// index for identical rows, never its position: reordering changes nothing; a row whose hash is no
// longer in the tab has vanished; a new hash has arrived; an edit is both, and nothing pairs them.
// The source governs unused candidates only: a vanished unused one leaves the inbox, a used one is
// the operator's record and is marked "no longer in the Sheet" (the backend's `settleImported`).
//
// The tab's first row names the columns. Only Name and Message reach a cue (as the candidate's
// author and body); Source and Reference are provenance, shown small and never put on a graphic.

import {
  OPERATOR_SETTLE_MAX,
  addInChunks,
  type AudienceBackend,
  type CandidateInput,
} from './audienceTypes.ts';

/** The headings a message tab may use, matched without case. Message is the one it needs. */
const HEADINGS = {
  name: ['name', 'author', 'from', 'sender', 'handle', 'asked by'],
  message: ['message', 'question', 'comment', 'body', 'text', 'request'],
  source: ['source'],
  reference: ['reference'],
} as const;

/** The starter rows an operator copies into a new tab: the headings and one example. */
export const MESSAGE_SHEET_STARTER = 'Name\tMessage\tSource\tReference\nAna\tWhat time does the second half start?\tWhatsApp\t+358 40 000 0000\n';

/** A message Sheet's source id, the same for the same tab every time it is connected, so removing
 *  and connecting it again reuses its candidates instead of adding every row again. */
export function messageSheetId(sheetId: string, gid: string | null): string {
  return `msg-${rowHash([sheetId, gid ?? ''])}`;
}

/** Every external id of one Sheet source starts with this; the backend settles by it. */
export function sheetMessagePrefix(sourceId: string): string {
  return `sheet:${sourceId}:`;
}

/**
 * A short, stable hash of a row's four cells (cyrb53: 53 bits, so two different rows of one tab
 * share it only by a chance far below anything a person types). Deterministic across browsers and
 * the server, which never computes it: the id is the only thing compared.
 */
export function rowHash(cells: readonly string[]): string {
  const text = cells.join('\u001f');
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export interface SheetMessages {
  /** The tab's candidates in tab order, each with its identity. */
  items: (CandidateInput & { externalId: string })[];
  /** Why the tab gives fewer messages than it holds, or null. */
  problem: string | null;
}

/** A message tab's rows as candidates. `label` is the source's name, for the provenance line. */
export function sheetMessages(sourceId: string, label: string, rows: readonly (readonly string[])[]): SheetMessages {
  const header = (rows[0] ?? []).map((c) => c.trim().toLowerCase());
  const column = (wanted: readonly string[]) => header.findIndex((h) => wanted.includes(h));
  const at = {
    name: column(HEADINGS.name),
    message: column(HEADINGS.message),
    source: column(HEADINGS.source),
    reference: column(HEADINGS.reference),
  };
  if (at.message < 0) {
    return { items: [], problem: 'The first row needs a Message heading (Name, Message, Source, Reference)' };
  }
  const cell = (row: readonly string[], i: number) => (i < 0 ? '' : (row[i] ?? '').trim());
  const prefix = sheetMessagePrefix(sourceId);
  const seen = new Map<string, number>();
  const items: SheetMessages['items'] = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const name = cell(row, at.name);
    const body = cell(row, at.message);
    if (!body) continue;
    if (items.length >= OPERATOR_SETTLE_MAX) {
      skipped += 1;
      continue;
    }
    const source = cell(row, at.source);
    const reference = cell(row, at.reference);
    const hash = rowHash([name, body, source, reference]);
    const occurrence = seen.get(hash) ?? 0;
    seen.set(hash, occurrence + 1);
    items.push({
      author: name,
      body,
      externalId: `${prefix}${hash}#${occurrence}`,
      source: source ? `Sheet: ${label} · ${source}` : `Sheet: ${label}`,
      reference: reference || null,
    });
  }
  const problem = skipped > 0 ? `Only the first ${OPERATOR_SETTLE_MAX.toLocaleString('en-US')} messages are read; ${skipped} more are not` : null;
  return { items, problem };
}

export interface SheetInboxOptions {
  sourceId: string;
  /** The source's name now (a rename is only words). */
  label: () => string;
  /** The production's inbox now: it changes when the production is published. */
  backend: () => Pick<AudienceBackend, 'list' | 'addCandidates' | 'settleImported'> | null;
  /** Said once per change: why the tab gives fewer messages, or that the inbox refused them. */
  onProblem?: (problem: string | null) => void;
}

export interface SheetInbox {
  /** The reader's rows from one successful read. */
  take: (rows: readonly (readonly string[])[]) => void;
  /** Disconnected or the page left: nothing after this reaches the inbox, a late read included. */
  stop: () => void;
}

/**
 * The consumer behind one message Sheet. One settle runs at a time; rows read meanwhile wait and
 * only the newest are used. A read whose ids match the last settled ones costs nothing. A failed
 * add or settle is tried again at the next read.
 */
export function createSheetInbox(o: SheetInboxOptions): SheetInbox {
  let stopped = false;
  let running = false;
  let waiting: readonly (readonly string[])[] | null = null;
  /** The ids the inbox holds for this source as of the last settle, and through which backend. */
  let known = new Set<string>();
  let knownFor: unknown = null;
  let lastProblem: string | null | undefined;
  const say = (problem: string | null) => {
    if (problem === lastProblem) return;
    lastProblem = problem;
    o.onProblem?.(problem);
  };

  const settle = async (rows: readonly (readonly string[])[]) => {
    const backend = o.backend();
    if (!backend) return;
    const { items, problem } = sheetMessages(o.sourceId, o.label(), rows);
    // A tab that cannot be read as messages (its Message heading renamed) is not an empty tab:
    // settling it would take every unused candidate out of the inbox.
    if (problem && items.length === 0) return say(problem);
    const ids = items.map((i) => i.externalId);
    try {
      if (backend !== knownFor) {
        // What the inbox already holds from this tab: a reload re-sends nothing it has.
        const prefix = sheetMessagePrefix(o.sourceId);
        // A withdrawn one is not counted as held, so a row restored while no page was open is
        // unmarked by the settle this read then runs.
        known = new Set((await backend.list()).flatMap((r) => (r.externalId?.startsWith(prefix) && !r.withdrawnAt ? [r.externalId] : [])));
        knownFor = backend;
        if (stopped) return;
      }
      if (ids.length === known.size && ids.every((id) => known.has(id))) return say(problem);
      await addInChunks(backend, items.filter((i) => !known.has(i.externalId)), () => stopped);
      if (stopped) return;
      await backend.settleImported(sheetMessagePrefix(o.sourceId), ids);
      known = new Set(ids);
      say(problem);
    } catch (err) {
      say(`The messages were not added: ${(err as Error).message}`);
    }
  };

  const pump = async () => {
    if (running) return;
    running = true;
    try {
      while (waiting && !stopped) {
        const rows = waiting;
        waiting = null;
        await settle(rows);
      }
    } finally {
      running = false;
    }
  };

  return {
    take(rows) {
      if (stopped) return;
      waiting = rows;
      void pump();
    },
    stop() {
      stopped = true;
      waiting = null;
    },
  };
}
