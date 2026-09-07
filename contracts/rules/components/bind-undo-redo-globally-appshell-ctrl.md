---
v: 1
scope: src/components/AppShell.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-bind-undo-redo-globally-appshell-ctrl.md
---
Bind undo and redo globally in AppShell - Ctrl/Cmd+Z to `undo()`, Ctrl/Cmd+Shift+Z and Ctrl+Y to `redo()` - and stand down when focus is in Monaco or a form field, or while `modalOpen()` is true. A dialog's Ctrl+Z belongs to the dialog, never to the document behind it.
