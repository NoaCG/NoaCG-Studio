# Q record: Sheet export endurance (gates C1b; sheet AC-3 measurement half)

Measured by the Q worker of the production-page plan run, 2026-10-20, 21:07:28 to 22:07:23 UTC,
from a Claude cloud session (Node 22.22.0 `fetch`, through the session's egress proxy),
repository revision `cc3500f2`. The Sheet is the first of the owner's six test Sheets
(`NOACG_TEST_SHEET_IDS`); its ID is not recorded.

## Method

One hour of reads at the browser reader's planned interval: every 5 s, on a fixed schedule, an
unauthenticated GET of `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=0`
(the same address the browser reader uses), following the redirect, with a 15-second timeout.
Each read logged its start time, final status, body size, wall time and the `Cache-Control` and
`Access-Control-Allow-Origin` headers. The tab held a 21-row table (433 bytes of CSV), unchanged
during the hour.

The same machine also read two other test Sheets during the hour (the 20 edits of
`sheet-latency.md`, polling every 500 ms from 21:20 to 21:24, and 30 reads at 21:21 to 21:22), so
the export saw more than one reader's load from this address for those minutes.

## Raw figures

- Reads: 720 of 720 made, every one exactly 5.00 s after the last (no schedule drift).
- Status: **720 answered 200**. No 429, no 403, no other refusal, no timeout, no network error.
- Body: 433 bytes every time. Headers on every read: `Cache-Control: no-cache, no-store,
  max-age=0, must-revalidate`, `Access-Control-Allow-Origin: *`.
- Wall time over the hour (ms): min 178, median 250, p90 340, p95 428, p99 623, **max 855**;
  mean 271, standard deviation 78. No read over 1 s.

By ten-minute block:

| Block (UTC) | Median ms | p95 ms | Max ms | Not 200 |
| --- | ---: | ---: | ---: | ---: |
| 21:07 | 269 | 386 | 600 | 0 |
| 21:17 | 247 | 389 | 601 | 0 |
| 21:27 | 251 | 404 | 763 | 0 |
| 21:37 | 240 | 490 | 855 | 0 |
| 21:47 | 241 | 438 | 692 | 0 |
| 21:57 | 254 | 428 | 623 | 0 |

## Judgement

Google did not refuse or slow a 5-second reader over an hour: no errors, and no drift in latency
from the first block to the last. C1b may fix the browser reader's interval at 5 seconds. A read
takes well under a second (p99 623 ms), so the reader's 10-second timeout leaves wide margin.

Limits: one reader of one small Sheet from one cloud address. Many operators reading many Sheets
from one office address, or very large tabs, were not tested; the reader's existing rule (a failed
read keeps the last good value) covers a refusal if one comes.
