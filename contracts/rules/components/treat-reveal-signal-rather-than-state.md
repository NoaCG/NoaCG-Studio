---
v: 1
scope: src/components/AppShell.tsx
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-treat-reveal-signal-rather-than-state.md
---
Treat `activePanel` as a REVEAL signal rather than as state: the docks key the reveal on `panelRevealNonce`, which every `setActivePanel` call bumps, so re-requesting the stored default still reveals and mount never does. Keying on the value alone clobbers the layout's own active tab on any unrelated re-render.
