# Research verification

Scope: only `docs/work-specs/codebase-lean/`, against merge base
`3010e41134f1e3a6ebf3933582eb9b7e52055241`. This checks the report and proposed removal
boundaries; it is not runtime verification of a deletion that has not happened.

| Criterion | Result | Evidence |
|---|---|---|
| AC1 complete inventory | Pass | Tracked-path totals reconcile; 297 E2E specs, 308 Node test files, 6,061 declarations; inventories cover scripts/docs/assets; explicit skip-site inventory distinguishes conditional checks |
| AC2 source ownership | Pass for proposal | Explicit root/edge traversal plus Knip; SSR/ambient exceptions documented; active fixture consumers found and excluded from direct deletion |
| AC3 test retirement entries | Pass for proposal | 474 case identities in 77 files, 78 draft entries including the separate no-old-editor assertion; drafts stay outside the gate's active scan |
| AC4 stored data | Pass for analysis | Source readers and migration paths mapped; graphic/project support retained and dock-format decision pending; live compatibility execution belongs to each deletion PR |
| AC5 phase order | Pass for plan | Delete source importers before imported modules; active test factories block two direct deletions; code-health and shared-file coordination stated |
| AC6 measurements | Pass | Per-file line totals and declaration spans reconcile; 183.252 baseline / 0.497 credited reduction; mixed-case/build savings remain unknown; moves are not counted twice |
| AC7 retained protection | Pass for plan | No-UI false positives, Node gate discovery, required fault proofs and retained active cases named; no current gate/test changed |
| AC8 research-only scope | Pass | Source/config/test files unchanged; targeted gates pass; no build, browser/full suite, deployment, deletion PR or plan run |

Review: **inline, two substantive findings fixed**. First, lottieInsert and machineEdit have
current fixture consumers even though no product entry imports them. They now receive no
direct-deletion credit, and the plan requires fixture replacements without weakening the live
OGraf/animation checks. Second, TypeScript checks unreachable source too, so removing canvas
children before PreviewFrame, or Inspector before SidePanel, would fail compilation. The
PR order now removes those importers first and retains partLocks until its final consumer goes.

Simplify: **inline**. Reused installed TypeScript/dependency-cruiser and existing gate discovery;
kept one raw inventory generator, one curated manifest and inactive maintenance drafts. Removed
duplicate full test-title lists from the file-level table; the case-level table remains complete.
No new policy, runtime helper, production dependency, test runner or size gate was introduced.

Verification: **inline**. Commands and their purpose:

- `node docs/work-specs/codebase-lean/evidence/inventory.mjs`: read-only baseline generation.
- Knip 5.88.1 and dependency-cruiser 18.1.0: independent unused-file/import graph inputs;
  exact commands and limitations are in README.md.
- `node --check docs/work-specs/codebase-lean/evidence/inventory.mjs`: syntax passes.
- `npm run gates -- run --changed origin/main`: contract freshness/citations, docs index,
  client-secret scan and copy gate pass. No build or full suite is selected.
- `node scripts/check-e2e-protection.mjs --changed origin/main`: no E2E protection change;
  future draft entries are not active allowances.
- Inline evidence reconciliation: all listed paths exist at the pin; graph and Knip disagree
  only on the documented SSR/ambient inputs; direct deletions exclude current fixture subjects;
  36 full-file and 41 mixed-file entries match the case inventory; every removed declaration
  span is within its file and has an old-helper reason; line/time totals and Markdown links
  reconcile; draft parsing yields the expected per-spec identities.
- `git diff --check`: no whitespace errors. Review scope contains only the report directory.

Not executed: application build, runtime tests, fault injection for future consolidations,
production queries, fresh full CI or a deletion. GitHub job metadata supplies the historical
build baseline; full logs were blocked at the results-receiver host, so mixed skipped-case
timings are not available. The source-only analysis does not establish actual stored-data
population, usage telemetry or external consumers of public asset URLs.

The report is ready for the owner's first question: approve the Phase 1 plan. Approval has
not been inferred, and no implementation or beyond-Phase-1 retirement is authorized here.
