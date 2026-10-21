# C2 receipt: a real Sheet follows the published output, with a page open and with every page closed

Gates C2 (row 9): sheet-data-flow AC-3 published half and AC-4. The local-program half of AC-3
is `sheet-timed-local.md` (C1c).

Made by the C2 builder of the production-page plan run on 2026-10-21, 18:00:35 to 18:11:00 UTC,
from a Claude cloud session: the configured local stack (Supabase CLI 2.111.0, every migration
through 0097), the app's dev server in configured mode, Playwright Chromium and Node reading Google
through the session's egress proxy; branch `claude/plan-production-page-p9-build` at `169b090`. The later simplify and review commits on the branch change no timing
rule; the configured scenario `production-data-key-tick.spec.ts` was re-run and passed on them.
The Sheet is the sixth of the owner's test Sheets (`NOACG_TEST_SHEET_IDS`); its ID is not recorded.
Each run used a new tab, written through the Sheets API as the owner's service account and deleted
afterwards. The tick's switch was on in the local database only, and the tick was called with the
stack's own test `CRON_SECRET`; no production setting was read or changed.

## Method

1. A new tab held `Name,Value` rows (`Name, Ann Lee`). In the app the lower third "Hairline" was
   connected to that tab's share link with Connect data… (Name to F0, one confirmation), the
   production was published and the cue taken to air, and an output page (`/output?production=`)
   was opened beside it: the published output, which only follows the command log.
2. **Page open** (sheet AC-3, published): twenty times, write a unique marker into the Name value
   cell (`values.update`, RAW) and, from the moment the write was sent, read the OUTPUT page's F0
   every 50 ms until it showed the marker; then wait 1.5 to 6.5 s, chosen at random. The reader is
   the operator page, under its lease on the row (`control_source_lease`), writing through the
   operator door (`control_source_commit`).
3. **Every page closed** (sheet AC-4): the switch on (`data_tick_until` an hour ahead), the
   operator page closed, the output page left open. Once a minute, on the minute as Vercel's cron
   calls it, the driver called `GET /api/data/tick` with the Bearer secret. Six edits (two runs of
   three, each its own production and tab), each after a random 0 to 10 s, each timed from the
   write until the output page showed it.
4. Before and after each run: the number of Take rows in the production's command log.

"Visible" is send-to-OUTPUT: the API write, the export catching up, the wait for the reader (the
page's next 5-second read, or the tick's next minute), the read, the write into the published row
and the output page receiving its update row.

## Page open: 20 edits

| Edit | Write acknowledged (ms) | Visible on the output (ms) |
| ---: | ---: | ---: |
| 1 | 289 | 5,207 |
| 2 | 289 | 3,081 |
| 3 | 478 | 4,481 |
| 4 | 271 | 3,651 |
| 5 | 416 | 5,256 |
| 6 | 263 | 1,252 |
| 7 | 170 | 2,337 |
| 8 | 259 | 4,378 |
| 9 | 248 | 2,016 |
| 10 | 250 | 2,694 |
| 11 | 269 | 5,058 |
| 12 | 312 | 1,955 |
| 13 | 260 | 5,082 |
| 14 | 308 | 1,881 |
| 15 | 240 | 1,782 |
| 16 | 344 | 3,366 |
| 17 | 260 | 3,434 |
| 18 | 289 | 2,301 |
| 19 | 541 | 3,836 |
| 20 | 286 | 5,604 |

Visible in 1,252 to 5,604 ms, median 3,400 ms. **Slowest: 5,604 ms (edit 20).** 20 of 20 within
10 seconds. Take rows: 1 before and 1 after; nothing was taken, advanced or removed.

## Every page closed: 6 edits under the tick

| Run | Edit sent (UTC) | Write acknowledged (ms) | Visible on the output (ms) |
| ---: | --- | ---: | ---: |
| 1 | 18:03:35.5 | 324 | 25,619 |
| 1 | 18:04:01.2 | 586 | 59,964 |
| 1 | 18:05:09.9 | 936 | 51,305 |
| 2 | 18:07:24.1 | 329 | 37,102 |
| 2 | 18:08:09.5 | 530 | 51,998 |
| 2 | 18:09:09.2 | 595 | 52,010 |

Visible in 25.6 to 60.0 s, median 51.7 s. **Slowest: 60.0 s**, an edit sent 1.2 s after a tick,
so it waited for the next one. Every edit was written by the next tick to start after it. Take rows:
1 before and 1 after in both runs. (That a value changed once is written once, and labelled
`sheet`, is the configured scenario's assertion, `production-data-key-tick.spec.ts`.)

The recorded runs (`control_data_ticks`), one a minute, six in all:

| Started (UTC) | Wall-clock (ms) | Sources and outcomes |
| --- | ---: | --- |
| 18:04:00.010 | 1,301 | this run's source read (1,043 ms); an earlier run's source failed (1,284 ms) |
| 18:05:00.024 | 1,120 | read (1,041); failed (1,088) |
| 18:06:00.018 | 1,146 | read (1,115); failed (1,113) |
| 18:08:00.028 | 1,184 | read (1,138); two failed (1,062, 1,145) |
| 18:09:00.025 | 1,431 | read (1,399); two failed (1,340, 1,358) |
| 18:10:00.021 | 1,191 | read (1,158); two failed (1,034, 1,112) |

The failed sources are the earlier runs' productions, still published on the local stack, whose
tabs had been deleted: each read said "can't find the tab", wrote nothing, and was tried again
the next minute, three at a time in parallel within about 1.4 s.

## Judgement

Sheet AC-3 holds for the published output: with an operator page open, an edit in a real Sheet
reaches the published output within ten seconds with no Take, the slowest of 20 at 5.6 s, the
same as the local program (`sheet-timed-local.md`, 5.25 s).

Sheet AC-4 holds while the switch is on: with every operator page closed, edits reach the
published output at the tick's cadence, 25.6 to 60.0 s, so about a minute at worst, which is what
the sources line and source details promise ("about once a minute by the server"). This is
continuity at a slower cadence, not the open-page ten-second figure. A tick run here took 1.1 to
1.4 s of wall time for one to three sources, inside the cost record's "6 sources, p95 reads" row
(3.57 s a tick; `tick-cost-estimate.md`). The production switch, the cron's first recorded call
and the hour's cost are the coordinator's follow-ups (data-sources C2), not this receipt.
