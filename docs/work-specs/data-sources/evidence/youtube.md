# Q record: YouTube with a key alone (gates C3; audience AC-9)

Measured by the Q worker of the production-page plan run, 2026-10-20, 21:06 to 21:20 UTC, from a
Claude cloud session (Node 22.22.0 `fetch`), repository revision `cc3500f2`, with the agents'
shared `YOUTUBE_API_KEY` and no OAuth sign-in. The key is not recorded. No comment or chat text
and no author name is recorded; only counts, shapes and times.

## Method

YouTube Data API v3 (`https://www.googleapis.com/youtube/v3`), the key sent as the `key` query
parameter, as `src/audience/youtubeChat.ts` does (the session's key check sent it as the
`x-goog-api-key` header; both were accepted).

- **Comments half.** Public video `jNQXAC9IVRw` ("Me at the zoo", 10,642,949 comments).
  `videos?part=snippet,statistics,liveStreamingDetails`, then `commentThreads?part=snippet&
  maxResults=100&order=time&textFormat=plainText` three pages deep by `pageToken`, one page in the
  default order and format, and two refusal probes.
- **Live half.** `videos?part=snippet,liveStreamingDetails` for five known 24/7 streams; the first
  with an `activeLiveChatId` was polled with `liveChat/messages?part=snippet,authorDetails` for 10
  minutes, waiting `max(5 s, pollingIntervalMillis)` between calls, following `nextPageToken`, as
  the existing reader does. Capped at 120 calls.
- **Units** are counted at the documented costs (1 a list call, 5 a `liveChat/messages` call). The
  API does not report spend or remaining quota.

## Raw figures

Comments (21:10:00 to 21:10:02 UTC):

| Call | Status | Items | `nextPageToken` | Notes |
| --- | --- | --- | --- | --- |
| `videos` | 200 | 1 | - | not live, `liveStreamingDetails` absent |
| `commentThreads` page 1, `order=time` | 200 | 100 | yes | item 1 dated 2020-02-17, items 2-100 newest first from 2026-10-20T17:30 |
| page 2 | 200 | 100 | yes | 17:30:22 down to 13:49:23 |
| page 3 | 200 | 100 | yes | 13:48:35 down to 09:40:38 |
| default order (relevance), default `textFormat=html` | 200 | 100 | yes | 6 of 100 `textDisplay` values hold HTML or entities |
| `maxResults=101` | 200 | - | - | not refused |
| unknown video id | 404 | - | - | reason `videoNotFound` |
| `channels?mine=true` (owner-only) | 401 | - | - | reason `authorizationRequired` |
| `commentThreads`, `maxResults=5`, `order=time` | 200 | 5 | yes | item 1 again dated 2020-02-17 |

Each page: `kind` `youtube#commentThreadListResponse`; `pageInfo.totalResults` equals the page
size (100), not the video's total; 100 distinct thread ids a page; replies are not inlined with
`part=snippet` (only `totalReplyCount`). Comment fields: `textDisplay`, `textOriginal`,
`authorDisplayName`, `authorProfileImageUrl`, `authorChannelUrl`, `authorChannelId`, `likeCount`,
`publishedAt`, `updatedAt` and others. Call times 85 to 485 ms.

Live chat (21:10:28 to 21:20:24 UTC):

- Candidates: of `jfKfPfyJRdk`, `4xDzrJKXOOY`, `21X5lGlDOfg`, `HM2XwAcHzJk`, `rUxyKA_-grg`, four
  returned and one was live with an open chat: `4xDzrJKXOOY` (Lofi Girl, "synthwave radio", 2,188
  concurrent viewers). The other Lofi Girl streams and NASA's were not live at that moment.
- 120 calls, all 200; median 95 ms, slowest 142 ms. No `offlineAt`, no error.
- First page: 68 messages, published 21:02:45 to 21:10:23, about 7.6 minutes of history, all
  `textMessageEvent`.
- Later pages: 0 to 3 messages each; 178 distinct message ids over the 10 minutes; no id appeared
  twice across pages.
- `pollingIntervalMillis`: 2,853 to 3,145 ms on every page, so the 5-second floor, not the
  server's hint, set the pace.
- `nextPageToken` present on every page.
- Message fields: `snippet.type`, `liveChatId`, `authorChannelId`, `publishedAt`,
  `hasDisplayContent`, `displayMessage`, `textMessageDetails`; `authorDetails.channelId`,
  `channelUrl`, `displayName`, `profileImageUrl`, `isVerified`, `isChatOwner`, `isChatSponsor`,
  `isChatModerator`.

Units spent: 1 (key check) + 7 (comments) + 3 (order check, owner-only probe, live lookup) + 600
(live chat) = **611**, under the 2,000 budget.

## Judgement

- **A key alone authorizes both public routes.** `commentThreads` on a public video and
  `liveChat/messages` on a public stream's chat both answered 200 with no OAuth. Owner-only
  requests answer 401 `authorizationRequired`, so a key cannot reach private data. C3 may promise
  both modes with the operator's own key.
- **Comments: the first page is the newest 100, except its first slot.** With `order=time` the
  first item can be an old pinned or held comment (here from 2020). C3 should sort by
  `publishedAt` or label that item, and should ask for `textFormat=plainText`, because the default
  HTML format put markup or entities in 6 of 100 comments. Pagination works by `nextPageToken` at
  1 unit a page; `pageInfo.totalResults` is not a total.
- **Live chat: the first page is history.** It held the last 7.6 minutes (68 messages), which
  confirms the spec's rule to deliver it marked "earlier". The server's polling hint was about 3
  seconds, below the 5-second floor, so at the floor the cost is 12 calls a minute at 5 units: 60
  units a minute, 3,600 an hour, matching the spec's figure; the 10,000-unit day lasts 2 hours 46
  minutes of chat if nothing else spends the key.
- Both halves are recorded; nothing retries later.
