---
v: 2
source: derived
kind: finding
raised: 2026-10-01
state: unstarted
found: "every family that retimes a running builder has to lend its step timeline
  smoothChildTiming by hand, or the motion jumps; the credits and the tickers each carry a copy"
size: standard
touches: src/templates/shared/animRuntime.ts, src/templates/shared/base.ts,
  src/templates/endCredits/creditsMotion.ts, src/templates/tickers/tickerMotion.ts
---
# Step timelines are built without smoothChildTiming

**Filed:** 2026-10-01. **Source:** the ticker live-speed fix, which closed
`a-ticker-speed-press-jumps-the-strip.md` and left this deeper half of it.

## Why

A builder's motion sits inside the step's timeline, and `buildStepTimeline` in
`src/templates/shared/animRuntime.ts` builds that timeline without `smoothChildTiming`. Without
it, a `timeScale` on the running motion jumps it to where the new pace would have had it: 196px on
cr01 and 296px on tk01 at 300%. `creditsApplySpeed()` and `tickerApplySpeed()` now each lend the
flag for the one call, with the same paused-parent exception, line for line. The next family that
gets a live speed (or a hand-written design that retimes a builder's result) brings the jump back
until someone finds the snippet and copies it a third time.

## What it would take

Either build the step timeline with `smoothChildTiming: true`, which makes the per-family lend
unnecessary, or emit one shared "retime a running builder" helper next to `motionSpeedJs` in
`src/templates/shared/base.ts` and call it from both families. The first moves every catalog
`js` hash and needs the paused-parent case re-checked: a paused parent with the flag on sends its
start to -Infinity on a slow-down, which is why both lends skip a paused parent. Either way, keep
the real-GSAP tests (`scripts/credits-live-speed.test.mjs`, the live half of
`scripts/ticker-speed.test.mjs`) as the gate.

A paused step still takes a plain `timeScale`, so the next seek of a settled preview or an editor
scrub shows the motion where the new pace puts it. That is a preview, not air, and it is accepted
in both families today; a runtime-level fix should decide it once.

## Evidence

The two lends: `creditsApplySpeed()` in `src/templates/endCredits/creditsMotion.ts` and
`tickerApplySpeed()` in `src/templates/tickers/tickerMotion.ts`. The 296px is the tk01 Chromium
measurement with the lend removed; with it, the largest single-frame move around a 300% press is
7.6px at 420 px/s.
