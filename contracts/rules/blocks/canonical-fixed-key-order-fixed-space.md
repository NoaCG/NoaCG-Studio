---
v: 1
scope: src/blocks/animData.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-canonical-fixed-key-order-fixed-space.md
---
`serializeAnimData` is CANONICAL: fixed key order, fixed 2-space indentation, keyframes one per line, numbers rounded to 3 decimals - a fixed point, `serialize(parse(serialize(x))) === serialize(x)`, so a small visual edit only touches the lines it changed.
