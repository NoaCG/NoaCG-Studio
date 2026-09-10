---
v: 1
source: owner
kind: ask
raised: 2026-09-10
state: filed
asked: "the Monaco editor should be able to show the OGraf code and not just the SPX code ... you should be able to change from SPX to OGraf, and the code would follow along"
---
# The code editor should show OGraf, not only SPX

**Filed:** 2026-09-10, from the owner's landing-page walk, raised as a long-term wish beside the
OGraf direction cards.

## His words

> In the long-term goal, the Monaco editor should be able to show the OGraf code and not just the
> SPX code, as it is right now. In the settings, and probably also in the editor, you should be
> able to change from SPX to OGraf, and the code would follow along. You could see and understand
> how the graphics are being built.
>
> That's a little bit of a vanity thing, so there's no hurry for that, but we should add it to our
> backlog.

## What it is

A target switch on the code view. Today the editor shows the SPX rendering of the canonical
document. The wish is to pick the target - SPX or OGraf - in settings and probably in the editor
itself, and have the code panel re-render the same graphic as that target. The stated value is
comprehension: a person can see how the graphic is actually built for the format they care about.

## Why it fits the architecture rather than fighting it

The root contract already says `SpxTemplate` is canonical and every export target is an adapter off
the one code-as-truth document. `docs/GOALS.md` "NEXT - OGraf-first" states the same split: the
NoaCG-native document stays the authoring format, OGraf is the interchange contract, SPX is an
adapter keeping the strictest gate. An OGraf view is therefore a READ of an existing adapter, not a
second source of truth, and that is the only shape it may take.

The hard part is not rendering it. It is what happens when somebody EDITS in the OGraf view, since
the editor is a real editor and not a viewer. Three defensible answers, undecided:

1. The OGraf view is read-only, labelled as such. Cheapest, and honest about which document is
   canonical.
2. Edits round-trip through the adapter. Most useful, and the most likely to lose information,
   since an adapter is not required to be invertible.
3. Switching to OGraf switches the whole editor into an OGraf-authoring mode with its own document.
   Contradicts the single-source-of-truth invariant. Named here only to be ruled out on purpose.

Start at 1. It delivers the stated value - seeing how the graphic is built - at a fraction of the
cost, and it is what the owner actually described.

## Where it sits

Parked, by his own framing: *"a little bit of a vanity thing, so there's no hurry"*. It belongs
under the OGraf ladder in `docs/GOALS.md` rather than in the NOW push, and it is not blocked by any
rung there: a read-only view could land whenever the appetite exists.
