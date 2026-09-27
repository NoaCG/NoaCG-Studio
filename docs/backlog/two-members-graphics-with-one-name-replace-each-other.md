# Two members' graphics with the same name replace each other in a team production

**Filed:** 2026-09-27. **Source:** code reading while building the three-member walk
(`e2e/configured/teams.spec.ts`, "three accounts"). The walk gives each member's graphic its own
name, so it does not hit this; it is not reproduced in a run.

## Why

`addGraphicToShow` (`src/model/shows.ts`) treats a graphic's NAME as its identity: adding a graphic
whose name is already in the pool replaces that entry in place and keeps its cues. Within one
account that is the intended "add again = update" rule, because a library's names are unique. In a
team production the pool holds graphics from several libraries, and names are not unique across
them. Two students who each make a "Lower third" from the wizard's default name are the ordinary
case: the second one to add theirs silently replaces the first one's graphic, and the first one's
cues now drive the second one's design. Nothing says so.

The output side has the same assumption: the published payload keys graphics by name
(`buildOutputPayload`, `key: g.name`), and so do the cue wire and the output page's frames, so two
pool entries with one name cannot coexist even if the add allowed it. A concurrent add from two
members goes through the team save's merge (`src/model/teamShowMerge.ts`), which keys by id and
keeps both - leaving two entries with one name, which the payload then collapses.

## What it would take

In `addGraphicToShow`, replace in place only when the existing entry is the same library record
(same `graphicId`, or neither has one, which is the pre-library behaviour). A different record with
a taken name joins under a distinct pool name ("Lower third (2)"), the way `resolveShowName` already
names productions. The merge would need the same rule for two concurrent adds: the one it moves
(ours, as with layers) gets the distinct name. Then extend the three-member walk so two members add
graphics with the same name and both play out.

## Evidence

- `src/model/shows.ts` `addGraphicToShow`: `show.graphics.findIndex((g) => g.name === template.name)`.
- `src/control/hostedControl.ts` `buildOutputPayload`: `key: g.name`; `src/output/stage.ts` titles
  and addresses each frame by that key.
