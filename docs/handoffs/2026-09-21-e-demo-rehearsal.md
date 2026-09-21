# E - the Friday demo, rehearsed as a student on the live site

Branch `claude/e-demo-rehearsal`, worktree `.claude/worktrees/agent-a0e743319fc3f1713`, forked
from `da821d84`. Owner ask, 2026-09-21: "anything you think we need to fix before Friday", and the
students must follow the docs with nobody helping (docs/GOALS.md NOW item 1). Owner walk:
`docs/acceptance/owner-queue/2026-09-21-e-friday-demo-walk.md`.

## What was walked, and on which build

The whole road, twice, in a browser pane on `https://noacg.studio`, at 1366x768 and 1280x720.
The site served `da821d84` (built 18:25 UTC), which was `origin/main` for the whole session, so
the live walk and the merged-main walk were the same walk. First on the two lower-third example
files, then again on `quiz.svg` and `scoreboard.svg` after the coordinator said the docs keep one
example per type and row L removes the lower-third files tonight. The owner walk is written on
the one-per-type files.

Legs walked: the docs Quiz and Scoreboard pages and their download links (the served files match
the checkout byte for byte after CRLF); import of both files; the Fields step's auto-binding (the
quiz with every selected, correct, wrong and Locked layer, the score tracker with both flashes and
Full time); Animation; Finish; a new production and a second graphic joining it; then take, select,
lock, reveal, the next question, +1, +1, -1, a typed name, Update, Out and a reload. The published
part (Start production, the output URL in OBS, hosted control tabs) needs an account and was not
walked. No console errors on any leg.

## What was fixed here

**The wizard footer wrapped at laptop sizes once a production existed.** The Brand chooser joins
the footer when a production has a look to offer, and beside the preview the form column is
535px wide at 1366x768. Flex shrank every item alike: "Back" and "Skip to finish" broke onto two
lines and Next became a two-line button. Now the buttons never shrink or wrap and the chooser's
select is the one thing that gives, from 180px to a 72px floor; the footer asks its own column's
width through a container query on `.wz-main` (tighter gaps under 560px, the chooser on its own
line above the buttons under 475px). Measured on the live DOM at 1366 (one line, select 134px),
1280 (one line, select 86px, last control flush with the padding) and 1100 (chooser above, nothing
overflowing). The select's 12px, which `.wz-wizard select` had been overriding to 15px, now
applies. Pinned by the last test in `e2e/wizard-brand.spec.ts`, which seeds a brand name wider
than the cap and asserts the row fits. Commits `838a4385` and the check's follow-up.

The CSS lives in `src/styles/wizard-and-dialogs.css` and `src/styles/learn.css`, outside this
row's TOUCHES line; no other row owned `src/styles/` tonight and the rules are the wizard's own.

## Defects found, by owner

### For row L (`src/components/wizard/import/`, docs, examples, behaviours)

1. **An unnamed import is called "Imported SVG design"**, and a second unnamed import into the
   same production replaces the first by name. The Finish step warns in words. The better
   default is the dropped file's name; `ImportDesignStep.tsx` passes only the markup to `onSvg`,
   so the file name never reaches the draft, and `draft/core.ts` `draftName` falls back to the
   variant's catalog name. The invariant `wizard/keep-finish-wizard-branch-carrying-graphic`
   says blank falls back to the catalog name, so changing it is an `npm run learn`.
2. **The Fields step lists the `static:` letter rows first**, unticked, under group headings
   "Rows 1" to "Rows 4", before the real fields, and the same headings repeat for the answers
   below (on `scoreboard-lower-third.svg` it read "Board 1", "Board 2", "Board 1"). The owner's
   own feedback on the group rows' unselectable square is the same area.
3. **"Question 2" appears in every moment picker.** `<g id="Question">` holds an unnamed
   `<text>`; the text takes the group's name and the group itself is deduplicated to "Question 2"
   and offered as a drawn moment.
4. **The drop step's copy explains the mechanism**: "Five steps now, not six: an SVG needs no
   erasing and no placing, so Prepare and Text became the one Fields step." A student needs the
   outcome. This is `docs/backlog/import-step-copy-a-kid-can-read.md`, the cold read-back the row
   was to do and now L's.
5. **The chip "Need help exporting SVG?" wraps to two lines at 1280 wide**, and the docs call it
   "Exporting the SVG" with an info mark, which is not what the wizard shows.
6. **The docs' Fields-step pictures show a "Create project" footer button** that the default
   studio no longer has (row A renamed it to Skip to finish). `public/docs/type-*-fields.png`,
   re-shot by `scripts/docs-shots.mjs`.
7. **Two "+ New graphic" buttons on the production page carry titles that differ by a dash**
   (`-` in the header, an em dash in the rundown), which is the rule the owner set for public copy.
   `src/components/home/ProductionPage.tsx`, not L's, listed here so it is not lost.

### For row G (dashboard and hosted control files tonight)

1. **FRIDAY-CRITICAL TO CHECK: Out leaves an imported graphic painted in the PROGRAM monitor.**
   Reproduced four times on the live site, on the quiz and on the scoreboard, alone and with the
   other layer on air: after Out the header reads "nothing on air", TAKE is armed again and the
   activity log says Out, but the picture stays in the monitor for as long as I watched (eight
   seconds and more). The wizard preview's own OUT clears the same graphic, so the template's
   `stop()` is fine. The command reaches the monitor through `applyProgram` in
   `src/components/home/ProductionPage.tsx` (the one path) into `PayloadStage.apply`; the stop
   item from `clearCueItems` (`src/control/hostedControl.ts`) is `{ t: 'stop' }` then
   `{ t: 'cue', cue: null }`. The live-control bootstrap in `src/preview/composeDocument.ts` runs
   `window.stop()` on a `stop` command and was not changed by `97cc8e70`. What I could not
   measure without an account is whether the `/output` renderer clears; the monitor and the
   output share the payload stage, so read that first. Workaround in the owner walk: trust the
   header and the OBS picture, not the monitor.
2. **Update after a reveal carries the reveal onto the next question.** Typing the next question
   and pressing Update airs the new text with the old verdict still drawn. Re-take resets the
   board to the question state, which is the road the walk now teaches.
3. **Next after a reveal does nothing visible.** It logs "Next step" and the board stays on the
   reveal.
4. **The score tracker's state chip prints machine words**: "main: On air · flag: No flag ·
   result: Live". The quiz's chip reads "Question", "Answer selected", "Locked in", "Reveal".
5. **The scoreboard cue editor labels its rows "OTAVA" and "Side B"**: one side by the team's
   value, the other by a placeholder (`src/control/controlModel.ts` grouping).
6. **"Reveal choice" is a disabled button the docs never mention.**
7. **The activity log is empty after a reload** of an unpublished production. Row C's spec
   pinned the reload; if that is by design, the log's empty line could say so.
8. Row C's open finding, Reveal from a reloaded hosted tab, is still the one hosted defect known;
   the walk carries C's workaround.

### In this row's own files, not fixed

- **The wizard preview is blank for three to five seconds after every step change** while the
  entrance waits for the embedded fonts (`WizardPreview.tsx`). The srcdoc is about 270 KB with
  the fonts inlined. A student reads it as "my artwork is gone". A first-frame pose before the
  entrance, or a shorter cap, is the fix; not started because it changes what every preview does
  four days before the demo.
- **The Brand chooser preselects "this production's look"** when the wizard opens from a
  production (`CreationWizard.tsx` line 588 sets `brandId` for the captured look, while the rule
  `wizard/list-saved-brands-name-footer-brand` says a captured look is "offered"). For an
  imported SVG it changes nothing visible, since the artwork keeps its colours. Left alone.
- Em dashes in wizard copy ("Add to the production — go live", "Auto — recommended", the Entry
  cards). Copy voice, not a defect; listed because the owner's public-copy rule says fewer dashes.

## What is left, and why

- The new footer test ran nowhere yet when this was written: the job queue (`j-1636`) sat behind
  three of row K's repeat runs and row B's import suite, and the affected mapper classes a
  `src/styles/` change as core, which means the full suite plus catalog. CI runs exactly that from
  the fork point, and the CSS was measured on the live DOM at three widths, so CI is the verdict
  for the spec. If `j-1636` reports after this lands, its log is `node scripts/jobs.mjs log j-1636`.
- The hosted legs (publish, output URL, Reveal from a reloaded tab, Out reaching OBS) are row G's
  and need the configured suite or an account.
- The tail, the import step's cold read-back, moved to row L with the folder; the read-back is
  items 2 to 5 above.

## Traps that are in no repo file

- **The browser pane clears a viewport you set whenever the turn ends or the pane resizes.** Set
  it again before every measurement, or the numbers are the pane's own 800px width.
- **Dropping a file in the pane**: there is no upload tool, so fetch the same-origin file and set
  `input.files` through a `DataTransfer`, then dispatch `change`. React's handler fires.
- **A `<select>` inside a flex label shrinks below its widest option in Chromium** when it has
  `flex-basis` and an explicit `min-width`, which is what the footer relies on; the review's
  reading of the spec said it would not. The test now measures the row rather than the buttons,
  so a browser that disagrees fails it rather than passing quietly.
- **Screenshots two seconds after a step change catch the wizard preview mid-fade** and look like
  a broken render. Wait four.
- The sandbox refuses a `for` loop that polls the queue and a heredoc piped into a file; use
  `node scripts/jobs.mjs wait <id>` and the Edit tool.

## The check

`review: delegated`. The code-review skill returned six findings with the branch, base
`da821d84` and the four files; that scope was compared with `git diff --name-only` plus
`git status --porcelain` here and matched. Finding 1 (the label cannot shrink) was refuted by
measurement on the live DOM and by the new test; findings 2, 3 and 4 were fixed (the test now
asserts the row fits with a long name; a container query replaces the viewport breakpoint; the
select's dead 12px is scoped so it applies); finding 5 (Tab order under the wrap) is accepted and
recorded in the CSS comment, since the JSX reorder would put the chooser left of Back on every
wide screen; finding 6 (the owner note's claim) is true once 2 holds.
`simplify: inline`. The simplify skill returned fan-out instructions, so the four angles were read
here over the same diff: one duplicate measurement dropped from the test. Nothing else.
`verify: inline`. `npm run build` exit 0 read from the task's own output, stamped
`claude/e-demo-rehearsal`, before and after the check's edits. The e2e plan is CI's (above).
`taste: not applicable`. Nothing here changes how a graphic renders; the change is wizard chrome.

## For the owner

Nothing needs an account, money or identity from you before Friday. Read the owner walk's "Before
you press" list once at the desk; item 1 there (Out and the monitor) is the one to have row G
answer on the published production before the demo.

## Commits

`838a4385` the footer fix, its spec and the owner walk; the check's follow-up commit; this handoff.
