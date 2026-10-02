// The Bridge's token: the one credential between the NoaCG page and the local process.
//
// Stable across runs, so the value a browser was paired with keeps working tomorrow. It is a
// local secret on the operator's own machine and never syncs anywhere; the file name is the one
// the first agent used, so a machine that paired before this command was renamed stays paired.

import { promises as fs } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { configDir } from '../config.js';

function tokenFile(): string {
  return path.join(configDir(), 'caspar-agent.json');
}

export async function resolveToken(explicit: string | undefined, rotate: boolean): Promise<string> {
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

/** Constant-time comparison; a length mismatch spends the same time rather than leaking it. */
export function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** A one-time pairing code: short-lived, spent on first use, exchanged for the token. */
export function mintPairingCode(): string {
  return randomBytes(16).toString('hex');
}

/** One pairing code, open until it is spent or `expiresAt`. */
export interface Pairing {
  code: string;
  expiresAt: number;
}

/** How long a pairing code lives unless it is spent first. */
export const PAIRING_TTL_MS = 2 * 60_000;
/** The most codes open at once. Each is asked for by a paired page or by Enter in the window, so a
 *  handful covers every browser being paired at the same time; the oldest goes first. */
const MAX_OPEN_CODES = 8;

/**
 * THE PAIRING CODES THIS BRIDGE WILL HONOUR (docs/work-specs/studio-day-playout D19): the one minted
 * at start and carried in the link the Bridge opens, and one more each time a paired page asks for a
 * link for another browser or Enter is pressed in the window. Every code works once and for two
 * minutes, as the first one always has; several may be open, so making a link for one browser never
 * spends the link another browser was about to use.
 */
export class PairingCodes {
  private open: Pairing[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  /** A fresh code, open for PAIRING_TTL_MS. */
  mint(): Pairing {
    return this.add({ code: mintPairingCode(), expiresAt: this.now() + PAIRING_TTL_MS });
  }

  /** Honour a code made elsewhere (a test's, with its own expiry). */
  add(pairing: Pairing): Pairing {
    this.open = [...this.live(), pairing].slice(-MAX_OPEN_CODES);
    return pairing;
  }

  /** Spend a code: true once for a code that is open and fresh, false for any other. Each comparison
   *  is constant time, so the answer says nothing about how close a guess came. */
  spend(presented: string): boolean {
    if (!presented) return false;
    const hit = this.live().find((p) => secretMatches(presented, p.code));
    if (!hit) return false;
    this.open = this.live().filter((p) => p !== hit);
    return true;
  }

  private live(): Pairing[] {
    const now = this.now();
    return this.open.filter((p) => now <= p.expiresAt);
  }
}
