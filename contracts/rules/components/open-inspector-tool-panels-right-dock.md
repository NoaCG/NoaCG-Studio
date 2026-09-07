---
v: 1
scope: src/components/AppShell.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-open-inspector-tool-panels-right-dock.md
---
Open with `DEFAULT_LAYOUT`: the Inspector and the tool panels in the RIGHT dock, the LEFT and BOTTOM docks EMPTY, and the `code` panel CLOSED, because the code view is optional and a Monaco pane across a third of the window tells a first-time reader the opposite. An absent panel is what closed MEANS - `loadLayout` never re-adds one - so the choice persists; a stored version-2 layout is migrated by adding `assets`, and any other version falls back to the default.
