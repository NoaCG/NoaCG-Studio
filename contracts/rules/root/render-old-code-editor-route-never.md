---
v: 1
scope: src/App.tsx, src/app/router.ts, src/model/prefs.ts
kind: invariant
fires: test:e2e/no-old-editor.spec.ts
status: active
since: 2026-09-24
record: contracts/records/root/2026-09-24-render-old-code-editor-route-never.md
---
The old code editor (`AppShell`, its dock, its Monaco pane and its teaching layer) is deleted: never bring it back as a file, a route, a door or a setting, and render no editor from `src/App.tsx` but the new editor and the video workspace. The bare, `#/` and unknown hashes show Home without rewriting a fragment the app does not own, a stale `#/graphic/<id>` opens that graphic's control page, the wizard's close and Escape land on Home, and `src/model/prefs.ts` drops a stored `advancedMode` on read. `e2e/no-old-editor.spec.ts` pins it, module request included.
