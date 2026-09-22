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
// State the Bridge keeps: its token (a file), and the pairing code in memory. NoaCG owns every
// setting; each request names its target.

import { createServer, type IncomingMessage, type Server } from 'node:http';
import { isIP } from 'node:net';
import { amcpSend } from './amcp.js';
import type { PlayoutAdapter } from './adapters/casparcg.js';
import { PLAYOUT_V, type AdapterId, type AgentError, type ItemKind, type PlayoutAction, type Target } from './protocol.js';
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
  /** The current pairing code, if one is armed. Replaced by `--pair`; spent by /pair. */
  pairing?: Pairing;
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
  const host = typeof t.host === 'string' && t.host.trim() ? t.host.trim() : '';
  if (!host) throw new UsageError('The target has no host.');
  const port = typeof t.port === 'number' && Number.isInteger(t.port) && t.port > 0 && t.port < 65536 ? t.port : DEFAULT_AMCP_PORT;
  return { adapter: adapter as AdapterId, host, port };
}

function readSlot(v: unknown): PlayoutAction['slot'] {
  if (!isRecord(v) || v.adapter !== 'casparcg') throw new UsageError('The action has no casparcg slot.');
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

/** An action from a body, validated field by field: what goes to a live channel is never
 *  forwarded on trust. */
export function readAction(body: Record<string, unknown>): PlayoutAction {
  const a = body.action;
  if (!isRecord(a)) throw new UsageError('The request has no action.');
  const slot = readSlot(a.slot);
  switch (a.verb) {
    case 'take':
      return { verb: 'take', item: readItem(a.item), slot, data: stringMap(a.data), loop: a.loop === true };
    case 'update': {
      const data = stringMap(a.data);
      if (!data) throw new UsageError('An update carries data.');
      return { verb: 'update', slot, data };
    }
    case 'next':
    case 'out':
    case 'pause':
    case 'resume':
      return { verb: a.verb, slot, item: isRecord(a.item) ? readItem(a.item) : undefined };
    default:
      throw new UsageError(`Unknown verb "${String(a.verb)}".`);
  }
}

// --- The server -------------------------------------------------------------------------------

/** Build the Bridge's HTTP server. Exported so a test can drive it on port 0. */
export function createBridgeServer(options: BridgeOptions, log: (line: string) => void): Server {
  const byId = new Map(options.adapters.map((a) => [a.id, a]));

  return createServer((req, res) => {
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
      send(200, { ok: true, agent: 'noacg-bridge', v: PLAYOUT_V, version: options.version, adapters: [...byId.keys()] }, true);
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
        const at = `${target.host}:${target.port}`;

        if (url === '/status') {
          const r = await adapter.status(target);
          log(`${at} VERSION -> ${r.ok ? r.raw : r.error.code}`);
          send(200, r.ok ? { ok: true, v: PLAYOUT_V, version: r.value.version, raw: r.raw } : { ok: false, v: PLAYOUT_V, error: r.error }, true);
          return;
        }
        if (url === '/list') {
          const kind = body.kind;
          if (kind !== 'template' && kind !== 'media') throw new UsageError('A list is of kind "template" or "media".');
          const path = typeof body.path === 'string' ? body.path : undefined;
          const r = await adapter.list(target, kind, path);
          log(`${at} list ${kind} -> ${r.ok ? `${r.value.length} items` : r.error.code}`);
          send(200, r.ok ? { ok: true, v: PLAYOUT_V, items: r.value } : { ok: false, v: PLAYOUT_V, error: r.error }, true);
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
          const r = await adapter.act(target, action);
          log(`${at} ${action.verb} -> ${r.ok ? r.raw : `${r.error.code} ${r.error.raw ?? ''}`.trim()}`);
          send(200, r.ok ? { ok: true, v: PLAYOUT_V, raw: r.raw } : { ok: false, v: PLAYOUT_V, error: r.error }, true);
          return;
        }
        if (url === '/amcp') {
          // The terminal's route (`noacg caspar send` through a Bridge): one raw line, never
          // composed by the page.
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
}
