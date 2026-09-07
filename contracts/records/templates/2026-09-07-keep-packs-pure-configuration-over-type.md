# templates/keep-packs-pure-configuration-over-type

Rule: `templates/keep-packs-pure-configuration-over-type`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 91-94. **packs.ts** - the PACK taxonomy (docs/PACK_TAXONOMY.md): a pack is a curated type-subset in a default family, PURE CONFIG over the types x families matrix; the 60 reference formats each map to exactly one pack. `scripts/factory.mjs` validates the config on every run (cells resolve, extras exist, formats covered exactly once) - edit packs.ts and the doc together.
