---
v: 1
scope: src/blocks/cssLength.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-reads-first-number-out-token-value.md
---
`cssLength.ts` reads the FIRST number out of a token value and writes a new one back between the same prefix and suffix, so `calc(16px * var(--scale))` keeps its multiplier and `blur(18px)` keeps its function. A value with no number (`none`) returns null and is left alone - that is a real state, not a zero.
