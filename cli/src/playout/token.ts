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
