# Phase 40: Close evidence and prepare the release kit

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-19: "Full support matrix, exact-merge evidence, limits, spend, rollback/kill switch and owner
  trial kit accurately describe the delivered scope."
- Row 40: "Produce support matrix, rollout/rollback instructions, total spend, exact-merge receipts
  and an owner trial list. Demonstrate the kill switch and no-AI fallback; mark any unqualified
  capability honestly. A planning gate is not product acceptance; conclude implementation only
  after all required evidence passes. Physical studio acceptance remains separately labeled."

This file is the release kit. The spec names no other release-kit file, so everything is here.
Builder: Claude Code cloud worker for coordinator `session_017SdbwQ6d3pRaakjohGfCcC`, environment
`env_017nuiDZBW9smUNLdWVQK8cf`. Acceptance records only: no product source, test, workflow or
setting changed. No paid call, Gateway call or evaluation dispatch, and no holdout content read.

## In one paragraph

Dropping an ordinary SVG into Import graphic now gives a working graphic for all five families
(lower third, scoreboard, clock, quiz, end credits) and for score plus clock together, without a
mapping checklist. The importer asks one short question only where the drawing cannot say what the
author wants (which way a clock runs, or that a list is credits). All of this is done by ordinary
rules in the app, not by AI. The AI helper that was built to suggest the setup (Jev) did worse than
the rules on the held-out test designs, so it ships switched off. Total paid AI spend for the whole
run was $0.045931275 of the $5 ceiling.

## 1. Support matrix

"Supported" means proven by tests that ran on the matrix landing: main `2286c5c1` (PR #2044, row
39). Its runs, all green:

| Run | What it is |
| --- | --- |
| [41725517982](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41725517982) | CI, push on main, **full**: Build (it runs `test:ai-gateway`), Factory gates, E2E 15 of 15 (full), CI gate. Attempt 1 failed only in E2E 1/15 at `e2e/editor-canvas-transforms.spec.ts:270`, the open flake #1750 that this plan never touched; that spec went to quarantine from this run (`e2e/quarantine.json`), and attempt 2 re-ran that one shard green. |
| [41725517940](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41725517940) | configured-suite, push: the whole configured set, four shards on a local backend |
| [41725517943](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41725517943) | Quarantine: `e2e/import-svg-credits.spec.ts` (quarantined since 2026-11-03, #1988) |
| [41725517949](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41725517949) | Post-landing |
| [41724606556](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41724606556) | CI, merge group (the merge as tested before landing) |

Below, "CI" means run 41725517982, "configured" means 41725517940 and "Quarantine" means
41725517943. The test names are those in phase 39's per-criterion table, which this matrix is built
from.

| Family and mode | Status | What the author and operator get | Proving tests (run) | Known limits |
| --- | --- | --- | --- | --- |
| Lower third | Supported | Drop, Finish, save. Name and role are fields; nothing is asked. | `e2e/jev-svg-preparation.spec.ts`, `e2e/import-svg.spec.ts` (CI) | Text turned into outlines in the drawing has no text to edit: it stays fixed artwork, with re-export help shown. |
| Scoreboard | Supported | Figures arrive as + and − steppers; +1 flashes the right team once. | `scripts/imported-score-event.test.mjs` (CI, Factory gates); `e2e/import-svg-behaviour.spec.ts` (CI); `scorebug-output.spec.ts` (configured) | #1908: an output restarted from its report shows no flash until the next +1. |
| Clock, counts up | Supported | One Clock choice; Start, Pause, Reset, correction. | `imported-match-clock`, `imported-clock-wire`, `air-state` node tests (CI); `e2e/playout-clock.spec.ts` (CI); `scorebug-output.spec.ts` (configured) | #1886, #1887, #1906, #1884. |
| Clock, counts down from its time | Supported | Starts on Take, holds at zero. | as above | #1903: Reset or Pause before the first Take keeps the old length. |
| Clock, counts down to a set time | Supported | Midnight, summer-time change and past targets handled. | `scripts/clock-target.test.mjs` (CI) and the clock tests above | #1898: an undated target that passes into a summer-time fold. |
| Quiz, standard | Supported | Select answer, Lock it in, Reveal correct; nothing asked for a recognised quiz. | `e2e/import-svg-behaviour.spec.ts` (CI); `imported-quiz-output.spec.ts` (configured) | #1917 (see no-Lock). |
| Quiz, no Lock | Supported | Tick "No lock at all": Select, Reveal, Reset, no Lock control or timer. A second author can switch a saved quiz. | `scripts/quiz-no-lock.test.mjs` (CI); `e2e/import-svg-behaviour.spec.ts` (CI); `imported-quiz-output.spec.ts` (configured) | #1917: the automatic proposal never suggests no-Lock; the author ticks it. Unticking restores the earlier options only within one visit to the step. |
| Score plus clock together | Supported | Steppers need nothing; the clock direction is the one question. Score changes keep the clock; clock changes keep the scores. | `imported-score-event`, `imported-clock-wire`, `air-state` (CI); `scorebug-output.spec.ts` (configured); row 38 journey in `jev-svg-preparation.spec.ts` (CI) and `svg-import-journey.spec.ts` (configured) | Same as scoreboard and clock. |
| Credits, role above, roll | Supported, proven but not gated | One Credits choice; the list is picked and previewed at once. | rendering: `e2e/import-svg-credits.spec.ts` (Quarantine, 21 of 21); Sheet updates: `e2e/imported-credits-live-data.spec.ts` (CI); `imported-credits-model`, `imported-credits-source`, `credits-parser`, `credits-live-speed` (CI) | "Proven, not gated": while the rendering spec is quarantined (#1988), no pull request is blocked by it. #1937, #1955, #1965, #1969, #2033. |
| Credits, role above, hold still | Supported, proven but not gated | "Plays as: Hold still". A list too long for the page is not shown, and its field says so. | as above | as above |
| Credits, role above, cards | Supported, proven but not gated | "Plays as: Cards". A blank line starts a new card. | as above | as above |
| Credits, role beside, roll | Supported, proven but not gated | Roles in one column, names in the other, as drawn. | as above, plus the role-beside live-data walks (CI) | A names-first drawing reads roles and names swapped unless the column question is answered. |
| Credits, role beside, hold still | Supported, proven but not gated | as above | as above | as above |
| Credits, role beside, cards | Supported, proven but not gated | as above | as above | as above |
| Credits kept as fixed artwork | Supported | "Show as: Fixed artwork": the whole drawn block scrolls, nothing is editable. | `imported-credits-model` #1958 test (CI); `import-svg-credits.spec.ts` (Quarantine) | Graphics saved as fixed artwork before PR #1962 still move one layer until re-imported. |
| Linked Sheet: credits | Supported | Connect data, then a Sheet change reaches air under each playback's rule (roll and cards keep the list they took until the next Take; hold still shows it at once). Failure keeps the last good list; no AI per refresh. | `e2e/imported-credits-live-data.spec.ts`, `e2e/production-data.spec.ts` (CI); `production-data-key-tick.spec.ts`, `production-data-key-sheet.spec.ts` (configured) | |
| Linked Sheet: ticker (existing tickers) | Supported | The existing ticker follows the Sheet without a restart. | `e2e/ticker-linked-update.spec.ts` (CI); `ticker-speed`, `data-tick` (CI) | A drawn ticker gets no motion engine: unfamiliar moving artwork stays still (by design, spec). |
| Linked Sheet: multiline text | Supported | A text layer follows the Sheet in its drawn styling, without replaying motion. | `e2e/imported-text-live-data.spec.ts` (CI); `imported-text-source`, `content-formats`, `sheet-source` (CI) | #1977: a typed line break shows as a space on air. |
| Edit, save, reopen, reimport | Supported | Fields stay fields and animation targets; corrections, keys, bindings and controls survive. A moved or restyled layer is saved as a separate graphic, never silently merged. | `e2e/editor-fidelity-trim.spec.ts`, `e2e/import-svg-reimport.spec.ts` (CI); `panel-graphic-actions.spec.ts` (configured) | #1982 (a graphic with a behaviour cannot be keyed in the editor), #1986, #1987. |
| Export and receiving hosts | Supported in software | SPX, CasparCG and OGraf packages pass the existing isolated host tests; hosted clock recovery is shown on two outputs. | `e2e/ograf-lifecycle.spec.ts`, `e2e/spx-operator.spec.ts`, `e2e/ograf-parity.spec.ts` (CI); `scorebug-output.spec.ts`, `svg-import-journey.spec.ts` (configured) | Physical studio acceptance not claimed (section 9). #1886 is a lower bound from one machine. |
| Import and playout with every AI service down | Supported | See section 4. | `e2e/jev-svg-preparation.spec.ts` (CI); `api/_lib/aiDecisionGateway.test.ts`, `aiTaskRegistry.test.ts` (CI, Build) | #2034 (image analysis, not SVG). |
| Three notice zones, each on and off alone | **Not supported** | Each zone's words can be changed alone; the zones cannot enter or leave separately. | row 38 diagnostic in `jev-svg-preparation.spec.ts` (CI) | Optional challenge **not passed** (section 8). |
| AI preparation of SVG (Jev) | **Off, not qualified** | Nothing: no switch or copy offers it. | section 2 | |

The baselines (AC-3) held on the landing: `scripts/jev-svg-baseline.test.mjs` and
`scripts/svg-import-passes.test.mjs` ran in Factory gates and nothing was re-recorded during the
run (phase 39, "Intentional snapshot changes": none).

## 2. The AI route (model preparation): off

- **Verdict: no go** (row 34, holdout run
  [41643649692](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41643649692)). The
  pre-registered model, structured Jev 1.14, made more consequential errors than the app's own
  rules in quiz (0 to 5) and credits (3 to 6). The rule was: any increase in any family means no
  go. So no family is named.
- **Shipped disabled in code.** `api/_lib/svgInterpretation/analyze.ts` sets
  `MODEL_ROUTE_QUALIFIED = false` and `ADMITTED_FAMILIES = []`. The route
  `POST /api/ai/tasks/svg-interpretation` answers `503 profile_disabled` with
  `fallback: 'deterministic'` before it reads anything, whatever the deployment's env flag says.
  No screen calls it.
- **The holdout is used up.** Its 18 designs are now regression evidence only. They can never
  again qualify the model.

What turning it on would need (items 1 to 7 are row 35's list, unchanged; item 8 is added here; none of it is built):

1. A **new, independent holdout** that qualifies named families. The exposed one cannot. Row 34's
   reporting-only Elephant and Haiku numbers are not a selection.
2. `MODEL_ROUTE_QUALIFIED` true and `ADMITTED_FAMILIES` naming only the qualified families, with a
   rule for which field answers apply when only some families are admitted. This is a reviewed
   code change, not a setting.
3. An opt-in in the wizard where the draft lives (`CreationWizard.tsx`), cancelling the request on
   a new drop, a clear or leaving the step, and applying through `svgDraftWithProposal`.
4. `AI_SVG_DISCLOSURE` matching what is sent: reader ids, kinds and hierarchy as well as names,
   positions and text lengths. Today it is shown nowhere.
5. `import-analysis-outcome` refusing SVG generations, or an SVG outcome of its own; and a decision
   on whether one shared allowance is right (a separate one needs a migration and an owner
   decision).
6. The env flag, the provider allowlist and a qualified zero-data-retention entry for the route.
7. A `maxDuration` for `api/ai/tasks/[...path].ts` in `vercel.json` that covers two attempts at the
   configured timeout, or a shorter timeout.
8. Fixing #2034 first is advisable (kill switches ignored on a failed settings read; see section 4).

Data disclosure: while the route is off, no artwork, layer name or text leaves the app for an AI
provider during an SVG import. The separate, older image-analysis feature (raster images) is
unchanged by this run and keeps its own server flag and notice.

## 3. Rollout and rollback

**What is live by default.** Everything in section 1 marked Supported is on `main` and goes out
with the normal deploy of `main`. There is nothing to switch on. The AI route stays off.

**Publishing and export are the existing ones.** Import graphic, then Finish saves the graphic
into a production. On the production page an operator prepares, Takes, Updates and takes Out as
for any graphic. Packages for SPX, CasparCG and OGraf come from the existing export, unchanged in
how they are made.

**To stop the AI part:** it is already off (section 4 lists the three switches).

**To roll back a row.** Each row landed as one merge commit (section 6). On a fresh branch from
`origin/main`, never on `main` itself:

    git fetch origin main
    git checkout -b claude/revert-jev-row-NN origin/main
    git revert -m 1 <merge sha of that row>

Then land it with `/queue-merge` (the merge queue), like any change. Rules for doing it safely:

- A revert changes code only. Saved graphics, their drawn source, keyframes and Sheet bindings are
  user data and are never edited or deleted to make a rollback simpler.
- Prefer a forward repair when a row added something a saved graphic stores (row 7's clock
  instance, rows 16 to 20's credits bindings, PR #1962's `artworkLayers`). Before reverting such a
  row, check that the older code still opens a graphic saved with that field without dropping it.
- Revert the newest dependent row first. Rows 37 to 39 add only tests and notes, and row 35 only
  the switched-off route, so reverting them changes no user-visible behaviour. Reverting row 36
  puts back the older clock and credits wording and the explicit credits pick.
- No plan row added a database migration, so no rollback needs one. (The migrations 0106 to 0108
  that landed during the run came from other work.)

## 4. Kill switch and no-AI fallback, demonstrated

Three independent switches keep SVG AI preparation off. Each is shown by a test, with stubs and
mocks only; production was not probed.

| Switch | Where | Shown by |
| --- | --- | --- |
| The code verdict | `MODEL_ROUTE_QUALIFIED = false` | e2e "the model route is off: it refuses before reading, and an SVG drop asks it nothing": with the env flag set, a working ledger and a stubbed model ready to answer, the route answers `503 profile_disabled`, `fallback: 'deterministic'`; the model is sent nothing and nothing is booked; the dev server's real dispatcher gives the same refusal; a dropped SVG asks the route nothing. Node "a database error cannot turn the disabled SVG route on": with `AI_TASK_SVG_INTERPRETATION_ENABLED=1` and the database unreachable, the same refusal with no database read and no model call. |
| The env flag | `AI_TASK_SVG_INTERPRETATION_ENABLED`, off unless set | Node "the SVG interpretation task is registered, off by default, and fails closed until configured"; the database-error test above (flag off: refused as `disabled`, nothing read). |
| The admin kill switch | `system_settings.disabled_routes` | Node "off, misconfigured, unknown route, unknown price or switched off: refused before anything is sent". |

No-AI fallback: e2e "with every AI route failing, an SVG import is saved, taken to air and
exported, and no secret reaches the browser". Every `/api/ai/**` request fails at the network; the
browser client answers quota, service, network and garbage replies with the deterministic
fallback; a lower third is dropped, asks nothing, is saved into a production and taken to air with
its name and role; it compiles to SPX, CasparCG and OGraf packages with no AI reference; and no
server-only key name reaches any script the page loaded.

Runs:

- On the matrix landing `2286c5c1`: CI run 41725517982 ran both e2e walks (E2E full) and the Node
  tests in the Build job (`test:ai-gateway`, 32 files).
- On this branch, by this worker: `npm run test:ai-gateway`: 445 pass, 0 fail, 13 cancelled (the
  hung-lookup cases of the import-analysis status suite, which end when the event loop drains;
  phase 39 counted 13 skipped; none is this plan's). The Build job on the landing reports
  `test:ai-gateway ok`. Both e2e walks through the job
  queue (j-0001): 2 of 2 pass.

Limit, stated: **#2034 (P2)**. For the live image-analysis feature, a failed settings or plan read
lets it ignore an admin kill switch or an account limit (inside its quotas and fleet spend). The
SVG route is not exposed to this: it refuses before any such read. Fix before turning any AI route
on.

## 5. Total spend

Read again from the ledger artifact of the newest paid run, 41643649692 (`jev-svg-eval-ledger`,
artifact 13233764337, kept to 2027-02-01). It holds every batch of the run since the baseline;
no later run of `jev-svg-eval.yml` exists.

| Part | Batches | Attempts | Settled USD | Cap USD |
| --- | --- | --- | --- | --- |
| Development (row 33) | 79 | 212 | 0.030907239 | 2 |
| Holdout (row 34) | 36 | 72 | 0.015024036 | 3 |
| **Total** | 115 | **284 of 500** | **0.045931275** | **5** |

- No top-up was acknowledged (`acknowledgedTopUpUsd` 0). The baseline (run 41619730746, balance
  6.936136654) was never reset.
- Every paid call ran only in the protected `jev-svg-eval.yml` on `main`. Rows 35 to 40 made none.
- The gateway also charges $0.000075 per request that its reported cost leaves out (#2015); the
  settled figures above include it.

## 6. Exact-merge receipts

One line per row. Verdicts are the independent checker's comment on each PR (URL form
`https://github.com/NoaCG/NoaCG-Studio/pull/<PR>#issuecomment-<id>`). Every merge subject reads
"Merge pull request #PR from NoaCG/claude/plan-jev-svg-import-NN-build".

| Row | PR | Merge SHA | Checker verdict | Comment |
| --- | --- | --- | --- | --- |
| 1 | #1851 | `0b4e403da1f4762dee874e3fed18c29eb0497116` | PASS | 6542688652 |
| 2 | #1853 | `7f0a00baadea97b14073ec7c48fbb796ddd8da13` | PASS | 6544011578 |
| 3 | #1858 | `aa84e1e4e00fed784ec3e1d89af879aa948e866a` | PASS | 6545139496 |
| 4 | #1860 | `aa14e8650379ae1a9735b07317418d41c2faeee4` | PASS | 6546126496 |
| 5 | #1864 | `e99aa2d4aeb37794d2e6b37cd3bf50c8fcedd030` | UNAVAILABLE (configured shard, infrastructure, #1865), then PASS after attempt 2 | 6547453772, 6547601430 |
| 6 | #1870 | `874c589b4df4449ba8819c784c6d1da983d33166` | PASS | 6548841447 |
| 7 | #1878 | `c469facba90f6ed04cb29b9ef5ac7b23d72e7ec3` | PASS | 6550084565 |
| 8 | #1883 | `562452968ee7e1bd271329420d153b93b1912510` | PASS | 6551136067 |
| 9 | #1888 | `e6eadadcc4ec745ebb51dbca7248c62bc61981c5` | PASS | 6553218097 |
| 10 | #1893 | `2518b42919123eefd876259f6ba009999ed2b2b4` | PASS | 6554304304 |
| 11 | #1899 | `7030eb18dcceef18243e0dc3e937a2b7ef51918e` | PASS | 6555622794 |
| 12 | #1909 | `a961bec063354da0ad5af6460367a840396b798b` | PASS | 6558095706 |
| 13 | #1916 | `043fcccb08313e321dbfe6ef1c633f37d98a8eaf` | PASS | 6558777929 |
| 14 | #1919 | `d7b4927b87f037a74411883b69a6282b780b9c19` | PASS | 6563703885 |
| 15 | #1933 | `e680acd1889a2d4d70a754fecebcb6b87f369787` | PASS | 6564677951 |
| 16 | #1938 | `0c623501a16914b6a05347cc2c96701fe20424e0` | PASS | 6565735792 |
| 17 | #1947 | `da7ba5ef0828ab6a8ec6f3402ad620fe5b00d998` | PASS | 6566651618 |
| 18 | #1950 | `516ec2c9615c595dc1b8f32010930af7fee3a5a9` | FAIL (one AC-23 part), then PASS on the remaining scope after the owner moved that part to row 19 | 6567775436, 6569243589 |
| 19 | #1956 | `bc9be3b683654a681ce197bb13eedce9367ce98b` | PASS | 6570676627 |
| 20 | #1959 | `7b404d3241240fc96a257bd9baeb035f4dbf718e` | PASS, with coordinator-accepted departures (#1958) | 6573633419 |
| 21 | #1966 | `d6eb976501ecf9d472d5055c86d49bc191ef052e` | PASS | 6576204460 |
| 22 | #1972 | `8fa8504c07538a97469c2250a2255e8983df3955` | PASS | 6577857622 |
| 23 | #1974 | `7b95dcb7ac5d1976fb0fcd5efd365e89e9e659cc` | PASS (configured attempt 1 infrastructure, #1865; attempt 2 passed) | 6580888759 |
| 24 | #1978 | `8f7781d6653269a285e4be2b8f45346b59b4fdaa` | PASS | 6583357127 |
| 25 | #1981 | `d3e28a8dd9ff42f74a9a7f94fbb166f2291b6d89` | PASS | 6585685727 |
| 26 | #1983 | `462db50cc2aa7cc13e07cf05e8e74d1c8da7b99d` | PASS | 6587153531 |
| 27 | #1985 | `9a06d3850289d4221c46cdcd251b00a628154f3a` | PASS | 6592154944 |
| 28 | #1993 | `5dbc3f642c7cb848cdb15665e04a75b6945bfdb6` | PASS | 6593490420 |
| 29 | #1996 | `83c21c3fd1c32a802052ac93720d4be0073cceab` | PASS | 6594558154 |
| 30 | #2000 | `ea0eaa119e891def97d6db15151a644280613e74` | PASS | 6595670064 |
| 31 | #2002 | `0a99d37cfd5ac533e7580a495b81d81f699d0e0e` | UNAVAILABLE, "the product passes": Post-landing attempt 1 could not reach the production database. Attempt 2 of run 41590230155 succeeded; no checker comment re-reads it | 6597313184 |
| 32 | #2005 | `531f856e13379ccffe8edc2df381cf6c2503f393` | PASS | 6601047960 |
| 33 | #2023 | `5018062c06ec99a893200ab7d50ff18b20e65ca8` | PASS, with stated gaps, none blocking | 6604730507 |
| 34 | #2029 | `3215c7ac731f463c8e6d056612ec8f29b5db8d0e` | PASS (the decision it records is no go) | 6606232911 |
| 35 | #2030 | `6d695e97c8d67f82f741d65b4e69ec7cec63653a` | PASS | 6607857397 |
| 36 | #2032 | `7f5b5b8e54196b07e5b6f016464728d7de7673fd` | PASS | 6610253212 |
| 37 | #2035 | `dce1ef71e546f5077ec5767176f99b0dccc5a6c7` | PASS | 6612248496 |
| 38 | #2038 | `8b5ca96ffeca0cd6f63a0d27ccbe24ea2b5fb038` | PASS (backend capacity exception on #1850) | 6614977004 |
| 39 | #2044 | `2286c5c14c2301a7463570fe66fbc453fcf2f17b` | PASS (first posted FAIL on CI attempt 1, the #1750 flake; edited to PASS after attempt 2) | 6616734290 |

Fix PRs on the run, outside the row order: #1962 (fixes #1958), merge
`ca4d037d2ce2bfe7202eea822184da4c1039f43e`, read-only `/so` A- with no blocking point, checked again
by row 21's checker; #2018 (fixes #2017), merge `4130a081f35f70e4d05dff3b314863127aec465b`, `/so`
A on its final head, accepted by the evaluation's `accept_manifest` run 41630691746.

Row 31 is the one row whose checker verdict stayed UNAVAILABLE. The failed part was the
Post-landing migration step, which had no migration to apply; its re-run passed. That is recorded
here, not upgraded to PASS on the checker's behalf.

## 7. Limits

- **Backend test capacity exception.** The hosted journey spec `svg-import-journey.spec.ts` runs
  under a 30-day backend-tier exception (`jev-svg-import-journey` in
  `scripts/growth-ceilings.json`), approved by the owner, **expires 2026-12-03**, repayment #1503
  (re-record the test shard durations). After it expires the CI gate may refuse a change that
  selects that spec until #1503 lands or the exception is renewed.
- **Credits rendering is proven but not gated** while `import-svg-credits.spec.ts` is quarantined
  (#1988). It runs on every landing in the Quarantine workflow and leaves quarantine after
  consecutive passes.
- **Held-out numbers describe the landing by unchanged inputs, not by re-scoring** (phase 39).
- **The holdout corpus is synthetic and single-author**: a pilot verdict, not a population claim.
- **Local browser differences** (#1647, closed): a cloud worker's newer Chromium can differ in a
  few pixel records; CI on the pinned browser is the judge.

## 8. Unqualified, marked honestly

These are not claimed by this run:

- **Image comparison**: every image-model request was refused with HTTP 400 (#2022, P1). The
  "relevant vision" comparison of AC-7 is a stated gap.
- **Jev with pixels**: never run (#2006).
- **Three notice zones (optional challenge): NOT passed.** Each zone's words can be changed alone,
  but zones cannot enter, leave or hide separately; that would need per-zone states, which the
  spec rules out. #2041 asks for the diagnostic to assert those limits.
- **Row 38 checker notes** (comment 6614977004, on `score-clock-3`): the operator labels are raw
  layer ids (`object0` to `object4`, and `timer` on a caption), and decorative text ("TOURNAMENT
  24", "Next fixture") is offered as editable on air. An operator-clarity gap, not a failure of
  AC-26.
- **Physical studio acceptance**: section 9.
- **Open issues that limit support** (all open on 2026-11-03):

  | Issue | Priority | What it limits |
  | --- | --- | --- |
  | #1886 | P2 | Imported clock Take or correction on the hosted fast road is stamped per output |
  | #1887 | P2 | Exported control panel: imported clock verbs get no wire stamp |
  | #1898 | P3 | Target time: an undated target passing into a summer-time fold |
  | #1903 | P3 | Duration: Reset or Pause before the first Take keeps the old length |
  | #1906 | P3 | Program monitor forgets an off-air imported clock on reload |
  | #1908 | P2 | Score board: which team flashed is lost on output restart |
  | #1917 | P3 | The proposal cannot suggest the no-Lock quiz |
  | #1937 | P2 | An existing imported graphic cannot be switched to styled credits |
  | #1977 | P3 | A line break in a Sheet value shows as a space |
  | #1982 | P3 | Editor: a graphic with a behaviour cannot be keyed |
  | #1986 | P3 | Reimport: "Edit this graphic" opens the unreconciled build |
  | #1987 | P3 | Reimport: three safe edges left after row 27 |
  | #2033 | P3 | Credits picker words overstate the single-text case |
  | #2034 | P2 | Image analysis ignores kill switches on a failed settings read |
  | #2041 | P3 | Row 38 journey: assert the notice-zone limits, clean up the hosted walk |

  Also open and minor: #1876 (old Countdown kind beside Clock), #1884, #1955, #1965, #1969,
  #1988 (the credits flake), #2015 (gateway fee).

## 9. Physical studio acceptance (separately labelled, not claimed)

Every result above is from software: browsers, local backends and the existing isolated receiving
host tests. Nothing was tried on a real studio playout machine, CasparCG server, SPX server or
broadcast output. That is the owner's to do, if wanted, with the trial list below on real kit. It
is extra evidence, not a missing phase.

## 10. Owner trial list

Files are in `e2e/fixtures/jev-svg/dev/` (and `qualification/` for the last one). In the app:
Import graphic, drop the file, then:

1. **Lower third**, `lower-third-1.svg`: Skip to finish, save. The name and role are editable on
   the production page; nothing was asked.
2. **Scoreboard**, `scoreboard-1.svg`: Skip to finish, save, Take. Each score has + and −; +1
   flashes that team once.
3. **Quiz**, `quiz-1.svg`: Skip to finish, save. Select answer, Lock it in and Reveal correct are
   there.
4. **Quiz without Lock**, `quiz-1.svg` again: tick "No lock at all", save. Only Select, Reveal and
   Reset are there.
5. **Credits, role above**, `credits-1.svg`: Behaviour, pick Credits. The preview shows Research
   and Sound with their names at once. Try "Plays as": Roll, Hold still, Cards. Save; the credits
   are one box to edit.
6. **Credits, role beside**, `credits-2.svg`: as above. Roles stay in one column, names in the
   other.
7. **Clock**, `clock-1.svg`: "What it does" says the time stays as typed. Pick "Counts down from
   its time", save, Take: the clock counts down from 07:45. Also try "Counts up" and "Counts down
   to a set time".
8. **Score plus clock**, `score-clock-1.svg`: pick a Clock mode only; the scores need nothing.
9. **Linked Sheet**, `qualification/multiline.svg`: save into a production, press "Connect
   data…", paste a Google Sheet link, Take, then change the Sheet: the text on air changes in the
   drawn look without restarting its motion.
10. **Export**: from any saved graphic above, export SPX, CasparCG or OGraf and load it in your
    playout. (On real studio kit this is the physical acceptance of section 9.)

## Corrections made to earlier records

- `phase-39.md`: it called `8b5ca96f` the immutable landing. That is the base row 39 tested on
  (row 38's merge). Row 39 itself landed as `2286c5c1`; its push runs are added there. Also,
  `test:ai-gateway` runs in the Build job (`scripts/run-ai-gateway-tests.mjs` is `gate: build`),
  not in Factory gates; corrected there.
- `phase-20.md`: its "no deliberate fixed-artwork choice yet" was superseded by PR #1962 (closes
  #1958). A note is added there (PR #1962's `/so` point 2).

## Phase notes

- **Pinned main.** Worktree from `origin/main` `b4870de1fa17ce6f338681f31c83efed90c87d25` (PR
  #2045, a quarantine entry). The last verified plan landing is `2286c5c1` (row 39). Previous
  verified main: `b4870de1`.
- **Revert** after it lands, on a fresh branch from `origin/main`, through the merge queue:

      git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-40-build')"

  It removes these notes and the two corrections only; no product behaviour changes.

## Decisions

- **The kit lives in this one file.** The spec names no separate release-kit file, and the brief
  allows acceptance records only. Copying it to a second place would make two texts that drift.
- **The kill switch is shown by the existing tests, not new ones.** Rows 35 and 37 already wrote
  the walks that prove each switch; row 40 may not change tests. This row ran them again and cites
  the landing's runs.
- **Row 31 stays UNAVAILABLE in the receipts.** Its re-run passed, but no checker read it; the kit
  says both instead of upgrading the verdict.
- **Rollback advice prefers a forward repair for rows that store new fields**, because the spec
  forbids discarding authored data to simplify a rollback.
- **Spend read from the ledger artifact itself**, not copied from phase 34.

## Verification

- `npm run test:ai-gateway`: 445 pass, 0 fail, 13 cancelled (not this plan's, as above).
- `e2e/jev-svg-preparation.spec.ts -g 'model route is off|every AI route failing'` through the job
  queue (j-0001): 2 of 2.
- Ledger artifact 13233764337 summed by partition: development 79 batches, 212 attempts,
  0.030907239; holdout 36, 72, 0.015024036; no top-up.
- Runs on `2286c5c1` read through the Actions API, jobs listed (CI attempt 2 jobs all success or
  skipped as planned; configured four shards; Quarantine includes `import-svg-credits.spec.ts`).
- Every cited issue's state re-read on 2026-11-03.
- Checker comments for rows 1 to 39 read on each PR.

## Traps

- A checker comment can be edited from FAIL to PASS after a re-run (row 39); read its current
  text and its update time, not a notification.
- The evaluation report's `spend` block is cumulative; take a partition's spend from the ledger's
  batches.
- The import-analysis status suite cancels 13 hung-lookup tests when the loop drains; they show as
  "cancelled", not failed.
