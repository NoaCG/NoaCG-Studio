// OSC OUT: ONE MESSAGE, ONE UDP DATAGRAM (docs/work-specs/osc-control-cues/spec.md D1, D6, D7).
//
// The page names a destination, an OSC address and typed arguments; the Bridge checks them,
// encodes the packet and sends it once. Nothing here retries: UDP has no receipt, so `sent` means
// the datagram left this computer, never that a device acted on it.
//
// Safety, in the order a send meets it:
//   1. the send id is reserved before anything slow, so a repeat of one press answers the first
//      outcome and never sends twice (a page that lost the reply, a panel that retried);
//   2. a rate bucket refuses a flood at once (a broken page cannot spray a network);
//   3. the message is validated and encoded (address, types, ranges, size);
//   4. the host is resolved ONCE to an IPv4 address, and that number is the one checked and used:
//      loopback, private, link-local and VPN/CGNAT unicast pass; broadcast, multicast and 0.0.0.0
//      never do; public unicast only when the Bridge was started to allow it;
//   5. the whole of 3-4 and the send must finish within the deadline, or nothing is sent.

import { createSocket } from 'node:dgram';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type OscArgType = 's' | 'i' | 'f';
export interface OscArg {
  type: OscArgType;
  value: string;
}

/** Most arguments one message may carry, and the largest encoded packet, in bytes. */
export const OSC_MAX_ARGS = 16;
export const OSC_MAX_BYTES = 1024;
/** How long a send may take from receipt, resolution included, before it is refused unsent. */
export const OSC_DEADLINE_MS = 500;
/** How long a send id is remembered, and how many at most. */
export const OSC_SEND_ID_TTL_MS = 60_000;
const OSC_SEND_ID_MAX = 2048;
/** The rate bucket: this many sends at once, refilled at this many a second. */
export const OSC_BURST = 20;
export const OSC_PER_SECOND = 10;

export class OscError extends Error {
  constructor(message: string, readonly code: 'usage' | 'refused' | 'unreachable' | 'uncertain') {
    super(message);
  }
}

// ── Encoding ────────────────────────────────────────────────────────────────────────────────

/** A string, NUL-terminated and padded with NULs to a multiple of four bytes. */
function oscString(text: string): Buffer {
  const raw = Buffer.from(text, 'utf8');
  const out = Buffer.alloc((Math.floor(raw.length / 4) + 1) * 4);
  raw.copy(out);
  return out;
}

/** Why an OSC address is not one this Bridge sends, or null. */
export function addressProblem(address: string): string | null {
  if (!address.startsWith('/')) return 'An OSC address starts with /.';
  // Printable ASCII only, no space, and none of the characters OSC reserves for patterns or
  // the type tag: a sender names one method exactly.
  if (!/^\/[\x21-\x7e]*$/.test(address)) return 'An OSC address has no spaces or special characters.';
  if (/[#*,?[\]{}]/.test(address)) return 'An OSC address may not contain # * , ? [ ] { }.';
  return null;
}

const INT32 = /^[+-]?\d+$/;
const FLOAT = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** One argument as bytes, or why it cannot be sent. */
function encodeArg(arg: OscArg, index: number): Buffer {
  const where = `Argument ${index + 1}`;
  if (arg.type === 's') return oscString(arg.value);
  const text = arg.value.trim();
  if (arg.type === 'i') {
    const n = INT32.test(text) ? Number(text) : NaN;
    if (!Number.isSafeInteger(n) || n < -2147483648 || n > 2147483647) throw new OscError(`${where} is not a whole number from -2147483648 to 2147483647.`, 'usage');
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
  }
  if (arg.type === 'f') {
    const n = FLOAT.test(text) ? Number(text) : NaN;
    if (!Number.isFinite(n) || Math.abs(Math.fround(n)) === Infinity) throw new OscError(`${where} is not a decimal number.`, 'usage');
    const b = Buffer.alloc(4);
    b.writeFloatBE(n);
    return b;
  }
  throw new OscError(`${where} has a type this Bridge does not send.`, 'usage');
}

/** The OSC 1.0 message for `address` and `args`, or an OscError saying what is wrong. */
export function encodeOscMessage(address: string, args: readonly OscArg[]): Buffer {
  const problem = addressProblem(address);
  if (problem) throw new OscError(problem, 'usage');
  if (args.length > OSC_MAX_ARGS) throw new OscError(`A message carries at most ${OSC_MAX_ARGS} arguments.`, 'usage');
  const packet = Buffer.concat([oscString(address), oscString(`,${args.map((a) => a.type).join('')}`), ...args.map(encodeArg)]);
  if (packet.length > OSC_MAX_BYTES) throw new OscError(`The message is ${packet.length} bytes; at most ${OSC_MAX_BYTES} are sent.`, 'usage');
  return packet;
}

/** The request body's message, checked for shape. */
export function readOscArgs(raw: unknown): OscArg[] {
  if (!Array.isArray(raw)) throw new OscError('No arguments list given.', 'usage');
  return raw.map((a, i) => {
    const t = (a ?? {}) as Record<string, unknown>;
    if ((t.type !== 's' && t.type !== 'i' && t.type !== 'f') || typeof t.value !== 'string') throw new OscError(`Argument ${i + 1} is not a string, whole number or decimal number.`, 'usage');
    return { type: t.type, value: t.value };
  });
}

// ── Destinations ─────────────────────────────────────────────────────────────────────────────

export type AddressClass = 'loopback' | 'private' | 'link-local' | 'cgnat' | 'public' | 'refused';

/** Where an IPv4 address points, for the destination rule. */
export function classifyIPv4(ip: string): AddressClass {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return 'refused';
  const [a, b] = parts;
  if (a === 0) return 'refused'; // 0.0.0.0/8: "this network", never a device
  if (a >= 224) return 'refused'; // multicast, reserved and the limited broadcast 255.255.255.255
  if (parts[3] === 255) return 'refused'; // a /24 or wider broadcast address
  if (a === 127) return 'loopback';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 100 && b >= 64 && b <= 127) return 'cgnat';
  return 'public';
}

/** Why the Bridge will not send to this address, or null. */
export function destinationRefusal(ip: string, allowPublic: boolean): string | null {
  const kind = classifyIPv4(ip);
  if (kind === 'refused') return `${ip} is a broadcast, multicast or unspecified address. OSC cues send to one device.`;
  if (kind === 'public' && !allowPublic) return `${ip} is on the internet. This NoaCG Bridge sends OSC to this computer, the studio network and VPNs only.`;
  return null;
}

// ── The sender ───────────────────────────────────────────────────────────────────────────────

export interface OscRequest {
  sendId: string;
  host: string;
  port: number;
  address: string;
  args: OscArg[];
}

export interface OscSent {
  /** The numeric address and port the datagram went to. */
  to: string;
  bytes: number;
}

export type OscOutcome = { ok: true; value: OscSent } | { ok: false; error: OscError };

export interface OscIo {
  now: () => number;
  resolve: (host: string) => Promise<string>;
  send: (packet: Buffer, ip: string, port: number) => Promise<void>;
}

const realIo: OscIo = {
  now: () => Date.now(),
  resolve: async (host) => (isIP(host) === 4 ? host : (await lookup(host, { family: 4 })).address),
  send: (packet, ip, port) =>
    new Promise((resolve, reject) => {
      // A fresh socket per send: no state survives between cues, and the broadcast option stays
      // off, so the operating system refuses a broadcast address on its own too.
      const socket = createSocket('udp4');
      socket.once('error', (e) => {
        socket.close();
        reject(e);
      });
      socket.send(packet, port, ip, (e) => {
        socket.close();
        if (e) reject(e);
        else resolve();
      });
    }),
};

/** Read the body of `POST /osc`. */
export function readOscRequest(body: Record<string, unknown>): OscRequest {
  const sendId = typeof body.sendId === 'string' ? body.sendId.trim() : '';
  if (!sendId || sendId.length > 200) throw new OscError('Every OSC send needs a send id.', 'usage');
  const host = typeof body.host === 'string' ? body.host.trim() : '';
  if (!host || host.length > 253) throw new OscError('No destination address given.', 'usage');
  const port = body.port;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) throw new OscError('The destination port is a whole number from 1 to 65535.', 'usage');
  if (typeof body.address !== 'string') throw new OscError('No OSC address given.', 'usage');
  return { sendId, host, port, address: body.address, args: readOscArgs(body.args) };
}

export class OscSender {
  private readonly io: OscIo;
  private readonly seen = new Map<string, { at: number; outcome: Promise<OscOutcome> }>();
  private tokens = OSC_BURST;
  private filled: number;

  constructor(private readonly allowPublic: boolean, io: Partial<OscIo> = {}) {
    this.io = { ...realIo, ...io };
    this.filled = this.io.now();
  }

  /** Send one message, or answer the outcome of the first request that carried this send id.
   *  `repeat` says the answer is that earlier outcome and nothing was sent now. */
  send(request: OscRequest): Promise<OscOutcome & { repeat?: true }> {
    const now = this.io.now();
    this.forget(now);
    const earlier = this.seen.get(request.sendId);
    if (earlier) return earlier.outcome.then((o) => ({ ...o, repeat: true as const }));
    if (!this.take(now)) {
      // Not remembered: a press refused for the rate may be pressed again.
      return Promise.resolve({ ok: false, error: new OscError('Too many OSC sends at once. Nothing was sent.', 'refused') });
    }
    const outcome = this.run(request, now);
    this.seen.set(request.sendId, { at: now, outcome });
    return outcome;
  }

  private async run(request: OscRequest, startedAt: number): Promise<OscOutcome> {
    try {
      const packet = encodeOscMessage(request.address, request.args);
      const late = () => this.io.now() - startedAt > OSC_DEADLINE_MS;
      let ip: string;
      try {
        ip = await withDeadline(this.io.resolve(request.host), OSC_DEADLINE_MS - (this.io.now() - startedAt));
      } catch (e) {
        throw e instanceof OscError ? e : new OscError(`${request.host} could not be found on the network.`, 'unreachable');
      }
      if (isIP(ip) !== 4) throw new OscError(`${request.host} has no IPv4 address. This NoaCG Bridge sends OSC over IPv4.`, 'refused');
      const refused = destinationRefusal(ip, this.allowPublic);
      if (refused) throw new OscError(refused, 'refused');
      if (late()) throw new OscError(`Finding ${request.host} took too long, so nothing was sent.`, 'unreachable');
      try {
        await this.io.send(packet, ip, request.port);
      } catch (e) {
        throw new OscError(`The message could not leave this computer: ${e instanceof Error ? e.message : String(e)}.`, 'unreachable');
      }
      return { ok: true, value: { to: `${ip}:${request.port}`, bytes: packet.length } };
    } catch (e) {
      return { ok: false, error: e instanceof OscError ? e : new OscError(String(e), 'unreachable') };
    }
  }

  private take(now: number): boolean {
    this.tokens = Math.min(OSC_BURST, this.tokens + ((now - this.filled) / 1000) * OSC_PER_SECOND);
    this.filled = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private forget(now: number): void {
    for (const [id, entry] of this.seen) {
      if (now - entry.at <= OSC_SEND_ID_TTL_MS && this.seen.size <= OSC_SEND_ID_MAX) break;
      this.seen.delete(id);
    }
  }
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return Promise.reject(new OscError('The send took too long, so nothing was sent.', 'unreachable'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new OscError('Finding the destination took too long, so nothing was sent.', 'unreachable')), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
