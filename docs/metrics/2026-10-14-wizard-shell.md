# Creation wizard shell split, 2026-10-14

The `wizard-shell` plan (`docs/work-specs/wizard-structure/spec.md`) split
`src/components/wizard/CreationWizard.tsx` into Node-tested walk modules (`shell/walks.ts`,
`shell/walkState.ts`, `shell/useWalkLifecycle.ts`, `shell/doors.ts`, `import/drop.ts`,
`template/useKit.ts`, `template/walk.ts`) between 2026-10-13 and 2026-10-14. These are its sizes
before and after. Phase evidence: `docs/work-specs/wizard-structure/evidence/phase-s1a.md` to
`phase-s7.md`. The AI step's own numbers are in `2026-10-14-wizard-ai.md`.

## Instruction chains (AC-7)

Counted as `scripts/check-shared-instructions.mjs` counts a chain: every `AGENTS.md` from the root
to the edited file's folder, LF-normalised, plus 2 bytes per join. Target: 40,960 bytes
(`docs/METRICS.md`), reported and not gated. "Before S7" is `origin/main` at `33fa907c4`; between
S1a and S7 the root contract grew 113 bytes and the AI track moved the step to `wizard/ai/`.

| Edited file | Before S1a | After S1a | Before S7 | After S7 | Over the target |
|---|---:|---:|---:|---:|---:|
| `CreationWizard.tsx`, `shell/*`, `template/*` | 58,678 | 34,807 | 34,920 | 33,996 | under |
| `import/*` | 58,678 | 42,347 | 42,460 | 41,536 | 576 |
| `steps/*` | 58,678 | 42,867 | 42,338 | 41,414 | 454 |
| the AI step (`steps/ai/` at S1a, `ai/` after the AI track) | 58,678 | 51,910 | 44,665 | 43,741 | 2,781 |

S1a split the wizard contract by folder (markers on `import/`, `steps/`, `steps/ai/`). S7 retired
three rules the walk modules turned into structure (`keep-browse-filter-state-creationwizard-back`,
`hold-import-images-continuation-old-importstep`, `resolve-deep-linked-through-hit-apply`): the
wizard contract went from 11,367 to 10,443 bytes, and every wizard chain carries it. The door,
lifecycle and kit rules were rescoped to the modules that hold their behaviour; `shell/` and
`template/` compile into the same contract, so the rescopes change which files load them, not
the bytes.

**Next candidates** for the three chains still over 40,960:

- *The template folder move with its marker (optional S8).* With `kitPlan.ts` and `KitTray.tsx`
  under `template/`, the four kit rules leave the wizard contract (`put-door-each-kit-community-packs`
  552, `build-whole-kit-moment-kit-step` 457, `make-apply-style-all-deterministic-transform` 444,
  `gate-every-kit-preview-intersection-give` 210; 1,663 bytes): `import/` falls to about 39,870,
  the AI step to about 42,080. Three of the four also name `steps/` files and would land in the
  `steps/` contract, so that chain gains only the 444.
- *`steps/`:* `wizard/order-entry-step-four-equal-start` (552) is one that
  `npm run audit:instructions` lists as carryable by the spec it names (`e2e/wizard-entry-fit.spec.ts`
  printing it through `rules.text`), which takes it off every loaded surface.
- *Every capability chain:* `wizard/treat-shared-facet-never-reads-never` (469) is scoped to
  `src/components/wizard/**` but governs the Browse step's format picker; scoped to its files it
  would leave the `import/` and AI chains.
- *The AI step:* beyond the above, its own contract's largest rules
  (`open-create-step-user-own-coding` 642, `name-proven-design-result-adapted-show` 509,
  `keep-smallest-managed-tier-smallest-result` 507) are the AI track's to review.

## Co-change (AC-8)

`npm run metrics:cochange`: of the commits that touch only one wizard capability, the share that
also touches a shared file. S7 changed the matcher from exact paths to path prefixes (as the
capabilities already were) and added `src/components/wizard/shell/` to the shared files.
Measured on `origin/main` at `33fa907c4`, 2026-10-14.

| Window | Import | AI | Template |
|---|---:|---:|---:|
| 2026-09-06 baseline, 60 days | 40% (51 of 129) | 25% (13 of 51) | 57% (36 of 63) |
| 60 days, exact-path matcher | 27% (55 of 207) | 11% (3 of 28) | 57% (25 of 44) |
| 60 days, prefix matcher with `shell/` | 27% (55 of 207) | 11% (3 of 28) | 57% (25 of 44) |
| 30 days | 11% (8 of 71) | 0% (0 of 14) | 64% (7 of 11) |
| 14 days | 9% (3 of 33) | 0% (0 of 8) | 60% (3 of 5) |
| 2 days (the plan's own run) | 6% (1 of 18) | 0% (0 of 7) | 50% (1 of 2) |

The fixed matcher changes no number yet: every capability-only commit that touched `shell/` so far
also touched `CreationWizard.tsx`, because those were the phases moving code out of it. The one
template-only commit after the kit moved (`45e0447cf`, the kit hook's step move) touched
`template/useKit.ts` alone. These windows are mostly history from before the split; the number
that tests the split is this table re-read over a window of real work on the new layout.

## The representative-change probe (D12)

Three written capability changes, answered at S6 with the files each would touch, and checked
by the S6 check:

1. *A template-walk gating rule* (Next on Fields waits for a first line): `template/walk.ts`,
   `scripts/wizard-walks.test.mjs` and the flow's journey. No shell edit, **for Next only**: a gate
   that must also hold "Skip to finish" edits the shell, whose Skip button computes its own
   disabled state (`disabled={mode === 'template' ? !draft.variantId : !previewTemplate}` in
   `CreationWizard.tsx`) rather than asking the walk.
2. *A kit confirm* (ask before unticking an edited graphic on a built kit's Kit step):
   `template/useKit.ts`, `template/KitConfirms.tsx`, possibly `kitPlan.ts`, `e2e/wizard-kit.spec.ts`.
   No shell edit.
3. *An import drop kind* (a Lottie file on the Import graphic step): `import/drop.ts`,
   `import/index.ts` (the section 5 counter rises past 15), `import/ImportDesignStep.tsx`,
   **`CreationWizard.tsx`** (the handler, its patch, brand and mode switch in the ladder),
   `shell/walks.ts` if it needs its own walk, the import Node test and spec. The import road still
   runs through the shell.

## Budgets (AC-10)

`scripts/file-budgets/components-wizard-CreationWizard.json`, the shell's line budget
(`npm run check:file-budgets`). Installed above the shell's length, then lowered to the exact
length by every phase that shrank it; never raised.

| Phase | Shell lines | Budget |
|---|---:|---:|
| S1b (installed) | 2,485 | 2,601 |
| S1c (defect fixes, and the svg-import-engine plan's landings) | 2,516 | 2,601 |
| S2 import drop doors | 2,482 | 2,482 |
| S3 walks table | 2,357 | 2,357 |
| S4 doors | 2,105 | 2,105 |
| S5 walk reducer and lifecycle | 1,661 | 1,661 |
| S6 the kit | 1,419 | 1,419 |
| S7 close-out | 1,419 | 1,419 |

The AI step's budget (`components-wizard-ai-AiStep.json`) is 1,659, unchanged since the AI track's
A3.

## Plan widths

`node scripts/e2e-affected.mjs --list --files <path>`, specs selected of 233 on disk, after S7:
`CreationWizard.tsx` 53 (50 at the plan's baseline), `shell/walkState.ts` and
`shell/useWalkLifecycle.ts` 44, `shell/walks.ts` 42, `shell/doors.ts`, `template/useKit.ts` and
`template/walk.ts` 41, `draft/core.ts` 40, `import/drop.ts` 15.
