# Phase 39: Run the complete qualification matrix

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset: AC-3, AC-5, AC-8, AC-9,
AC-10, AC-12, AC-13, AC-14, AC-15, AC-16 and AC-17, each quoted in its row below. Row 39, verbatim:
"On the immutable landing, run affected/full Actions gates and cumulative all-family journeys, all
six credits combinations and held-out regressions. Record intentional snapshot changes. Reusing
exposed holdout is regression evidence, not a fresh blind benchmark."

Builder: Claude Code cloud worker for coordinator `session_017SdbwQ6d3pRaakjohGfCcC`, environment
`env_017nuiDZBW9smUNLdWVQK8cf`. Tests and these notes only. No product file changed, no model,
paid or Gateway call, no evaluation dispatch, and no holdout design was read or decoded.

## Pinned main

The immutable landing is main `8b5ca96ffeca0cd6f63a0d27ccbe24ea2b5fb038` (PR #2038, row 38), the
last row merge before this one. Previous verified main: that SHA. Revert this row after it lands,
on a fresh branch from `origin/main`, through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-39-build')"

Tests and notes only; nothing persisted changes and there is no migration.

## The runs on the landing

Every run GitHub made for the push of `8b5ca96f` to main, all `success`:

| Run | What it is | What it ran |
| --- | --- | --- |
| [41709603468](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41709603468) | CI, merge group | the merge as tested before landing |
| [41710583409](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41710583409) | CI, push on main | **full** (not subset): Build, Factory gates (367 node tests, 0 skipped, Chromium 149.0.7827.55), E2E 1 to 15 of 15 (full), CI gate |
| [41710583448](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41710583448) | configured-suite, push | the whole configured set, four shards on a local Supabase stack: 151 passed, 0 failed, 0 flaky, 3 skipped (`bridge-real-server` twice and one `connector-grants` case, none of this plan's) |
| [41710583428](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41710583428) | Quarantine | `e2e/import-svg-credits.spec.ts` (quarantined since 2026-11-03): 21 of 21 |
| [41710583503](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41710583503) | Post-landing | no migration to apply |

This PR's own runs on its head are in the PR: its CI run and one full `ci.yml` dispatch with an
empty `diff_base`. The merge of this row gets the same push runs; the checker reads them on the
merge SHA.

## Per criterion

"Landing" means the runs above. A test file named under "Proof" ran there unless it says
otherwise. Local runs are this worker's, through the job queue, on this branch.

| AC | Proof on the landing | Stays unqualified, limited or open |
| --- | --- | --- |
| **AC-3** "Existing importer/appearance/field/control baselines are recorded; regressions cannot be hidden by regenerated snapshots." | Factory gates, 41710583409: `scripts/jev-svg-baseline.test.mjs` (18 development designs: layers, fields, controls, appearance hashes, gate refusals and the text ladder, compared on the recorded Chromium 149) and `scripts/svg-import-passes.test.mjs` against `scripts/fixtures/svg-corpus-passes.json` (51 files, 601 records, five sidecar findings, unchanged). The baseline has no re-record switch: a change edits the test, so it is in the diff. | Locally (Chromium 153) the baseline's text comparison skips and four pass records fail (#1647's image difference; CI on the pinned browser is the judge, and nothing was re-recorded). The passes record can be re-recorded with an environment switch; only its diff and the PR's reason guard that. |
| **AC-5** "Automatic working preview, existing control renderer and ordinary Finish/save; no routine layer-by-layer acceptance. Material ambiguity alone causes a compact decision." | `e2e/jev-svg-preparation.spec.ts` (all five families and score plus clock from the drop: lower third, scoreboard and quiz ask nothing; credits and clock ask one choice; the row 38 journey on unfamiliar artwork), `e2e/import-svg-behaviour.spec.ts`, `e2e/import-svg.spec.ts` (full E2E); `scripts/jev-svg-apply.test.mjs`, `scripts/jev-svg-contract.test.mjs`. Locally: preparation spec 17 of 17 (j-0003). | Model proposals: row 34 gave no go, so the route is off and only the deterministic path is qualified. #1876, #1917 open. Reanalysis through the UI exists only as a second drop. |
| **AC-8** "One instanced imported clock coexists with a score full recipe, with one new-import Clock choice and unchanged saved countdowns; it reuses match-clock runtime/wire; up/down/start/pause/reset/correction, field identity and recovery work without native regressions. Duration starts on Take." | `scripts/imported-match-clock.test.mjs`, `imported-clock-wire.test.mjs`, `air-state.test.mjs`, `jev-svg-contract.test.mjs`; `e2e/import-svg-behaviour.spec.ts`, `e2e/playout-clock.spec.ts`; configured `scorebug-output.spec.ts` (an imported clock started, held and reset from the server on two real outputs, reload recovery, an imported duration's Take and running correction). | #1886 (fast-road Take stamp; did not reproduce on protocol 2), #1887, #1903 (Reset or Pause before the first Take), #1906 (program monitor reload), #1884. |
| **AC-9** "A fixed target instant resolves input/date/zone, handles midnight/DST/past targets and survives updates/replay/recovery. Correct hours display and minimal mode-specific controls." | `scripts/clock-target.test.mjs` (midnight, DST, past targets), `imported-clock-wire.test.mjs`, `air-state.test.mjs`; `e2e/import-svg-behaviour.spec.ts`, `e2e/playout-clock.spec.ts`. | #1898 (an undated target into a DST fold), #1903, #1906. (#1894, the DST gap case, is closed.) |
| **AC-10** "Score changes preserve clock origin; clock changes preserve scores/effects. Existing +1/−1/flash semantics, reset scope and lifecycle are tested." | `scripts/imported-score-event.test.mjs`, `imported-clock-wire.test.mjs`, `air-state.test.mjs`; configured `scorebug-output.spec.ts`. Row 13's probe on `score-clock-3` (a fixture no builder used) passed row 12's harness. | #1908 item 2: an output rebooted from its report shows no team's flash until the next +1. |
| **AC-12** "True no-Lock variant removes obsolete controls/paths, handles sealed selection/timers and preserves saved quiz behavior." | `scripts/quiz-no-lock.test.mjs`; `e2e/import-svg-behaviour.spec.ts` (no-Lock journey, a standard quiz unchanged, the second author); configured `imported-quiz-output.spec.ts`. | #1917 (the proposal cannot propose no-Lock). Unticking No lock restores the earlier options only within one visit to the mapping step. |
| **AC-13** "Imported credits styling supports roles above/beside, multiple names and static/roll/cards, with defined overflow and source/animation identity. Fixed artwork remains compatible." | `e2e/import-svg-credits.spec.ts` (quarantined, so in the Quarantine run: 21 of 21) renders all six pairs; `scripts/imported-credits-model.test.mjs`, `imported-credits-source.test.mjs`, `credits-parser.test.mjs`, `credits-live-speed.test.mjs`. The six pairs are listed below. | The spec is quarantined (#1988, line 1183's timing bound), so no PR gate reads it until it is released. #1937, #1955, #1965, #1969, #2033 open (#1958 closed). Row 16's limit: a names-first drawing reads with roles and names swapped unless the column choice is answered. |
| **AC-14** "Sheet changes update declared imported credits, ticker and editable multiline-text fields through existing source/data bindings; adapter mapping, failure, empty data, pause/reconnect, closed-page delivery and each existing/selected playback update policy are proven. No AI per refresh." | `e2e/imported-credits-live-data.spec.ts` (refresh, empty and refill, failure and reconnect with no model request, each playback's policy; **new**: role beside in each playback), `e2e/imported-text-live-data.spec.ts`, `e2e/ticker-linked-update.spec.ts`, `e2e/production-data.spec.ts`; configured `production-data-key-tick.spec.ts` (every page closed), `production-data-key-sheet.spec.ts`; node `sheet-source`, `content-formats`, `imported-text-source`, `data-tick`, `ticker-speed`. | #1977 (a typed line break paints as a space). A drawn ticker gets no motion engine: unsupported moving artwork stays fixed (spec). |
| **AC-15** "Layers remain editable fields and animation targets; verified-match IDs, keyframes, source bindings and controls survive save/reopen/reimport; unresolved work is protected." | `e2e/editor-fidelity-trim.spec.ts`, `e2e/import-svg-reimport.spec.ts`; configured `panel-graphic-actions.spec.ts` (a renamed control of a reimported score board); the row 38 journey's replacement walk. | #1982 (no layer of a graphic with a behaviour can be keyed), #1986, #1987. A moved or restyled layer is unresolved and saved as a separate graphic. |
| **AC-16** "Generated packages pass existing isolated receiving-host tests; hosted clock recovery is distinguished from standalone capability and physical studio acceptance." | `e2e/ograf-lifecycle.spec.ts`, `e2e/spx-operator.spec.ts`, `e2e/ograf-parity.spec.ts` (full E2E); configured `scorebug-output.spec.ts` (hosted clock recovery on two outputs), `svg-import-journey.spec.ts` (an isolated output cut off and restarted). | Physical studio acceptance is not claimed (row 40 labels it). #1886 is a lower bound from one machine. |
| **AC-17** "Model/network/quota failure and disabled Jev leave useful import and saved playout; prompt injection cannot alter allowed behavior or expose data." | `api/_lib/aiDecisionGateway.test.ts`, `api/_lib/aiTaskRegistry.test.ts` (Factory gates; locally `npm run test:ai-gateway`: 445 pass, 0 fail, 13 skipped); `e2e/jev-svg-preparation.spec.ts` ("with every AI route failing ..." and the route-off walk). | #2034 (P2): a failed settings or plan read lets image analysis ignore its kill switches. Described, not asserted. |

Unqualified across the run, carried to row 40 as they stand: the image comparison was refused on
every request (#2022), Jev with pixels was never run (#2006), and the three-notice-zones optional
challenge did not pass (row 38: per-zone entrance, exit and visibility are not offered; #2041
asserts that limit later). None is claimed here.

### All six credits combinations

| Pair | Rendering (`import-svg-credits.spec.ts`) | Linked Sheet update (`imported-credits-live-data.spec.ts`) |
| --- | --- | --- |
| Role above, static | "role-above credits chosen to hold still ...", "styled credits held still, role above and role beside ..." | "a still page shows an update on air at once ...", "#1973 ..." |
| Role above, roll | "role-above credits drawn as separate layers roll ...", "styled credits, role above and role beside, enter and leave ..." | "a Sheet refresh keeps a rolling list ...", "a roll on air keeps its list ...", "a failing Sheet ..." |
| Role above, cards | "role-above credits chosen to play as cards ...", "styled credits as cards, role above: ..." (two) | "cards on air keep the cards they took ..." (two) |
| Role beside, static | "styled credits held still, role above and role beside ..." | **new** "role beside, static: ..." |
| Role beside, roll | "role-beside credits roll in their two drawn columns ...", "styled credits, role above and role beside, enter and leave ..." | **new** "role beside, roll: ..." |
| Role beside, cards | "styled credits as cards, role beside: ..." (two) | **new** "role beside, cards: ..." |

The live-data walks covered role above only, so this row adds one walk per playback for role
beside (`credits-2`): an update on air follows the playback's rule (roll and cards keep the list
they took and air the newer one on the next Take; a still page shows it at once), and each row
stays in its drawn column and look (roles left at 26 px, names right at 32 px, a role on its first
name's line). Mutation: making every update follow the holder on air (`creditsListWaits` returning
false, reverted) fails the roll and cards walks at "the newer list waits" (j-0002); the still walk
passes, as it should.

### Held-out regressions (exposed holdout: regression evidence, not a fresh blind benchmark)

The holdout was consumed by row 34's single run, `41643649692` (main `2dcadaf7`). It is reused
here as regression evidence only: it is no longer blind, and it is not a new benchmark. No design
was read or decoded; the only inputs are that run's `report.json` scores, read again here:
`verdictApplies` true, `refusedDesigns` empty, decision `no-go` (`consequential-increase:quiz`,
`consequential-increase:credits`). Summed per stratum, corrections plus decisions / consequential
errors, they equal phase 34's table:

| stratum | deterministic | jev-structured |
| --- | --- | --- |
| lower third | 3 / 3 | 3 / 3 |
| scoreboard | 9 / 4 | 7 / 4 |
| clock | 7 / 4 | 9 / 4 |
| quiz | 9 / 0 | 13 / 5 |
| credits | 9 / 3 | 14 / 6 |
| score-clock | 11 / 3 | 12 / 3 |

The landing still prepares every family deterministically. Between `2dcadaf7` and `8b5ca96f`, the
files the deterministic arm reads (`src/assets`, `src/templates`, `src/components/wizard`,
`src/ai`) changed only in `src/ai/svgInterpretation/client.ts` (row 35, called by no surface),
`BehaviourSection.tsx` (row 36, the wizard's words and the credits pre-pick after the author picks
Credits) and the Credits recipe's description. None changes the drop's proposal, so the
deterministic held-out numbers still describe the landing. Re-scoring would need the protected
evaluation workflow, which this row may not dispatch. The development designs, the same strata,
are re-checked on the landing by `jev-svg-baseline.test.mjs`.

## Intentional snapshot changes

None. `scripts/jev-svg-baseline.test.mjs`, `scripts/svg-import-passes.test.mjs` and
`scripts/fixtures/svg-corpus-passes.json` are unchanged; no baseline was regenerated, no limit
raised and no assertion weakened.

## Verification on this branch

- `e2e/imported-credits-live-data.spec.ts -g 'role beside'`: 3 of 3 (j-0001); with the mutation,
  2 fail as intended (j-0002).
- `e2e/jev-svg-preparation.spec.ts` and `e2e/imported-credits-live-data.spec.ts`: 24 of 24
  (j-0003, 1.8 min).
- `e2e/import-svg-credits.spec.ts` (quarantined): see the PR for the run on the final head.
- Node, locally: `jev-svg-contract` 24, `jev-svg-apply` 12, `imported-match-clock` 5,
  `imported-clock-wire` 8, `air-state` 27, `clock-target` 19, `imported-score-event` 12,
  `quiz-no-lock` 17, `imported-credits-model` 46, `imported-credits-source` 14, `credits-parser`
  16, `credits-live-speed` 7, `imported-text-source` 8, `content-formats` 27, `sheet-source` 44
  (1 skipped: the public-sheet probe), `data-tick` 14, `ticker-speed` 35; all pass.
  `jev-svg-baseline` 19 pass, 1 skipped (text, Chromium 153); `svg-import-passes` 18 pass, 4 fail
  (#1647, the image's Chromium; the landing's Factory gates pass all of them on 149).
- `npx eslint` on the changed spec: clean.

## Decisions

- **The landing's own push runs are the full Actions gate.** Push CI on main runs the whole
  offline suite (15 shards) and configured-suite the whole configured set, so the matrix reads them
  instead of asking for more. The branch head gets one full `ci.yml` dispatch for the added walk.
- **One walk per playback, not a six-way loop.** Role above already had its linked-data walks
  with the Sheet and failure paths; role beside needed only the update rule in each playback, on
  the blank-page build the existing walks use.
- **No new configured spec.** The backend tier is over its line (141%); everything here runs
  offline.

## Traps

- `git reset --hard` after a mutation commit made with `-a` also drops uncommitted test edits that
  went into it. Commit the test first, or mutate in a separate commit.
- The job queue refuses a second broader job on the same commit; commit before the next selection.
- The commit hook refuses `Co-Authored-By` trailers in this repository.
