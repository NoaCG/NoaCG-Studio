# Research reconciliation, 2026-10-25

This receipt describes planning evidence, not implementation acceptance. Local source HEAD and the
GitHub main branch read both identified `d8dd1304910736437486d6f9f9cd9e401ac65589` during inspection.
No workflow, production-page ledger, test selection, running worker or repository setting changed.

## Supplied material

The four attachments contain three distinct texts: the integration request, the first independent
opinion, and two byte-identical copies of the longer research report. The duplicate report's SHA-256
is `3879b841374620cf45189be0989afde8f119abeb23f0ff1bf81f1ad225ed5dcd`.
Do not count those copies as separate corroboration. The reports share the same underlying PR/ledger
sample; agreement among them does not make the sample larger.

The reports inspected repository commit `70c28888c84d47a2efb28cf4a54976fa1d4878fc` and recovery ledger
`bb1a140edb43fcdd1fe9344c30c9a12902f0da56`. Their timings are historical, not current run status.
The [landed parallel-plans baseline](../../parallel-plans/evidence/baseline.md) reconciles the
median discrepancy using ledger timestamps: 2.70 hours, rather than the first opinion's 2h48m.
The [planning PR 1722](https://github.com/NoaCG/NoaCG-Studio/pull/1722) was confirmed merged as
`c0c3f9a77653ffa717e95ba076dfca4189d5950c`; its docs-only implementation/trial status is unchanged.

| Historical finding | Interpretation and limitation |
| --- | --- |
| 30 rows: median 2.70h, mean 3.50h; six first independent failures | Mixed work categories; not a feature-only baseline or removable waiting estimate |
| 36 check attempts: median 39.6min | Overlaps Actions; cannot add it as 40min of duplicate human/agent review |
| First FAIL to final PASS: 52-182min, total 9.87h | Real defects included lost updates, parser complexity, competing writers and revision identity |
| Rows 26-29 mean 3.25h; row 30 10.63h | Row 30 is a tail case, not the typical feature; retain it in tail reporting |
| Row 30: 26 submitted reviews, 36 explicit review requests, 39 CI runs, 23 cancelled | Supplied counts not re-enumerated here; distinguish requests, findings and completed assessments |
| Cancelled row-30 CI consumed about 1,685 runner-minutes | Resource cost, not builder waiting time |
| Configured suite became four shards on October 24 | Do not compare a new local selection with old unsharded full-suite times |

No new timing experiment, cold worker boot or 3/10-plan load test was performed. Current review
service capacity, reliable portable backend startup and causal savings remain unmeasured.

## Source inspection at the pinned main

| Source | Observed state | Consequence |
| --- | --- | --- |
| [CI](../../../../.github/workflows/ci.yml) | Main shares a ref concurrency group; merge groups use unique run IDs; PR runs may cancel obsolete work | Preserve required exact-main recovery; do not mistake no running cancellation for no pending replacement |
| [Configured workflow](../../../../.github/workflows/configured-suite.yml) | Push keyed by SHA, other requests use `shared`; four-shard/report structure | Independent dispatch isolation is concrete future work |
| [Affected selector](../../../../scripts/e2e-affected.mjs), [headers](../../../../scripts/e2e-lists.mjs) | Existing declared/traced selection and shared `focus` set; sprint environment switch already gone | Audit membership and blind spots, do not build another selector |
| [Catalog selector](../../../../scripts/catalog-affected.mjs) | Existing declaration/importer-based design slices, broad fallback and gate-file escalation | Qualify dependency completeness, including unsupported import/asset shapes |
| [Catalog scope](../../../../e2e/_catalogScope.ts), [config](../../../../playwright.catalog.config.ts) | Selected IDs/categories supported; unset means full catalog | Reuse this interface after selection/report qualification |
| CI `e2e-catalog` job | When catalog flag is true, invokes whole emit check and `test:e2e:catalog` without selected IDs | CI still pays whole calibration cost; local scoping alone does not fix it |
| [Verification](../../../../docs/VERIFICATION.md) | Cheapest faithful test layer already documented; main full regression retained | Avoid duplicating landed instruction changes |
| [Observer runbook](../../verification-observation/runbook.md) | Observation only; full identity artifacts not currently emitted by workflows | Reuse requires evidence production and separate activation, not a mode flip |
| [Plan-run](../../../../.agent-workflows/plan-run.md), [verify](../../../../.agent-workflows/verify.md), [queue-merge](../../../../.agent-workflows/queue-merge.md) | Fresh independent checker, exact-merge evidence, bounded worker checks and repair ownership | Explicitly reconcile any future batching obligation before activation |
| [Suite-budget candidates](../../e2e-suite-budget/evidence/candidates.md) | Existing behavior-level inventory and proposed replacements | Remeasure selected candidates; do not use old estimates as measured savings |
| [Deploy verification](../../../../.github/workflows/deploy-verify.yml) | Existing deployment-result/build-identity handling, including unchanged served build after skipped build | Extend/reuse it rather than create a duplicate production monitor |

The catalog dependency comments assert completeness under their assumed import shape. This is a
condition to test, not a general proof for dynamic loading, generated content or non-code assets.
No runtime bug fix is included in this planning change.

## External facts checked

Official [GitHub concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
confirms the default single pending slot can replace a previous pending request even with running
cancellation disabled. `queue: max` can retain more pending requests, but a shared group still
serializes execution. Isolating unrelated candidates addresses that separate bottleneck.

Official [merge queue documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
distinguishes build concurrency from merge limits. Raising merge limits does not combine builds.
These documents were read on 2026-10-25. No GitHub setting was changed. The earlier report's exact
ruleset settings and 60-job account envelope were not independently remeasured in this pass;
the latter is carried as the supplied constraint. P0 must inspect active settings before trials.

## Owner decision and unresolved activation

The owner answered: "Accept daily detection for unrelated, non-critical regressions" to the
proposal to retain critical/affected contracts before merge and use daily exhaustive graphics
checks only after selection qualification. This does not authorize delaying known affected
failures or replacing the 60-minute full-main target with nightly-only testing.

Still pending: Opus's review, disposition of its findings, owner acceptance of the complete
proposal, production-page completion, runtime qualification and each activation's evidence.
The observer's explicit experiment-complete receipt cannot be inferred from elapsed time or from
an older trial report. The exact-merge versus full-range acceptance conflict is stated in D5.

The documents were prepared locally because the task includes private attached material and no
cloud experiment is authorized. No provider capability, independent Opus verdict, product build,
browser result, database parity or actual speedup is claimed by this receipt.

## Planning verification

The inline review covered the four new planning files against the pinned source baseline,
including the pending owner/Opus authority, exact-versus-range conflict, selection fallbacks and
independence of verdicts. It added an explicit critical-deployment incident/recovery requirement.
The inline simplification pass retained one phase sequence and references to existing mechanisms;
it added no new coordinator or execution record. This is not Opus's independent opinion.

Changed-file gates passed: contract freshness, contract citations, documentation index,
client-secret scan and copy checks. Relative Markdown link targets exist; the acceptance ledger
has a matching normalized spec hash, draft authority, no claimed review and eight open criteria.
Whitespace checks passed. These checks validate the planning artifacts only. Product builds,
browser tests, live dispatch experiments and future acceptance criteria were not executed.
