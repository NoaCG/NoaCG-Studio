---
v: 1
scope: src/components/wizard/import/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-keep-whole-import-graphic-capability-inside.md
---
Keep the whole Import-graphic capability inside `wizard/import/` - the five steps, `DesignPrepCanvas`, `fieldAutoMap`, its CSS and its draft slice - with `import/index.ts` as the ONLY door into it. `.dependency-cruiser.cjs` refuses a deep import from outside, `draft.ts` re-exports the slice through that index, and `scripts/e2e-affected.mjs` maps the folder to the import specs.
