---
v: 1
scope: src/model/videoLayout.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-video-shell-keeps-own-layout-prefs.md
---
The video shell keeps its OWN layout prefs, separate from `layout.ts` on purpose: it has a simple code-and-preview split, not the SPX dockable workspace, so it stores only the split ratio and whether the code pane is collapsed.
