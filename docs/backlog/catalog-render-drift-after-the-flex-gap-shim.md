# Twenty-six catalog designs moved when the flex-gap shim landed, and only this laptop can see it

**Filed:** 2026-09-10. **Source:** measurement - `npx playwright test catalog-baseline` on this
machine, jobs j-0985 and j-0991, run from row BN's worktree while verifying an unrelated change.

## Why

`e2e/catalog-baseline.spec.ts:386` ("every catalog variant renders identically") is the tripwire
that catches a rendered design moving when nobody meant it to, and it is RED on `main` right now
for 26 designs across two families. **CI cannot see it**: `.github/workflows/catalog-gates.yml`
says in its own words that the render-baseline comparison is win32-only and therefore inert on a
runner, so the same commit is green there. A gate that only one machine runs, that is red, and
whose red nobody is looking at, is a gate that has stopped working - and the next person to run it
locally will assume it belongs to whatever they were changing at the time.

## What it would take

Reproduce (`npm run queue -- "npx playwright test catalog-baseline"`), read the per-element records
the spec writes into its own output directory to see WHICH way each element moved, and decide
between two endings: the shim is misfiring, or the new geometry is correct and the baseline should
be re-recorded with `UPDATE_RENDER_BASELINE=1`. Do not re-record before knowing which - the spec's
own failure message says a token substitution cannot cause this.

The likely cause is worth checking first. PR 229 (`claude/bk-flex-gap-on-old-engines`, landed as
`2115083a`) added `src/assets/flexGapShim.js` and then carried it "everywhere a document goes". The
shim writes margins to in-flow flex items on engines that lack flex `gap`, and its own header
records that the support probe answers 0 - and is therefore left `'unknown'` - when the document it
runs in is hidden (around line 57). A catalog design rendered in a hidden or offscreen frame is
exactly that case, and every drifted element is either a `.noacg-data-source` holder, which is
hidden by definition, or the `#count` inside one.

While it is open, somebody should also ask why a gate this valuable is win32-only. If the reason is
font availability, a CI runner with the same fonts would make main's own colour honest.

## Evidence

Twenty-six ids, each with the same two elements: `cr01`, `cr02`, then `tk02` through `tk22`, all
reading `2 element(s) — #count, …>div.noacg-data-source[N]`. Full text in the job logs above; the
three other assertions in that file (byte-identical emitted code, the hidden-holder rule, name
collisions) all pass, which is what says the SOURCE did not move and the RENDER did.

Row BN's branch cannot be the cause: it changed `src/control`, `src/output`, `e2e`, `scripts`,
`docs` and `supabase/migrations`, none of which is on the path that renders a catalog design.
