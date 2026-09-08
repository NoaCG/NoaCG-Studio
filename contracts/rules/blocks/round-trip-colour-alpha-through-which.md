---
v: 1
scope: src/model/cssVars.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-round-trip-colour-alpha-through-which.md
---
Round-trip a colour WITH its alpha through `parseCssColor`/`formatCssColor`, which are ANCHORED - a shadow list is not a colour - and write it back in the form it arrived in: an opaque hex stays hex, a translucent one stays `rgba()`. `toHex` survives only because `<input type="color">` has no concept of alpha, and it must NEVER be the write path: it regex-SEARCHES for `rgba?(...)` anywhere in a value.
