# The two unclearable Pro Harness findings, measured and fixed

Branch `claude/noacg-pro-harness-continue-3583ad`, from `main` at `39835021`. Four commits, build
green (`[write-version] dist/version.json -> claude/noacg-pro-harness-continue-3583ad@8e419a07`),
`npx tsc --noEmit`, `eslint`, `depcruise` and `node --test scripts/pro-harness.test.mjs` (25 tests)
all clean. **No model spend here.** The €3 authorization still stands at $1.85 spent.

## What the two refusals actually were

Nine of the 2026-09-06 bank's 21 cells - three whole types - carried a finding the gate could never
pass. Both were reproduced against the shipped catalog before anything was changed, and in both
cases the first diagnosis in the record was close but not right.

**`bench-field-unpainted` is not about the class being ignored.** The check requires the sentinel to
appear VERBATIM, and a value a runtime computes with never survives verbatim. Measured on `gt01`:
`900001` minutes paints **`15000:00:58`**. A credits scroll speed is worse - it changes no visible
text at any value, only motion. So the check refused **all 6 shipped `game-timer` designs** and
**7 of the 12 shipped `end-credits` designs**.

The class alone cannot clear it: a quiz board's audience percentages live in a `noacg-data-source`
holder and ARE painted, so excluding by class silenced the standing mutation test in
`e2e/lite-field-paint.spec.ts` - correctly. **The pair that settles it is the class AND
`ftype: "number"`.** All **72** numeric holders in the catalog are a duration, a speed, a
percentage, a 1-based index or a goal; none is a string meant to be echoed. Asked at report time, so
a holder whose value IS painted still has to prove it.

**`step-contract` pressed `next()` once per operator action the BRIEF listed.** All 12 shipped quiz
boards answer exactly one press (`spxSteps` 2 - the reveal is a lifecycle call on the middle step,
and Out is reached by `stop()`), and the `podium-score` spine answers none, so a brief listing three
reveals refused every quiz cell at press 2 and would have refused the catalog too. The press count
now comes from the graphic's own default path (`spxSteps - 1`); `process-steps`, at `spxSteps` 5,
answers exactly 4 and confirms the rule. The half a model can act on survives as a separate finding,
raised only where the model owns the region.

## The bridge door, which was the same fault one lane over

`bridgeApi.normalize` still told an author its region "could not be converted (no markers, or GSAP
the converter cannot read: DOM measurement, nested timelines, conditionals)" - the sentence the
harness stopped using after it cost a correct timeline four rounds. `animationBreach` moved to
`src/blocks/animationRegion.ts`, beside the importer it explains, and both doors read it. Verified
live on this checkout's `/bridge`: a region missing one ease declaration comes back with *"the
region has no `var easeIn = 'expo.out';` - both `easeIn` and `easeOut` must be declared"*. Queued
for a human read in `docs/acceptance/owner-queue/2026-09-07-refused-animation-region-says-why.md`.

## What is queued and not yet answered

Both jobs sit behind other work holding the machine's RAM (`node scripts/jobs.mjs`):

- **j-0733** - `--control`, free. The workbench end to end after the step-count change.
- **j-0734** - the nine cells the two findings blocked, `--max-cost=0.70`, out
  `pro-harness-out-rerun`. **This checkout's dev server must be running** (`npm run dev:worktree`,
  port 5196) and nothing else may hold that port.

Also unrun: `npx playwright test e2e/bridge.spec.ts e2e/lite-field-paint.spec.ts`. `lite-field-paint`
passed locally (8 of 8) BEFORE the bridge commit; `bridge.spec.ts` has not run since its new
assertions were added. Both need the port free, so they cannot share a slot with the two jobs above.

## The blind read of the 2026-09-06 bank is gone

`pro-harness-out-gemini-v3` - 21 cells of code, frames and results, $1.444 of measurement - went
with the comparison worktree and was not archived (`C:/claude/noacg-archives/worktree-cleanup/
2026-09-07` holds one unrelated folder). `pro-harness-out*/` is NOT on the cleanup script's
rebuildable list, so the mechanism was right and is not what removed it. Only the re-run's cells can
be read blind now, and the rest costs $1.444 to have again.

## The owner question, still open

`needs: alignment`. Three cells (`lt-caster`, `sb-esports`, `st-election`) were refused with nothing
blocking but `readability-text-under-size-floor`, at 43-48px against the 50px primary floor -
the floor `docs/NOACG_PRO_PLAN.md` §23.1 measured as failing **312 of 489 shipped designs**, and
which he has not re-ratified for enforcement. Three cells of delivered rate turn on it.
