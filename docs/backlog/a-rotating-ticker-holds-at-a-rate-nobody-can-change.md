---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "a timed rotator's hold is baked into the machine, so the operator speed field the other
  fifteen ticker designs now carry cannot be offered on the seven that rotate"
size: standard
touches: src/templates/shared/animRuntime.ts, src/templates/types/ticker.ts
---
# A rotating ticker holds at a rate nobody can change on air

**Filed:** 2026-09-09. **Source:** measurement, while serving the owner's 2026-08-28 speed ask on
the tickers (that receipt is now closed; `git log --diff-filter=D -- docs/backlog/scrolling-speed-and-through.md`).

## Why

Fifteen of the twenty-two ticker designs now carry a `Scroll speed (%)` / `Item speed (%)` field
on the control page. The seven that rotate - tk07, tk08, tk09, tk10, tk18, tk19, tk21 - carry
none, and they are the ones an operator is most likely to want to slow down, because a rotator
shows one story at a time and its whole job is to be read before it swaps. Today that hold is
3.2 seconds for everybody, decided when the graphic was made.

They were left out on purpose rather than given a field that half-works: a control page must
never offer a number that does not move the graphic. But the gap now shows on the control page
itself, where two rotators and a marquee sit side by side and only one of them can be tuned.

## What it would take

The cadence is a state-machine timer, not motion any template emits. `templates/types/ticker.ts`
sets `after: HOLD` (3.2) on the `advance` edges, and the shared runtime arms it as
`gsap.delayedCall(edge.after / (NOACG_ANIM.speed || 1), …)` in
`src/templates/shared/animRuntime.ts` (`noacgArmTimer`). `NOACG_ANIM.speed` is the AUTHOR's knob -
the Animation panel writes it - so nothing an operator can reach is in that expression.

So the work is to give the machine runtime an operator-readable speed: one agreed field id (or a
small hook a template defines) that `noacgArmTimer` multiplies by, defaulting to 1 when absent.
That is a change for EVERY machine graphic, not just tickers, which is why it is a shelf item and
not a line in the ticker assembler. Once it exists, `SPEED_FIELD_TITLE` in
`src/templates/tickers/shared.ts` gains `'ticker-rotate': 'Item speed (%)'` and the carve-out
comment beside it goes away.

## Evidence

`scripts/ticker-speed.test.mjs` measures what the field does where it exists: a marquee's
1400px set travels in 10.0s at 100%, 5.0s at 200%, 20.0s at 50%; the flip's hold is 3.2s / 1.6s /
6.4s. Nothing equivalent can be measured on a rotator, because the number is not in the emitted
template - it is in the machine data.
