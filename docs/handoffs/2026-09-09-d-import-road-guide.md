# Session D - the import road, walked and written down

**Branch:** `claude/d-import-road-guide` (3 commits, on `4b536758`)
**Acceptance item:** `docs/acceptance/owner-queue/2026-09-09-d-first-graphic-guide.md`
**Spec:** `e2e/docs.spec.ts` - one new case, "the step-by-step walk keeps the road, the three
surprises and its handoffs".

## What landed

`/docs` now carries `#first-graphic`, "Your first graphic, step by step", between the graphics
shelf and the SVG guide. It takes a reader from a file they drew to a cue an operator takes to air:
the five steps of the import wizard, the moments where the product does something a first-timer
would read as a fault, the two doors on Finish, and handoffs to the guides that already answer the
rest. `#getting-started` and `#svg` both point at it, and `#dashboard` gained the wizard's own
one-press route into a production, which it did not carry.

The nav stays main-topics-only: one new entry in an existing group, no new group.

## The walk, because the walk was the deliverable

I drew a lower third the way Figma exports one - a rounded backplate, an accent tab, two live
`<text>` layers named `Name` and `Role`, `Archivo` at 54 and 26 - and dropped it on the real Import
door on this checkout's own dev server (5282). Then: mapping, animation, Finish, into a new
production called "Metropolia Friday Show", Take, a long name typed while the cue was on air, and
Update.

**The importer came out of it clean, and that is the headline.** Both text layers found and named
from their layer ids, the drawn words carried in as the starting text, `Archivo` resolved to the
bundled face, the 1920x1080 page measured at its real size, the growth ladder landing on
`Backplate` (the shape the text actually sits in) and naming it back to me, and the panel visibly
widening on air when the name got long. Nothing in `src/assets/svgImport.ts` needed a fix, so none
was invented.

**What the walk did produce is the list of sentences the screen did not carry**, filed as
`docs/backlog/import-walk-hesitations.md` with a repro each: the step rail silently renumbering
from six to five on the drop, Finish's two name boxes both defaulting to the same word, and the
3x3 alignment grid being the only control on that step that does not write its answer in words.
That is exactly the list the owner's own standard asks for.

## What the review caught, and why it matters

The delegated review (opus, high) found seven things and every one held up against the code. Four
were the guide describing **the walk I took** rather than **the walk the code offers**, which is
the specific failure mode of writing from one session:

- The rail loses **two** steps to an SVG drop, not one. `STEP_TITLES_DESIGN` is
  `['Start','Design','Prepare','Text','Animation','Finish']` and `STEP_TITLES_SVG` is
  `['Start','Design','Fields','Animation','Finish']`, so Prepare and Text both go and Fields
  arrives. My own backlog file had it right while the guide had it wrong.
- The Fields step renders up to nine groups, four conditional on what the file carries. My file had
  five, so I wrote five.
- A layer named with a `static:` prefix arrives **unticked**, so "all of them ticked" was false for
  any file using it.
- **`Create project` is the editor door taken early, and it does not save.** `create()` calls
  `applyDraftProject()` with no arguments while both Finish doors save explicitly. I had written it
  up as a harmless "keep the defaults" shortcut, which is the one misreading on that screen that
  can cost somebody their graphic. The spec pins that sentence now.

The fifth was bookkeeping with teeth: marking `docs-guides-to-write.md` `superseded` would have
dropped the owner's still-unserved 2026-09-03 ask for **Teams instructions**, which was sharing
that receipt, out of the standing-ask count. The guides list itself is finished, so it is deleted
the way the backlog README says landed work is deleted, and the Teams ask now has its own receipt
at `docs/backlog/teams-needs-written-instructions.md`. Two references to the deleted file were
repointed.

## Verification

`review: delegated` (7 findings, 7 fixed) - it returned its findings into this conversation, named
this branch and these files, and every finding was checked against the source before acting.
`simplify: inline` - the skill returned fan-out instructions, so the pass was done here. It
strengthened two assertions: the step loop pinned bare words like "Start" and "Finish" that occur
in the prose either side of the table, so it would have passed after the table was deleted; it now
pins "1. Start" through "5. Finish" inside `.doc-table`. And the handoff-link loop reads
`toBeAttached()` rather than `toHaveCount(1)` on a `.first()`, because the guide legitimately links
the SVG rules twice.
`verify: inline` - `npm run build` exit 0 (its own exit code, not a pipe's), `npm run
test:e2e:affected` 18 passed. Observed rather than inferred: the rendered section read at 1280 and
390 wide, and the whole road walked in the running app before a word was written.
`taste: not applicable` - nothing here can move what a graphic looks like.

CI is green and was read twice, with the job list checked both times rather than the summary
colour: run `34347886767` on `4b536758`, the tip carrying every change to the page and the spec,
and run `34348747075` on `c0d46500`, the markdown after it. Six jobs ran each time and all six
passed - Build, Factory gates, E2E plan, E2E 1/1 (subset), Combined E2E report, CI gate - with the
five expected skips for a non-deploy-affecting change: Vercel, the catalog calibration gate,
Reviewed, the E2E retry and After the gate. Only this file changes after that.

One gate did fire, and it was mine: `check:owner-queue` refused the acceptance item for having no
`kind:` / `date:` front matter. That is a build-only check, which is the argument for running the
build after writing the acceptance note rather than before.

## What I did not do

- **No screenshots in the new guide.** `#svg` carries three, generated by `scripts/docs-shots.mjs`,
  and adding a fourth surface to that script is its own change with its own gate (the spec pins
  each shot's declared size against its real one). `docs/backlog/docs-shots-for-the-sections-that-
  have-none.md` already owns that work. Worth doing: the wizard is the one surface where a picture
  of the step rail would save a paragraph.
- **Publishing was not walked.** `Start production` is disabled on a local build ("Publishing needs
  the cloud backend - this build runs offline"), so the guide hands that leg to `#dashboard`, which
  documents it, rather than describing something I did not run.
- **The three filed hesitations are not fixed.** They are UI decisions in `CreationWizard.tsx`,
  `FinishStep.tsx` and `import/MapSvgFieldsStep.tsx`, not wording, and this branch owned the page.

## Next

The obvious follow-on is `docs/backlog/import-walk-hesitations.md` - three small changes, each one
line of copy in a place that already has the value to print, except the production-name default
which wants a minute of thought. After that, Teams instructions, which is now the oldest unserved
docs ask on the shelf.
