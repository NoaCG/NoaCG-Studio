---
v: 1
scope: src/components/ExportWindow.tsx
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-mount-once-beside-routed-surface-because.md
---
Mount `ExportWindow` ONCE in `App.tsx` beside the routed surface, because Home is a SIBLING of AppShell and both open it through `useExportUi.openExport(request)`, so mounting it per shell would put two modals on screen. Close it on a route change - the request is a SNAPSHOT of one graphic and must not outlive its surface - recording the opening route on the effect's FIRST run for that request, so the wizard's batched close, navigate and open hop is not mistaken for navigating away.
