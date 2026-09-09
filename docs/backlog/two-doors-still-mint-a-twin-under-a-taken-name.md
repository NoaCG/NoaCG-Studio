# Two doors still mint a second graphic under a name you already used

**Filed:** 2026-09-08, from the row that fixed the same shape on the wizard's Finish doors. Named
here rather than fixed there because these are different doors and the row's fix was scoped to
what it reproduced. What was proved, and the rule that came out of it, is in
`docs/acceptance/owner-queue/2026-09-08-importing-your-artwork-twice-keeps-one-graphic.md` and
pinned by `e2e/import-name-collision.spec.ts`.

## The rule these two doors do not follow

A saved graphic's name is its identity. The production pool has always worked that way
(`addGraphicToShow` replaces by name), and since 2026-09-08 the wizard's Finish doors do too:
`saveBuiltGraphic` resolves the record through `librarySaveEffect` (`src/model/library.ts`) and
writes over it, with the Finish step saying so on the name field and in the production door's
confirmation before anything is written.

## One cell where the Finish doors make a twin ON PURPOSE

Since 2026-09-09 a Finish door writes to the record THIS WALK ALREADY MADE whenever it still
exists, whatever the name field now says. So renaming mid-walk onto a name a different graphic
already carries leaves two graphics sharing that name. That is deliberate and must not be
"fixed" back: the alternative was resolving the new name against the library, which wrote today's
artwork into a graphic the walk had never opened and destroyed it, with no undo and no history
(reproduced in `e2e/import-name-collision.spec.ts`, "a rename mid-walk never writes over a graphic
this walk did not make"). A twin is recoverable with one rename on Home; the destruction was not
recoverable at all. The Finish step names the collision before the door is pressed
(`wz-finish-name-twin`), and ending the walk with the ✕ (`forgetWalk`) is what makes the next save
resolve by name again.

Closing the two doors below does not close this cell, and a tie-break that prefers a pooled
record (below) is the right answer to it rather than a rule that reaches across on a rename.

Two records under one name are not merely untidy. They make `resolveSavedGraphicDoc`
(`src/model/library.ts`) ambiguous by design, so a production pool copy with no `graphicId`
back-link resolves to nothing and its control entries disappear from the hosted control page and
the show export. Every remaining door that can create a twin can therefore still produce that.

## Door 1: the plain Save dialog

`src/components/save/SaveDialogs.tsx:58` calls `saveGraphicAs` straight, and `saveGraphicAs`
(`src/store/saveActions.ts`) always mints. No lookup, no warning: typing a name you already used
leaves two library rows nobody can tell apart on Home.

The dialog serves two modes - a first Save, and "Save a copy" whose default name is already
`<name> copy`. Decide the copy mode's answer deliberately rather than sharing one branch with the
first-save one.

## Door 2: the kit / Pro-package save

`src/model/templateSet.ts:49` calls `createGraphic(template, { name: template.name })` with no
lookup and then `addGraphicToShow`. Running the same kit into the same production twice
reproduces exactly the fixed shape: twin rows on Home, and the first silently detached from the
production, because the pool's by-name replacement re-points `graphicId` at the new record.

## A consequence worth closing at the same time

While a twin factory remains, `graphicHoldingName`'s "newest wins" tie-break can pick the wrong
one: if a production pooled the OLDER twin, a wizard save-over writes the newer, unpooled record
and the production keeps airing the old artwork - after the Finish step has told the student it
saved over their graphic. The tie-break is only ever consulted when twins already exist, so
closing both doors above removes the case rather than needing a cleverer tie-break. If one of
them is left open on purpose, make the tie-break prefer a record some production pools.

Also unresolved and adjacent: `duplicateGraphic` appends `" copy"` with no uniqueness check, so
duplicating twice gives two `X copy` records.

## What it would take

Reproduce each door the way the wizard door was reproduced - drive it, measure the library and
the pool - then reuse `librarySaveEffect` (or `graphicHoldingName`, which is the same rule for a
door that has no walk behind it) and say the same thing the Finish step says: the name is taken,
finishing saves over that graphic, change the name to keep both.
