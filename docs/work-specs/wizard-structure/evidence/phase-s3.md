# Phase S3: walks table (AC-2, AC-3, AC-9)

Recorded by the S3 builder (branch `claude/plan-wizard-shell-p5-build`), 2026-10-14, Windows 10.
Before = `origin/main` at `29883468f`. The local browser queue was not used: about 2.6 GB was
free against its 4 GB floor (#1067), so every journey runs on the pull request's CI.

## Prerequisite

`e2e/project-format.spec.ts` revived in its own pull request, #1173, queued to land before this
one. On its CI (run 38529200781, E2E subset) 9 of its 12 tests passed and 3 skipped. They finish
through Finish's "Edit this graphic" door or, on the AI walk, the export door, instead of the old
code-editor door, and read the created graphic's format from the working document. Still skipped,
because their surface is gone with the old editor: blank artwork, render output settings (old
Export dock, and the render panel shows only with a render backend), the restored-format chip.
`node scripts/check-e2e-protection.mjs --changed origin/main`: OK.

## Commands and results

| Command | Result |
|---|---|
| `node --test scripts/wizard-walks.test.mjs` | 10 of 10 pass |
| seven mutations of `shell/walks.ts` (Next without a category on Design, the kit hub's sub reworded, the template walk's design step moved, the built-kit preview rule dropped, the file step's preview dropped, Skip offered on the shelf, the brand offered on the AI Finish) | each turned one test red |
| `npx tsc --noEmit -p tsconfig.json` | clean (both changed `src` files in the program) |
| `npx eslint` over `CreationWizard.tsx` and `shell/walks.ts` | clean |
| `npx depcruise --config .dependency-cruiser.cjs src` | no violations, no config change (1371 modules) |
| `npm run gates -- run --changed origin/main` | every gate ok, including `check:file-budgets` (2,357 of 2,357) |
| `git diff --name-only origin/main...HEAD -- src` (AC-9) | `CreationWizard.tsx`, `shell/walks.ts` |
| section 5 counter (phase-s2.md's command) | 15 of 48, unchanged |
| `node scripts/e2e-affected.mjs --list --files src/components/wizard/shell/walks.ts` | 40 specs, among them `wizard-shell`, `wizard-finish`, `wizard-kit`, `project-format`, `template-deep-link`, `wizard-draft-guard` (the shell's own plan: 53) |
| browser journeys of the section 6 row (`wizard-shell`, `wizard-finish`, `wizard-kit`, `project-format`, every mode's step-URL journey in `wizard-shell`) | on the pull request's CI; all are in the shell's affected plan |

## How "identical" is checked

`scripts/wizard-walks.test.mjs` carries, as plain functions, the shell's expressions from
`29883468f` for `nextDisabled`, `showPreview`, the brand chooser, `listsDesigns`, Skip to finish,
the rail's `disabled`, `editSummaryStep`, `railPos` and `goToStep`'s ordinary target, `animStep`
and `finishStep`. Each test enumerates every mode, build mode, kit state, step and the booleans the
expression reads, and asserts the walk table's answer equals the old one. The one difference
allowed is the video walk's Finish index (5 before, 2 now): both are past its last step, which the
test asserts, so every comparison the shell makes with it gives the same answer.

## Shell size

2,482 lines before, 2,357 after; `scripts/file-budgets/components-wizard-CreationWizard.json`
lowered from 2,482 to 2,357 (AC-10).

## Limitations

No browser journey ran on this machine; they run on the pull request's CI. The Node equivalence
covers the rules that moved. The ladder's branches were re-keyed by hand (`stepId === ...`), which
the Node test cannot see; the journeys of the section 6 row are what prove each step still renders.
