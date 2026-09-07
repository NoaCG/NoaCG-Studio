---
v: 1
scope: src/blocks/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-data-block-template-carries-strict-json.md
---
A data-block template carries `var NOACG_ANIM = { ... };` - strict JSON inside the braces - plus the fixed interpreter emitted by `src/templates/shared/animRuntime.ts` in the marked ANIMATION region. These modules are the editor's side of that contract, and editor-to-runtime parity is pinned by `e2e/anim-engine.spec.ts`.
