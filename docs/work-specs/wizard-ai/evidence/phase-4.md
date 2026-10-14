# Phase A4: folder move (AC-2, AC-9, AC-10, AC-11)

Recorded by the A4 builder (branch `claude/plan-wizard-ai-p4-build`), 2026-10-14, Windows 10.
Before = `origin/main` at `a5992ed97`. Candidate = the branch head the queue lands.

## What changed

| Path | What it does |
|---|---|
| `src/components/wizard/ai/{AiStep,AgentRouteCard,MoreControlPanel,ProPanel,UploadCard}.tsx` | `git mv` from `steps/AiStep.tsx` and `steps/ai/*`. The only edits are relative imports: `./ai/X` -> `./X` in the step (it stays at the same depth), one `../` fewer in the four former `steps/ai/` files. `git diff -M origin/main` shows renames with 1 to 12 changed import lines each |
| `src/components/wizard/steps/AiStep.tsx` | one line, `export { default } from '../ai/AiStep';`, so `CreationWizard.tsx:115`'s lazy import is untouched |
| `src/components/wizard/steps/VideoStep.tsx` | its `UploadCard` import follows the file (`./ai/UploadCard` -> `../ai/UploadCard`); not in the row's file list, but the move breaks the build without it |
| `src/components/wizard/ai/AGENTS.md`, `.gitattributes` | the marker (line 1 of the wizard contract), then the compiler's output: 23 rules |
| `src/components/wizard/steps/ai/AGENTS.md`, `.gitattributes` | deleted (S1a's note: the compiler never flags a `.gitattributes` whose folder lost its marker) |
| 31 files in `contracts/rules/wizard/` | `scope:` only: `steps/ai/` -> `ai/`, `steps/AiStep.tsx` -> `ai/AiStep.tsx`. 26 active, and 5 retired ones, because the compiler refuses a scope that matches no file |
| `src/components/wizard/steps/AGENTS.md`, `contracts/index.md`, 11 `.claude/rules/*` | regenerated (`npm run contracts:compile -- --prune`: the rescoped scopes rename 11 Claude rule files, over the compiler's 4-deletion guard) |
| 11 covers headers | `steps/{AiStep.tsx,ai/**}` -> `ai/**`; `ai-consent`, `ai-more-control`, `design-rules-product`, `image-purpose` also name `src/ai/creation.ts`; `configured/pro-wizard` names `ai/{AiStep,ProPanel}.tsx` and `src/ai/creation.ts` |
| `scripts/file-budgets/components-wizard-ai-AiStep.json` | renamed from `...-steps-AiStep.json`; `file` is the moved step, 1,659 lines (unchanged, AC-10) |
| `scripts/check-file-budgets.mjs`, `scripts/ai-lite-bench.test.mjs`, `scripts/e2e-affected.test.mjs` | the guards line, the validator guard's read and the configured-flag pin name `wizard/ai/AiStep.tsx` |
| `scripts/metrics/cochange.mjs` | a comment; the `ai` prefixes already held `wizard/ai/`, and the two old ones stay for the history the window reads |

`git diff --name-only origin/main...HEAD -- src` (AC-9): the five moved files, the shim, the two
deleted generated files, the new marker and its `.gitattributes`, the regenerated
`steps/AGENTS.md`, and `steps/VideoStep.tsx`. Never `CreationWizard.tsx`.

## Plan widths

`node scripts/e2e-affected.mjs --list --files <path>`, 233 spec files on disk:

| Path | Before (A1/A2 notes) | After |
|---|---:|---:|
| the step (`steps/AiStep.tsx` before, `ai/AiStep.tsx` after) | 45 | 43 |
| `src/components/wizard/ai/ProPanel.tsx`, `UploadCard.tsx` | 44 (as `steps/ai/*`) | 43 |
| `src/ai/creation.ts` | 15 | 19 |
| `src/components/wizard/steps/AiStep.tsx` (the shim) | | 44 |

The step's two fewer: `wizard-draft-guard.spec.ts` came only from the nightly traced map, whose
keys are still the old paths (the shim's 44 keeps it). The next nightly refresh of
`scripts/e2e-traced.json` traces the new paths; it is machine-written with its sha, so it is not
hand-edited here. `creation.ts` gains the four covering specs `src/ai/**` did not reach. The
step, `ProPanel.tsx` and `creation.ts` raise the configured flag (the Pro spec's covers);
`UploadCard.tsx` does not.

## Chain sizes after the marker

The way `check-shared-instructions.mjs` counts a chain: every `AGENTS.md` from the root to the
file's folder, LF-normalised, plus 2 bytes per join.

| Edited file | Before | After | Chain after |
|---|---:|---:|---|
| `src/components/wizard/CreationWizard.tsx` | 34,920 | 34,920 | root 2,863 + src 8,987 + components 11,697 + wizard 11,367 + 6 |
| `src/components/wizard/import/*` | 42,460 | 42,460 | the shell chain + import 7,538 + 2 |
| `src/components/wizard/steps/*` | 42,980 | 42,338 | the shell chain + steps 7,416 + 2 |
| the AI step | 52,023 (`steps/ai/`) | 44,599 (`ai/`) | the shell chain + ai 9,677 + 2 |

The AI-step chain lost the `steps/` contract (8,058) and gained one rule
(`open-create-step-user-own-coding`, 641 bytes with its line, scoped to the step and its agent-route
card, so now placed in `ai/`, which is also why `steps/` shrank). Against the 40,960-byte target of
`docs/METRICS.md`: the AI step is 3,639 over, `steps/` 1,378, `import/` 1,500. `npm run
metrics:contracts` no longer lists the AI step among the five tightest chains (the fifth is
48,520). The root contract grew 113 bytes since S1a's numbers, which is why the shell chain reads
34,920, not 34,807.

## Commands and output

- `npm run -s contracts:compile -- --prune`: `wrote 260 file(s) from 561 rule(s)`; then
  `npm run check:contracts`: `OK - 561 rule(s), 259 generated file(s) current`.
- `node scripts/check-shared-instructions.mjs`: `Shared instructions OK: 58 AGENTS.md/CLAUDE.md
  pair(s)`; tightest chain `src/ai/pro/harness` 58,263.
- `node scripts/gates.mjs run --changed origin/main`: 13 checks ok (shared-instructions,
  contract-freshness, contract-citations, client-secrets, gate-coverage, file-budgets
  `1659 of 1659`, client-neutral, copy, preview-serialization, contracts, contract-evidence,
  retired-names, landed-ref) and 5 test files, 78 of 78.
- `node --test scripts/e2e-affected.test.mjs` 81 of 81; `scripts/ai-lite-bench.test.mjs` 28 of 28;
  `scripts/compile-contracts.test.mjs` 28 of 28.
- `npm run depcruise`: no dependency violations (1,374 modules), config unchanged.
- `npx tsc --noEmit -p tsconfig.json`: clean. `npx eslint --max-warnings 0` on the changed source
  and scripts: clean.

## Limitations

- Browser evidence is CI's: the pull request's affected plan and its merge-group run. The local
  queue was not used (the moved files change no behaviour; the plan is 43+ specs).
- Comments in `src/ai/creation.ts:5`, `src/model/aiThread.ts:2`, `src/model/cssVars.ts:21` and
  `src/styles/wizard-describe.css:200` still name the old paths; they sit outside A4's `src`
  fence and are left for A5 or the shell's S7.
