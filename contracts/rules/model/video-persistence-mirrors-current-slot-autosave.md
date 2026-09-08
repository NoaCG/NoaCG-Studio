---
v: 1
scope: src/model/videoProject.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-video-persistence-mirrors-current-slot-autosave.md
---
Video persistence MIRRORS `project.ts` and `packets.ts`: one current slot on autosave plus a saved list with soft-delete tombstones. The autosave returns false on quota rather than throwing, so the shell can WARN - video assets are big enough that a quiet failure would lose real work.
