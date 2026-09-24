---
kind: walk
date: 2026-09-24
because: direction
serves: now
---
# Credits from one paste: an imported SVG's Credits text rolls the whole list

**Date:** 2026-09-24 · **Branch:** `claude/c-credits-roll-import`

## What changed

An imported SVG had no credits behaviour, which is why every agent drew one field per name. Now
a text layer named `Credits` binds the new **credits roll** behaviour: the operator gets ONE
multi-line box holding whatever was typed into the layer, plus **Scroll speed (%)** at 100, and on
Take the whole list rolls from below the frame to above it at a constant pace until the last line
has gone. A plate named `Credits box` makes the roll run inside that plate instead of the frame.

The format is the catalog rolls' (the same parser, shared, not copied): a line ending in `:` is a
title, the lines under it are names, `Director: Anna Ahonen` inline, a tab from a spreadsheet, a
blank line for a new section.

**The styling idea, the one a student repeats:** what they type into the Credits layer in
Illustrator is the sample. Its first line ending in `:` is what every title looks like, and the
line under it is what every name looks like - font, size, weight, colour, indent and leading, all
read off those two lines. The sample is hidden on air.

**Scroll speed 100** is about 1.35 of the list's own lines a second, so about twenty lines pass a
1080 frame in about thirty seconds whatever size the type is (the fixture's 22-line list inside an
800-tall box measures about 32 s; the same list through the whole frame about 36 s).

## The route, under a minute

1. `/app` -> **New graphic** -> **Import graphic** -> drop `e2e/fixtures/credits-roll.svg`
   (a full-frame board with `Heading`, `Credits` and a `Credits box`).
2. **Next.** The Fields step opens with **What it does** already on *Credits roll*, the Credits
   text and the Credits box picked. Next, Next, name it, add it to a new production.
3. On the production page: one **Credits** box holding the 23-line list, **Scroll speed (%)** at
   100 beside the heading. No field per name anywhere.
4. Press **Take**. The list rolls up through the plate, titles in the sample's bold amber, names
   in the sample's white, and runs out the top in about half a minute.
5. Paste a list of your own into the Credits box (`Ohjaaja: Anna Ahonen`, then `Kuvaajat:` with
   three names under it, a blank line, the production name) and press **Update**, then Out and
   Take again: the new rows, in the same two looks. Set Scroll speed to 200 and Take: twice as
   fast.

## What to look at

- Do the two looks read as the sample's - a title in the bold amber, the names in the plain
  white, the same leading the sample was drawn with?
- Is 100 the pace you would expect for a classroom credit roll? Row E adjusts the constant
  (`CREDITS_LINES_PER_SECOND` in `src/templates/importedDesign/creditsRoll.ts`) if the Finnish
  default list misses thirty seconds.
- A group with one name still renders as a title line over a name line, the sample's shape; the
  catalog's inline "role beside name" layouts are not offered here. Say so if the classroom roll
  wants the inline form.

## Decided for you, revertable

- The pace is in LINES a second rather than pixels, so a 30px credit and a 60px one read at the
  same speed. Revert: set the pace in pixels in `noacgCreditsRoll` and the constant in px.
- A title is rendered WITH its colon, because that is how the sample writes it and how the format
  is taught. Revert: drop the `+ ':'` in `creditsRender`.
- The roll starts with the take (the entrance's own call) and runs once; Out and Take roll it
  again. No Roll again button, because Take is that button.
