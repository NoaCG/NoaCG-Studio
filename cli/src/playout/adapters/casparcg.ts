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
import type { AgentError, ItemKind, ListItem, PlayoutAction, PlayoutVerb, Target } from '../protocol.js';
import { UsageError } from '../../output.js';

export type AdapterResult<T> = { ok: true; value: T; raw: string } | { ok: false; error: AgentError };

/** What every adapter answers. OBS, vMix and an OGraf renderer implement this same shape. */
export interface PlayoutAdapter {
  id: Target['adapter'];
  capabilities(): { lists: ItemKind[]; thumbnails: boolean; verbs: PlayoutVerb[] };
  status(target: Target): Promise<AdapterResult<{ version: string }>>;
  list(target: Target, kind: ItemKind, path?: string): Promise<AdapterResult<ListItem[]>>;
  thumbnail(target: Target, name: string): Promise<AdapterResult<{ png: string }>>;
  act(target: Target, action: PlayoutAction): Promise<AdapterResult<null>>;
}

/** A cue waits the default; a list waits past the server's own scanner timeout so the 501
 *  arrives and is read, rather than the wait ending first and reporting silence. */
export const LIST_TIMEOUT_MS = 12_000;

/** The AMCP line for one action. Pure and exported so the tests pin every verb's exact text. */
export function casparLine(action: PlayoutAction): string {
  const at = layerAddress(action.slot.channel, action.slot.layer);
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

function amcpTarget(target: Target, timeoutMs?: number): AmcpTarget {
  return { host: target.host, port: target.port, timeoutMs };
}

function targetName(target: Target): string {
  return `${target.host}:${target.port}`;
}

/** Turn a reply or a thrown socket error into the protocol's error, with the hop named. */
function failure(target: Target, e: unknown, listing: boolean): AgentError {
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

function refusal(target: Target, reply: AmcpReply, listing: boolean): AgentError {
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

async function send(target: Target, line: string, timeoutMs?: number): Promise<AdapterResult<AmcpReply>> {
  const listing = timeoutMs === LIST_TIMEOUT_MS;
  try {
    const reply = await amcpSend(amcpTarget(target, timeoutMs), line);
    if (reply.code >= 200 && reply.code < 300) return { ok: true, value: reply, raw: reply.status };
    return { ok: false, error: refusal(target, reply, listing) };
  } catch (e) {
    return { ok: false, error: failure(target, e, listing) };
  }
}

export const casparcgAdapter: PlayoutAdapter = {
  id: 'casparcg',

  capabilities() {
    return {
      lists: ['template', 'media'],
      thumbnails: true,
      verbs: ['take', 'update', 'next', 'out', 'pause', 'resume'],
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
    const r = await send(target, `${kind === 'template' ? 'TLS' : 'CLS'}${sub}`, LIST_TIMEOUT_MS);
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
    const r = await send(target, `THUMBNAIL RETRIEVE ${amcpQuote(name.trim())}`, LIST_TIMEOUT_MS);
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
};
