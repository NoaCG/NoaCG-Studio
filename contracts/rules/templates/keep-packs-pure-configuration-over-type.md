---
v: 1
scope: src/templates/packs.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-keep-packs-pure-configuration-over-type.md
---
Keep packs as pure configuration over the type-by-family matrix, with every reference format assigned to exactly one pack. Edit `src/templates/packs.ts` and `docs/PACK_TAXONOMY.md` together, and validate cell resolution, extras, and format coverage through `scripts/factory.mjs`.
