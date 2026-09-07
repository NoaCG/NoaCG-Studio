---
v: 1
scope: src/components/SidePanel.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-keep-mobile-surface-only-desktop-docks.md
---
Keep `SidePanel` the MOBILE surface only - desktop docks the panels through `WorkspaceDock` - as a seven-tab strip with the Inspector leading, because the mobile stack has no docks and the strip is the only route to where a layer is styled and animated. Render the Inspector RAW and wrap the tool panels in `.panel-body`; a new selection must NOT auto-switch the mobile tab, and there is no Motion tab because motion lives on the timeline plus the Inspector.
