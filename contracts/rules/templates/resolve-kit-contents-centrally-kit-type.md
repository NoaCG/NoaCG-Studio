---
v: 1
scope: src/templates/kit.ts
kind: rule
fires: contract
status: active
since: 2026-09-23
supersedes: templates/resolve-kit-contents-centrally-both-pack
record: contracts/records/templates/2026-09-23-resolve-kit-contents-centrally-kit-type.md
---
Resolve kit contents centrally in `kit.ts` from the kit's type cells in its ONE family and its `extras`. Have `kitChoices(pack)` offer the starter first, then the rest of the kit's library, then other types that resolve in the kit's family, and resolve selections through `kitSelection`.
