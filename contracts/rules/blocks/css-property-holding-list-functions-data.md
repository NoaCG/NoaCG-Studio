---
v: 1
scope: src/blocks/filterTrack.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-css-property-holding-list-functions-data.md
---
`filter` is ONE CSS property holding a LIST of functions, so the data keeps ONE `filter` track of composed strings like `blur(8px) brightness(1.6)`; `filterTrack.ts` parses and composes that string so each function in `FILTER_FUNCS` - blur, brightness, saturate, hueRotate, and glow as a colourless centred drop-shadow - can be its own Inspector row.
