// `noacg caspar` - the AMCP half of CasparCG Connect (docs/CASPARCG_CONNECT.md).
//
// WHY THIS EXISTS AT ALL: a browser has one socket primitive, `WebSocket`, and it is an HTTP
// Upgrade handshake, not a socket. Pointed at AMCP on 5250 the browser connects, sends a GET,
// CasparCG answers with an AMCP status line, and the handshake dies with
// ERR_INVALID_HTTP_RESPONSE. No server setting fixes that (measured 2026-08-24, Chromium 149),
// so the socket has to live in a local process - this one. It is a command in the CLI the
// project already ships rather than a second local helper, for the same reason the exported
// package's relay and launcher are one thing (docs/PLAYOUT_INTEGRATION.md §4).
//
// The agent runs on the OPERATOR's machine and binds 127.0.0.1 only. CasparCG may be anywhere
// on the LAN - only AMCP crosses it, exactly as the CasparCG Client does today. Binding
// 0.0.0.0 would turn any web page the operator visits into a remote for the playout box, so
// the agent refuses to.

import { createServer, type IncomingMessage } from 'node:http';
import { connect, isIP, type Socket } from 'node:net';
import { promises as fs } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { configDir, noacgUrl } from '../config.js';
import {
  EXIT_FINDINGS,
  EXIT_OK,
  EXIT_USAGE,
  flagList,
  flagNumber,
  flagString,
  refuseStray,
  UsageError,
  type Out,
  type ParsedArgs,
} from '../output.js';

/** The agent's default port. Deliberately clear of the dev-port block (5174-5298) and of the
 *  exported relay's own range (8787-8826), so a studio can run both at once. */
export const DEFAULT_AGENT_PORT = 8899;
/** CasparCG's AMCP port since forever. */
export const DEFAULT_AMCP_PORT = 5250;
/** The agent's HTTP contract version, reported by /health so a newer studio can refuse an
 *  older agent honestly instead of guessing at its routes. */
export const AGENT_V = 1;

// ---------------------------------------------------------------------------------------------
// AMCP
// ---------------------------------------------------------------------------------------------

export interface AmcpReply {
  /** The numeric status code: 2xx fine, 4xx the client's fault, 5xx the server's. */
  code: number;
  /** The status line, verbatim. */
  status: string;
  /** The data lines that followed it, if any. */
  lines: string[];
}

/**
 * AMCP is a CRLF line protocol. The response shapes that matter:
 *   201 <cmd> OK\r\n<one data line>\r\n
 *   200 <cmd> OK\r\n<line>\r\n<line>\r\n\r\n      (a blank line ends it)
 *   202 <cmd> OK\r\n                              (done, no data)
 *   400 ERROR\r\n<the offending command>\r\n      (and 4xx/5xx generally: status only)
 * There is NO greeting banner, so the command goes out as soon as the socket is up - waiting
 * for one would hang every call.
 *
 * Every one of those shapes was guessed at from the AMCP documentation until 2026-09-10, when all
 * four came back off a real server: `201 VERSION OK` + one line, `200 INFO OK` + lines + a blank
 * terminator, `202 PLAY OK` alone, and `400 ERROR` echoing the command it refused - which on
 * CasparCG 2.3.2 is `HELP`, a command that build does not have. Measured on 2.3.2 (`4de6d18f Dev`)
 * and 2.5.0 (`69e8ad5 Stable`); no shape needed changing.
 */
function parseAmcp(buffer: string): AmcpReply | null {
  const end = buffer.indexOf('\r\n');
  if (end < 0) return null;
  const status = buffer.slice(0, end);
  const code = Number.parseInt(status.trim().split(/\s+/)[0] ?? '', 10);
  if (!Number.isFinite(code)) return null;
  const rest = buffer.slice(end + 2);
  if (code === 200) {
    // Several lines, terminated by an empty one.
    const stop = rest.indexOf('\r\n\r\n');
    const single = rest.startsWith('\r\n') ? 0 : -1;
    if (single === 0) return { code, status, lines: [] };
    if (stop < 0) return null;
    return { code, status, lines: rest.slice(0, stop).split('\r\n').filter((l) => l !== '') };
  }
  if (code === 201 || code === 400) {
    // Exactly one line follows. 400 is the odd one: CasparCG echoes the command it refused,
    // but not every build does, so the caller's grace timer resolves it without the echo.
    const stop = rest.indexOf('\r\n');
    if (stop < 0) return null;
    return { code, status, lines: [rest.slice(0, stop)] };
  }
  return { code, status, lines: [] };
}

export interface AmcpTarget {
  host: string;
  port: number;
  timeoutMs?: number;
}

/** Open AMCP, send one line, read one response, close. A connection per command: AMCP is
 *  stateless per command and a held-open socket is one more thing to recover. */
export function amcpSend(target: AmcpTarget, command: string): Promise<AmcpReply> {
  if (/[\r\n]/.test(command)) {
    return Promise.reject(new UsageError('An AMCP command is one line - it may not contain CR or LF.'));
  }
  const timeoutMs = target.timeoutMs ?? 4000;
  return new Promise<AmcpReply>((resolve, reject) => {
    let socket: Socket;
    let buffer = '';
    let settled = false;
    let grace: NodeJS.Timeout | undefined;
    const done = (err: Error | null, reply?: AmcpReply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (grace) clearTimeout(grace);
      socket?.destroy();
      if (err) reject(err);
      else resolve(reply!);
    };
    const timer = setTimeout(
      () => done(new Error(`No answer from ${target.host}:${target.port} within ${timeoutMs}ms.`)),
      timeoutMs,
    );
    try {
      socket = connect({ host: target.host, port: target.port });
    } catch (e) {
      done(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    socket.setNoDelay(true);
    socket.on('connect', () => socket.write(`${command}\r\n`, 'latin1'));
    socket.on('data', (chunk) => {
      // AMCP is 8-bit; latin1 keeps every byte addressable and never throws on one.
      buffer += chunk.toString('latin1');
      const reply = parseAmcp(buffer);
      if (reply) done(null, reply);
      else if (!grace && buffer.includes('\r\n')) {
        // A status line arrived but the shape says more should follow. Give it a moment, then
        // answer with the status alone rather than hanging on a build that sends nothing more.
        grace = setTimeout(() => {
          const end = buffer.indexOf('\r\n');
          const status = buffer.slice(0, end);
          const code = Number.parseInt(status.trim().split(/\s+/)[0] ?? '', 10);
          done(null, { code: Number.isFinite(code) ? code : 0, status, lines: [] });
        }, 300);
      }
    });
    socket.on('error', (e) => done(e));
    socket.on('close', () => {
      if (settled) return;
      const reply = parseAmcp(buffer);
      if (reply) done(null, reply);
      else done(new Error(`${target.host}:${target.port} closed the connection without answering.`));
    });
  });
}

/** `<channel>-<layer>` - CG addressing, and what PLAY/STOP take too. */
export function layerAddress(channel: number, layer: number): string {
  if (!Number.isInteger(channel) || channel < 1) throw new UsageError(`Channel must be a whole number from 1, got "${channel}".`);
  if (!Number.isInteger(layer) || layer < 0) throw new UsageError(`Layer must be a whole number from 0, got "${layer}".`);
  return `${channel}-${layer}`;
}

/**
 * The one command that is the whole live link. From here every cue, take, update and recovery
 * flows through the durable command log the /output page already follows - which is why there
 * is no per-take CG ADD/CG UPDATE traffic (docs/CASPARCG_CONNECT.md §2).
 */
export function playCommand(channel: number, layer: number, url: string): string {
  if (/["\r\n]/.test(url)) throw new UsageError('That output URL contains a quote or a newline and cannot go on an AMCP line.');
  return `PLAY ${layerAddress(channel, layer)} [HTML] "${url}"`;
}

export function stopCommand(channel: number, layer: number): string {
  return `STOP ${layerAddress(channel, layer)}`;
}

// ---------------------------------------------------------------------------------------------
// The token
// ---------------------------------------------------------------------------------------------

function tokenFile(): string {
  return path.join(configDir(), 'caspar-agent.json');
}

/** Stable across runs, so the value pasted into Settings keeps working tomorrow. */
async function resolveToken(explicit: string | undefined, rotate: boolean): Promise<string> {
  if (explicit) return explicit;
  const file = tokenFile();
  if (!rotate) {
    try {
      const held = JSON.parse(await fs.readFile(file, 'utf8')) as { token?: string };
      if (held.token && held.token.length >= 16) return held.token;
    } catch {
      // No token yet, or an unreadable one - mint a fresh one below.
    }
  }
  const token = randomBytes(24).toString('hex');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({ token }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return token;
}

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the length.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------------------------
// The agent
// ---------------------------------------------------------------------------------------------

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '0:0:0:0:0:0:0:1']);

function isLoopbackHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').split('%')[0];
  if (LOOPBACK.has(bare)) return true;
  // 127.0.0.0/8 is all loopback, and a machine may well use 127.0.0.2.
  return isIP(bare) === 4 && bare.startsWith('127.');
}

/** The Host header must itself be loopback, or a name that resolves to 127.0.0.1 from an
 *  attacker's own domain would reach in (DNS rebinding). */
function hostHeaderOk(header: string | undefined): boolean {
  if (!header) return false;
  const host = header.startsWith('[') ? header.slice(0, header.indexOf(']') + 1) : header.split(':')[0];
  return isLoopbackHost(host);
}

/** Origins allowed to talk to the agent: the deployment it was started for, plus local dev. */
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

interface AgentOptions {
  port: number;
  token: string;
  origins: string[];
}

interface JsonBody {
  host?: unknown;
  port?: unknown;
  channel?: unknown;
  layer?: unknown;
  url?: unknown;
  command?: unknown;
}

function readBody(req: IncomingMessage): Promise<JsonBody> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c: Buffer) => {
      raw += c.toString('utf8');
      if (raw.length > 64_000) reject(new Error('Request body too large.'));
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw) as JsonBody);
      } catch {
        reject(new Error('Body is not JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function targetFrom(body: JsonBody): AmcpTarget {
  const host = typeof body.host === 'string' && body.host.trim() ? body.host.trim() : '127.0.0.1';
  const port = typeof body.port === 'number' && Number.isInteger(body.port) ? body.port : DEFAULT_AMCP_PORT;
  return { host, port };
}

function numberFrom(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

/** Build the agent's HTTP server. Exported so a test can drive it without a port. */
export function createAgentServer(options: AgentOptions, log: (line: string) => void) {
  return createServer((req, res) => {
    const origin = req.headers.origin;
    const send = (status: number, body: unknown, cors: boolean) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cors && origin) {
        // Echo the one origin rather than `*`: a credentialed or token-bearing call from a
        // page we did not allow must not be readable, and `*` would make the refusal cosmetic.
        headers['Access-Control-Allow-Origin'] = origin;
        headers.Vary = 'Origin';
        headers['Access-Control-Allow-Headers'] = 'authorization, content-type';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        headers['Access-Control-Max-Age'] = '600';
      }
      res.writeHead(status, headers);
      res.end(JSON.stringify(body));
    };

    if (!hostHeaderOk(req.headers.host)) {
      send(403, { ok: false, error: 'This agent answers on 127.0.0.1 only.' }, false);
      return;
    }

    const url = (req.url ?? '/').split('?')[0];

    // PRESENCE, before the origin check and without a token, and readable by ANY origin.
    //
    // That ordering is deliberate. A cross-origin refusal is opaque to the page that made it -
    // JavaScript cannot tell "403, wrong origin" from "nothing is listening" - so an agent that
    // refused this route by origin would make the studio say "run `noacg caspar agent`" to
    // somebody whose agent is already running and merely started for a different deployment.
    // The reply carries presence and a protocol version and nothing else: no token, no studio,
    // no word about the playout server. Any local page could learn as much by watching how long
    // a refused connection takes, so answering plainly costs nothing and buys a true diagnosis.
    if (url === '/health' && req.method === 'GET') {
      send(200, { ok: true, agent: 'noacg-caspar', v: AGENT_V }, true);
      return;
    }

    const allowed = originAllowed(origin, options.origins);
    if (!allowed) {
      log(`refused origin ${origin ?? '(none)'}`);
      send(403, { ok: false, error: 'This origin is not allowed to use the agent.' }, false);
      return;
    }
    if (req.method === 'OPTIONS') {
      send(204, null, true);
      return;
    }

    const presented = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!presented || !tokenMatches(presented, options.token)) {
      send(401, { ok: false, error: 'Bad or missing agent token.' }, true);
      return;
    }
    if (req.method !== 'POST') {
      send(405, { ok: false, error: 'POST expected.' }, true);
      return;
    }

    void (async () => {
      try {
        const body = await readBody(req);
        const target = targetFrom(body);
        let command: string;
        if (url === '/status') command = 'VERSION';
        else if (url === '/amcp') {
          if (typeof body.command !== 'string' || !body.command.trim()) throw new UsageError('No AMCP command given.');
          command = body.command.trim();
        } else if (url === '/play') {
          if (typeof body.url !== 'string' || !body.url.trim()) throw new UsageError('No output URL given.');
          command = playCommand(numberFrom(body.channel, 1), numberFrom(body.layer, 20), body.url.trim());
        } else if (url === '/stop') {
          command = stopCommand(numberFrom(body.channel, 1), numberFrom(body.layer, 20));
        } else {
          send(404, { ok: false, error: `No route ${url}.` }, true);
          return;
        }
        log(`${target.host}:${target.port} <<< ${command}`);
        const reply = await amcpSend(target, command);
        log(`${target.host}:${target.port} >>> ${reply.status}`);
        send(200, { ok: reply.code >= 200 && reply.code < 300, command, ...reply }, true);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        log(`error: ${message}`);
        // 502, not 500: the agent is fine, the thing behind it is not. The studio panel reads
        // this as "CasparCG did not answer" rather than "the agent is broken".
        send(e instanceof UsageError ? 400 : 502, { ok: false, error: message }, true);
      }
    })();
  });
}

async function runAgent(args: ParsedArgs, out: Out): Promise<number> {
  const bind = flagString(args, 'host') ?? '127.0.0.1';
  if (!isLoopbackHost(bind)) {
    throw new UsageError(
      `Refusing to bind ${bind}. The agent holds a socket to your playout server, so a non-loopback bind would let any page on the network drive it. Use 127.0.0.1.`,
    );
  }
  const port = flagNumber(args, 'port') ?? DEFAULT_AGENT_PORT;
  const token = await resolveToken(flagString(args, 'token'), args.flags['new-token'] === true);
  const origins = allowedOrigins(flagList(args, 'origin'));
  const quiet = args.flags.quiet === true;
  const server = createAgentServer({ port, token, origins }, (line) => {
    if (!quiet) out.log(`[caspar] ${line}`);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const address = `http://127.0.0.1:${port}`;
  out.result({ ok: true, address, token, origins, v: AGENT_V });
  out.say('');
  out.say('  NoaCG CasparCG agent is running. Leave this window open.');
  out.say('');
  out.say('  Paste these into NoaCG -> Settings -> Playout:');
  out.say(`    Agent address   ${address}`);
  out.say(`    Agent token     ${token}`);
  out.say('');
  out.say(`  Allowed origins   ${origins.join(', ')} (plus any localhost port)`);
  out.say('  Press Ctrl+C to stop.');

  // Run until killed. `noacg caspar agent` is a foreground service, like a dev server.
  await new Promise<void>((resolve) => {
    const stop = () => {
      server.close(() => resolve());
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
  return EXIT_OK;
}

// ---------------------------------------------------------------------------------------------
// The one-shot commands - the route with no browser in it
// ---------------------------------------------------------------------------------------------

function targetFromArgs(args: ParsedArgs): AmcpTarget {
  return {
    host: flagString(args, 'server') ?? flagString(args, 'amcp-host') ?? '127.0.0.1',
    port: flagNumber(args, 'amcp-port') ?? DEFAULT_AMCP_PORT,
    timeoutMs: flagNumber(args, 'timeout') ?? 4000,
  };
}

async function oneShot(args: ParsedArgs, out: Out, command: string): Promise<number> {
  const target = targetFromArgs(args);
  try {
    const reply = await amcpSend(target, command);
    const ok = reply.code >= 200 && reply.code < 300;
    out.result({ ok, target: `${target.host}:${target.port}`, command, ...reply });
    out.say(`${target.host}:${target.port} <<< ${command}`);
    out.say(`${target.host}:${target.port} >>> ${reply.status}`);
    for (const line of reply.lines) out.say(`    ${line}`);
    return ok ? EXIT_OK : EXIT_FINDINGS;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    out.result({ ok: false, target: `${target.host}:${target.port}`, command, error: message });
    out.say(`${target.host}:${target.port} - ${message}`);
    return EXIT_FINDINGS;
  }
}

const USAGE = `noacg caspar <agent|status|send|play|stop> [options]

  agent  [--port ${DEFAULT_AGENT_PORT}] [--token T] [--new-token] [--origin URL]... [--quiet]
         Hold the AMCP socket a browser cannot (docs/CASPARCG_CONNECT.md). 127.0.0.1 only.
  status [--server HOST] [--amcp-port ${DEFAULT_AMCP_PORT}]
         Round-trip a real AMCP VERSION. The first thing to run when Settings says unreachable.
  send   "<AMCP command>" [--server HOST] [--amcp-port ${DEFAULT_AMCP_PORT}]
  play   --url <output URL> [--channel 1] [--layer 20] [--server HOST]
         Put a production on a channel with no browser involved.
  stop   [--channel 1] [--layer 20] [--server HOST]`;

/**
 * Every `caspar` sub-command except `send` takes its arguments as flags, so a bare word here is
 * always a mistake - and the two that matter go to a live channel. `caspar play --url … 1 20`
 * reads as "channel 1, layer 20" and is not: the words are dropped, the command goes out on the
 * defaults, and a production lands on a layer the operator did not name. `send` is the exception
 * by design, because its words ARE the AMCP command.
 *
 * `caspar` cannot use `refuseStrayArgs`: `_[1]` is a sub-command rather than an argument, so the
 * refusal has to name both words and say what THIS sub-command accepts.
 */
function refuseStrayCasparArgs(args: ParsedArgs, sub: string): void {
  // No quoting example: not one flag on any of these sub-commands takes a value that can hold a
  // space, so the generic advice in refuseStray is the true one here.
  refuseStray(`caspar ${sub}`, args._.slice(2), 'no argument');
}

export async function runCaspar(args: ParsedArgs, out: Out): Promise<number> {
  const sub = args._[1];
  switch (sub) {
    case 'agent':
      refuseStrayCasparArgs(args, sub);
      return runAgent(args, out);
    case 'status':
      refuseStrayCasparArgs(args, sub);
      return oneShot(args, out, 'VERSION');
    case 'send': {
      const command = args._.slice(2).join(' ').trim();
      if (!command) throw new UsageError('`noacg caspar send` needs an AMCP command, e.g. `noacg caspar send INFO`.');
      return oneShot(args, out, command);
    }
    case 'play': {
      refuseStrayCasparArgs(args, sub);
      const url = flagString(args, 'url');
      if (!url) throw new UsageError('`noacg caspar play` needs --url, the production\'s output URL.');
      return oneShot(args, out, playCommand(flagNumber(args, 'channel') ?? 1, flagNumber(args, 'layer') ?? 20, url));
    }
    case 'stop':
      refuseStrayCasparArgs(args, sub);
      return oneShot(args, out, stopCommand(flagNumber(args, 'channel') ?? 1, flagNumber(args, 'layer') ?? 20));
    default:
      out.say(USAGE);
      return sub ? EXIT_USAGE : EXIT_USAGE;
  }
}
