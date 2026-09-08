---
v: 1
scope: src/components/spaceKey.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-pass-explicitly-any-surface-stays-mounted.md
---
Pass `open` explicitly to `useModalGate(open)` from any surface that stays MOUNTED and renders null when closed - the wizard and the sign-in dialog both do - or the gate holds down for the whole session and silently kills every shortcut `editorShortcutsLive()` guards. The gate counts rather than flags, so stacked modals close correctly.
