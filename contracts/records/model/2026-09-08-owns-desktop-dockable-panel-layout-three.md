# model/owns-desktop-dockable-panel-layout-three

Rule: `model/owns-desktop-dockable-panel-layout-three`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md` and checked against the code: `PanelId` is code, inspector, data, control, style, assets, ai and export; the layout is version 3; `loadLayout` splices 'assets' in right after 'style' for a v2 record and returns the default for anything else; the plus button is `dock-add` in `src/components/WorkspaceDock.tsx`, fed by `hiddenPanels` in `src/components/AppShell.tsx`. Without the version bump no existing user would ever have seen the assets tab.
