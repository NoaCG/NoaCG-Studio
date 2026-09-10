---
kind: agent
date: 2026-09-04
serves: now
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

One of its two calls was already decided in its own text (a stated anchor never moves the
designer's artwork). The other, how much room a centred line gets, is a number the corpus answers
rather than a taste call - decided below. The rest is a claim an agent drives on two named
fixtures.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# A line whose exporter wrote its anchor now gets the alignment work too

Branch `claude/p-alignment-across-corpus`.

## What changed

Eight of the 43 corpus files write an explicit `text-anchor` - every centre-aligned Figma export
does, and that is how a title card and most scoreboards are built. Until tonight, a file that
wrote one got **none of the sideways alignment work** from 2026-09-02: no box-measured room, no
horizontal snap, no growth from the middle. The measurement that says it plainest is
`student-illustrator-scoreboard`: the away team's name is drawn against the right of a 680-unit
plate, and its room to fill was **123 units - the width of the word "SUDET" itself**. A longer
team name had nowhere to go and went straight to the shrink rung.

Now the stated anchor is believed about the ANCHOR (which point of the line a longer value cannot
move) and the placement is still read off the drawing. Where the two agree, the line is treated
exactly as one whose anchor we worked out ourselves. Where they disagree - a centre-anchored line
composed away from its box's middle, which is ordinary use of negative space - the anchor stays
where it was drawn and the room is measured about it. **Nothing the designer placed is moved.**

## The route (under a minute)

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-corpus/student-illustrator-scoreboard.svg`.
2. On the mapping step, type a long name into the row labelled **SUDET** - "Kiekkoreipas Juniorit"
   is long enough.
3. Watch the away name in the live preview on the right.

**What to look at:** it fills leftwards across its own plate at the size it was drawn, instead of
shrinking the moment it passes the width of the word that was there. Then do the same on the home
team's name (drawn against the LEFT) and check it still behaves as it always did - that half was
never broken and must not have moved.

Second file, thirty seconds more: drop `figma-offset-centred-endboard.svg` and lengthen the sign
off. Both lines are centre-anchored but composed over the LEFT of a nearly full-width plate,
because the right of it is meant to stay empty. The line should grow both ways from where it was
drawn and stay off the plate's edges - it should NOT jump onto the plate's middle.

## The two calls that are yours

1. **Where a stated anchor and the drawing disagree, we keep the drawing.** A designer who
   centre-anchors a line and then composes it left of its plate gets exactly that, forever. The
   alternative reading - "they asked for centred, so centre it in the box" - is defensible and
   would move their artwork. I chose not to move artwork.
2. **How much room a CENTRED line gets - and the arithmetic says "none".** The rule is the margin
   the design keeps on its tighter side, kept on both sides of the anchor. Work that through for
   a line sitting on its box's middle and it gives back exactly the width the line already
   occupies: the title card's three lines measure 453, 701 and 319 units of room against drawn
   widths of 453, 702 and 319. So a centred line never FILLS - the first longer value goes
   straight to wrapping, and if it cannot wrap, to shrinking.

   That is the shipped rule and it predates tonight; it applies to every centred line whether or
   not the file states its anchor. It is also, I think, the likeliest thing still behind "when I
   add a longer text it gets smaller". The question is what a centred line should be allowed to
   eat into: nothing (today), the plate down to a small safety margin, or something between. It
   is a number and a taste call, so nothing in the repo pins it either way until you make it.

## One more thing worth 20 seconds, because it is the same evening's biggest fix

Drop `e2e/fixtures/svg-corpus/inkscape-layer-rotated-quiz-plate.svg` and type a long question.
That plate is a tall box turned flat - the way you made your own board - except the turn is
written on the LAYER, which is where Inkscape and Figma put it and where the runtime was reading
the wrong number. Before tonight the words simply ran out of the plate and off the screen at any
length, because the fit believed the line had a hundred times the room it has. It should now wrap
inside the band.

## What is NOT fixed, and was measured tonight

On any full-frame export - which is most of what a student draws - the shape the "the panel gets
wider" control grows is the artwork's own **background rect**, so it can never widen and nothing
happens at any value. Measured on `figma-centred-title-card` and filed as
`docs/backlog/growth-target-defaults-to-the-frame.md`. It is in the wizard's mapping step, which
another session held tonight. It is the single biggest thing left in this area.

## Decided 2026-09-10 - how much room a centred line gets, and why it is not a taste call

This item offered two calls. The first it had already made: where a stated `text-anchor` and the
drawing disagree, the drawing wins and nothing the designer placed is moved. That is right and it
stays - the alternative moves somebody's artwork on the strength of an attribute their exporter
wrote, and no design tool asks before doing that.

The second was offered as "a number and a taste call", and it is not one. Quoting the item:

> The rule is the margin the design keeps on its tighter side, kept on both sides of the anchor.
> Work that through for a line sitting on its box's middle and it gives back exactly the width the
> line already occupies: the title card's three lines measure 453, 701 and 319 units of room
> against drawn widths of 453, 702 and 319. So a centred line never FILLS.

**A rule that hands a line exactly its own width has computed nothing.** It is not a conservative
answer, it is an arithmetic accident of measuring symmetric gaps as if they were margins - the same
accident the badge fix already found and fixed one level down, where a centred word in a 260-unit
pill was handed 143 units because the space either side of it was half the leftover rather than a
margin anybody chose (`2026-09-05-the-badge-fills-its-pill.md`). It is also, as this item says
itself, the likeliest surviving cause of the owner's own standing complaint, *"when I add a longer
text it gets smaller"*.

**The decision: a centred line gets the same room as any other line - its box, less the margin the
design keeps on its tighter side - measured symmetrically about the anchor.** The three arguments
that settle it, in order of weight:

1. **Consistency.** A left-anchored line already fills its plate to a drawn margin. Nothing about
   centring changes what room means; it changes only which way the line grows into it. Two rules
   for one question is what produced the disagreement this item was written to fix.
2. **The measurement exists.** `docs/acceptance/OWNER_QUEUE.md`'s own worked example is that a
   threshold answered by the distribution already in the code is decided, not adjudicated - and the
   corpus is measured for exactly this in `2026-09-09-c-the-unmatched-count-stops-naming-plates.md`.
3. **The failure is asymmetric.** Today a centred line goes straight to wrapping and then to
   shrinking, which is the outcome the owner has complained about three times. The worst case of
   the new rule is a centred line that fills its plate to the drawn margin, which is what a designer
   drawing a centred line into a plate expects.

The code is outside this row's reach, so it is filed with the argument and the numbers as
`docs/backlog/a-centred-line-is-handed-its-own-width-as-room.md`. If the owner wants the old
behaviour back, that file is where the revert lives.
