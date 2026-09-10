---
kind: walk
date: 2026-09-06
because: taste
serves: now
---
# A credit roll that runs all the way through, at the speed the operator sets

Your walk of 2026-08-28, on end credits: "anything with scrolling graphics should have a speed
setting in the control panel, and the scroll runs all the way through by default". Both halves
are in, for every end-credits design that moves. Branch
`claude/d-scroll-speed-and-through`.

## The route (under a minute)

1. `/app` → **Templates** → **Credits & thanks** → **Classic Roll** → through to the editor.
2. **Control** tab: there is a **Scroll speed (%)** field at 100, beside the credits, the year
   and the logo. Press **Take**.
3. Watch the roll to the end. The names run **all the way off the top** and the frame empties;
   then the hairline, the logo slot and the year arrive **on their own**, centred, and hold.
   That last beat is what this change is about - before it, the roll stopped with the last
   names still on screen and the logo held in the middle.
4. Take it out, set **Scroll speed** to **200**, Take again: the same roll at twice the pace.
   (It applies from the next take, not to a roll already running.) Try 60 for a ceremonial read;
   0 or a word both fall back to 100 rather than to a roll that never ends.
5. The **Crawl** design (Credits & thanks → Crawl) is the same story sideways: the strip runs
   right off the left edge, then the mark holds centred in it.

## What to look at

- Does the ending read like a credit roll ending - the list gone, then the mark, alone?
- Is the mark **optically centred**? It measures 0px off the frame's centre on cr01 and cr13.
- Is 100% the pace you would have expected, and does the speed field do what its name says?

## One thing you may not like, and it is a choice you can reverse

A settled roll now shows **its closing mark rather than a frame of names**, because that is the
last frame of the motion - and every surface that shows a graphic without pressing play parks it
there. So the **Browse card**, the library thumbnail and the operator preview of the four roll
designs are the logo + year, where before they showed the typography. Compare cr01, cr02, cr11
and cr13 in Browse: if those cards should show the roll mid-flight instead, say so and it is one
change in the preview settle recipe, for every travelling graphic at once - not per template.

Tickers are NOT done: a marquee never ends, so "runs through" does not apply to it, but the speed
field does and is written up as the remainder in
`docs/backlog/scrolling-speed-and-through.md`.

## Decided 2026-09-10 - the roll cards go back to showing the roll

The item flagged a consequence and offered it back: because a settled roll now parks on its closing
mark, the Browse card, the library thumbnail and the operator preview of the four roll designs all
show the logo and the year where they used to show the typography.

**That is a defect rather than a preference, and it is decided: a travelling graphic previews
mid-flight, not settled.** Compare cr01, cr02, cr11 and cr13 as the item suggests and the reason is
plain - four designs whose whole difference is their typography become four cards showing the same
logo over the same year. A picker card exists to tell designs apart, and the last frame of a credit
roll is the one frame that cannot. The ending itself is right and stays; only what a still card
shows changes, and the item says it is one change in the preview settle recipe for every travelling
graphic at once.

Filed as `docs/backlog/a-settled-roll-previews-a-frame-that-tells-designs-apart.md`.

What is left is yours: does the ending read like a credit roll ending - the list gone, then the
mark, alone?
