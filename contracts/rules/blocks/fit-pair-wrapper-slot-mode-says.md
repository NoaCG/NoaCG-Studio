---
v: 1
scope: src/blocks/designLayout.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-fit-pair-wrapper-slot-mode-says.md
---
`lineFit`/`setLineFit` are the FIT pair - the wrapper's `max-width` is the slot and the mode says how a too-long operator value answers it: `overflow` (no cap, what a pre-fit saved template reads as), `wrap` (CSS), or `shrink` (one row condensed by `templates/shared/textFit.ts`'s `fitPlacedText()`, marked `data-fit="shrink"`). `ensureTextFitRuntime` injects that design-owned runtime ONCE and idempotently, and NOT AT ALL into an imported SVG carrying `SVG_TEXT_FIT_MARKER`.
