---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "An e2e test is still titled \"the last screen before Create\" for a screen two steps earlier, and `docs/DEMO_2026-09-25.md` quotes that title as its evidence."
serves: NOW
size: small
touches: e2e/import-svg.spec.ts, docs/DEMO_2026-09-25.md
needs-owner: none
---

# A spec title the demo script quotes names a screen that moved

**Filed:** 2026-09-09. **Source:** the deck-repair row, item 2 of "For whoever comes next" in
`git show a2ab4097:docs/handoffs/2026-09-09-aa-deck-repair.md`. Re-derived here: both sites still
read as reported.

`e2e/import-svg.spec.ts:886` is titled *"svg import: the last screen before Create names a typeface
that will not travel"*. It asserts against `.wz-finish-summary`, so its subject is the **Finish**
step; "the last screen before Create" is wording from a wizard that no longer exists. The SVG road
is Start, Design, Fields, Animation, Finish (`STEP_TITLES_SVG`, `src/components/wizard/
CreationWizard.tsx:125`), and `Create project` is a door on Finish rather than a screen after it.

`docs/DEMO_2026-09-25.md:112`, the R1.5 row, quotes that title verbatim in its evidence column.

## Why

The deck-repair row spent its whole step 2 removing exactly this sentence from the 25 September
deck, because sending a room of strangers to "the last screen before Create" walks them past the
Typefaces row by two screens and then into a button that saves nothing. The wording survives in the
one place that repair could not reach, and the demo script's evidence column is where a presenter
checks a claim the night before.

The pair also has a maintenance edge worth naming: because the script cites the test BY ITS TITLE,
renaming the test silently invalidates the citation. Nothing gates that - `check:docs-index` reads
first cells, not quoted strings - so the two must move in one commit or not at all.

## What it would take

One commit touching both files: retitle the case to name the Finish step, and update the quoted
string in R1.5's evidence cell to match. Grep the repo for the old string first; on 2026-09-09 it
was in exactly these two places plus one owner-queue item that describes the correction and should
keep its historical wording.

## Evidence

- `e2e/import-svg.spec.ts:886` - the title and the `.wz-finish-summary` assertion under it.
- `docs/DEMO_2026-09-25.md:112` - the R1.5 evidence cell quoting it.
- `src/components/wizard/CreationWizard.tsx:125` - `STEP_TITLES_SVG`, the five-step road.
- `docs/backlog/create-project-is-a-door-that-saves-nothing.md` - the open question about the
  button this wording points at.
- `docs/acceptance/owner-queue/2026-09-09-aa-slide-4-no-longer-sends-the-room-through-create-project.md:29`
  - the deck's half of the same correction, already landed.

**Not taken on the night it was filed:** `claude/ag-ograf-external-renderer` held
`docs/DEMO_2026-09-25.md` that evening, and `e2e/import-svg.spec.ts` was off limits with it.
