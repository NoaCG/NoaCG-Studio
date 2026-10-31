# Phase 3: existing import baseline

Run `plan-jev-svg-import-2026-10-31` (issue #1850), PR #1858. Acceptance subset: AC-3. Builder: Claude Code
cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`, environment
`env_017nuiDZBW9smUNLdWVQK8cf`. Recorded 2026-10-31 UTC. No product source changed, no model
call was made and no spend occurred. The holdout was not read.

## Pinned main

Worktree created from `6b3592c3` (PR #1855) after a fresh fetch. Previous verified main:
`7f0a00baadea97b14073ec7c48fbb796ddd8da13` (PR #1853): push CI, merge-group CI, configured-suite,
Post-landing, Quarantine and Push on main succeeded. On `6b3592c3` the configured-suite push run
41205531471 failed in shard 4 and the authenticated job at Supabase start ("failed to bind host
port 0.0.0.0:54322: address already in use"), an infrastructure failure outside this phase's
reach; its other workflows succeeded.

## What is recorded

`scripts/jev-svg-baseline.test.mjs` (factory tier, Chromium) runs each of the 18 development
designs of the frozen corpus, three per stratum (lower third, scoreboard, clock, quiz, end credits,
score+clock), through the same path as the 51-file harness: the reader's inventory, the wizard's
drop draft and field list, the build and bound artwork, the generated SPX controls, the export
gate, and the design mounted as the preview composes it. Per design the record holds the proposed
behaviour, every importer layer ID with its element path and source id, the field list, the
controls, each labelled anchor of `dev.expect.json` resolved to its layer, canonical appearance
hashes, the export gate's refusals and the text at rest.

The record is written in the test file by hand and has no re-record switch: a change that moves
it must edit the test, so the difference is in the pull request diff. A failing design prints its
fresh record to compare against.

What today's import does with these designs (facts for later rows, not a score):

- Behaviour proposed for 2 of 18: `quiz` for quiz-1 and `recipe` for quiz-3. No scoreboard,
  clock, credits or score+clock design gets a behaviour.
- Every labelled field anchor resolves to an importer layer and is offered on.
- Decoys: of 23 non-editable anchors, 19 are offered as live fields (on), 1 is offered off and 3
  have no importer layer.
- lower-third-3, the outline-only negative, has one shape and no fields.

CI, on CI's Chromium 149.0.7827.55: in PR run 41208009662 (`4ddfebe3`) all 20 baseline tests
and every test of the refactored 51-file harness passed; `RECORDED_ON` still named this worker's
build, so the text-at-rest comparison was skipped there, and no fresh record was printed. With
`RECORDED_ON` set to CI's build, PR run 41208189216 (`ca48aa85`) compared it: Factory gates
passed with all 18 designs matching, text at rest included. On CI a different Chromium build now
fails the baseline instead of skipping it.

Mutation checks on this worker, reverted before commit: relabelling unnamed text (`Text ` to
`Text  ` in `svgImport.ts`) failed 4 designs naming the field and control lines; adding an
attribute to every text layer failed the 17 designs with text, naming `appearance.source`.

## Decisions and traps

- Reuse, not a copy: `svg-import-passes.test.mjs` now exports its browser pass (`RECORD`) through
  `recordInPage`, and when imported as `./svg-import-passes.test.mjs?library` it runs no corpus and
  registers no test. Its own run, records and snapshot are unchanged.
- Appearance is hashed in a canonical form (attributes sorted, namespace declarations dropped),
  because Chromium builds order namespace attributes differently. The text-at-rest record is
  compared only on the Chromium build it was recorded on (`RECORDED_ON`), which is CI's build.
- Trap: on this cloud image, Chromium 1243 stands in for Playwright's pinned 1228 (#1647).
  `svg-import-passes.test.mjs` fails 4 of its 22 tests here on untouched main (namespace order,
  text wrap); it is not a regression and CI is the judge.
- `svg-corpus-passes.json` is not in this row's files and was not touched.
- Read, not fixed: #1833 (question fit changes after attaching quiz behaviour) is in the quiz
  fit measurement, which this record covers at rest only; it stays open. Quarantine PR #1834 for
  `e2e/import-svg-corpus.spec.ts` is still open; this phase adds no e2e spec.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='Merge pull request #1858 ')"

It removes the baseline test and this file and restores the harness's previous shape.
