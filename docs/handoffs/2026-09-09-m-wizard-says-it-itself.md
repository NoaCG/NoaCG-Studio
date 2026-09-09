# Session M - the wizard says the three things itself

**Branch:** `claude/m-wizard-says-it-itself`
**Acceptance item:** `docs/acceptance/owner-queue/2026-09-09-m-wizard-says-it-itself.md`
**Spec:** `e2e/import-svg.spec.ts` - three new cases, plus one assertion added to the mapping
step's existing height-budget test. `e2e/wizard-kit.spec.ts` gained two lines.

## What landed

The three moments session D's cold walk had to explain in the `/docs` guide now explain themselves
on screen, each pinned by a case, and `docs/backlog/import-walk-hesitations.md` is deleted in the
same commit as the last of them.

**1. The rail renumbers, and now says why.** Dropping an SVG swaps the six-step design walk for the
five-step SVG one, so `STEP 2 / 6` becomes `STEP 2 / 5` and two step names change at once - which
does not read as "one step was removed", it reads as a different wizard. The Your design card now
carries one line beside the layer count: "Five steps now, not six: an SVG has nothing to erase and
its text is already placed, so Prepare and Text became the one Fields step." Written as a fact about
SVG walks rather than as an event, because the same card is on screen for somebody who walked back
into a saved SVG draft and never saw six.

**2. The alignment grid writes its answer in words.** Every text row's third control was a 3x3 of
unlabelled dots under the bare word `Aligned`, and the answers existed only in a `title` per cell -
one at a time, on hover. Each row now reads `ALIGNED left, middle`, in the chosen dot's own two
words, and the words follow the dot when it is clicked. What the grid DECIDES is said once, in the
section's ⓘ, rather than seven times: that edge holds still when an operator types something longer,
and a ringed dot was read from your drawing where a solid one you set.

**3. The two name boxes stop defaulting to the same word.** An empty production box took the
GRAPHIC's name, so a first import made "Imported SVG design" sitting in a production called
"Imported SVG design" - and the confirmation printed it back twice in two sentences. This is not an
edge case: an empty library preselects "New production", so both boxes start empty on the commonest
first run. `UNTITLED_PRODUCTION` is now exported from `src/model/shows.ts` and the wizard uses it,
the placeholder shows it, and the line under the picker says what a production is called for
("Name it for the show, like Friday Show or Class Quiz, not for this graphic").

## The one decision, and why it went that way

The production default was the part D flagged as wanting a minute of thought, so it got a blocking
design consult rather than my first instinct. Three options were on the table: fall through to the
model's own `'Untitled production'`; require a name the way every other production-creating door in
the app does (`ControlPanel`, `ProductionsSection` both disable on an empty box); or invent a
show-shaped name from the day ("Wednesday show").

**Fall-through won, and the argument that decided it is that a default which looks unnamed invites
the name, where one that looks deliberate is never corrected.** "Untitled" is the convention in
every tool a YLE guest already uses, and it says one true thing. "Imported SVG design" as a show
title says something false that looks intentional. Requiring a name was rejected because it greys
the primary one-press door on the exact default first run, and because the graphic name box ten
lines above accepts empty and falls back - one step must not have two contracts. A weekday name was
rejected because two shows made the same day collide, and it hides the gap while looking warmer.

The consult found something I had missed and it is fixed here too: `createShowNamedChecked`'s floor
was unreachable from **two** callers, not one. `CreationWizard.tsx`'s deleted-mid-wizard fallback
also named the new production after the graphic, on a rarer path. One door must not answer one
question two ways, so it now passes an empty string and lets the floor answer.

Left alone deliberately, and both simplify agents pushed on it, so the reasoning is worth having:
`saveTemplateSetToProduction`'s `fallbackName` and `KitFinishStep.tsx`'s own empty-box fallback.
Both resolve to a SET's name - a kit's pack name, or the name typed on Finish for a whole AI
package - and a set's name genuinely is a production's name. "Wellness" is a good show title;
"Interview strap" is not. The defect is naming a production after one GRAPHIC, and exactly one
narrow path still does: an AI package with no typed name whose picked production was deleted in
another tab falls back to `pack[0].name`. Deep enough that fixing it here would have been scope
rather than correctness, and it has no repro.

The shape the policy ended in is worth naming too, because it is not where it started. The floor
was first spelled twice - once in the model where the write applies it, once in the wizard because
the confirmation must PRINT the destination before any record exists. Two copies of one policy is
how a dialog ends up promising a name the write does not make, which is precisely what the new
case asserts cannot happen. It is a pure `resolveShowName(name)` now, shared by both, and the
constant is private again.

## The measurement that shaped fix 2

D wrote that the alignment answer "would cost nothing". It costs 60 px of row width, and the
mapping step has an exact rows-on-screen budget (`e2e/import-svg.spec.ts`, seven scorebug rows at
1280x720 and 1366x768). So it was measured on the running app before a word was written, by
simulating three candidate labels in the page:

| label | align column | text boxes @1280 | row heights |
|---|---|---|---|
| as shipped | 52 px | 165 px | 54,54,54,54,56,54,54 |
| horizontal only | 71 px | 155 px | unchanged |
| vertical only | 89 px | 146 px | unchanged |
| both axes | 112 px | 135 px | **54,54,54,54,68,54,54** |

Both axes wrapped the CLOCK row, the one that also carries the countdown picker, and pushed the
last row 12 px lower. The fix is one CSS line - a row's LABEL never wraps - and with it the full
two-axis answer is free: every row back to 54 px, the last one still ending at 609, seven on screen
at both sizes.

The guard lives in the height-budget test rather than in a pair of viewports of its own, because
that test already walks both sizes with this fixture and already measures every row's rectangle.
It earns its line there: `rowsOnScreen` does NOT catch a wrapped row, since at 1280 all seven
still fitted while the last one sat 12 px lower. That is the assertion a future copy change spends
first, and it is now beside the one it belongs to.

## Verification

`review: delegated` (opus, adversarial - it found three things the build was happy with, all
three held up against the source, all three are fixed). `simplify: delegated` (two agents over
four angles; five findings applied, three skipped with reasons). `verify: inline and measured`.
`taste: not applicable` - nothing here can move what a graphic looks like.

- **Reproduced first, on the running app, before anything was edited.** All three exactly as D
  filed them: `STEP 2 / 6` -> `STEP 2 / 5` with no account for it; every alignment control's
  visible text being the single word `ALIGNED`; and the confirmation reading "Imported SVG design
  goes into this production: Imported SVG design".
- **Re-derived after.** The card carries the new line, rows read `ALIGNED left, middle`, the
  confirmation reads "Imported SVG design goes into this production: Untitled production", and the
  production page that the press lands on is titled `Untitled production` - so the name the dialog
  printed is the name the write made, rather than the UI guessing one and the model applying
  another.
- `npm run build` exit 0, read as the build's own exit code, on every commit. Two gates fired on
  the first pass and both were mine: `check:owner-queue` refused `kind: ui` (the vocabulary is
  walk / walk-p / owner-action / hardware / agent), and `check:copy` refused an em-dash count that
  had gone DOWN without the baseline being re-recorded - a stale-high baseline hands the file back
  the room it just gave up.
- `npm run test:e2e:affected`: **1302 passed, 3 failed.** Two of the three were mine and are the
  interesting part; the third is not (below). Then `npx playwright test import-svg wizard-kit
  wizard-finish productions library-productions` after the fixes: **154 passed, 0 failed.**

### What the suite and the review caught, which a green build did not

**A pinned length ceiling.** The alignment key went in as a third paragraph in the section's ⓘ,
and that body is pinned at exactly two ("the step says what a control does, in a few lines" -
written after it grew to four, with the owner's 2026-08-26 "no one wants to read more than a few
lines" behind it). The sentence now rides the paragraph that already covers what a row's controls
do. Better copy for the constraint, not a worse home for it: tying the anchored edge to the Text
box beside it is the cheapest demonstration available.

**A spec that encoded the defect.** `wizard-kit.spec.ts`'s "a kit opened FOR a production joins
that one" built its production by filling the GRAPHIC name and leaving the production box empty,
so it broke the moment that stopped meaning the same thing. Its subject is which production a kit
joins, not how one gets named, so it names one now.

**A CSS rule with a blast radius.** The guard was written `.map-svg-row .save-field > span`, and
two other spans sit directly inside a field on that step: the line under a picker saying which
layer filled it, and a recipe option's label ("Reveal by itself a few seconds after the lock").
Both are sentences that must wrap; neither is ever the first child, where the label is. Scoped to
`:first-child` and then **measured** on the vote band, the quiz board and the scorebug at 1280:
the option labels compute `normal` again, everything the rule reaches is at most "VOTE NOW badge",
and no row overflows the scrollport. The build would never have said any of this.

**Two smaller ones**, both from the review and both real: the rail line claimed an SVG's "text is
already placed", which is false for a file whose type was outlined on export and whose card says
so two lines up; and `toHaveText` reads textContent, so a rule that HID the alignment words would
have left the defect and kept the case green. The case asserts visibility separately now.

**A note for whoever runs the browser leg next.** `npm run dev:worktree` and the offline e2e suite
cannot both have the port: Playwright reuses a listening server, `webServer.env` is then never
applied, and `_offline-guard.ts` refuses the run rather than measuring an unpinned app. The dev
server has to be stopped before the suite is queued. That is the guard working, but it costs a
whole slot to learn.

### The third failure is not mine, and that is measured

`catalog-baseline.spec.ts`, "every catalog variant renders identically", fails for 24 credits and
ticker variants. It was reproduced **at this branch's own fork point** (`ffadb42e`, the tree
checked out with every change here absent), and nothing between that commit and current main
touches the baseline, its spec or `src/templates`. So it is red on main, and CI has not noticed
because the affected-spec selection only runs it when something touches the catalog. Filed as
`docs/backlog/the-catalog-baseline-has-been-red-and-nothing-ran-it.md`, with the second and larger
half of the finding: a baseline gate that runs only when its subject moves cannot report that its
subject already moved and broke it.

## Also on this branch

`docs/backlog/the-catalog-baseline-has-been-red-and-nothing-ran-it.md`, argued above.

`docs/backlog/a-live-landing-starves-every-browser-job.md`. Queueing the first repro sat at `#1`
for a landing's entire stay in GitHub's merge queue, with nothing browser-driving running anywhere
and 4.2 GB free. `scripts/jobs-store.mjs` says at its own exemption that "A LANDING IS NOT CHARGED
AGAINST THE SUITE BUDGET", and the code only half does it: a merge is exempt from being BLOCKED by
the budget, but its 0.15 still lands in `used`, and against a day budget of 1 that starves every
1.0-cost browser job for the landing's whole life. Every wave prompt that warns "a queued job
starves once landings are in flight" is describing that line. One-line fix plus a case, filed
rather than taken, because this branch owns the wizard.

## What I did not do

- **No screenshots.** Fix 2 is the one where a picture of the row would carry the acceptance item
  better than a paragraph, and `docs/backlog/docs-shots-for-the-sections-that-have-none.md` already
  owns adding wizard surfaces to `scripts/docs-shots.mjs`.
- **The alignment answer does not say where it came from.** The stretch summary beside it writes
  "- read from your artwork"; the row cannot afford those five words (the measurement above), so
  the ring-versus-solid distinction is explained once in the section note instead. If somebody
  later buys the width back, that is the sentence to spend it on.
- **`saveTemplateSetToProduction`'s AI-package fallback**, for the reason argued above.

## Next

Nothing on this thread is unfinished. The nearest neighbours are the queue-budget finding above
(small, mechanical, with a test to write) and Teams instructions, which is the oldest unserved docs
ask and the same instrument pointed at a different road.
