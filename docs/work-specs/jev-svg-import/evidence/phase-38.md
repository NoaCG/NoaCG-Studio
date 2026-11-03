# Phase 38: Rehearse the complete unfamiliar-artwork workflow

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-26: "A fresh independent checker imports unfamiliar labeled fixtures, corrects only a material
  ambiguity, previews, saves, prepares, takes, updates, takes out, reopens, and replaces artwork
  through existing UI. Verify off-air draft changes do not alter on-air state before existing
  explicit apply/Take. Disconnect and recover the isolated software output; distinguish command
  acceptance, observed renderer state, visual fidelity and package conformance. Exercise three
  independently operated notice zones with existing primitives as a bounded diagnostic; report
  unsupported composition without inventing a new engine or claiming that optional challenge
  passed. No competitor or licensed host access is needed."

Builder: Claude Code cloud worker for coordinator `session_017SdbwQ6d3pRaakjohGfCcC`, environment
`env_017nuiDZBW9smUNLdWVQK8cf`. Tests and these notes only. No product file changed, no model,
paid or Gateway call (row 34 gave no go, so the SVG model route stays off), and the holdout was
not read.

## Pinned main

Worktree from `origin/main` `dce1ef71e546f5077ec5767176f99b0dccc5a6c7` (PR #2035, row 37).
Previous verified main: that SHA. Revert this row after it lands, on a fresh branch from
`origin/main`, through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-38-build')"

Tests and notes only; nothing persisted changes and there is no migration.

## How a fresh checker runs it

- Offline half, on any worker:
  `node scripts/jobs.mjs add "npm run test:e2e -- e2e/jev-svg-preparation.spec.ts -g 'row 38'" --cap 5`
- Hosted half: `e2e/configured/svg-import-journey.spec.ts`, on a local Supabase stack. A pull
  request that changes it runs it in ci.yml's configured job: the planner selects an edited
  configured spec by its own name (`planFor` gives mode `subset`, configured specs
  `['svg-import-journey.spec.ts']`). Later it is selected by its `covers:` line
  (`src/templates/importedDesign/svg.ts`, `svgBind.ts` and what they import), and the whole set
  runs on every landing. No selector, workflow or Playwright config was edited.

## The artwork

`e2e/fixtures/jev-svg/dev/score-clock-2.svg`, a labeled corpus design no earlier walk used (rows
29 and 36 used `score-clock-1`). Polish layer names, two look-alike `Nazwa` name layers and two
look-alike `Wynik` score layers. Measured before writing the walk, the drop gives five fields, + and
− for both scores, and one open question: the clock's direction. That is the one material
ambiguity, and the walk answers only it (count up). The diagnostic uses
`qualification/notice-zones.svg`.

## Each part of AC-26 and its proof

| Part | Where | What is read |
| --- | --- | --- |
| Import unfamiliar labeled fixtures | offline walk, configured walk | `score-clock-2` and `notice-zones` dropped through the existing Import door |
| Correct only a material ambiguity | offline walk | the summary names only the clock; the clock mode is the one change; "5 of 5 editable on air" untouched |
| Preview | offline walk | the wizard's own preview shows `Wrzos` and `Mech` |
| Save | offline walk | the ordinary Finish into a new production |
| Prepare, off air | both | a typed name is a draft: nothing on air, the program monitor's loaded document not showing (opacity) and not holding the draft; on the isolated output nothing is mounted visibly before Take |
| Take | both | command acceptance: the log says Took. Renderer state: the prepared name is in the renderer's document |
| Update; an on-air draft stays off air until the explicit Update | both | a typed change shows "not on PROGRAM yet" and air keeps the aired value for a held second, then Update moves it. A live stepper is its own explicit apply and does not replay the entrance (one "Played in") |
| The corrected ambiguity works | offline walk | Start counts up from the drawn 00:00 |
| Take out | both | "nothing on air"; on the output the graphic's opacity falls below 0.1 |
| Reopen | offline walk | after a reload the production holds the prepared and aired values |
| Replace artwork | offline walk | a recoloured version imported under the same name: Finish says only that it saves over the held name (no unresolved list), the library still holds one graphic, the cue keeps its values, and Take airs the new dial colour with every other plate unchanged. Row 27's matcher is reused, not re-proved |
| Disconnect and recover the isolated software output | configured walk | `/output` in its own browser context. (1) Network cut (`setOffline` on that context): a stepper press is accepted by the operator's page, and after the network returns the output shows it. (2) The output page closed (a crashed or restarted box): a press is accepted with no output open; a fresh output boots into every accepted value, not the first Take |
| Command acceptance | both | the operator page's activity log and field values, read before and apart from any renderer |
| Observed renderer state | both | the program monitor's document offline; the isolated output's document on the hosted run |
| Visual fidelity | both | the drawn plates' computed fills, in the source's order, on the renderer (and after the replacement, only the dial changed); screenshots attached to the run. Pixel parity with the studio frame is `e2e/ograf-parity.spec.ts`'s (row 29), not claimed again here |
| Package conformance | offline walk | the saved graphic's OGraf package passes the existing `validateOgrafPackage` before and after the replacement |
| No competitor or licensed host | both | none used |

What the network-cut step does not claim: whether a press reached the output while it was cut off.
Chromium's offline emulation may leave an open socket alone, so the walk records what the output
showed meanwhile as the `output-recovery` annotation instead of asserting it. The restart step is
the hard proof: no open socket survives a closed page.

## The optional challenge: three notice zones (bounded diagnostic, NOT passed)

Measured with the existing primitives only, recorded as the `notice-zones` annotation:

- **Works:** each zone's body is its own text field. Changed through the ordinary staged Update,
  one zone at a time, the other two stay as they were (3 of 3); a body cleared to nothing clears
  only its words.
- **Unsupported:** a zone's own entrance, exit or visibility. No control is offered per zone, the
  plates are the artwork and are drawn whenever the graphic is on air, and Take and Out move all
  three together. Independently operated zones would need per-zone states, which the spec rules
  out ("cannot justify a hidden generic behavior engine"). No engine was added, and the challenge
  is reported as not passed.

## Decisions

- **Two halves, one journey.** The offline suite has no `/output` (it needs the cloud backend), so
  the hosted half sits in a configured spec, and the rest stays offline where it runs in under 20
  s on any worker. The configured walk repeats only import, Take, Update and Out, which it needs to
  have something on air.
- **Package conformance is offline only.** It is a pure function of the saved template; reading
  it again on the hosted run would add time and no evidence.
- **Visual fidelity is read as the source's fills on the renderer**, not as a new screenshot
  baseline: a baseline would be a new snapshot for a reviewer to keep, and row 29's parity spec
  already compares frames.
- **`import-svg-reimport.spec.ts` and `configured/panel-graphic-actions.spec.ts` are unchanged.**
  Row 27's replacement rules and row 28's panel dispatch hold as they are, and the journey reuses
  them through the UI rather than adding cases to those files.

## Verification

- `e2e/jev-svg-preparation.spec.ts` through the job queue: 14 of 14 (12 before, 2 new), twice
  (j-0005, j-0009).
- Mutation: every typed cue edit also pressing Update (a temporary patch to `editDraft` in
  `ProductionPage.tsx`, reverted) fails the journey at the on-air draft check
  (`#f2` should still read `Mech`, j-0008). The first version of that check read air at once after
  typing and missed a push 300 ms later (j-0007); it now holds a second first.
- `npx eslint` on both specs: clean. A one-off strict `tsc` over both specs (e2e is outside the
  project's tsconfig): no errors in them.
- `npm run gates -- run --changed origin/main`: 34 of 34. `node scripts/check-e2e-protection.mjs
  --changed origin/main`: OK. `node --test scripts/configured-selection.test.mjs
  scripts/configured-shards.test.mjs`: 24 of 24 (the new header parses; the spec lands on one shard).
- The configured spec cannot run here (no Docker daemon for a local stack); its result is the PR's
  configured selection in CI.

## Traps

- The production page's program monitor keeps the graphic's document loaded while off air, so
  "nothing on air" is not "no element": read opacity and the absence of the draft.
- The in-app OGraf export wraps the package in one folder; `validateOgrafPackage` wants file names
  relative to the manifest.
- A check that a draft did not reach air must wait a beat: a leak through the debounced draft
  arrives a few hundred milliseconds after the keystroke.

## Review rounds

- PR review bot on `f1781999` (PR opened): one P1, class faulty test expectation, family
  duplicate renderer command (e2e/AGENTS.md: assert a replayed entrance as arithmetic). The
  "no replayed entrance" check read the activity log, which a replayed `play` would not change.
  The walk now reads the program stage's own `data-plays`: 1 after the Take, still 1 after Update,
  a stepper and Start. A temporary Re-take press in the walk fails it (received 2, j-0011).
- CI on `f1781999` (run 41698137745): configured selection triggered, subset, 1 spec
  (`svg-import-journey.spec.ts`). It failed at the on-air draft step, class faulty test
  expectation: a published production's note reads "1 change not on air yet. Press ✎ Update",
  where the offline monitor says "not on PROGRAM yet" (`CueEditor.tsx`, `rehearsing`). Every step
  before it passed on the real output: nothing visible before Take, Take, the prepared name on the
  output and the source's fills. The walk now expects the published wording.
- `/so` on `f1781999` (`session_017SdbwMKVroFdqpNTEfW77w`, separate read-only cloud session):
  AGREE WITH CORRECTIONS, grade A-, nothing blocking. Taken: (2) the hosted "nothing before
  Take" reading could come from an output that never booted, so the walk first waits for the
  output's own READY answer (`readyOf`); (4) the replacement re-answers the clock, and the walk
  now shows Start still counting on the replaced graphic. Left as documented limits: (1) the
  network cut may not close an open socket, so the restart is the hard recovery proof (stated
  above); (3) the hosted draft check holds 1.5 s, the offline walk carries the mutation-tested
  version of the same rule. (5) and (6) are the checker's and CI's to show, not the walk's.
- Final `/so` on `9eaa67d0` (`session_017SdbwMVZr8UVAMefhBBGRE`): AGREE WITH CORRECTIONS, grade
  A-, nothing blocking. Points 2 (assert the diagnostic's limits) and 4 (cleanup in a
  `try/finally`) are filed as #2041; points 1 and 5 are the limits stated above; point 3 is the
  plan's checker step. (`session_017SdbwPGZoFtVEaNrw13yEh` was interrupted before it read anything
  and gave no verdict.)

## Budget exception (approved boundary departure)

CI run 41699782672 on `9eaa67d0` passed every test (the configured walk took 20.2 s). The CI gate
refused on the E2E capacity line: the backend tier was already over its line before this change
(119% in CI), and a new configured file is priced at the flat new-case estimate, 6.8 per landing
and 4.1 per day. A work-spec `## Budget exceptions` line covers only the offline tier: tried
locally, it added two offline refusals, so it was not committed.

The owner approved a 30-day backend-tier exception, reviewed by the coordinator before landing
(https://github.com/NoaCG/NoaCG-Studio/issues/1850#issuecomment-6613666839). This change adds one
entry, `jev-svg-import-journey`, to `scripts/growth-ceilings.json`: covers
`spec:e2e/configured/svg-import-journey.spec.ts`, 6.8 per landing, 4.1 per day (the gate's own
prices), from 2026-11-03, expires 2026-12-03, repayment #1503. Nothing else in that file changed.

With the entry in place the gate still refuses, by its own Rule X9
(`scripts/growth-controls.mjs`, `assessTiers`): while a tier's evidence is not complete "the room is
unknown, so nothing is waived". The backend evidence is partial (no weekly growth report published,
durations table stale per #1503). The gate's words, locally:

> backend tier refuse: 107.4/117 per landing, 62/78 per day (92%), jev-svg-import-journey excepts
> 0/landing (claims 6.8, capped at what it covers) to 2026-12-03; evidence partial: ...; this change
> adds 6.8/landing 4.1/day, reaching 98%, at or over the 85% line that partial or stale evidence sets

So the exception is on record and takes effect once the backend evidence is complete. The gate and
its rules are unchanged.
