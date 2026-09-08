# The two live-vote drawing guides contradict each other on `Answer 1`

**Filed:** 2026-09-08. **Source:** the 2026-09-05 live-vote-conventions session (handoff since
drained)

## Why
`/docs#svg-vote` tells a designer that rows called `Answer 1` give a quiz board rather than a vote
(`docs.html:687`). `docs/SVG_AUTHORING.md:353` still lists `Answer 1` as an accepted live-vote row
word. One of the two has been wrong since `b95e89a0` changed the proposer to score a quiz from the
drawn Pick, Right and Wrong moments instead of from the row word, which is the exact condition the
public page's warning was derived from. Either way a designer following one page gets a board that
binds as the other kind, and neither page says which is stale. The 2026-09-05 row left the repo doc
alone because another live row held the file; that row landed the same day.

## What it would take
Run the current `proposeSvgBehaviour` over a fixture whose rows are `Answer 1..3` with bars and no
Pick, Right or Wrong moment - an SSR probe does this without a browser - see which recipe wins,
correct whichever page is wrong, and pin the answer in `e2e/import-svg-behaviour.spec.ts`. The two
guides also differ across the whole "Drawing the bars" block, so reconcile section 5b against the
page in the same pass.

## Evidence
`docs.html:687`; `docs/SVG_AUTHORING.md:353`; `src/components/wizard/import/draft.ts:1141`
(`best.recipe`); commit `b95e89a0`, which deleted the backlog item claiming `Answer 1` always reads
as a quiz.
