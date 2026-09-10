---
kind: agent
date: 2026-09-09
serves: now
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

The pace questions are measured rather than felt - 139.8 px/s at 100%, exactly 140 times the
percentage - and 100% meaning 'as drawn' is the only defensible default. Where a speed field sits
under the content is a form-layout default. The rotator's hold is filed on the shelf with its
shape.

Re-kinding and deleting are separate commits by rule, so this item stays here until an
agent drives the route below and records what it saw. The original text follows,
unchanged.

# A ticker an operator can slow down

Your walk of 2026-08-28 asked that "anything with scrolling graphics should have a speed setting
in the control panel". End credits got it on 2026-09-06; the tickers are the other half, and this
finishes them. Fifteen of the twenty-two ticker designs now carry the field. Branch
`claude/o-ticker-speed-field`.

## The route (under a minute)

Walked on 2026-09-08 in the studio, so these are the screens as they are, not as they ought to be.

1. `/app` → **+ New graphic** → **Start from a template** → search **News Strip** → pick it →
   **Finish** → **Add to the production — go live** → **Add it and go there**.
2. You land on the production dashboard. Under **EDITING PREVIEW CUE** are three fields:
   `F0 · Ticker items`, `F1 · Label`, and the new **`F2 · Scroll speed (%)`** as a stepper at
   **100**. Press **TAKE** and the strip runs.
3. Now the part worth your eye. At the bottom, **± LIVE NUMBERS act on air** carries a
   **Scroll speed (%)** pair. Hold **+** down: the strip speeds up **under your finger**, with no
   re-take and no jump back to the start. Hold **−** and it slows. That is the control doing what
   the row above it promises.
4. Type **0**, or the word **fast**, into the field and **Update**: it returns to 100 rather than
   freezing the strip mid-word. Same for an empty field. The range is 10 to 400.
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

Measured in Chromium on the generated News Strip, driving `play()` then `update()` the way the
dashboard does: the strip travels at **139.8 px/s** at 100%, **560.8 px/s** the moment 400% is
sent to the running graphic, and **69.9 px/s** at 50%. Exactly 140 times the percentage, applied
without restarting the travel.

Off the emitted builders (`scripts/ticker-speed.test.mjs`): a 1400px set travels in **10.0s** at
100%, **5.0s** at 200%, **20.0s** at 50%, **100.0s** at the 10% floor and **2.5s** at the 400%
ceiling. The flip's hold is **3.2s / 1.6s / 6.4s**. Blank, `0`, `fast` and `-40` all come back as
the 10.0s timing.

**One thing the same walk found and did not fix.** End credits shipped this field first, on
2026-09-06, and its `Scroll speed (%)` also appears in that ± live-numbers row - but a credits
roll measures its travel at Take and nothing tells the running roll about a new percentage, so
those buttons do nothing until the next take. The tickers now do it properly; the credits do not,
and giving them the same treatment is written up in
`docs/backlog/a-live-number-that-does-not-move-a-credit-roll.md`.
