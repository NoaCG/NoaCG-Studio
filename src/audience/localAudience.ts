// THE LOCAL AUDIENCE PROVIDER — the inbox of an unpublished production, with a simulator.
//
// This is what REHEARSAL runs on, what an offline build runs on, and what the e2e suite drives.
// It is not a mock in the testing sense: it implements the whole `AudienceBackend` contract with
// the same caps, the same immutability of the original, and the same refusals, so a workflow
// that works here is the workflow, and the Supabase provider is a second implementation of an
// interface that has already been exercised rather than the first one anybody tried.
//
// WHAT IS KEPT, AND WHAT IS NOT (data-sources C0, reversing this file's earlier rule that it held
// nothing durable). Messages the OPERATOR put here - pasted now, imported later - are kept in
// browser storage per production, with their moderation: an inbox forgotten on reload lost the
// operator's own work, and the Playout tab and the Messages tab are two browser tabs that must see
// the same inbox. SIMULATED rows, and what a local join preview or a chat source sends, stay in
// memory: a rehearsal's invented questions must never accumulate, which was the reason for the old
// rule and still holds for them.

import { uuid } from '../model/id.ts';
import {
  AUDIENCE_LIMITS,
  OPERATOR_ADD_MAX,
  OPERATOR_SETTLE_MAX,
  clampProvenance,
  clampSubmission,
  type AudienceBackend,
  type AudienceRound,
  type AudienceState,
  type AudienceSubmission,
  type AudienceTally,
  type JoinView,
  type SubmitResult,
} from './audienceTypes.ts';

/** Rehearsal names and questions. Deliberately bland and clearly fictional: a simulator that
 *  produced realistic-looking personal material would put words in nobody's mouth by accident,
 *  and an operator practising should be able to tell rehearsal from air at a glance. */
const SAMPLE_AUTHORS = ['Sam (rehearsal)', 'Alex (rehearsal)', 'Jo (rehearsal)', 'Kim (rehearsal)', 'Ravi (rehearsal)'];
const SAMPLE_QUESTIONS = [
  'How did the team prepare for tonight?',
  'What changed at half time?',
  'Will there be a repeat next season?',
  'Can you explain that decision again?',
  'Who is the one to watch in the second half?',
  'How long have you been doing this?',
];
const SAMPLE_COMMENTS = [
  'Watching from the north stand — great atmosphere.',
  'First time following along, really enjoying it.',
  'That was the best save of the season.',
  'Hello from the school hall, we are all watching together.',
];

/** The rate caps a server trigger would enforce, mirrored here so rehearsal behaves like air. */
const PER_DEVICE_WINDOW_MS = 30_000;
const PER_DEVICE_MAX = 3;

export interface LocalAudienceOptions {
  productionName: string;
  /** Deterministic sequence for the simulator, so a spec never depends on randomness. */
  seed?: number;
  /** Keep operator-added candidates in browser storage under this production. Absent = memory
   *  only (a Node test, or a provider nobody reloads). */
  showId?: string;
}

/** Where operator-added candidates are kept: production id -> rows. Plain localStorage, as the
 *  live data tree is (model/productionState.ts): small, per machine, and it has to survive a
 *  reload and be seen by the production's other tab. */
export const LOCAL_INBOX_KEY = 'spx-gfx-audience-inbox';

/** The stored format's version (`root/version-every-persisted-format-ship-breaking`). A store
 *  written by a newer build is read-only here: shown when its rows still read, never rewritten. */
export const LOCAL_INBOX_VERSION = 1;

type InboxStore = Record<string, AudienceSubmission[]>;

const STATUSES = new Set(['new', 'approved', 'rejected']);
const text = (v: unknown): v is string => typeof v === 'string';
const optionalText = (v: unknown) => v === undefined || v === null || typeof v === 'string';

/** A stored row that has the shape this build renders, or null. Damaged rows are skipped rather
 *  than handed to the Messages view, where a missing field would throw mid-show. */
function readRow(raw: unknown): AudienceSubmission | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!text(r.id) || !text(r.createdAt) || !text(r.author) || !text(r.body)) return null;
  if (!text(r.broadcastAuthor) || !text(r.broadcastBody) || !text(r.status) || !STATUSES.has(r.status)) return null;
  if (!optionalText(r.usedAt) || !optionalText(r.externalId) || !optionalText(r.source) || !optionalText(r.reference)) return null;
  if (!optionalText(r.withdrawnAt)) return null;
  return {
    id: r.id,
    createdAt: r.createdAt,
    author: r.author,
    body: r.body,
    broadcastAuthor: r.broadcastAuthor,
    broadcastBody: r.broadcastBody,
    anonymize: r.anonymize === true,
    status: r.status as AudienceSubmission['status'],
    shortlisted: r.shortlisted === true,
    usedAt: (r.usedAt as string | null | undefined) ?? null,
    externalId: (r.externalId as string | null | undefined) ?? null,
    source: (r.source as string | null | undefined) ?? null,
    reference: (r.reference as string | null | undefined) ?? null,
    withdrawnAt: (r.withdrawnAt as string | null | undefined) ?? null,
  };
}

/** The store, and whether this build may write it. Unreadable is empty and writable, never a
 *  crash on the way into the Messages view; a newer version is read-only. */
export function readInbox(): { store: InboxStore; writable: boolean } {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_INBOX_KEY);
    if (!raw) return { store: {}, writable: true };
    const parsed = JSON.parse(raw) as { v?: unknown; inbox?: unknown } | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { store: {}, writable: true };
    const writable = parsed.v === LOCAL_INBOX_VERSION;
    if (typeof parsed.v !== 'number' || parsed.v < LOCAL_INBOX_VERSION) return { store: {}, writable: true };
    const store: InboxStore = {};
    const inbox = parsed.inbox && typeof parsed.inbox === 'object' ? (parsed.inbox as Record<string, unknown>) : {};
    for (const [showId, rows] of Object.entries(inbox)) {
      if (!Array.isArray(rows)) continue;
      const read = rows.map(readRow).filter((r): r is AudienceSubmission => r !== null);
      if (read.length > 0) store[showId] = read;
    }
    return { store, writable };
  } catch {
    return { store: {}, writable: true };
  }
}

/** False when the browser refused the write (quota, private mode) or the store is newer. */
function writeInbox(store: InboxStore): boolean {
  try {
    if (!globalThis.localStorage || !readInbox().writable) return false;
    globalThis.localStorage.setItem(LOCAL_INBOX_KEY, JSON.stringify({ v: LOCAL_INBOX_VERSION, inbox: store }));
    return true;
  } catch {
    return false;
  }
}

/** Productions whose kept messages are moving to a published inbox right now. */
const moving = new Set<string>();

/**
 * PUBLISHING MOVES THE KEPT MESSAGES. Once a production is published its Messages view reads the
 * published inbox, so the messages kept here before publishing are copied into it through the
 * operator door (`addCandidates`, at most OPERATOR_ADD_MAX a call), with their broadcast edits and
 * moderation, then forgotten here. Each carries an external id (`local:<id>` when it had none), so
 * a second attempt after a failure adds nothing twice. A failure leaves them kept, to move later.
 */
export async function moveKeptMessages(showId: string, to: AudienceBackend): Promise<void> {
  if (moving.has(showId)) return;
  const rows = readInbox().store[showId] ?? [];
  if (rows.length === 0) return;
  moving.add(showId);
  try {
    for (let at = 0; at < rows.length; at += OPERATOR_ADD_MAX) {
      const chunk = rows.slice(at, at + OPERATOR_ADD_MAX).map((r) => ({ ...r, externalId: r.externalId || `local:${r.id}` }));
      const byExternal = new Map(chunk.map((r) => [r.externalId, r] as const));
      const added = await to.addCandidates(
        chunk.map((r) => ({ author: r.author, body: r.body, externalId: r.externalId, source: r.source, reference: r.reference })),
      );
      for (const row of added) {
        const was = row.externalId ? byExternal.get(row.externalId) : undefined;
        if (!was) continue;
        const { broadcastAuthor, broadcastBody, anonymize, status, shortlisted, usedAt } = was;
        if (
          broadcastAuthor !== row.broadcastAuthor || broadcastBody !== row.broadcastBody || anonymize || status !== 'new' || shortlisted || usedAt
        ) {
          await to.update(row.id, { broadcastAuthor, broadcastBody, anonymize, status, shortlisted, usedAt });
        }
      }
      const moved = new Set(chunk.map((r) => r.id));
      const { store } = readInbox();
      const left = (store[showId] ?? []).filter((r) => !moved.has(r.id));
      if (left.length > 0) store[showId] = left;
      else delete store[showId];
      writeInbox(store);
    }
  } finally {
    moving.delete(showId);
  }
}

export interface LocalAudience extends AudienceBackend {
  /** Simulate one viewer sending something in, as if from a phone in the room. */
  simulate(count?: number): AudienceSubmission[];
  /** Simulate votes landing on the open round (Phase 6 drives this). */
  simulateVotes(counts: number[]): void;
  /** Subscribe to any change — the workspace polls a real backend and listens here. */
  onChange(cb: () => void): () => void;
}

/**
 * One provider PER PRODUCTION, for the life of the tab.
 *
 * It is a module-level registry rather than component state because the Messages workspace
 * unmounts every time the operator visits Playout or Data, and an inbox that emptied itself on
 * a tab switch would be useless — the same class of defect as the PROGRAM monitor losing air on
 * that round trip. Its operator-added rows are also in browser storage (above); its simulated
 * rows live only here.
 */
const byProduction = new Map<string, LocalAudience>();

export function localAudienceFor(showId: string, productionName: string): LocalAudience {
  const existing = byProduction.get(showId);
  if (existing) return existing;
  const made = createLocalAudience({ productionName, showId });
  byProduction.set(showId, made);
  return made;
}

export function createLocalAudience(options: LocalAudienceOptions): LocalAudience {
  const submissions: AudienceSubmission[] = [];
  const rounds: AudienceRound[] = [];
  /** roundId -> deviceToken -> option. The composite key IS the dedupe, and an overwrite is
   *  exactly "change your vote" — the owner's ratified decision. */
  const votes = new Map<string, Map<string, number>>();
  const sends = new Map<string, number[]>();
  /** submissionId -> the device that sent it. Kept OUT of `AudienceSubmission` so no operator
   *  surface can render it: the operator moderates words, not devices. */
  const senderOf = new Map<string, string>();
  let state: AudienceState = {
    open: false,
    mode: 'waiting',
    round: null,
    prompt: 'Send us your question',
    presenter: { current: null, next: null },
  };
  let seq = options.seed ?? 0;
  const listeners: Array<() => void> = [];
  const changed = () => listeners.forEach((cb) => cb());
  /** The kept rows: browser storage when there is a production to key them by, else memory. */
  let keptInMemory: AudienceSubmission[] = [];
  const kept = (): AudienceSubmission[] => (options.showId ? readInbox().store[options.showId] ?? [] : keptInMemory);
  const keep = (rows: AudienceSubmission[]): boolean => {
    if (!options.showId) {
      keptInMemory = rows;
      return true;
    }
    const { store } = readInbox();
    if (rows.length > 0) store[options.showId] = rows;
    else delete store[options.showId];
    return writeInbox(store);
  };
  // The production's other tab added or moderated a kept row: tell this one's listeners.
  if (options.showId && typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === LOCAL_INBOX_KEY) changed();
    });
  }
  // The clock is read once per write rather than being injected: a virtual clock belongs to the
  // render runtime, and every consumer here only ever compares two of these to each other.
  const nowIso = () => new Date().toISOString();

  const make = (author: string, body: string): AudienceSubmission => {
    const clamped = clampSubmission(author, body);
    return {
      id: uuid(),
      createdAt: nowIso(),
      author: clamped.author,
      body: clamped.body,
      broadcastAuthor: clamped.author,
      broadcastBody: clamped.body,
      anonymize: false,
      status: 'new',
      shortlisted: false,
      usedAt: null,
    };
  };

  const backend: LocalAudience = {
    async joinView(deviceToken: string): Promise<JoinView> {
      const open = rounds.find((r) => !r.closedAt) ?? null;
      return {
        productionName: options.productionName,
        // The round is handed over WITHOUT its answer key, here as on the wire: the join page
        // is a capability, and a capability that leaks the answer is not one.
        state: { ...state, round: open ? { ...open, correctOption: null } : null },
        // ONLY this device's own. A join view that could see another submitter's anything
        // would turn a public URL into a moderation feed.
        mine: submissions
          .filter((s) => senderOf.get(s.id) === deviceToken)
          .map((s) => ({ id: s.id, body: s.body, createdAt: s.createdAt })),
        myVote: open ? votes.get(open.id)?.get(deviceToken) ?? null : null,
      };
    },

    async submit(deviceToken: string, author: string, body: string): Promise<SubmitResult> {
      if (!state.open) return { ok: false, error: 'Not accepting messages right now.' };
      if (!body.trim()) return { ok: false, error: 'Nothing to send.' };
      const now = Date.now();
      const recent = (sends.get(deviceToken) ?? []).filter((t) => now - t < PER_DEVICE_WINDOW_MS);
      if (recent.length >= PER_DEVICE_MAX) return { ok: false, error: 'Too many messages — wait a moment.' };
      sends.set(deviceToken, [...recent, now]);
      const row = make(author, body);
      senderOf.set(row.id, deviceToken);
      submissions.push(row);
      changed();
      return { ok: true, error: null };
    },

    async vote(deviceToken: string, roundId: string, option: number): Promise<SubmitResult> {
      const round = rounds.find((r) => r.id === roundId);
      // One generic refusal for every reason, exactly as the RPC must answer: "which of these
      // is wrong" is information a vote endpoint has no business handing out.
      if (!round || round.closedAt || option < 0 || option >= round.options.length) {
        return { ok: false, error: 'That vote could not be counted.' };
      }
      const byDevice = votes.get(roundId) ?? new Map<string, number>();
      byDevice.set(deviceToken, option); // upsert = change your mind while the round is open
      votes.set(roundId, byDevice);
      changed();
      return { ok: true, error: null };
    },

    async list(): Promise<AudienceSubmission[]> {
      return [...kept(), ...submissions].map((s) => ({ ...s }));
    },

    async addCandidates(items): Promise<AudienceSubmission[]> {
      if (items.length > OPERATOR_ADD_MAX) {
        throw new Error(`At most ${OPERATOR_ADD_MAX} messages at a time.`);
      }
      const rows = kept();
      const known = new Set(
        [...rows, ...submissions].map((s) => s.externalId).filter((x): x is string => Boolean(x)),
      );
      const added: AudienceSubmission[] = [];
      for (const item of items) {
        if (!item.body.trim()) continue;
        const provenance = clampProvenance(item);
        if (provenance.externalId && known.has(provenance.externalId)) continue;
        if (provenance.externalId) known.add(provenance.externalId);
        added.push({ ...make(item.author ?? '', item.body), ...provenance });
      }
      if (added.length === 0) return [];
      if (!keep([...rows, ...added])) throw new Error('This browser refused to keep the message.');
      changed();
      return added.map((s) => ({ ...s }));
    },

    async settleImported(prefix, present): Promise<void> {
      if (present.length > OPERATOR_SETTLE_MAX) throw new Error(`At most ${OPERATOR_SETTLE_MAX} rows at a time.`);
      if (!prefix) return;
      const here = new Set(present);
      const rows = kept();
      const at = nowIso();
      let changes = 0;
      const next = rows.flatMap((row) => {
        if (!row.externalId?.startsWith(prefix)) return [row];
        const there = here.has(row.externalId);
        // An unused candidate follows its row; a used one is the operator's record and stays.
        if (!there && !row.usedAt) return (changes += 1), [];
        if (!there && !row.withdrawnAt) return (changes += 1), [{ ...row, withdrawnAt: at }];
        if (there && row.withdrawnAt) return (changes += 1), [{ ...row, withdrawnAt: null }];
        return [row];
      });
      if (changes === 0) return;
      if (!keep(next)) throw new Error('This browser refused to keep the change.');
      changed();
    },

    async update(id, patch): Promise<void> {
      const rows = kept();
      const keptRow = rows.find((s) => s.id === id);
      const row = keptRow ?? submissions.find((s) => s.id === id);
      if (!row) return;
      // The allowlist IS the immutability of the original: `author` and `body` are not in the
      // patch type and are not assigned here either, so neither a UI bug nor a future caller
      // can rewrite what a person actually sent.
      if (patch.broadcastAuthor !== undefined) row.broadcastAuthor = patch.broadcastAuthor.slice(0, AUDIENCE_LIMITS.author);
      if (patch.broadcastBody !== undefined) row.broadcastBody = patch.broadcastBody.slice(0, AUDIENCE_LIMITS.body);
      if (patch.anonymize !== undefined) row.anonymize = patch.anonymize;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.shortlisted !== undefined) row.shortlisted = patch.shortlisted;
      if (patch.usedAt !== undefined) row.usedAt = patch.usedAt;
      if (keptRow && !keep(rows)) throw new Error('This browser refused to keep the change.');
      changed();
    },

    async getState(): Promise<AudienceState> {
      return { ...state, round: rounds.find((r) => !r.closedAt) ?? null };
    },

    async setState(patch): Promise<AudienceState> {
      // `round` is deliberately not patchable here: the pointer and the table can never
      // disagree if only openRound/closeRound may move it.
      state = { ...state, ...patch };
      changed();
      return backend.getState();
    },

    async openRound(round): Promise<AudienceRound> {
      for (const r of rounds) if (!r.closedAt) r.closedAt = nowIso(); // one open round at a time
      const created: AudienceRound = {
        ...round,
        options: round.options.slice(0, AUDIENCE_LIMITS.options),
        id: uuid(),
        openedAt: nowIso(),
        closedAt: null,
      };
      rounds.push(created);
      state = { ...state, open: true, mode: round.kind };
      changed();
      return created;
    },

    async closeRound(roundId: string): Promise<void> {
      const round = rounds.find((r) => r.id === roundId);
      if (round && !round.closedAt) round.closedAt = nowIso();
      changed();
    },

    async tally(roundId: string): Promise<AudienceTally> {
      const round = rounds.find((r) => r.id === roundId);
      const counts = new Array(round?.options.length ?? 0).fill(0) as number[];
      for (const option of votes.get(roundId)?.values() ?? []) {
        if (option >= 0 && option < counts.length) counts[option] += 1;
      }
      return { roundId, counts, total: counts.reduce((a, b) => a + b, 0) };
    },

    async rounds(): Promise<AudienceRound[]> {
      return rounds.map((r) => ({ ...r }));
    },

    simulate(count = 1): AudienceSubmission[] {
      const made: AudienceSubmission[] = [];
      for (let i = 0; i < count; i += 1) {
        const pool = state.mode === 'comment' ? SAMPLE_COMMENTS : SAMPLE_QUESTIONS;
        const row = make(SAMPLE_AUTHORS[seq % SAMPLE_AUTHORS.length], pool[seq % pool.length]);
        seq += 1;
        submissions.push(row);
        made.push(row);
      }
      changed();
      return made;
    },

    simulateVotes(counts: number[]): void {
      const round = rounds.find((r) => !r.closedAt);
      if (!round) return;
      const byDevice = votes.get(round.id) ?? new Map<string, number>();
      counts.forEach((n, option) => {
        for (let i = 0; i < n; i += 1) byDevice.set(`sim-${option}-${seq++}`, option);
      });
      votes.set(round.id, byDevice);
      changed();
    },

    onChange(cb: () => void): () => void {
      listeners.push(cb);
      return () => {
        const at = listeners.indexOf(cb);
        if (at >= 0) listeners.splice(at, 1);
      };
    },
  };

  return backend;
}
