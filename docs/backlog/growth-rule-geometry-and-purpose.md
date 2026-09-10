---
v: 2
source: owner
kind: ask
raised: 2026-08-30
state: advanced
asked: "the growth rule shouldn't depend only on a category. It should depend on the geometry and what is the why of the graphic and how it works with other graphics - in Who Wants To Be A Millionaire the question box does not resize with the question"
note: 1f935233 wrote the rule where designers read it, and the code keys on the behaviour rather than the category; the vertical half is now measured DONE (255f0ab6 - his own lower third widens and then gets taller at the drawn size, and the corpus is gated on it), so what still stands is step 2, how "played in a sequence" is known from the behaviour
---
# The growth rule: geometry AND purpose, never category - and a sequence keeps its size

**Filed:** 2026-09-02, from the 2026-08-30 owner rulings (memory `owner-decisions-2026-08-30`,
ruling 4). **Source:** owner ruling, 2026-08-30 morning.

## Why

The importer proposes how an imported graphic's panel grows with its text (the fit ladder,
`docs/SVG_AUTHORING.md` section 4), and the proposal today reasons from the artwork's geometry
and, in places, from the graphic's category. The owner ruled that category is never the reason:
*"We should have real-life examples and logic being used here."* His worked example is the useful
part - a quiz or text box played one item after another keeps the SAME size between items, because
in Who Wants To Be A Millionaire the question box does not resize with the question, and that is
right by design taste. So a graphic in a SEQUENCE is a case for constant size even where its
geometry alone would argue for growing. This is a taste rule with a mechanism under it, and it
needs design work, not a heuristic tweak. The 2026-09-02 delegation trial found the growth field
is exactly where every delegate went wrong, so the rule's clarity is also what makes that field
checkable.

## What it would take

1. Write the rule as the owner stated it, with the sequence case, into `docs/SVG_AUTHORING.md`
   section 4 and the corpus README's schema comment - the promise a fixture's expectation is
   written from.
2. Decide how "played in a sequence" is known: from the behaviour attached (quiz, poll), from a
   production's rundown, or from a field on the graphic. Design it; a heuristic on the category is
   the thing ruled out.
3. Re-derive the affected corpus expectations and run `e2e/import-svg-corpus.spec.ts`.

## Evidence

The ruling is verbatim in memory `owner-decisions-2026-08-30` and its worked example in the
2026-08-30 wave plan. `docs/GRAPHIC_TYPES.md` already uses the Millionaire example for quiz
STATES (one selected state plus a field), which is a different rule; the growth half is unwritten.

## The rule, ruled - owner, 2026-09-03

Walked on his phone against finding 5's two disagreeing quiz boards. **A quiz or poll board is
FIXED; a lower third or a standalone text box scales with its text.** The sequence case from
2026-08-30 is now stated as the reason rather than the example:

> I can't have each question graphic looking different when they come on the screen

He then loosened "unified" himself when asked what it costs, and this is the design to build:

> The graphic should stay the same when it's fixed. Let's not take "unified" too literally here.
> The font size can get smaller if it needs to be, but then it's also bad design from the person
> who made the question. The quiz board should have space for graphics that are multi-line, and it
> should not break the design.

> *One-Line-Questions* is in the middle of the question box. When the question gets longer, it
> fills out until the box but stays inside the box, drawing new lines and keeping the whole text
> centered all the time.

> It does not mean that every graphic needs to have the same font size, but we will only change
> the font size when we absolutely need to do it. There should be a possibility for multi-line,
> and the user then makes the decision to have a long question if it doesn't fit with the same
> font.

And the principle above both: *"we should mimic the original design as closely as possible. We
don't want to break it."*

The category ban stands, so step 2 above is still the design question: a sequence has to be known
from the BEHAVIOUR attached to the graphic, never from a category. The prompt for it was row A
of the 2026-09-03 next-wave handoff, removed in 0c8941bd once that wave drained; this file is now
the record, and the ruling above is the brief.

## Two things he added, which are direction rather than this row

- **The user has the final say.** *"We also need to implement ways for the user to create their
  own preferences. They should have the final say on how something works."* Whatever we decide
  here is a default, and the preference surface is its own work.
- **Defaults come from how television actually works.** *"If we can gather examples from real life
  regarding where and how graphics are used, we can replicate those default settings. I am not
  here to create something unique with the design styles; this should be common sense and always
  look good, as the customer desires."* This is the standing method for every default in the
  importer, not only growth.

## Vertical growth is part of the rule - owner, 2026-09-03

Walking `effects-gradient-shadow-lower-third.svg` in the editor, he found the plate widens and the
text wraps, and then the plate does not get taller, so the second line prints over the row beneath
it on all three fields.

> we need to ensure that all our shapes can grow when we want them to grow vertically as well

> In a lower third, it would make sense for it to get bigger. That's what I think.

Paired with the 2026-09-03 quiz ruling above, the shape of the rule is now: a graphic that plays
as one of a SEQUENCE keeps its size and fits the text inside it; a lower third or a standalone
text box may grow, and growing means **both axes**, not width alone. A wrapped line that prints
over the artwork beneath it is the failure either way.

### That half is done - measured 2026-09-10

Walked again on the file he walked, in the wizard, with "The panel gets wider, then taller"
selected. His plate widens from 1040 to 1640 px, then gets taller from 190 to 257 px, the name
wraps onto a second line at the 56 px the designer drew it at, and the role underneath stays
where it was drawn. Both rules reach the emitted document (`NOACG_LAYOUT` carries `g0:x` and
`g1:y`, and the plate carries both stamps), and the runtime spends both. Twenty-one of the corpus
fixtures do the same. The claim this receipt used to carry - that a plate cannot do both at once -
was written on 2026-09-05 and the commits that made vertical growth work landed on 2026-09-08 and
2026-09-09, so it had been stale for three days with nothing measuring it.

What the same walk DID find is that nothing gated the cap. Growth is decided in screen pixels and
spent by writing user units, and the helper converting between them read every panel as a placed
HTML line, so the conversion ran at 1 on artwork whose user units are not CSS pixels. The
millimetre scorebug fixture grew its plate to 1700 px inside a 720 px frame - "one page of text",
exactly - and the 3840-wide ticker grew half as far as it was granted. Fixed in 255f0ab6 and swept
over the whole corpus by `e2e/import-svg-corpus.spec.ts`.

**What still stands is step 2 above**: how a graphic knows it is played in a SEQUENCE, from the
behaviour attached to it and never from a category.
