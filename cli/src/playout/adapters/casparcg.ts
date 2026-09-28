// The CasparCG adapter: the playout protocol's verbs and lists, each as one AMCP line.
//
// The Bridge reaches the server's library only through AMCP on 5250. CLS, TLS, CINF and
// THUMBNAIL are answered by the server's media-scanner, which runs on the SERVER box and is
// reachable only by the server itself; when it is not running the server answers `501 <CMD>
// FAILED` about 5 s later (measured 2.5.0, 2026-09-22), and that is reported as exactly what it
// is - "the server answered, but its media scanner is not running" - never as a dead server.

import {
  AmcpTimeout,
  amcpQuote,
  amcpSend,
  layerAddress,
  parseCls,
  parseTls,
  parseVersion,
  type AmcpReply,
  type AmcpTarget,
} from '../amcp.js';
import { parseInfo, type InfoLayer } from '../info.js';
import type { Follower, SlotReading } from '../slots.js';
import type {
  AgentError,
  CasparSlot,
  CasparTarget,
  ItemKind,
  ItemRef,
  ListItem,
  MediaPlayback,
  PlayoutAction,
  PlayoutRenderer,
  PlayoutVerb,
  SequenceEntry,
  Slot,
  SlotState,
  Target,
  TargetCapability,
} from '../protocol.js';
import { UsageError } from '../../output.js';

export type AdapterResult<T> = { ok: true; value: T; raw: string } | { ok: false; error: AgentError };

/** What the Bridge knows about a slot that changes the lines an action takes (./slots.ts). */
export interface ActContext {
  /** What this Bridge queued behind the clip with AUTO that has not aired yet. */
  follower?: Follower;
}

/** What an action left behind the clip: the file now queued with AUTO, `null` for nothing, and
 *  absent when the action did not touch it. `warning` is a later line the server refused after the
 *  first went through: the action happened, and not all of it. */
export interface ActDone {
  follower?: Follower | null;
  warning?: string;
}

/** An action's result. A refused take can still have disarmed the slot's follower. */
export type ActResult = { ok: true; value: ActDone; raw: string } | { ok: false; error: AgentError; follower?: null };

/** What the sequence runner queues behind the entry on air: the next entry (`last` when nothing
 *  follows it, so its own Loop applies), or the last entry's own Clear with the fade it ends on. */
export type FollowWith = { entry: SequenceEntry; last: boolean } | { clear: { fadeOut?: number } };

/** What every adapter answers, for its own kind of target. The Bridge hands each adapter only
 *  the targets that name it. OBS and vMix implement this same shape (adapters/ograf.ts does). */
export interface PlayoutAdapter<T extends Target = Target> {
  id: T['adapter'];
  /** `target` is what `/status` reports for a server of this `version` (docs/CLIP_PLAYBACK_PLAN.md
   *  §6.9): the page offers a control only when the target can honour it. */
  capabilities(version?: string): { lists: ItemKind[]; thumbnails: boolean; verbs: PlayoutVerb[]; target: TargetCapability[] };
  status(target: T): Promise<AdapterResult<{ version: string }>>;
  list(target: T, kind: ItemKind, path?: string): Promise<AdapterResult<ListItem[]>>;
  /** Where the library can play, for a target that has renderers of its own (OGraf). */
  renderers?(target: T): Promise<AdapterResult<PlayoutRenderer[]>>;
  thumbnail(target: T, name: string): Promise<AdapterResult<{ png: string }>>;
  act(target: T, action: PlayoutAction, context?: ActContext): Promise<ActResult>;
  /** What each layer of one channel holds, for a target that can say (`/state`). */
  state?(target: T, channel: number): Promise<AdapterResult<SlotReading[]>>;
  /** Queue what plays when the clip on the slot ends, for a target that runs sequences. */
  follow?(target: T, slot: Slot, next: FollowWith): Promise<ActResult>;
}

const PRODUCERS: Record<string, SlotState['producer']> = { ffmpeg: 'video', image: 'still', color: 'colour', html: 'html', empty: 'empty' };

/** Milliseconds are the finest the clock needs; INFO writes positions like 0.5999999999999996. */
const ms = (s: number) => Math.round(s * 1000) / 1000;

/**
 * One INFO layer in the protocol's words (docs/CLIP_PLAYBACK_PLAN.md §6.7).
 *
 * THE SEGMENT ARITHMETIC. `file/time` is the position in the WHOLE file and the whole file's
 * length; the part that plays is `file/clip`, its start and its length. So a clip trimmed to 7.5 s
 * starting 5 s into a 30 s file, 1.04 s in, reads time [6.04, 30] and clip [5, 7.5]: the position
 * is 6.04 - 5 = 1.04 and 6.46 s remain - never 30 - 6.04. Measured on 2.5.0 (the `video-trimmed`
 * fixture), where `SEEK 250 LENGTH 375` on a 25 fps file in a 50p channel read back as a start of
 * 5 s and a length of 7.5 s: those frames count in the CHANNEL's rate, not the file's.
 */
export function slotReading(l: InfoLayer): SlotReading {
  const fg = l.foreground;
  // A MIX under way wraps the incoming producer, and the file fields beside it are the incoming
  // clip's.
  const inner = fg.producer === 'transition' ? (fg.transition?.producer ?? '') : fg.producer;
  const producer = PRODUCERS[inner] ?? 'other';
  const file = producer === 'video' ? (fg.name ?? fg.path) : producer === 'still' || producer === 'html' ? fg.path : undefined;
  let segment: SlotReading['segment'];
  let position: number | undefined;
  if (producer === 'video' && fg.clip && fg.time && fg.clip[1] > 0) {
    const [start, length] = fg.clip;
    segment = { start: ms(start), length: ms(length) };
    position = ms(Math.min(length, Math.max(0, fg.time[0] - start)));
  }
  const tr = fg.producer === 'transition' && fg.transition && fg.transition.type !== 'cut' && fg.transition.frame[1] > 0 ? fg.transition : undefined;
  const bg = l.background;
  const queued = bg.producer !== 'empty' ? (bg.name ?? bg.path) : undefined;
  return {
    layer: l.layer,
    producer,
    ...(file ? { file } : {}),
    ...(segment ? { segment, position } : {}),
    paused: fg.paused === true,
    loop: fg.loop === true,
    ...(tr ? { transition: { progress: ms(Math.min(1, tr.frame[0] / tr.frame[1])) } } : {}),
    // `frames_left` is written on the foreground only while the background waits with AUTO.
    ...(queued ? { queued: { file: queued, auto: fg.framesLeft !== undefined } } : {}),
  };
}

/** Whether a server of this version answers INFO in the shape `parseInfo` reads: 2.3 and later.
 *  The shape is measured on 2.5.0; 2.3 writes the same producer state, and a field a version lacks
 *  reads as absent rather than failing the reading. */
export function readsState(version: string | undefined): boolean {
  const m = /^(\d+)\.(\d+)/.exec(version ?? '');
  return !!m && (Number(m[1]) > 2 || (Number(m[1]) === 2 && Number(m[2]) >= 3));
}

/** A cue waits the default; a list waits past the server's own scanner timeout so the 501
 *  arrives and is read, rather than the wait ending first and reporting silence. */
export const LIST_TIMEOUT_MS = 12_000;

/** A state reading gives up before the page does (its own wait is 1.5 s, src/control/playoutLink.ts),
 *  so a server that stops answering never holds more than one INFO per channel at a time: the page
 *  asks again only after this one has ended. INFO answers in about 2 ms on 2.5.0. */
export const STATE_TIMEOUT_MS = 1200;

/** How long a cached channel rate is trusted before INFO is asked again, whatever else read it. */
export const RATE_TTL_MS = 30_000;

/**
 * Seconds as the channel's frames, which is what `MIX`, `IN` and `OUT` count: measured on 2.5.0
 * (2026-09-28), `SEEK 250 LENGTH 375` on a 25 fps file in a 50p channel was 5 s in and 7.5 s long.
 * `rate` is the channel's own `framerate` as INFO reports it. A fade is at least one frame.
 */
export function framesAt(seconds: number, rate: number): number {
  if (!(rate > 0) || !Number.isFinite(seconds)) throw new UsageError(`Cannot count ${seconds} s in frames at ${rate} a second.`);
  return Math.max(1, Math.round(seconds * rate));
}

/** A trim point in frames: the first frame is 0, not 1. */
function frameOf(seconds: number, rate: number): number {
  return Math.max(0, Math.round(seconds * rate));
}

/** The level as the audio filter the file plays through: `volume=0.2512` for -12 dB, four decimals,
 *  so each file keeps its own level when the server switches to it by itself. No `MIXER VOLUME` is
 *  ever sent: that layer gain multiplies with this one and outlives the clip. */
export function volumeFilter(gain: number): string {
  return `volume=${gain.toFixed(4)}`;
}

/** Whether a playback needs the channel's rate to be written. */
function timed(p: MediaPlayback | undefined): boolean {
  return !!p && (p.fadeIn !== undefined || p.fadeOut !== undefined || p.trim !== undefined);
}

/** Whether an action's lines need the channel's rate: any fade or trim it carries. */
export function needsRate(action: PlayoutAction): boolean {
  if (action.verb === 'take') return timed(action.playback);
  if (action.verb === 'out') return action.fadeOut !== undefined;
  if (action.verb === 'sequence') return action.entries.some((e) => timed(e.playback));
  return false;
}

/** The parameters after a file's name, in the order this adapter always writes them:
 *  `[IN a] [OUT b] [MIX n] [AF "volume=g"] [LOOP]`. The server finds each by its keyword. */
function mediaParams(p: MediaPlayback | undefined, loop: boolean, rate: number | undefined): string {
  const parts: string[] = [];
  const need = () => {
    if (rate === undefined) throw new UsageError('A fade or a trim needs the channel\'s frame rate.');
    return rate;
  };
  if (p?.trim?.in !== undefined) parts.push(`IN ${frameOf(p.trim.in, need())}`);
  if (p?.trim?.out !== undefined) parts.push(`OUT ${frameOf(p.trim.out, need())}`);
  if (p?.fadeIn !== undefined) parts.push(`MIX ${framesAt(p.fadeIn, need())}`);
  if (p?.gain !== undefined && p.gain !== 1) parts.push(`AF ${amcpQuote(volumeFilter(p.gain))}`);
  if (loop || p?.end === 'loop') parts.push('LOOP');
  return parts.length ? ` ${parts.join(' ')}` : '';
}

function casparAt(slot: Slot): string {
  if (slot.adapter !== 'casparcg') throw new UsageError('A CasparCG command needs a casparcg slot.');
  return layerAddress(slot.channel, slot.layer);
}

function mediaName(item: ItemRef): string {
  if (!item.name.trim()) throw new UsageError('The item has no name.');
  if (item.kind !== 'media') throw new UsageError(`A clip's playback is for media, not an item of kind "${item.kind}".`);
  return amcpQuote(item.name);
}

/** The line that queues the empty layer behind a clip, so it clears at its end - fading for
 *  `fadeOut`, which the server starts that many frames BEFORE the end so it finishes on it. */
function clearLine(at: string, fadeOut: number | undefined, rate: number | undefined): string {
  if (fadeOut === undefined) return `LOADBG ${at} EMPTY AUTO`;
  if (rate === undefined) throw new UsageError('A fade needs the channel\'s frame rate.');
  return `LOADBG ${at} EMPTY MIX ${framesAt(fadeOut, rate)} AUTO`;
}

/** The line that queues a sequence's entry behind the clip on air, to play when it ends. Its fade in
 *  is the MIX into it: the incoming clip decides the transition (docs/CLIP_PLAYBACK_PLAN.md §6.6). */
function queueLine(at: string, entry: SequenceEntry, last: boolean, rate: number | undefined): string {
  return `LOADBG ${at} ${mediaName(entry.item)}${mediaParams(entry.playback, last && entry.playback?.end === 'loop', rate)} AUTO`;
}

/** What makes a refused take safe: a follower this Bridge queued behind the clip still on air is
 *  replaced by nothing, without AUTO, so it cannot air when that clip ends (§4, the failed-PLAY row). */
export function disarmLine(slot: Slot): string {
  return `LOADBG ${casparAt(slot)} EMPTY`;
}

/**
 * THE AMCP LINES FOR ONE ACTION, in the order they are sent. Pure and exported so the tests pin every
 * line and its order. An action with no field newer than the verb writes exactly the one line it
 * always wrote. `rate` is the channel's frame rate, needed only when the action carries a time;
 * `follower` is what this Bridge queued behind the clip on the slot.
 */
export function casparLines(action: PlayoutAction, context: { rate?: number; follower?: Follower } = {}): string[] {
  const at = casparAt(action.slot);
  const { rate } = context;
  switch (action.verb) {
    case 'take': {
      const { item } = action;
      if (!item.name.trim()) throw new UsageError('The item has no name.');
      if (item.kind !== 'media' && action.playback) throw new UsageError(`Only a clip carries playback; this is a ${item.kind}.`);
      if (item.kind === 'url') {
        if (/[\r\n]/.test(item.name)) throw new UsageError('That URL contains a newline and cannot go on an AMCP line.');
        return [`PLAY ${at} [HTML] ${amcpQuote(item.name)}`];
      }
      if (item.kind === 'template') {
        // Play-on-load 1: ADD and PLAY as one command, so a take is one round trip. The data is
        // JSON - what SPX sends and what every NoaCG export reads - quoted for the tokenizer.
        const data = action.data ? ` ${amcpQuote(JSON.stringify(action.data))}` : '';
        return [`CG ${at} ADD 1 ${amcpQuote(item.name)} 1${data}`];
      }
      if (item.kind === 'media') {
        const p = action.playback;
        const play = `PLAY ${at} ${mediaName(item)}${mediaParams(p, !!action.loop, rate)}`;
        // Clear at the end: the empty layer waits behind the clip and plays by itself when it ends.
        return p?.end === 'clear' ? [play, clearLine(at, p.fadeOut, rate)] : [play];
      }
      throw new UsageError(`CasparCG cannot take an item of kind "${String(item.kind)}".`);
    }
    case 'sequence': {
      // The first entry now, and the second queued behind it at once; the runner queues each of the
      // rest when it sees the switch (./runner.ts).
      const [first, second] = action.entries;
      if (!first || !second) throw new UsageError('A sequence plays at least two files.');
      return [
        `PLAY ${at} ${mediaName(first.item)}${mediaParams(first.playback, false, rate)}`,
        queueLine(at, second, action.entries.length === 2, rate),
      ];
    }
    case 'update':
      return [`CG ${at} UPDATE 1 ${amcpQuote(JSON.stringify(action.data))}`];
    case 'next':
      return [`CG ${at} NEXT 1`];
    case 'out':
      // A template is stopped through its CG layer so it plays its exit; a clip or a page is
      // stopped on the video layer, which cuts. The page says which it cued through `item`.
      if (action.item?.kind === 'template') return [`CG ${at} STOP 1`];
      // A fade out mixes the layer to the empty colour. As a PLAY it replaces whatever waited
      // behind the clip, so a follower cannot air after it.
      if (action.fadeOut !== undefined) {
        if (rate === undefined) throw new UsageError('A fade needs the channel\'s frame rate.');
        return [`PLAY ${at} EMPTY MIX ${framesAt(action.fadeOut, rate)}`];
      }
      // STOP keeps the background loaded; with a follower queued the layer goes whole, so nothing
      // queued behind the clip can ever play (§4 and §6.10, rule 5).
      return context.follower ? [`CLEAR ${at}`] : [`STOP ${at}`];
    case 'pause':
      return [`PAUSE ${at}`];
    case 'resume':
      return [`RESUME ${at}`];
    default:
      throw new UsageError(`Unknown verb "${String((action as { verb: unknown }).verb)}".`);
  }
}

/** The one AMCP line of an action that takes one line, as every verb did before playback. */
export function casparLine(action: PlayoutAction): string {
  const lines = casparLines(action);
  if (lines.length !== 1) throw new UsageError(`That action takes ${lines.length} lines.`);
  return lines[0];
}

/** The line the sequence runner sends to queue what plays after the clip on air. */
export function followLine(slot: Slot, next: FollowWith, rate: number | undefined): string {
  const at = casparAt(slot);
  return 'entry' in next ? queueLine(at, next.entry, next.last, rate) : clearLine(at, next.clear.fadeOut, rate);
}

/** Whether queuing this needs the channel's rate. */
function followTimed(next: FollowWith): boolean {
  return 'entry' in next ? timed(next.entry.playback) : next.clear.fadeOut !== undefined;
}

function amcpTarget(target: CasparTarget, timeoutMs?: number): AmcpTarget {
  return { host: target.host, port: target.port, timeoutMs };
}

function targetName(target: CasparTarget): string {
  return `${target.host}:${target.port}`;
}

/** Turn a reply or a thrown socket error into the protocol's error, with the hop named. */
function failure(target: CasparTarget, e: unknown, listing: boolean): AgentError {
  if (e instanceof AmcpTimeout) {
    return {
      hop: 'target',
      code: 'unreachable',
      detail: `${targetName(target)} did not answer in time.`,
    };
  }
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof UsageError) return { hop: 'agent', code: 'usage', detail: message };
  return {
    hop: 'target',
    code: 'unreachable',
    detail: listing
      ? `CasparCG did not answer on ${targetName(target)} (${message}).`
      : `CasparCG did not answer on ${targetName(target)} (${message}). Is the server running, and is that its AMCP port?`,
  };
}

function refusal(target: CasparTarget, reply: AmcpReply, listing: boolean): AgentError {
  if (reply.code === 501 && listing) {
    return {
      hop: 'target',
      code: 'no-media-scanner',
      detail: `${targetName(target)} answered, but its media scanner is not running, so it cannot list its files. Start the scanner next to CasparCG on the server and try again.`,
      raw: reply.status,
    };
  }
  if (reply.code === 404) {
    return {
      hop: 'target',
      code: 'not-found',
      detail: `CasparCG has no such file: ${reply.status}.`,
      raw: reply.status,
    };
  }
  return {
    hop: 'target',
    code: 'refused',
    detail: `CasparCG refused the command: ${reply.status}. Check the channel and layer.`,
    raw: reply.status,
  };
}

/** One line to the server. A LISTING waits out the scanner's own timeout and reads a 501 as
 *  the scanner missing; a cue waits the default and reads a 501 as a refusal. */
async function send(target: CasparTarget, line: string, listing = false, timeoutMs?: number): Promise<AdapterResult<AmcpReply>> {
  try {
    const reply = await amcpSend(amcpTarget(target, timeoutMs ?? (listing ? LIST_TIMEOUT_MS : undefined)), line);
    if (reply.code >= 200 && reply.code < 300) return { ok: true, value: reply, raw: reply.status };
    return { ok: false, error: refusal(target, reply, listing) };
  } catch (e) {
    return { ok: false, error: failure(target, e, listing) };
  }
}

/** What a CasparCG of this version can do (docs/CLIP_PLAYBACK_PLAN.md §6.9). A Clear at the end is
 *  `LOADBG … EMPTY AUTO`, which every version has. Everything else needs INFO read in the shape
 *  this Bridge reads, 2.3 and later: a fade or a trim is counted in the channel's frames, read
 *  from INFO, and a sequence is run by watching INFO. `IN`, `OUT` and `AF` are in the 2.3.3 and
 *  2.5.0 sources and were measured on both on this machine. */
export function casparCapabilities(version: string | undefined): TargetCapability[] {
  return readsState(version) ? ['state', 'end', 'fade', 'trim', 'level', 'sequence'] : ['end'];
}

/**
 * The adapter, with the one thing it keeps: each channel's frame rate, per target and channel, so a
 * fade is not a second round trip. Every INFO this Bridge reads refreshes it - the page's readings
 * and the runner's - so a channel whose format changes is counted right from the next reading, and
 * an entry older than RATE_TTL_MS is read again before it is used. A test makes its own adapter.
 */
export function createCasparcgAdapter(now: () => number = () => performance.now()): PlayoutAdapter<CasparTarget> {
  const rates = new Map<string, { rate: number; at: number }>();
  const rateKey = (target: CasparTarget, channel: number) => `${target.host}:${target.port} ${channel}`;

  /** One channel's INFO, read into its layers - and its rate remembered. */
  async function readChannel(target: CasparTarget, channel: number): Promise<AdapterResult<{ layers: SlotReading[]; rate?: number }>> {
    if (!Number.isInteger(channel) || channel < 1) {
      return { ok: false, error: { hop: 'agent', code: 'usage', detail: `Channel must be a whole number from 1, got "${channel}".` } };
    }
    // The whole channel: 2.5.0 answers `INFO c-l` with the channel's document anyway.
    const r = await send(target, `INFO ${channel}`, false, STATE_TIMEOUT_MS);
    if (!r.ok) return r;
    try {
      const info = parseInfo(r.value.lines[0] ?? '');
      if (info.fps && info.fps > 0) rates.set(rateKey(target, channel), { rate: info.fps, at: now() });
      return { ok: true, value: { layers: info.layers.map(slotReading), rate: info.fps }, raw: r.raw };
    } catch (e) {
      return {
        ok: false,
        error: { hop: 'target', code: 'unsupported', detail: `${targetName(target)} answered INFO in a shape this Bridge cannot read: ${(e as Error).message}`, raw: r.raw },
      };
    }
  }

  /** The channel's frame rate: remembered, or read. */
  async function rateOf(target: CasparTarget, channel: number): Promise<AdapterResult<number>> {
    const known = rates.get(rateKey(target, channel));
    if (known && now() - known.at < RATE_TTL_MS) return { ok: true, value: known.rate, raw: 'cached' };
    const r = await readChannel(target, channel);
    if (!r.ok) return r;
    if (!r.value.rate) {
      return { ok: false, error: { hop: 'target', code: 'unsupported', detail: `${targetName(target)} did not say channel ${channel}'s frame rate, so a fade or a trim cannot be counted in its frames.` } };
    }
    return { ok: true, value: r.value.rate, raw: r.raw };
  }

  /** Send an action's lines in order. The first is the action itself: refused, nothing else goes,
   *  except the disarm a refused take owes a follower (see `disarmLine`). A later line refused is a
   *  warning on an action that did happen. */
  async function sendLines(target: CasparTarget, slot: Slot, lines: string[], disarm: boolean): Promise<ActResult & { sent?: number }> {
    const first = await send(target, lines[0]);
    if (!first.ok) {
      if (!disarm) return first;
      const d = await send(target, disarmLine(slot));
      return d.ok ? { ...first, follower: null } : first;
    }
    const raws = [first.raw];
    for (let i = 1; i < lines.length; i++) {
      const r = await send(target, lines[i]);
      if (!r.ok) {
        return { ok: true, value: { warning: `The server refused the second half: ${r.error.detail}` }, raw: raws.join('; '), sent: i };
      }
      raws.push(r.raw);
    }
    return { ok: true, value: {}, raw: raws.join('; '), sent: lines.length };
  }

  return {
  id: 'casparcg',

  capabilities(version) {
    return {
      lists: ['template', 'media'],
      thumbnails: true,
      verbs: ['take', 'update', 'next', 'out', 'pause', 'resume', 'sequence'],
      target: casparCapabilities(version),
    };
  },

  async status(target) {
    const r = await send(target, 'VERSION');
    if (!r.ok) return r;
    return { ok: true, value: { version: parseVersion(r.value) }, raw: r.raw };
  },

  async list(target, kind, path) {
    if (kind !== 'template' && kind !== 'media') {
      return { ok: false, error: { hop: 'agent', code: 'unsupported', detail: `CasparCG has no list of kind "${kind}".` } };
    }
    const sub = path?.trim() ? ` ${amcpQuote(path.trim())}` : '';
    const r = await send(target, `${kind === 'template' ? 'TLS' : 'CLS'}${sub}`, true);
    if (!r.ok) return r;
    const items: ListItem[] =
      kind === 'template'
        ? parseTls(r.value.lines).map((t) => ({ name: t.name, kind: 'template' }))
        : parseCls(r.value.lines).map((m) => ({
            name: m.name,
            kind: m.kind,
            frames: m.frames,
            fps: m.fps,
            bytes: m.bytes,
            changed: m.changed,
          }));
    return { ok: true, value: items, raw: r.raw };
  },

  async thumbnail(target, name) {
    if (!name.trim()) return { ok: false, error: { hop: 'agent', code: 'usage', detail: 'No file name given.' } };
    const r = await send(target, `THUMBNAIL RETRIEVE ${amcpQuote(name.trim())}`, true);
    if (!r.ok) return r;
    return { ok: true, value: { png: r.value.lines[0] ?? '' }, raw: r.raw };
  },

  async act(target, action, context = {}) {
    let lines: string[];
    try {
      let rate: number | undefined;
      if (needsRate(action)) {
        const r = await rateOf(target, (action.slot as CasparSlot).channel);
        if (!r.ok) return r;
        rate = r.value;
      }
      lines = casparLines(action, { rate, follower: context.follower });
    } catch (e) {
      return { ok: false, error: failure(target, e, false) };
    }
    // A take that replaces a clip with a follower of a sequence behind it: if the server refuses the
    // new file, that follower is still armed and would air when the old clip ends.
    const media = (action.verb === 'take' && action.item.kind === 'media') || action.verb === 'sequence';
    const disarm = media && !!context.follower && context.follower.file !== 'EMPTY';
    const r = await sendLines(target, action.slot, lines, disarm);
    if (!r.ok) return r;
    // What waits behind the clip now. A PLAY of a file empties the background; a queued line fills it.
    let follower: ActDone['follower'];
    if (action.verb === 'take') follower = action.playback?.end === 'clear' && r.sent === 2 ? { file: 'EMPTY' } : null;
    else if (action.verb === 'sequence') follower = r.sent === 2 ? { file: action.entries[1].item.name } : null;
    else if (action.verb === 'out') follower = null;
    return { ok: true, value: { ...r.value, ...(follower !== undefined ? { follower } : {}) }, raw: r.raw };
  },

  async state(target, channel) {
    const r = await readChannel(target, channel);
    return r.ok ? { ok: true, value: r.value.layers, raw: r.raw } : r;
  },

  async follow(target, slot, next) {
    if (slot.adapter !== 'casparcg') return { ok: false, error: { hop: 'agent', code: 'usage', detail: 'A CasparCG command needs a casparcg slot.' } };
    let line: string;
    try {
      let rate: number | undefined;
      if (followTimed(next)) {
        const r = await rateOf(target, slot.channel);
        if (!r.ok) return r;
        rate = r.value;
      }
      line = followLine(slot, next, rate);
    } catch (e) {
      return { ok: false, error: failure(target, e, false) };
    }
    const r = await send(target, line);
    if (!r.ok) return r;
    return { ok: true, value: { follower: { file: 'entry' in next ? next.entry.item.name : 'EMPTY' } }, raw: r.raw };
  },
  };
}

export const casparcgAdapter = createCasparcgAdapter();
