// WHETHER SAVES AND PUBLISHES GO IN PARTS (docs/work-specs/live-publishing/designs/G4.md section 7).
//
// `partial_writes_state()` (migration 0119) says the server has the functions and whether the
// `partial_writes` switch is on. Off, unreadable or missing means whole saves and whole publishes,
// as before phase 7. Read at most every 30 s, so turning the switch off reaches every open page
// within that.

import { getSupabase } from './supabase';

const READ_EVERY_MS = 30_000;

let known: { on: boolean; at: number } | null = null;
let asking: Promise<boolean> | null = null;
/** The server has no such function (an instance before 0119): never asked again in this page load. */
let absent = false;

export async function partialWritesOn(now: number = Date.now()): Promise<boolean> {
  if (absent) return false;
  // Units and images are named by SHA-256 (Web Crypto); a page without it writes whole (G4 R24).
  if (!(globalThis as { crypto?: { subtle?: unknown } }).crypto?.subtle) return false;
  if (known && now - known.at < READ_EVERY_MS) return known.on;
  if (asking) return asking;
  asking = (async () => {
    try {
      const sb = await getSupabase();
      if (!sb) return false;
      const { data, error } = await sb.rpc('partial_writes_state');
      if (error) {
        if (error.code === 'PGRST202') absent = true;
        known = { on: false, at: Date.now() };
        return false;
      }
      const state = (data ?? {}) as { installed?: unknown; on?: unknown };
      const on = state.installed === true && state.on === true;
      known = { on, at: Date.now() };
      return on;
    } catch {
      known = { on: false, at: Date.now() };
      return false;
    } finally {
      asking = null;
    }
  })();
  return asking;
}

/** What each unit digest waits for: by default a later task; the production page adds "no send of
 *  this page in flight" (G4 section 2, R18) through `setUnitPace`. */
function laterTask(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'function') {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    } else setTimeout(resolve, 0);
  });
}

let pace: () => Promise<void> = laterTask;

export function setUnitPace(next: () => Promise<void>): void {
  pace = next;
}

export function unitPace(): Promise<void> {
  return pace();
}

/** The revision each production record's last write from this page stored, with the identity it
 *  stored (the body's `updatedAt`, or the team token): the answer of the write itself, so the
 *  publisher need not read it back (G4 section 11). */
const written = new Map<string, { rev: number; identity: string }>();

export function noteWritten(id: string, rev: number, identity: string): void {
  written.set(id, { rev, identity });
}

export function writtenRevision(id: string): { rev: number; identity: string } | null {
  return written.get(id) ?? null;
}

/** Tests only. */
export function resetPartialWritesForTest(): void {
  written.clear();
  known = null;
  asking = null;
  absent = false;
}
