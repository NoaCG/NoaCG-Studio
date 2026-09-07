---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-keep-imported-fonts-template-assets-under.md
---
Keep imported fonts as template assets under `fonts/<file>` with a visible `@font-face`, register them through the FontFace API for builder preview, and ship real font binaries in exports. Accept custom palette values through the wizard's custom palette controls.
