---
v: 1
scope: src/model/videoTypes.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-records-settings-current-code-written-against.md
---
`authoredFor` records the settings the current code was WRITTEN against, and is null until a generation lands. The AI plans motion to a duration and a frame and writes the resulting numbers INTO the code, so changing the settings afterwards changes the player and the renderer but NOT the code: a shortened piece loses its exit, and a composition that paints its own background still renders opaque under a transparent setting. `settingsDrift(project)` says what no longer matches, in the user's words, and `driftRequest(project)` is the refinement that brings the code up to date.
