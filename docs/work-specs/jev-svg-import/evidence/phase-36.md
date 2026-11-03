# Phase 36: Show minimal decisions and working controls

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-5: "Automatic working preview, existing control renderer and ordinary Finish/save; no routine
  layer-by-layer acceptance. Material ambiguity alone causes a compact decision."
- Row 36: "Walk all five families from deterministic proposals and, only when qualified, model
  proposals through the same decisions and existing controls. The no-go path remains complete.
  Simple lower thirds need no checklist; absent behavior intent gets one compact decision. Use
  design-consult plus an executable task rubric and give the owner a trial list."

## Pinned main

Worktree from `origin/main` `6d695e97c8d67f82f741d65b4e69ec7cec63653a` (PR #2030, row 35).
Previous verified main: that SHA. Revert this row after it lands with
`git revert -m 1 <merge sha>`. A revert puts back the old clock and credits copy and the explicit
credits pick; nothing is stored differently, and no migration or setting changes.

## The verdict this row follows

Row 34 gave no go and row 35 landed the model route switched off. So every walk here starts from
the drop's own deterministic proposal. The "only when qualified, model proposals" half does not
apply: no model entry point, switch or copy was added, and no paid or Gateway call was made.
`AI_SVG_DISCLOSURE` is shown nowhere, as row 31 required under no go.

## What the drop gives today, per family (measured before any change)

A throwaway probe dropped all 18 development designs on main `6d695e97`:

| Family | What the step showed | Decision owed |
| --- | --- | --- |
| Lower third (1, 2) | fields only, "it just comes on and off" | none |
| Lower third 3 | no text layers (outlined text): fixed artwork, with the re-export help | none; an honest limit |
| Scoreboard (1-3) | the figures are numbers, so the operator already gets + and − | none |
| Quiz 1 | quiz proposed and bound | none (lock and reveal keep the recipe defaults) |
| Quiz 2, 3 | not a quiz (numbers), or a reveal | the Behaviour choice |
| Clock (1-3) | time layer found; Clock select read "No clock." and the summary "it just comes on and off" | the clock's direction, which the artwork cannot give |
| Credits (1-3) | not recognised | the Behaviour choice, then a second pick of the list layer |
| Score + clock (1-3) | figures get + and −; Clock select as above | the clock's direction |

So the two families with absent intent were the clock (direction) and credits (the behaviour
itself). Both read as answered or took two steps.

## What changed

All in `src/components/wizard/import/BehaviourSection.tsx`, plus one approved string:

1. **The clock question reads as a question.** While a time layer is found and no clock is
   chosen, the "What it does" line says `the time stays as typed`, and the first Clock option
   reads `Not a clock. The time stays as typed.` Once a mode is chosen the line names it (`a clock
   counting up`), ahead of the + and − part. Finish stays possible without an answer.
2. **Credits are one choice.** Choosing Credits picks the first ticked text layer whose reading
   gives the styled list (either column answer), shown at once in the existing preview and still
   changeable. One text layer is picked as before. A drawing nothing reads as a list still asks
   for the pick, as before.
3. **The credits operator line follows the author's answers** (#2001): roll `the list to edit and
   Scroll speed (%)`, still `the list to edit`, cards `the list to edit, Card time (s) and Next
   card`, fixed artwork `Scroll speed (%)`.
4. **Approved boundary departure** (coordinator, 15:38Z): `src/templates/behaviours/credits.ts`
   line 71, the recipe's `description`, now reads "An editable list of roles and names in the
   look you drew; it rolls, holds still or plays as cards." It is what the Behaviour picker shows
   for Credits; the old words described only the fixed-artwork roll (#2001). Id and name
   unchanged.

`AnalyzeProposalPanel.tsx` is not changed: it is the raster image analysis panel, shown only when
its own server flag is on, and no SVG family passes through it.

## The task rubric (one walk per family, `e2e/jev-svg-preparation.spec.ts`)

| Family | Clicks | What the author and operator have |
| --- | --- | --- |
| Lower third (`lower-third-1`) | drop, Skip to finish, save | nothing asked; three fields on the saved graphic |
| Scoreboard (`scoreboard-1`) | drop, Skip to finish, save | nothing asked; the figures as steppers on the production page |
| Quiz (`quiz-1`) | drop, Skip to finish, save | nothing asked; Select answer, Lock it in, Reveal correct |
| Credits (`credits-1`) | drop, Behaviour: Credits, Skip to finish, save | the role-above list previewed at once; the operator gets the list to edit |
| Clock (`clock-1`) | drop, Clock: counts down from its time, Skip to finish, save, Take | unanswered the line says the time stays as typed; taken, it counts down from 07:45 |
| Score + clock (`score-clock-1`) | drop, Clock: counts up, Skip to finish, save | steppers and the clock's Start |

## Owner trial list

Files are in `e2e/fixtures/jev-svg/dev/`. Import graphic, drop the file, then:

1. `lower-third-1.svg`: Skip to finish, save. The strap's name and role are editable; nothing was asked.
2. `scoreboard-1.svg`: Skip to finish, save. The scores have + and − on the production page.
3. `quiz-1.svg`: Skip to finish, save. Select answer, Lock it in and Reveal correct are there.
4. `credits-1.svg`: Behaviour, pick Credits. The list preview shows Research and Sound with their
   names at once; save, and the credits are one box to edit.
5. `clock-1.svg`: "What it does" says the time stays as typed. Pick a Clock mode, save, Take:
   the clock runs.
6. `score-clock-1.svg`: pick a Clock mode only; the scores need nothing.

## Carried items

- **Row 6, a correction surviving a UI-driven reanalysis of look-alike layers.** Under no go the
  only UI that analyses the artwork again is dropping it again; the first walk in the spec
  corrects the twin layer, re-drops the same file through the UI and keeps the correction, then
  saves and reopens it. A model reanalysis has no UI under no go; its proof belongs to whichever
  row adds an entry point after a qualified verdict (row 35, "What turning it on would need").
- **Row 31:** `AI_SVG_DISCLOSURE` is not shown anywhere and was not added.
- **#2001** is closed by this row (both halves).
- **#1876** (the old Countdown kind beside Clock), **#1917** (no-Lock quiz in the proposal route)
  and **#1982** are untouched: none is in this row's files or needed by its walks.

## Decisions

- **A summary that states what ships, not an instruction.** The draft keeps no "answered" flag
  for the clock (`draft.ts` is outside this row), so "No clock" chosen and "not yet answered" are
  the same state. A line like "say how it runs" would keep nagging after a deliberate No; "the
  time stays as typed" is true in both, and an author who wanted a clock sees the mismatch.
  (design-consult, option A4.)
- **Pre-picking the credits list is not a hidden guess.** It only takes a layer whose reading
  gives the styled list, and the preview showing that list sits directly under the picker. The
  "never guess row one" rule protects a vote's or score's display targets from silent wrong
  bindings; credits are the quiz case of a question the file already answered. (design-consult B2.)
- **No new section, banner or checklist.** The decision lives in the existing selects; the
  section's one line says what ships.

## Verification

- `e2e/jev-svg-preparation.spec.ts` through the job queue: 11 of 11 (six new or extended walks,
  five unchanged).
- Mutations: see the PR body.
- `npx tsc --noEmit` and eslint on the changed files: clean.

## Traps

- `map-svg-why-behaviour` is the section's info button, not its summary: read the summary as
  `map-svg-behaviour .wz-sec-head .muted`.
- `lower-third-1`'s `score` layer is not read as a figure, so its summary is the plain one.
