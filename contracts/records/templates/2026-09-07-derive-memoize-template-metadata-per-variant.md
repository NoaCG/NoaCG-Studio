# templates/derive-memoize-template-metadata-per-variant

Rule: `templates/derive-memoize-template-metadata-per-variant`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 145-151. - **templateMeta.ts** - the DERIVED bulk, memoized per variant: field counts off the compiled   schema (`visible` excludes `HIDDEN_CONFIG_FIELDS`; buckets match the reachable range by   INTERSECTION), capabilities (declared extras ∪ schema/preset derivation), placement   (coverage class → placements), motion (the per-preset table in model/taxonomy.ts),   complexity, and pack-derived programme relevance (a format's pack contains any type whose   graphic CATEGORY matches - category-level so unclaimed classics rank like their typed   siblings; `relevance: 'all'` categories match everything, ranked below genuine hits).
