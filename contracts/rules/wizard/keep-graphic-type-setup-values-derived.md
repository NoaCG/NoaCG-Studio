---
v: 1
scope: src/templates/types/graphicType.ts, e2e/wizard-setup-fields.spec.ts
kind: invariant
fires: contract
status: active
since: 2026-09-22
supersedes: wizard/derive-what-counts-graphic-type-setup
record: contracts/records/wizard/2026-09-22-keep-graphic-type-setup-values-derived.md
---
Keep a graphic type setup values DERIVED, never declared twice: `setupFields` drops every field an operator event carries as its PAYLOAD, because in this model a pick IS payload, EXCEPT a field a DEFAULT-PATH event carries, which Continue reaches with no control page and so must hold a real value at build. Image fields stay out because their value is an asset path. A design with none shows no section at all.
