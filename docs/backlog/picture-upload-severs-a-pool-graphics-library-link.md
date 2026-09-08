# Adding a picture on the production page severs that graphic's link to the library

**Filed:** 2026-09-04. **Source:** code review of the library production filter
(`claude/l-browse-a-productions-graphics`), confirmed against the call site.

## Why

A production's pool copy records the id of the library graphic it was made from, and that
back-link is the only thread anything can follow from one to the other. Two features read it, and
both go quiet when it is gone rather than failing: `publishControlShow` follows it to publish a
graphic's control entries to the hosted control page, and the library's production filter (added
today) follows it to list which graphics are in which production.

`ProductionPage.tsx` breaks the link as a side effect of an unrelated action. Adding a picture to
a graphic on the production page re-pools the edited template with `addGraphicToShow(show.id,
template, {})` - and `addGraphicToShow` replaces the pool entry BY NAME, rebuilding the record
from scratch, writing `graphicId` only when the caller supplies one. So `{}` does not merely fail
to set the back-link, it deletes the one that was already there. Nothing tells the user, and the
graphic goes on airing exactly as before.

The consequence is now visible rather than silent, which is the argument for fixing it rather
than leaving it: the graphic disappears from its own production's listing in the library while
still being in the production, and the Home production card's size stops matching the count it
can browse.

## What it would take

Preserve the existing entry's `graphicId` across a replacement. The call site knows which pool
entry it is replacing and could pass the id, but the better fix is one level down: make
`addGraphicToShow` carry the previous entry's `graphicId` forward when it replaces by name and
the caller names none. That is the same rule the pool `id` and the `layer` already follow two
lines above it in the same object literal, for the same reason - a replacement must not silently
undo what the operator set up. Check every caller before changing shared behaviour, and read
`src/model/AGENTS.md` first.

Cover it: pool a saved library graphic, add a picture to it on the production page, and assert
the pool copy still carries its `graphicId` and the library's production filter still lists it.
Map the spec in `scripts/e2e-affected.mjs` in the same commit.

## Evidence

- `src/components/home/ProductionPage.tsx` - the picture flow's `addGraphicToShow(show.id,
  template, {})`.
- `src/model/shows.ts` `addGraphicToShow` - `...(opts?.graphicId ? { graphicId: opts.graphicId }
  : {})`, beside the `id` and `layer` lines that DO carry forward.
- `src/components/home/sections/ProductionsSection.tsx` `ProductionStats` - reports the linked
  subset separately when it differs from the size, which is the diagnosis rather than the fix.
- Found on `claude/l-browse-a-productions-graphics`, 2026-09-04; that handoff was drained
  2026-09-08 and the diagnosis above is the whole of what it held on this defect.
