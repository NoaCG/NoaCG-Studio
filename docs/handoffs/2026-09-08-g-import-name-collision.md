# Session G - the name that ate a cue

**Branch:** `claude/g-import-name-collision` (2 commits, `ac1abb45` then `46ecdecd`, on `032678a2`)
**Backlog file it closes:** `docs/backlog/import-name-collision-replaces-a-cue.md`, deleted.
**Acceptance item:** `docs/acceptance/owner-queue/2026-09-08-importing-your-artwork-twice-keeps-one-graphic.md`
**Spec:** `e2e/import-name-collision.spec.ts` (5 tests), registered in `scripts/e2e-lists.mjs` FOCUS.

## The verdict, in one line

The defect is real but it is not the one the file described. A cue is never deleted and never
re-pointed. What happens is that the LIBRARY mints a second record under the same name, the
production's pool copy silently moves its back-link to it, and the graphic the cues were built on
is detached - which is how it looks, from the student's chair, like the cue was eaten.

## What I drove, and what each shape did

Reproduced first, in the running app, before reading any more of the save path. Every shape went
through the real UI: `/app` -> Import graphic -> drop the file -> Next -> the Finish step's
"Add to the production - go live" door -> its confirmation. Two versions of one template, same
`<title>` ("Match Score"), different operator field (`f0` "Home team" vs `f9` "Sponsor").

Measured state after the second import, identical in every shape:

    library: [{id: e93339c4, name: "Match Score", fields: [f0]},
              {id: cda89835, name: "Match Score", fields: [f9]}]   <- TWO records, one name
    pool   : [{id: dd8231e3, name: "Match Score", graphicId: cda89835, layer: 20, fields: [f9]}]
    cues   : [{id: e88c1134, sourceId: dd8231e3, label: "Match Score", values: {f0: "Home team value"}}]

1. **Import .html twice.** Two library records. The pool entry KEPT its id and its layer (20), so
   the cue survived by id - but its `graphicId` moved to the new record and its template became
   the new artwork. The cue's stored values still address `f0`, which the new version does not
   have. The first library record is still in the library and in no production.
2. **Import a .zip twice.** Byte-for-byte the same outcome. The zip door reaches the same
   `importTemplateFile` result and the same Finish door.
3. **The identical file imported twice.** Two byte-identical library records under one name. Pure
   duplication with nothing to tell them apart; the pool re-points to the second.
4. **The wizard's own Finish door, inside ONE wizard open.** Correct already, and this is what
   named the gap: `madeThisOpen` (CreationWizard.tsx) makes the second press write over the record
   the same walk made. Closing the wizard between imports is all it takes to lose that, which is
   exactly what a student does between two trips to their drawing tool.

"Same name" here means the TEMPLATE's `name`, derived by `importTemplate.ts:176` from the file's
`<title>` (falling back to the file name). The library record's name is set from it at save, and
the pool copy matches on `template.name`. All three were the same string in every shape I drove.

## The path, named from a stack

Not from a reading of the source. I patched `durable.setItem` in the page to capture a stack on
every write of `spx-gfx-shows`, drove the second import, and read back:

    at durable.setItem (instrumentation)
    at saveAll (http://localhost:5232/src/model/shows.ts:14:11)
    at addGraphicToShow (http://localhost:5232/src/model/shows.ts:132:10)
    at addToProduction (http://localhost:5232/src/components/wizard/CreationWizard.tsx:1310:18)

`addGraphicToShow` replacing by name is DELIBERATE and documented - it keeps the pool entry's id
so cues survive, and keeps the operator's chosen layer. The library half is the bug: `saveGraphicAs`
-> `createGraphic` always mints a fresh uuid, so the pool was re-pointing at a record that should
never have existed.

Downstream, two records under one name also make `resolveSavedGraphicDoc` ambiguous BY DESIGN
(it refuses to guess), so any pool copy without a `graphicId` back-link stops resolving its
control entries at all. The spec pins that resolution too.

## What ships, and why that and not the alternatives

**A saved graphic's name is its identity, in the library exactly as it already was in the pool.**
`graphicHoldingName` (`src/model/library.ts`) is the one answer to "what does this name already
mean", and the wizard's `saveBuiltGraphic` writes over that record instead of minting a twin. The
record keeps its id, so every production pooling it keeps pointing at the same graphic.

I consulted a Fable subagent on this call with the measured evidence, because both plausible
answers destroy something and the class is four days out. It landed on the same reading and
sharpened it; the argument that decided it is that the pool and the library disagreeing about
what a name means IS the bug, so the fix has to be one rule read from both places.

Rejected, with reasons: a **silent** overwrite (it is not silent - see below); a **blocking dialog
on every re-import** (unnecessary, the production door already confirms every press);
**auto-renaming** the second to "Match Score 2" (worst of the three - the production keeps pointing
at the old graphic while the student's new artwork sits beside it under a name they did not
choose, so their new version silently never airs); and **keeping the twin and disambiguating
downstream** (papers over an identity the product has already decided is a name).

**It is disclosed in three places, none of them a new dialog:**

- The Finish step's NAME FIELD, when the name is taken: "Your library already has a graphic called
  X. Finishing saves over it. Change the name above to keep both." On the field because every door
  on that step saves under it, and the export door saves and leaves without asking anything.
- Both DOOR FACES: "Saves over X in your library, pools it into the production..." and "...Saves
  over X in your library first."
- The production door's CONFIRMATION, which already fired on every press: the library line now says
  "X is saved over the version in your library. Its data rows stay." (it used to claim "is saved to
  your library", which was false), the title becomes "Save over X and add it here?" when only the
  library collides, and when the replacement DROPS a field it names the cue values that stop
  addressing one: "Cue values for Role no longer match a field in this version and are ignored on
  air; new fields start from their defaults."

Keeping both is the name field, one keystroke away, rather than a control that picks a name nobody
chose.

## The pre-fix failing run, and the post-fix one

Same spec file, same command, the fix stashed and restored:

    git stash push -- src/model/library.ts src/components/wizard/CreationWizard.tsx \
                      src/components/wizard/steps/FinishStep.tsx
    npx playwright test e2e/import-name-collision.spec.ts --workers=1

**Pre-fix - 4 failed** (the fifth test, the name-field one, was written after this run):

    x  a second .html import under one name saves OVER the graphic...
       expect(received).toHaveLength(1)   Received length: 2
       Received array: [{fields:["f0"], id:"57d19f5f...", name:"Match Score"},
                        {fields:["f9"], id:"eaf2ac4e...", name:"Match Score"}]
    x  the same collision through an SPX-style .zip            (same, 2 records)
    x  the identical file imported twice leaves one graphic    (same, 2 records)
    x  a re-import into a DIFFERENT production...
       Expected substring: "Save over Match Score and add it here?"
       Received string:    "Add it to this production?"

**Post-fix - 5 passed** (28.8s for the first four; 50.0s with wizard-finish beside it).

## A contract this supersedes - read this before assuming a regression

`e2e/wizard-finish.spec.ts` pinned TWO library records under one name after rewinding the wizard
with its close button, and it failed on this branch. That was deliberate, not collateral: the
test's own stated reason for wanting two was that a write-over would happen "with nothing anywhere
having said so", and two places on that screen now say so. The twin it preferred was the defect.

I split it in two rather than deleting it. Its other half - rewinding ends the walk, so the next
graphic under a DIFFERENT name is its own record - is unchanged and still pinned. The new half
asserts the over-save and both disclosures.

## What is left

Named, not fixed, because I did not reproduce those doors:
`docs/backlog/two-doors-still-mint-a-twin-under-a-taken-name.md`.

- **The plain Save dialog** (`SaveDialogs.tsx:58`) calls `saveGraphicAs` straight and still mints a
  twin under a taken name with no warning at all. Its "Save a copy" mode needs its own answer.
- **The kit / Pro-package save** (`model/templateSet.ts:49`) mints and then pools into a
  production, so running one kit into one production twice reproduces the whole fixed shape.
- **`graphicHoldingName`'s newest-wins tie-break** is only consulted when twins already exist. If
  a production pooled the OLDER twin it writes the newer one and that production keeps airing old
  artwork. Closing the two doors above removes the case rather than needing a cleverer rule; the
  code comment and the backlog file both say so.
- **`duplicateGraphic`** appends " copy" with no uniqueness check.
- **CI warning, pre-existing shape:** `import-name-collision.spec.ts` has no measured duration and
  was packed at the median, alongside `library-productions.spec.ts` and `wizard-brand.spec.ts`.
  `npm run record:e2e-durations` refreshes from the newest green FULL run, which only `main`
  produces, so it settles on its own after this lands.

## The check

- **review: delegated.** The code-review skill (level `high`) forked and returned findings into
  this conversation; scope-checked against `ac1abb45` and this worktree's file list before acting.
  7 findings, 6 fixed in `46ecdecd` (the export door's copy, the kit door named in the backlog,
  the honest tie-break comment, a dead `src/model` mapping row - CORE is tested first, so it was
  unreachable - the failed-save message, and three permanent files citing a transient handoff
  path). The seventh, a names-only read of the library on each Finish, was answered by moving it
  into `graphicNames()` beside the existing `graphicFolders()`; the parse itself stays and is one
  per Finish appearance.
- **simplify: inline.** The simplify skill returned fan-out instructions rather than a result, so
  the leg ran here over reuse, simplification, efficiency and altitude. One finding worth acting
  on, the `graphicNames()` move above.
- **verify: inline.** `npm run build` green (its `check:copy` gate caught an em dash in my new
  line and a second pass caught a shouty "NEW" in the dialog hint, both rewritten). 137 e2e over
  every consumer of the changed code, green. CI on `ac1abb45`: run 34277845344, **success**, and
  the jobs that ran were E2E plan, Factory gates, Build, nine E2E subset shards, Combined E2E
  report and CI gate (Reviewed, Vercel, Catalog calibration and E2E retry skipped) - the plan
  selected `import-name-collision.spec.ts` into shard 6, so the new spec really ran there. CI on
  the reviewed tip `46ecdecd` (run 34281296240) was still queued when I queued the branch; the
  landing queue is what waits on it.
- **taste: not applicable.** Nothing here can move what a graphic looks like - no design file, no
  template machinery, no SVG import road, no fit or alignment code. The wizard UI I did add was
  walked in the browser at 1440x900 and 1366x768: the name field's line aligns at the same left
  edge as the input, the hint and the heading (all 236px), both door faces read as sentences, and
  both confirmation shapes fit inside 768px with the stranded cue field named by its TITLE
  ("Role") rather than its id.

## Pointers

- `src/model/library.ts` - `graphicNames`, `graphicHoldingName`, and the comment that explains why
  the tie-break is a tie-break.
- `src/components/wizard/CreationWizard.tsx` - `saveBuiltGraphic` (the save), `finishLibraryNames`
  (what the step reads).
- `src/components/wizard/steps/FinishStep.tsx` - `savingOver`, `strandedFields`, and the three
  places the fact is stated.
- `e2e/import-name-collision.spec.ts` - the five cases, and the `snapshot()` helper that reads the
  library, the pool, the cues and the resolver together.
