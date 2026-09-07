# templates/record-catalog-baselines-same-change-editing

Rule: `templates/record-catalog-baselines-same-change-editing`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 48-50. Editing `shared/matchClock.ts` moves about 25 catalog hashes on its own, because every board that reads the clock re-serializes - re-record the catalog baselines in the same commit rather than treating that diff as a regression.
