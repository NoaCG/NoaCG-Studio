---
v: 1
scope: src/components/AppShell.tsx, src/components/WorkspaceDock.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-lay-workspace-out-fixed-centre-canvas.md
---
Lay the workspace out from `model/layout.ts`: a fixed centre - the canvas over the timeline, split by a draggable divider - flanked by LEFT, RIGHT and BOTTOM docks, each hosting any of `code`, `inspector`, `data`, `control`, `style`, `assets`, `ai` and `export` as tabs, and each rendering only when it holds panels. `WorkspaceDock` draws a dock, AppShell `renderPanel` supplies the bodies with the tool panels wrapped in `.panel-body`, and MOBILE keeps the fused preview column plus SidePanel.
