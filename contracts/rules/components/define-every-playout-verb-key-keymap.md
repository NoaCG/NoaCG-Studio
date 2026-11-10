---
v: 1
scope: src/components/playoutKeys.ts, src/components/home/ProductionShell.tsx
kind: invariant
fires: contract
status: active
since: 2026-11-10
supersedes: components/keep-every-playout-verb-key-keymap
record: contracts/records/components/2026-11-10-define-every-playout-verb-key-keymap.md
---
Define every playout verb key in `components/playoutKeys.ts`, the one keymap the production page reads, and never in a surface of its own; the exported controller keeps its own copy because it ships without React. Bind them while playout is the surface ON SCREEN rather than merely mounted - `usePlayoutVerbKeys(onKey, sub === null)`, because the page renders Data and Audience with the playout column hidden behind them.
