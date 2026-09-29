---
kind: desktop
date: 2026-09-29
because: taste
serves: now
---
# One-by-one folders that step, All out, and editing the rundown, on the CasparCG server

A One-by-one folder now plays from its header: each SPACE takes its next cue and takes the graphic
before it off, and a clip or audio file is never stopped by a step. All out also stops a clip after a
NoaCG Bridge restart. The rundown drags a selection as a group, takes a drop on a folder's header
last in the folder, and copies, cuts and pastes. Phase 5 of the clip playback plan
(`docs/CLIP_PLAYBACK_PLAN.md` §20). One more part, how the rows look, is on branch
`claude/rundown-rows-at-a-glance` and waits for step 6.

## The route, about fifteen minutes

[/app](https://noacg.studio/app) once this has deployed, with NoaCG Bridge 0.6.0 running and your
CasparCG server connected. You need two graphics, a clip of 20 seconds or more and an audio file. Do
it at 1920×1080 with a real mouse and keyboard.

1. **Step a folder.** Put the two graphics, the clip and the audio file in one folder (shift-click,
   `▤ New folder`), in that order, and click its header. Press SPACE five times, watching PROGRAM
   and the output: the first graphic; the second, the first going off; the clip, the second graphic
   going off; the audio under the clip, which keeps playing; then back to the top, the clip and the
   audio still playing. The TAKE button names what each press does, and PREVIEW shows the next cue.
   `0` on the header then stops the clip and the audio.
2. **A cue by hand mid-run.** Step to the first graphic, then take the second graphic from its own
   row. Hold the header again: the next press carries on after it, and nothing stays up that the
   rows do not show.
3. **All out after a Bridge restart.** Take the clip, then close NoaCG Bridge and start it again. The
   clip's row reads as an unidentified item. Press ■ All out: the clip stops.
4. **A selection.** Shift-click three rows and drag one of them onto a folder's header: all three go
   in, last, in order, with the folder lit while you hover. Ctrl-click adds or drops a row; a
   right-click opens a row's menu, which acts on the whole selection.
5. **Copy, cut, paste.** Ctrl+C a cue, click another, Ctrl+V: a copy lands after it. Take a cue on
   air, Ctrl+X it, click the last row, Ctrl+V: it moves there and stays on air.
6. **How the rows look** (not landed; screenshots were sent in the session). Each row's slot carries
   its channel's tone, named in a legend beside the count; the graphic icon leaves amber, which is
   PREVIEW; audio has its own tone; a folder's cues hang from a thin line. Say whether it lands as it
   is, or what to change.

## Also shipped, nothing to check

- The Audience workspace and the picture upload no longer say ✓ before the save has landed.
- From the next NoaCG Bridge release the download is `NoaCG-Bridge-<version>.exe`, and Settings →
  Playout's Download opens the Downloads page, which names the version.
