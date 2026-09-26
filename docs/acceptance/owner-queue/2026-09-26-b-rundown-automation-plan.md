---
kind: decision
date: 2026-09-26
serves: now
---
# Timed cues and basic media: pick what gets built

You asked for cue durations, auto-advance and the rest of rundown automation, and for the missing
clip attributes, to be planned before anything is built. The plan is written; nothing is built.

## The route, two minutes

<https://github.com/NoaCG/NoaCG-Studio/blob/main/docs/RUNDOWN_AUTOMATION_PLAN.md>, section 0 only.
It is one table and three picks.

**What to decide.** Answer the three picks in a sentence each, or say "as recommended":

1. **Build 1, timed cues** (a duration, then Out, Next or Out and next, with a countdown, H to
   hold and one click to go manual). Recommended: build now. The defaults worth a look are that
   an auto action never fires more than 5 seconds late (it shows as missed instead), that H holds
   the countdown due soonest, and that an auto action never moves your selection.
2. **Build 2, basic media** (level in dB, fade in and out, audio files on their own layer, a clip
   that ends on the server by itself). Recommended: right after build 1. Is anything your shows
   need missing from the list?
3. **The other ideas.** Recommended order after that: cues from a spreadsheet, then linked cues,
   an as-run CSV and a Stream Deck module later; back-timing not now; switcher automation no.
