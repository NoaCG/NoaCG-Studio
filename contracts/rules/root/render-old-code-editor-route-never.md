---
v: 1
scope: src/App.tsx, src/app/router.ts, src/components/AppShell.tsx, src/model/prefs.ts
kind: invariant
fires: contract
status: active
since: 2026-09-24
record: contracts/records/root/2026-09-24-render-old-code-editor-route-never.md
---
Render the old code editor, `src/components/AppShell.tsx`, from NO route and never import it from `src/App.tsx`; keep its source until the new editor has taken over what is worth keeping. The bare, `#/` and unknown hashes show Home without rewriting a fragment the app does not own, a stale `#/graphic/<id>` opens that graphic's control page, and the wizard's close and Escape land on Home. No setting brings a door back: Advanced mode is gone and `src/model/prefs.ts` drops a stored `advancedMode` on read. `e2e/no-old-editor.spec.ts` pins it.
