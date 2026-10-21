# C1c receipt: a real Sheet tab connects from its share link

Gates C1c (row 8): data-sources AC-13 real-Sheet half; sheet-data-flow AC-1 real Sheet.

Made by the C1c builder of the production-page plan run on 2026-10-21, 15:13:11 to 15:13:51 UTC,
from a Claude cloud session: the app's offline dev server (unpublished production, so the local
program), Playwright Chromium reaching Google through the session's egress proxy, branch
`claude/plan-production-page-p8-build` at `87e7eff`. The Sheet is the third of the owner's six
test Sheets (`NOACG_TEST_SHEET_IDS`); its ID is not recorded. Tabs were made, edited, renamed and
deleted through the Sheets API as the owner's service account (`valueInputOption=RAW`). The app
read the tab only as a browser does: the public export of a Sheet shared "Anyone with the link".

## Method and results

The graphic is the catalog ticker "News Strip" (list adapter `lines`). Times are wall clock from
the action named to the moment Playwright read the expected text in the graphic, polled every
50 ms.

| Step | What happened | Result |
| --- | --- | --- |
| Starter rows | Connect data… then "Starter rows" downloaded `news-strip-rows.csv`: the four lines the ticker held, one per row, no header (the lines adapter has none). Imported into a new tab, `NoaCG C1c ticker`, which is not the first tab. | The review read the tab back as exactly those four lines. |
| AC-1 preview | The tab's ordinary share link with its `#gid=` pasted into Connect data…, Read pressed. The tab held five edited lines, the first tab held other content. | PREVIEW showed the fifth line **871 ms** after Read (gate: 10 s). The review listed the five lines of that tab and none of the first tab; no "first tab" question, since the link names the tab. No "Publish to web", sign-in, OAuth or code. |
| Review | Summary as shown. | `1 connected · 2 need attention · Used by 1 cue` (the label and the scroll speed take no list lines). |
| Connect, Take | One confirmation, named "Uutiset". Take. | PROGRAM showed the lines 460 ms after Take. Sources line: `Sheet: Uutiset · checked 0 s ago · changed 0 s ago`. |
| Edit | Row 3 edited through the API. | On PROGRAM in 5,088 ms, no Take. |
| Renamed tab | Tab renamed to `NoaCG C1c ticker (renamed)`, then row 2 edited. | On PROGRAM in 4,808 ms. The connection follows the tab's gid, so the rename changes nothing; the line stayed `checked`. |
| No tab in the link | The same Sheet's link without `#gid=` read in Connect data…. | `The link names no tab, so this is its first tab. Use it?`, and Connect stays disabled until that is ticked. Cancelled. |
| Deleted tab | The tab deleted through the API. | 3,984 ms later the line read `Sheet: Uutiset · can’t find the tab since 03:13 PM` with the fix `The tab or the Sheet was deleted, or the link is wrong. Connect the tab again.` After three missed reads it added `· stale` (`data-stale="true"`). The ticker on PROGRAM kept its last lines unchanged. Google answered the deleted gid with a refusal, never with another tab's content. |

## Judgement

Sheet AC-1 holds on a real Sheet: the share link previews the chosen tab on the graphic in under
one second. AC-13's real-Sheet half holds for a list: generated starter rows round-trip through a
real tab, a link with a tab previews that tab, a link without one shows the returned first tab and
asks, a renamed tab keeps its identity, and a missing tab holds the last good value and asks for
reconnection. Malformed and duplicated keyed rows are in `sheet-custom-slots.md`. One clause is not
re-proved here: one tab used by two graphics, or by a graphic and the inbox, has one reader. That
rests on C1b's Node lease tests and the "one Sheet score on two boards" journey; the reader does
not change with a real Sheet.

The receipts were made before the `/check` review fixes to the overview (who shows a value, value
names, problems on the overview). Those fixes are presentation on the Data view, covered by the
journeys; the reader, Connect and the Playout line the receipts exercised did not change after
them.
