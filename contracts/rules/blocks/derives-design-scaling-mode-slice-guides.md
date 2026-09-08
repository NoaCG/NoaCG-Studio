---
v: 1
scope: src/blocks/designLayout.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-derives-design-scaling-mode-slice-guides.md
---
`designStretchInfo(html, css)` derives a design's scaling mode and 9-slice guides from the emitted declarations - `.{prefix}-art` carrying `border-image-slice` plus readable cap widths means stretch, and anything else including every saved template reads as fixed. A stretch-driving line's slot carries the growing idiom `calc((Npx + var(--stretch-x, 0px)) * var(--scale))`, which `readPx` reads back with a `stretch` flag and `placementCss`'s third argument writes: `setLineFit` MUST mirror it (`LineFit.stretch`).
