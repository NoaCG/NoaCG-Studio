---
kind: agent
date: 2026-09-06
serves: now
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

Its only question is whether the recipe's name and its one box read right. 'Reveal' is the plain
word for what it does; naming a control after its action is the default.

Re-kinding and deleting are separate commits by rule, so this item stays here until an
agent drives the route below and records what it saw. The original text follows,
unchanged.

# Bids and the actual price: typed text sealed until one press, a winner by choice

**Date:** 2026-09-06 · **Branch:** `claude/svg-behaviour-game-shows-518d88`

## What changed

The Price Is Right. Four names and bids as plain fields, the price drawn as it looks revealed
with a hidden "Cover" plate over it, and `choice:Winner/1..4` rings. The import proposes the
**Reveal** recipe (a switch cannot do this: hidden text is never a field) and binds the winner
choice. The operator types the price, takes the card with the cover up, presses Reveal, then the
winner's number.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-shows/price-reveal.svg`.
2. Next, Next, name it, add it to a production.
3. Type `1399` into **The reveal**, Take: the sealed plate shows. Press **Reveal**, then **2**.

## What to look at

- The reveal recipe is small and general: an envelope, a winner's name, an answer, any typed
  text that has to stay hidden until a press. Whether its name ("Reveal") and its one box ("The
  reveal") read right.
