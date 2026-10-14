# The convergence review: svg-import-engine

**Reviewed revision:** `9482bf113e10a0f52c3d75eb9f23995874a66446`. It is `main` at `a5992ed97`
(the merge of #1194), plus the commit that reconciles `specSha256` to the final spec. The ledger
anchors there; the receipts and this review come one commit later.

**Date:** 2026-10-14.

**Who reviewed.** The session that built phase 7 and closes the plan. Every phase was also
checked on `main` by a session that did not build it:
- **Phases 1 to 5:** one check each, all PASS.
- **Phase 6:** FAIL, then a repair (#1152), then PASS (#1156).
- **Phase 7:** PASS (#1193), with two findings fixed in #1194.

This review re-ran the mechanical criteria on current `main` instead of only citing those checks.

## What this review ran itself

| What | Result |
|---|---|
| `node scripts/gates.mjs audit` | OK, 45 checks and 238 test files declared |
| `node --test scripts/svg-layout-table.test.mjs scripts/svg-font-css.test.mjs` | 10 pass, 0 fail |
| `wc -l` on `svg.ts` and the three split files | 437, 217, 132, 62 |
| `npx eslint src/templates/importedDesign/runtime` | clean |
| the ARCHITECTURE §5 count command | 4 names as code references, 2 in comments (see AC-3) |
| the factory job's log on #1188 (job 115778723859) | harness 51 files, 601 records, 5 findings; rungs as stated in AC-6; 159 pass, 0 skipped |
| GitHub's file list of each phase's pull request | each inside its fence, one justified excursion (AC-7) |
| the open and closed state of every finding issue cited | #1138, #1144, #1145 and #1153 open; #1143 and #1148 since fixed |

## The verdict

**Nine pass.** Each criterion has its own receipt in this folder.

## What stays open, and is not this plan's

- **The e2e planner gap (#1138).** A change to a `?raw` runtime file alone does not select the
  import specs. The harness and the rungs cover it in the meantime.
- **Three open findings: #1144, #1145 and #1153.**
- **#800.** It lists the import walks still skipped, and the outline ranking walk kept because
  of it.
- **ARCHITECTURE §5's prose.** Another plan's move overtook it, and the wizard-structure plan's
  S7 rewrites it.
