# Phase ci06: complete selected configured PR checks

Row ci06 of the [cicd-improvement spec](../spec.md) (P1c; AC-6). Built 2026-10-31 by the ci06
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`11523106a407cb856e619e0d4ddbbfa3785d5739`. It turns the planner's configured flag into a
selected, required PR check and reconciles the plan-run instructions with it. AC-6 as a whole
stays open: its three-plan cohort is ci14.

## 1. What was there

- The planner raised a boolean `configured` when a changed file matched a configured spec's
  `covers:` line or the suite's own files, and printed "run it locally". Nothing consumed it: no
  PR ran a configured spec. 12 of 69 configured specs had no header at all, so they could never be
  selected, and the build refused only offline specs without one.
- `configured-suite.yml` ran the full suite on every push to main, nightly and by dispatch. Plan-run
  workers dispatched it on every PR head (`candidate-dispatch.mjs`, ci03): the full set whatever
  the change touched.
- ci.yml had no backend job; the CI gate did not know the configured suite existed.

## 2. Design (decided by the builder)

1. **The manifest.** `planFor` now returns `configuredSpecs` (bare names), `configuredAll` and
   `configuredReasons` (`whole`: the files that selected the whole set; `files`: every other file
   and the specs it selected). The CLI's `--json` carries it as `configured: { mode, specs,
   quarantined, reasons }`, mode `none`, `subset` or `all`. Selection rules:
   - an edited configured spec, or its baselines, runs itself (a deleted one plans nothing);
   - a configured `covers:` line runs its spec;
   - a changed root helper runs the configured specs that import it (the helper map now names
     them), a file a configured spec reads by path or route runs that spec (ci05's readers);
   - the **whole set** for the suite's shared ground: `CONFIGURED_FULL` in
     `scripts/e2e-lists.mjs` (anything under `e2e/configured/` but a spec or its baselines,
     `playwright.live.config.ts`, `supabase/`, ci.yml and `configured-suite.yml`,
     `.github/actions/`, `package.json`, `package-lock.json`, `vite.config.ts`) and the toolchain
     read off imports (`configuredToolchain`: the planner, shard packer, verdict and run-integrity
     reporter and everything they import);
   - the **whole set** for every file the offline plan escalates (CORE, unmapped, broad, a stale
     traced map, `ESCALATES_WITH_HEADERS`). The spec's "uncertain dependencies" are the planner's
     own uncertain class; a configured header that names such a file adds nothing it does not
     already run.
   - A quarantined configured spec leaves the PR selection unless the change edits it, exactly as
     the offline split does; it still runs per landing under the quarantine.
2. **Every configured spec declares.** Headers added to the 12 (`bridge-real-server.spec.ts` as
   `none` with its reason: it only runs behind `BRIDGE_REAL=1` with real hardware).
   `auditSpecHeaders` refuses a configured spec with neither (rule 4).
3. **One bootstrap.** The stack steps of `configured-suite.yml` (pinned CLI, `supabase start`,
   key export, migration count, grants, default-privilege and realtime assertions, both accounts
   signing in) moved verbatim into `.github/actions/configured-stack`; both workflows use it. A
   reusable workflow was rejected: GitHub requires the calling job to grant every permission the
   called workflow declares (issues, contents, pull-requests, statuses write for its rolling issue
   and quarantine jobs), which would hand write tokens to PR code.
4. **ci.yml.** The plan job's `Configured selection` step turns the manifest into `configured`
   ('true' or 'false', never empty) plus specs and shards. Exempt, by event, with a notice and a
   summary line: `merge_group`, `push` to main and a dispatch on main. A pull request (or a
   dispatched branch run) with mode `none` is untriggered and says so; a missing manifest or an
   unknown mode fails the plan. `Configured E2E n/m (selected, local Supabase)` runs each shard's
   files with the local default accounts and `NOACG_E2E_EXPECTED_SPECS` (ci05). `Configured E2E
   verdict (selected)` merges the blobs, lists the selected files with the same config
   (`playwright test --list`) and judges the report against that list with
   `configured-verdict.mjs --manifest`: an empty selection or listing, a selected file listing no
   test, a listed test missing from the report, a reported test nobody listed (by Playwright id),
   an unexpected skip (outside `expected-run.json`), a failure or a flake each fail it. A missing
   shard report fails it too.
5. **The gate reads the flag.** 'true': both configured jobs must succeed (a cap reads as no
   verdict, still not a pass). 'false': both must be skipped. Any other flag fails, and a merge
   group whose plan says anything but 'false' fails.
6. **Shards.** `configured-shards.mjs --specs` packs a selection onto one local stack per ten
   measured test-minutes, at most the four a landing gets; it refuses a name not on disk.

## 3. Rules (stated before the workflow code; the PR repeats them)

- R1. A triggered pull request passes the gate only with every selected test reported, passed and
  not flaky, and nothing else reported.
- R2. The gate accepts skipped configured jobs only when the plan's flag is 'false'; the flag is
  'false' only for an untriggered pull request (manifest mode `none`), a merge group, or main.
- R3. An unknown selection is never 'false': a missing manifest, an unknown mode or an empty flag fails.
- R4. Shared ground and anything the offline plan escalates select every configured spec.
- R5. The full configured suite keeps running on every landing; nothing here changes
  `configured-suite.yml`'s triggers, quarantine or rolling issue.

## 4. Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| (a) Every configured spec declares covers or a justified none | 12 headers added; `auditSpecHeaders` rule 4 and its fixture; `ci06: every configured spec declares ...` over the real repository | pass |
| (a) Edited specs still run | `ci06: an edited configured spec runs itself, and a deleted one plans nothing` | pass |
| (a) Exact selected spec/case identity, not only a boolean | spec identity in the plan JSON (`ci06: the planner CLI carries the manifest ...`), shown in the plan job's summary; case identity is the `--list` manifest uploaded with the verdict (`configured-selected-report` artifact, `configured-manifest.json`) | pass |
| (a) Helper, live config, setup, workflow and uncertain shared changes select the full set | `ci06: helpers, live config, setup, workflows and the toolchain ...`, `ci06: an uncertain shared change ...` | pass |
| (b) Triggered PRs execute every selected case on an isolated migrated local stack | Run 41233844505 (section 5): the whole set, 68 specs on 4 local stacks, each migrated and asserted by the shared action; 145 tests ran and passed, 3 skipped inside `expected-run.json`'s allowed skips; the verdict matched the report to the `--list` manifest; CI gate green | pass |
| (b) Missing, empty, mismatched or unexpectedly skipped results fail the existing CI gate, which reads the planner flag | verdict tests `ci06: missing, empty, mismatched or unexpectedly skipped ...`; the gate step run from ci.yml under bash (`ci06: the CI gate reads the planner flag ...`, `... accepts a skip only when ...`) | pass |
| (c) Untriggered PR and explicit merge-group skip cases | Untriggered: the selection step run from ci.yml under bash (`ci06: the selection step turns the manifest into the flag ...`) and a real dispatched run whose diff selects nothing (section 5). Merge group: the same step exempts it and the gate refuses a merge group that does not say 'false' (tests above); the first real merge group is this PR's own landing, which the checker reads | pass (real merge-group run: at landing) |
| (c) Full configured tests per landing, default local credentials, migration/auth/grant/realtime prerequisites remain | `configured-suite.yml` triggers and verdict unchanged; the shared action keeps every assertion (`ci06: the configured jobs run on the planner flag and read no hosted secret`) | pass |
| (c) Record cost and combined-tree exposure | sections 6 and 7 | pass |
| (d) Templates, known-traps, coordinator receipts reconciled; duplicate unconditional dispatch removed only after proof; per-landing checks kept | section 8 | pass once the PR's own head carries a green selected run; see section 8 |

Mutation check, each change reverted alone with the tests run: escalation not coupled (1
failure), shared ground off (2), an edited spec not selected (2), the manifest check off (1), the
extra-test check off (1), an empty flag read as 'false' in the gate (1), the merge-group check off
(1), the configured header refusal off (1), the quarantine split off (1).

## 5. Real Actions runs

| Run | Event, head | Selection | Outcome | Backend runner-min |
| --- | --- | --- | --- | ---: |
| 41232694322 | dispatch with `diff_base` 11523106 (main), `8ab35e94` | all: 68 specs, 4 stacks (ci.yml and the planner changed) | 4 shards green; the verdict job **refused**: the `--list` call inherited the merge step's `PLAYWRIGHT_JSON_OUTPUT_NAME`, so the listing went over the merged report and the manifest was not JSON. The CI gate went red. A real missing-manifest case, failing closed; fixed in `bff4df3b` and pinned by a test | 49.1 |
| 41233844505 | dispatch with `diff_base` 11523106, `bff4df3b` | all: 68 specs, 4 stacks | 145 ran, 0 failed, 0 flaky, 3 allowed skips; verdict and CI gate green | 49.2 |
| 41235203993 | dispatch with `diff_base` 321b23b2, `043f6b7d` (the diff is this evidence file only) | none: the plan job's notice reads `Untriggered - this change selects no configured spec` | both configured jobs skipped, offline plan none; CI gate green with the flag 'false' | 0 |

The PR's own `pull_request` runs and the paired full `configured-suite.yml` dispatch on the
reviewed head (`candidate-dispatch.mjs`, current policy until this lands) are listed in the PR
description, so recording them does not move the head they judge.

## 6. Cost

Measured on run 41233844505: a whole-set selected run costs **49.2 backend runner-minutes**
(four shards of 11.3 to 12.7 minutes, about 2.3 of each the stack and installs, and a 0.4-minute
verdict). It runs beside the offline shards: that PR run's gate finished 2.2 minutes after the
last offline or catalog job. The selection step adds 1 second to the plan job. Graphics: no job,
trigger or catalog rule changed, so **0 graphics runner-minutes** are added; nothing here leans
on #1863.

Selection share, replaying the 56 first-parent landings in this clone (`302d565b` to `11523106`)
through the ci06 planner with sprint focus and the committed traced map: 31 select nothing, 3 a
subset (about 3 test-minutes, one stack, about 6 runner-minutes), 22 the whole set. The whole-set
reasons: an offline escalation (src/components broad files 6, unmapped 9, src/model 3,
src/preview 2, others 4), dependency manifests (6 and 5), workflows (3), the planner's scripts
(1), a configured helper (1).

Per landing, against ci01's frozen backend tier (94 baseline, **117 ceiling** runner-minutes per
landing). ci01's reference week had 3.88 PR CI runs per landing, 54% of them cancelled by a newer
push; counting a cancelled run at half its cost gives 2.84 run-equivalents per landing, an
estimate, not a measurement:

| Line | Runner-minutes per landing |
| --- | ---: |
| Added: 2.84 x (0.39 x 49.2 + 0.05 x 6) | about +56 |
| Removed: the routine worker full dispatch per PR head (ci01's backend PR-time line, 5,841 / 122, estimated there) | about -48 |
| Net, if those dispatches stop | about +8: **about 102 of 117 (87%)**, over the 85% warn line, under the 95% refuse line |
| If they do not stop (no offset) | about 150 of 117 (128%), over the ceiling |

So the projected cost depends on section 8 taking effect. ci18 owns enforcement; the measured
cohort after landing replaces these estimates. The largest share is offline escalations that
select the whole configured set; narrowing them is a selection change for ci07's critical/shared
sets, not this row. Follow-up #1871 records the two cheaper mechanics this row did not take:
caching the stack images and sharing the shard and merge steps between the two workflows.

## 7. Combined-tree exposure

Unchanged by this row, and now stated by the plan on every merge group. A merge group's plan says
`configured=false` (exempt): the combined tree's backend is not checked before merge. A pull
request's configured check runs on GitHub's merge of the PR into its base at the time of that run,
so landings between that run and the merge group are not in it. The full configured suite on the
landing's push run is the first check of the combined tree. ci01 measured it at 13.5 minutes p50
(14.0 p90, 15.6 max) after merge, with migrations applied at 0.6 and the Vercel production deploy at
2.9 minutes p50: in 24 of 24 landings production and its migrations were live 9.5 to 11.4 minutes
before that verdict. Owner decision on deployment order: #1846. A landing can still precede its
own configured verdict: #1101.

## 8. What changes for the coordinator from the next phase on

The replacement proof is on the PR before it can land: the selected check runs on its own
head (the whole set, because this PR changes ci.yml and the planner), next to the full
`configured-suite.yml` dispatch on the same head that current policy still requires, and both
must be green with the same `head_sha`. Only then does the removal of the routine dispatch in
known-traps, plan-run.md, queue-merge.md and the build/repair/fix receipts take effect, by landing.

From the next phase on, the coordinator:

1. **Stops requiring a worker's `configured-suite.yml` dispatch on the reviewed head.** The worker
   gates are the CI gate (which now carries the selected configured check), the Codex review and
   `/so`. A receipt names the CI run on the reviewed head and its `Configured selection` (mode and
   spec count, or the untriggered notice) instead of a configured-suite run ID.
2. **Reads the plan job's `Configured selection` summary on the reviewed head** before stamping:
   triggered (subset or whole set) means `Configured E2E n/m (selected, local Supabase)` and
   `Configured E2E verdict (selected)` are green in that run; untriggered means the notice is
   there and both are skipped. It confirms that CI run's `head_sha` equals the reviewed head, as
   before.
3. **Asks for a full dispatch only for a reason**: a change the coordinator judges the selection
   cannot see, or a repair reproducing a landing's configured failure. `candidate-dispatch.mjs`
   and its reconcile rules are unchanged for that.
4. **Keeps reading the per-landing configured run on the merge SHA** (check.tmpl already lists
   `configured-suite` among the exact-merge checks). The merge group stays exempt: no backend check
   of the combined tree happens before merge (section 7).
5. For the ci06 checker: the merge group of this PR is the first real exempt merge-group run;
   its plan job must say `Exempt - merge group` and its gate pass with both configured jobs skipped.

## 9. Phase notes

- Previous verified main: `11523106a407cb856e619e0d4ddbbfa3785d5739` (ci05 merge).
- Revert: `git revert -m 1 <this PR's merge commit>`. That restores the routine worker dispatch in
  known-traps and the templates together with the workflows, so the two cannot disagree.
- Decisions: offline escalation selects the whole configured set (the cost of section 6 is that
  choice); a composite action, not a reusable workflow, for the shared bootstrap (permissions);
  case identity from `--list` on the verdict job, not in the plan job (the plan job installs no
  dependencies); quarantined configured specs follow the offline split; a flake on a PR is red, as
  it was on a worker dispatch.
  The shared action retries the stack START once, after `supabase stop`, and nothing else (#1865,
  #1829: Docker port wiring failing before any test ran); a test, shard or verdict is never
  retried, and the aggregate still refuses a missing shard. #1865 stays open until a retried start
  is seen recovering on a real run.
- Traps for later rows: the configured selection's shared ground includes ci.yml, so every ci.yml
  change runs the whole configured set on its PR. ci07's critical/shared sets may narrow the
  escalation coupling only with the reset the runbook requires. `CONFIGURED_TRIGGERS` stays
  exported but the planner no longer reads it. `scripts/e2e-traced.json`, `e2e/quarantine.json` and
  `scripts/e2e-durations.json` are untouched (bot PRs #1840, #1834, #1503).

## 10. Verification run

- `/check`: the code review returned 10 findings; 8 fixed (the run-integrity reporter was
  replaced by the CLI `--reporter`, so `NOACG_E2E_EXPECTED_SPECS` was read by nothing; shard
  weights read only green main runs; dead `CONFIGURED_TRIGGERS`/`CONFIGURED_SUITE_FILES`; the
  selection step sat under the capacity comment; a non-array `--specs` crashed; the offline
  shards' clean-tree check was missing; the evidence was unfilled; an allowed-skip-only
  selection's zero-run pass was undocumented, now stated as intended), 1 answered in place (the
  plan job's report download stays, bounded by timeouts), 1 a known in-progress item (the
  evidence placeholders). Simplify (four reviewers): reuse of `splitQuarantined` for the
  configured manifest, one weight table for count and packing, whole-set reasons collected
  directly, a lazy toolchain read, one `off` helper in the selection step and one Node start in
  the shard step, a shared sample formatter in the verdict, one quarantine read per plan. Skipped
  with reasons: a reusable workflow (it would hand write tokens to PR code, section 2), sharing the
  shard and merge steps or caching stack images (larger workflow refactors, follow-up issue),
  folding the two gate-test harnesses (separate files, low value), deriving `configured` and
  `configuredAll` (kept as the plan's public fields).
- `node --test` over `scripts/configured-selection.test.mjs`, `e2e-affected.test.mjs`,
  `e2e-retry.test.mjs`, `configured-verdict.test.mjs`, `configured-shards.test.mjs`,
  `candidate-dispatch.test.mjs`: 209 pass, 0 fail. Mutations in section 4.
- `npm run gates -- run --changed origin/main`: all gates ok, 303 tests pass.
- `node scripts/check-workflows.mjs`: 24 validated. `npx eslint` on the changed scripts: clean.
- `CI=1 npx playwright test -c playwright.live.config.ts --list --reporter=json` locally: ids
  present and stable, no backend needed.
- Real Actions runs: section 5 and the PR description.
