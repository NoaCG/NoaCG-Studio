---
v: 1
scope: src/components/wizard/steps/ai/**, src/validation/readiness.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-report-what-measured-result-card-verdict.md
---
Report what was MEASURED on the result card, not a verdict: group existing findings into the operator-facing rows and add no checks of your own, so a row can honestly read "not played, so not tested" on the one-shot path. Show verbatim any rule no row claims, never swallow it.
