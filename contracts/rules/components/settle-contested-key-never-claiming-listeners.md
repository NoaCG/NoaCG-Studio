---
v: 1
scope: src/components/spaceKey.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-settle-contested-key-never-claiming-listeners.md
---
Settle a contested key in `spaceKey.ts` and never by claiming it: the listeners are SIBLINGS on one `window` node, so `stopPropagation` cannot reach across and the order they fire in is only the order they subscribed, which an unrelated `useEffect` dep can change. Every surface asks the same question and acts only on its own answer, and the guard must answer on EVERY keydown including OS auto-repeat, because a held key is the real gesture.
