# Phase S7: close-out (AC-7, AC-8, AC-10, AC-11)

Recorded by the S7 builder (branch `claude/plan-wizard-shell-p9-build`), 2026-10-14, Windows 10.
Before = `origin/main` at `33fa907c4` (S6's merge). The AI track's A4 (#1199) and A5 (#1203) had
landed, so the rule pass ran after A5 as section 8 orders. The local browser queue was not used
(under 4 GB free, #1067); the full affected plan runs on the pull request's CI.

## What changed

| Area | Change |
|---|---|
| `src/components/wizard/CreationWizard.tsx` | the lazy import names `./ai/AiStep`; nothing else (1,419 lines, budget 1,419) |
| `src/components/wizard/steps/AiStep.tsx` | the A4 re-export, deleted |
| `src/ai/creation.ts`, `src/model/aiThread.ts`, `src/model/cssVars.ts`, `src/styles/wizard-describe.css` | unchanged: their stale path comments (the AI track's hand-off) are #1227, because a comment edit there adds 11 specs (`creation.ts`) or the whole suite (the other three) to the plan |
| `src/components/wizard/shell/doors.ts` | three `DoorIo` comments name where the save, the made record and the set doors' busy line live |
| `src/components/wizard/shell/walkState.ts` | `chooseBrand` calls `committedKit(state, state.kit)`; `isKitEditStep` reads `walkOf('template', true).animStep` |
| `scripts/wizard-walk-state.test.mjs` | the `committedKit` test pins every kit-walk step of `isKitEditStep` in both build modes |
| `scripts/metrics/cochange.mjs` | shared files matched by prefix; `src/components/wizard/shell/` added |
| `contracts/rules/wizard/*` (20 files), the records, the compiled contracts | three retirements, nine rescopes, one symbol correction, seven e2e scopes dropped |
| `docs/ARCHITECTURE.md` | section 5 rewritten, section 8's wizard line |
| `docs/metrics/2026-10-14-wizard-shell.md` | new |

## Commands and results

| Command | Result |
|---|---|
| `node --test scripts/wizard-walk-state.test.mjs scripts/wizard-kit-moves.test.mjs scripts/wizard-walks.test.mjs scripts/wizard-doors.test.mjs scripts/wizard-draft.test.mjs scripts/wizard-kit-plan.test.mjs scripts/import-drop.test.mjs` | 109 of 109 pass |
| the same with `isKitEditStep` bounded by `finishStep`, then by `animStep - 1` | 1 fail each (before the new assertion both passed every test) |
| the same with `chooseBrand` passing `state.kit` uncommitted | 1 fail (`wizard-kit-moves`) |
| `node --test scripts/e2e-affected.test.mjs scripts/compile-contracts.test.mjs scripts/ai-creation.test.mjs scripts/check-file-budgets.test.mjs` | 150 of 150 pass |
| `tsc --noEmit -p tsconfig.json` | clean |
| `eslint --max-warnings 0` on the changed `.ts`/`.tsx` files | clean |
| `planFor` over the branch's changed files (`scripts/e2e-affected.mjs`) | subset, 53 specs, the shell's own plan |
| `npm run depcruise` | no violations (1,379 modules) |
| `npm run contracts:compile -- --prune` | 562 rules, 262 files written; the six removed `.claude/rules` files are renames (their scope keys changed) |
| `npm run check:contracts` | OK, 562 rules, 261 generated files current |
| `npm run gates -- run --changed origin/main` | every gate ok except `test:ai-gateway`: `@anthropic-ai/sdk` is not installed in this machine's `node_modules` (environment; CI installs it) |
| `npm run audit:instructions` | ran; of the wizard rules it lists only `wizard/order-entry-step-four-equal-start` (named as a next candidate) |
| `node scripts/check-shared-instructions.mjs` | OK |
| the section 5 counter (`docs/ARCHITECTURE.md`) | 15 of 48, unchanged since S2 |

## Rule pass (D11, section 7)

- **Retired** (each record says what carries it now): `keep-browse-filter-state-creationwizard-back`
  (the reducer's record and its functional-update Node test), `hold-import-images-continuation-old-importstep`
  (each walk's steps are data, pinned per walk), `resolve-deep-linked-through-hit-apply` (one
  `pickPatch`, pinned in Node; `template-deep-link` pins Fields, no project and the Entry
  fallback).
- **Kept:** `spread-every-handler-patches-make-visible`; the drop doors did not absorb it
  (`import/MapSvgFieldsStep.tsx` still patches `svgStretch` in its handlers).
- **Rescoped** by adding the module that holds the behaviour: the door rules
  `send-all-three-finish-doors-through`, `lead-finish-add-production-every-finish` (+ `shell/doors.ts`),
  `snapshot-walk-each-three-appliers-finish` (+ `shell/walkState.ts`, `shell/useWalkLifecycle.ts`);
  the lifecycle rules `give-every-wizard-step-own-history` (+ `shell/walks.ts`, `shell/walkState.ts`),
  `list-saved-brands-name-footer-brand` (+ `shell/walkState.ts`), `put-footer-jump-finish-every-step`
  (+ `shell/walks.ts`, `template/walk.ts`); the kit rules `build-whole-kit-moment-kit-step`
  (+ `template/useKit.ts`), `make-apply-style-all-deterministic-transform` (+ `template/useKit.ts`,
  `template/KitConfirms.tsx`), `put-door-each-kit-community-packs` (+ `template/useKit.ts`,
  `template/walk.ts`).
- **Corrected in place:** `offer-control-can-change-graphic-front` names `offersBrand` for the
  removed `BRAND_MODES`; same demand, same id (cited from two `import/` files, an e2e spec and a doc).
- **Scopes dropped:** the e2e half of the seven retired wizard rules that had one.
- `npm run learn` appended the evidence to the four rules' records and wrote one observation for
  the pass (`contracts/records/wizard/2026-10-14-observed-close-out-docs-work-specs-wizard.md`).
  `learn` writes new rules and supersessions only; a retirement or a scope change is an edit of
  the rule file's `status:` or `scope:` line and a recompile (contracts/README.md), as A4 did.

## Chains, co-change, budgets

In `docs/metrics/2026-10-14-wizard-shell.md`. Chains after S7: shell 33,996 (under the 40,960
target), `import/` 41,536, `steps/` 41,414, the AI step 43,741; each was 924 bytes higher before
S7. Co-change with the fixed matcher equals the exact-path figures on every window (60 days:
import 27%, AI 11%, template 57%). Budget 1,419 of 1,419.

## Limitations

No browser journey ran on this machine. The visible behaviour is unchanged by construction: the
lazy import resolves to the module the shim re-exported, and the two `walkState.ts` edits are
equivalences (pinned above by mutation). The CI run of the pull request carries the affected
plan.
