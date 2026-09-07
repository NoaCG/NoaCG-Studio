# root/version-every-persisted-format-ship-breaking

Rule: `root/version-every-persisted-format-ship-breaking`. Recorded 2026-09-07 on `claude/root-contract-migration` at 39835021.

The catalog is large and templates are saved documents, so a shape change without a migration is data loss. Degrading honestly is what stops an older build eating newer data. The pattern is in docs/STATE_MACHINE_SCHEMA.md section 5 and implemented in blocks/animData.ts and model/layout.ts.
