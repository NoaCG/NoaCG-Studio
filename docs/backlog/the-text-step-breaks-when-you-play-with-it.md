---
v: 2
source: owner
kind: ask
raised: 2026-09-05
state: advanced
note: |
  Landed 2026-09-05: the reproducible half. "Nothing happens in the preview" was measured -
  at 147 and 295 characters all four too-long options give byte-identical text - and answered
  by making every option name the PANEL, which is the only thing that differs. Two hypotheses
  were killed by measurement (order dependence; the plate vanishing). What STILL stands is the
  standard itself: the second symptom (the box that stopped growing on a second try) is
  unreproduced, and the measured-default effect still cannot see typing. The panel that never got
  taller, found while gating this, was fixed on 2026-09-08 on branch
  claude/l-panel-that-never-grows: the offer measured the question plate's own 384 px to its
  margin while the lowest answer had 49 px, and a centred block never crossed the floor it was
  asked about, so the panel grew by zero. Room is now measured from the far edge of everything
  that travels, the question plate grows 259 px to 285 px, and nothing spills.
asked: "it should be very simple: what it does, and it always works... when I just mess around and
  change a lot of things, it breaks. And it should be allowed to test and try to mess with it, and
  it shouldn't break. This is a good test, and this wizard step doesn't pass it yet."
---
# The wizard's text step does not survive being played with

Owner, 2026-09-05, after importing the sample quiz board and working the text-fit controls for a
while. Verbatim, the part that is the standard rather than the symptom:

> At this stage I can change how the text should react, but nothing happens in the preview, so it
> breaks down after I work with this for a longer time. It's somehow kind of fragile, this whole
> wizard step, and it shouldn't be like that. It should be very simple: what it does, and it always
> works, right? Still, I think that when I just mess around and change a lot of things, it breaks.
> And it should be allowed to test and try to mess with it, and it shouldn't break. This is a good
> test, and this wizard step doesn't pass it yet.

And the standard he set for the fix the next day: *"It would be really nice if the text just does
exactly what the option tells it to do and nothing else."*

## MEASURED 2026-09-05, on his own board

`e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg`, one question at three lengths,
all four too-long modes at each length, through the step's own Text box and the wizard's own
preview. The gate is `e2e/import-svg.spec.ts`, "the too-long mode answers the same however the
reader got there".

| chars | grow-x | grow-xy | grow-y | shrink |
|---|---|---|---|---|
| 147 | 36px / 2 lines | 36 / 2 | 36 / 2 | 36 / 2 |
| 295 | 36px / 4 lines | 36 / 4 | 36 / 4 | 36 / 4 |
| 591 | 29.2 / 6 | 36 / 8 | 36 / 8 | 26.2 / 6 |

**At ordinary lengths the four options give byte-identical text.** Only the panel's width differs.
So a reader switching between "the text gets smaller" and "the text wraps onto more lines" watched
the text do exactly the same thing, twice, and concluded the control was dead. That is the whole of
"nothing happens in the preview", and the ladder was right every time: it wraps into the room the
design has before it reaches any rung an option names, and at 147 or 295 characters it never has to
go further.

**The fix was the labels, not the fit** (landed the same day): every option now names the PANEL,
which is the only thing that differs, and the section says in prose what is true under all four -
the text wraps, and shrinks if it still will not fit. The four rungs diverge correctly at 591
characters, four different ways.

## Two hypotheses this KILLED

Both were reasonable and both are wrong, so nobody should spend the day on them again:

1. **Order dependence.** The whole reason `wizard-text-fit-is-order-dependent.md` exists. Walked
   the four modes forwards and then backwards, measuring after each: **every mode gives byte-
   identical results whichever route reached it.** The dependency-array staleness at the measured-
   default effect is real as code, but it cannot produce this, because the user's own pick is not
   read from that effect.
2. **The plate vanishing.** An early probe reported that under two of the four modes the question's
   plate could no longer be found - which looked like a containment failure and was a fact about
   the probe: `svgFitContainer` answers by containment, so asked about a block that has already
   outgrown its plate it correctly answers "nothing holds this". The ladder itself asks the
   question at REST, where the answer is right. The gate now resolves the plate once, at rest, and
   the comment says why.

## What is still open

- **The second symptom is unreproduced**: *"on my second try, I don't even get the box to become
  taller with more rows. It made two rows and no more."* Two rows is the correct answer for a
  question of that length on this board (see the table), so this may be the same labelling
  confusion rather than a second defect - but it may not be, and it has not been driven with the
  behaviour attached and removed, which is what his 2026-09-04 report did.
- **The measured-default effect still cannot see typing** (`MapSvgFieldsStep.tsx`, the effect
  keyed on `[svg, draft.svgFields, boundMarkerIds, placedLines, draft.svgBehaviour,
  draft.svgStretch, onDraft]`). It only chooses the DEFAULT, and it freezes for good once the
  reader picks a mode by hand, so it cannot explain what he saw. It is still a latent staleness
  and worth closing on its own terms.
- **`docs/backlog/wizard-text-fit-is-order-dependent.md`** should be re-read against the table
  above before any more work is done on it: its central hypothesis is now measured false, and its
  most valuable part - the preview/program disagreement of 2026-09-04 - is untouched by any of this
  and remains the strongest open lead.
