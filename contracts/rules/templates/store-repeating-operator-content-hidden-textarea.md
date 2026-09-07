---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-store-repeating-operator-content-hidden-textarea.md
---
Store repeating operator content in one hidden textarea `lines` field, with one item per line and pipe-separated parts, rather than adding fields per row. Call the type-owned `rebuildInfographic()` after every `update()`, escape text before `innerHTML`, skip malformed lines, and render one direct child per item under `#infographic-rows` for measured row motion.
