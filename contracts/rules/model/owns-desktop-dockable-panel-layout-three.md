---
v: 1
scope: src/model/layout.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-owns-desktop-dockable-panel-layout-three.md
---
`layout.ts` owns the desktop DOCKABLE-PANEL layout: three docks, each a `DockState` of panels, active and size, plus `timelineSize` for the centre's canvas and timeline split. A panel in NO dock is intentionally CLOSED and `loadLayout` never re-adds it - the user reopens it from a dock's plus button in `WorkspaceDock`. A layout one version behind is migrated by inserting the new panel once, because the older semantics say absent means closed; anything older resets to the default, and the mobile layout ignores all of this.
