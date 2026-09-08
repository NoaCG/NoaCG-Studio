---
v: 1
scope: src/ai/provider.ts, src/ai/claudeProvider.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-pass-bounded-oldest-first-caller-render.md
---
Pass bounded, oldest-first `GenerateContext.conversation` from the caller and render it in `contextText`, `modifyContent` and `specRefine`; the provider must not reread a UI session. Use `seed` in fresh generation as a direction to vary, never as three tints of the previous result.
