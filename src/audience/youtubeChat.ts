// YOUTUBE LIVE CHAT, polled through the Data API with the OPERATOR'S OWN key (audience spec,
// "YouTube, and Twitch"; data-sources C3).
//
// YouTube has no anonymous chat read: every route to liveChatMessages goes through the Data
// API, and the Data API needs a key. A key alone reads a public stream's chat and a public
// video's comments, and nothing private (docs/work-specs/data-sources/evidence/youtube.md: both
// answered 200 with no sign-in; an owner-only request answered 401 `authorizationRequired`). The
// key stays in this browser: in memory for the session, in browser storage only when the operator
// ticks "Remember on this browser", sent only to googleapis.com, never synced or published.
//
// THE QUOTA, stated because the operator is spending their own: a project gets 10,000 units a
// day, reset at midnight Pacific time; a chat page costs 5 units and a list call 1. The reader
// asks no sooner than every 5 seconds, whatever the API suggests (it suggested about 3 s in the
// record), so live chat costs 12 calls a minute, 3,600 units an hour, and the day lasts about
// 2 h 46 min. The API cannot say how much of the day is left, so the line counts this browser's
// own spend since the reset and says that other users of the key are not counted.
//
// The driver resolves the video's activeLiveChatId once, then polls. The FIRST page is the chat's
// recent history (68 messages over 7.6 minutes in the record): it is delivered, marked "earlier",
// so the operator can pick a line said just before connecting without it reading as new.

import type { ChatDriver, ChatDriverHandlers } from './chatIntake';

export const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
/** The poll floor. The API suggests about 3 s; every extra poll is the operator's quota. */
export const MIN_POLL_MS = 5_000;
/** A project's default daily quota, in units. */
export const YOUTUBE_DAILY_UNITS = 10_000;
/** What one call costs: a `liveChat/messages` page, and any list call (`videos`, `commentThreads`). */
export const CHAT_PAGE_UNITS = 5;
export const LIST_CALL_UNITS = 1;

/** The operator may paste a video id or any of the watch-page URL shapes. */
export function normalizeYouTubeVideoId(input: string): string | null {
  const raw = input.trim();
  const fromUrl =
    raw.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
    raw.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ??
    raw.match(/\/(?:live|shorts|embed)\/([A-Za-z0-9_-]{11})/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{11}$/.test(raw) ? raw : null;
}

/** What a refused or failed call means, and the operator's next action. */
export interface YouTubeProblem {
  error: string;
  fix: string;
}

/** One readable problem per API refusal - the raw reasons are developer words. */
export function youtubeRefusal(status: number, body: unknown): YouTubeProblem {
  const parsed = body as { error?: { errors?: Array<{ reason?: string }> } } | null;
  const reason = parsed?.error?.errors?.[0]?.reason ?? '';
  if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded' || reason === 'dailyLimitExceeded') {
    return { error: 'The key has spent its quota for today', fix: 'It resets at midnight Pacific time. Use another key, or try again then.' };
  }
  if (reason === 'keyInvalid' || reason === 'keyExpired' || (status === 400 && /key/i.test(JSON.stringify(body ?? '')))) {
    return { error: 'That API key was not accepted', fix: 'Copy the key again from Google Cloud: APIs & Services, Credentials.' };
  }
  if (reason === 'commentsDisabled') {
    return { error: 'Comments are turned off for that video', fix: 'Pick another video, or Live chat for a stream.' };
  }
  if (reason === 'videoNotFound' || status === 404) {
    return { error: 'No such video', fix: 'Check the link: the video may be private or removed.' };
  }
  if (reason === 'liveChatEnded' || reason === 'liveChatDisabled' || reason === 'liveChatNotFound') {
    return { error: 'The live chat has ended', fix: 'Connect the stream again when it is live, or read its comments.' };
  }
  if (status === 401 || reason === 'authorizationRequired' || reason === 'forbidden') {
    return { error: 'That needs a sign-in YouTube does not give a key', fix: 'Use a public video or stream.' };
  }
  if (reason === 'accessNotConfigured' || status === 403) {
    return { error: 'The key cannot use the YouTube Data API', fix: 'Enable "YouTube Data API v3" for the key\'s project in Google Cloud.' };
  }
  return { error: `YouTube answered ${status}`, fix: 'Try again in a moment.' };
}

export const UNREACHABLE: YouTubeProblem = { error: 'Could not reach YouTube', fix: 'Check the connection. It tries again by itself.' };

/** The doors a driver uses, so a Node test can run it on recorded answers and a fake clock. */
export interface YouTubeIo {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
}

const browserIo = (): YouTubeIo => ({
  fetch: (url) => fetch(url),
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
});

interface MessagesPage {
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  offlineAt?: string;
  items?: Array<{
    id?: string;
    snippet?: { type?: string; displayMessage?: string; publishedAt?: string };
    authorDetails?: { channelId?: string; displayName?: string };
  }>;
}

export function youtubeChatDriver(videoInput: string, apiKey: string, handlers: ChatDriverHandlers, io: YouTubeIo = browserIo()): ChatDriver {
  const videoId = normalizeYouTubeVideoId(videoInput);
  const key = apiKey.trim();
  let stopped = false;
  let paused = false;
  let timer: unknown = null;
  let pageToken: string | null = null;
  /** True until the first messages page has been read: that page is history, marked earlier. */
  let firstPage = true;
  let chatId: string | null = null;

  if (!videoId || !key) {
    io.setTimer(() => handlers.onStatus('error', !videoId ? 'Not a YouTube video id or URL.' : 'An API key is needed: YouTube has no anonymous chat read.'), 0);
    return { stop: () => undefined };
  }

  const schedule = (ms: number) => {
    if (stopped || paused) return;
    if (timer !== null) io.clearTimer(timer);
    timer = io.setTimer(step, ms);
  };

  // A refusal ends the polling: retrying a dead key or an ended chat would only spend more of the
  // quota. The operator resumes by pausing and resuming, or reconnecting.
  const fail = (problem: YouTubeProblem) => handlers.onStatus('error', `${problem.error}. ${problem.fix}`);

  async function step() {
    if (stopped || paused) return;
    try {
      if (!chatId) {
        const answer = await io.fetch(`${YOUTUBE_API}/videos?part=liveStreamingDetails&id=${videoId}&key=${encodeURIComponent(key)}`);
        handlers.onSpend?.(LIST_CALL_UNITS);
        const body = (await answer.json().catch(() => ({}))) as { items?: Array<{ liveStreamingDetails?: { activeLiveChatId?: string } }> };
        if (stopped) return;
        if (!answer.ok) return fail(youtubeRefusal(answer.status, body));
        chatId = body.items?.[0]?.liveStreamingDetails?.activeLiveChatId ?? null;
        if (!chatId) {
          return fail(
            body.items?.length
              ? { error: 'That video has no open live chat', fix: 'Connect it while the stream is live, or read its comments instead.' }
              : youtubeRefusal(404, null),
          );
        }
      }
      const params = new URLSearchParams({ liveChatId: chatId, part: 'snippet,authorDetails', key });
      if (pageToken) params.set('pageToken', pageToken);
      const answer = await io.fetch(`${YOUTUBE_API}/liveChat/messages?${params}`);
      handlers.onSpend?.(CHAT_PAGE_UNITS);
      const page = (await answer.json().catch(() => ({}))) as MessagesPage;
      if (stopped) return;
      if (!answer.ok) return fail(youtubeRefusal(answer.status, page));

      pageToken = page.nextPageToken ?? pageToken;
      if (page.offlineAt) return fail(youtubeRefusal(403, { error: { errors: [{ reason: 'liveChatEnded' }] } }));
      const earlier = firstPage;
      firstPage = false;
      for (const item of page.items ?? []) {
        if (item.snippet?.type !== 'textMessageEvent') continue; // superchats etc. are later material
        const text = item.snippet.displayMessage ?? '';
        const authorId = item.authorDetails?.channelId ?? '';
        if (!text || !authorId) continue;
        handlers.onMessage({
          id: item.id ?? null,
          authorId,
          authorName: item.authorDetails?.displayName ?? 'Viewer',
          text,
          ...(earlier ? { earlier: true } : {}),
        });
      }
      handlers.onStatus('live');
      schedule(Math.max(page.pollingIntervalMillis ?? MIN_POLL_MS, MIN_POLL_MS));
    } catch {
      // A network hiccup is transient: say so and try again at twice the floor.
      if (!stopped && !paused) {
        handlers.onStatus('error', `${UNREACHABLE.error}. ${UNREACHABLE.fix}`);
        schedule(MIN_POLL_MS * 2);
      }
    }
  }

  handlers.onStatus('connecting');
  void step();

  return {
    stop() {
      stopped = true;
      if (timer !== null) io.clearTimer(timer);
      timer = null;
    },
    // Pausing STOPS THE POLLING, because every poll is the operator's quota - unlike the
    // Twitch socket, which idles for free. Resuming polls at once; the page token survives,
    // so messages sent while paused arrive on resume.
    setPaused(next: boolean) {
      paused = next;
      if (next) {
        if (timer !== null) io.clearTimer(timer);
        timer = null;
      } else if (!stopped) {
        handlers.onStatus('connecting');
        void step();
      }
    },
  };
}

// ── The key and the day's spend, in this browser ─────────────────────────────────────────────

/** Where a remembered key is kept. Absent unless the operator ticked "Remember on this browser". */
export const YOUTUBE_KEY_STORE = 'spx-gfx-youtube-key';
/** This browser's spend against the key today: `{ v: 1, day, units }`. */
export const YOUTUBE_SPEND_STORE = 'spx-gfx-youtube-spend';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The quota's day: the date in Pacific time, when YouTube resets it. */
export function pacificDay(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Units this browser spent since the last reset; 0 on any unreadable or older day's record. */
export function spentToday(store: KeyValueStore | null | undefined, now: number): number {
  try {
    const raw = JSON.parse(store?.getItem(YOUTUBE_SPEND_STORE) ?? 'null') as { v?: unknown; day?: unknown; units?: unknown } | null;
    if (!raw || raw.v !== 1 || raw.day !== pacificDay(now) || typeof raw.units !== 'number' || raw.units < 0) return 0;
    return raw.units;
  } catch {
    return 0;
  }
}

/** Count units spent now. A browser that refuses the write loses only the estimate. */
export function recordSpend(store: KeyValueStore | null | undefined, units: number, now: number): void {
  try {
    store?.setItem(YOUTUBE_SPEND_STORE, JSON.stringify({ v: 1, day: pacificDay(now), units: spentToday(store, now) + units }));
  } catch {
    /* the estimate is a courtesy */
  }
}

/** The remembered key, or null. */
export function rememberedKey(store: KeyValueStore | null | undefined): string | null {
  try {
    const raw = JSON.parse(store?.getItem(YOUTUBE_KEY_STORE) ?? 'null') as { v?: unknown; key?: unknown } | null;
    return raw && raw.v === 1 && typeof raw.key === 'string' && raw.key.trim() ? raw.key.trim() : null;
  } catch {
    return null;
  }
}

/** Remember the key on this browser, or forget it (null). */
export function rememberKey(store: KeyValueStore | null | undefined, key: string | null): void {
  try {
    if (key && key.trim()) store?.setItem(YOUTUBE_KEY_STORE, JSON.stringify({ v: 1, key: key.trim() }));
    else store?.removeItem(YOUTUBE_KEY_STORE);
  } catch {
    /* not remembered: it is asked for again after a reload */
  }
}

/** Minutes of live chat the rest of today's quota buys at the 5-second floor, rounded down. */
export function chatMinutesLeft(spent: number): number {
  const perMinute = (60_000 / MIN_POLL_MS) * CHAT_PAGE_UNITS;
  return Math.max(0, Math.floor((YOUTUBE_DAILY_UNITS - spent) / perMinute));
}

const hoursAndMinutes = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;

/** The quota line under each mode, in one sentence. `spent` is today's spend while chat runs. */
export function quotaLine(mode: 'comments' | 'chat', spent: number | null = null): string {
  if (mode === 'comments') {
    return `Each fetch of the newest 100 comments costs ${LIST_CALL_UNITS} unit of your key's ${YOUTUBE_DAILY_UNITS.toLocaleString('en-US')} a day.`;
  }
  const hourly = (3_600_000 / MIN_POLL_MS) * CHAT_PAGE_UNITS;
  if (spent === null) {
    return `Live chat costs about ${hourly.toLocaleString('en-US')} units an hour, so your key's ${YOUTUBE_DAILY_UNITS.toLocaleString('en-US')} a day last about ${hoursAndMinutes(chatMinutesLeft(0))}.`;
  }
  return `About ${hoursAndMinutes(chatMinutesLeft(spent))} of chat left today, counting this browser's use since midnight Pacific time; other users of the key are not counted.`;
}
