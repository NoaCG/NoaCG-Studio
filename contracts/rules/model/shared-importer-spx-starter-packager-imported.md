---
v: 1
scope: src/model/externalRefs.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-shared-importer-spx-starter-packager-imported.md
---
`ensureExternalRefs` is shared by the importer and the SPX Starter packager: an imported template's HTML references the css, js and gsap files a Starter package ships beside it, and both sides have to agree about those references or the export loads nothing.
