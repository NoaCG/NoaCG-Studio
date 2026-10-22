# C4 receipt: one real public feed through the feed route

Made by the C4 builder of the production-page plan run, 2026-10-22, 05:39 UTC, from a Claude cloud
session. Spec: `../spec.md`, phase C4 ("one real feed receipt") and AC-5/AC-6.

## Method

The data function as Vercel emits it (`scripts/api-runtime-build.mjs` over
`api/data/[...path].ts`), called in process at `GET /api/data/feed?url=<address>`, with its
service-role client on a local Supabase stack (CLI 2.111.0, every migration through 0099 applied
from an empty database) and the real network. The reader's network door was wrapped only to
record what it resolved, where it connected and what the publisher answered; the guard, the cache
and the parser ran unchanged. No credential was sent to the feed. The cache row was deleted
before and after.

Three reads of the feed Q measured first (`feeds.md`, Yle):

1. a first read, which fetches;
2. a second read at once, which the row answers;
3. a third read after the row's `next_allowed_at` was set into the past by hand (standing in for
   the 5-minute wait), which sends the row's validator back.

## Result

| Read | Route answer | Upstream |
| --- | --- | --- |
| 1 | 200, 11 headlines, 349 ms | resolved `yle.fi` to four public addresses, connected to the first one checked; 200, weak ETag `W/"1e20-…"`, no Last-Modified, `Cache-Control: public, max-age=30` |
| 2 | 200, 11 headlines, 5 ms | none (served from `feed_cache`) |
| 3 | 200, the same 11 headlines, 53 ms | resolved again, connected to the checked address; conditional (`If-None-Match` with the weak ETag); **304** |

The row after read 1: the ETag kept, `fetched_at` set, `next_allowed_at` 5 minutes later (the
feed's `max-age=30` and `<ttl>5</ttl>` both ask for no more than the floor), `claimed_until` back
at the epoch. After the 304, `fetched_at` moved to the conditional read and `next_allowed_at`
5 minutes after it, with the headlines unchanged.

The headlines arrived as plain text with their Finnish characters (ä, ö) intact through gzip;
their wording is Yle's and is not copied here (the spec's "Feed rights" risk).

## Judgement

The route reads a real RSS 2.0 feed through the guard, keeps one shared row, serves it without
refetching, and makes the next read a conditional request that a 304 answers without changing
the headlines. That is the receipt AC-5 and AC-6 ask for. The Q record's other hosts were not
re-read; the configured walk (`e2e/configured/feed-route.spec.ts`) proves the shared claim with two
readers at once on the same stack.
