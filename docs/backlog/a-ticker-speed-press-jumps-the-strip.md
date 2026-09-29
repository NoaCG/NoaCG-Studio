---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "a live speed change on a running ticker changes its pace but first jumps the strip, 287px
  in one frame on tk01 at 300%"
size: small
touches: src/templates/tickers/tickerMotion.ts, scripts/ticker-speed.test.mjs
---
# A ticker speed press jumps the strip

**Filed:** 2026-09-30. **Source:** measurement, while giving the credit rolls the same live speed.

## Why

`tickerApplySpeed()` sets `timeScale(now / builtAt)` on the running marquee or flip cycle, which
changes the pace, but the builder's tween sits inside the step's timeline, and a step timeline has
no `smoothChildTiming`. GSAP only holds a child's playhead still across a timeScale change when its
parent has that flag, so the strip jumps to where it would have been had it always run at the new
pace. The dashboard's LIVE NUMBERS row says one press changes the live graphic; it does, with a
visible lurch of the text on every press, growing the longer the strip has been running.

`scripts/ticker-speed.test.mjs` cannot see it: its GSAP is a stub that records the last
`timeScale` value, so it proves the ratio and nothing about position.

## What it would take

What the credits got in `creditsApplySpeed()` (src/templates/endCredits/creditsMotion.ts): lend the
parent `smoothChildTiming = true` for the one `timeScale` call and hand the old value back. Then
move the live-speed half of `ticker-speed.test.mjs` onto the real vendored GSAP driven by
`gsap.updateRoot`, as `scripts/credits-live-speed.test.mjs` does, so a jump fails it. The
catalog baseline's 22 ticker `js` hashes move with it.

The deeper fix is one level down: `buildStepTimeline` in `src/templates/shared/animRuntime.ts`
building its timeline with `smoothChildTiming: true`, which would make every per-family lend
unnecessary, credits included. It moves every catalog hash and needs the paused-parent case
re-checked (a paused parent with the flag on sends its start to -Infinity on a slow-down, which is
why `creditsApplySpeed()` lends only to a playing parent), so it is its own change. Either way,
one shared "retime a running builder" snippet would stop the families drifting apart again.

## Evidence

Measured in Chromium on the generated tk01 with the vendored GSAP, `play()` then
`update({f2:'300'})` 1.5 s in: 139.9 px/s before, 419.9 px/s after (the pace is right), and the
strip moved from x = -140.1 to x = -427.6 in the 16 ms frame the update landed in. The same
measurement on the credits roll without the lent flag jumped 196 px; with it, the frame the update
lands in moves at the new pace (36 px over a 134 ms frame at 270 px/s on cr01).
