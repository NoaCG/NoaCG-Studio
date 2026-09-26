---
v: 1
scope: src/templates/shared/base.ts, src/templates/shared/numerals.ts, src/model/brand.ts, src/model/fonts.ts, src/model/themeTokens.ts, src/ai/creative/scaffold.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-resolve-chosen-heading-typeface-through-using.md
---
Resolve `--font-numeric` from the chosen heading typeface through `numericFontStack`, using even-width heading digits, else its bundled sibling, else a monospaced fallback. Update this token wherever `--font-heading` is written for a numeric design, and verify live-number stability with `scripts/numerals.mjs`.
