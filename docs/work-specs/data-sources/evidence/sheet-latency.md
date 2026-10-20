# Q record: Sheet edit latency (gates C1b; sheet AC-3 measurement half, D3)

Measured by the Q worker of the production-page plan run, 2026-10-20, 21:20:41 to 21:24:12 UTC,
from a Claude cloud session (Node 22.22.0 `fetch`, through the session's egress proxy),
repository revision `cc3500f2`. The Sheet is the second of the owner's six test Sheets
(`NOACG_TEST_SHEET_IDS`); its ID is not recorded.

## Method

The Sheet's first tab (`gid=0`) held a 21-row table (header plus 20 rows). For each of 20 edits:

1. Write a new value into `A2:D2` through the Sheets API (`values.update`, `valueInputOption=RAW`,
   signed in as the owner's service account), with a unique marker in `D2`.
2. From the moment the write was sent, read the public export
   `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=0` (no sign-in, the same
   address the browser reader uses) every 500 ms until the CSV contains the marker, for at most
   120 s.
3. Wait 10 s before the next edit.

"Visible" is the time from sending the write to receiving the CSV that holds the marker.

## Raw figures

| Edit | Write acknowledged (ms) | Visible in export (ms) | Export reads needed |
| ---: | ---: | ---: | ---: |
| 1 | 614 | 1,011 | 1 |
| 2 | 271 | 544 | 1 |
| 3 | 253 | 539 | 1 |
| 4 | 236 | 560 | 1 |
| 5 | 224 | 479 | 1 |
| 6 | 216 | 494 | 1 |
| 7 | 277 | 537 | 1 |
| 8 | 219 | 541 | 1 |
| 9 | 258 | 535 | 1 |
| 10 | 260 | 603 | 1 |
| 11 | 253 | 532 | 1 |
| 12 | 297 | 580 | 1 |
| 13 | 325 | 596 | 1 |
| 14 | 217 | 499 | 1 |
| 15 | 199 | 713 | 1 |
| 16 | 206 | 441 | 1 |
| 17 | 211 | 482 | 1 |
| 18 | 250 | 562 | 1 |
| 19 | 300 | 580 | 1 |
| 20 | 227 | 527 | 1 |

Summary: write acknowledged in 199 to 614 ms (median 252); visible in 441 to 1,011 ms (median
540). **Slowest: 1,011 ms (edit 1).** All 20 writes answered 200; all 20 export reads answered 200
with no error. Every edit was already in the first export read made after the write returned, so
the export showed no lag of its own that this method could resolve: the figure is the write plus
one read.

## Judgement

The export meets D3. An edit is in the public CSV within about one second, so with the browser
reader's 5-second interval an edit reaches the graphic within about 5 s plus one read (about 6.1 s
at the slowest measured read), inside the ten-second promise. C1b may keep the ten-second wording
and does not need the "Publish to the web" fallback for freshness.

Limits: the edits came through the Sheets API, not a person typing in the Sheets editor, which
first has to save from the browser (not measured here); and the reads came from one cloud
machine. `sheet-endurance.md` records how the same export behaves under an hour of 5-second reads.
