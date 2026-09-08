---
kind: walk
date: 2026-09-09
serves: now
---
# A ticker an operator can slow down

Your walk of 2026-08-28 asked that "anything with scrolling graphics should have a speed setting
in the control panel". End credits got it on 2026-09-06; the tickers are the other half, and this
finishes them. Fifteen of the twenty-two ticker designs now carry the field. Branch
`claude/o-ticker-speed-field`.

## The route (under a minute)

1. `/app` → **Templates** → the **Tickers** category → **News Strip** → through to the editor.
2. **Rehearse** tab (the in-editor operator view): there is a **Scroll speed (%)** stepper at
   **100**, under the ticker items and the label. Press **▶ Play** and watch the strip travel.
3. Press **■ Stop**, set the speed to **200**, **▶ Play** again: the same strip at twice the
   pace. Then **50** for a slow read. It applies from the next play, not to a strip already
   running, because the travel is measured when the graphic starts.
4. Type **0**, or the word **fast**, and play: it falls back to 100 rather than to a strip frozen
   mid-word. Same for an empty field.
5. **Glass Flip** (tk03) shows what a speed means when nothing travels: its field is called
   **Item speed (%)** and it changes how long each story stays up.

## What to look at

- Is **100%** the pace you would have expected as the shipped default on a news strip?
- Does **200%** read as "faster" rather than "unreadable", and **50%** as "slow" rather than
  "broken"? The clamp is 10-400, so those are the edges you can reach.
- The field sits **last** on the control page, under the content. On a design with a second cap
  (**Market Board**, **Headline Crawl**) it is the fourth field. Is that where you would look for
  it, or does a speed control belong at the top, away from the words?

## The seven designs that deliberately have no such field

The **rotators** - House Rotator, Frost Rotator, Volt Rotator, Wire Rotator, Status Rotator,
Advisory Rotator and Editorial Desk - get **no speed field at all**, and that is a decision worth
your eye rather than a gap. They do not scroll: each holds one story for 3.2 seconds and swaps,
and that beat comes from the graphic's own state machine, not from the motion the template emits.
A percentage typed on their control page would move only the strip's fade-in while the stories
kept changing at exactly the old rate, so they were left without one rather than given a number
that lies.

If you want a rotator's hold to be an operator control too - and it is the design where reading
time matters most - that is a change to the shared machine runtime, which every timed graphic in
the product shares. Written up in
`docs/backlog/a-rotating-ticker-holds-at-a-rate-nobody-can-change.md`; say the word and it gets
scheduled.

## The numbers, if you want them

Measured off the emitted builders (`scripts/ticker-speed.test.mjs`, which runs the real
generated code): a 1400px set of items travels in **10.0s** at 100%, **5.0s** at 200% and
**20.0s** at 50%. The flip's hold is **3.2s / 1.6s / 6.4s** for the same three. Blank, `0`,
`fast` and `-40` all come back as the 10.0s timing.
