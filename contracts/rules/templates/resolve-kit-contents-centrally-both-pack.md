---
v: 1
scope: src/templates/kit.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-resolve-kit-contents-centrally-both-pack.md
---
Resolve kit contents centrally in `kit.ts` from both the pack's type-by-family cells and its `extras`. Have `kitChoices(pack, family)` offer those contents followed by other resolvable graphic types, validate every offered row through `resolvePack`, and resolve selections through `kitSelection`.
