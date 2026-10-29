# C1c receipt: 20 timed Sheet edits reach the local program

Gates C1c (row 8): sheet-data-flow AC-3, local program. C2 repeats it against the published
output.

Made by the C1c builder of the production-page plan run on 2026-10-21, 15:14:11 to 15:16:45 UTC,
from a Claude cloud session: the app's offline dev server with an unpublished production, so the
graphic airs on the local program; Playwright Chromium reading Google through the session's
egress proxy; branch `claude/plan-production-page-p8-build` at `87e7eff`. The Sheet is the fourth
of the owner's six test Sheets (`NOACG_TEST_SHEET_IDS`); its ID is not recorded.

## Method

1. A new tab, `NoaCG C1c timed`, held `Name,Value` rows (Name, Role), written through the Sheets
   API as the owner's service account.
2. In the app, the lower third "Hairline" was connected to that tab's share link with Connect
   data… (Name to F0, Role picked for F1, one confirmation), and taken to air.
3. Twenty times: write a unique marker into the Name value cell (`values.update`, RAW, the agent's
   own edit), and from the moment the write was sent read PROGRAM's F0 every 50 ms until it showed
   the marker. Then wait 1.5 to 6.5 s, chosen at random, so the edits fall at different points of
   the reader's 5-second interval.
4. Before and after the run: the PROGRAM stage's entrance count (`data-plays`), the on-air line
   and the number of cues.

"Visible" is send-to-PROGRAM: the API write, the export catching up, the wait for the browser
reader's next read, the read itself, and the write into the local tree and the graphic.

## Raw figures

| Edit | Write acknowledged (ms) | Visible on PROGRAM (ms) |
| ---: | ---: | ---: |
| 1 | 174 | 4,778 |
| 2 | 197 | 654 |
| 3 | 176 | 810 |
| 4 | 192 | 4,407 |
| 5 | 158 | 2,525 |
| 6 | 195 | 3,120 |
| 7 | 174 | 4,487 |
| 8 | 148 | 5,250 |
| 9 | 191 | 570 |
| 10 | 186 | 1,361 |
| 11 | 156 | 4,836 |
| 12 | 163 | 3,111 |
| 13 | 171 | 4,000 |
| 14 | 158 | 1,805 |
| 15 | 143 | 4,501 |
| 16 | 179 | 2,347 |
| 17 | 263 | 4,143 |
| 18 | 150 | 2,649 |
| 19 | 145 | 3,275 |
| 20 | 157 | 4,339 |

Summary: visible in 570 to 5,250 ms, median 3,198 ms. **Slowest: 5,250 ms (edit 8).** 20 of 20
within 10 seconds. Entrances on PROGRAM: 1 before and 1 after (no new entrance); on-air line
`up, not live: ○ Hairline` before and after; 1 cue before and after. Nothing was taken, advanced
or removed.

## Judgement

Sheet AC-3 holds for the local program: an edit in a real Sheet reaches the graphic on air within
ten seconds with no Take, the slowest of 20 at 5.25 s. That matches the Q records: about one
second for the export (`sheet-latency.md`) plus at most one 5-second read interval.
