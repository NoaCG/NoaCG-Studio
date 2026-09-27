# A team production's published graphics depend on who presses Publish

**Filed:** 2026-09-27. **Source:** code reading while building the three-member walk
(`e2e/configured/teams.spec.ts`, "three accounts"). Not reproduced in a run: the walk's graphics
carry no saved entries and nobody edits their library copy after adding it, which is the ground
this defect needs.

## Why

GOALS outcome 5 asks that a shared production's "graphics and data are available to the team
rather than trapped in one account". Two pieces of a pool graphic are still resolved through the
PUBLISHER's own library, so they are trapped in the author's account:

- **Saved entries.** `buildPanelSpec` (`src/control/hostedControl.ts`) fills each graphic's
  `entries` from `entriesForSavedGraphic(g, loadGraphics())`, and the lookup is by `graphicId` into
  the library of whoever is publishing. A graphic Cleo added carries her entries only when Cleo
  publishes; when Ben republishes, the hosted control page loses them. Entries are never copied into
  the production (`src/model/library.ts`, "they stay authored in ONE place").
- **The template itself.** `templateForSavedGraphic` prefers the publisher's live library record and
  falls back to the snapshot embedded at add time. If Cleo edits her graphic after adding it, her
  publish airs the edited design and Ben's republish silently airs the old snapshot. The output of a
  team production flips between two designs depending on which member last pressed Publish.

For a personal production both lookups are right (the publisher is the author). For a team
production the rule has no single answer, and the walk shows members republishing is the normal
case, not an edge.

## What it would take

A decision first, then a small change in `hostedControl.ts` and `showExport.ts`, which share the
resolver:

1. **The production's copy is the truth for a team production.** Publish from the embedded template,
   and copy entries into the pool entry when a graphic is added or re-added. An author who edits
   their graphic re-adds it to push the change (the add already replaces by name and keeps cues).
2. Or keep resolving through the library, but store the resolved template and entries in the team
   document at each save, so every member resolves the same thing.

Option 1 is simpler and matches "the production belongs to the team". The walk would then gain a
step: Cleo saves an entry on her graphic, Ben republishes, and the hosted control page lists it.

## Evidence

- `src/control/hostedControl.ts` `buildPanelSpec` and `buildOutputPayload`: both call
  `templateForSavedGraphic(g, library)` with `library = loadGraphics()`; entries likewise.
- `src/model/library.ts` `resolveSavedGraphicDoc`: by `graphicId`, else a unique name match, in the
  caller's library only.
