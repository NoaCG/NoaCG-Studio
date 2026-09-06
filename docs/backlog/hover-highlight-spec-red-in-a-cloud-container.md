---
v: 2
source: derived
kind: finding
raised: 2026-09-06
state: unstarted
found: "`svg import: hovering a checklist row highlights that layer in the preview`
  (e2e/import-svg.spec.ts) fails in a Claude Code cloud container, on the branch under test AND on
  its base commit - so it is either a pre-existing defect or an artefact of that environment, and
  nobody has yet said which."
---
# A hover-highlight spec is red in a cloud container, and nobody knows whose fault it is

## Why

It is one of 77 in `import-svg.spec.ts`, and it is the only red one. Left unnamed it costs the
next session in that file the same twenty minutes it cost this one: the failure looks exactly like
a regression in whatever they just changed, and the only way to learn otherwise is to check out the
base commit and re-run.

More importantly, **if it is real it is red on `main`** - which the queue's gate would catch, but a
session working from a cloud container cannot see CI at all.

## What was measured (2026-09-06, branch `claude/f-growth-question`)

The spec drops a two-text SVG, hovers `map-svg-row-t1`, and asserts the preview highlight's box
covers `#f1` and not `#f0`. It fails at the FIRST of those, `expect(await over('#f1')).toBe(true)` -
the highlight is visible, it is simply not over the layer. Reproduced on a re-run, so it is not a
one-off flake.

Then, following `e2e/AGENTS.md` ("before attributing a big local red to your change, stash and
re-run the SAME spec files"): `git stash`, `git checkout` the base commit `8c1b39b`, same test, same
failure at the same assertion. **The branch is not the cause.**

What is unresolved is whether the environment is. The highlight rides a rect the preview pushes
through `composeDocument`'s canvasControl channel every frame, and the spec has no wait between the
hover and the measurement beyond `toBeVisible()` - so a container whose compositor is slower than a
laptop's could plausibly measure the box one frame before it has moved onto the hovered layer. The
spec's own file already carries `awaitPickable` for exactly this class of problem, on the canvas's
other channel.

## What it would take

Small. Run it on a machine with CI (or read the last nightly): green there means the spec needs the
same "wait until it can ANSWER" treatment `awaitPickable` gives the pick channel, and the fix is a
`expect.poll` on `over('#f1')` like the one the very next assertion in that spec already uses for
the OTHER row. Red there means a real defect in the highlight rect, and the measurement above says
where to start.

## Evidence

Two runs on the branch and one on `8c1b39b`, all `npx playwright test e2e/import-svg.spec.ts -g
"hovering a checklist row"`, all failing at the same line. The rest of that file was 76/77 green on
the branch.
