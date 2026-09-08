---
v: 1
scope: src/blocks/animImport.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-importer-carries-name-never-arbitrary-measured.md
---
The importer carries a NAME, never arbitrary measured JS, and it NEVER guesses: it reads `tl.add(builderName(target))` as a `dynamics` segment (`TimelineDynamic`), and a `tl.add(...)` in any other shape - a bare local timeline variable - fails `dynamicsConvertible` and the template stays legacy.
