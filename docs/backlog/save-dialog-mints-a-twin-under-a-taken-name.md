# The plain Save dialog still mints a second graphic under a name you already used

**Filed:** 2026-09-08, from the row that fixed the same shape on the wizard's Finish doors
(`docs/handoffs/2026-09-08-g-import-name-collision.md`). Named here rather than fixed there
because it is a different door and the row's fix was scoped to what it reproduced.

## What is wrong

`saveGraphicAs` (`src/store/saveActions.ts:68`) always mints: it calls `createGraphic`, which
always takes a fresh uuid. It has exactly two callers. The wizard's `saveBuiltGraphic` no longer
reaches it for a name the library already holds - it resolves the record through
`graphicHoldingName` (`src/model/library.ts`) and writes over it, and the Finish step says so
before the door is pressed. The **Save dialog** (`src/components/save/SaveDialogs.tsx:58`) still
calls it straight, with no lookup and no warning, so typing a name you already used leaves two
library rows with the same name and no way to tell them apart on Home.

That is the state the wizard fix exists to prevent, because two records under one name also make
`resolveSavedGraphicDoc` (`src/model/library.ts`) ambiguous by design: a production pool copy with
no `graphicId` back-link then resolves to nothing, and its control entries disappear from the
hosted control page and the show export.

## What it would take

The lookup already exists. The dialog needs to read it and say the same thing the Finish step
says: the name is taken, finishing saves over that graphic, change the name to keep both. Note the
dialog serves two modes - a first Save and "Save a copy", whose default name is already
`<name> copy` - so the copy mode's answer may differ from the first-save one. Decide that
deliberately rather than sharing one branch.

A second thing to settle while there: `duplicateGraphic` appends `" copy"` with no uniqueness
check, so duplicating twice gives two `X copy` records.

## Evidence

The wizard half was reproduced through all four import doors on 2026-09-08 and is pinned by
`e2e/import-name-collision.spec.ts`. This door was not driven - it is named from the call site,
which is why the first step here is to reproduce it the same way.
