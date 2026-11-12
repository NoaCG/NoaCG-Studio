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
/** The answer waits on the body going out, so a request gets the time to send it on the slowest
 *  link worth waiting for, about 256 kbit/s. */
const SEND_BYTES_PER_MS = 32;

/** What a request ended by that limit fails with, wherever it shows up in a longer message. */
export const NOT_ANSWERED = 'The cloud did not answer.';
export const isNotAnswered = (error: unknown): boolean => error instanceof Error && error.message.includes(NOT_ANSWERED);

export const CLOUD_NO_ANSWER = 'The cloud did not answer. Changes stay on this device.';
const REQUEST_FAILED = new RegExp(`^(Cloud \\S+ failed: |asset upload failed: )?(\\w+: )?(${NOT_ANSWERED}|Failed to fetch|NetworkError when attempting to fetch resource\\.|Load failed)$`);

/** A failed cloud request, in words. A request nobody answered, or a connection that failed, comes
 *  back from the library as the name of a browser error, and an operator reads this on air. Whole
 *  messages only: a line that lists several records keeps each one's own reason. */
export function cloudFailureWords(message: string): string {
  return REQUEST_FAILED.test(message) ? CLOUD_NO_ANSWER : message;
}

function bodyBytes(body: BodyInit | null | undefined): number {
  if (typeof body === 'string') return body.length;
  if (body instanceof Blob) return body.size;
  if (body instanceof FormData) return [...body.values()].reduce((sum, part) => sum + (typeof part === 'string' ? part.length : part.size), 0);
  return 0;
}

/**
 * THE BUILD MARK (live-publishing W2, designs/G1.md section 4): this build treats a production's own
 * copy of each graphic as the only truth, and says so on every REST API request. Older bundles send
 * nothing, and once the `production_copies` switch is on the database refuses their production
 * authoring with "Reload this page to edit" (migration 0115). Auth, Storage and Realtime are sent as
 * before. A header, because an older bundle cannot echo it back from stored data.
 */
export const COPIES_MARK_HEADER = 'x-noacg-production-copies';
function withCopiesMark(request: Request | null, init: RequestInit | undefined): RequestInit {
  const headers = new Headers(init?.headers ?? request?.headers);
  headers.set(COPIES_MARK_HEADER, '1');
  return { ...init, headers };
}

/**
 * Every REST, auth and Storage request of the shared client, with that limit on the wait for the
 * answer and on each silence inside it, so a large download still takes as long as it takes while
 * it moves. It fails as an abort because the library retries any other failure of a read. Edge
 * functions keep their own time.
 */
function answeredFetch(input: RequestInfo | URL, givenInit?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const { pathname } = new URL(request ? request.url : input.toString());
  if (!/^\/(rest|auth|storage)\/v1\//.test(pathname)) return fetch(input, givenInit);
  const init = pathname.startsWith('/rest/v1/') ? withCopiesMark(request, givenInit) : givenInit;
  const limit = new AbortController();
  const asked = init?.signal ?? request?.signal;
  if (asked?.aborted) limit.abort(asked.reason);
  else asked?.addEventListener('abort', () => limit.abort(asked.reason), { once: true });
  const giveUp = () => limit.abort(new DOMException(NOT_ANSWERED, 'AbortError'));
  let timer = setTimeout(giveUp, NO_ANSWER_MS + bodyBytes(init?.body) / SEND_BYTES_PER_MS);
  const waitAgain = () => {
    clearTimeout(timer);
    timer = setTimeout(giveUp, NO_ANSWER_MS);
  };
  return fetch(input, { ...init, signal: limit.signal }).then((response) => {
    clearTimeout(timer);
    // A Response refuses a body on these statuses, whatever the browser handed over. An engine
    // without the stream classes (a CasparCG server's old browser reads through this too) keeps the
    // limit on the first byte, which beats a dead layer on air.
    if (!response.body || [101, 204, 205, 304].includes(response.status) || typeof TransformStream !== 'function') return response;
    waitAgain();
    const watched = response.body.pipeThrough(new TransformStream({
      transform(chunk, reader) {
        waitAgain();
        reader.enqueue(chunk);
      },
      flush: () => clearTimeout(timer),
    }));
    return new Response(watched, response);
  }, (error) => {
    clearTimeout(timer);
    throw error;
  });
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
