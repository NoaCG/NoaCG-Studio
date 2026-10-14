# Phase S6: the kit as operations, and the probe (AC-2, AC-8, AC-9)

Recorded by the S6 builder (branch `claude/plan-wizard-shell-p8-build`), 2026-10-14, Windows 10.
Before = `origin/main` at `2df104e67` (S5's merge). The local browser queue was not used: about
1.6 GB was free against its 4 GB floor (#1067), so every journey runs on CI.

## Prerequisite (D10): a kit carried into another walk

S3's note, carried by S4 and S5: a built kit outlived Back to Entry. Reproduced on unfixed `main`
with a throwaway probe branch (`claude/plan-wizard-shell-p8-probe`, deleted) dispatched as
`gh workflow run ci.yml --ref claude/plan-wizard-shell-p8-probe`: run 38613883924 failed only the
new journey, at `e2e/wizard-kit.spec.ts:418`, `expect(locator).toBeDisabled()`, received enabled:
after building a kit, Back to Entry and Import graphic, the import walk's Finish dot was a jump
target (the kit's rule), and pressing it would open the kit hub there. By the code the same plan
also put the tray on that walk's steps 2 to 4, rebuilt the kit over the dropped artwork on the
import walk's first Next, and hid the import walk's own Finish (`!kit`).

Fixed in its own pull request, #1224, queued before this phase: a kit acts only in the template
walk (`walkState.ts` `activeKit`); another walk holds it untouched, and back in the template walk
it is there again with every edit. Ending the kit on a walk change was the first version; the
review showed it silently lost edited graphics, which the kit's switch confirm exists to prevent.
Pinned by the journey "a built kit is held while another walk is on screen, and is there again in
the template walk" and two Node cases in `scripts/wizard-walk-state.test.mjs`; four mutations of
the fix each turned one of them red.

## Commands and results

| Command | Result |
|---|---|
| `node --test scripts/wizard-walks.test.mjs` | 12 of 12 pass |
| `node --test scripts/wizard-kit-moves.test.mjs` (new) | 10 of 10 pass |
| `node --test` over `wizard-walk-state`, `wizard-doors`, `wizard-kit-plan`, `import-drop`, `wizard-walks`, `wizard-kit-moves` | all pass |
| 14 mutations of `template/walk.ts`, `shell/walks.ts`, `template/useKit.ts`, `shell/walkState.ts` (the Kit step's tick rule, a built kit's rail and preview, Skip for one graphic only, the shelf's forward jump, the default walks' no-forward rule, Back from the hub, the recording on leaving the editing steps, one graphic ending the kit, the same kit kept, the active kit, the "All graphics" label, the brand's record of the open graphic) | 13 turned a test red; the survivor (Next from Animation to the hub) is equivalent on the kit walk, whose next step after Animation is the hub |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npx eslint --max-warnings 0` over the shell, `template/`, the two tests | clean |
| `npm run depcruise` | no violations, no config change (1380 modules) |
| `npm run gates -- run --changed origin/main` | every gate ok, `check:file-budgets` 1,419 of 1,419 |
| `git diff --name-only origin/main...HEAD -- src` (AC-9, once #1224 is on `main`) | `CreationWizard.tsx`, `shell/walks.ts`, `template/KitConfirms.tsx`, `template/useKit.ts`, `template/walk.ts` |
| `node scripts/e2e-affected.mjs --list --files src/components/wizard/template/walk.ts` | 41 specs, among them `wizard-kit`, `wizard-filters` and `community-packs` (the last through the covers line this phase adds) |
| browser journeys of the section 6 row (`wizard-kit`, `wizard-filters`, `community-packs`) | on the pull request's CI and the merge group |

## How "identical" is checked

Every removed shell body was compared with its new home: `goToStep` is `kitStepTarget` plus
`moveTo`; `moveKitTo` is `kitMove`; `buildKitAndOpenHub` is `kitBuilt` plus the hook's `build`;
`buildFromKitStep`, `openKitGraphic`, `applyKitStyle`, `saveKit`, the tray's and hub's props, the
picker's handlers, the footer's kit labels, `lookSummary` and the two confirms moved with the same
statements. The walk rules (`canProceed`, `railJump`, `previewOn`, `offersSkip`, the shelf) are
checked in Node against the expressions the shell held on `29883468f`, over every walk, build
mode, kit state, step and input; a kit another walk holds is compared with the old expressions as
the kit that walk acts on (none), which is #1224's fix.

## The representative-change probe (D12, AC-8)

Three capability changes, each answered with the files it would touch on this layout:

1. **A template-walk gating rule** (Next on the template walk's Fields step waits until the first
   text line has a value): `template/walk.ts` (its `canProceed`, which reads the walk's state),
   `scripts/wizard-walks.test.mjs`, and the journey in the flow's e2e file. No shell edit.
2. **A kit confirm** (ask before unticking a graphic that has been edited, on a built kit's Kit
   step): `template/useKit.ts` (the ask and the picker's `onKitSelected`), `template/KitConfirms.tsx`,
   possibly `kitPlan.ts` (a per-graphic edited flag), and `e2e/wizard-kit.spec.ts`. No shell edit:
   the picker reaches BrowseStep by spread and KitConfirms renders every kit ask.
3. **An import drop kind** (a Lottie file on the Import graphic step): `import/drop.ts`,
   `import/index.ts` (the section 5 counter rises past 15), `import/ImportDesignStep.tsx`,
   **`CreationWizard.tsx`** (the new handler, its patch, brand and mode switch in the ladder), and
   `shell/walks.ts` if it needs a walk of its own, plus `scripts/import-drop.test.mjs` and an import
   spec. The shell is touched: the case S9's `ImportSteps` would remove.

## The /check review

A delegated `code-review` pass (high) over both commits returned seven findings. Taken: the silent
loss of an edited kit and the picker reset (the fix was redesigned to hold the kit, above); the
walks test generating kit states only in the template walk (it now covers held kits). Reported:
a deep link in the same open as Continue keeps a held kit and edits it as the link's design
(today's behaviour on `main` too; same root as #1220, commented there). Kept, with the reason: the
`animStep` 4 of the walks without Animation (pinned literals; S7 can drop it); the `step` builder,
`START` and `EDIT` written again in `template/walk.ts` (a runtime import of `shell/walks.ts` would
be a cycle, the fence allows no shared module, and the Node test pins every title); `build` reading
the render's state after its `await` (as `main` did; noticed, not reproduced). A simplify pass of
four angles: one cleanup taken (one move to a step in the hook instead of two); the rest skipped
for behaviour (the `lookSummary` copy differs from Finish's), fence (`walkState.ts` cleanups are
S7's) or the shell's budget.

## Shell size

1,661 lines before, 1,419 after; `scripts/file-budgets/components-wizard-CreationWizard.json`
lowered from 1,661 to 1,419 (AC-10).

## Limitations

No browser journey ran on this machine. The reproduction ran on a CI probe; the fixed journey and
the section 6 row run on the pull requests' CI and the merge group. `useKit`'s hook body (the
asks, the async build, the busy line) is proved by the journeys, not by Node; its decisions are.
