# Baseline and evidence limits

Prepared 2026-10-25. Repository source inspected at
`8eacb027ea0c682148637d62434a532e48d45ae4`; recovery ledger read at
`bb1a140edb43fcdd1fe9344c30c9a12902f0da56`. The three owner-supplied independent
reports inspected repository source `70c28888c84d47a2efb28cf4a54976fa1d4878fc` and the
same ledger. This is a read-only historical sample, not the current live run's status.

## Directly checked

- [Pinned ledger](https://github.com/NoaCG/NoaCG-Studio/blob/bb1a140edb43fcdd1fe9344c30c9a12902f0da56/ledger.md),
  at the recovery branch root. Parsed timestamped `phase N build/check/fail/pass` events for
  rows 1-30. Completion means first build to final PASS; repair interval means first FAIL to
  final PASS. Pair each check with its next FAIL/PASS. No active worker time is inferred.
- [Phase notes](../../production-page-refactor/evidence/phase-notes.md): local Docker stacks,
  row 30's repeated assessments and rewrite, actual check findings and repairs.
- [Plan-run](../../../../.agent-workflows/plan-run.md): different plans may coexist; dependent
  rows wait for PASS, checkers are fresh, and exact-merge checks are required.
- [Configured workflow](../../../../.github/workflows/configured-suite.yml): four shards,
  isolated stacks, non-push `shared` concurrency group, per-SHA push groups and no running
  cancellation. [CI](../../../../.github/workflows/ci.yml) uses a shared main-ref group,
  so pending replacement still needs reconciliation even with running cancellation disabled.
- [Verification](../../../../.agent-workflows/verify.md): five/twelve-minute selected browser
  allowances and observation-only verification lookup. Whole suites remain in Actions.
- GitHub ruleset `22389043`, read with `gh api repos/NoaCG/NoaCG-Studio/rulesets/22389043`:
  merge queue ALLGREEN; max builds 5, max merge entries 5, min entries 1, min wait 2 minutes,
  response timeout 60 minutes. No setting changed.
- [PR 1695](https://github.com/NoaCG/NoaCG-Studio/pull/1695) describes the model rewrite,
  nine failed numbered assessments and later clearing assessments. Nine is not the complete
  number of independent sessions.

| Row | Build to final PASS, hours | First FAIL to final PASS, hours |
| --- | ---: | ---: |
| 1 | 2.81 | 1.43 |
| 2 | 2.57 | none |
| 3 | 3.10 | none |
| 4 | 3.20 | none |
| 5 | 1.49 | none |
| 6 | 1.39 | none |
| 7 | 3.05 | none |
| 8 | 2.34 | none |
| 9 | 6.45 | 0.87 |
| 10 | 5.56 | 3.04 |
| 11 | 3.57 | 0.91 |
| 12 | 2.60 | none |
| 13 | 7.70 | 2.31 |
| 14 | 8.62 | none |
| 15 | 1.62 | none |
| 16 | 2.11 | none |
| 17 | 1.46 | none |
| 18 | 1.97 | none |
| 19 | 1.77 | none |
| 20 | 1.90 | none |
| 21 | 1.57 | none |
| 22 | 2.59 | none |
| 23 | 3.94 | none |
| 24 | 5.98 | none |
| 25 | 2.09 | none |
| 26 | 1.57 | none |
| 27 | 4.79 | none |
| 28 | 3.39 | none |
| 29 | 3.27 | none |
| 30 | 10.63 | 1.31 |

Use unrounded timestamps for aggregation: median 2.70 hours, mean 3.50 hours; six first-check
failures; 36 check attempts with median 39.6 minutes; total FAIL-to-PASS intervals about
9.9 hours. One supplied report said median 2h48m; the timestamp calculation resolves it to
about 2h42m. These elapsed intervals are not estimates of avoidable delay.

Failure categories: row 1 has both an advisor-baseline omission and a cross-tab lost update;
row 10 has an advisor-baseline omission; row 9 lacks tests for promised safety constants;
row 11 contains an actual quadratic parser; row 13 misses cross-browser competing writers;
row 30 permits different content for the same revision. Do not call all six advisor or timing
failures, or describe row 1 as bookkeeping alone. Retain independent acceptance.

## Measurements supplied by the independent reviews

These detailed Actions/review totals were supplied with PR/run links. This planning task
cross-checked the ledger, workflow and row-30 narrative, but did not independently re-enumerate
all jobs, reviews or cancelled attempts. Reconcile those totals before using them as trial data.

| Row / PR | Before queue, min | Queue to merge, min | First check, min | Commits | CI runs / cancelled | Configured runs / cancelled / failed |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 26 / [1655](https://github.com/NoaCG/NoaCG-Studio/pull/1655) | 48.3 | 9.0 | 36.0 | 6 | 2 / 1 | 0 |
| 27 / [1658](https://github.com/NoaCG/NoaCG-Studio/pull/1658) | 226.5 | 12.3 | 48.4 | 15 | 7 / 3 | 7 / 4 / 0 |
| 28 / [1670](https://github.com/NoaCG/NoaCG-Studio/pull/1670) | 154.8 | 8.9 | 39.0 | 11 | 6 / 4 | 4 / 3 / 0 |
| 29 / [1680](https://github.com/NoaCG/NoaCG-Studio/pull/1680) | 162.7 | 8.5 | 24.4 | 20 | 4 / 2 | 4 / 1 / 0 |
| 30 / [1695](https://github.com/NoaCG/NoaCG-Studio/pull/1695) | 514.3 | 10.5 | 32.8 | 50 | 39 / 23 | 36 / 9 / 7 |

Before-queue time includes tests and reviews. Row 30 additionally needed 78.8 minutes after
its first FAIL, including repair [1704](https://github.com/NoaCG/NoaCG-Studio/pull/1704).
The two reports counting explicit review requests disagree (36 versus 38). No recommendation
requires resolving that count. Submitted reviews (26) are not requests or builder replies.

Configured sharding landed with [1675](https://github.com/NoaCG/NoaCG-Studio/pull/1675) during
the sample. Relevant runs include pre-sharding [40090259589](https://github.com/NoaCG/NoaCG-Studio/actions/runs/40090259589)
and [40105763994](https://github.com/NoaCG/NoaCG-Studio/actions/runs/40105763994),
and row 29's [40122614578](https://github.com/NoaCG/NoaCG-Studio/actions/runs/40122614578).
The reports give successful row-30 configured runs as 11.6-23.2 minutes. Seven failures mix
test-oracle problems, protocol-path findings, missing reports and fail-then-pass; they are not
seven demonstrated distinct product bugs. Some checker intervals overlap main CI almost fully;
that does not establish how much active review took place during the overlap.

One report totals ordinary rows 26-29 at 512 branch runner-minutes per change, then estimates
95 for merge-group CI, 180 for main CI and 45 for configured-after-landing: about 832 total.
That estimate excludes some workflows and repairs. At 3.25 hours/change, three streams imply
about 768 runner-minutes/hour (13 occupied runners on average); ten imply about 2,560 (43).
The report's heavier mix with one row-30-sized change in five approaches 57 occupied runners
at ten streams. These are illustrative load models, not measured concurrent-plan performance.
Peak demand and provider/review limits must be measured separately.

## Existing research and external semantics

Build on [suite-budget work](../../e2e-suite-budget/spec.md) and its evidence, not on its old
20-runner account assumption. The owner fixes today's envelope at 60 standard jobs with no
additional cost; it was not re-investigated. The suite's protection and resource-budget rules
remain binding. [Verification observation](../../verification-observation/spec.md) remains
observation-only; neither this spec nor a green timing trial activates enforcement or batching.

The [native-stack trial](../../../research/2026-10-12-supabase-native-stack.md) found five
realtime failures, grant-check differences and modest startup gains. It is a dated reason to
defer adoption, not proof of current provider capabilities. Docker succeeded in historical
Claude workers, including row 27. Cold starts, registry access and Codex Docker availability
for this workload remain unqualified here. No cloud stack or product test ran during planning.

[GitHub concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency),
checked 2026-10-25, says default groups keep one running and one pending run; a newer pending
request can replace the older one even when running cancellation is false. `queue: max` can
retain more pending requests but still serializes the group; it is not the proposed remedy
for unrelated candidate validation.

[GitHub merge-queue documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
distinguishes concurrent builds from merge-entry limits; increasing merge limits does not
combine builds. No queue setting change is justified by the current sample.

[Supabase Splinter](https://github.com/supabase/splinter) supplies SQL lints and documents that
API exposure depends on `pgrst.db_schemas`. Its existence does not establish parity with this
repository's hosted advisor payload or baseline. The local trial must pin the implementation,
reproduce the relevant classes and explain differences before gating them.

## Recommendations reconciled

- Accept: isolated candidate scheduling; three independent plans with semantic ownership;
  earlier decisions/models for risky stateful work; coherent repair/review checkpoints;
  shared selected-test tooling; early checks of reproducible advisor classes.
- Correct: a fixed number of red reviews is not a limit on useful scrutiny; a model copied
  from the implementation misses the same assumptions; distinct files do not prove independence.
- Defer: pre-merge replacement of independent acceptance, one-row lookahead, arbitrary graph
  scheduling, native-runtime adoption, main-validation batching and changes to merge limits.
- Reject: a fixed ten-minute push/review cutoff, promises of zero delay, treating all cancelled
  compute as agent waiting, and accepting baseline findings merely to turn a gate green.

Unknowns remain active work versus wait, cloud cold-start reliability, live three-plan resource
competition, and the causal saving from each proposed intervention. The trial reports these
honestly rather than presenting the supplied recommendations as completed experiments.
