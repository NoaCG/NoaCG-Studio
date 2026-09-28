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
import type { SlotReading } from '../slots.js';
import type {
  AgentError,
  CasparTarget,
  ItemKind,
  ListItem,
  PlayoutAction,
  PlayoutRenderer,
  PlayoutVerb,
  SlotState,
  Target,
  TargetCapability,
} from '../protocol.js';
import { UsageError } from '../../output.js';

export type AdapterResult<T> = { ok: true; value: T; raw: string } | { ok: false; error: AgentError };

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
  act(target: T, action: PlayoutAction): Promise<AdapterResult<null>>;
  /** What each layer of one channel holds, for a target that can say (`/state`). */
  state?(target: T, channel: number): Promise<AdapterResult<SlotReading[]>>;
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

/** The AMCP line for one action. Pure and exported so the tests pin every verb's exact text. */
export function casparLine(action: PlayoutAction): string {
  const { slot } = action;
  if (slot.adapter !== 'casparcg') throw new UsageError('A CasparCG command needs a casparcg slot.');
  const at = layerAddress(slot.channel, slot.layer);
  switch (action.verb) {
    case 'take': {
      const { item } = action;
      if (!item.name.trim()) throw new UsageError('The item has no name.');
      if (item.kind === 'url') {
        if (/[\r\n]/.test(item.name)) throw new UsageError('That URL contains a newline and cannot go on an AMCP line.');
        return `PLAY ${at} [HTML] ${amcpQuote(item.name)}`;
      }
      if (item.kind === 'template') {
        // Play-on-load 1: ADD and PLAY as one command, so a take is one round trip. The data is
        // JSON - what SPX sends and what every NoaCG export reads - quoted for the tokenizer.
        const data = action.data ? ` ${amcpQuote(JSON.stringify(action.data))}` : '';
        return `CG ${at} ADD 1 ${amcpQuote(item.name)} 1${data}`;
      }
      if (item.kind === 'media') {
        return `PLAY ${at} ${amcpQuote(item.name)}${action.loop ? ' LOOP' : ''}`;
      }
      throw new UsageError(`CasparCG cannot take an item of kind "${String(item.kind)}".`);
    }
    case 'update':
      return `CG ${at} UPDATE 1 ${amcpQuote(JSON.stringify(action.data))}`;
    case 'next':
      return `CG ${at} NEXT 1`;
    case 'out':
      // A template is stopped through its CG layer so it plays its exit; a clip or a page is
      // stopped on the video layer, which cuts. The page says which it cued through `item`.
      return action.item?.kind === 'template' ? `CG ${at} STOP 1` : `STOP ${at}`;
    case 'pause':
      return `PAUSE ${at}`;
    case 'resume':
      return `RESUME ${at}`;
    default:
      throw new UsageError(`Unknown verb "${String((action as { verb: unknown }).verb)}".`);
  }
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

export const casparcgAdapter: PlayoutAdapter<CasparTarget> = {
  id: 'casparcg',

  capabilities(version) {
    return {
      lists: ['template', 'media'],
      thumbnails: true,
      verbs: ['take', 'update', 'next', 'out', 'pause', 'resume'],
      target: readsState(version) ? ['state'] : [],
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

  async act(target, action) {
    let line: string;
    try {
      line = casparLine(action);
    } catch (e) {
      return { ok: false, error: failure(target, e, false) };
    }
    const r = await send(target, line);
    if (!r.ok) return r;
    return { ok: true, value: null, raw: r.raw };
  },

  async state(target, channel) {
    if (!Number.isInteger(channel) || channel < 1) {
      return { ok: false, error: { hop: 'agent', code: 'usage', detail: `Channel must be a whole number from 1, got "${channel}".` } };
    }
    // The whole channel: 2.5.0 answers `INFO c-l` with the channel's document anyway.
    const r = await send(target, `INFO ${channel}`, false, STATE_TIMEOUT_MS);
    if (!r.ok) return r;
    try {
      return { ok: true, value: parseInfo(r.value.lines[0] ?? '').layers.map(slotReading), raw: r.raw };
    } catch (e) {
      return {
        ok: false,
        error: { hop: 'target', code: 'unsupported', detail: `${targetName(target)} answered INFO in a shape this Bridge cannot read: ${(e as Error).message}`, raw: r.raw },
      };
    }
  },
};
