---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-declare-logo-support-variant-capability-emit.md
---
Declare logo support as a variant capability and emit an optional logo field only when `ResolvedOptions.logoEnabled` is on. Allocate hand-authored `extraFields` after user fields, or let `applyLogoSlot` inject the standard field, image, and placeholder when `designHasLogoSlot` finds no existing slot.
