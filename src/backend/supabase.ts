// The Supabase client factory (Era 5). Lazily created and cached — and ONLY when a backend is
// configured, so an offline / self-host build never even loads the Supabase library: the dynamic
// import below is code-split into its own chunk that is fetched only in hosted mode. Returns null
// in offline mode; every caller must handle null and degrade to the local-only path.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBackendConfig, isBackendConfigured } from './config';
import { realtimeReconnectAfterMs } from './realtimeReconnect';

let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * How long the cloud may leave a request unanswered. Nothing else ends one: the browser waits as
 * long as the connection looks alive, and a sync pass or a team save waiting on it keeps the sync
 * chip amber with nothing able to run behind it (#2090). It is past the minute after which the chip
 * turns amber, so a save that is merely slow keeps its chance to land.
 */
const NO_ANSWER_MS = 75_000;

/** A failed cloud request, in words. A request nobody answered, or a connection that failed, comes
 *  back from the library as the name of a browser error, and an operator reads this on air. */
export function cloudFailureWords(message: string): string {
  return /did not answer|Failed to fetch|NetworkError|Load failed/.test(message) ? 'The cloud did not answer. Changes stay on this device.' : message;
}

/**
 * Every request of the shared client, with that limit up to the first byte of the answer, so a
 * large body still takes as long as it takes. It fails as an abort because the library retries any
 * other failure of a read. A Storage write is left alone: its answer waits on the upload, and a
 * connection that dies while sending fails by itself. Edge functions keep their own time.
 */
function answeredFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const { pathname } = new URL(request ? request.url : input.toString());
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const limited = pathname.startsWith('/rest/v1/') || pathname.startsWith('/auth/v1/')
    || (pathname.startsWith('/storage/v1/') && (method === 'GET' || method === 'HEAD'));
  if (!limited) return fetch(input, init);
  const limit = new AbortController();
  const asked = init?.signal ?? request?.signal;
  if (asked?.aborted) limit.abort(asked.reason);
  else asked?.addEventListener('abort', () => limit.abort(asked.reason), { once: true });
  const timer = setTimeout(() => limit.abort(new DOMException('The cloud did not answer.', 'AbortError')), NO_ANSWER_MS);
  return fetch(input, { ...init, signal: limit.signal }).finally(() => clearTimeout(timer));
}

/**
 * The shared Supabase client, or null when no backend is configured (offline mode).
 *
 * A FAILED load is not kept. The library arrives as its own chunk, and one 404 or dropped
 * connection on it used to become this module's answer for the life of the page: every later
 * caller got the same rejection, so an unattended /output renderer stayed dead until someone
 * reloaded it (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.6). The next caller now tries again.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    const pending = create();
    clientPromise = pending;
    pending.catch(() => {
      if (clientPromise === pending) clientPromise = null;
    });
  }
  return clientPromise;
}

async function create(): Promise<SupabaseClient | null> {
  const cfg = loadBackendConfig();
  if (!isBackendConfigured(cfg)) return null;
  // Code-split: the Supabase library is fetched only here, only in hosted mode.
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // completes the OAuth redirect when the page loads back
    },
    global: { fetch: answeredFetch },
    // The library's reconnect steps with jitter, so pages dropped together do not retry together.
    realtime: { reconnectAfterMs: (tries: number) => realtimeReconnectAfterMs(tries) },
  });
}
