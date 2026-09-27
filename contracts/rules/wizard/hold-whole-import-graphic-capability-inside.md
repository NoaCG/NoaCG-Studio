---
v: 1
scope: src/components/wizard/import/**
kind: invariant
fires: contract
status: active
since: 2026-09-27
supersedes: wizard/keep-whole-import-graphic-capability-inside
record: contracts/records/wizard/2026-09-27-hold-whole-import-graphic-capability-inside.md
---
Hold the whole Import-graphic capability inside `wizard/import/` - the five steps, `DesignPrepCanvas`, `fieldAutoMap`, its CSS and its draft slice - with `import/index.ts` as the ONLY door into it. `.dependency-cruiser.cjs` refuses a deep import from outside, `draft.ts` re-exports the slice through that index, and the import specs' own `// covers:` headers map the folder to them.
