---
v: 1
scope: src/model/prefs.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-holds-small-device-level-workflow-defaults.md
---
`prefs.ts` holds small DEVICE-LEVEL workflow defaults in localStorage and is NEVER synced: the default export target, whether the timeline is collapsed, the render settings, the code editors' comment view mode, the editor-visibility advanced switch (read live through `components/useAdvancedMode`) and the library view. Whether Home's graphics library reads better as cards or as a dense list depends on the library's size and the screen, not on the graphic, which is why it is a setting rather than session state. Keep this record tiny.
