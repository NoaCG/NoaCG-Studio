---
v: 1
scope: src/components/AppShell.tsx
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-defer-inspector-reveal-past-double-click.md
---
Defer the Inspector reveal past the double-click window: a new `selectedParts` selection arms a timer, any new pointer press cancels it, and a live canvas gesture (`canvasGestureActive`) skips it at fire time, so the workspace never resizes between the two clicks of a text double-click or under a drag. `e2e/inline-edit.spec.ts` pins it, and the reveal is desktop-only.
