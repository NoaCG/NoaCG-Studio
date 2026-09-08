---
v: 1
scope: src/model/designRules.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-holds-canonical-air-legibility-rules-owner.md
---
`designRules.ts` holds the CANONICAL on-air legibility rules: the owner's size table (role by standard or safe mode by viewing profile, as a share of the frame's short side), the weight, stroke, safe-area and contrast floors, and the prompt blocks GENERATED from those constants. Prompting, the spike instruments and the product validator's warn-first checks in `validation/designRulesWarnings.ts` all READ this module; nothing copies a number out of it. The maths is pinned by `scripts/design-rules.test.mjs`. Extend it additively.
