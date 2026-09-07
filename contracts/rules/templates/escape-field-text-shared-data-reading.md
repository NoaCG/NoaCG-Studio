---
v: 1
scope: src/templates/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-escape-field-text-shared-data-reading.md
---
Escape field text at the shared data-reading boundary before it reaches `innerHTML`, using `escapeHtml()` from `ESCAPE_HTML_JS`, including text interpolated into attributes. Do not delegate escaping to design-owned row builders, and verify every catalog variant with `e2e/template-escaping.spec.ts`.
