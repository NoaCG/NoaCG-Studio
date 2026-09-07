---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-keep-uploaded-asset-references-under-font.md
---
Keep uploaded asset references under `images/<file>` and font references under `fonts/<file>` for the one-folder export layout. Let the preview resolve known relative image paths through its observer shim, and exclude that shim from exported packages.
