---
v: 1
scope: src/model/library.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-every-durably-saved-graphic-stable-uuid.md
---
Every durably saved graphic is ONE `GraphicDoc` with a STABLE uuid in the FLAT library - template plus baseline plus the control panel's `entries` (named `ControlEntry` data rows) and `activeEntryId`, plus the AI provenance `aiSpec` and `aiThread`, both additive optional so the version stays put. Packet conventions apply: updatedAt last-write-wins, tombstones.
