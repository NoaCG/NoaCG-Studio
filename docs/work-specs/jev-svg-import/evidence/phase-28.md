# Phase 28: Keep control arrangements through reimport and one panel dispatch

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-25: "Pin/hide/rename existing controls, save/reopen and reimport matching artwork without
  losing those choices or canonical targets. One existing configured software-panel dispatch check
  addresses the same intended field/event and live cue. Existing validation remains authoritative.
  Test first; no control renderer, action arrangement or shared identity rewrite unless a
  reproduced defect requires an explicitly reconciled narrow repair."
- Row 28: "Pin, hide and rename controls, save/reopen, then reimport matching artwork; preserve
  the choices and canonical targets. One existing software-panel dispatch reaches the intended
  live cue/field/event. Test first. controlModel.ts, panelActions.ts and ActionArranger.tsx are
  read-only unless a failing reproduction justifies an explicitly reconciled narrow repair; no
  generic control-surface project."

## Pinned main

Worktree from `9a06d3850289d4221c46cdcd251b00a628154f3a` (PR #1985, row 27). Previous verified
main: that SHA.

## Result

Test first, and the tests pass on that main with no source change. No repair was needed, so
`controlModel.ts`, `panelActions.ts` and `ActionArranger.tsx` are untouched.

Why it holds, read in code: an arrangement is stored on the production's profile, keyed by the
pool graphic's name and each control's event name (`model/profile.ts`). Row 27 keeps both on a
matching reimport: the name is the one Finish saves under, events are carried by the recipe (R7),
and every matched field keeps its id (R3), so each control's `adjust`, `set`, `add`, `remove` and
`payload` still names the same field. The panel offer is built from the same arrangement
(`panelActions.ts` calls `arrangeControls`).

## What landed

- `e2e/import-svg-reimport.spec.ts`, one journey: import the four-team score board into a
  production, pin Team 3's point, rename Team 1's to "Reds score" and hide New game on the block;
  reload; reimport the same board with a LIVE badge drawn before everything (a fresh build numbers
  it first, so without row 27 every field id would move by one) under the same name through
  Finish. The library graphic, its field ids, every control's event and field targets, the pool
  copy's targets and the stored arrangement are unchanged; the block still draws it; after a Take
  the renamed control moves Team 1's score on air and the pinned one Team 3's.
- `e2e/configured/panel-graphic-actions.spec.ts`, a fourth test on a real backend: the same
  import, two cues, the same arrangement, reload, the same reimport, publish, a paired panel. With
  Anna on air and Ben selected, the offer carries the arrangement by event id (`event:score3`
  pinned, `event:score1` named "Reds score", `event:newGame` behind More), and one press of
  `event:score1` on Anna's instance is accepted and moves Score 1 by one on the program output,
  with Ben still selected. The existing refusals in the first test stay the authority on
  validation.

## Verification

- `e2e/import-svg-reimport.spec.ts` 13/13 on this worker (j-0005).
- Mutation, reverted: `svgReimported` returning the raw build fails the new journey at the field
  ids (every id one higher), so it does not pass without row 27's id keeping (j-0004).
- `npx tsc --noEmit`, eslint on both specs, `check-e2e-protection --changed origin/main`: pass.
- The configured test runs only in CI (no Docker daemon on this worker for a local stack); its
  result is the PR's configured selection.

## Decisions

- **Matching artwork with a new layer drawn first.** A backdrop-only change would leave every id
  where it was, so the test could not tell a kept id from an unchanged one.
- **Arranged through the block, not the model**, as `production-controls.spec.ts` does, since the
  arrangement and the block are one feature.
- **The configured test adds no `covers:` line**, so the configured selection rules (owned by the
  cicd-improvement run) select it exactly as before.

## Limits

- The arrangement is keyed by the graphic's NAME. A reimport that unresolved work sends to a
  separate graphic (`<name> 2`, row 27 R8) starts with no arrangement; the earlier graphic keeps
  its own. That is row 27's rule, not a new one.
- A control whose event the reimport drops (row 27 R7) keeps its entry in the profile, unused, as
  the arranger already does for a control that disappears.

## Traps

- After the badge is added, the library graphic's field list grows by one; compare the other
  fields, not the whole list.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-28-build')"

Tests and notes only; nothing persisted changes.
