---
v: 1
scope: src/components/home/ProductionPage.tsx
kind: rule
fires: contract
status: active
since: 2026-10-24
record: contracts/records/components/2026-10-24-playout-behaviour-production-page-lands-verb.md
---
Playout behaviour of the production page lands in `src/control/`: a verb, a take refusal, a fold over what is on air, a poll, a timer or a lifetime goes in a plain module there that runs in Node, takes the browser through an injected `io` and keeps its state in a store part there (the page's `playoutSession`, or `serverPlayoutStore` for the server's ownership and timing). `ProductionPage.tsx` keeps selection, the session hook, the wires, the derived view and the render, and calls those modules rather than growing the behaviour back.
