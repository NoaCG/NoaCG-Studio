# blocks/legacy-region-reader-nothing-more-reads

Rule: `blocks/legacy-region-reader-nothing-more-reads`. Recorded 2026-09-07 on `claude/migrate-agents-contract-rules-5ab9fc` at 39835021.

Its callers are `blocks/animImport.ts`, which converts legacy regions through the reader, and `components/timeline/LegacyTimeline.tsx`, which charts the overview for a region the importer refuses. Coverage is e2e/legacy-timeline.spec.ts with fixtures in e2e/_legacy.ts.
