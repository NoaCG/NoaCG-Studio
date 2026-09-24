---
v: 1
scope: src/model/prefs.ts
kind: rule
fires: contract
status: active
since: 2026-09-24
supersedes: model/holds-small-device-level-workflow-defaults
record: contracts/records/model/2026-09-24-keep-small-device-level-workflow-defaults.md
---
Keep `prefs.ts` to small DEVICE-LEVEL workflow defaults in localStorage, NEVER synced: the default export target, whether the timeline is collapsed, the render settings, the code editors' comment view mode, the library view and the playout SPACE mode. It is a versioned format stamped `v`: an unstamped record migrates on read, a newer build's record reads as the defaults and is never written over, and a retired setting such as `advancedMode` is dropped rather than honoured. Keep this record tiny.
