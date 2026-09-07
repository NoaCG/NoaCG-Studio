---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-expose-every-meaningful-visible-string-editable.md
---
Expose every meaningful visible string as an editable field, including state words, countdown captions, severity labels, and sponsor headings. Verify editability with `node scripts/field-coverage.mjs`, allowing only the gate's argued versus-mark and empty-image-placeholder exceptions.
