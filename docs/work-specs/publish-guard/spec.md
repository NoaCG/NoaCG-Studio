# Publish guard

Status: agreed with the owner on 2026-10-09 (P1). Not built yet.
Parent: `docs/work-specs/playout-workflow-simplification/spec.md` (non-goal 3).

## Why

Publish reads the published version's number, then writes the whole payload in a separate step
with no check (`publishControlShow`, `src/control/hostedControl.ts`). A page holding an older copy
of a graphic therefore puts that copy back on air. In a team production that is any member other
than the graphic's author: their page builds the copy embedded when the graphic was added, so
publishing a cue change reverts the author's newer design. A second window of your own does the
same. Nothing says it happened.

## Goal

Publishing never replaces a newer graphic with an older copy. Each page publishes the graphics it
changed and keeps everyone else's newer ones, with no prompt in the common case. Only when two
pages changed the same graphic does the later one ask, once.

## Non-goals

- The rundown, layers, sounds, bindings, layout and output setup: they come from the production
  record, which team saves already merge per cue (`src/model/teamShowMerge.ts`). A personal
  production on two devices keeps relying on the sync's own rule for its record.
- Showing the newer design on this page: its monitors show this page's copy, as today.
- Merging inside one graphic (per field).
- Refusing pages from before this change on the server: they publish as today until reloaded.

## Owner decision (2026-10-09, binding)

- **P1. Merge per graphic.** A publish puts up the graphics this page changed and keeps the rest
  of the newer published version. It asks only when both changed the same graphic.

## Key decisions

Derived (revertible; each says how):

- **G1. The design merges, the record does not.** Per graphic, its design (template html, css, js,
  assets, resolution, fps, and on the hosted page its fields and saved entries) is merged.
  Which graphics a production has, their layers and sounds, and everything else in the payload
  come from this page's production record as today. Revert: merge over the whole graphic spec.
- **G2. The later edit wins.** Each published graphic carries when its design was last edited
  (the library record's save time, or for an embedded copy the time it was added), who published
  it and when. A copy edited earlier than the published design never replaces it; a later one
  does. That also publishes a change made before this page was opened. Revert: compare with the
  version this page loaded.
- **G3. Both changed.** The published design moved since this page last loaded or published the
  production, and this page's copy was edited after the design it had seen. Only then the page
  asks, once for all such graphics: "<who> published a newer <graphic> at <time>." with "Publish
  mine" and "Keep theirs". Closing it publishes nothing. In a personal production <who> is "Your
  other window", as the team save note says. Revert: the later edit wins without asking.
- **G4. Compare and set.** The write lands only if the published version is still the one the
  merge read; otherwise the page reads again and merges again, up to three times. Two pages
  publishing together both keep their changes. No migration: the condition is a filter on the
  version stamp inside the payload. Revert: the plain update.
- **G5. Quiet.** A merge that keeps someone else's newer graphic says nothing: nothing of this
  page was lost, as with a team save. The "unpublished changes" mark counts only graphics this
  page would actually replace.
- **G6. Old payloads.** A payload published before this change has no edit times; the first
  guarded publish over it treats this page's copies as newer (today's behaviour), once.

Edit times come from each device's clock. A skew larger than the gap between two edits of the
same graphic picks the wrong one; G3's question still covers edits made while both pages watched.

## Behaviour

### AC-1: An older copy never replaces a newer graphic
Anna publishes a new design of Lower third. Ben, whose copy is older (the copy embedded when it was
added, or a window opened before her edit), changes a cue and publishes. Air keeps Anna's Lower
third, the outputs rebuild nothing for it, and Ben's cue change is on air. Nobody is asked.

### AC-2: Both pages' changes survive
Anna changes Lower third and Ben changes Score bug. Whether they publish one after the other or at
the same moment, both changes are on air.

### AC-3: A change made before opening the page publishes
A graphic edited in the editor, then the production page opened and Publish pressed: the edit is on
air.

### AC-4: Both changed the same graphic
Two pages both change Lower third after the version they saw. The later publisher is asked once,
naming who published the newer one and when. "Publish mine" puts this page's design on air, "Keep
theirs" keeps the published one and publishes everything else, closing publishes nothing.

### AC-5: The unpublished mark tells the truth
A page whose copy of a graphic is older than the published one does not show "unpublished changes"
for it.

### AC-6: Old pages and old payloads keep working
A page from before this change publishes as before. Outputs, the hosted page and the Companion
module read the payload unchanged. A payload without edit times takes the first guarded publish as
today.

## Preserved behaviour

The publish gate; the team save merge and its note; audience state across a republish; per-graphic
replacement on the outputs (`docs/work-specs/per-graphic-replacement/spec.md`); version labels.

## Verification

- The merge rules in Node (`scripts/publish-merge.test.mjs`): later edit wins, older copy kept
  out, both changed, additions, a payload without edit times.
- Configured e2e with two pages on a local stack (`e2e/configured/publish-guard.spec.ts`): AC-1,
  AC-2 one after the other and together, AC-4 both answers.
- `/check`, then `/queue-merge`.
