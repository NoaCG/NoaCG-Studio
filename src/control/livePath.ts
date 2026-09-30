// THE LIVE PATH, MADE VISIBLE (Phase 6 Step 1: docs/work-specs/playout-runtime-reliability/spec.md
// AC-8 and AC-9; the evidence is docs/PLAYOUT_ISOLATION_RESEARCH.md §5.6, §9.2 and §13.3).
//
// Until this file an operator had ONE health signal: `control_shows.output_seen_at`, a single
// timestamp that whichever renderer wrote last overwrites, sent over REST every 60 s and read by
// the production page alone. It said nothing about the road commands actually take. Measured on
// the branch (§5.6): with Realtime refused and REST fine, four Takes reached the output 12 to 26 s
// late through the poll floor while that signal stayed green the whole time, and the hosted page
// and the phone showed nothing at all.
//
// So this file gives every page on the live path three things, and acts on none of them yet
// (report-only; READY in Step 3 is the first thing that will):
//
//   WHO IT IS      a per-tab instance id, the host engine in words, the renderer build and the
//                  wire protocol version.
//   HOW IT HEARS   per road counters and press-to-frame latency, stamped from a press time the
//                  sender puts on every command.
//   WHO IS THERE   a Realtime PRESENCE entry on the production's private topic `live-<show id>`
//                  (migration 0068). Presence is held by the socket, not by the database: an
//                  entry vanishes when its page does, and no write goes through the Postgres the
//                  signal is meant to warn about. A server without 0068 refuses the join, and
//                  everything else keeps working; the health line then falls back to
//                  `output_seen_at`.
//
// Old CEF note: this module is loaded by the output renderer, which CasparCG 2.3 runs in
// Chromium 71. No `crypto.randomUUID`, no `Array.prototype.at`, no `Object.fromEntries` here.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '../backend/supabase';
import { LIVE_BATCH_EVENT, mintOid } from './commandRoads';

// ── WHO IT IS ────────────────────────────────────────────────────────────────────────────────

/**
 * THE LIVE-PATH WIRE PROTOCOL a page speaks. 1 is today's: a verb is a `control_send_many` call,
 * the database writes the durable row and emits the fast-road frame (commandRoads.ts). Step 2
 * raises it when a command starts carrying a per-show sequence and a revision; a page reports
 * it so the health line can say when an old renderer is still on air.
 */
export const LIVE_PROTOCOL = 1;

declare const __NOACG_BUILD__: string | undefined;

/** The build this page was served from: the short commit the bundle was built at (vite.config.ts
 *  stamps it), or `dev` where nothing stamped it. */
export const LIVE_BUILD: string = typeof __NOACG_BUILD__ === 'string' && __NOACG_BUILD__ ? __NOACG_BUILD__ : 'dev';

const INSTANCE_KEY = 'noacg-live-instance';
let instance: string | null = null;

/** Twelve lowercase alphanumerics off the command id minter, which already knows old CEF. */
function randomId(): string {
  let id = '';
  while (id.length < 12) id += mintOid().replace(/[^a-z0-9]/g, '');
  return id.slice(0, 12);
}

/**
 * THIS PAGE'S INSTANCE ID: stable across a reload of the same tab or browser source, different
 * for every tab.
 *
 * SESSION storage, on purpose. Local storage is shared by every page of the origin in one
 * browser, and two OBS browser sources, or two CasparCG layers, are two pages in one browser: they
 * would report one id and read as one output. Session storage is per browsing context, so each
 * source keeps its own id through a reload and loses it when the host restarts - CasparCG 2.3
 * loses every storage on restart anyway, and a fresh id then is honest: it IS a new renderer.
 * Storage that throws (a sandboxed host, a privacy mode) costs only stability: a fresh id.
 */
export function liveInstanceId(): string {
  if (instance) return instance;
  try {
    const kept = window.sessionStorage.getItem(INSTANCE_KEY);
    if (kept && /^[a-z0-9]{8,32}$/.test(kept)) return (instance = kept);
  } catch {
    // no storage here: a fresh id below
  }
  const fresh = randomId();
  try {
    window.sessionStorage.setItem(INSTANCE_KEY, fresh);
  } catch {
    // nothing to keep it in; it lives as long as this page
  }
  return (instance = fresh);
}

/**
 * WHICH HOST IS RENDERING THIS, in the words an operator uses: "CasparCG · Chromium 71",
 * "OBS · Chromium 127", "Chrome 140".
 *
 * The markers are what each host puts on the page itself. OBS exposes `window.obsstudio`.
 * CasparCG's HTML producer defines `window.caspar` (2.3.3 and 2.5.0, read off both servers'
 * binaries on 2026-09-30; 2.5 adds `window.casparcg`). It is injected by the host rather than
 * sent in the user agent, so this is asked at call time, never cached at module load. vMix has no
 * marker this could verify (vMix is not installed here), so it is named only if its user agent
 * says so, and otherwise reads as the Chromium it embeds. The CasparCG VERSION is not guessed
 * from the Chromium number: the embedded CEF changed inside the 2.3 line.
 */
export function hostEngine(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  win: object = typeof window === 'undefined' ? {} : window,
): string {
  type Marked = { obsstudio?: unknown; caspar?: unknown; casparcg?: unknown; top?: unknown };
  let host = win as Marked;
  // Loaded through the output embed (export/outputEmbed.ts) this page is a frame inside the page
  // the host loaded, and the host may mark only its own top frame. The embed is cross-origin, where
  // reading the top frame throws: then this frame's own markers are all there is.
  try {
    const top = host.top as Marked | undefined;
    if (top && top !== win && !host.obsstudio && !host.caspar && (top.obsstudio || top.caspar || top.casparcg)) host = top;
  } catch {
    // cross-origin top frame
  }
  const chromium = /(?:HeadlessChrome|Chromium|Chrome)\/(\d+)/.exec(ua);
  const cr = chromium ? `Chromium ${chromium[1]}` : null;
  const embedded = (name: string) => (cr ? `${name} · ${cr}` : name);
  if (host.obsstudio) return embedded('OBS');
  if (host.caspar || host.casparcg) return embedded('CasparCG');
  if (/vMix/i.test(ua)) return embedded('vMix');
  const edge = / Edg(?:A|iOS)?\/(\d+)/.exec(ua);
  if (edge) return `Edge ${edge[1]}`;
  const firefox = / (?:Firefox|FxiOS)\/(\d+)/.exec(ua);
  if (firefox) return `Firefox ${firefox[1]}`;
  const crios = / CriOS\/(\d+)/.exec(ua);
  if (crios) return `Chrome ${crios[1]}`;
  if (chromium) return `${/HeadlessChrome/.test(ua) ? 'Headless Chrome' : 'Chrome'} ${chromium[1]}`;
  const safari = / Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//.exec(ua);
  if (safari) return `Safari ${safari[1]}`;
  return ua ? ua.slice(0, 40) : 'unknown';
}

// ── THE SENDER'S STAMP ───────────────────────────────────────────────────────────────────────

/**
 * WHAT A SENDING PAGE PUTS ON EVERY COMMAND, under the msg key `snd`: its instance, build and
 * protocol, and the PRESS time on its own clock.
 *
 * It rides the log exactly the way `oid` does (commandRoads.ts): `control_send_many` checks only
 * `t` and `graphic` and stores `msg` verbatim, so an extra key needs no migration and comes back
 * on the row and on the fast-road frame. About 70 bytes per command.
 *
 * Press-to-receive is only EXACT when sender and output share a machine: across machines it
 * carries their clock difference, usually well under 100 ms with network time and occasionally
 * seconds without it. The receive-to-apply and apply-to-frame legs are measured on one clock and
 * are always exact.
 */
export interface SenderStamp {
  /** The sender's instance id. */
  i: string;
  /** The sender's build. */
  b: string;
  /** The sender's live-path protocol. */
  p: number;
  /** When the operator pressed, in the sender's epoch milliseconds. */
  at: number;
}

export function withSender<M extends object>(msg: M, pressedAt: number): M & { snd: SenderStamp } {
  return { ...msg, snd: { i: liveInstanceId(), b: LIVE_BUILD, p: LIVE_PROTOCOL, at: pressedAt } };
}

/** The stamp a command carries, or null: server-written rows and older senders carry none. */
export function senderOf(msg: unknown): SenderStamp | null {
  const snd = (msg as { snd?: Partial<SenderStamp> } | null)?.snd;
  if (!snd || typeof snd !== 'object' || typeof snd.at !== 'number' || !isFinite(snd.at)) return null;
  return {
    i: typeof snd.i === 'string' ? snd.i : '',
    b: typeof snd.b === 'string' ? snd.b : '',
    p: typeof snd.p === 'number' ? snd.p : 0,
    at: snd.at,
  };
}

/** What a sending page counts about its own sends: verbs sent, and sends that finally failed
 *  (unanswered or refused). Module-wide, because a page has one sender. */
export interface SenderCounters {
  sent: number;
  failed: number;
}
const sends: SenderCounters = { sent: 0, failed: 0 };
const sendListeners = new Set<() => void>();

export function noteSend(ok: boolean): void {
  if (ok) sends.sent += 1;
  else sends.failed += 1;
  sendListeners.forEach((listener) => listener());
}

export function senderCounters(): SenderCounters {
  return { sent: sends.sent, failed: sends.failed };
}

export function onSendCounted(listener: () => void): () => void {
  sendListeners.add(listener);
  return () => sendListeners.delete(listener);
}

// ── HOW IT HEARS: the output's counters and latency ──────────────────────────────────────────

/** The road a command reached this output by: the fast broadcast, the log topic, or a tail read
 *  (the 30 s poll floor, a hole, or the refill after a rejoin - one bucket, because every row a
 *  tail read returns is a row the socket did not deliver in time). */
export type LiveRoad = 'fast' | 'log' | 'tail';
const ROADS: LiveRoad[] = ['fast', 'log', 'tail'];

/** Press to receive beyond this is LATE. The fan-out's slow mode is about 650 ms (commandRoads.ts)
 *  and a healthy Take reaches the output in 90 to 400 ms; a command through the poll floor is 10
 *  to 30 s. Two seconds sits clear of the first and far below the second. */
export const LATE_MS = 2000;

/** How many samples each road keeps for its percentiles: enough for a p95 to mean something,
 *  small enough to sort on every command. */
const SAMPLES_PER_ROAD = 50;

/** One stamped command's timeline, as three legs in milliseconds. */
export interface LiveSample {
  road: LiveRoad;
  /** Press to receive (cross-clock unless sender and output share a machine). */
  rx: number;
  /** Receive to handed to the stage. */
  apply: number;
  /** Handed to the stage to the first frame after it (two animation frames: an approximation). */
  frame: number;
}

export interface LatencySummary {
  n: number;
  /** Press to first frame, median. */
  p50: number;
  p95: number;
}

export interface LiveSummary {
  /** Commands received per road, duplicates included. */
  rx: Record<LiveRoad, number>;
  /** Arrivals dropped because the other road had already applied them (one per command when
   *  both roads work, so `dup` well below `fast` means the log road is losing commands). */
  dup: number;
  /** Id holes the follower could not close by waiting, each recovered by a tail read. */
  holes: number;
  /** Tail reads that found rows the socket had not delivered. */
  refills: number;
  /** Commands that reached this output more than LATE_MS after their press. */
  late: number;
  /** Commands the server refused as stale. Always 0 until Step 2's revision check exists; kept so
   *  the entry's shape does not change when it does. */
  refused: number;
  /** Press to first frame per road, over the last SAMPLES_PER_ROAD stamped commands. */
  lat: Partial<Record<LiveRoad, LatencySummary>>;
  /** The newest stamped command. */
  last: LiveSample | null;
}

/** Only these reach the stage. Status rows ('cue', 'staged', 'live') are the operator pages' and
 *  are neither counted nor timed. */
const RENDERER_COMMANDS = new Set(['update', 'play', 'stop', 'next', 'event', 'snap']);
const isRendererCommand = (msg: unknown) => RENDERER_COMMANDS.has((msg as { t?: string } | null)?.t ?? '');

export interface LiveStats {
  received(road: LiveRoad, msg: unknown): void;
  duplicate(msg: unknown): void;
  /** The first arrival of a command was handed to the stage at `Date.now()`; it arrived at `rxAt`. */
  applied(road: LiveRoad, msg: unknown, rxAt: number): void;
  hole(): void;
  refilled(): void;
  summary(): LiveSummary;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}

export function createLiveStats(opts: {
  onChange?: () => void;
  /** Injected so a spec can stand in for the animation frame. */
  frame?: (then: () => void) => void;
  now?: () => number;
} = {}): LiveStats {
  const now = opts.now ?? (() => Date.now());
  // Two animation frames after the stage is handed a command: the first runs before the paint
  // that follows the hand-over, the second after it. The iframe paints on its own schedule, so
  // this is the parent's first presented frame after the command, not a pixel readback.
  const frame =
    opts.frame ??
    ((then: () => void) => {
      if (typeof requestAnimationFrame !== 'function') return then();
      requestAnimationFrame(() => requestAnimationFrame(() => then()));
    });
  const rx: Record<LiveRoad, number> = { fast: 0, log: 0, tail: 0 };
  const counts = { dup: 0, holes: 0, refills: 0, late: 0 };
  const samples: Record<LiveRoad, number[]> = { fast: [], log: [], tail: [] };
  let last: LiveSample | null = null;
  const changed = () => opts.onChange?.();
  return {
    received(road, msg) {
      if (!isRendererCommand(msg)) return;
      rx[road] += 1;
      changed();
    },
    duplicate(msg) {
      if (!isRendererCommand(msg)) return;
      counts.dup += 1;
      changed();
    },
    applied(road, msg, rxAt) {
      if (!isRendererCommand(msg)) return;
      const stamp = senderOf(msg);
      if (!stamp) return;
      const appliedAt = now();
      const toRx = Math.round(rxAt - stamp.at);
      if (toRx > LATE_MS) {
        counts.late += 1;
        changed();
      }
      frame(() => {
        const sample = { road, rx: toRx, apply: Math.round(appliedAt - rxAt), frame: Math.round(now() - appliedAt) };
        last = sample;
        const list = samples[road];
        list.push(sample.rx + sample.apply + sample.frame);
        if (list.length > SAMPLES_PER_ROAD) list.shift();
        changed();
      });
    },
    hole() {
      counts.holes += 1;
      changed();
    },
    refilled() {
      counts.refills += 1;
      changed();
    },
    summary() {
      const lat: Partial<Record<LiveRoad, LatencySummary>> = {};
      for (const road of ROADS) {
        const list = samples[road];
        if (list.length === 0) continue;
        const sorted = [...list].sort((a, b) => a - b);
        lat[road] = { n: list.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
      }
      return { rx: { ...rx }, ...counts, refused: 0, lat, last };
    },
  };
}

/** The debug line's one-line reading of a summary. */
export function describeLiveSummary(s: LiveSummary): string {
  const roads = `fast ${s.rx.fast} · log ${s.rx.log} · tail ${s.rx.tail}`;
  const faults = `dup ${s.dup} · holes ${s.holes} · refills ${s.refills} · late ${s.late}`;
  const last = s.last
    ? ` | last (${s.last.road}) press→rx ${s.last.rx} ms, →stage ${s.last.apply} ms, →frame ${s.last.frame} ms`
    : '';
  const p50 = ROADS.filter((road) => s.lat[road])
    .map((road) => `${road} p50 ${s.lat[road]!.p50} / p95 ${s.lat[road]!.p95} ms`)
    .join(', ');
  return `${roads} | ${faults}${last}${p50 ? ` | ${p50}` : ''}`;
}

// ── WHO IS THERE: Presence on `live-<show id>` ────────────────────────────────────────────────

/** The production's PRIVATE presence topic (migration 0068): readable and trackable by a holder
 *  of the show id - the reach the `log-` and `cmd-` topics have - and written by nobody but
 *  Presence itself and, on a server with migration 0070, the database's numbered-log frames
 *  (commandRoads.ts `LIVE_BATCH_EVENT`), so no client can broadcast on it. */
export function liveTopic(showId: string): string {
  return `live-${showId}`;
}

/** One page's Presence entry. Small on purpose: every update goes to every page on the topic. */
export interface LiveEntry {
  kind: 'output' | 'operator';
  /** The instance id (`liveInstanceId`). */
  id: string;
  engine: string;
  build: string;
  proto: number;
  /** Which page: 'output', 'production' (the in-app dashboard) or 'hosted' (the control link). */
  surface: string;
  /** Is the log channel joined right now? null when the page does not follow the log (yet). */
  log: boolean | null;
  /** Is the fast command channel joined right now? null when the page does not follow it. */
  cmd: boolean | null;
  /** When the entry was written, on its own clock. */
  at: number;
  /** An output's LiveSummary, an operator's SenderCounters. */
  stats?: LiveSummary | SenderCounters;
}

/** This page's entry as it stands now: who it is, filled in here, and what only the caller knows. */
export function liveEntry(
  kind: LiveEntry['kind'],
  surface: string,
  roads: { log: boolean | null; cmd: boolean | null },
  stats?: LiveEntry['stats'],
): LiveEntry {
  return {
    kind,
    id: liveInstanceId(),
    engine: hostEngine(),
    build: LIVE_BUILD,
    proto: LIVE_PROTOCOL,
    surface,
    log: roads.log,
    cmd: roads.cmd,
    at: Date.now(),
    stats,
  };
}

/** A Presence entry read off the wire, or null when it is not one. Anyone holding the show id can
 *  track an entry, so an entry is checked like any other input. */
export function readLiveEntry(meta: unknown): LiveEntry | null {
  const m = meta as Partial<LiveEntry> | null;
  if (!m || (m.kind !== 'output' && m.kind !== 'operator') || typeof m.id !== 'string') return null;
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : null);
  const text = (v: unknown, fallback: string) => (typeof v === 'string' ? v.slice(0, 80) : fallback);
  return {
    kind: m.kind,
    id: m.id.slice(0, 40),
    engine: text(m.engine, 'unknown'),
    build: text(m.build, ''),
    proto: typeof m.proto === 'number' ? m.proto : 0,
    surface: text(m.surface, ''),
    log: bool(m.log),
    cmd: bool(m.cmd),
    at: typeof m.at === 'number' ? m.at : 0,
    stats: m.stats && typeof m.stats === 'object' ? m.stats : undefined,
  };
}

/** Where a page's Presence stands. `joined` means the peers it reports are current; anything else
 *  means they are not, and the health line falls back to `output_seen_at`. `off` is a build with no
 *  backend. */
export type LivePresenceStatus = 'off' | 'joining' | 'joined' | 'down';

export interface LivePresence {
  /** Re-send this page's entry. Throttled to one track per MIN_TRACK_MS, and skipped when nothing
   *  but the timestamp changed. */
  touch(): void;
  close(): void;
}

/** Every track goes to every page on the topic, so an output under a busy show re-announces at
 *  most this often; its counters are a few seconds behind, which nothing reads live. */
const MIN_TRACK_MS = 5000;
/** A join refused before it ever succeeded (a server without 0068, or no Realtime at all) is asked
 *  again on this backoff instead of supabase-js's own 1 to 10 s rejoin loop: a private join is
 *  authorised by a database query, and a refused one would otherwise cost that query every 10 s
 *  per page for the whole show. */
const RETRY_FIRST_MS = 15_000;
const RETRY_MAX_MS = 120_000;

// ── ONE JOIN PER PAGE AND PRODUCTION on `live-<show id>` ─────────────────────────────────────
//
// Two things ride this topic: Presence (below) and, on a server with migration 0070, the numbered
// log's frames (hostedControl.ts `followLiveSeq`). supabase-js hands back the SAME channel object
// for a topic a page already has, a second `subscribe` on it never reports, and removing it for one
// user removes it for every user. So a page joins the topic here, once per production, with every
// binding in place before the subscribe, and each user registers for what it wants to hear. The
// join leaves when its last user does.

/** What one user of the topic hears. */
export interface LiveTopicUser {
  /** Each status the join reports ('SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'; 'off' in
   *  a build with no backend). A user that arrives after the join hears where it stands at once. */
  onStatus?: (status: string) => void;
  /** A numbered-log frame's payload, unread (`LIVE_BATCH_EVENT`). */
  onBatch?: (payload: unknown) => void;
  /** A Presence event, with the channel it came from: a refused join is asked again on a new
   *  channel, whose Presence starts empty. */
  onPresence?: (event: 'join' | 'leave' | 'sync', payload: unknown, channel: RealtimeChannel) => void;
}

export interface LiveTopicJoin {
  /** The channel as it stands: null before the join opens and between a refused join and its retry. */
  channel(): RealtimeChannel | null;
  leave(): void;
}

interface LiveTopicState {
  users: Set<LiveTopicUser>;
  channel: RealtimeChannel | null;
  /** The last status the join reported ('' before any). */
  status: string;
  everJoined: boolean;
  retryMs: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

const liveTopics = new Map<string, LiveTopicState>();

export function joinLiveTopic(showId: string, user: LiveTopicUser): LiveTopicJoin {
  let state = liveTopics.get(showId);
  if (!state) {
    state = { users: new Set(), channel: null, status: '', everJoined: false, retryMs: RETRY_FIRST_MS, retryTimer: null, closed: false };
    liveTopics.set(showId, state);
    void openLiveTopic(showId, state);
  }
  const joined = state;
  joined.users.add(user);
  if (joined.status) user.onStatus?.(joined.status);
  let left = false;
  return {
    channel: () => joined.channel,
    leave() {
      if (left) return;
      left = true;
      joined.users.delete(user);
      if (joined.users.size > 0) return;
      joined.closed = true;
      if (liveTopics.get(showId) === joined) liveTopics.delete(showId);
      if (joined.retryTimer) clearTimeout(joined.retryTimer);
      const ch = joined.channel;
      joined.channel = null;
      if (ch) void getSupabase().then((sb) => sb?.removeChannel(ch));
    },
  };
}

async function openLiveTopic(showId: string, state: LiveTopicState): Promise<void> {
  state.retryTimer = null;
  const sb = await getSupabase();
  if (state.closed) return;
  const tell = (status: string) => {
    state.status = status;
    for (const user of [...state.users]) user.onStatus?.(status);
  };
  if (!sb) {
    tell('off');
    return;
  }
  const ch = sb.channel(liveTopic(showId), {
    config: { private: true, presence: { key: liveInstanceId(), enabled: true } },
  });
  state.channel = ch;
  const users = () => [...state.users];
  ch.on('broadcast', { event: LIVE_BATCH_EVENT }, (frame: { payload?: unknown }) => {
    for (const user of users()) user.onBatch?.(frame.payload);
  });
  ch.on('presence', { event: 'join' }, (payload: unknown) => {
    for (const user of users()) user.onPresence?.('join', payload, ch);
  });
  ch.on('presence', { event: 'leave' }, (payload: unknown) => {
    for (const user of users()) user.onPresence?.('leave', payload, ch);
  });
  ch.on('presence', { event: 'sync' }, () => {
    for (const user of users()) user.onPresence?.('sync', null, ch);
  });
  ch.subscribe((status) => {
    if (state.closed || state.channel !== ch) return;
    if (status === 'SUBSCRIBED') {
      state.everJoined = true;
      state.retryMs = RETRY_FIRST_MS;
    }
    tell(status);
    if (status === 'SUBSCRIBED') return;
    // Once joined, supabase-js rejoins by itself after an error or a timeout. It does not after
    // the server CLOSES the channel, and a join that never succeeded is left alone for a while
    // instead of its own quick loop (see RETRY_FIRST_MS): both are asked again from scratch.
    if (state.everJoined && status !== 'CLOSED') return;
    state.channel = null;
    void sb.removeChannel(ch);
    state.retryTimer = setTimeout(() => void openLiveTopic(showId, state), state.retryMs);
    state.retryMs = Math.min(RETRY_MAX_MS, state.retryMs * 2);
  });
}

export function joinLivePresence(opts: {
  showId: string;
  /** This page's entry, read at every track so it is always current. */
  entry: () => LiveEntry;
  /** Every entry on the topic, this page's own included, on each Presence sync. */
  onPeers?: (peers: LiveEntry[]) => void;
  onStatus?: (status: LivePresenceStatus) => void;
}): LivePresence {
  let closed = false;
  let joined = false;
  let trackTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTrackAt = 0;
  let lastSent = '';

  const track = () => {
    trackTimer = null;
    const ch = topic.channel();
    if (!ch || !joined || closed) return;
    const entry = opts.entry();
    const key = JSON.stringify({ ...entry, at: 0 });
    if (key === lastSent) return;
    lastSent = key;
    lastTrackAt = Date.now();
    void ch.track(entry).then((answer) => {
      // Not accepted (a server that allows the join but not the track): try again on the next
      // change rather than believing it was sent.
      if (answer === 'ok' || closed) return;
      lastSent = '';
      setTimeout(touch, RETRY_FIRST_MS);
    });
  };
  const touch = () => {
    if (closed || trackTimer) return;
    trackTimer = setTimeout(track, Math.max(0, lastTrackAt + MIN_TRACK_MS - Date.now()));
  };

  // THE PEERS ARE KEPT HERE, from the join and leave events, and NOT read off presenceState().
  // supabase-js's presence adapter (2.110) rewrites the metas it holds when it builds its event
  // payloads - it deletes their `phx_ref` in place - so once an entry has been re-tracked (an
  // update is a join and a leave on the same key), the leave that should remove the old meta
  // matches nothing, and presenceState() keeps a ghost of every page that ever updated. Seen on
  // the preview branch: a dashboard went on listing an output for good after it was closed. The
  // events themselves carry intact refs, so a map of ref to entry stays right; a key that
  // presenceState() no longer has at all is dropped too, which is how a rejoin reconciles. A new
  // channel (a refused join asked again) starts a new map, as its Presence starts empty.
  const { onPeers } = opts;
  const byRef = new Map<string, { key: string; entry: LiveEntry }>();
  let heardOn: RealtimeChannel | null = null;
  type PresenceEvent = { key?: string; newPresences?: unknown[]; leftPresences?: unknown[] } | null;
  const refOf = (meta: unknown) => (meta as { presence_ref?: unknown } | null)?.presence_ref;
  const onPresence = (event: 'join' | 'leave' | 'sync', payload: unknown, ch: RealtimeChannel) => {
    if (!onPeers || closed) return;
    if (heardOn !== ch) {
      heardOn = ch;
      byRef.clear();
    }
    const p = payload as PresenceEvent;
    if (event === 'join') {
      for (const meta of p?.newPresences ?? []) {
        const ref = refOf(meta);
        const entry = readLiveEntry(meta);
        if (typeof ref === 'string' && entry) byRef.set(ref, { key: p?.key ?? '', entry });
      }
    } else if (event === 'leave') {
      for (const meta of p?.leftPresences ?? []) {
        const ref = refOf(meta);
        if (typeof ref === 'string') byRef.delete(ref);
      }
    } else {
      const keys = new Set(Object.keys(ch.presenceState()));
      for (const [ref, held] of byRef) if (!keys.has(held.key)) byRef.delete(ref);
      onPeers([...byRef.values()].map((held) => held.entry));
    }
  };

  opts.onStatus?.('joining');
  const topic = joinLiveTopic(opts.showId, {
    onStatus: (status) => {
      if (closed) return;
      if (status === 'off') {
        opts.onStatus?.('off');
        return;
      }
      if (status === 'SUBSCRIBED') {
        joined = true;
        // A rejoin starts with no entry on the server: send it again even if nothing changed.
        lastSent = '';
        opts.onStatus?.('joined');
        touch();
        return;
      }
      joined = false;
      opts.onStatus?.('down');
    },
    onPresence,
  });
  return {
    touch,
    close() {
      closed = true;
      if (trackTimer) clearTimeout(trackTimer);
      topic.leave();
    },
  };
}

// ── THE ONE HEALTH LINE (both operator surfaces, so the phone too) ───────────────────────────

/** How long a heartbeat counts as fresh: the renderer beats every 60 s (output/main.ts). */
export const OUTPUT_FRESH_MS = 90_000;

export interface OutputHealth {
  tone: 'ok' | 'warn' | 'idle';
  /** The line on a desktop header. */
  label: string;
  /** The line on a phone, where the header has room for a few words. */
  short: string;
  /** What it means and what to do about it (the tooltip). */
  why: string;
  /** Outputs connected, as far as this line knows. */
  outputs: number;
  /** Where the answer came from. */
  source: 'presence' | 'heartbeat' | 'none';
  /** Show the line at all. False until there is an output to ask about. */
  show: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The engine names, without repeats and without the Chromium number when there are several. */
function enginesOf(outputs: LiveEntry[]): string {
  const names = [...new Set(outputs.map((o) => o.engine))];
  if (names.length === 1) return names[0];
  return [...new Set(names.map((n) => n.split(' · ')[0]))].join(', ');
}

/** One output, for the tooltip. No age: an entry is on the topic exactly while its page is
 *  connected, so "connected" is already the freshness, and a quiet output re-sends nothing. */
function describeOutput(o: LiveEntry): string {
  const stats = o.stats as Partial<LiveSummary> | undefined;
  const lat = stats?.lat;
  const p50 = lat ? ROADS.map((r) => lat[r]?.p50).find((v) => typeof v === 'number') : undefined;
  const roads =
    o.log === false
      ? 'NOT following the log live: commands reach it through the 30 s poll'
      : o.cmd === false
        ? 'fast road not joined: commands come by the log, a few hundred ms slower'
        : 'following live';
  return (
    `${o.engine}${o.build ? `, build ${o.build}` : ''}: connected now, ${roads}` +
    `${typeof p50 === 'number' ? `, press to screen about ${p50} ms` : ''}.`
  );
}

/**
 * The outputs among the peers, ONE PER INSTANCE, the newest entry winning. A reloaded browser
 * source keeps its instance id (session storage), and a page that was on the topic before the
 * reload can hold the old entry beside the new one for a while (seen on the preview branch: the
 * dashboard read "2 outputs" for one renderer reloaded 20 s earlier). One id is one renderer.
 */
function oneEntryPerOutput(peers: LiveEntry[]): LiveEntry[] {
  const byId = new Map<string, LiveEntry>();
  for (const p of peers) {
    if (p.kind !== 'output') continue;
    const held = byId.get(p.id);
    if (!held || p.at > held.at) byId.set(p.id, p);
  }
  return [...byId.values()];
}

const NOT_LOADED_WHY =
  'Nobody has loaded the output URL yet. Open it once in your browser source and it stays connected.';

/** A heartbeat this much after the last announced output left counts as a new one, not that
 *  output's last beat: it allows for the two clocks it is compared across. */
const LEFT_MARGIN_MS = 5000;

/**
 * THE HEALTH LINE, decided once for both surfaces.
 *
 * From Presence when this page's own Presence is joined: then an output is connected exactly
 * while its entry is there, and it says itself how commands reach it. Otherwise from the renderer
 * heartbeat, `output_seen_at`. `heartbeatLive` says whether that value is being re-read (the
 * production page polls it every 30 s) or is the one the page resolved with (the hosted page is
 * signed out and cannot read `control_shows`, so it knows only the value from when it opened, and
 * says so rather than letting that value age into an alarm).
 *
 * `known` is the production page's own "the operator has taken the output URL"; nothing is said
 * until either that or some renderer has reported in, because a production played through the
 * Bridge alone has no output to ask about.
 *
 * ONE CASE PRESENCE CANNOT SEE FOR ITSELF, and it is the one §5.6 measured: an output whose
 * Realtime socket is down while REST works. Its Presence rides that same socket, so it is simply
 * absent - but its heartbeat still lands. A fresh heartbeat with no output in Presence is therefore
 * amber ("not on the live channel"), unless the heartbeat is only the last beat of an output that
 * was just announced and left (`outputLeftAt`), which is what closing a browser source looks like.
 * An output loaded before this build lands in the same amber, and reloading it is the right
 * advice for both.
 */
export function describeOutputHealth(input: {
  presence: LivePresenceStatus;
  peers: LiveEntry[];
  seenAt: string | null;
  heartbeatLive: boolean;
  known?: boolean;
  /** When this page's Presence last went from listing an output to listing none (this page's
   *  clock), or null. */
  outputLeftAt?: number | null;
  /** When `seenAt` was read. For a heartbeat that is never re-read (the hosted page), freshness is
   *  judged at that moment, not now: the value says nothing about now. Defaults to `now`. */
  seenReadAt?: number;
  now: number;
}): OutputHealth {
  const { now, seenAt } = input;
  const outputs = input.presence === 'joined' ? oneEntryPerOutput(input.peers) : [];
  if (outputs.length > 0) {
    const slow = outputs.filter((o) => o.log === false);
    const noFast = outputs.filter((o) => o.log !== false && o.cmd === false);
    const detail = outputs.map((o) => describeOutput(o)).join('\n');
    const count = plural(outputs.length, 'output');
    if (slow.length > 0 || noFast.length > 0) {
      const late = slow.length > 0 ? 'commands may arrive up to 30 s late' : 'commands may arrive late';
      return {
        tone: 'warn',
        label: `▲ ${count} · ${late}`,
        short: `▲ ${count} · late`,
        why:
          `${slow.length > 0 ? 'An output is not joined to the live channel, so what you take reaches it through the 30 s poll.' : 'An output has not joined the fast road, so commands reach it by the log, a little slower.'} ` +
          `Check that output's network, or reload its browser source.\n${detail}`,
        outputs: outputs.length,
        source: 'presence',
        show: true,
      };
    }
    return {
      tone: 'ok',
      label: `● ${count} · ${enginesOf(outputs)}`,
      short: `● ${count}`,
      why: `What you take goes on air.\n${detail}`,
      outputs: outputs.length,
      source: 'presence',
      show: true,
    };
  }
  const seenMs = seenAt ? Date.parse(seenAt) : NaN;
  const judgedAt = input.heartbeatLive ? now : (input.seenReadAt ?? now);
  const fresh = seenAt ? judgedAt - seenMs < OUTPUT_FRESH_MS : false;
  const show = !!seenAt || !!input.known;
  if (input.presence === 'joined') {
    const left = input.outputLeftAt ?? null;
    if (fresh && (left === null || seenMs > left + LEFT_MARGIN_MS)) {
      return {
        tone: 'warn',
        label: '▲ output not on the live channel · commands may arrive up to 30 s late',
        short: '▲ output · late',
        why: 'An output is reporting in over the web, but it is not on the live channel: either its Realtime connection is down, so what you take reaches it through the 30 s poll, or it was loaded before this version and cannot say. Check its network, or reload its browser source.',
        outputs: 1,
        source: 'heartbeat',
        show: true,
      };
    }
    return {
      tone: 'idle',
      label: '○ no output connected',
      short: '○ no output',
      why: seenAt
        ? 'No output is open on this production right now. Check the browser source (OBS, vMix, CasparCG) is still open on the output URL.'
        : NOT_LOADED_WHY,
      outputs: 0,
      source: 'presence',
      show,
    };
  }
  if (!input.heartbeatLive) {
    // The hosted page's fallback: a value from when the page opened. Neutral, never green: it
    // says nothing about now.
    return {
      tone: 'idle',
      label: fresh ? '○ output seen when this page opened' : '○ output not seen when this page opened',
      short: fresh ? '○ output seen' : '○ no output',
      why:
        'This server cannot report live output status yet, so this is the output heartbeat as it was when the page opened. Reload the page to check again.',
      outputs: fresh ? 1 : 0,
      source: seenAt ? 'heartbeat' : 'none',
      show,
    };
  }
  if (fresh) {
    return {
      tone: 'ok',
      label: '● output connected',
      short: '● output',
      why: 'A browser source is loading the output URL and reporting in. What you take goes on air.',
      outputs: 1,
      source: 'heartbeat',
      show: true,
    };
  }
  if (seenAt) {
    return {
      tone: 'idle',
      label: '○ output not answering',
      short: '○ no output',
      why: 'The output URL was loading, but nothing has reported in for over a minute. Check the browser source (OBS, vMix, CasparCG) is still open on it.',
      outputs: 0,
      source: 'heartbeat',
      show,
    };
  }
  return {
    tone: 'idle',
    label: '○ output not loaded yet',
    short: '○ no output',
    why: NOT_LOADED_WHY,
    outputs: 0,
    source: 'none',
    show,
  };
}
