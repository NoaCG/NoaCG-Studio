---
v: 2
source: owner
kind: ask
raised: 2026-09-05
state: active
branch: claude/f-growth-question
asked: "I feel like this option seems unnecessary. I think it might even just be more confusing to
  get these options... when the question becomes long and the box gets bigger, everything else
  should just move out of the way."
---
# Should "what else moves when the panel grows" be a question at all?

The DEFECT half of this is fixed (2026-09-05): "Grows by the same amount" wrote a width onto
elements that have none - a text layer, a group - so choosing it silently stopped that layer
following at all. The option is no longer offered to a layer that cannot stretch, and a template
saved with it travels instead.

What remains is the owner's larger point, which is a design question rather than a bug:

> In any case, I feel like this option seems unnecessary. I think it might even just be more
> confusing to get these options, or then I'm not using it correctly, but when the question becomes
> long and the box gets bigger, everything else should just move out of the way.

He is describing a default that is right almost always. A student meets this control on their first
import, and every choice they have to understand before dismissing it is a tax on the one road the
current push cares about.

**Do not break what works**: his words, in the same message. The move-out-of-the-way path is what
he found working, and every corpus graphic is gated on it.

## The measurement (2026-09-06, before any behaviour changed)

The corpus was asked directly, with the real importer and a real browser: mark up each of the 47
files in `e2e/fixtures/svg-corpus/` with `importSvgMarkup`, render the marked artwork at design
size, and then run the four predicates that decide this question, unchanged from the source they
live in - `proposeFollowers` and `canStretch` (`MapSvgFieldsStep.tsx`), `panelsHoldingText`
(same file), and `svgCollectSpanners` (`templates/importedDesign/svg.ts`). Swept over EVERY panel
a reader could pick as the grower x BOTH axes, so no number below depends on which panel the
measured default happens to land on.

| | |
|---|---|
| fixtures | 47, of which 46 import (`geometry-unescaped-ampersand` refuses by design) |
| panel x axis combinations swept | 172 |
| combinations that list at least one follower | 41, in 16 files |
| **follower rows that carry the move/grow question** | **79** |
| of those, rows where "Grows by the same amount" is even OFFERED | 35, in 10 files |
| **of those, rows where growing is the RIGHT answer** | **0** |

Zero is not an accident of this corpus, and that is the part worth keeping. A row in the list is a
layer drawn PAST the growing edge; a layer that genuinely has to stretch is one drawn TO BOTH of
the panel's edges - a rail down its side, a tint band behind it. Those two sets cannot intersect,
so the question is asked exactly where its second answer cannot be right. Hand-read of the ten
files where the option is offered agrees: a timer bar below a board, a divider right of a ticker
flag, a card below an ident. Every one of them should move.

**The artwork that genuinely needs stretching is real, and it is already handled without a
question**: 31 spanning layers across 23 of the 46 files (the shipped Illustrator, Figma, Inkscape
and Affinity lower thirds, the ticker's bar, the student scoreboard). `svgCollectSpanners` measures
them at play time and grows them, in the same breath as the end caps, and no reader is ever asked.

## The decision (2026-09-06)

**The question goes.** Every layer in "What else moves" moves out of the way, stated rather than
asked. What replaces the control is what the artwork already answers:

- furniture that spans the growing panel STRETCHES, automatically, always - the rule end caps have
  had all along ("a grown panel with its end-cap left behind mid-artwork is simply wrong");
- a pro who wants something else edits `NOACG_LAYOUT` in the generated code, where the follower's
  `mode` is a documented word in a commented table. Reachable, and not equal weight.

**One defect this uncovered, fixed in the same change**: spanners were collected only while the
rule carried NO declared follower list, so the moment a reader touched any row - dropped a strap,
added a layer - the rail on their lower third silently stopped growing with its plate. Removing the
mode control without fixing that would have taken the last road to stretching away from the exact
artwork that needs it.

The doctrine now lives in `docs/TEXT_BOX_BINDING.md`; this file is deleted by the change that
ships it (docs/backlog/README.md, "Landed is not a state").

Related: `docs/backlog/svg-growth-default-across-exporters.md`,
`docs/backlog/the-text-step-breaks-when-you-play-with-it.md` (same session; its second symptom, a
panel that stopped growing on a second try, may share a cause).
