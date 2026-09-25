---
kind: hardware
date: 2026-09-25
serves: now
---
# A server clip can Loop

A server clip's cue editor has a **Loop** box. When it is ticked, Take sends CasparCG's own
`PLAY 2-10 "CLIP" LOOP`, so the server repeats the clip until Out, and the rundown row reads
"Server clip ⟲ loop". Nothing on the page watches for the end: the server does the looping, so
it keeps going even if the laptop's browser closes. The current NoaCG Bridge already carries
this, so it works with no new download. If you change the box while the clip is on air, the
change applies at the next Take, and the editor says so.

The rest of clip playback is written up as a proposal in `docs/BRIDGE.md` §5a: fade in and out
with CasparCG's `MIX`, and "then play" with its `LOADBG … AUTO`. Each needs a Bridge release.

## The route, under a minute

Studio laptop, Bridge paired: a production -> **+ From the playout server…** -> **Media** -> add
a short clip -> tick **Loop** -> **Take**. Let it pass its end.

## What to look at

- The clip starts again at its end with no black frame. That is CasparCG's own loop, so any
  gap is the server's.
- **Out** stops it.

Not run against a real CasparCG this time. The exact AMCP line is pinned in
`cli/test/playout.test.mjs`, and the page sending `loop: true` is pinned in
`e2e/playout-cues.spec.ts`. From branch `claude/noacg-bridge-feedback-cimjwc`.
