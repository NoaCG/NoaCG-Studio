---
v: 1
scope: src/model/themeTokens.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-token-value-complete-css-value-calc.md
---
A token's value is a COMPLETE CSS value - a calc expression, a keyword, a percentage - never a bare number, so one token covers a scaled length, a keyword and a percentage without the consuming rule knowing which it got. The shadow-slot neutral is `NO_SHADOW`, not `none`, because these compose into comma-separated `box-shadow` lists and a list of `none` values is invalid CSS.
