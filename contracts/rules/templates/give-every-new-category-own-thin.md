---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-give-every-new-category-own-thin.md
---
Give every new category its own `AGENTS.md` and thin importing `CLAUDE.md` in its first commit. Keep category lessons at category scope and out of the catalog-wide contract, and use `npm run check:shared-instructions` to check instruction-chain headroom.
