---
v: 1
scope: src/model/project.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-current-working-project-slot-autosaved-localstorage.md
---
`project.ts` is the ONE current-working-project slot, autosaved to localStorage so a reload restores the last graphic; creating a new graphic OVERWRITES it, and durable saves go to the LIBRARY through the Save button. It carries the save LINK - `graphicId`, which library record this document IS, plus `dirty` - so a reload keeps an honest Saved or Unsaved badge, and a soft-delete tombstone for cloud-sync parity.
