---
v: 1
scope: e2e/import-svg*.spec.ts, src/templates/importedDesign/svg.ts
kind: trap
fires: contract
status: active
since: 2026-09-19
record: contracts/records/e2e/2026-09-19-push-branch-pre-check-before-queueing.md
allow-numbers: true
---
Push the branch as a pre-check before queueing any change that alters how imported text renders or fits, and read the failure's own measurements before touching a bound. A remainder that is larger on CI than locally can be the fit leaving room unspent, which is a product fault to fix in the fit, never a bound to loosen.
