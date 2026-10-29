# C1c receipt: a custom fixed-slot graphic connects whole from its data template

Gates C1c (row 8): data-sources AC-13 real-Sheet half, its custom scalar part ("download a
custom graphic's scalar CSV, import it into Sheets, edit values and connect the whole graphic in
one confirmation").

Made by the C1c builder of the production-page plan run on 2026-10-21, 15:18:55 to 15:19:19 UTC,
from a Claude cloud session: the app's offline dev server with an unpublished production;
Playwright Chromium reading Google through the session's egress proxy; branch
`claude/plan-production-page-p8-build` at `771c672`. The Sheet is the fifth of the owner's six
test Sheets (`NOACG_TEST_SHEET_IDS`); its ID is not recorded. A first run at `87e7eff` found the
wording fault fixed in `771c672` (below); everything else was the same.

## The fixture

A custom native graphic, "Kevätturnaus": the blank template with nine text fields, one per
bracket slot, labelled in Finnish so no catalogue name or title match could help: `f0 Turnaus`,
`f1 QF1 · koti`, `f2 QF1 · vieras`, `f3 QF2 · koti`, `f4 QF2 · vieras`, `f5 SF1 · koti`,
`f6 SF1 · vieras`, `f7 Finaali`, `f8 Huomautus`.

## Method and results

| Step | What happened | Result |
| --- | --- | --- |
| Download | The cue editor's "Data template" | `kev-tturnaus-data-template.csv`: `Field ID,Label,Value` and one row per slot with its current value. |
| Import and edit | Written into a new tab as text (`RAW`, the API's equivalent of importing with "Convert text to numbers, dates and formulas" off). In the Sheet: the rows reversed; two labels rewritten (`Puolivälierä 1: kotijoukkue`, `Puolivälierä 1: vierasjoukkue`); five values set to `Ässät 🏒`, `007`, `=1+1`, `Smith, "The Rock"`, `Lukko – Pelicans`. | |
| Review | Connect data… with the tab's share link. | Every slot `key` (matched by Field ID); `9 connected · 0 need attention · Used by 1 cue`. No slot mapped by hand. |
| Cancel | Cancel. | Stored bindings `{}`, no source: nothing written. |
| Connect | One confirmation. | All nine slots bound to `sheet.<source>.values.f0` … `f8` in one write. |
| On air | Take. | PROGRAM showed exactly the Sheet's text in every slot: `Ässät 🏒`, `007` (not 7), `=1+1` (not 2), `Smith, "The Rock"`, `Lukko – Pelicans`, and the unedited slots' values. Reordered rows and edited labels changed nothing. |
| One cell | `f6` set to `Ilves` through the API. | On PROGRAM in 5,015 ms; the changed slots were `["f6"]` only. |
| Duplicated key | A second `f3` row added. | Sources line: `f3 is on rows 7 and 11, so it keeps its value.`; f3 kept `007`. |
| Missing key | The `f8` row removed. | Sources line: `f8 is missing from the tab, so it keeps its value.`; f8 kept its value. |

The first run (at `87e7eff`) reported the duplicated key twice, the second time as `f3 is missing
from the tab`. The reader dropped both copies and then counted the key as missing. `771c672`
reports it once, as above, with a Node case in `scripts/sheet-source.test.mjs`.

## Judgement

AC-13's custom scalar part holds on a real Sheet: a custom graphic's own data template, imported
as text and edited with unfamiliar labels, reordered rows and renamed labels, connects every slot
in one confirmation, keeps text exactly (leading zeros, a formula-like value, quotes and commas,
Unicode and an emoji), changes only the slot whose cell changed, and diagnoses duplicated and
missing keys while holding the slots. Ambiguous name matches, incompatible replacements and the
review of existing bindings are covered by the Node mapping contracts and the C1b journey.
