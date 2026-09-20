---
kind: walk
date: 2026-09-20
because: taste
serves: now
---
# The dashboard says when its live link is down

A published production keeps a live connection to the server so a press reaches the screens
immediately. When that connection fails to establish, commands still arrive, just on the slower
road, about every thirty seconds. Until now nothing on screen said so, which meant a production
running on the slow road looked exactly like a quiet one.

It now says so, in one line beside the SHOW chip: **○ not joined, polling**. A healthy production
gains nothing on screen.

This is the diagnostic half of issue #341. Three hosted tests hung on 2026-09-20 with the
dashboard claiming nothing was on air about a graphic that was, and the fastest question to ask -
did the live connection ever come up? - could not be answered, because the answer was never shown
anywhere. Now the next occurrence carries its own answer.

## The route, under a minute

You cannot see this by breaking your own network, because the app falls back quietly and that is
the point. The honest route is the automated one:

1. `gh run view 35529647006` - the run that proved it, 50 tests, 0 failed, 0 flaky.
2. The spec is `e2e/configured/follow-status-is-visible.spec.ts`. It opens a published production
   with the live socket deliberately held open and never joined, and asserts the line appears.

If you want to see it on screen, open a production, publish it, then block
`*/realtime/v1/*` in your browser's devtools network tab and reload.

## What to look at

- **Whether the wording is right for an operator mid-show.** It currently reads
  "○ not joined, polling", with the full sentence on hover: commands still arrive on the slower
  road, about every 30 seconds. It is deliberately not red and not an error: the production is
  working, just not at full speed. If that reads as alarming, or as too quiet, say which.
- **Whether it belongs beside the SHOW chip** or somewhere less central. It sits in the header
  next to the mode chip and the clock.

## What this does not do

It does not fix the hosted test failures. It makes the next one explain itself. The failure
itself is still open, with what is known in
`docs/backlog/hosted-cold-boot-specs-still-stick-for-their-whole-timeout.md`.
