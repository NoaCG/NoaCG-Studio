# 2026-09-24 - Row F: the skipped specs come back off the old editor

Written in the night of 24-25 September by wave row F, on branch `claude/f-rewrite-skipped-specs`.
It landed twice: first a fix for the configured suite on its own (pull request 412, merged at
4e8d2016), then the rewrite itself, which this file goes with.

## First: the configured suite was red on main, and is green now

Row A's landing turned `configured-suite.yml` red (run 36069827692): 29 of 50 tests failed, and
every one failed at the same line. `startNewProject` in `e2e/_create.ts` clicked "the" button
named "+ New graphic", and sign-in now lands on Home, where an empty library shows a second
button with that name in its body. I reproduced it offline with a throwaway spec (the empty Home
really has two) and fixed the helper to click the door by a new hook,
`data-door="new-graphic"` on `NewGraphicButton`. A branch dispatch then found one more test
hidden behind the first: `homebase.spec.ts` pressed Back from Home expecting to leave it, because
the account menu used to be opened from the old editor. That step is gone with a comment saying
why. Dispatched on the fixed tip, the suite passed 31 of 31 (run 36073086520); PR 412 was
dequeued once to add the homebase fix and then landed. On `main` at 4e8d2016 the suite is green:
run 36075489891, 31 passed, 0 failed, 25 allowed skips.

**Does main's configured suite stay green with this landing?** It should, and it was measured
rather than guessed: `configured-suite.yml` dispatched on this branch passed 46 of 46 with 10
allowed skips, on 7b64d739 (run 36076078573) and again on b49d891d after the review fixes (run
36078420939). The floor is now exactly 46, so a lost test fails the verdict.

## What landed in the rewrite

- `bootstrapGraphic` (`e2e/_create.ts`) is `createProject` without the old editor: the same
  working-slot seed, landing on `#/home`. `createProject` still skips, so a test only runs again
  where it was moved on purpose and seen passing.
- `openProductionWithCurrent` makes a production holding the working graphic through the same
  model calls the old Rehearse panel made (`createShowNamedChecked`, `addGraphicToShow` with the
  saved id) and navigates to its page in-app. `openExportWindow` opens the export window on the
  working graphic, template, sample data and saved id, which is what the old Export panel
  exported, through the same `ExportSurface`. `openWorkingGraphicInEditor` opens the new editor
  (`/app?editor=foundation#/editor-foundation`) for the save controls. `finishIntoNewEditor` walks
  a wizard to Finish and presses "Edit this graphic".
- The new editor's Home button carries `open-home`, the hook the old topbar's had.
- **160 tests run again: 145 offline, 15 configured.** Configured: 13 whole files (every
  production, output, relay and audience test), the anonymous save-dialog test and one signed-in
  production test. `MIN_TESTS` 31 to 46; 13 files left `ALLOWED_SKIPS`.
- A moved test that did not pass in its new home calls `skipOldEditor()` as the first line of
  its body (57 of them), so it stays listed rather than failing. Files where nothing moved
  passed went back to their `main` versions untouched.
- `scripts/e2e-affected.mjs` maps `ExportWindow`/`ExportSurface`, `ProductionPage`,
  `EditorFoundation`, `SaveControls`/`SaveDialogs` and `FinishStep` to the specs that now stand
  on them.
- `docs/backlog/specs-that-still-open-the-old-editor.md` lost all 160 entries (11 of them were
  never listed: row A's static scan missed describe-scoped tests), is `state: advanced`, and says
  how to port what is left. New: `docs/backlog/home-empty-library-has-two-new-graphic-buttons.md`,
  the product half of the first fix.

## How the 160 were chosen, since that is the claim to check

Row A's list was a static scan, so I measured instead of trusting it. I built the app and marked
every testid and class a test touches that the production bundle no longer contains (only the
old editor rendered them), migrated mechanically (`createProject` to `bootstrapGraphic`, the
Productions panel block to `openProductionWithCurrent`, `dock-tab-export` to `openExportWindow`),
and ran the 178 likeliest in a detached lab worktree with a short action timeout: 119 passed.
Two more rounds (open the new editor before a save; the `open-home` hook) brought 17 more. Then
the gate, in this worktree on main, at one worker: every changed spec file, 347 passed, 228
skipped, 0 failed (job j-1898), and after the review fixes the touched files again, 92 passed,
59 skipped, 0 failed (j-1905). The scan scripts are not committed; they were one-night tools.

## Decisions

1. **A new bootstrap name, not an un-retired `createProject`.** Un-retiring it would have made
   every caller run at once, including configured specs I could not run here, and turned several
   hundred skips into failures of unknown count. With a new name, a test runs only where it was
   moved and seen passing, which keeps row A's rule ("a test skips exactly when it calls a
   retired helper") true.
2. **The export window opened from the store, not from a Home row.** The old Export panel
   exported the working document with its live sample data; a Home row exports the saved
   record with its active entry's values. Opening `useExportUi` with the working document keeps
   what the tests asserted. The doors themselves (Finish, a Home row) have their own specs.
3. **A configured change is verified by dispatching `configured-suite.yml` on the branch**, since
   the laptop has no Docker. That is how the 15 configured tests and the floor were checked.
4. **Not fixed from the review**: it said a second `bootstrapGraphic` on `/app#/home` would not
   reload and would leave the export window up. The two tests it named passed in both gates, so
   I left the helper as measured rather than as argued.

## What is left, and why

- Still skipped, and listed with its reason class in the backlog file: tests whose subject was an
  old-editor panel (timeline, canvas and stage, Inspector, code pane, machine graph, dock tabs),
  tests that read the old preview frame (`iframe.preview-frame`) or press its Play button (the new
  editor renders at a timeline time and has no Play), the AI panel and the AI wizard walks that
  ended in the editor, and most of the SVG import family, which reads the old preview.
- 45 spec files still call `enableAdvancedMode` or `switchToAdvancedMode`, so the goal "no spec
  switches into Advanced mode" is not met; those calls skip.
- `scripts/acceptance-pack.mjs`, `acceptance-shots.mjs` and `save-to-air-bench.mjs` still drive
  the old editor (listed in the backlog file).

## Codex

Delegated once through `/rescue` (the SVG import family, `--write`, in the lab worktree). It came
back unusable: its command runner failed before every command with "setup refresh had errors",
and no file changed. Recorded with `npm run outcome` as `codex gpt-6-astra bulk-edit unusable
(capacity)`, redone by me with an AST selection of the tests that read only the template. The
rest of the row was mechanical enough to script, and the queue, not writing, was the bottleneck.

## Check

- review: `delegated`. The code-review skill ran forked at medium effort over the 68-file scope
  `scripts/review-request.mjs` printed (base 4e8d2016); its reported scope matched. 10 findings,
  9 fixed in b49d891d (text-tools vacuity, two productions tests and a playout-cues helper
  skipped for a missing save door, planner gaps, unverified export conversions in skipped files,
  a save race in signed-in-ux, the pasted Finish walk, the feedback guard, the floor note and the
  owner-queue wording); the tenth is decision 4. The first landing had its own delegated review
  (5 findings, 3 fixed, the rest reported: the product ambiguity is the new backlog file).
- simplify: `inline`. The one duplication (four copies of the Finish walk) became
  `finishIntoNewEditor`; nothing else to change.
- verify: `inline`. `npm run build` exit 0 on the final tip; the gates above; both configured
  dispatches; `node scripts/e2e-affected.mjs --list` exit 0, its unit tests 47/47, and the
  CI-shaped plan (`E2E_SPRINT_FOCUS=1 ... --json --integration 4e8d2016`) exit 0.
- taste: not applicable. Nothing here changes what a graphic looks like.

## Pointers

- Owner walk: `docs/acceptance/owner-queue/2026-09-24-f-specs-off-the-old-editor.md`.
- What is left: `docs/backlog/specs-that-still-open-the-old-editor.md`.
- The lab worktree (`.claude/worktrees/f-rewrite-lab`, detached, no branch) is unregistered
  from git; Windows refused to delete its folder while a handle was open, so an empty or
  node_modules-only folder may be left there to delete by hand.
