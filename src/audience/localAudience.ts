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
// operator's own work, and the Playout tab and the Interaction tab are two browser tabs that must
// see the same inbox.
//
// THE ROOM is kept too (interaction spec R15): each question's round, what is live, the votes and
// what a rehearsal phone tab or a chat source sent. A question's result is one round for the life
// of the production (O1), a pasted message files under a round by id, and the production's other
// tabs and a rehearsal phone (`/join?rehearse=<id>`) have to see the same live question, so none of
// that can live in one tab's memory. Clear results is how a rehearsal's answers are removed.
// SIMULATED rows stay in memory, as before: invented questions must never accumulate.

import { uuid } from '../model/id.ts';
import {
  AUDIENCE_LIMITS,
  QUESTION_CLOSED,
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
  type PresenterPointers,
  type QuestionLive,
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
  if (!optionalText(r.withdrawnAt) || !optionalText(r.roundId)) return null;
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
    roundId: (r.roundId as string | null | undefined) ?? null,
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
      // A kept message's round is a LOCAL round, which the published production does not have, so
      // it moves under no question.
      const added = await to.addCandidates(
        chunk.map((r) => ({ author: r.author, body: r.body, externalId: r.externalId, source: r.source, reference: r.reference })),
      );
      // A row the published inbox already held (a Sheet or YouTube import got there first since
      // publishing) is not added again; it still takes this browser's moderation of it.
      const addedIds = new Set(added.map((r) => r.externalId));
      const held = chunk.some((r) => !addedIds.has(r.externalId))
        ? (await to.list()).filter((r) => r.externalId && byExternal.has(r.externalId) && !addedIds.has(r.externalId))
        : [];
      for (const row of [...added, ...held]) {
        const was = row.externalId ? byExternal.get(row.externalId) : undefined;
        if (!was) continue;
        const { broadcastAuthor, broadcastBody, anonymize, status, shortlisted, usedAt } = was;
        if (
          broadcastAuthor !== row.broadcastAuthor || broadcastBody !== row.broadcastBody || anonymize !== row.anonymize ||
          status !== row.status || shortlisted !== row.shortlisted || (usedAt ?? null) !== (row.usedAt ?? null)
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

/** Where the ROOM is kept: production id -> its rounds, live state, votes and phone answers. */
export const LOCAL_ROOM_KEY = 'spx-gfx-audience-room';

/** The room store's version. A store written by a newer build is read-only here. */
export const LOCAL_ROOM_VERSION = 1;

interface PhoneAnswer extends AudienceSubmission {
  /** The sending device. Never handed to an operator surface (`list` strips it). */
  device: string;
}

export interface Room {
  name: string;
  open: boolean;
  mode: AudienceState['mode'];
  prompt: string;
  presenter: PresenterPointers;
  rounds: AudienceRound[];
  /** roundId -> device -> option. The key IS the dedupe; an overwrite is "change your vote". */
  votes: Record<string, Record<string, number>>;
  answers: PhoneAnswer[];
}

const emptyRoom = (name: string): Room => ({
  name,
  open: false,
  mode: 'waiting',
  prompt: '',
  presenter: { current: null, next: null },
  rounds: [],
  votes: {},
  answers: [],
});

/** A stored round this build can use, or null. */
function readRound(raw: unknown): AudienceRound | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!text(r.id) || !text(r.kind) || !text(r.question) || !Array.isArray(r.options) || !text(r.openedAt)) return null;
  if (r.kind !== 'poll' && r.kind !== 'quiz' && r.kind !== 'open') return null;
  return {
    id: r.id,
    kind: r.kind,
    questionId: text(r.questionId) ? r.questionId : null,
    revision: typeof r.revision === 'number' ? r.revision : 1,
    question: r.question,
    options: r.options.filter(text),
    correctOption: typeof r.correctOption === 'number' ? r.correctOption : null,
    openedAt: r.openedAt,
    closedAt: text(r.closedAt) ? r.closedAt : null,
  };
}

function readRoomOf(raw: unknown, name: string): Room {
  const room = emptyRoom(name);
  if (!raw || typeof raw !== 'object') return room;
  const r = raw as Record<string, unknown>;
  if (text(r.name) && r.name) room.name = r.name;
  room.rounds = Array.isArray(r.rounds) ? r.rounds.map(readRound).filter((x): x is AudienceRound => x !== null) : [];
  const open = room.rounds.find((x) => !x.closedAt) ?? null;
  // Open only while a round is (R18): a state with no round is the waiting text.
  room.open = r.open === true && open !== null;
  room.mode = open && text(r.mode) ? (r.mode as Room['mode']) : 'waiting';
  room.prompt = text(r.prompt) ? r.prompt : '';
  const p = (r.presenter ?? {}) as Record<string, unknown>;
  room.presenter = { current: text(p.current) ? p.current : null, next: text(p.next) ? p.next : null };
  if (r.votes && typeof r.votes === 'object') {
    for (const [roundId, byDevice] of Object.entries(r.votes as Record<string, unknown>)) {
      if (!byDevice || typeof byDevice !== 'object') continue;
      const kept: Record<string, number> = {};
      for (const [device, option] of Object.entries(byDevice as Record<string, unknown>)) {
        if (typeof option === 'number') kept[device] = option;
      }
      room.votes[roundId] = kept;
    }
  }
  room.answers = Array.isArray(r.answers)
    ? r.answers.flatMap((a) => {
        const row = readRow(a);
        const device = (a as { device?: unknown } | null)?.device;
        return row && text(device) ? [{ ...row, device }] : [];
      })
    : [];
  return room;
}

/** Every production's room, and whether this build may write the store. */
function readRooms(): { rooms: Record<string, unknown>; writable: boolean } {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_ROOM_KEY);
    if (!raw) return { rooms: {}, writable: true };
    const parsed = JSON.parse(raw) as { v?: unknown; rooms?: unknown } | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.v !== 'number' || parsed.v < LOCAL_ROOM_VERSION) {
      return { rooms: {}, writable: true };
    }
    const rooms = parsed.rooms && typeof parsed.rooms === 'object' ? (parsed.rooms as Record<string, unknown>) : {};
    return { rooms, writable: parsed.v === LOCAL_ROOM_VERSION };
  } catch {
    return { rooms: {}, writable: true };
  }
}

function writeRoom(showId: string, room: Room): boolean {
  try {
    const { rooms, writable } = readRooms();
    if (!globalThis.localStorage || !writable) return false;
    globalThis.localStorage.setItem(LOCAL_ROOM_KEY, JSON.stringify({ v: LOCAL_ROOM_VERSION, rooms: { ...rooms, [showId]: room } }));
    return true;
  } catch {
    return false;
  }
}

/** The room a rehearsal phone tab reads (`/join?rehearse=<id>`): its production name as the
 *  operator's tab last wrote it, or empty when this browser holds none. */
export function localRoomName(showId: string): string {
  return readRoomOf(readRooms().rooms[showId], '').name;
}

/** The question's snapshot in the server's own normal form (0111), so comparing is fair. */
function snapshotOf(question: QuestionLive): { kind: AudienceRound['kind']; text: string; options: string[] } | string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(question.id)) return 'not a question';
  const textNow = question.text.trim().slice(0, 200);
  if (!textNow) return 'a question needs its text';
  if (question.type === 'open') return { kind: 'open', text: textNow, options: [] };
  if (question.type !== 'choice') return 'not a question';
  const options = (question.options ?? []).map((o) => o.trim().slice(0, 60)).slice(0, AUDIENCE_LIMITS.options);
  if (options.length < 2) return 'a vote needs two options at least';
  return { kind: 'poll', text: textNow, options };
}

export interface LocalAudience extends AudienceBackend {
  /** Simulate viewers sending something in: answers to the live Open question, or unfiled. */
  simulate(count?: number): AudienceSubmission[];
  /** Simulate votes landing on the open round. */
  simulateVotes(counts: number[]): void;
  /** Subscribe to any change — the workspace polls a real backend and listens here. */
  onChange(cb: () => void): () => void;
}

/**
 * One provider PER PRODUCTION, for the life of the tab.
 *
 * It is a module-level registry rather than component state because the Interaction workspace
 * unmounts every time the operator visits Playout or Data, and an inbox that emptied itself on
 * a tab switch would be useless — the same class of defect as the PROGRAM monitor losing air on
 * that round trip. Its operator-added rows and its room are also in browser storage (above); its
 * simulated rows live only here.
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
  /** Simulated rows: memory only. */
  const submissions: AudienceSubmission[] = [];
  const sends = new Map<string, number[]>();
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
  /** The room: browser storage per production, else memory. Each write reads it fresh, so two
   *  tabs never write a room one of them read before the other's change. */
  let roomInMemory: Room = emptyRoom(options.productionName);
  const room = (): Room => {
    if (!options.showId) return roomInMemory;
    const read = readRoomOf(readRooms().rooms[options.showId], options.productionName);
    if (options.productionName) read.name = options.productionName;
    return read;
  };
  const saveRoom = (next: Room): boolean => {
    if (!options.showId) {
      roomInMemory = next;
      return true;
    }
    return writeRoom(options.showId, next);
  };
  const mustSave = (next: Room) => {
    if (!saveRoom(next)) throw new Error('This browser refused to keep the change.');
  };
  // The production's other tab (or a rehearsal phone) changed the inbox or the room.
  if (options.showId && typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === LOCAL_INBOX_KEY || e.key === LOCAL_ROOM_KEY) changed();
    });
  }
  // The clock is read once per write rather than being injected: a virtual clock belongs to the
  // render runtime, and every consumer here only ever compares two of these to each other.
  const nowIso = () => new Date().toISOString();
  const openRoundOf = (r: Room) => r.rounds.find((x) => !x.closedAt) ?? null;
  const stateOf = (r: Room): AudienceState => ({
    open: r.open,
    mode: r.mode,
    prompt: r.prompt,
    presenter: { ...r.presenter },
    round: openRoundOf(r),
  });
  const strip = ({ device: _device, ...row }: PhoneAnswer): AudienceSubmission => row;

  const make = (author: string, body: string, roundId: string | null = null): AudienceSubmission => {
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
      roundId,
    };
  };

  /** The round a phone named, if it is open, of `kinds`, and at the revision it read (R6). */
  const liveRound = (r: Room, roundId: string, revision: number, kinds: AudienceRound['kind'][]) =>
    r.rounds.find((x) => x.id === roundId && !x.closedAt && x.revision === revision && kinds.includes(x.kind)) ?? null;

  const backend: LocalAudience = {
    async joinView(deviceToken: string): Promise<JoinView> {
      const r = room();
      const open = openRoundOf(r);
      return {
        productionName: r.name,
        // The round is handed over WITHOUT its answer key, here as on the wire: the join page
        // is a capability, and a capability that leaks the answer is not one.
        state: { ...stateOf(r), presenter: { current: null, next: null }, round: open ? { ...open, correctOption: null } : null },
        // ONLY this device's own. A join view that could see another submitter's anything
        // would turn a public URL into a moderation feed.
        mine: r.answers
          .filter((s) => s.device === deviceToken)
          .map((s) => ({ id: s.id, body: s.body, createdAt: s.createdAt })),
        myVote: open ? r.votes[open.id]?.[deviceToken] ?? null : null,
      };
    },

    async submit(deviceToken, author, body, target): Promise<SubmitResult> {
      const r = room();
      const round = liveRound(r, target.roundId, target.revision, ['open']);
      if (!round) return { ok: false, error: QUESTION_CLOSED, closed: true };
      if (!body.trim()) return { ok: false, error: 'Nothing to send.' };
      const now = Date.now();
      const recent = (sends.get(deviceToken) ?? []).filter((t) => now - t < PER_DEVICE_WINDOW_MS);
      if (recent.length >= PER_DEVICE_MAX) return { ok: false, error: 'Too many messages. Wait a moment.' };
      sends.set(deviceToken, [...recent, now]);
      r.answers.push({ ...make(author, body, round.id), device: deviceToken });
      if (!saveRoom(r)) return { ok: false, error: 'That could not be sent right now.' };
      changed();
      return { ok: true, error: null };
    },

    async vote(deviceToken, roundId, option, revision): Promise<SubmitResult> {
      const r = room();
      const round = liveRound(r, roundId, revision, ['poll', 'quiz']);
      if (!round) return { ok: false, error: QUESTION_CLOSED, closed: true };
      // One generic refusal for every other reason, exactly as the RPC answers.
      if (option < 0 || option >= round.options.length) return { ok: false, error: 'That vote could not be counted.' };
      r.votes[roundId] = { ...(r.votes[roundId] ?? {}), [deviceToken]: option }; // upsert = change your mind
      if (!saveRoom(r)) return { ok: false, error: 'That vote could not be counted.' };
      changed();
      return { ok: true, error: null };
    },

    async list(): Promise<AudienceSubmission[]> {
      return [...kept(), ...room().answers.map(strip), ...submissions].map((s) => ({ ...s }));
    },

    async addCandidates(items): Promise<AudienceSubmission[]> {
      if (items.length > OPERATOR_ADD_MAX) {
        throw new Error(`At most ${OPERATOR_ADD_MAX} messages at a time.`);
      }
      // R13: a round of this production, or none; anything else refuses the whole call.
      const roundIds = new Set(room().rounds.map((x) => x.id));
      if (items.some((i) => i.roundId && !roundIds.has(i.roundId))) throw new Error('not a question of this production');
      const rows = kept();
      const known = new Set(
        [...rows, ...room().answers, ...submissions].map((s) => s.externalId).filter((x): x is string => Boolean(x)),
      );
      const added: AudienceSubmission[] = [];
      for (const item of items) {
        if (!item.body.trim()) continue;
        const provenance = clampProvenance(item);
        if (provenance.externalId && known.has(provenance.externalId)) continue;
        if (provenance.externalId) known.add(provenance.externalId);
        added.push({ ...make(item.author ?? '', item.body, item.roundId ?? null), ...provenance });
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
      const r = room();
      const keptRow = rows.find((s) => s.id === id);
      const answer = keptRow ? undefined : r.answers.find((s) => s.id === id);
      const row = keptRow ?? answer ?? submissions.find((s) => s.id === id);
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
      if (answer) mustSave(r);
      changed();
    },

    async getState(): Promise<AudienceState> {
      return stateOf(room());
    },

    async setState(patch): Promise<AudienceState> {
      // Only the presenter pointers (R18): what phones see moves through goLive and stop.
      const r = room();
      if (patch.presenter) r.presenter = { current: patch.presenter.current, next: patch.presenter.next };
      mustSave(r);
      changed();
      return stateOf(r);
    },

    async goLive(question): Promise<AudienceRound> {
      const snap = snapshotOf(question);
      if (typeof snap === 'string') throw new Error(snap);
      const r = room();
      const at = nowIso();
      let round = r.rounds.find((x) => x.questionId === question.id) ?? null;
      if (round) {
        if (round.kind !== snap.kind) throw new Error('a question keeps its type');
        const same = round.question === snap.text && JSON.stringify(round.options) === JSON.stringify(snap.options);
        if (!same) {
          if (!round.closedAt) throw new Error('a live question cannot change');
          const answered =
            Object.keys(r.votes[round.id] ?? {}).length > 0 ||
            [...kept(), ...r.answers, ...submissions].some((s) => s.roundId === round!.id);
          if (answered) throw new Error('this question has answers, so it cannot change');
          round.question = snap.text;
          round.options = snap.options;
          round.revision += 1;
        }
      }
      for (const other of r.rounds) if (other !== round && !other.closedAt) other.closedAt = at; // one open round
      if (!round) {
        round = { id: uuid(), kind: snap.kind, questionId: question.id, revision: 1, question: snap.text, options: snap.options, correctOption: null, openedAt: at, closedAt: null };
        r.rounds.push(round);
      } else if (round.closedAt) {
        round.closedAt = null;
        round.openedAt = at;
      }
      r.open = true;
      r.mode = snap.kind === 'open' ? 'question' : 'poll';
      r.prompt = snap.text.slice(0, 160);
      mustSave(r);
      changed();
      return { ...round };
    },

    async stop(roundId): Promise<AudienceState> {
      const r = room();
      const round = r.rounds.find((x) => x.id === roundId && !x.closedAt);
      if (round) {
        round.closedAt = nowIso();
        r.open = false;
        r.mode = 'waiting';
        mustSave(r);
        changed();
      }
      return stateOf(r);
    },

    async clearResults(questionId): Promise<AudienceRound | null> {
      const r = room();
      const round = r.rounds.find((x) => x.questionId === questionId);
      if (!round) return null;
      if (!round.closedAt) throw new Error('stop the question before clearing its results');
      delete r.votes[round.id];
      r.answers = r.answers.filter((s) => s.roundId !== round.id);
      round.revision += 1;
      const rows = kept();
      const left = rows.filter((s) => s.roundId !== round.id);
      if (left.length !== rows.length && !keep(left)) throw new Error('This browser refused to keep the change.');
      for (let i = submissions.length - 1; i >= 0; i -= 1) if (submissions[i].roundId === round.id) submissions.splice(i, 1);
      mustSave(r);
      changed();
      return { ...round };
    },

    async tally(roundId: string): Promise<AudienceTally> {
      const r = room();
      const round = r.rounds.find((x) => x.id === roundId);
      const counts = new Array(round?.options.length ?? 0).fill(0) as number[];
      for (const option of Object.values(r.votes[roundId] ?? {})) {
        if (option >= 0 && option < counts.length) counts[option] += 1;
      }
      return { roundId, counts, total: counts.reduce((a, b) => a + b, 0) };
    },

    async rounds(): Promise<AudienceRound[]> {
      return room().rounds.map((x) => ({ ...x }));
    },

    simulate(count = 1): AudienceSubmission[] {
      const made: AudienceSubmission[] = [];
      const open = openRoundOf(room());
      const roundId = open?.kind === 'open' ? open.id : null;
      for (let i = 0; i < count; i += 1) {
        const pool = roundId ? SAMPLE_COMMENTS : SAMPLE_QUESTIONS;
        const row = make(SAMPLE_AUTHORS[seq % SAMPLE_AUTHORS.length], pool[seq % pool.length], roundId);
        seq += 1;
        submissions.push(row);
        made.push(row);
      }
      changed();
      return made;
    },

    simulateVotes(counts: number[]): void {
      const r = room();
      const round = openRoundOf(r);
      if (!round || round.kind === 'open') return;
      const byDevice = { ...(r.votes[round.id] ?? {}) };
      counts.forEach((n, option) => {
        for (let i = 0; i < n; i += 1) byDevice[`sim-${option}-${seq++}`] = option;
      });
      r.votes[round.id] = byDevice;
      saveRoom(r);
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
