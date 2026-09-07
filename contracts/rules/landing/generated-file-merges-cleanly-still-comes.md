---
v: 1
scope: **
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/landing/2026-09-07-generated-file-merges-cleanly-still-comes.md
---
A generated file merges cleanly and still comes out wrong. When a branch and main both regenerate the same compiled artefact, git resolves the two texts without a conflict and can drop whole regions of either side. After taking main in, re-run the generator and commit whatever it changes; never trust the merged text of a file a script writes.
