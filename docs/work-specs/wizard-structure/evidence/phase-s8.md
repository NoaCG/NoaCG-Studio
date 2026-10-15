# Phase S8: template folder move (AC-2, AC-9, AC-11)

Recorded by the S8 builder (branch `claude/plan-wizard-shell-p10-build`), 2026-10-15, Windows 10.
Before = `origin/main` at `7b25eb2a8` (S7 checked PASS there). The owner added S8 to the phase list
on 2026-10-15. Node, depcruise, tsc and eslint ran from this worktree against the primary
checkout's `node_modules`; the browser plan runs on the pull request's CI.

## What changed

| Area | Change |
|---|---|
| `src/components/wizard/kitPlan.ts`, `KitTray.tsx` | moved to `template/` (git renames); only their relative imports changed |
| `CreationWizard.tsx`, `shell/walkState.ts`, `steps/KitPicker.tsx`, `template/useKit.ts` | import paths; two comments in `walkState.ts` and `useKit.ts` name the new path |
| `scripts/wizard-kit-plan.test.mjs`, `wizard-kit-moves.test.mjs`, `wizard-walk-state.test.mjs` | the loaded path and the `// guards:` header |
| `e2e/wizard-kit.spec.ts` | the two `page.evaluate` loaders import `/src/components/wizard/template/kitPlan.ts`; no assertion or selector changed |
| `contracts/rules/*` (9 files), the compiled contracts | scopes renamed: active `build-whole-kit-moment-kit-step`, `gate-every-kit-preview-intersection-give`, `make-apply-style-all-deterministic-transform`, `put-door-each-kit-community-packs`; retired `capture-project-brand-every-wizard-create`, `give-kit-community-packs-shelf-door`, `give-kit-door-top-browse-swaps`, `make-kit-look-question-deterministic-transform`, `walk-kit-through-same-six-steps` |
| `src/components/wizard/template/AGENTS.md` | the compiler's marker; the compile wrote the contract and its `.gitattributes` |
| `.dependency-cruiser.cjs` | `wizard-template-only-from-the-walk`: only the shell, `shell/` and `steps/` import `template/` |
| `docs/ARCHITECTURE.md` | section 8's wizard line |
| `docs/PACK_TAXONOMY.md` | one path |
| `docs/metrics/2026-10-14-wizard-shell.md` | chains after S8, the budget row, plan widths |

## Commands and results

| Command | Result |
|---|---|
| `node --test scripts/wizard-kit-plan.test.mjs scripts/wizard-kit-moves.test.mjs scripts/wizard-walk-state.test.mjs scripts/wizard-walks.test.mjs scripts/wizard-doors.test.mjs scripts/wizard-draft.test.mjs` | 98 of 98 pass |
| `tsc --noEmit -p tsconfig.json` | clean |
| `eslint --max-warnings 0` on the changed `src`, e2e and script files and `.dependency-cruiser.cjs` | clean |
| `npm run depcruise` | no violations (1,379 modules, 6,371 dependencies) |
| the same with `import { buildKit } from '../template/kitPlan'` appended to `import/drop.ts` | refused by `wizard-template-only-from-the-walk` (file restored) |
| `npm run contracts:compile` | 562 rules; 4 `.claude/rules` files renamed with their scopes, the `template/` contract written |
| `npm run check:contracts` | OK, 562 rules, 263 generated files current |
| `node scripts/check-shared-instructions.mjs`, `check-contract-freshness.mjs` | OK |
| `npm run audit:instructions` | ran; of the wizard rules it lists only `order-entry-step-four-equal-start`, as at S7 |
| `npm run gates -- run --changed origin/main` | every gate ok (14), 54 Node tests in 4 files |
| `node scripts/e2e-affected.mjs --list --files <path>` before and after | `kitPlan.ts` 40 and `KitTray.tsx` 40 at both paths, identical lists |
| `node scripts/e2e-affected.mjs --list` over the branch | 67 specs (the `steps/KitPicker.tsx` import pulls in its 62) |
| `git diff --name-only origin/main...HEAD -- src` (AC-9) | the two moved files, the four importers, the `wizard/`, `steps/` and `template/` contracts and the generated `.gitattributes` |

## Chains (AC-7), bytes

Counted as `check-shared-instructions.mjs` counts a chain (every `AGENTS.md` root to folder,
LF-normalised, 2 bytes per join), from the committed files. The S7 column reproduced exactly on
`7b25eb2a8` before the move.

| Chain | After S7 | After S8 |
|---|---:|---:|
| shell (`CreationWizard.tsx`, `shell/`) | 33,996 | 32,333 |
| `template/` | 33,996 | 34,255 |
| `import/` | 41,536 | 39,873 |
| `steps/` | 41,414 | 40,970 |
| the AI step (`ai/`) | 43,741 | 42,078 |

The wizard contract went from 10,443 to 8,780 bytes; `steps/` from 7,416 to 8,635 (three of the
four kit rules also name `steps/` files); `template/` is 1,920.

## Not run here

The browser plan (CI runs it on the pull request and in the merge group) and the production
build (CI Build). AC-2's journeys are the CI plan; this phase changes no behaviour, so a visual
before and after has nothing to compare.
