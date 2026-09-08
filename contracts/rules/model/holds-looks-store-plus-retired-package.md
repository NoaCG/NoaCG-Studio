---
v: 1
scope: src/model/packets.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-holds-looks-store-plus-retired-package.md
---
`packets.ts` holds the LOOKS store (`captureLookFromTemplate` and `applyLookToTemplate`) plus the RETIRED package store's read seam: no UI reads or writes packages and the packet sync kind is gone, with the rows left inert. What remains is `loadAllPackets` and `upsertPacket` for `library.ts`'s v1 extraction, and the `SavedGraphic` shape the show pools reuse.
