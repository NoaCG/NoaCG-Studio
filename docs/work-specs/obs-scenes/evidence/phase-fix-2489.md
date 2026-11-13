# Fix #2489: a graphic that joins a scene goes on air, evidence

The spec's Behaviour "Scenes" and D2: making a scene, or adding a graphic to one, takes it, with no
extra click. OS1a R11 left joining on air to OS1b, and OS1b did not build it. Simulated and
configured checks only: nothing here is OBS hardware proof (that is OS7).

## Rules

- J1. After a publish lands, the page that published takes each graphic that a scene names in that
  publish and did not name in the published row it replaced. The publish reads the old row's
  scenes beside its version stamp (`hostedControl.ts`, one small field) and returns both lists, so
  a teammate's publish in between, or an edit made while the publish ran, cannot shift the answer.
- J2. The Take is the operator's own Take (`verbs.take`) of the scene's first cue of the graphic in
  the record as it is then (the cue the link joins with, OS1a R11); nothing when the scene no
  longer holds it. It is the same command a press sends, so the ordinary link airs it too, as a
  pressed Take of a scene graphic always has. Decided here, not an owner question: a separate
  scene-only Take would be a second air state, which D3 rules out.
- J3. A graphic already up on the page is taken again: it may be up in another link only (moved
  from another scene, or taken by hand outside every scene). A scene link draws the re-Take
  settled (R9); on the ordinary link it is a re-Take, as a press would be.
- J4. The Take waits until every open link of those scenes reports having read that publish
  (READY's `v.n`, or a change towards it, `chg.v.n`), because a link reads a command for another
  scene's graphic past until then (OS1a R6). After 20 s it goes anyway: such a link has the Take
  in the log, and its next boot recovers it (R7). A link not open boots from the log the same way.
- J5. The first publish of a production with scenes takes every scene graphic. A graphic the
  operator took out stays out at later publishes. With the OBS scenes switch off no scene is
  published, nothing is taken, and every publish is as before. All out is unchanged.
- J6. A Take that throws is said on the note line and the other joins still go. A page that has
  gone (another production opened) takes nothing more; the joins it still owed are not made.
  Turning the switch off and on again, then publishing, takes every scene graphic again.
- Unchanged and out of scope: a Take takes off another graphic on the same layer (the layer rule).
  Graphics get free layers, and a scene copy gets one of its own (C4); two scenes' graphics set to
  one layer by hand still share it, as with a pressed Take today.

## Proof

| Rule | Proof |
| --- | --- |
| J1, J5 | `scripts/scene-join.test.mjs`: joined graphics; a published scene joins nothing more; a moved graphic joins its new scene; first publish joins all; switch off joins none |
| J2 | `scripts/scene-join.test.mjs`: the scene's first cue of the graphic; none once moved out or with the switch off |
| J3, J4, J6 | `scripts/scene-join.test.mjs`: a link on the old version holds the Take until it reports the new one; a preparing link counts; another scene's link, the ordinary link and an operator never hold it back; a link that never reads it delays it by the bound only; a graphic up is taken; a throwing Take is said and the next goes; a page gone takes nothing |
| J1, J2, J4, J5 in the product | `e2e/configured/live-prepare.spec.ts` "OBS scenes (#2489)" (local stack, CI): the Gameplay link open before its folder is a scene; making it a scene and publishing airs Hairline there and on the page with no Take; taken out by hand, it stays out when the next publish makes Desk a scene, which airs Bug; a cue in no scene is never taken |

## Mutation checks run locally

- `joinedScenes` ignoring the replaced row's scenes: one Node test fails. Restored.
- `sceneLinksHold` always true (no wait): three Node tests fail. Restored.
- The page's call (`ProductionPage.tsx` `onPublished`) is what the configured walk guards:
  without it nothing takes Hairline and the walk's first "on air in its scene link" poll fails.
  Not run as a mutation here: this machine has no local stack.

## Not checked here

- OBS itself: the owner's rehearsal (OS7). What it should look for: after making a scene (or adding
  a graphic to one) and publishing, the scene's browser source shows the graphic settled within
  about 20 s with no Take pressed; a graphic taken out stays out after the next publish.
