# The visual taste review - nine questions, answered by looking at the rendered frame

**What it is.** The half of reviewing that `docs/TASTE_RUBRIC.md` does not do. The rubric proves
a surface is clear, intentional and functional; the owner ruled on 2026-08-28 that it "would not
make the graphic pass my eye" and asked for "a separate, very small screenshot-based graphic-taste
review for hierarchy, composition, restraint, coherence and overall on-air quality". This is that
review. It stays very small. Five axes, four text questions, one page.

**Why it is answered off a picture.** Every source-level check in this repo passes a visibly broken
graphic, and the measured instruments (`src/ai/spike/tasteCheck.ts`, the five catalog gates) answer
numbers, not looks. The owner, 2026-09-03, after a day of judging graphics by hand:

> I've been giving feedback for hours on how a text should be centered and look good, and how text
> inside a box should live inside a box and not go outside of the boundaries. How a text should not
> be weirdly aligned to the graphic. I realized that I shouldn't need to say these things because if
> you just look at it yourself, you would notice how it should look. I know that you can do it
> because if I were to ask you to fix it, you would fix it.

The capability was never missing. The step was.

**What it is not.** Not a gate. Nothing fails a build on it, because a threshold that fits the data
can still assert something the owner does not believe (`docs/TASTE_RUBRIC.md`, "Not the composition
instrument"). Not a substitute for his walk. A session's YES is evidence, his look is the verdict.

## How it runs

```bash
npm run queue -- "node scripts/taste-frame-review.mjs --affected"        # what this branch can move
npm run queue -- "node scripts/taste-frame-review.mjs --only lt27,tk01"  # named designs
npm run queue -- "node scripts/svg-import-sweep.mjs --shots ./shots-taste --only <slug>"  # an import
node scripts/jobs.mjs log <job>                                           # then open the frames
```

The catalog script renders each design at 1920x1080 over the grey bed the owner's blind reads use,
through the same settle-and-raster recipe as `cli/src/screenshot.ts`, and writes `hold.png` (its
own defaults, entrance settled, motion frozen), `long.png` (every text field lengthened the way the
text-containment gate does), and for each `next()` the design answers both `step-N.png` and
`long-step-N.png`, into `./shots-taste/<id>/`. T4 is answered off `long-step-N.png`, because a step
whose box grows with its text shows it in no other frame. An imported design goes through the real
door instead, because a second door can disagree with the one students use. Both are browser work,
so they go through the queue.

Then **open every frame** and answer the nine questions below in writing, YES or NO, each NO with
what you saw. The answers go where the work is reported, which is the `/check` report (phase 5),
or the pull request. **A NO is a defect. Fix it, or say why not. A NO on axis 5
or on T2 means the graphic does not ship.**

## The five axes

Each one is a question with a right answer that does not need the owner. The failing examples are
his own verdicts, from the 49-frame blind read of 2026-08-18
(`benchmarks/pro/evidence/round-2026-08-18-typesweep/notes.md`) and from the walks since.

### 1. Hierarchy

> **Does the eye land first on the one thing this graphic is for, with everything else visibly
> smaller or quieter?**

- **Fails.** X-18, a stat panel with TURNOUT at 130 px and the figure it exists to show, 71.4%, at
  18 px under a hairline ("the percent number is way too small"). X-24, a podium whose scores are
  the smallest thing on it ("no score visible").
- **Passes.** X-06 (`lt27`). The name is the largest, brightest thing; the role is small caps in
  the accent colour at a third of the size. Nothing competes.

### 2. Composition

> **Is every element placed against something - centred in its shape, flush to its edge, or on a
> line something else shares - so that nothing floats and nothing collides?**

- **Fails.** X-39, a green accent bar drawn on top of the first letters of every line ("always the
  big mistake that makes it unairable"), with the logo left of centre in its own white column.
  X-16, an amber rule 25 px right of the name it sits above, aligned to nothing. X-36, a yellow
  top line that stops short of the panel's edges ("looks like a mistake").
- **Passes.** X-49. A left bar fused to the card's edge, the logo centred in its column, the
  kicker and headline on one left edge.

### 3. Restraint

> **Is there one accent colour, at most two typefaces, and nothing drawn that is not doing a job?**

- **Fails.** X-07, a purple pill with an orange number, an orange glow, a yellow gradient blob and
  a yellow SEC ("the yellow gradient glow reads as bad taste"). X-10, a red accent on a blue design
  that "looks like a mistake; remove it".
- **Passes.** X-34. Lime on near-black, one condensed face, a rule and two numbers.

### 4. Coherence

> **Would every piece pass as one show - mark, panel, type and accent in one voice?**

- **Fails.** X-01, a logo on a white box taller than the green panel beside it. X-36, "logo on
  black backing never works... adding the logo breaks the design". X-31, a logo that arrives before
  the graphic it belongs to.
- **Passes.** X-03 (`gt05`), "looks like our house graphic style". The mark, the chip and the
  number share one palette and one weight.

### 5. On-air quality

> **Composited over a real picture, at the size a viewer sees it, would a broadcaster air this as
> delivered?**

- **Fails.** X-21, black text on a red band, the band starting 120 px in from the left and running
  off the right of the frame ("a ticker goes full-bleed or carries equal margins both sides").
  X-24, dark blue on dark grey ("not enough contrast").
- **Passes.** X-49 ("I would air that"), X-34 ("I could even air this"), X-06 ("That's good").

## The four text questions

The owner's 2026-09-03 words, each turned into a question with a checkable answer. They sit under
axis 2 but are asked separately, because they are what he spent the day repeating.

- **T1 Centred.** *Is text that is meant to be centred actually centred in the shape it belongs to,
  on both axes?* The gap left equals the gap right; the gap above equals the gap below. Fails on
  X-45, a white DEVELOPING chip sitting low in its band, and on X-09 (`sb21`), a three-line label
  centred on itself but not in its cell. (Ruling: a centred block snaps on both axes,
  `docs/TEXT_BOX_BINDING.md`.)
- **T2 Inside.** *In `long.png`, does every glyph, descenders and the last letter-space included,
  sit inside the box it belongs to, and is none of it cut off?* Fails on X-15 (`sb01`) under
  stress, KESTREL CITY cut off by the tile beside it, and on X-25, the third card standing outside
  the cream panel. (Ruling: "any text that has a box around it needs to stay in the box".)
- **T3 Aligned to the graphic.** *Is the text aligned to the panel, rule or shape behind it, never
  to a frame coordinate?* Fails on X-39, lines starting at the accent bar instead of a padding
  inside it, and on a centred ragged block sitting at the left safe margin
  (`docs/DESIGN_LANGUAGE.md` §1).
- **T4 Grows as implied.** *When the string grows, does the box grow the way the design implies, a
  strap wider or upward, a quiz plate not at all, and does everything else stay where it was?*
  Fails on X-25 ("the steps make the boxes bigger and they're not aligned with the background, and
  the last step overflows") and on the owner's quiz board on 2026-09-02, where a plate he had not
  typed into grew and took two answers with it.

## Where it fires, and why there

**In `/check`, phase 4 (`.agent-workflows/check.md`).** That is the last thing every session runs
before it declares work finished and queues it, in every session type, by contract. Its verify leg
already says "if the behaviour is observable in the browser, observe it"; this names what observing
a graphic means and hands over the frames. The report line is `taste: answered` (with the NOs) or
`taste: not applicable`.

Not a hook, because design work is hundreds of edits and a notice on every one is a notice nobody
reads (`scripts/hooks/warn-edit.mjs` reserves exit 2 for a dated incident, and this is a step, not
a refusal). Not a build gate, because a gate lands alone, it cannot answer a taste question, and
the owner asked for a review, not a floor. Not a nightly, because the point is the session that
made the change looking at it before he does.

## Calibration

Does the instrument reach his verdict? Two runs, both on 2026-09-03.

### Against sixteen frames he judged blind on 2026-08-18

Honestly stated, his notes were read before the frames, so this is not a blind re-judgement. What
it tests is narrower and still the thing that matters. Looking at the frame, does one of the nine
questions name the fault he named, and does any question fire on a frame he would air?

| Frame | His verdict | The question that says NO |
|---|---|---|
| X-06 `lt27` | AIR | none, all nine YES |
| X-49 | AIR | none |
| X-34 | AIR | none |
| X-03 `gt05` | AIR | none |
| X-12 `qz01` | OK* (house) | none |
| X-09 `sb21` | OK*, "left text not centered" | T1 |
| X-45 | TWEAKS, chip "not centered" | T1 |
| X-18 `ig01` | TWEAKS, number "way too small" | 1 |
| X-15 `sb01` | TWEAKS, stress cuts the left text | T2 (long frame) |
| X-36 | TWEAKS, short line, logo on black | 2, 4 |
| X-16 | FAIL, accent line misaligned | 2, T3 |
| X-39 | FAIL, line on text, logo off centre | 2, T3 |
| X-25 | FAIL, boxes overflow the background | T2, T4 |
| X-07 | FAIL, glow "bad taste" | 3 |
| X-24 | FAIL, no contrast | 1, 5 |
| X-21 `tk01` | FAIL, red on black, uneven margins | 5, 2 |

Every AIR frame is all YES; every FAIL has a NO on the question that names his reason; the three
TWEAKS are single NOs outside axis 5 and T2, which is what "with small tweaks could work" means.

The seven catalog ids in that blind were rendered through the Pro harness with a design language
painted over them. X-21 is `tk-news.ledger.catalog`, and its red band and black text are the ledger
palette, not `tk01`'s own; `tk01.ts` has not changed since that read and on its own defaults it
passes all nine today. So the table is calibration against the frames he saw, and a live
`--only tk01` is a different picture of the same design.

### Against today's catalog, rendered by the script

Eleven designs, hold and long frames, plus the step frame `qz01` answers.

| Design | Frames | Answer |
|---|---|---|
| `lt27`, `gt05`, `qz01`, `sb21`, `lt33`, `lt51` | hold, long (qz01 also step-1) | all nine YES |
| `tk01` | hold, long | all nine YES on its own defaults (see above) |
| `ig01` | hold, long | all nine YES; the 2026-08-21 change put the figure first, which is what X-18 asked for |
| `sb01` | hold, long | all nine YES; at the long string the names and three-digit scores stay inside the slab, which is the X-15 fault fixed on 2026-08-20 |
| `ls09` | hold, long | NO on 2. At the long string the stat cells' padding collapses to 7 px at the right edge; the text is still inside, so it is a TWEAKS, not a FAIL |
| `card80` | hold, long | NO on T2, does not ship at long values. The byline is cut mid-name at the panel's padding edge with no ellipsis and the rest is painted outside the panel and hidden, which is the 448 px `scripts/text-containment-baseline.json` records for it |

So on the live catalog the instrument passes what he has since fixed, fails the design the
containment gate already flags, and names a padding defect the gate cannot see. The owner's own
quiz board was rendered once through a hand-built import (question centred on both axes at one, two
and three lines, four answers unmoved, all nine YES); that door was then removed from the script
because it can disagree with the wizard's, so the board's standing frame is the one
`svg-import-sweep --shots` writes, and its long-string frame is not yet rendered by any script.

## Changing it

It only gets smaller. A question is added when a verdict of his has no question that names it, and
retired when it stops discriminating. Re-run both calibration tables after any change; if the
instrument no longer reaches his verdict on those sixteen, the change is wrong, however good it
sounds.
