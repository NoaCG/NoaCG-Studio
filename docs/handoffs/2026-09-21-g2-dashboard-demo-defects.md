# G2 - the demo walk's dashboard defects

Branch `claude/g2-dashboard-demo-defects`, worktree `.claude/worktrees/agent-a4ed009f31ca6d0f0`,
forked from `da821d84` and merged with `origin/main` at `30b9c925` before queueing. The defects
came from row E's live rehearsal (`docs/handoffs/2026-09-21-e-demo-rehearsal.md`, "For row G").
Owner walk: `docs/acceptance/owner-queue/2026-09-21-g2-dashboard-demo-defects.md`.

## What was done

1. **Out leaving a graphic painted in PROGRAM: not reproduced, now pinned.** I measured the
   monitor's own documents after every Out: root opacity and machine state per layer. I ran it
   locally and against https://noacg.studio, with the shipped samples and with the docs example
   quiz and scoreboard, one layer alone and two side by side, after select, lock and reveal.
   Every Out took the root to opacity 0 and the machine to `off`, and the screenshots show an
   empty PROGRAM. `/output` builds the same `createOutputStage` over the same `composeDocument`,
   so it follows the same path. The command path (applyProgram, PayloadStage.apply, the
   live-control backlog from 97cc8e70) cannot hold a stop behind a play for more than the 400 ms
   font cap. With `requestAnimationFrame` stubbed inside the monitor documents, the exit never
   runs, but the entrance never shows either, so that is not row E's symptom. My reading is that
   the rehearsal's automation pane stopped repainting the sandboxed monitor frames while it was
   hidden. The walk (`e2e/dashboard-operator-walk.spec.ts`) now reads opacity and state off the
   monitor after each Out. It went red when the stage's `stop` case was removed.
2. **Update after a reveal.** Decision, reached with a consult: Update stays data only, because
   the same verb must not undo a scoreboard's Final when a team name is fixed, and the dashboard
   must stay type-agnostic. `movedStateNames()` (controlModel) names the states the live graphic
   has moved into. With edits pending, the note reads "Update keeps Reveal on air, Re-take starts
   over with these values", and Update's title reads "Sends the values. Stays on Reveal." To
   revert, drop `keptStates` in ProductionPage.
3. **Next after a reveal.** `canAdvance()` mirrors the runtime's `noacgProcessNext`. Next and the
   N key grey on a last step, and the title says why. Mutation-checked in the walk.
4. **State chip.** `formatMachineState` and the exported panel's baked copy print state names
   only, never group ids. `control-panel-types` and `production-controls` specs were updated.
5. **Band headings.** `groupHeading` takes the first name-like value in the band, skipping
   figures, colours and paths. Pinned in the docs example scoreboard test.
6. The "+ New graphic" title uses a plain dash (copy baseline re-recorded).

## Left, and why

- **HostedControlPage** has the same Next and Update verbs. The prompt kept that file for row G,
  so the hosted page does not grey Next or name kept states yet. `canAdvance` and
  `movedStateNames` are exported for it. It does get the new chip text, via `formatMachineState`.
- Row E's items 6 to 8 (the undocumented "Reveal choice" button, the empty log after a reload,
  the hosted reload finding) were not in this row's goal.
- **Queue starvation seen tonight**: browser gates sat behind landings for long stretches.
  Row N's fix (`58662733`) landed during this session.

- **The merge queue refused the first queueing** (run 35663497961). Row L had rebuilt
  `public/docs/examples/scoreboard.svg` with numbered rows (Team 1, Score 1, Score 2, Team 2), so
  the bands are `row-1`/`row-2`, and my assertion named `side-A`. The heading fix held: band 2
  leads with its score, which is exactly the case it covers. The assertion now reads every band
  label off the rendered editor and checks that none is "Side"/"Row" or a bare figure.
- **CI finding, not fixed: the "E2E retry" job crashed** in that run with "Expected double-quoted
  property name in JSON at position 146163" while naming the failed specs.
  `scripts/e2e-retry.mjs` `mergeBlobReports` runs `playwright merge-reports --reporter=json` and
  `JSON.parse`s its whole STDOUT. Anything else that reaches that stdout corrupts the parse. Merge
  reports loads `playwright.config.ts`, and the offline guard and `scripts/e2e-workers.mjs` both
  `console.log`. The error sits 146 KB into the stream, not at the start, so the exact writer is
  unconfirmed. The robust fix is to have the JSON reporter write a FILE
  (`PLAYWRIGHT_JSON_OUTPUT_FILE`) and parse that, not stdout. I left it alone because I could not
  reproduce it here, and a wrong guess would silence the retry job.

## For the owner

- Out on your own laptop should empty PROGRAM within about half a second. If it ever does not,
  note the browser and whether the tab was in the background. That is the one fact that would
  reopen item 1.

## Commits

`7a4c2977` (items 2 to 6), `d9f6dc33` (Out assertion, docs-example checks, machine cache), the
merge of main, and the production-controls chip fix.
