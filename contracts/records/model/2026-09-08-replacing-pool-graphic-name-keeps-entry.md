# model/replacing-pool-graphic-name-keeps-entry

Rule: `model/replacing-pool-graphic-name-keeps-entry`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

The conflict-copy stripping lives in `makeConflictCopy` in `src/backend/sync.ts`. The contract this rule replaced named three stripped fields; the code strips five, having gained the join and presenter slugs since.
