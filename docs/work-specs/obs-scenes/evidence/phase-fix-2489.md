# Fix #2489: a graphic that joins a scene goes on air, evidence

The spec's Behaviour "Scenes" and D2: making a scene, or adding a graphic to one, takes it, with no
extra click. OS1a R11 left joining on air to OS1b, and OS1b did not build it. Simulated and
configured checks only: nothing here is OBS hardware proof (that is OS7).

## Rules

- J1. After a publish lands, the page that published takes each graphic that a scene names in this
  publish and did not name in the last one, with the scene's first cue of it (the cue the link
  joins with, OS1a R11). A graphic already on air is left as it is.
- J2. The Take is the operator's own Take (`verbs.take`): the same command a press sends, so the
  ordinary link airs it too, as a pressed Take of a scene graphic always has. Decided here, not an
  owner question: a scene graphic is on in its scene, and a separate scene-only Take would be a
  second air state, which D3 rules out.
- J3. The Take waits until every open link of those scenes reports holding that publish (READY's
  `v.n`, or `chg.v.n` while it prepares it), because a link reads a command for another scene's
  graphic past until then (OS1a R6). After 20 s it goes anyway: a link that has still not taken
  the publish has the Take in the log, and its next boot recovers it (R7). A link not open boots
  from the log the same way.
- J4. Only a known last publish counts. Unpublished, it is "no scenes", so the first publish takes
  every scene graphic. Published, it is what the page's resolve read, then each publish of this
  page. While neither is known, nothing is taken: a graphic the operator took out is never put
  back on a guess.
- J5. With the OBS scenes switch off no scene exists, nothing is taken, and every publish is as
  before. A graphic the operator took out stays out at later publishes. All out is unchanged.
- J6. Turning the switch off and on again, then publishing, takes every scene graphic again: the
  scenes are made again.

## Proof

| Rule | Proof |
| --- | --- |
| J1, J4, J5 | `scripts/scene-join.test.mjs`: joined graphics and their first cues; a published scene takes nothing more; a moved graphic joins its new scene; first publish takes all; unknown takes none; switch off takes none |
| J3 | `scripts/scene-join.test.mjs`: a link on the old version holds the Take until it reports the new one; a preparing link counts; another scene's link, the ordinary link and an operator never hold it back; a link that never takes the publish delays it by the bound only; a page that left takes nothing |
| J1, J2, J3, J5 in the product | `e2e/configured/obs-scene-join.spec.ts` (local stack, CI): the Gameplay link open before its folder is a scene; making it a scene and publishing airs Hairline there and on the page with no Take; Taken out by hand, it stays out when the next publish makes Desk a scene, which airs Bug; a cue in no scene is never taken |

## Mutation checks run locally

- `joinedSceneCues` ignoring the last publish: one Node test fails. Restored.
- `sceneLinksHold` always true (no wait): three Node tests fail. Restored.
- The page's call (`ProductionPage.tsx` `preparePublishRef`) is what the configured walk guards:
  without it nothing takes Hairline and the walk's first "on air in its scene link" poll fails.
  Not run as a mutation here: this machine has no local stack.

## Not checked here

- OBS itself: the owner's rehearsal (OS7). What it should look for: after making a scene (or adding
  a graphic to one) and publishing, the scene's browser source shows the graphic settled within
  about 20 s with no Take pressed; a graphic taken out stays out after the next publish.
