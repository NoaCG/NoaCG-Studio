---
v: 1
scope: src/templates/shared/base.ts, src/templates/shared/numerals.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-emit-numeric-sibling-bundled-through-only.md
---
Emit a numeric sibling's bundled `@font-face` through `rootVarsCss` only when the numeric token is declared. Give designs without live numbers neither the numeric variable nor the extra font file, and retain CSS font URLs for export discovery.
