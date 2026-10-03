# Rendered rundown feedback evidence

Acceptance is defined in [the spec](../spec.md). Images use 1600x900 and 390x900
viewports. The `before-*` images were captured before the Add/menu change, using
the complete [pre-671 saved templates](../../../../e2e/fixtures/pre-671/README.md).

| Criterion | Result and evidence |
| --- | --- |
| AC-1 | Pass. Catalog and pre-671 quiz and score labels fit at both widths. `before-*`, `catalog-quiz-*`, `catalog-score-*`, `legacy-quiz-*`, `legacy-score-*`. Lock, reveal choice, reveal correct and both score +/- pairs preserve their transitions and deltas; saved template JS stays identical. No action-label CSS or saved-data change was needed. |
| AC-2 | Pass. `add-menu-*`, `video-picker-*`, `add-without-server-*`. All seven choices reach existing paths. Library focus, new-graphic wizard and picture upload were exercised. Video/audio filtering retains channel 2 and layers 10/5; additions and folder survive reload. Escape closes the menu and both surfaces fit the viewport. |
| AC-3 | Pass. `pending-move-*`. Cut retains cue identity and air state; Escape confirms cancellation. The existing clipboard regression verifies copy creates independent cues and paste moves the original on-air cue. |
| AC-4 | Pass. `mixed-rundown-*`. Existing T, play, music and folder glyphs, their colors and folder indentation distinguish all four types. Accessible type names remain present. Custom colors remain a future plan. |

## Commands and results

- `set NOACG_C_CAPTURE=1&& npx playwright test e2e/playout-rundown-feedback.spec.ts --workers=1`: job `j-3172`, 14 passed, 48.6s.
- The exact 13-case Add/clipboard/keyboard selection across `playout-folders`, `playout-cues`, `productions`, `playout-drills`, and `production-controls`: job `j-3173`, 12 passed and one existing skip, 41.9s.
- `npx playwright test e2e/playout-baseline.spec.ts --workers=1 --update-snapshots=changed`: job `j-3174`, six passed, 29.6s. The six inspected Windows pictures change only the intended header Add button.
- Final portable `+ Add` label: Windows job `j-3177`, six passed, 29.7s; [Linux workflow 37160074040](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37160074040), six passed. Both were captured from product revision `f6873dbd3`; all 12 pictures were inspected. The first Linux capture showed the fullwidth plus as a missing glyph, so the new header uses the plain plus.
- Retained footer picker toggle: `--grep routing`, job `j-3180`, two passed, 20.9s. The menu recognizes the existing footer opener as a trigger so an outside press cannot close and then reopen it on the same click.
- Final Video/Audio reopen and guard proof: `--grep routing`, job `j-3188`, two passed, 21.6s. Both shortcuts return to their media tab after Templates/Escape; footer toggle, routing and persistence still pass. Page errors are asserted absent, and both console/network diagnostic lists are empty.
- `npm run build`: approved-host job `j-3175`, exit 0, including all unchanged gates, TypeScript, ESLint, dependency checks and bundle.
- `npx tsc --noEmit`, focused ESLint and `git diff --check`: passed.

The action evidence capture scrolls the action row into view, since choosing the
quiz answer can scroll down to its setup fields. The exact eight quiz/score cases
were captured again with `--grep remain` in `j-3176`. Capture mode also logs page,
console and failed-network diagnostics: eight passed in 29.8s, with empty error
lists for all eight cases. Ordinary CI does not write evidence images.

## Development failures and limits

The first test-development run `j-3165` exposed incorrect test assumptions about
setting the quiz answer after Take and matching the picker Add label. `j-3168`
exposed an incorrect expectation that the new-graphic wizard retains the pending
production id after consuming it. The corrected cases passed in `j-3172`.

`j-3169` failed when a concurrent job adopted a prestarted dev server that exited
with its owner. This was a server-lifetime failure, separate from assertions.
Explicit `--after` dependencies serialized the corrected `j-3172` through
`j-3176` proof; no framework, permissions or rule changes were made.

Preparation review found the retained footer toggle could reopen after the
outside-press handler closed the moved picker. The exact two-case reproduction
`j-3178` failed at both widths. The additional trigger reference fixed it, with
`j-3180` green. The first repair job `j-3179` never ran because its dependency was
the intentionally failing reproduction; the corrected job depended on the last
successful completed browser job.

Independent review found one product defect: reopening the same Video/Audio
shortcut could retain the Templates tab. The correct two-case reproduction
`j-3183` failed at both widths. Filtered pickers now reset on each opening; the
unfiltered picker keeps its existing state. `j-3184` passed both reopened kinds.
The premature final build `j-3181` was cancelled for this repair; `j-3182` was
cancelled after correcting its tab selector and supplies no regression evidence.

Mixed-case diagnostics exposed the test helper seeding localStorage inside
sandboxed graphic frames. Settings now seed only the app; the iframe sandbox is
unchanged. `j-3185` passed with clean diagnostics. The permanent zero-pageerror
assertion was then mutation-tested: removing this seed guard in `j-3186` fails
at that assertion; restoring it and removing the outside-trigger guard in
`j-3187` fails at the footer picker-hidden assertion. Both guards were restored
before the final green `j-3188`. These two intentional failures prove the guards,
and are separate from product or infrastructure regressions.

Configured backend tests were updated for the menu entry but were not run locally.
The bounded checks use the existing fake bridge, not a physical playout server.
Linux baselines were captured through the existing screenshot workflow. Parent B
landed as `385a26b57`; reconciliation with current main `f7db56b07` was clean and
changed only the inherited quarantine ledger. Product and test blobs retained
their verified contents. The final tip must pass its build and check stamp before
entering the normal merge queue.
