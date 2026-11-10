// CHAT INTAKE - Twitch / YouTube live chat flowing into a production's audience inbox.
//
// This is the connector doctrine (docs/CLOUD_PLAYOUT.md §7) pointed at the audience plane
// (docs/INTERACTIVE_PLAYOUT_PLAN.md, "Backlog for the audience plane"): a connector is a
// PRODUCER of submissions and nothing else. Every message this module lets through goes in
// through `AudienceBackend.submit` - the same door a phone in the room uses - so an ingested
// chat line is moderated, approved and taken exactly like anything else, and the structural
// rule survives untouched: nothing here can reach the command log, because the interface it
// writes through has no method that does.
//
// YOUTUBE is the exception to the door (data-sources C3): its lines are imported candidates and go
// in through the OPERATOR door (`addCandidates`, the backend's `audience_operator_add` when
// published), with the platform's message id as their identity and "YouTube chat" as provenance,
// so they need no open audience and dedupe in the database. The name stays the viewer's name: the
// platform word is provenance, never part of it. Twitch keeps the viewer door, unchanged.
//
// ARCHITECTURE, stated because it is a deliberate stopgap: the pollers run in the OPERATOR'S
// BROWSER, the same place the Google-Sheets live-data block runs (control/liveData.ts). That
// keeps the audience plane's zero-Vercel-function architecture; the cost is that ingestion
// lives and dies with the studio tab. The plan doc records server-side per-platform ingestion
// as the eventual shape - this module is v1, not the destination.
//
// IDENTITY: each chat AUTHOR gets a deterministic synthesized device token, so the per-device
// caps (3 per 30 s, mirrored in the DB guard trigger and localAudience.ts) meter per CHAT USER,
// not per connector. One person spamming a chat hits their own cap; the room does not.
//
// VOLUME: a local throttle + dedupe run BEFORE any write. The DB's per-show burst cap is 20
// submissions per 10 s (migration 0035 audience_guard); the intake takes at most HALF of that,
// so a busy chat can never crowd the room's own phones out of the shared burst budget. What
// the throttle refuses is COUNTED and shown - a limiter that drops silently reads as a bug.
// An inbox is read by a human either way: more than ~60 messages a minute is not moderatable,
// so the cap costs the workflow nothing. If a production genuinely needs more, the number to
// change is the DB trigger's, and that is an owner decision, not a connector default.

import { uuid } from '../model/id';
import { AUDIENCE_LIMITS, OPERATOR_ADD_MAX, type AudienceRound, type AudienceSubmission, type CandidateInput, type RoundTarget, type SubmitResult } from './audienceTypes';
import { CHAT_VOTES_MAX, chatVoter, inVoteWindow, latestPerVoter, voteOption, type ChatVote, type ChatVoteOutcome } from './chatVotes.ts';
import { twitchChatDriver } from './twitchChat';
import { recordSpend, rememberKey, rememberedKey, youtubeChatDriver, type YouTubeIo } from './youtubeChat';

/** One normalized chat line, whatever platform it came from. */
export interface ChatDriverMessage {
  /** The platform's own message id, when it gives one - the dedupe key. */
  id: string | null;
  /** A stable per-author id (Twitch login, YouTube channel id) - the identity the token is
   *  synthesized from. Falls back to the display name when a platform has nothing better. */
  authorId: string;
  authorName: string;
  text: string;
  /** Said before the source connected: the live chat's first page (YouTube). */
  earlier?: boolean;
  /** The platform's own time of the message, in ms (YouTube `publishedAt`, Twitch `tmi-sent-ts`). */
  at?: number;
  /** The voter identity (`yt:<channel id>`, `tw:<user id>`), when the platform gives a user id. */
  voter?: string | null;
}

export interface ChatDriverHandlers {
  onMessage(message: ChatDriverMessage): void;
  onStatus(status: 'connecting' | 'live' | 'error', detail?: string): void;
  /** Quota units a call just spent (YouTube), for the remaining-runtime estimate. */
  onSpend?(units: number): void;
}

/** What a platform driver hands back: a way to stop, and optionally a way to pause the spend
 *  (the YouTube poller stops burning quota while paused; the Twitch socket just stays open). */
export interface ChatDriver {
  stop(): void;
  setPaused?(paused: boolean): void;
}

export type ChatPlatform = 'twitch' | 'youtube' | 'test';

export type ChatSourceSpec =
  | { platform: 'twitch'; channel: string }
  /** `sourceId` is the production's `Show.sources` entry the chat belongs to. */
  | { platform: 'youtube'; videoId: string; apiKey: string; sourceId?: string }
  /** The rehearsal/test driver - never offered in the UI. It exists so the offline e2e suite
   *  can drive the WHOLE pipeline (identity, throttle, dedupe, counters, the submit door)
   *  without a network, the same reason localAudience has simulate(). */
  | { platform: 'test'; label?: string };

/** Where a source is, as the UI shows it. `connecting` covers reconnects too. */
export type ChatSourceStatus = 'connecting' | 'live' | 'error' | 'stopped';

export interface ChatSourceState {
  id: string;
  /** The production's source record this runtime reads for (YouTube), or null. */
  sourceId: string | null;
  platform: ChatPlatform;
  /** What the operator typed, cleaned: the channel name or the video id. */
  label: string;
  status: ChatSourceStatus;
  /** One line of why, when status is `error`. */
  detail: string | null;
  paused: boolean;
  /** Messages the platform delivered (before throttle/dedupe). */
  received: number;
  /** Messages accepted into the inbox. */
  submitted: number;
  /** Messages refused: dedupe, the local throttle, or the provider's own caps. Visible in the
   *  UI, because a limiter that drops silently is indistinguishable from a broken connector. */
  dropped: number;
  /** Votes sent to the live Multiple choice question (interaction spec, "Chat votes"). */
  votes: number;
}

/** The submit half of the audience plane, as the workspace wires it: the LOCAL provider's own
 *  submit in rehearsal, the join-slug Supabase provider's on a published production - the
 *  viewer's door in both cases, which is the whole point. */
export type ChatSubmit = (deviceToken: string, author: string, body: string, target?: RoundTarget) => Promise<SubmitResult>;

/** The operator door, as the production's audience backend offers it (`addCandidates`). */
export type ChatAdd = (items: CandidateInput[]) => Promise<AudienceSubmission[]>;

/**
 * The door chat votes go through (interaction spec, "Chat votes"; C1 to C10): what is live now, and
 * the production's `audience_operator_votes` (the local room in rehearsal). Wired by the production
 * page, so chat counts as votes only while a production page is open.
 */
export interface ChatVoteDoor {
  /** The round open now, of any kind, or null. Throws when it cannot be read. */
  live(): Promise<AudienceRound | null>;
  send(roundId: string, votes: ChatVote[]): Promise<ChatVoteOutcome>;
}

/** How long a reading of the live round is used before it is read again. */
export const CHAT_LIVE_READ_MS = 3_000;

/** The provenance a Twitch line carries when it goes in through the operator door. */
export const TWITCH_SOURCE = 'Twitch chat';

/** A refused YouTube add is tried again this often, this many times, before it counts as dropped. */
export const CHAT_ADD_RETRY_MS = 5_000;
export const CHAT_ADD_TRIES = 3;

/** The provenance a YouTube chat line carries; the first page says it was said earlier. */
export const CHAT_SOURCE = 'YouTube chat';
export const CHAT_SOURCE_EARLIER = 'YouTube chat · earlier';

// ── The YouTube key: in memory for this tab, in browser storage only when remembered ─────────
let keyInMemory: string | null = null;
const storage = () => (typeof localStorage === 'undefined' ? null : localStorage);

/** The key this tab may use: the one typed this session, else a remembered one, else null. */
export function youtubeKey(): string | null {
  return keyInMemory ?? rememberedKey(storage());
}

/** Use `key` for this session; with `remember`, keep it on this browser, without it forget it. */
export function setYouTubeKey(key: string, remember: boolean): void {
  keyInMemory = key.trim() || null;
  rememberKey(storage(), remember ? keyInMemory : null);
}

/** Whether this browser remembers a key. */
export function youtubeKeyRemembered(): boolean {
  return rememberedKey(storage()) !== null;
}

// ── One reader per browser for a live chat ───────────────────────────────────────────────────
// The Playout tab and the Messages tab both run the production page, and each poll is the
// operator's quota, so a stream's chat is read by one tab: the one holding its claim in browser
// storage, renewed every poll interval, lapsing 15 s after its tab stops (the Sheet reader's rule).
// Only a tab with a key claims, so a key typed in one tab and not remembered keeps the reading there.

/** How long a chat claim lasts unrenewed. */
export const CHAT_CLAIM_MS = 15_000;
const CHAT_CLAIM_KEY = 'spx-gfx-youtube-reader';
const thisTab = Math.random().toString(36).slice(2, 10);

type Claims = Record<string, { tab: string; until: number }>;
const readClaims = (): Claims => {
  try {
    const raw = JSON.parse(storage()?.getItem(CHAT_CLAIM_KEY) ?? '{}') as Claims | null;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
};
const writeClaims = (claims: Claims) => {
  try {
    storage()?.setItem(CHAT_CLAIM_KEY, JSON.stringify(claims));
  } catch {
    /* without storage every tab reads, as before */
  }
};

/** Claim (or renew) the reading of a chat source for this tab; false while another tab holds it.
 *  `take` is the operator's own press here (Connect, Reconnect, a key): it takes the reading over,
 *  and the other tab stops at its next look. */
export function claimChatRead(sourceId: string, now = Date.now(), take = false): boolean {
  const claims = readClaims();
  const held = claims[sourceId];
  if (!take && held && held.tab !== thisTab && held.until > now) return false;
  claims[sourceId] = { tab: thisTab, until: now + CHAT_CLAIM_MS };
  writeClaims(claims);
  return true;
}

/** Let this tab's claims go (the page is leaving, or the source stopped here). */
export function releaseChatRead(sourceId?: string): void {
  const claims = readClaims();
  for (const [id, held] of Object.entries(claims)) if (held.tab === thisTab && (!sourceId || id === sourceId)) delete claims[id];
  writeClaims(claims);
}

/** Another tab of this browser reads this chat source now. */
export function chatReadElsewhere(sourceId: string, now = Date.now()): boolean {
  const held = readClaims()[sourceId];
  return Boolean(held && held.tab !== thisTab && held.until > now);
}

/** Count a call's units against today's estimate. */
export function spendYouTube(units: number): void {
  recordSpend(storage(), units, Date.now());
}

/** A handle the test driver returns: push a line as if the platform delivered it. */
export interface TestChatSource {
  source: ChatSourceState;
  /** `extra.at` is the platform time in ms (now by default); `extra.voter` the voter identity
   *  (`tw:<author>` by default). */
  push(authorName: string, text: string, id?: string, extra?: { at?: number; voter?: string }): void;
}

/** The intake throttle, sized against the DB's per-show burst (20 per 10 s): chat may take at
 *  most half, so the room's own phones always keep the other half. */
export const CHAT_INTAKE_LIMITS = { windowMs: 10_000, maxPerWindow: 10 } as const;

/** The words a platform contributes to the author line. TEXT, never a logo - the audience
 *  category's own rule (src/templates/AGENTS.md), so the same card serves every platform. */
const PLATFORM_WORDS: Record<ChatPlatform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  test: 'Chat',
};

/** The platform's on-screen word, for any surface that names a source. */
export function chatPlatformWord(platform: ChatPlatform): string {
  return PLATFORM_WORDS[platform];
}

/**
 * The synthesized per-author device token. Deterministic on purpose: the same chat user maps
 * to the same token every time, which is what makes the per-device caps meter per PERSON.
 * Shape-clamped to what the DB guard accepts (`^[A-Za-z0-9_-]{8,128}$`) - the `chat-xx-`
 * prefix alone is eight characters, so even an empty author id yields a legal token.
 */
export function chatDeviceToken(platform: ChatPlatform, authorId: string): string {
  const prefix = platform === 'twitch' ? 'chat-tw-' : platform === 'youtube' ? 'chat-yt-' : 'chat-xx-';
  const cleaned = authorId.replace(/[^A-Za-z0-9_-]/g, '-');
  return (prefix + cleaned).slice(0, 128);
}

/**
 * The author line a submission carries: the chat name plus the platform as plain text. The
 * platform has to ride INSIDE an existing field because a submission has nowhere else to put
 * it without a schema change (deliberately not minted for a stopgap), and the author line is
 * the honest place - it is what the moderation surface shows and what the operator edits.
 * The name is trimmed so the platform word always survives the 40-character author cap.
 */
export function chatAuthorLine(platform: ChatPlatform, authorName: string): string {
  const suffix = ' · ' + PLATFORM_WORDS[platform];
  const room = AUDIENCE_LIMITS.author - suffix.length;
  const name = authorName.trim().slice(0, Math.max(1, room));
  return name + suffix;
}

export interface ChatIntake {
  /** A snapshot for rendering - fresh array, stable row objects are NOT handed out. */
  sources(): ChatSourceState[];
  /** Total refused across the production's sources - the one number the UI must show. */
  droppedTotal(): number;
  /** Connect a source. Returns the existing row instead of a duplicate for the same target. */
  add(spec: ChatSourceSpec): ChatSourceState;
  /** The test driver's door - see ChatSourceSpec. */
  addTest(label?: string): TestChatSource;
  remove(id: string): void;
  setPaused(id: string, paused: boolean): void;
  /** The workspace wires the CURRENT provider's viewer-half submit here on mount (it can
   *  change when a production publishes). Messages arriving with nothing wired are dropped. */
  setSubmit(submit: ChatSubmit | null): void;
  /** The operator door YouTube lines go through (the production's current backend). */
  setAdd(add: ChatAdd | null): void;
  /** The door chat votes go through; null leaves every line a message, as before chat votes. */
  setVotes(door: ChatVoteDoor | null): void;
  /** What is live may have changed (this page's Go live or Stop): read it again for the next line. */
  liveChanged(): void;
  /** Whether lines are collected at all. The production page turns it off while it is closed, so
   *  a connected chat stays connected but counts and files nothing until the page is back (C11). */
  setCollecting(on: boolean): void;
  /** The running source for a production source record, if any. */
  forSource(sourceId: string): ChatSourceState | null;
  onChange(cb: () => void): () => void;
  /** Stop every driver. The workspace never calls this on unmount - sources deliberately
   *  survive a trip to Playout, like the local inbox does - but Remove-all paths may. */
  stopAll(): void;
}

interface SourceRuntime {
  state: ChatSourceState;
  driver: ChatDriver | null;
  /** Per-source dedupe of platform message ids, insertion-ordered so it can be trimmed. */
  seen: Set<string>;
}

/** One intake per PRODUCTION for the life of the tab - the localAudienceFor pattern, for the
 *  same reason: the workspace unmounts on every trip to Playout, and a Twitch socket that
 *  died on a tab switch would make the whole feature unusable during a show. */
const byProduction = new Map<string, ChatIntake>();

export function chatIntakeFor(showId: string): ChatIntake {
  const existing = byProduction.get(showId);
  if (existing) return existing;
  const made = createChatIntake();
  byProduction.set(showId, made);
  return made;
}

/** `youtubeIo` lets a Node test run the YouTube reader on recorded pages and a fake clock. */
export function createChatIntake(options: { youtubeIo?: YouTubeIo } = {}): ChatIntake {
  const runtimes: SourceRuntime[] = [];
  const listeners: Array<() => void> = [];
  /** Accept timestamps across ALL of this production's sources - the throttle is per
   *  production because the DB burst cap it protects is per show, not per connector. */
  const accepts: number[] = [];
  let submit: ChatSubmit | null = null;
  let add: ChatAdd | null = null;
  let voteDoor: ChatVoteDoor | null = null;
  /** The last reading of the live round, and when it was read (CHAT_LIVE_READ_MS). */
  let liveRead: { at: number; round: AudienceRound | null } | null = null;
  /** Moves on every `liveChanged`, so a reading already under way is known to be stale. */
  let liveGeneration = 0;
  /** Per voter, the newest vote sorted so far (C4). Bounded like the dedupe set. */
  const newestSeen = new Map<string, ChatVote>();
  /** The chain vote sends run on, one at a time. */
  let sending: Promise<void> = Promise.resolve();
  /** False while no production page is open in this tab: lines are not collected (C11). */
  let collecting = true;
  /** Lines waiting for a reading of the live round, in arrival order. */
  const unsorted: Array<{ runtime: SourceRuntime; message: ChatDriverMessage; text: string }> = [];
  let sorting = false;
  const changed = () => listeners.forEach((cb) => cb());
  /** YouTube lines waiting for the operator door, per source: a page goes in as one call. */
  const outbox = new Map<SourceRuntime, CandidateInput[]>();
  /** Lines the door refused, kept for another try: the driver has read past them, so a dropped
   *  line would never come back. The database skips an id it already holds, so a retry is safe. */
  const retries = new Map<SourceRuntime, { items: CandidateInput[]; tries: number }>();
  const retryLater = (runtime: SourceRuntime, items: CandidateInput[]) => {
    const held = retries.get(runtime) ?? { items: [], tries: 0 };
    // One try per round: a page sent as several chunks that all fail in one round is one try.
    const firstOfRound = held.items.length === 0;
    held.items.push(...items);
    if (firstOfRound) held.tries += 1;
    if (held.tries > CHAT_ADD_TRIES) {
      runtime.state.dropped += held.items.length;
      retries.delete(runtime);
      changed();
      return;
    }
    retries.set(runtime, held);
    if (firstOfRound) setTimeout(() => flush(runtime), CHAT_ADD_RETRY_MS);
  };
  function flush(runtime: SourceRuntime) {
    const held = retries.get(runtime);
    const items = [...(held?.items ?? []), ...(outbox.get(runtime) ?? [])];
    outbox.delete(runtime);
    if (held) held.items = [];
    if (runtime.state.status === 'stopped') {
      retries.delete(runtime);
      return;
    }
    const send = add;
    if (!send) return retryLater(runtime, items);
    for (let at = 0; at < items.length; at += OPERATOR_ADD_MAX) {
      const chunk = items.slice(at, at + OPERATOR_ADD_MAX);
      send(chunk)
        .then((added) => {
          // The database skips an id it already holds: that is a dedupe, counted as dropped.
          runtime.state.submitted += added.length;
          runtime.state.dropped += chunk.length - added.length;
          if (retries.get(runtime)?.items.length === 0) retries.delete(runtime);
          changed();
        })
        .catch(() => retryLater(runtime, chunk));
    }
    changed();
  }

  /** Deterministic fallback ids for platforms/messages that carry none - still deduped, so a
   *  driver re-delivering the exact same line in the same moment cannot double-post. */
  let fallbackSeq = 0;

  const accept = (runtime: SourceRuntime, message: ChatDriverMessage) => {
    const { state } = runtime;
    // Paused means NOT COLLECTING - nothing counts, nothing is remembered. An operator pausing
    // a firehose does not want to come back to ten minutes of backlog marked "dropped".
    if (state.paused || state.status === 'stopped' || !collecting) return;
    const text = message.text.trim();
    if (!text) return;
    state.received += 1;

    // DEDUPE before anything else: reconnects and poll overlaps re-deliver, and a re-delivered
    // line must cost nothing downstream. The set is bounded - a show-length source would
    // otherwise grow it without limit.
    const key = message.id ?? `${message.authorId} ${text} ${fallbackSeq++}`;
    if (message.id && runtime.seen.has(key)) {
      state.dropped += 1;
      changed();
      return;
    }
    runtime.seen.add(key);
    if (runtime.seen.size > 4096) {
      for (const old of runtime.seen) {
        runtime.seen.delete(old);
        if (runtime.seen.size <= 2048) break;
      }
    }

    // With a vote door, every line waits for a reading of what is live: a vote needs its round, and
    // a Twitch line goes to the inbox unless an Open question is live (C10).
    if (voteDoor) {
      unsorted.push({ runtime, message, text });
      if (!sorting) void sortWaiting();
      return;
    }
    route(runtime, message, text, undefined);
  };

  const readLive = async (fresh = false): Promise<AudienceRound | null> => {
    for (;;) {
      const door = voteDoor;
      if (!door) return null;
      if (!fresh && liveRead && Date.now() - liveRead.at < CHAT_LIVE_READ_MS) return liveRead.round;
      // A reading that started before this page's Go live or Stop is thrown away and read again,
      // so it never overwrites what that press made live.
      const generation = liveGeneration;
      const round = await door.live();
      if (generation !== liveGeneration) continue;
      liveRead = { at: Date.now(), round };
      return round;
    }
  };

  /** The live round for a batch. A failed reading is tried again, never taken as "nothing live";
   *  after CHAT_ADD_TRIES the lines go on as before chat votes (`undefined`). */
  const readForBatch = async (): Promise<AudienceRound | null | undefined> => {
    for (let tries = 0; ; tries += 1) {
      try {
        return await readLive();
      } catch {
        if (tries >= CHAT_ADD_TRIES || !voteDoor) return undefined;
        await new Promise((r) => setTimeout(r, CHAT_ADD_RETRY_MS));
      }
    }
  };

  /** Sort waiting lines into votes and messages against one reading of the live round. */
  async function sortWaiting() {
    sorting = true;
    try {
      while (unsorted.length) {
        const round = await readForBatch();
        const batch = unsorted.splice(0, unsorted.length);
        const votes: Array<{ runtime: SourceRuntime; vote: ChatVote }> = [];
        for (const { runtime, message, text } of batch) {
          if (runtime.state.status === 'stopped') continue;
          const option = round?.kind === 'poll' ? voteOption(text, round.options.length) : null;
          if (round && option !== null) {
            // C1, C6: a vote counts once, from a known voter, said inside the window. The window
            // alone judges the earlier page, a paused backlog and a replay. A vote-shaped line that
            // does not count is not a message either (C11).
            const voter = message.voter ?? (runtime.state.platform === 'test' ? chatVoter('twitch', message.authorId) : null);
            const at = message.at ?? (runtime.state.platform === 'test' ? Date.now() : NaN);
            if (!voter || !inVoteWindow(at, round)) {
              runtime.state.dropped += 1;
              continue;
            }
            const vote = { voter, option, at: new Date(at).toISOString() };
            // C4: remember the newest vote seen from this voter, by platform time and then by
            // arrival, so a send that is retried later never overwrites it.
            const seen = newestSeen.get(voter);
            if (!seen || at >= Date.parse(seen.at)) {
              newestSeen.delete(voter); // re-inserted last, so the trim below drops the oldest
              newestSeen.set(voter, vote);
              if (newestSeen.size > 20_000) for (const old of newestSeen.keys()) if (newestSeen.size > 10_000) newestSeen.delete(old); else break;
            }
            votes.push({ runtime, vote });
            continue;
          }
          route(runtime, message, text, round);
        }
        if (round && votes.length) sendVotes(round, votes, 0, false);
        changed();
      }
    } finally {
      sorting = false;
    }
  }

  /** Send votes for `round`, CHAT_VOTES_MAX a call, each voter's latest only (C3, C4, C7). */
  function sendVotes(round: AudienceRound, votes: Array<{ runtime: SourceRuntime; vote: ChatVote }>, tries: number, rerouted: boolean) {
    const latest = new Set(latestPerVoter(votes.map((v) => v.vote)));
    const kept = votes.filter((v) => latest.has(v.vote));
    for (let at = 0; at < kept.length; at += CHAT_VOTES_MAX) {
      const slice = kept.slice(at, at + CHAT_VOTES_MAX);
      // One send at a time, in the order the votes arrived: the server breaks a tie of equal
      // platform times by arrival, so two calls must never cross.
      sending = sending.then(() => sendChunk(round, slice, tries, rerouted));
    }
  }

  async function sendChunk(round: AudienceRound, slice: Array<{ runtime: SourceRuntime; vote: ChatVote }>, tries: number, rerouted: boolean) {
    const door = voteDoor;
    // A vote a newer one from the same voter has replaced since it was sorted (a retry, mostly)
    // is not sent: it would overwrite the newer choice when their platform times are equal.
    const chunk = slice.filter((v) => newestSeen.get(v.vote.voter) === v.vote);
    for (const v of slice) if (!chunk.includes(v)) v.runtime.state.dropped += 1;
    if (chunk.length === 0) return changed();
    const fail = () => {
      if (tries + 1 > CHAT_ADD_TRIES) {
        for (const v of chunk) v.runtime.state.dropped += 1;
        changed();
        return;
      }
      setTimeout(() => sendVotes(round, chunk, tries + 1, rerouted), CHAT_ADD_RETRY_MS);
    };
    if (!door) return fail();
    await door
      .send(round.id, chunk.map((v) => v.vote))
      .then(async (outcome) => {
        if (!outcome.closed) {
          // What the server counted: a vote older than one it already holds changes nothing, and
          // shows as dropped rather than as a vote (the call does not say which, only how many).
          let counted = outcome.counted;
          for (const v of chunk) {
            if (counted > 0) {
              v.runtime.state.votes += 1;
              counted -= 1;
            } else v.runtime.state.dropped += 1;
          }
          changed();
          return;
        }
        // C5: the round closed under these votes. Once, read what is live now: a vote said after
        // the next Multiple choice question went live counts there; anything else is dropped.
        const now = rerouted ? null : await readLive(true).catch(() => null);
        if (now && now.kind === 'poll' && now.id !== round.id) {
          const moved = chunk.filter((v) => inVoteWindow(Date.parse(v.vote.at), now) && v.vote.option < now.options.length);
          for (const v of chunk) if (!moved.includes(v)) v.runtime.state.dropped += 1;
          if (moved.length) sendVotes(now, moved, 0, true);
        } else {
          for (const v of chunk) v.runtime.state.dropped += 1;
        }
        changed();
      })
      .catch(fail);
  }

  /** Queue a line for the operator door: one call per source and moment (`flush`). */
  const queueAdd = (runtime: SourceRuntime, item: CandidateInput) => {
    const queued = outbox.get(runtime) ?? [];
    if (queued.length === 0) queueMicrotask(() => flush(runtime));
    queued.push(item);
    outbox.set(runtime, queued);
  };

  /** A line that is not a vote: into the inbox, as before chat votes. */
  const route = (runtime: SourceRuntime, message: ChatDriverMessage, text: string, round: AudienceRound | null | undefined) => {
    const { state } = runtime;
    if (state.platform === 'youtube') {
      // The operator door: no viewer caps to protect, and the page cadence bounds the rate.
      queueAdd(runtime, {
        author: message.authorName.trim() || message.authorId,
        body: text,
        externalId: message.id ? `yt:${message.id}` : null,
        source: message.earlier ? CHAT_SOURCE_EARLIER : CHAT_SOURCE,
      });
      return;
    }

    // THE LOCAL THROTTLE - synchronous, before any write, shared across the production's
    // sources. What it refuses is counted where the operator can see it.
    const now = Date.now();
    while (accepts.length && now - accepts[0] > CHAT_INTAKE_LIMITS.windowMs) accepts.shift();
    if (accepts.length >= CHAT_INTAKE_LIMITS.maxPerWindow) {
      state.dropped += 1;
      changed();
      return;
    }
    accepts.push(now);

    // C10: a Twitch line answers the live Open question through the viewer door (R20); with a vote
    // door wired and no Open question live, it reaches the inbox through the operator door.
    // The test source stands in for Twitch here, so the offline suite drives this rule too.
    if ((state.platform === 'twitch' || state.platform === 'test') && round !== undefined && round?.kind !== 'open' && add) {
      queueAdd(runtime, {
        author: message.authorName.trim() || message.authorId,
        body: text,
        externalId: message.id ? `tw:${message.id}` : null,
        source: state.platform === 'twitch' ? TWITCH_SOURCE : 'Test chat',
      });
      changed();
      return;
    }

    const send = submit;
    if (!send) {
      state.dropped += 1;
      changed();
      return;
    }

    // The round this batch was sorted against is the one the line answers, so the viewer door does
    // not read what is live a second time.
    const target = round?.kind === 'open' ? { roundId: round.id, revision: round.revision } : undefined;
    send(chatDeviceToken(state.platform, message.authorId), chatAuthorLine(state.platform, message.authorName || message.authorId), text, target)
      .then((result) => {
        // A provider refusal (the door is closed, the author hit their own cap) is a DROP the
        // operator can see, never an exception: the caps are working as designed.
        if (result.ok) state.submitted += 1;
        else state.dropped += 1;
        changed();
      })
      .catch(() => {
        state.dropped += 1;
        changed();
      });
    changed();
  };

  const handlersFor = (runtime: SourceRuntime): ChatDriverHandlers => ({
    onMessage: (message) => accept(runtime, message),
    onStatus: (status, detail) => {
      if (runtime.state.status === 'stopped') return; // a late socket event after Remove
      runtime.state.status = status;
      runtime.state.detail = status === 'error' ? (detail ?? 'Connection failed.') : null;
      changed();
    },
    onSpend: (units) => {
      spendYouTube(units);
      changed();
    },
  });

  const makeRuntime = (platform: ChatPlatform, label: string, sourceId: string | null = null): SourceRuntime => {
    const state: ChatSourceState = {
      id: uuid(),
      sourceId,
      platform,
      label,
      status: 'connecting',
      detail: null,
      paused: false,
      received: 0,
      submitted: 0,
      dropped: 0,
      votes: 0,
    };
    const runtime: SourceRuntime = { state, driver: null, seen: new Set() };
    runtimes.push(runtime);
    return runtime;
  };

  const intake: ChatIntake = {
    sources: () => runtimes.map((r) => ({ ...r.state })),
    droppedTotal: () => runtimes.reduce((sum, r) => sum + r.state.dropped, 0),

    add(spec) {
      const label = spec.platform === 'twitch' ? spec.channel : spec.platform === 'youtube' ? spec.videoId : (spec.label ?? 'Test');
      const dup = runtimes.find((r) => r.state.platform === spec.platform && r.state.label === label && r.state.status !== 'stopped');
      if (dup) return { ...dup.state };
      const runtime = makeRuntime(spec.platform, label, spec.platform === 'youtube' ? (spec.sourceId ?? null) : null);
      if (spec.platform === 'twitch') runtime.driver = twitchChatDriver(spec.channel, handlersFor(runtime));
      else if (spec.platform === 'youtube') runtime.driver = youtubeChatDriver(spec.videoId, spec.apiKey, handlersFor(runtime), options.youtubeIo);
      changed();
      return { ...runtime.state };
    },

    addTest(label = 'Test') {
      const runtime = makeRuntime('test', label);
      runtime.state.status = 'live';
      changed();
      return {
        source: { ...runtime.state },
        push: (authorName, text, id, extra) =>
          accept(runtime, { id: id ?? null, authorId: authorName.toLowerCase(), authorName, text, ...(extra?.at !== undefined ? { at: extra.at } : {}), ...(extra?.voter ? { voter: extra.voter } : {}) }),
      };
    },

    remove(id) {
      const at = runtimes.findIndex((r) => r.state.id === id);
      if (at < 0) return;
      runtimes[at].state.status = 'stopped';
      runtimes[at].driver?.stop();
      runtimes.splice(at, 1);
      changed();
    },

    setPaused(id, paused) {
      const runtime = runtimes.find((r) => r.state.id === id);
      if (!runtime || runtime.state.paused === paused) return;
      runtime.state.paused = paused;
      runtime.driver?.setPaused?.(paused);
      changed();
    },

    setSubmit(fn) {
      submit = fn;
    },

    setAdd(fn) {
      add = fn;
    },

    setVotes(door) {
      voteDoor = door;
      liveRead = null;
    },

    liveChanged() {
      liveRead = null;
      liveGeneration += 1;
    },

    setCollecting(on) {
      collecting = on;
    },

    forSource(sourceId) {
      const runtime = runtimes.find((r) => r.state.sourceId === sourceId && r.state.status !== 'stopped');
      return runtime ? { ...runtime.state } : null;
    },

    onChange(cb) {
      listeners.push(cb);
      return () => {
        const at = listeners.indexOf(cb);
        if (at >= 0) listeners.splice(at, 1);
      };
    },

    stopAll() {
      for (const runtime of runtimes) {
        runtime.state.status = 'stopped';
        runtime.driver?.stop();
      }
      runtimes.length = 0;
      changed();
    },
  };

  return intake;
}

// THE TEST SEAM. The offline e2e suite drives the pipeline through this window handle rather
// than by importing the module in an evaluate: a dev server can resolve an evaluate's import
// to a SECOND module instance (the ghost-store trap), whose registry would be empty while the
// app's own carries the sources the UI shows. The handle the APP registered is unambiguous.
// Dev-only: a production build carries no seam.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__noacgChatIntake = { for: chatIntakeFor };
}
