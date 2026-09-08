---
v: 1
scope: src/model/aiThread.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-persists-create-conversation-graphic-created-captured.md
---
`aiThread.ts` persists the Create-with-AI CONVERSATION a graphic was created from, captured at create so the graphic carries the reasoning that produced it. It rides BESIDE `aiSpec` on `SavedProject` and `GraphicDoc` as an ADDITIVE OPTIONAL field, so no version bump and no migration. Only the talk turns travel - the wizard's heavy per-generation snapshots are a session affordance the editor cannot show and would be quota-heavy to persist. `normalizeThread` is the migrate-on-read guard: an unknown version becomes no thread, never a crash.
