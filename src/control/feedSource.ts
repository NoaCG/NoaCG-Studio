// A NEWS FEED AS A SOURCE (docs/work-specs/data-sources/spec.md, phase C4; AC-5, AC-11): an RSS
// 2.0 or Atom address whose newest headlines fill a ticker's lines.
//
// Browsers cannot read most feeds directly (no CORS), and the server must not fetch whatever an
// address names, so every read goes through NoaCG's guarded route `/api/data/feed`
// (api/_lib/feedFetch.ts): it checks the address, reads it at most once every 5 minutes for every
// reader, and answers the headlines as plain text. The browser reader asks it every 5 minutes
// while a page is open, renewing its claim every 30 s in between; the server tick reads through the
// same cache otherwise. Before anyone
// signs in this works too: the route is public.
//
// A feed's headlines are a Sheet tab of one column to the rest of the reader: one row per
// headline, through the `lines` adapter, under the source's own prefix `feed.<id>.lines`. So the
// Sheet reader's lease, diff, states and Pause (./sheetSource.ts) are the feed's too: a failed read
// writes nothing and the list holds, says since when, and three missed reads mark it stale; a
// feed with no items writes "" and clears the ticker; an answer arriving after Disconnect, Pause or
// a handover writes nothing (AC-11).
//
// Pure and Node-importable: scripts/feed-source.test.mjs drives it with a fake fetch and clock.

import { createSheetReader, leaseOf, type SheetFetch, type SheetRead, type SheetReader, type SheetReaderOptions } from './sheetSource.js';

/** What a failure that passes by itself says to do. */
export const RETRY_FIX = 'Reading carries on by itself.';

/** How often an open page asks for a feed's headlines (spec DS4, DS15). */
export const FEED_READ_MS = 5 * 60_000;
/** How often an open page renews its claim between reads, inside the published row's one-minute
 *  lease, so neither another tab nor the tick takes the feed while the page is open. */
export const FEED_RENEW_MS = 30_000;
/** How long the page waits for the route: its own 10-second read, or another instance's first
 *  read it waits out, plus the database. */
export const FEED_ROUTE_TIMEOUT_MS = 25_000;
/** A feed reader's cadence, as the Sheet reader takes it, and the lease that follows from it. */
export const FEED_CADENCE = { everyMs: FEED_READ_MS, renewMs: FEED_RENEW_MS, timeoutMs: FEED_ROUTE_TIMEOUT_MS } as const;
export const FEED_LEASE_MS = leaseOf(FEED_CADENCE);
/** The longest address accepted. */
export const FEED_ADDRESS_CHARS = 2048;

/** The route that reads a feed for the page. */
export const feedRouteUrl = (address: string): string => `/api/data/feed?url=${encodeURIComponent(address)}`;

/**
 * A feed address as the reader keeps and fetches it, or why it is refused: http or https on its
 * own port, no credentials. The page checks it before asking; the route checks it again, and
 * every redirect (api/_lib/feedFetch.ts).
 */
export function normalizeFeedAddress(text: string): { url: string } | { error: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > FEED_ADDRESS_CHARS) return { error: 'That is not a feed address.' };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: 'That is not a feed address.' };
  }
  const why = addressRefusal(url);
  if (why) return { error: why };
  url.hash = '';
  return { url: url.href };
}

/** Why this address is never fetched, or null. */
export function addressRefusal(url: URL): string | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Only http and https feed addresses can be read.';
  if (url.username !== '' || url.password !== '') return 'A feed address cannot carry a user name or password.';
  // The URL parser drops a port that is the scheme's own, so any port left is another service.
  if (url.port !== '') return 'A feed is read on its ordinary port only.';
  return null;
}

/** What the route answers (api/_lib/feedFetch.ts `FeedAnswer`). */
export interface FeedRouteAnswer {
  ok: boolean;
  items?: string[];
  fetchedAt?: string | null;
  error?: string;
  fix?: string;
  failingSince?: string | null;
}

/**
 * A route answer as a read: one row per headline, or the failure with its fix. A failure is a
 * failure even with older headlines beside it, so the reader holds what it last wrote.
 */
export function feedRead(answer: FeedRouteAnswer): SheetRead {
  if (answer.ok && Array.isArray(answer.items)) return { ok: true, rows: answer.items.filter((t) => typeof t === 'string').map((t) => [t]) };
  return { ok: false, error: answer.error ?? 'the feed could not be read', fix: answer.fix ?? RETRY_FIX };
}

/** Ask the route for a feed once. */
export async function readFeedRoute(fetcher: SheetFetch, address: string, signal: AbortSignal): Promise<SheetRead> {
  let text: string;
  let status: number;
  try {
    const response = await fetcher(feedRouteUrl(address), { signal });
    status = response.status;
    text = await response.text();
  } catch {
    if (signal.aborted) return { ok: false, error: 'the feed did not answer in time', fix: RETRY_FIX };
    return { ok: false, error: 'can’t reach NoaCG to read the feed (offline?)', fix: 'Check this computer is online.' };
  }
  let answer: Omit<FeedRouteAnswer, 'error'> & { error?: unknown };
  try {
    answer = JSON.parse(text);
  } catch {
    return { ok: false, error: `the feed reader answered ${status}`, fix: RETRY_FIX };
  }
  // The route's own refusals (rate limit) carry the API's error object rather than words.
  if (status === 429) return { ok: false, error: 'too many feed reads from this computer', fix: RETRY_FIX };
  if (answer.error !== undefined && typeof answer.error !== 'string') return { ok: false, error: `the feed reader answered ${status}`, fix: RETRY_FIX };
  return feedRead(answer as FeedRouteAnswer);
}

/** The browser reader of one feed: the Sheet reader's machinery with the feed's read and cadence. */
export function createFeedReader(o: Omit<SheetReaderOptions, 'link' | 'read' | 'everyMs' | 'renewMs' | 'timeoutMs' | 'shape'> & { url: string }): SheetReader {
  return createSheetReader({
    ...o,
    ...FEED_CADENCE,
    shape: 'lines',
    read: (signal) => readFeedRoute(o.io.fetch, o.url, signal),
  });
}
