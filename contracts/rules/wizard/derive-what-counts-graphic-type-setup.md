---
v: 1
scope: src/templates/types/graphicType.ts, e2e/wizard-setup-fields.spec.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-derive-what-counts-graphic-type-setup.md
---
DERIVE what counts as a graphic type setup value, never declare it twice: `setupFields` drops every field an operator event carries as its PAYLOAD, because in this model a pick IS payload, and image fields stay out because their value is an asset path. A design with none shows no section at all.
