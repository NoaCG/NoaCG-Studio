# A migrated contract can stop covering its own directory, and nothing reports it

**Filed:** 2026-09-09, out of the drained handoff for the `src/blocks` contract migration
(`git show 382ef2e6:docs/handoffs/2026-09-08-blocks-contract-migrated.md`, "What is next").
**Source:** the migration row's own audit, recorded in
`docs/metrics/2026-09-07-blocks-migrated.md`, "What the contract did not cover at all".

## Why

`src/blocks` migrated to `contracts/rules/blocks/` on 2026-09-08 - 69 rules. Four modules in that
directory are named by none of them: `behaviourData.ts`, `designFields.ts`, `layerTimeline.ts` and
`animationRegion.ts` (which landed on `main` while the row was running). Confirmed 2026-09-09:
`grep -rl 'behaviourData\|designFields\|layerTimeline\|animationRegion' contracts/rules/blocks/`
returns nothing, while twenty other `src/blocks/*.ts` modules are named by a rule's scope.

The four files are not the item. The metrics record names them and says what each does, so the
knowledge is not lost - and each carries a substantial header comment, which is where a reader
actually meets it. **The item is that nobody would have found out.** A hand-written contract goes
stale in both directions and only one of them leaves a trace:

- **A rule describing a mechanism that was removed** is caught. `check-retired-names.mjs` reads it,
  the freshness gate reads it, a reviewer trips over it. The `src/components` and `src/blocks` rows
  between them found three false claims and four stale comments of exactly that shape.
- **A module with no rule at all** is invisible. Nothing scans for it. The migration audit compares
  rules against rules; the compiler is content because ownership is read from the generated marker
  rather than from coverage; `--report` asks the opposite question (which rules no migrated
  directory owns). So the contract quietly stops describing the area it is named after, and the
  first person to find out is whoever edits one of those four files expecting the rules to have
  told them something.

`animationRegion.ts` is the shape that will recur: it arrived mid-migration, so no audit could have
seen it, and every future module in a migrated area arrives the same way.

## What it would take

**A coverage report, not a gate.** For each migrated directory, list the source files no rule's
scope names. It belongs beside the compiler's existing `--report`, which already answers the
mirror-image question.

A REPORT rather than a build gate, deliberately, and this is the judgement worth arguing with: a
new module landing with no rule yet is the NORMAL case, so failing the build on it would push
authors to invent a rule before they know what the module is - which is how a contract fills with
sentences nobody meant. The report is what makes the drift visible on a clock instead of on an
accident, the same freshness posture the rest of the repository takes.

Then the four modules above are read and either gain a rule or are recorded as having nothing that
binds - "no rule" is a defect only when it is unexamined.

## Evidence

- `docs/metrics/2026-09-07-blocks-migrated.md`, "What the contract did not cover at all" - the four
  modules, what each does, and why the fourth escaped.
- `contracts/rules/blocks/` - 69 rules; the twenty `src/blocks/*.ts` paths their scopes name do not
  include the four.
- `docs/WORKFLOW_ARCHITECTURE.md`, "Phase 2b, the first row, as landed" - ownership read by
  scanning for the generated marker, and what `--report` covers.
