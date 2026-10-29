// YOUTUBE COMMENTS ON A VIDEO (audience spec, "YouTube, and Twitch"; data-sources C3): one call,
// the newest 100, on the operator's press. No polling: a refresh is another press, and each costs
// one unit of the operator's own key.
//
// What the call asks for is what the record found it needs (docs/work-specs/data-sources/evidence
// /youtube.md): `order=time` for the newest, `textFormat=plainText` because the default HTML put
// markup or entities in 6 of 100 comments, and `maxResults=100`. With `order=time` the first item
// can be an old pinned comment (one from 2020 headed a page of that day's), so the candidates are
// sorted by their own `publishedAt`. Each candidate carries the thread's id as its identity
// (`yt:<id>`), so a refresh adds only what is new; the platform word is provenance, never the name.

import type { CandidateInput } from './audienceTypes.ts';
import { LIST_CALL_UNITS, UNREACHABLE, YOUTUBE_API, youtubeRefusal, type YouTubeIo, type YouTubeProblem } from './youtubeChat.ts';

/** The provenance label a comment carries. */
export const COMMENTS_SOURCE = 'YouTube comments';

interface ThreadsPage {
  items?: Array<{
    id?: string;
    snippet?: {
      topLevelComment?: {
        id?: string;
        snippet?: { textOriginal?: string; textDisplay?: string; authorDisplayName?: string; publishedAt?: string };
      };
    };
  }>;
}

export type CommentsRead =
  | { ok: true; items: (CandidateInput & { externalId: string })[]; units: number }
  | ({ ok: false; units: number } & YouTubeProblem);

/** The address of one fetch: the newest 100 top-level comments, as plain text. */
export function commentsUrl(videoId: string, key: string): string {
  const params = new URLSearchParams({
    part: 'snippet',
    videoId,
    maxResults: '100',
    order: 'time',
    textFormat: 'plainText',
    key,
  });
  return `${YOUTUBE_API}/commentThreads?${params}`;
}

/** One page of comment threads as candidates, newest first. */
export function readCommentThreads(page: ThreadsPage): (CandidateInput & { externalId: string })[] {
  const rows: { at: string; item: CandidateInput & { externalId: string } }[] = [];
  for (const thread of page.items ?? []) {
    const top = thread.snippet?.topLevelComment;
    const s = top?.snippet;
    const body = (s?.textOriginal ?? s?.textDisplay ?? '').trim();
    const id = thread.id ?? top?.id;
    if (!body || !id) continue;
    rows.push({
      at: s?.publishedAt ?? '',
      item: { author: (s?.authorDisplayName ?? '').replace(/^@/, ''), body, externalId: `yt:${id}`, source: COMMENTS_SOURCE },
    });
  }
  // ISO times compare as text; a stable sort keeps the API's order among equal times.
  return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).map((r) => r.item);
}

/** Fetch the newest 100 comments of a video with the operator's key. Never throws. */
export async function fetchComments(fetcher: YouTubeIo['fetch'], videoId: string, key: string): Promise<CommentsRead> {
  if (!key.trim()) return { ok: false, units: 0, error: 'An API key is needed', fix: 'Paste your YouTube Data API key.' };
  let answer: Awaited<ReturnType<YouTubeIo['fetch']>>;
  try {
    answer = await fetcher(commentsUrl(videoId, key.trim()));
  } catch {
    return { ok: false, units: 0, ...UNREACHABLE };
  }
  const body = (await answer.json().catch(() => ({}))) as ThreadsPage;
  if (!answer.ok) return { ok: false, units: LIST_CALL_UNITS, ...youtubeRefusal(answer.status, body) };
  return { ok: true, units: LIST_CALL_UNITS, items: readCommentThreads(body) };
}
