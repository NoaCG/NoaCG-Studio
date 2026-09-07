---
v: 1
scope: src/components/playoutKeys.ts, src/components/HostedControlPage.tsx
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-keep-every-playout-verb-key-keymap.md
---
Keep every playout verb key in `components/playoutKeys.ts`, the one keymap both React surfaces read, and never in a surface of its own; the exported controller keeps its own copy because it ships without React. Bind them while playout is the surface ON SCREEN rather than merely mounted - `usePlayoutVerbKeys(onKey, sub === null)` on the in-app page, which renders Data and Audience with the playout column hidden behind them - and let `HostedVerbs` be the component the hosted page binds in, because the hooks rule forbids binding a key while the page is still resolving its show.
