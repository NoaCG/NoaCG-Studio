# Fix #2489: a graphic that joins a scene goes on air, evidence

The spec's Behaviour "Scenes" and D2: making a scene, or adding a graphic to one, takes it, with no
extra click. OS1a R11 left joining on air to OS1b, and OS1b did not build it. Simulated and
configured checks only: nothing here is OBS hardware proof (that is OS7).

## Rules

Review class: Risky (set by the coordinator). The change sends Takes on its own after a publish,
waits on what the outputs report, and leans on the log for a link that is late or closed. No rule
was written down before the code: the first build had J1 to J5 in an earlier form, and the reviews
found the rest. Each rule below is one line an operator or a test can observe; the ids are the
ones the proof and the PR use.

### As first built (rewritten after review where marked)

- J1. After a publish lands, the page that published sends a Take for each graphic that a scene
  names in that publish and did not name in the published row it replaced. Nothing else sends
  these Takes: no output, no other page. *(Rewritten: the first build compared with the page's own
  memory of its last publish; the publish now reads the replaced row's scenes beside its version
  stamp and returns both lists.)*
- J2. Each Take is the operator's own Take of the scene's first cue of that graphic: the same
  command a press sends, so the ordinary link airs it too. Decided here: a scene-only Take would be
  a second air state, which D3 rules out.
- J4. The Takes wait until every open link of those scenes reports that it holds the publish (or
  is preparing it), because a scene link reads a command for a graphic outside its scene past
  until then (OS1a R6). Links of other scenes, the ordinary link and operator pages never hold it.
- J4a. Timeout: after 20 s the Takes go anyway. A link that has still not read the publish shows
  the graphic after its next reload or restart, from the log (R7).
- J4b. A closed link: nothing waits for it. When it opens it boots from the log with the graphic
  on air.
- J5. The first publish of a production with scenes takes every scene graphic. At a later publish
  only newly joined graphics are taken, so a graphic the operator took out stays out. With the
  OBS scenes switch off no scene is published, no Take is sent, and every publish is as before.
  All out is unchanged.

### Found after coding

- J1a (code review). A teammate's publish in between, or an edit made while the publish ran,
  never changes which graphics join: the lists come from the publish itself.
- J1b (Rules review now, from J1's rewrite). Two pages, the same operator's second tab or a
  teammate, publishing at once: the publish guard lets one write land first, and the other is
  retried against that newer row, so each joined graphic is taken once, by the page whose publish
  added it. A page that did not publish sends nothing; it sees the Takes in the log like any press.
- J2a (Codex P2). Each Take reads the record again just before it is sent. A graphic taken out of
  its scene, or the switch turned off, while an earlier Take was being sent, is not taken.
- J3 (code review). A graphic already up on the page is taken again: it may be up in another
  link only (moved from another scene, or taken by hand outside every scene). A scene link draws
  the re-Take settled (R9); on the ordinary link it is a re-Take, as a press is.
- J3b (Codex P1). The Takes wait for the page's own sender to write to the published log. A first
  publish lands before the page shows its new link, and a Take sent in that gap would reach this
  page's PROGRAM only. If the sender is still not published at the 20 s bound, nothing is sent and
  the note line says so.
- J6 (code review). A Take that fails is said on the note line, and the other joins still go. A
  page that has gone (another production opened) sends nothing more; the joins it still owed are
  not made, and the operator Takes them by hand. A Take its gate refuses, or whose send fails,
  counts as a failure too, and every failure is named on one line.
- J6b (Rules review). A Take or Out of a graphic, by anyone, after the publish landed is the
  operator's word on it: its join is not sent over it. Just before each join Take the page
  compares the graphic's air mark (`airMark`: the cue on air and the marker write of its last Take)
  with the mark as the publish landed (taken before a first publish loads a CasparCG or vMix slot).
  Any Take moves it, a re-Take of the same cue and an Out and a Take back included; an update of
  its values does not. A timed cue's own Out during the wait counts the same way: its duration said
  Out, so the join is not sent.
- J6a. Turning the switch off and on again, then publishing, takes every scene graphic again: the
  scenes are made again.
- Unchanged and out of scope: a Take clears another graphic on the same layer (the layer rule).
  Graphics get free layers, and a scene copy gets one of its own (C4).

### Product decisions this row made (for the coordinator to confirm)

- J2: the join airs on the ordinary link too, as a pressed Take of a scene graphic does (D3 and
  C9: one air state per graphic). The spec does not say it in words.
- J3: a graphic already up on the ordinary link gets a real re-Take at the publish that moves it
  into a scene, so on vMix, CasparCG or a browser program it plays its entrance again with no
  press. The reason: a graphic moved between scenes is up only in its old link, which drops it
  (R6), and the new scene link joins it off air (R11). The spec's own "Not in this phase" note
  raised the ordinary-link concern without deciding it.

## Proof

| Rule | Proof |
| --- | --- |
| J1, J1a, J5 | `scripts/scene-join.test.mjs`: joined graphics; a published scene joins nothing more; a moved graphic joins its new scene; first publish joins all; switch off joins none |
| J2, J2a | `scripts/scene-join.test.mjs`: the scene's first cue of the graphic; none once moved out or with the switch off; the switch turned off while the first Take is sent stops the second |
| J3, J3b, J4, J4a, J4b, J6, J6b | `scripts/scene-join.test.mjs`: a link on the old version holds the Take until it reports the new one; a preparing link counts; another scene's link, the ordinary link and an operator never hold it back; a link that never reads it delays it by the bound only; a graphic up is taken; a throwing Take is said and the next goes, several on one line, a refused Take among them; a page gone takes nothing; a Take or Out pressed during the wait keeps its graphic's join from being sent, and the air mark moves with a re-Take of the same cue |
| J1, J2, J4, J5 in the product | `e2e/configured/live-prepare.spec.ts` "OBS scenes (#2489)" (local stack, CI): the Gameplay link open before its folder is a scene; making it a scene and publishing airs Hairline there and on the page with no Take; taken out by hand, it stays out when the next publish makes Desk a scene, which airs Bug; a cue in no scene is never taken |

J1b (two pages publishing at once) and J6a are not tested. J1b rests on the publish guard (a raced
write throws `PublishBehind` and the publish retries once against the newer row, whose scenes
become `before`), read and confirmed by the Rules review. The configured walk proves that `before`
comes from the replaced row: its second publish keeps Hairline out. J6a follows from J5's tests.

## Mutation checks run locally

- `joinedScenes` ignoring the replaced row's scenes: one Node test fails. Restored.
- `sceneLinksHold` always true (no wait): three Node tests fail. Restored.
- The published-sender guard removed: the first-publish test (a slug that arrives late) fails.
  Restored.
- The record read once for every join instead of before each Take: the switch-off-mid-loop test
  fails. Restored.
- The air comparison (J6b) removed: the hand-press test fails. Restored.
- `airMark` reading the cue on air only (no last Take): the mark test fails (a re-Take of the same
  cue). Restored.
- A refused Take not counted as a failure: the refused-Take test fails. Restored.
- The page's call (`ProductionPage.tsx` `onPublished`) is what the configured walk guards:
  without it nothing takes Hairline and the walk's first "on air in its scene link" poll fails.
  Not run as a mutation here: this machine has no local stack.

## Not checked here

- OBS itself: the owner's rehearsal (OS7). What it should look for: after making a scene (or adding
  a graphic to one) and publishing, the scene's browser source shows the graphic settled within
  about 20 s with no Take pressed; a graphic taken out stays out after the next publish.
