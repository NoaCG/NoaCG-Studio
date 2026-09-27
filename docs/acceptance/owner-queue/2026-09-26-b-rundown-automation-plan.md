---
kind: decision
date: 2026-09-26
serves: now
---
# Timed cues and basic media: pick what gets built

You asked for cue durations, auto-advance and the rest of rundown automation, and for the missing
clip attributes, to be planned before anything is built. Nothing is built yet.

## Decided on 2026-09-27

In the clip-playback planning session you settled build 2 and the order:

- **Build 2, clip and audio playback, is built first**, as
  [`docs/CLIP_PLAYBACK_PLAN.md`](../../CLIP_PLAYBACK_PLAN.md): a clip's ending (hold the last frame
  by default, clear, loop, or play the next clip, looking past graphics), fades, level, trim, audio
  on its own layer, folders that play one by one, through or all together, a clip clock beside
  PROGRAM, and a resizable one-line rundown. Five phases, then build 1.
- **Screen**: full HD is the target, and the page must still work at 1366×768.
- **Phone surfaces**: "No need to remove if it works." They keep working with no new features, and
  "it's okay if they look different... Phone is a nice add-on if it works."
- **The clip clock**: fits under the buttons, never below the monitors; one clear number; the time
  to the studio kept apart from the clip's own time when another clip follows.

## Still open

The route is <https://github.com/NoaCG/NoaCG-Studio/blob/main/docs/RUNDOWN_AUTOMATION_PLAN.md>,
section 0 only. Answer in a sentence each, or say "as recommended":

1. **Build 1, timed cues for graphics** (a duration, then Out, Next or Out and next, with a
   countdown, H to hold and one click to go manual), now built after build 2. Its `At clip end`
   choice is dropped, because a clip's end belongs to the clip. The defaults worth a look are that
   an auto action never fires more than 5 seconds late (it shows as missed instead), that H holds
   the countdown due soonest, and that an auto action never moves your selection.
2. **The other ideas.** Recommended order after build 1: cues from a spreadsheet, then linked cues,
   an as-run CSV and a Stream Deck module later; back-timing not now; switcher automation no.
