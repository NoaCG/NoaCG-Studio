---
v: 1
scope: src/model/themeTokens.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-emits-only-tokens-consuming-stylesheet-actually.md
---
`tokenVarsCss` emits ONLY the tokens the consuming stylesheet actually reads - it matches each token name against the consumer CSS before emitting it. Same no-dead-knobs doctrine as the imported design's missing type scale: a variable nothing reads is a knob that turns nothing.
