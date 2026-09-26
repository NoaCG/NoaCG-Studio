---
v: 1
source: measurement
raised: 2026-09-05
state: unstarted
asked: "found by review while building the countdown behaviour; reported rather than fixed in place"
---
# A finished countdown puts the whole count back on screen when an unrelated field is updated

**Filed:** 2026-09-05, found by the review pass on `claude/s-more-behaviours`. **Where:**
`src/templates/shared/clock.ts`, `clockDataUpdated()`. **Scope:** every catalog countdown, holding
screen and game timer, plus any imported graphic with a countdown field.

## Why

The owner's own story for a timer is *"at zero HOLDS at 0:00 until taken out"*
(the retired rulings file, operator-stories-2026-08-27). It does not.

Reaching zero, `tickClock()` calls `stopClock()`, and that clears `clockPaused` as well as the
interval. So the next `clockDataUpdated()` - which runs on EVERY `update()`, because it is the
design's own update hook - takes this branch:

```js
if (!clockTimer) {
  // A PAUSED clock is holding a remaining time the operator chose to freeze,
  // so it only re-derives when they change the length; an idle one previews it either way.
  if (!clockPaused || changed) {
    clockSecondsLeft = clockSeconds();
    renderClock();
  }
```

A finished clock is neither counting nor paused, so `!clockPaused` is true and the length is
re-derived whatever the operator changed. Correct a typo in a caption while the board holds at
0:00, press Update, and the digits jump back to the full count with nothing having restarted.

The styling then disagrees with the digits, which is the tell that this is a defect rather than a
choice: the `-done` class is dropped only under `if (changed && clockSecondsLeft > 0)`, so an
unrelated update leaves the time-up look painted over a fresh 5:00. The comment three lines below
states the intended rule exactly - *"a finished countdown given a NEW LENGTH is no longer
finished"* - and the code above it does not check that the length is what moved.

## What it would take

The idle branch needs a third case beside "counting" and "paused": FINISHED, which re-derives only
when `changed`, exactly as a paused clock does. Either keep a `clockFinished` flag alongside
`clockPaused` (`stopClock()` currently clears both concepts at once, which is the root of it), or
test `clockSecondsLeft <= 0` before re-deriving. Both are a few lines; what they need is a test per
clock family, because this runtime drives the countdown, shot-clock, break and starting-soon
categories and a wrong fix there is wrong on all of them at once.

## Why it was not fixed in the change that found it

It is outside that branch's diff and it changes what every catalog clock does on air, which is its
own change with its own gate (`.agent-workflows/check.md`: a real pre-existing bug outside the diff
is reported, not silently fixed). The imported countdown behaviour works around it locally instead
- `timerBehaviour.ts` remembers the length that ran out and refuses to repaint the refill - so the
drawn TIME UP plate and the drain bar stay honest even though the digits do not. That workaround
should come OUT when this is fixed, and the comment in `clockPainted` says so.

## Evidence

Reproduced by `e2e/import-svg-behaviour.spec.ts` ("imported countdown: the take starts it …"),
which now asserts the plate stays lit and the bar stays empty across an unrelated Update, and that
a NEW LENGTH does un-finish it. Nothing yet covers the catalog side, where the digits themselves
are still wrong.
