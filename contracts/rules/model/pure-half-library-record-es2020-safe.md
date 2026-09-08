---
v: 1
scope: src/model/graphicDoc.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-pure-half-library-record-es2020-safe.md
---
`graphicDoc.ts` is the PURE half of the library record - ES2020-safe with NO storage imports - so a server function and the CLI can mint and check the same record `library.ts` persists. `GraphicDocBase` is generic over the three app-only payload types; `isGraphicDocShape` is a shape check that NEVER executes template code; and the additive-optional `origin` is provenance of an agent-saved graphic, never proof of anything.
