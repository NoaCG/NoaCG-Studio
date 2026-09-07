---
v: 1
scope: src/ai/safety.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-treat-regex-screen-obvious-constructs-containment.md
---
Treat `safetyFindings` as a regex screen for obvious constructs, not containment; code such as `window['fetc'+'h']` can evade it. Do not claim a same-origin runtime preview is isolated by this check.
