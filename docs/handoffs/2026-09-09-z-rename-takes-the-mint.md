# Session Z - the rename that overwrote a stranger's graphic

**Branch:** `claude/z-rename-takes-the-mint` (3 commits plus a merge of `main`, on `bce60a4b`)
**Acceptance item:** `docs/acceptance/owner-queue/2026-09-09-renaming-in-the-wizard-cannot-take-another-graphic.md`
**Spec:** `e2e/import-name-collision.spec.ts` - two new cases beside row G's five, in G's own file.

## What I reproduced, and what I could not

**Reproduced, exactly as the row described it.** Import a graphic and save it as `Sponsor` through
the export door, then change the name field to `Away Team` and press the door again in the same
wizard. `Away Team` was a graphic from an earlier walk, pooled into a production. The save
resolved the new name against the library, found that record and wrote today's artwork into it.
Measured on the pre-fix code (`j-0816`):

    expect(kept?.fields).toEqual(['zz'])
    - Expected  - 1     Array [ "zz" ]
    + Received  + 1     Array [ "f0" ]

That is last week's artwork replaced by today's, in a record this walk never opened. There is no
undo in the library and no history, so it is gone. The walk's own record was left orphaned under
the name the reader had abandoned.

**One thing in the row's WHY did not hold: the loss was NOT silent.** The Finish step's name-field
warning did fire, because that record existed when the step opened, and it said "Your library
already has a graphic called Away Team. Finishing saves over it." True, and the same sentence the
benign case gets - which is the real problem with it. So the defect I fixed is the behaviour, not
a missing disclosure. The disclosure hole is the second finding below, which is a different case.

**Also reproduced (finding 5a):** a record created while the Finish step is already open was
invisible to it. `finishLibraryNames` was memoized on `[onFinish]`, so it snapshotted the library
when the step opened and never refreshed, while the save used a live lookup. Pre-fix run:

    Locator: getByTestId('wz-finish-name-taken')
    Expected substring: "Your library already has a graphic called Away Team"
    Error: element(s) not found

**5b I did not treat as its own hole.** The row described the missing field-loss detail for a
library overwrite as a disclosure gap, and it was, but the fix is one line off the same index
rather than a separate mechanism, so it ships with the rest: the name-field warning now names the
cue values an overwrite strands, the way the production door's confirmation already did.

## The comment or the code

**The comment, in its second sentence, and it disagreed with its own first sentence.** The two
were:

1. "A RENAME is a different graphic and takes the mint."
2. "`madeThisOpen` is checked first because it holds an id: it still answers correctly for a
   graphic RENAMED mid-walk, which a name lookup cannot."

(2) describes the walk's own id deciding; (1) describes the name deciding and a mint. The code
implemented (1), and its `madeThisOpen` branch was nearly dead - `again.name === name` made it
differ from the name lookup only when the library already held twins. So it was effectively one
rule: the name decides, always.

I took (2)'s intent and went further than either: **the walk's own record is the target whenever
it still exists, whatever the name field says**, so a rename moves that record rather than minting
beside it. Only a walk that owns nothing resolves its name against the library, which is exactly
the case row G's rule was written for.

I consulted a Fable subagent with the measured evidence before deciding, because both answers cost
something and the class is three days out. The argument that settled it: for the name to decide
here, typing in that field would have to reliably mean "make this artwork become that graphic",
and a wrong guess would have to be cheap. Neither holds. The same gesture means RENAME everywhere
else in the app - Home's own `commitRename` renames onto a taken name with no guard at all - and a
wrong guess destroys a graphic with no undo. The trade it buys is two graphics sharing a name,
which one rename on Home puts right.

That deliberate twin cell is written into
`docs/backlog/two-doors-still-mint-a-twin-under-a-taken-name.md`, because a later session reading
row G's rule on its own would "fix" it straight back into the destruction.

## What ships

- **`src/model/library.ts`** - `librarySaveEffect(index, name, madeId)` is the ONE answer to "what
  does pressing a door under this name do to the library": `mint`, `update` (the walk's record,
  with `renamedFrom` when it moves and `sharesWith` when another graphic carries the new name), or
  `over`. `graphicNameIndex()` is the library reduced to ids, names, timestamps and field titles.
  `holderIn` is the newest-wins name rule, now shared by `graphicHoldingName` and the effect so the
  two cannot drift.
- **`src/store/saveActions.ts`** - `saveCurrentGraphic({ name })`, so a rename reaches the record
  and not only its template. The key is ADDED rather than set to undefined, because `updateGraphic`
  copies the patch with `Object.assign` and would write an undefined name onto the record.
- **`src/components/wizard/CreationWizard.tsx`** - the save calls `librarySaveEffect`; the Finish
  step's library index is state refreshed on `spx-data-changed` (the event Home already refreshes
  on) and on `noteMade`, which is what closes 5a for both halves - the library and the ref.
- **`src/components/wizard/steps/FinishStep.tsx`** - the same call drives every sentence, so the
  disclosure cannot promise something the write does not do. Four states, three sentences: the
  overwrite warning (G's, plus the stranded cue values), the shared-name warning, and a calm hint
  for your own record.

## The runs

Pre-fix, both new cases failing, `j-0816`: **2 failed, 5 passed** - the five are row G's, untouched.
Post-fix, `j-0818` over both wizard spec files: **23 passed (49.6s)**.

`j-0819`, `npm run test:e2e:integration` from the fork point after merging `main`: the catalog gate
passed (35 tests) and the suite reported 5 failures. I ran `npm run build` concurrently, which is
the load that produces exactly those shapes - three were plain timeouts (`counting-settle` 3.0m,
`import-svg-corpus` setInputFiles 3.0m, `lazy-editor` click 1.0m) and one was
"Execution context was destroyed" in `library-bulk`. All four passed on a quiet re-run (`j-0824`).
**`catalog-baseline.spec.ts` "every catalog variant renders identically" failed in every run**, and
it is the KNOWN laptop-only failure filed yesterday in
`docs/backlog/a-fourth-data-holder-appears-in-credits-on-this-laptop.md` - the same nine credits
variants (cr01, cr02, cr03, cr04, cr06, cr08, cr11, cr12, cr13), the same `#count` and
`div.noacg-data-source` elements, and that file records it reproducing with the SVG work stashed
and CI green on the identical sha. Nothing in this change touches template rendering.

`j-0825`, the clean re-run of both wizard spec files plus `catalog-baseline`: **26 passed, 1
failed** - the failure being exactly that pre-existing one.

`j-0824` also failed my two new cases with `ReferenceError: strandedBy is not defined` - I edited
FinishStep while that run was in flight and Vite hot-reloaded a half-applied file. My mistake, not
the code's: **do not edit source while a suite is running.** `j-0825` is the clean re-run.

`npm run build`: exit 0 twice, before and after the merge of `main` (read off the build's own exit
code, not a pipe's).

## The check

- **review: delegated.** The code-review skill at level `high` returned findings into this
  conversation; scope-checked against this worktree's branch and the seven files of this diff
  first. Two findings, both confirmed against the surrounding code and both fixed in `24d13b3f`.
  (1) `graphicNameIndex` read `template.fields` off a STORED record with no guard, while every
  other reader in the codebase guards it - one malformed record would have thrown inside a door's
  promise, leaving the reader with nothing saved and nothing said. (2) The shared-name warning said
  the other graphic is "left alone", which is true of the library row and false of a production
  that pools it: `addGraphicToShow` matches by name and repoints `graphicId`, so the production
  would follow the renamed graphic. The warning now says so, the production confirmation says the
  link moved, and the warning also appears when a previous press already left the two sharing a
  name.
- **simplify: inline.** The simplify skill returned fan-out instructions rather than a result, so
  the leg ran here over reuse, simplification, efficiency and altitude. Three changes: the
  stranded-field arithmetic (asked of the pool copy and of the library record) became one
  `strandedBy` helper; the `twin` union member collapsed into `update` with `sharesWith`, which
  drops a case without losing a state; and the Finish index listener stopped building a second
  identical closure. Not taken, deliberately: making `updateGraphic` skip undefined patch values
  would protect every caller, but `folder` is a field somebody may legitimately want to clear, so
  the guard stays at the call site.
- **verify: inline.** Build green (exit 0). `check:copy` passes on the new sentences. The e2e
  evidence is above, and I drove the Finish step in this worktree's own dev server at 1440x900 and
  1366x768 and MEASURED the result rather than reading the code: the shared-name warning sits at
  the same 236px left edge as the input and the hint, wears the same amber `status-warn` as row
  G's, and both door faces read as sentences ("Renames the graphic you just saved to Away Team,
  pools it into the production with its first cue ready"). It first came out at four lines (68px
  at 1366), against 34px for G's two-line warning in the equivalent screen, which pushes the doors
  down in a container that already scrolls at that height. So the pool consequence moved to the
  production door's confirmation - the only door that causes it - and the shared line is three
  lines (51px). The benign paths are byte-identical to G's copy, measured in the same session.
- **taste: not applicable.** Nothing here can move what a graphic looks like - no design file, no
  template machinery, no SVG import road, no fit or alignment code. The wizard copy I changed is
  three sentences on the Finish step, which is not a rendered graphic.

## Open, and what I would look at first

- **`catalog-baseline.spec.ts` "every catalog variant renders identically" is red on this laptop
  and was before this branch existed.** Nine credits variants, a fourth `noacg-data-source` holder
  that CI does not render, filed and measured yesterday in
  `docs/backlog/a-fourth-data-holder-appears-in-credits-on-this-laptop.md`. It fails identically
  here, so it is not evidence about this change - but it does mean the local integration plan
  cannot go fully green on this machine until somebody answers which side is right, and every row
  that runs the plan tonight will hit it.
- **`graphicHoldingName` now has no caller in `src`.** Kept on purpose: the backlog file names it
  as the lookup the two remaining twin-minting doors should reuse, and it and the effect now share
  one implementation of the newest-wins rule.
- **The kit / Pro-package Finish** (`KitFinishStep`) gets none of this. Same backlog file.

## Pointers

- `src/model/library.ts` - `graphicNameIndex`, `holderIn`, `librarySaveEffect` and the reasoning
  above it.
- `src/components/wizard/CreationWizard.tsx` - `saveBuiltGraphic`, and the Finish index listener
  beside `finishProductions`.
- `src/components/wizard/steps/FinishStep.tsx` - `effect`, `savingOver`, `renamingTo`,
  `sharesNameWith`, `strandedBy`.
- `e2e/import-name-collision.spec.ts` - the two new cases at the foot of the file, and G's five
  above them, which are what says the fix did not go too far.
