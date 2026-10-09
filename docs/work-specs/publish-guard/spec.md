# Publish guard

Status: agreed with the owner on 2026-10-09 (P1, P2). Not built yet.
Parent: `docs/work-specs/playout-workflow-simplification/spec.md` (non-goal 3).

## Why

Publish reads the published version's number, then writes the whole payload in a separate step
with no check (`publishControlShow`, `src/control/hostedControl.ts`). A page holding an older copy
of a graphic therefore puts that copy back on air. In a team production that is any member other
than the graphic's author: their page builds from the copy embedded in the production when the
graphic was added (`addGraphicToShow`, `src/model/shows.ts`), which later library edits never
update. Publishing a cue change from that page reverts the author's newer design, silently.

## Goal

The newest saved edit of each graphic is what airs, whichever page publishes. A page with an
outdated copy never silently restores an older design. Playout settings (layer, sounds) survive.

## Non-goals

- A conflict dialog, version history or merging inside one graphic.
- Changing what editing does: a library edit reaches the production's copy and air only through
  Publish or Prepare, as today.
- Take, the outputs and the hosted page: they read the published payload as today.
- Refusing pages from before this change on the server: they publish as today until reloaded.

## Owner decisions (binding)

- **P1 (2026-10-09). Merge per graphic.** A publish puts up what this page changed and keeps the
  rest of the newer published version.
- **P2 (2026-10-09). The newest saved edit wins, kept lean.** Not whichever page publishes last.
  Reuse the existing sync and publish mechanisms; no conflict dialogs or new sync layers. When the
  same graphic was edited on two devices, the later edit wins, as the library sync already does.

## Key decisions

Derived (revertible; each says how):

- **G1. Publish refreshes the production's copies.** Before it builds, Publish copies into the
  production record every design this page's library holds a newer edit of than the production's
  copy, keeping the graphic's name, id, layer and sounds. The record carries it to every teammate
  through the existing team save. Revert: drop the refresh.
- **G2. Publish builds from the latest record.** For a team production it first pulls the
  latest record and saves this page's pending edits (`refreshTeams`, `flushTeamProduction`). A
  save that fails does not stop the publish; G3 still holds. Revert: build from what the page has.
- **G3. Never an older design.** Each published graphic carries when its design was last edited.
  A publish that would replace a graphic with an older design stops before writing, on the page's
  existing failure line: "<Graphic> on air is newer than this page's copy. Reload this page to get
  it." Revert: drop the check.
- **G4. One write at a time.** The write lands only on the published version it read. If another
  page published in between, this page pulls again and publishes once more by itself; a second
  miss stops on the failure line. No migration: the condition is a filter on the version stamp
  inside the payload. Revert: the plain update.

Edit times come from each device's clock. Within one production they are compared only between
copies of one graphic, which only its author edits, so a skew matters only for one author on two
devices editing the same graphic within the skew.

## Behaviour

### AC-1: An older copy never replaces a newer graphic
Anna publishes a new design of Lower third. Ben, a teammate whose copy dates from when it was
added, changes a cue and publishes. Air keeps Anna's design, the outputs rebuild nothing for it,
and Ben's cue change is on air. Nobody is asked anything.

### AC-2: Both pages' changes survive
Anna changes Lower third, Ben changes a cue or another graphic. Whether they publish one after the
other or at the same moment, both changes are on air.

### AC-3: Playout settings survive
Ben changes Lower third's layer or sounds and publishes: Anna's design airs with Ben's settings.

### AC-4: An outdated page stops rather than revert
A page whose copy is older than the published design and that cannot get the newer one (a second
device not yet synced) stops before writing, naming the graphic. Air is unchanged.

### AC-5: Editing does not reach air or the record by itself
Editing a graphic in the library changes neither air nor the production's copy until Publish.

### AC-6: Old pages and old payloads keep working
A page from before this change publishes as before. Outputs, the hosted page and the Companion
module read the payload unchanged. A payload without edit times is published over as today.

## Preserved behaviour

The publish gate; the team save merge and its note; audience state across a republish; per-graphic
replacement on the outputs (`docs/work-specs/per-graphic-replacement/spec.md`); version labels;
Take.

## Verification

- The older-design rule and the stamp in Node (`scripts/readiness.test.mjs`).
- Configured e2e on a local stack (`e2e/configured/publish-guard.spec.ts`): two members for AC-1
  and AC-3; on one page, a newer design forged onto the published row for AC-4, and a publish
  forged between the page's read and its write for AC-2 at the same moment.
- `/check`, then `/queue-merge`.
