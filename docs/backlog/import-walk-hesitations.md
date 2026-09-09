---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: >-
  three places where the import wizard needed a sentence of documentation to be usable, found by
  walking the road cold for the /docs step-by-step guide (2026-09-09)
serves: NOW
size: small
touches: src/components/wizard/CreationWizard.tsx, src/components/wizard/steps/FinishStep.tsx, src/components/wizard/steps/MapSvgFieldsStep.tsx
covered-by: e2e/docs.spec.ts, e2e/import-svg.spec.ts
needs-owner: none
---
# Three moments in the import wizard that only the docs explain

**Filed:** 2026-09-09. **Source:** the cold walk of the SVG import road that produced the
`#first-graphic` guide on `/docs` (branch `claude/d-import-road-guide`), driving the running app on
this checkout's own dev server with an SVG drawn for the walk.

## Why

The backlog file this guide came from states the standard, in the owner's words about a different
feature (`docs/backlog/docs-guides-to-write.md`, 2026-09-03):

> Of course, it should be so intuitive that you can just use it without reading anything.

So the guide is the fallback, and every sentence it had to write is a candidate defect in the
dialog. The walk needed exactly three, and they are listed here rather than fixed on that branch
because each is a UI decision rather than a wording fix, and the branch that found them owned the
page, not the wizard.

None of these is an importer defect. `src/assets/svgImport.ts` handled the walk's file correctly
and without a note: both text layers found and named from their layer ids, the drawn words carried
in as the starting text, `Archivo` resolved to the bundled face, the 1920x1080 page measured at its
real size, and the growth ladder landing on the panel the text actually sits in.

## The three

### 1. The step rail renumbers when the file lands, and says nothing

**Repro.** Open `/app#/new`, press **Import graphic**. The rail reads six steps: Start, Design,
**Prepare** (Erase & scale), **Text** (Place fields), Animation, Finish, and the header says
`STEP 2 / 6`. Drop any SVG. The rail becomes five: Start, Design, **Fields** (Map text layers),
Animation, Finish, header `STEP 2 / 5`.

The new rail is right - an SVG has nothing to erase and nothing to place, so Prepare and Text
collapse into Fields. But a reader who has just counted their remaining steps watches them
renumber under a file drop, with no line saying why. Two of the three step NAMES also change, so
it does not read as "one step was removed".

**Shape of a fix.** One line in the Design step's read-back, beside "2 text layers found", saying
that an SVG skips the erase step. It costs a sentence and it is the sentence the guide had to
write. `CreationWizard.tsx` `STEP_SUBS` is where the two rails are.

### 2. Finish has two name boxes, and empty means the same word twice

**Repro.** Reach Finish, leave both name boxes empty, choose **New production**, press
**Add to the production**. The graphic is called `Imported SVG design` and so is the production.

The graphic box's placeholder is `Imported SVG design`; the production box's is
`Production name - e.g. Friday Show (empty = "Imported SVG design")`. Each box is honest on its
own. Together they name two different things the same word, on a screen whose whole job is
naming, and the reader finds out a week later in a library that has three of them.

**Shape of a fix.** The production's empty default should not be the graphic's name. A show
holding one strap is not called "Interview strap". `FinishStep.tsx`.

### 3. The alignment grid on a field row has no words at all

**Repro.** Fields step, any text row. The third control is a 3x3 grid of unlabelled buttons under
the heading `Aligned`. Each cell carries a `title` (`left, top - read from your drawing`), so the
information exists, but only on hover and only one cell at a time.

What the grid decides is which edge holds still when the operator's text is a different length
from the drawn sample - the single most consequential answer on the row, and the one a reader is
least likely to guess from nine blank squares.

**Shape of a fix.** The group already writes its answer beside every other heading on this step
("2 of 2 editable on air", "the panel gets wider, then taller - read from your artwork"). This one
does not. Writing the chosen cell out in words beside `Aligned` would match the step's own pattern
and cost nothing.

## What it would take

Small, and independent of each other. 1 and 3 are one line of copy each in a place that already
has the value to print. 2 is a default, and it is worth one minute of thought about what a
one-graphic production should be called instead.

## Evidence

- The walk itself, and the guide it produced: `#first-graphic` on `docs.html`, pinned by
  `e2e/docs.spec.ts` ("the step-by-step walk keeps the road, the three surprises and its
  handoffs"). Every quoted string above is in that spec or in the guide.
- `docs/backlog/docs-guides-to-write.md` for the standard these are measured against, and for the
  instruction that produced this list: "Write the guide by walking the flow and noting every place
  a sentence was needed - that list is the stage-4 UI work."
- `docs/backlog/svg-import-sweep-findings.md` is the same instrument pointed at the importer
  rather than the wizard. Nothing here overlaps with it.
