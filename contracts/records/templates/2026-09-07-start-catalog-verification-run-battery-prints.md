# templates/start-catalog-verification-run-battery-prints

Rule: `templates/start-catalog-verification-run-battery-prints`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 7-20. **Twenty-two subdirectories own their own contract** - `types/`, `pack4/` and the twenty categories listed under "Categories" below - each an `AGENTS.md` with a thin `CLAUDE.md` importing it, loaded only when you work in that directory. A section that describes ONE directory belongs there, not here: this file is read in full by every session touching any template.  **START WITH `npm run catalog:affected`.** It reads the diff and says which designs the change can move, then prints the exact battery - scoped with `--only <ids>` where it could attribute the change to named designs, and the whole catalog where it could not (a category's `shared.ts`, a preset bank, `types/`, fonts, the theme tokens, `src/blocks/`, a gate script, a baseline). Editing one design should cost one design's worth of machine time. Nothing about WHAT is measured changes - only how many designs it is measured over, and the NIGHTLY runs all five unscoped (CI carries the emit gate and the calibration tripwire; the four sweeps are nightly-only, as they always were). `npm run check:catalog-emit` is the three-second first answer (emitted code, hidden data holders, name collisions) and needs no dev server. Details: docs/VERIFICATION.md.
