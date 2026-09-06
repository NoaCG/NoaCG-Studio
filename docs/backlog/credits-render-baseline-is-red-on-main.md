# Nine credits designs fail the catalog render baseline, on a clean `main`

**Filed:** 2026-09-06. **Source:** measurement, while verifying
`claude/noacg-pro-harness-comparison-5c7fa0` before landing.

## Why

**Every landing goes through this gate.** `e2e/catalog-baseline.spec.ts:386` "every catalog variant
renders identically" is red on `origin/main` itself, so it is red for every branch that merges main
in - which is all of them. Until somebody decides whether the move is a regression or an owed
re-record, each session that runs a pre-merge integration reaches the same failure, spends the time
attributing it, and finds it is not theirs. That cost is paid once per session until it is fixed.

It also matters on its own terms: the source gate says nothing moved, so whatever this is, it is a
RENDER-time difference the emit check cannot see - which is the class the render baseline exists for.

## What it would take

Find the commit that moved it, then one of two things:

- the move is deliberate and correct -> re-record (`UPDATE_CATALOG_BASELINE=1`) and say in the
  commit message what moved and why;
- the move is not intended -> fix the regression.

**Do not re-record without establishing which.** The test's own failure message asks for exactly
that: "A token substitution cannot do this - investigate before re-recording."

First suspects, both on main and both near credits: `19285fd7` "Add five game-show recipes and the
field kinds and wizard rows they need" (touches `src/model/`, introduces field kinds - a new or
reordered hidden holder would shift the `noacg-data-source[n]` index and with it `#count`'s recorded
path), and `257d14fd` "Open the credits travel with one pose, whether or not the design has a mark".

## Evidence

Nine designs, each reporting the same two elements moved: `#count` and the design's hidden
`div.noacg-data-source` holder - `[4]` on cr01, cr02, cr03, cr04, cr06, cr08, cr11, cr12 and `[3]`
on cr13.

**Attribution is measured, not assumed.** The failure first appeared in the Pro Harness branch's
integration run (1 failed, 1266 passed). Reverting that branch's only two app-code files
(`src/blocks/timelineModel.ts`, `src/blocks/animImport.ts`) to `origin/main` and re-running the
single spec reproduced it identically, so the branch is exonerated.

`node scripts/check-catalog-emit.mjs` PASSES - all 504 designs emit byte-identical source - which is
why this is a render-time question and why the cheap gate does not catch it.

Reproduce (stop this checkout's dev server first, or the offline guard refuses a reused server):

```bash
npm run queue -- "npx playwright test e2e/catalog-baseline.spec.ts --grep \"every catalog variant renders identically\" --reporter=line"
```
