---
v: 1
scope: src/components/save/SaveControls.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-report-save-state-honestly-topbar-saved.md
---
Report save state honestly in the topbar - Not saved, Unsaved changes, Saving…, Saved, Save failed - beside the Save button and its menu of Save As and open-saved. Ctrl/Cmd+S binds in the CAPTURE phase so it works inside Monaco and the browser's own save-page dialog never appears, and it stands down under a modal.
