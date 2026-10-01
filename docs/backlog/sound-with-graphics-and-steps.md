---
v: 2
source: owner
kind: ask
raised: 2026-10-01
state: unstarted
note: "the simple version exists: an All together folder starts a graphic and a server audio cue (with its own ending, loop included) on one Take. Sound on an animation step is research before any build."
asked: "a good way to trigger sound together with graphics (swoosh, clock tick, correct and wrong answer); maybe attachable to individual animation steps, but research how before building (paraphrase)"
---
# Sound with graphics, and possibly with animation steps

**Filed:** 2026-10-01. **Source:** the owner's studio-day feedback, point 2.

## Why

Quiz reveals, clocks and stings need sound that starts exactly with the graphic's move. Without it
an operator presses two things at once, and the sound and the picture drift apart.

## What exists

An **All together** folder takes every cue in it with one press, server cues and graphics alike
(`togetherPlan` in `src/control/serverPlayout.ts`; `docs/CLIP_PLAYBACK_PLAN.md`). A server audio
cue in it keeps its own level and ending, loop included. That covers "swoosh with the lower third"
and "ticking with the clock" today, on the Bridge path.

## What needs research before building

- Sound tied to a step of a graphic (Quiz, Reveal correct, correct-answer sound): where the binding
  lives (the graphic's state machine, the control layer, or the rundown), how it travels on the
  command path, and how it reaches each player (CasparCG server audio through the Bridge, the
  browser output's own audio in OBS and vMix, and CasparCG's HTML producer, whose audio support
  differs by version). `docs/STATE_MACHINE_SCHEMA.md` and `docs/CONTROL_LAYER.md` have no audio.
- Whether an OGraf graphic may carry its own sound, and what the standard says.
- Timing: a step's sound must start with the step's animation, not with the press.

## Evidence

`docs/backlog/rundown-cue-timing-and-automation.md` items 8 (audio cues) and 10 (linked cues);
`src/control/combine.ts` (combined controls cannot reach server cues).
