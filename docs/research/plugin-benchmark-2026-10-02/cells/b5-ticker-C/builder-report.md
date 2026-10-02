# b5-ticker-C builder report (condensed; the critique's claims kept whole)

Opus subagent, 195k tokens, 78 tool calls, 10.4 min, on a copy of b5-ticker-D's package. Opened
`critique.md`, not `design-notes.md`. Its own before/after sheet: `builder-before-after.png`.

**Critique, as it stated it** (one line per critique.md question): would not sell on a stock
marketplace, competent but generic (dark plate, Inter, amber chip); says nothing about this show
(the main defect); hierarchy fine; type fine (33px off-white Inter); on a dark picture the 90%
night-blue strip disappeared; the chip's width followed its word, so UUTISET to TIEDOTE nudged
the crawl; motion fine; long text passes; operator surface passes.

**Changes it claims:**

1. The strip says Radio Kaiku: the label chip ends in a rounded cap with two amber "echo" rings
   (kaiku = echo) that fade in during the entrance; the separator dot became a small echo mark;
   in a bulletin the red covers the rings and the white HUOMIO chip keeps the cap.
2. The strip holds on dark pictures: panel lightened slightly, a faint top edge line.
3. The chip keeps one width for UUTISET, TIEDOTE and HUOMIO, so the crawl does not shift.

**Left alone:** fields, buttons, machine, crawl speed, headline-edit logic. An empty bulletin
still shows an empty red strip (no way to make a button require text).

Friction: `--at` units; validate writes into the folder unannounced; `--background video` is one
ground, so it wrote a PIL script for the other two; no required-payload option for a button; the
critique's "could the same frame serve a different brief" line is what drove the motif, by its
own account.
