---
v: 2
source: owner
kind: ask
raised: 2026-09-30
state: advanced
note: "NoaCG Bridge's `ending` verb landed from branch claude/cu-looping-clip-end-change (Bridge feature `ending`, not yet in a released Bridge). Still missing: the page sending it from the clip's At the end control, which lives in src/components/home."
asked: "If you have a looping video and you change it mid-video playout to play next, it doesn't register that. It would be nice if it would be possible to switch everything while we are live. Let's not break our backs because of this."
size: small
touches: src/components/home/ServerCueEditor.tsx, src/components/home/ProductionPage.tsx
needs-owner: none
---

# Changing a playing clip from loop to "play next" takes effect

## Why

In the studio on 2026-09-30 a clip was playing on loop through NoaCG Bridge; changing its end
behaviour to "play next" while it played did nothing. An operator decides this live (let the
opener loop until the host is ready, then move on), so the change should reach the running clip.
The owner called it a nice-to-have.

## What CasparCG does (measured 2026-10-02)

On scratch servers (2.5.0 `69e8ad5 Stable` and the 2.3.3 LTS folder's `2.3.2`, AMCP on 5350 and
5351, scratch media), a 3 s clip played with `PLAY 1-10 "CU/A3" LOOP` and left in its third pass:

- `CALL 1-10 LOOP 0` answers `201 CALL OK` and `0`. The clip goes on from where it is, `loop`
  reads false at once, and it ends at the end of the pass it is in. With nothing behind it, it
  holds its last frame.
- `LOADBG 1-10 "CU/B4" AUTO` sent right after it: `frames_left` counts down the rest of that pass
  (97 at 1.06 s of 3 s) and B4 plays at its end. Same on both versions.
- `CALL 1-10 LOOP 1` turns a loop back on where the clip is; it then loops round as before.

## What landed (the Bridge)

A new verb, `ending`, with the Bridge feature `ending` (protocol v2, additive; an older Bridge
refuses the verb rather than playing the clip again):

- `{ verb: 'ending', slot, item, playback?: { end, fadeOut }, then?: [entries] }`. Hold sends
  `CALL c-l LOOP 0`; Loop sends `CALL c-l LOOP 1`; both take away what this Bridge had queued
  behind the clip (`LOADBG c-l EMPTY`). Clear sends `LOOP 0` and queues the empty layer with AUTO
  and its fade. Play next (`then`) sends `LOOP 0`, queues the next file, and starts a sequence whose
  first entry is the clip already on air, so the runner plays the rest as for any Play next.
- The Bridge changes an ending only on the clip it put on air there itself (its instance on the
  slot); otherwise it refuses, sends nothing and leaves any running sequence alone.
- Tests: `cli/test/runner.test.mjs`, the five tests under "AN ENDING CHANGED ON AIR" (four fail
  without the change), against the fake server, which now models `CALL … LOOP`. The real Bridge
  code was also run against the scratch 2.5.0: a looping A3 set to play B4 then A3 with Clear went
  on without restarting, played B4 at the end of its pass, then A3, then cleared.
- The page's half of the action: `endingAction` in `src/control/serverPlayout.ts`, tested in
  `scripts/server-playout.test.mjs`.

## What is left

1. **The page sends it** (src/components/home, held back while another session owned those files).
   In `ServerCueEditor.tsx` `ClipSettings`, when the cue is live and the Bridge lists `ending`, a
   click on an At the end choice also sends `endingAction(newCue, item, live.slot, members)` through
   the page's `act` (ProductionPage, as `onTransport` does), with `members` from `sequenceMembers`
   for Play next. On success: fold the reply's generation with `applyAccepted` and set the live
   entry's `end` (`ServerLive.end`) so the clip clock says the new ending; on a refusal, say the
   Bridge's sentence in the note line. The hint ` · applies at the next Take` then goes for the
   ending (it stays for an older Bridge, and for fades, level and trim).
2. **A Bridge release** carrying it (the `ending` feature), and the line in
   `cli/BRIDGE_CHANGELOG.md` at that release.
3. Not covered, by choice: a clip inside a Play-through folder (the folder sets its ending), and a
   clip that has already ended and holds its last frame (Play next then plays the next at once).
