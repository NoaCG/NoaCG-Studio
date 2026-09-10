---
kind: agent
date: 2026-09-06
serves: now
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

Its only question is whether three grouped button sections on one control page read as one page or
as clutter. Grouping related controls under headings is what every control surface does; that is a
design default.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# A guest lineup with a segment bug and a coming-up strip on one card

**Date:** 2026-09-06 · **Branch:** `claude/svg-behaviour-game-shows-518d88`

## What changed

The desk show's "tonight" card. Four guest fields, a hidden "Now 1..4" plate and a hidden
"Done 1..4" veil per row, plus `show:Coming up next` and `choice:Segment/Monologue|Desk|Guest|Music`
drawn as hidden layers. The import proposes the **Lineup** recipe and binds the switch and the
choice beside it. The operator gets Next guest, Previous guest, one button per guest, Nobody on,
and the extras' own buttons.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-shows/guest-lineup.svg`.
2. Next, Next, name it, add it to a production, Take.
3. Press **Next guest** twice, **Guest 4**, **Previous guest**; then **Show Coming up next** and
   **Desk**.

## What to look at

- Who is on is a number ("On now", + and -), which a controller can also set. Guests already on
  are dimmed by an order fact, never by a state per guest.
- Whether three button sections on one card (Lineup, Straight to, Switches, Segment) read as
  one control page or as clutter.
