---
v: 1
scope: src/model/themeTokens.ts
kind: trap
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-ink-text-sitting-accent-fill-must.md
---
`accentInk` is the ink for text sitting on an accent fill: it must be OPAQUE, and it must never resolve to a TRANSLUCENT panel colour. Most families panel on a near-black, so `var(--panel-bg)` doubles as their ink; the glass family's panel is a translucent white, so glass declares a literal dark instead. Resolve glass's ink to its panel and every glass design that floods a chip renders its text invisible, and a translucent ink washes out over a coloured chip even at the right hue.
