---
v: 1
scope: src/templates/structuralAnchor.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-keep-structural-intent-resolution-shared-routing.md
---
Keep structural intent resolution in `structuralAnchor.ts`, shared by routing and validation, rather than copying it into either consumer. Resolve `resolveAnchor`, `structuralFit`, `anchorsSatisfiedBy`, and `variantSatisfiesAnchor` live against the registry and catalog, and verify routing after catalog changes.
