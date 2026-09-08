---
v: 1
scope: src/components/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-keep-packages-out-they-retired-every.md
---
Keep PACKAGES out of the UI: they are retired, every save is standalone in the flat library, and the ONE grouping is a PRODUCTION (`model/shows.ts`), so no surface copy, tooltip or menu may still offer one. Save and Home are both routed through `src/app/router.ts`, so browser Back and Forward walk between the surfaces.
