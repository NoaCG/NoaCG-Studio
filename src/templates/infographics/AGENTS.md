# src/templates/infographics - the infographics

## THE SETTLE RULE: a readout's final value is a SET, never only a callback

**Every count must END ON A `tl.set` of its real text, positioned at that count's own end.** A
card, a thumbnail, a Browse preview and the editor canvas all park a graphic at the end of its
entrance with GSAP's callbacks SUPPRESSED. A tween still writes its target under that jump; a
callback does not. So a figure that reaches the DOM only from an `onUpdate` never arrives, and the
graphic advertises itself with the `0` its opening `set` wrote. Measured 2026-08-27: **seventeen
readouts across eleven designs shipped reading 0** against their own `data-target` - ig01 "Big
Stat" showing `0%` where the data said `87%`.

**The audit is "does this readout depend on a callback firing", not "is it a number".** A width, a
dashoffset, a scale and an opacity are tween TARGETS and settle on their own, which is why the
bars, the rings and the milestone nodes were right while every figure beside them was wrong. Add a
readout, add its `set`. The full account is in `igMotion.ts`'s own header and
`docs/DYNAMIC_MOTION_SCOPE.md` §11a; the gate is `e2e/counting-settle.spec.ts`, which discovers
counting designs by the `data-target` mark in the composed document rather than from a list.

## THE ZERO RULE: a readout empties when the GRAPHIC appears, not when its count starts

**A builder that owns a readout takes the step's head start as `opts.lead`, positions its own
contents from it, and marks the timeline it returns `noacgLeadApplied`** - the interpreter
(`templates/shared/animRuntime.ts`) then adds that timeline at 0 instead of at the offset, so the
opening zero lands on the entrance's first frame while the count still starts and lands exactly
where it did.

The other end of the settle rule's timeline, and the defect the owner hit playing a stat card from
the playout dashboard: the final figure, a snap to zero, then the count up to the number that had
just been on screen. **A playout server writes the data BEFORE it takes the graphic** - SPX,
CasparCG and the dashboard all call `update()` then `play()` - while a count that empties its own
readout at its own start leaves the operator's real figure on air for the whole head start.
Measured 2026-08-27 in that order: **twelve readouts across ten designs, every counted readout in
the catalog.** Settling never showed it, because a jump renders the zero and the figure in the
same frame; only real playback has a gap to see.

A builder that owns no readout ignores the lead and is added at the offset exactly as before -
which is every measured motion in every other category. The gate is the played-path sweep in
`e2e/counting-settle.spec.ts`; it decides which readouts count by whether their text MOVES during
the entrance, because `update()` writes `data-target` onto every field and the mark alone catches
static captions no builder touches.

## THE CAPTURE RULE: nothing reads a readout's figure after an entrance frame has been rendered

**A readout's real figure is captured BEFORE anything renders the entrance, and never after.**
Every rebuild in `dataRuntimes.ts` reads its figure from `data-target` and falls back to the live
`textContent`, and `buildInTimeline()` paints the entrance's own first frame during the take
(`templates/shared/animRuntime.ts`) - which writes `0` into every readout it is about to count.
So `play()` rebuilds before it builds the entrance, and every count builder reads its target
while it is being constructed. Read after that and the graphic hands its own opening zero back as
the operator's data, stamps `data-target="0"`, and counts 0 -> 0 for as long as it is on air.

**A wrong number is the failure mode with nothing on screen to say so**, which is why this is a
rule rather than a comment. Measured 2026-09-04 by reversing `play()`'s two lines: ig22, ig23,
ig30 and ig31 - the four designs sharing `goalRuntimeJs` - all aired a zero, and every gate then
in the tree stayed green, because each read its expected figure from the same attribute the fault
corrupts. The gate now reads it from the value the test typed instead
(`e2e/counting-settle.spec.ts`) and asserts that a take never rewrites a readout's own figure.

## infographics/ - the measured data graphics

ig01…ig39 (prefix 'infographic'; design owns fields + runtimeExtraJs) +
igPresets (count-up / bars-grow / ring-fill / rows-cascade / **goal-ring** / **milestone-run**)
+ **igMotion.ts** + **dataRuntimes.ts** (the rebuilds several designs of a type share:
schedule rows, bar rows, the GOAL meter in its two drawn shapes, the MILESTONE track).
`goal-ring` is its own preset and `infographicGoalRing` its own builder for a reason: on a
poll ring the middle figure IS the percent, so one number drives both; on a goal meter the
figure is money and the ring is raised/goal, and feeding the raised total to `ring-fill`
would clamp it and draw a full ring at 3 % raised. The milestone track spaces its nodes
EVENLY and interpolates the line BETWEEN them rather than plotting current/max - a rail
drawn "1 → 2 → 3 → 4" has to have its line mean a position on that rail, and even spacing is
what keeps four labels readable when a stretch goal is ten times the first. DATA BLOCKS via
convertToDataRegion. EVERY infographic's motion is MEASURED - the stat counts to the figure the
operator typed, each bar grows to its own `data-value`, the ring draws to that percent, and the
cascade runs one row per line they wrote - so none of it is a number a keyframe can hold, and it
all lives in the category motion runtime (the category motion runtimes, src/templates/AGENTS.md). The region keeps only the panel entrance
(real, editable keyframes) and NAMES the measured part. A count-up design may or may not pair a
progress bar with its figure, so `PresetConfig.hasBars` tells the preset - without it a bar-less
design (ig01) would carry a phantom timeline layer for an element it doesn't have.
**ig38 "Results Rail" is the category's first SIDE PANEL** - a fixed-width column at the frame's
edge that stays up while an anchor talks, rather than a centre-frame board that is shown and
cleared - and it reuses `seatBarsRuntimeJs` for its rows. **The trap it paid for, binding on
anything else that reuses a repeating runtime with a different composition in mind:** that
runtime nests the figure's cap INSIDE the bar's fill (so the readout rides a growing tip), so a
design that wants the figure pinned at one edge cannot express that as a grid column - the fill
is the cap's containing block, not the row. The rail takes the whole TRACK out of flow across
the row (the wash) and pins the cap against it, and reserves the figure's lane with the row's
own padding, because an out-of-flow cap reserves no width. The first draft laid the row out as
`label | figure` and rendered every figure on top of its district's name.
**ig39 "Key Figures" is the other half of that lesson** - the catalog's first TWO-COLUMN STAT
LIST (a header band, `label | figure` rows, a footer rule with the source and the date). It is
what a design gets when the runtime is written for the composition instead of borrowed: label
and figure are SIBLINGS in `statListRuntimeJs`, so the row is a real grid and the figures share
an edge because they share a column. Two rules it holds beyond that, both stated in its source:
a figure is rendered exactly as typed (nothing parses it, because nothing derives a share from
it, so "€4.21bn" and "12.4 %" survive intact), and a stat column asks for **lining** numerals as
well as tabular ones - the editorial text serif defaults to old-style figures that ride at
x-height with 3, 4, 7 and 9 below the line, which put "42" lower than "18,400" beside it and
broke the baseline every figure shares with its label. `tabular-nums` alone does not catch that,
and neither does the numerals gate: it measures whether a figure's box MOVES, and old-style
digits are perfectly stable at the wrong height.
**The ELECTION NIGHT mini-pack is ig34-ig36** (the catalog's first EDITORIAL infographics, all
siblings of lt25 "Masthead"): a seat board whose parties are one "Party | seats" textarea, a
coalition majority meter, and a turnout dial. Three rules they hold, each written into the
runtime that owns it (dataRuntimes.ts):
- **A seat board's bars are scaled against the BIGGEST PARTY, not the chamber.** Chamber-scaled
  bars are stubs (76 of 200 is a 38% bar) and the party-against-party comparison the board
  exists to make is exactly what the stubs stop showing. The scale is a DRAWING choice: the
  figure at each tip is the seat count they typed, never a share.
- **The majority is a LINE ACROSS the track, not the track's end.** Running the meter to the
  majority would draw a full bar the moment a government is formed and have nothing left to
  say about the seats won past it, which on a count night is most of the story. That is why
  `majorityMeterRuntimeJs` takes THREE numbers where the goal meter takes two.
- **The comparison figure is optional by construction.** Clear the turnout dial's hidden
  previous-turnout source and the swing line empties, which `:empty` removes - a first
  election costs the operator one deletion, not a different graphic.
The one that builds markup (ig34) escapes operator text at the data boundary like the rest of
the category; the two that only DERIVE text (ig35, ig36) write `textContent`, so their operator
text is inert by construction rather than by escaping - each says so in its own source, because
"no escaping here" has to read as a decision rather than as an omission.
