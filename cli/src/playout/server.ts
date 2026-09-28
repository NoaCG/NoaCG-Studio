// The Bridge's HTTP surface: what the NoaCG page reaches on 127.0.0.1 (docs/BRIDGE.md §3).
//
// The Bridge runs on the OPERATOR's machine and binds loopback only. CasparCG may be anywhere
// on the studio LAN - only AMCP crosses it, exactly as the CasparCG Client does today. Binding
// 0.0.0.0 would turn any web page the operator visits into a remote for the playout box, so
// the command refuses to (commands/bridge.ts).
//
// Every security property is a refusal, not a convention:
//   - the token, compared in constant time; `/health` and `/pair` are the routes without it
//   - an origin allowlist: the deployment this Bridge was started for, plus loopback dev ports;
//     any other origin gets 403 and NO CORS headers, so a stray tab cannot read a reply even if
//     it guessed the token. `/health` is the deliberate exception (below)
//   - the Host header must itself be loopback, or a name resolving to 127.0.0.1 from an
//     attacker's own domain would reach in (DNS rebinding)
//   - bodies are capped, `/amcp` takes one line and refuses an embedded CR or LF
//
// State the Bridge keeps: its token (a file), the pairing code in memory, and per slot the
// generation, the instance it started there, what it queued behind it and the sequence it runs
// (./slots.ts, ./runner.ts), also in memory. NoaCG owns every setting; each request names its target.

import { createServer, type IncomingMessage, type Server } from 'node:http';
import { isIP } from 'node:net';
import { amcpSend } from './amcp.js';
import type { ActResult, PlayoutAdapter } from './adapters/casparcg.js';
import { ografApiBase } from './adapters/ograf.js';
import {
  PLAYOUT_V,
  type AgentError,
  type BridgeFeature,
  type ItemKind,
  type MediaPlayback,
  type PlayoutAction,
  type RenderTargetId,
  type SequenceEntry,
  type Slot,
  type Target,
} from './protocol.js';
import { MIN_SEQUENCE_MEMBER_S, SequenceRunner } from './runner.js';
import { SlotMemoryBank } from './slots.js';
import { secretMatches } from './token.js';
import { noacgUrl } from '../config.js';
import { UsageError } from '../output.js';

/** The Bridge's default port. Deliberately clear of the dev-port block (5174-5298) and of the
 *  exported relay's own range (8787-8826), so a studio can run both at once. */
export const DEFAULT_BRIDGE_PORT = 8899;
/** CasparCG's AMCP port since forever. */
export const DEFAULT_AMCP_PORT = 5250;
/** A pairing code is spent on first use or forgotten after this. */
export const PAIRING_TTL_MS = 2 * 60_000;

/** What this build understands beyond the routes every v2 Bridge answers (`/health`). */
export const BRIDGE_FEATURES: readonly BridgeFeature[] = ['state', 'playback', 'sequence'];

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '0:0:0:0:0:0:0:1']);

export function isLoopbackHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').split('%')[0];
  if (LOOPBACK.has(bare)) return true;
  // 127.0.0.0/8 is all loopback, and a machine may well use 127.0.0.2.
  return isIP(bare) === 4 && bare.startsWith('127.');
}

function hostHeaderOk(header: string | undefined): boolean {
  if (!header) return false;
  const host = header.startsWith('[') ? header.slice(0, header.indexOf(']') + 1) : header.split(':')[0];
  return isLoopbackHost(host);
}

/** Origins allowed to talk to the Bridge: the deployment it was started for, plus local dev. */
export function allowedOrigins(extra: string[]): string[] {
  const list = [noacgUrl(), ...extra].map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  return [...new Set(list)];
}

export function originAllowed(origin: string | undefined, allowed: string[]): boolean {
  // No Origin header at all is a non-browser caller (curl, `noacg caspar status`), which the
  // token already gates. A browser always sends one on a cross-origin request.
  if (!origin) return true;
  const normalized = origin.replace(/\/+$/, '');
  if (allowed.includes(normalized)) return true;
  // Any localhost/127.0.0.1 port: a NoaCG dev server or a self-host on the operator's own box.
  try {
    const url = new URL(normalized);
    return isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

/** The one-time code the pairing page exchanges for the token. */
export interface Pairing {
  code: string;
  expiresAt: number;
  used: boolean;
}

export interface BridgeOptions {
  token: string;
  origins: string[];
  adapters: PlayoutAdapter[];
  /** The Bridge's own version, reported by /health. */
  version: string;
  /** The current pairing code, if one is armed: minted at start, spent by /pair, forgotten
   *  after PAIRING_TTL_MS. A fresh one means a fresh start of the Bridge. */
  pairing?: Pairing;
  /** The slots' generations and instances. A test hands in its own to fix the session id. */
  memory?: SlotMemoryBank;
  /** The sequence runner over that memory. A test hands in its own and drives its rounds; without
   *  one the Bridge makes one and runs it four times a second. */
  runner?: SequenceRunner;
}

// --- Request reading -------------------------------------------------------------------------

const MAX_BODY_BYTES = 64_000;

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c: Buffer) => {
      raw += c.toString('utf8');
      if (raw.length > MAX_BODY_BYTES) reject(new UsageError('Request body too large.'));
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        const parsed: unknown = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {});
      } catch {
        reject(new UsageError('Body is not JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function stringMap(v: unknown): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) out[k] = typeof val === 'string' ? val : String(val ?? '');
  return out;
}

/** The target from a body. Every request names one; the Bridge stores nothing. */
export function readTarget(body: Record<string, unknown>, adapters: PlayoutAdapter[]): Target {
  const t = body.target;
  if (!isRecord(t)) throw new UsageError('The request names no target.');
  const adapter = typeof t.adapter === 'string' ? t.adapter : '';
  if (!adapters.some((a) => a.id === adapter)) throw new UsageError(`This Bridge has no adapter "${adapter}".`);
  if (adapter === 'ograf') {
    const baseUrl = typeof t.baseUrl === 'string' ? t.baseUrl.trim() : '';
    if (!baseUrl) throw new UsageError('The target has no base URL.');
    ografApiBase(baseUrl);
    return { adapter: 'ograf', baseUrl };
  }
  const host = typeof t.host === 'string' && t.host.trim() ? t.host.trim() : '';
  if (!host) throw new UsageError('The target has no host.');
  const port = typeof t.port === 'number' && Number.isInteger(t.port) && t.port > 0 && t.port < 65536 ? t.port : DEFAULT_AMCP_PORT;
  return { adapter: 'casparcg', host, port };
}

/** How a target is named in the Bridge's own log. */
function targetLabel(target: Target): string {
  return target.adapter === 'ograf' ? target.baseUrl : `${target.host}:${target.port}`;
}

/** An OGraf render target identifier: the standard allows only a shallow object. */
function readRenderTarget(v: unknown): RenderTargetId {
  if (!isRecord(v)) throw new UsageError('An ograf slot needs a renderTarget object.');
  const out: RenderTargetId = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string' || typeof val === 'boolean' || (typeof val === 'number' && Number.isFinite(val))) out[k] = val;
    else throw new UsageError(`A renderTarget holds only strings, numbers and booleans; "${k}" is not one.`);
  }
  return out;
}

function readSlot(v: unknown): Slot {
  if (isRecord(v) && v.adapter === 'ograf') {
    const rendererId = typeof v.rendererId === 'string' ? v.rendererId.trim() : '';
    if (!rendererId) throw new UsageError('An ograf slot names its renderer.');
    return { adapter: 'ograf', rendererId, renderTarget: readRenderTarget(v.renderTarget) };
  }
  if (!isRecord(v) || v.adapter !== 'casparcg') throw new UsageError('The action has no casparcg or ograf slot.');
  const channel = typeof v.channel === 'number' ? v.channel : NaN;
  const layer = typeof v.layer === 'number' ? v.layer : NaN;
  if (!Number.isInteger(channel) || !Number.isInteger(layer)) throw new UsageError('A slot needs a whole channel and layer.');
  return { adapter: 'casparcg', channel, layer };
}

function readItem(v: unknown): { kind: ItemKind; name: string } {
  if (!isRecord(v)) throw new UsageError('The action has no item.');
  const kind = v.kind;
  if (kind !== 'template' && kind !== 'media' && kind !== 'url') throw new UsageError(`Unknown item kind "${String(kind)}".`);
  const name = typeof v.name === 'string' ? v.name : '';
  if (!name.trim()) throw new UsageError('The item has no name.');
  return { kind, name };
}

/** The longest fade a clip takes, seconds. The page offers half a second and a second. */
const MAX_FADE_S = 10;
/** The loudest gain: +6 dB is 1.9953, so a level the page allows always fits. */
const MAX_GAIN = 2;
/** The most files one sequence plays. */
const MAX_SEQUENCE = 100;

const PLAYBACK_KEYS = new Set(['end', 'fadeIn', 'fadeOut', 'gain', 'trim']);

/** A number of seconds in (0, MAX_FADE_S], or a refusal naming the field. */
function readFade(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > MAX_FADE_S) {
    throw new UsageError(`${name} is a number of seconds above 0 and at most ${MAX_FADE_S}.`);
  }
  return v;
}

/**
 * A clip's playback (docs/CLIP_PLAYBACK_PLAN.md §9), validated field by field. A field this Bridge
 * does not know is REFUSED, never dropped: a take without it would air something other than what
 * the cue says (§6.9).
 */
export function readPlayback(v: unknown): MediaPlayback | undefined {
  if (v === undefined) return undefined;
  if (!isRecord(v)) throw new UsageError('A playback is an object.');
  for (const key of Object.keys(v)) {
    if (!PLAYBACK_KEYS.has(key)) throw new UsageError(`This Bridge does not know the playback field "${key}", so it refuses the action rather than play it without. Update NoaCG Bridge.`);
  }
  const out: MediaPlayback = {};
  if (v.end !== undefined) {
    if (v.end !== 'hold' && v.end !== 'clear' && v.end !== 'loop') throw new UsageError(`A clip ends by hold, clear or loop, not "${String(v.end)}".`);
    out.end = v.end;
  }
  if (v.fadeIn !== undefined) out.fadeIn = readFade(v.fadeIn, 'fadeIn');
  if (v.fadeOut !== undefined) out.fadeOut = readFade(v.fadeOut, 'fadeOut');
  if (v.gain !== undefined) {
    if (typeof v.gain !== 'number' || !Number.isFinite(v.gain) || v.gain < 0 || v.gain > MAX_GAIN) throw new UsageError(`gain is a linear number from 0 to ${MAX_GAIN}.`);
    out.gain = v.gain;
  }
  if (v.trim !== undefined) {
    const t = v.trim;
    if (!isRecord(t) || Object.keys(t).some((k) => k !== 'in' && k !== 'out')) throw new UsageError('A trim is { in, out } in seconds.');
    const point = (p: unknown, name: string) => {
      if (p === undefined) return undefined;
      if (typeof p !== 'number' || !Number.isFinite(p) || p < 0) throw new UsageError(`trim.${name} is a number of seconds from 0.`);
      return p;
    };
    const tin = point(t.in, 'in');
    const tout = point(t.out, 'out');
    if (tin === undefined && tout === undefined) throw new UsageError('A trim names where the clip starts, ends, or both.');
    if (tin !== undefined && tout !== undefined && tout <= tin) throw new UsageError('A trim ends after it starts.');
    if (tout === 0) throw new UsageError('A trim ends after the start of the file.');
    out.trim = { ...(tin !== undefined ? { in: tin } : {}), ...(tout !== undefined ? { out: tout } : {}) };
  }
  return out;
}

/** The length in seconds of the part of a file a playback plays. */
function segmentSeconds(seconds: number, p: MediaPlayback | undefined): number {
  const start = p?.trim?.in ?? 0;
  const end = Math.min(p?.trim?.out ?? seconds, seconds);
  return end - start;
}

/** One entry of a sequence, and the refusals that keep a sequence one that can run (§6.10). */
function readEntry(v: unknown, index: number, count: number): SequenceEntry {
  const n = `Entry ${index + 1}`;
  if (!isRecord(v)) throw new UsageError(`${n} of the sequence is not an object.`);
  const item = readItem(v.item);
  if (item.kind !== 'media') throw new UsageError(`${n} is a ${item.kind}; a sequence plays clips and audio files.`);
  const media = v.media;
  if (!isRecord(media)) throw new UsageError(`${n} does not say what kind of file it is, so it cannot join a sequence.`);
  if (media.kind === 'still') throw new UsageError(`${n} is a still, which never ends, so nothing after it could play.`);
  if (media.kind !== 'movie' && media.kind !== 'audio') throw new UsageError(`${n} is of kind "${String(media.kind)}"; a sequence plays movies and audio files.`);
  const seconds = media.seconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) throw new UsageError(`${n} has no known length, so it cannot join a sequence.`);
  const playback = readPlayback(v.playback);
  const last = index === count - 1;
  if (!last && playback?.end !== undefined && playback.end !== 'hold') {
    throw new UsageError(`${n} ends by "${playback.end}", but only the last entry has an ending of its own: the next file plays after it.`);
  }
  const length = segmentSeconds(seconds, playback);
  if (!(length > 0) || (playback?.trim?.in ?? 0) >= seconds) throw new UsageError(`${n}'s trim lies outside its ${seconds} s file.`);
  // The first entry is taken with the second queued behind it at once; every later one must last
  // long enough for the runner to queue the one after it in time.
  if (index > 0 && length < MIN_SEQUENCE_MEMBER_S) {
    throw new UsageError(`${n} plays ${Math.round(length * 100) / 100} s; a clip in a sequence after the first plays at least ${MIN_SEQUENCE_MEMBER_S} s.`);
  }
  const cueId = typeof v.cueId === 'string' && v.cueId.trim() ? v.cueId.trim().slice(0, 200) : undefined;
  return { item, ...(cueId ? { cueId } : {}), ...(playback && Object.keys(playback).length ? { playback } : {}), media: { kind: media.kind, seconds } };
}

/** An action from a body, validated field by field: what goes to a live channel is never
 *  forwarded on trust. */
export function readAction(body: Record<string, unknown>): PlayoutAction {
  const a = body.action;
  if (!isRecord(a)) throw new UsageError('The request has no action.');
  const slot = readSlot(a.slot);
  // A field on the wrong verb is refused rather than dropped: a level on an update would otherwise
  // look applied and change nothing (docs/CLIP_PLAYBACK_PLAN.md §6.6, a level applies at the next Take).
  if (a.playback !== undefined && a.verb !== 'take') throw new UsageError(`A ${String(a.verb)} carries no playback: a clip's ending, fades, level and trim go with its Take.`);
  if (a.fadeOut !== undefined && a.verb !== 'out') throw new UsageError(`A ${String(a.verb)} carries no fadeOut: only Out fades a clip away.`);
  switch (a.verb) {
    case 'take': {
      // The page's cue id, kept with the instance and handed back on readings. Opaque here, and
      // bounded, since it is echoed to every page that reads the slot.
      const cueId = typeof a.cueId === 'string' && a.cueId.trim() ? a.cueId.trim().slice(0, 200) : undefined;
      const item = readItem(a.item);
      const playback = readPlayback(a.playback);
      if (playback && item.kind !== 'media') throw new UsageError(`Only a clip carries playback; this is a ${item.kind}.`);
      if (a.loop === true && playback?.end !== undefined && playback.end !== 'loop') throw new UsageError(`A clip cannot both loop and ${playback.end} at its end.`);
      return {
        verb: 'take',
        item,
        slot,
        data: stringMap(a.data),
        loop: a.loop === true,
        ...(cueId ? { cueId } : {}),
        ...(playback && Object.keys(playback).length ? { playback } : {}),
      };
    }
    case 'update': {
      const data = stringMap(a.data);
      if (!data) throw new UsageError('An update carries data.');
      return { verb: 'update', slot, data };
    }
    case 'out': {
      const item = isRecord(a.item) ? readItem(a.item) : undefined;
      return { verb: 'out', slot, item, ...(a.fadeOut !== undefined ? { fadeOut: readFade(a.fadeOut, 'fadeOut') } : {}) };
    }
    case 'next':
    case 'pause':
    case 'resume':
      return { verb: a.verb, slot, item: isRecord(a.item) ? readItem(a.item) : undefined };
    case 'clear':
      return { verb: 'clear', slot };
    case 'sequence': {
      const entries = a.entries;
      if (!Array.isArray(entries) || entries.length < 2) throw new UsageError('A sequence plays at least two files.');
      if (entries.length > MAX_SEQUENCE) throw new UsageError(`A sequence plays at most ${MAX_SEQUENCE} files.`);
      return { verb: 'sequence', slot, entries: entries.map((e, i) => readEntry(e, i, entries.length)) };
    }
    default:
      throw new UsageError(`Unknown verb "${String(a.verb)}".`);
  }
}

// --- The server -------------------------------------------------------------------------------

/** Build the Bridge's HTTP server. Exported so a test can drive it on port 0. */
export function createBridgeServer(options: BridgeOptions, log: (line: string) => void): Server {
  const byId = new Map(options.adapters.map((a) => [a.id, a]));
  const memory = options.memory ?? new SlotMemoryBank();
  let runner = options.runner;
  if (!runner) {
    runner = new SequenceRunner({ memory, adapters: options.adapters, log });
    runner.start();
  }

  const server = createServer((req, res) => {
    const origin = req.headers.origin;
    const send = (status: number, body: unknown, cors: boolean) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
      if (cors && origin) {
        // Echo the one origin rather than `*`: a token-bearing call from a page we did not allow
        // must not be readable, and `*` would make the refusal cosmetic.
        headers['Access-Control-Allow-Origin'] = origin;
        headers.Vary = 'Origin';
        headers['Access-Control-Allow-Headers'] = 'authorization, content-type';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        headers['Access-Control-Max-Age'] = '600';
      }
      res.writeHead(status, headers);
      res.end(JSON.stringify(body));
    };
    const refuse = (status: number, code: AgentError['code'], detail: string, cors: boolean) =>
      send(status, { ok: false, v: PLAYOUT_V, error: { hop: 'agent', code, detail } satisfies AgentError }, cors);

    if (!hostHeaderOk(req.headers.host)) {
      refuse(403, 'refused', 'This Bridge answers on 127.0.0.1 only.', false);
      return;
    }

    const url = (req.url ?? '/').split('?')[0];

    // PRESENCE, before the origin check and without a token, readable by ANY origin.
    //
    // A cross-origin refusal is opaque to the page that made it - JavaScript cannot tell "403,
    // wrong origin" from "nothing is listening" - so a Bridge that refused this route by origin
    // would make the studio say "start NoaCG Bridge" to somebody whose Bridge is running and
    // merely started for a different deployment. The reply carries presence, the protocol
    // version and the adapters, and nothing else: no token, no studio, no playout server.
    if (url === '/health' && req.method === 'GET') {
      send(
        200,
        { ok: true, agent: 'noacg-bridge', v: PLAYOUT_V, version: options.version, adapters: [...byId.keys()], features: [...BRIDGE_FEATURES] },
        true,
      );
      return;
    }

    if (!originAllowed(origin, options.origins)) {
      log(`refused origin ${origin ?? '(none)'}`);
      refuse(403, 'refused', 'This origin is not allowed to use the Bridge.', false);
      return;
    }
    if (req.method === 'OPTIONS') {
      send(204, null, true);
      return;
    }
    if (req.method !== 'POST') {
      refuse(405, 'usage', 'POST expected.', true);
      return;
    }

    void (async () => {
      try {
        const body = await readBody(req);

        // PAIRING: the one route a page reaches before it holds the token. The code was minted
        // by this process, shown in its own terminal and carried in the URL it opened, lives
        // two minutes, and is spent on first use - so the token never travels in a URL.
        if (url === '/pair') {
          const code = typeof body.code === 'string' ? body.code : '';
          const p = options.pairing;
          if (!p || p.used || Date.now() > p.expiresAt || !code || !secretMatches(code, p.code)) {
            log('refused a pairing code');
            refuse(401, 'refused', 'That pairing code is not valid. Start NoaCG Bridge again to get a fresh one.', true);
            return;
          }
          p.used = true;
          log('paired a browser');
          send(200, { ok: true, v: PLAYOUT_V, token: options.token }, true);
          return;
        }

        const presented = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
        if (!presented || !secretMatches(presented, options.token)) {
          refuse(401, 'refused', 'Bad or missing Bridge token.', true);
          return;
        }

        const target = readTarget(body, options.adapters);
        const adapter = byId.get(target.adapter)!;
        const at = targetLabel(target);

        if (url === '/status') {
          const r = await adapter.status(target);
          log(`${at} status -> ${r.ok ? r.raw : r.error.code}`);
          send(
            200,
            r.ok
              ? { ok: true, v: PLAYOUT_V, version: r.value.version, raw: r.raw, capabilities: adapter.capabilities(r.value.version).target }
              : { ok: false, v: PLAYOUT_V, error: r.error },
            true,
          );
          return;
        }
        if (url === '/state') {
          // What each layer of one channel holds (docs/CLIP_PLAYBACK_PLAN.md §6.7), read off the
          // server and annotated with what only this Bridge knows. Asked twice a second while a
          // server cue is up, so it is not logged: the log is for commands.
          const channel = body.channel;
          if (typeof channel !== 'number' || !Number.isInteger(channel) || channel < 1) throw new UsageError('A state reading names a whole channel from 1.');
          if (!adapter.state) {
            const error: AgentError = { hop: 'agent', code: 'unsupported', detail: `A ${target.adapter} target cannot report what it is playing.` };
            send(200, { ok: false, v: PLAYOUT_V, error }, true);
            return;
          }
          const r = await adapter.state(target, channel);
          if (!r.ok) {
            send(200, { ok: false, v: PLAYOUT_V, error: r.error }, true);
            return;
          }
          send(
            200,
            { ok: true, v: PLAYOUT_V, channel, session: memory.session, observedAt: Math.round(performance.now()), slots: memory.annotate(target, channel, r.value) },
            true,
          );
          return;
        }
        if (url === '/list') {
          const kind = body.kind;
          if (kind !== 'template' && kind !== 'media') throw new UsageError('A list is of kind "template" or "media".');
          const path = typeof body.path === 'string' ? body.path : undefined;
          const r = await adapter.list(target, kind, path);
          // A target with renderers (OGraf) answers where its library can play in the same reply.
          const rr = r.ok && adapter.renderers ? await adapter.renderers(target) : undefined;
          log(`${at} list ${kind} -> ${r.ok ? `${r.value.length} items` : r.error.code}${rr ? `, ${rr.ok ? `${rr.value.length} renderers` : rr.error.code}` : ''}`);
          if (!r.ok || (rr && !rr.ok)) {
            send(200, { ok: false, v: PLAYOUT_V, error: !r.ok ? r.error : (rr as { ok: false; error: AgentError }).error }, true);
            return;
          }
          send(200, { ok: true, v: PLAYOUT_V, items: r.value, ...(rr?.ok ? { renderers: rr.value } : {}) }, true);
          return;
        }
        if (url === '/thumbnail') {
          const name = typeof body.name === 'string' ? body.name : '';
          const r = await adapter.thumbnail(target, name);
          send(200, r.ok ? { ok: true, v: PLAYOUT_V, png: r.value.png } : { ok: false, v: PLAYOUT_V, error: r.error }, true);
          return;
        }
        if (url === '/act') {
          const action = readAction(body);
          const { slot } = action;
          // Every action that changes what the clock shows - a Take, Out, Clear, Pause, Resume or a
          // new sequence - moves the slot's generation BEFORE it is sent, so a reading that was
          // already on its way reports the older number and the page can set it aside, and anything
          // the runner planned before it is dropped unsent. Pause and Resume keep a running sequence.
          const moves = action.verb !== 'update' && action.verb !== 'next';
          if (moves) memory.advance(target, slot, action.verb === 'pause' || action.verb === 'resume');
          let r: ActResult;
          try {
            // One at a time per slot, behind whatever the runner is sending there. What waits behind
            // the clip is read when the action's turn comes, not when it arrived.
            r = await memory.serial(target, slot, () => adapter.act(target, action, { follower: memory.follower(target, slot) }));
          } finally {
            // Answered or not, the action is no longer in flight: readings count it from here.
            if (moves) memory.settled(target, slot);
          }
          log(`${at} ${action.verb} -> ${r.ok ? r.raw : `${r.error.code} ${r.error.raw ?? ''}`.trim()}${r.ok && r.value.warning ? ` (${r.value.warning})` : ''}`);
          let instance: string | undefined;
          if (r.ok && (action.verb === 'out' || action.verb === 'clear')) memory.ended(target, slot);
          if (r.ok && action.verb === 'take') {
            instance = memory.started(target, slot, action.item, action.cueId);
            // A Clear at the end that could not go with the take (the clip starts part way in) is
            // the runner's to queue, once the clip is running: a run of this one entry.
            if (action.playback?.end === 'clear' && !r.value.follower) {
              memory.sequenceStarted(target, slot, [{ item: action.item, ...(action.cueId ? { cueId: action.cueId } : {}), playback: action.playback }], false);
            }
          }
          if (r.ok && action.verb === 'sequence') {
            const [first] = action.entries;
            instance = memory.started(target, slot, first.item, first.cueId);
            memory.sequenceStarted(target, slot, action.entries, !!r.value.follower);
          }
          if (r.ok && r.value.follower !== undefined) memory.setFollower(target, slot, r.value.follower);
          if (!r.ok && r.follower === null) memory.setFollower(target, slot, null);
          const generation = memory.generation(target, slot);
          send(
            200,
            r.ok
              ? {
                  ok: true,
                  v: PLAYOUT_V,
                  raw: r.raw,
                  generation,
                  session: memory.session,
                  ...(instance ? { instance } : {}),
                  ...(r.value.warning ? { warning: r.value.warning } : {}),
                }
              : { ok: false, v: PLAYOUT_V, error: r.error },
            true,
          );
          return;
        }
        if (url === '/amcp') {
          // The terminal's route (`noacg caspar send` through a Bridge): one raw line, never
          // composed by the page.
          if (target.adapter !== 'casparcg') throw new UsageError('The /amcp route speaks to CasparCG only.');
          if (typeof body.command !== 'string' || !body.command.trim()) throw new UsageError('No AMCP command given.');
          const command = body.command.trim();
          log(`${at} <<< ${command}`);
          const reply = await amcpSend({ host: target.host, port: target.port }, command);
          log(`${at} >>> ${reply.status}`);
          send(200, { ok: reply.code >= 200 && reply.code < 300, v: PLAYOUT_V, command, ...reply }, true);
          return;
        }
        refuse(404, 'usage', `No route ${url}.`, true);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        log(`error: ${message}`);
        if (e instanceof UsageError) {
          refuse(400, 'usage', message, true);
          return;
        }
        // 502, not 500: the Bridge is fine, the thing behind it is not.
        send(502, { ok: false, v: PLAYOUT_V, error: { hop: 'target', code: 'unreachable', detail: message } satisfies AgentError }, true);
      }
    })();
  });
  // The runner this server made stops with it; one handed in belongs to whoever made it.
  if (!options.runner) server.on('close', () => runner.stop());
  return server;
}
