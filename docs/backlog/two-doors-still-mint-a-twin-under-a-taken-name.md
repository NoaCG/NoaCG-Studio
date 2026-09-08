# Two doors still mint a second graphic under a name you already used

**Filed:** 2026-09-08, from the row that fixed the same shape on the wizard's Finish doors. Named
here rather than fixed there because these are different doors and the row's fix was scoped to
what it reproduced. What was proved, and the rule that came out of it, is in
`docs/acceptance/owner-queue/2026-09-08-importing-your-artwork-twice-keeps-one-graphic.md` and
pinned by `e2e/import-name-collision.spec.ts`.

## The rule these two doors do not follow

A saved graphic's name is its identity. The production pool has always worked that way
(`addGraphicToShow` replaces by name), and since 2026-09-08 the wizard's Finish doors do too:
`saveBuiltGraphic` resolves the record through `graphicHoldingName` (`src/model/library.ts`) and
writes over it, with the Finish step saying so on the name field and in the production door's
confirmation before anything is written.

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
the pool - then reuse `graphicHoldingName` and say the same thing the Finish step says: the name
is taken, finishing saves over that graphic, change the name to keep both.
