// AMCP, precisely: the wire CasparCG speaks on port 5250 (docs/BRIDGE.md "AMCP, precisely").
//
// A CRLF line protocol with numeric status codes. The response shapes that matter:
//   201 <cmd> OK\r\n<one data line>\r\n
//   200 <cmd> OK\r\n<line>\r\n<line>\r\n\r\n      (a blank line ends it)
//   202 <cmd> OK\r\n                              (done, no data)
//   400 ERROR\r\n<the offending command>\r\n      (and 4xx/5xx generally: status only)
// There is NO greeting banner, so the command goes out as soon as the socket is up - waiting
// for one would hang every call. Every shape here came back off real servers: 2.3.2
// (`4de6d18f Dev`) and 2.5.0 (`69e8ad5 Stable`) on 2026-09-10, and again on 2.5.0 on 2026-09-22
// with TLS, CLS, CINF, THUMBNAIL, CG and a clip named `Jääkiekko` (the reason the wire is UTF-8
// here and no longer latin1: the name went out and came back intact).
//
// One connection per command. AMCP is stateless per command and a held-open socket is one more
// thing to recover; the Bridge keeps no connection state between requests.

import { connect, type Socket } from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import { UsageError } from '../output.js';

export interface AmcpReply {
  /** The numeric status code: 2xx fine, 4xx the client's fault, 5xx the server's. */
  code: number;
  /** The status line, verbatim. */
  status: string;
  /** The data lines that followed it, if any. */
  lines: string[];
}

export interface AmcpTarget {
  host: string;
  port: number;
  timeoutMs?: number;
}

/** A reply larger than this is refused rather than buffered: a thumbnail is about 160 KB, a
 *  whole media list a few hundred, so 8 MB is a wall nothing legitimate reaches. */
export const MAX_REPLY_BYTES = 8 * 1024 * 1024;

/** The wait for a command's answer. Long enough for a server busy loading a clip; short enough
 *  that an operator is told rather than left waiting. */
export const DEFAULT_TIMEOUT_MS = 4000;

/** "No answer" is its own class of failure, told apart from a dead socket by this type. A
 *  server whose media scanner is not running answers TLS and CLS with `501 TLS FAILED` only after
 *  its own HTTP timeout toward the scanner, about 5 s (measured on 2.5.0, 2026-09-22), so a list
 *  command waits longer than a cue does - see LIST_TIMEOUT_MS in the adapter. */
export class AmcpTimeout extends Error {
  constructor(target: AmcpTarget, timeoutMs: number) {
    super(`No answer from ${target.host}:${target.port} within ${timeoutMs}ms.`);
    this.name = 'AmcpTimeout';
  }
}

export function parseAmcp(buffer: string): AmcpReply | null {
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

/** Open AMCP, send one line, read one response, close. */
export function amcpSend(target: AmcpTarget, command: string): Promise<AmcpReply> {
  if (/[\r\n]/.test(command)) {
    return Promise.reject(new UsageError('An AMCP command is one line - it may not contain CR or LF.'));
  }
  const timeoutMs = target.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise<AmcpReply>((resolve, reject) => {
    let socket: Socket;
    let buffer = '';
    let bytes = 0;
    let settled = false;
    let grace: NodeJS.Timeout | undefined;
    // UTF-8 can split across chunks; the decoder holds the partial character until the rest
    // arrives, where a per-chunk toString would have emitted a replacement character.
    const decoder = new StringDecoder('utf8');
    const done = (err: Error | null, reply?: AmcpReply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (grace) clearTimeout(grace);
      socket?.destroy();
      if (err) reject(err);
      else resolve(reply!);
    };
    const timer = setTimeout(() => done(new AmcpTimeout(target, timeoutMs)), timeoutMs);
    try {
      socket = connect({ host: target.host, port: target.port });
    } catch (e) {
      done(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    socket.setNoDelay(true);
    socket.on('connect', () => socket.write(`${command}\r\n`, 'utf8'));
    socket.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_REPLY_BYTES) {
        done(new Error(`${target.host}:${target.port} sent more than ${MAX_REPLY_BYTES} bytes in one reply.`));
        return;
      }
      buffer += decoder.write(chunk);
      const reply = parseAmcp(buffer);
      if (reply) done(null, reply);
      else if (!grace && buffer.includes('\r\n') && !buffer.startsWith('2')) {
        // A 4xx or 5xx status line arrived but the shape says an echo should follow. Give it a
        // moment, then answer with the status alone rather than hanging on a build that sends
        // nothing more. A 2xx never takes this road: a long TLS or CLS list arrives in several
        // chunks, and answering early would hand back an empty library as a success.
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
      buffer += decoder.end();
      const reply = parseAmcp(buffer);
      if (reply) done(null, reply);
      else done(new Error(`${target.host}:${target.port} closed the connection without answering.`));
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Building command lines
// ---------------------------------------------------------------------------------------------

/**
 * A string argument, quoted the way CasparCG's tokenizer reads it (server
 * src/protocol/util/tokenize.cpp): inside double quotes exactly `\\`, `\"` and `\n` are escapes,
 * and a backslash before anything else is dropped. So every backslash, quote and line feed is
 * escaped, and a carriage return - which would end the COMMAND, not the argument - is refused:
 * that is command injection into a live channel and no escape exists for it.
 */
export function amcpQuote(value: string): string {
  if (value.includes('\r')) throw new UsageError('An AMCP argument may not contain a carriage return.');
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** `<channel>-<layer>` - CG addressing, and what PLAY/STOP take too. */
export function layerAddress(channel: number, layer: number): string {
  if (!Number.isInteger(channel) || channel < 1) throw new UsageError(`Channel must be a whole number from 1, got "${channel}".`);
  if (!Number.isInteger(layer) || layer < 0) throw new UsageError(`Layer must be a whole number from 0, got "${layer}".`);
  return `${channel}-${layer}`;
}

// ---------------------------------------------------------------------------------------------
// Reading replies
// ---------------------------------------------------------------------------------------------

/** `201 VERSION OK` + `2.5.0 69e8ad5 Stable`: the one data line is the version. */
export function parseVersion(reply: AmcpReply): string {
  return reply.lines[0]?.trim() ?? '';
}

/** Undo `amcpQuote` on a name the server quoted back to us. */
function unquote(token: string): string {
  const inner = token.startsWith('"') && token.endsWith('"') && token.length >= 2 ? token.slice(1, -1) : token;
  return inner.replace(/\\(["\\n])/g, (_, c: string) => (c === 'n' ? '\n' : c));
}

export interface TemplateEntry {
  name: string;
}

/**
 * `200 TLS OK` lines. Measured on 2.5.0 (2026-09-22): one bare id per line, upper-cased, the path
 * from the template root without its extension - `HOUSE_STRAP/HOUSE_STRAP`, `BK/SB01`. Older
 * builds quoted the name and appended a size and a timestamp; a quoted first token is honoured
 * and anything after it is ignored, so both shapes read.
 */
export function parseTls(lines: string[]): TemplateEntry[] {
  const out: TemplateEntry[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(trimmed);
    const name = quoted ? unquote(quoted[0]) : trimmed.split(/\s+/)[0];
    if (name) out.push({ name });
  }
  return out;
}

export interface MediaEntry {
  name: string;
  /** `movie`, `still` or `audio`, as the scanner classifies it. */
  kind: string;
  bytes: number;
  /** `YYYYMMDDHHMMSS`. */
  changed: string;
  frames: number;
  /** Frames per second, 0 for a still. */
  fps: number;
}

/**
 * `200 CLS OK` lines, each `"NAME"  TYPE  bytes YYYYMMDDHHMMSS frames num/den` (two spaces after
 * the name and the type on 2.5.0; one is accepted). A still reports `0 0/1` on 2.5.0, and on
 * 2.3.2 `NaN 0/0` or `1 1/25` (measured 2026-09-22), so the frame count may be `NaN` and the
 * rate's denominator zero. A line that does not match is skipped rather than failing the whole
 * list: one odd file must not hide the library.
 */
export function parseCls(lines: string[]): MediaEntry[] {
  const out: MediaEntry[] = [];
  const row = /^"((?:[^"\\]|\\.)*)"\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+|NaN)\s+(\d+)\/(\d+)\s*$/;
  for (const line of lines) {
    const m = row.exec(line.trim());
    if (!m) continue;
    const num = Number(m[6]);
    const den = Number(m[7]);
    out.push({
      name: unquote(`"${m[1]}"`),
      kind: m[2].toLowerCase(),
      bytes: Number(m[3]),
      changed: m[4],
      frames: m[5] === 'NaN' ? 0 : Number(m[5]),
      fps: den > 0 && num > 0 ? num / den : 0,
    });
  }
  return out;
}
