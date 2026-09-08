# Text and its box

**Status: all three measured defects are FIXED, the ALIGNMENT model is built and now snaps BOTH
axes, a graphic that comes up again keeps a fixed box, and unticking a text layer asks what to do
with the words. The step's own surface - grouping, the swatch, the overlay, the alignment control -
is still DESIGN.** The owner's brief is the 2026-09-02 walk of his own quiz board;
the verbatim words are in `docs/acceptance/owner-queue/2026-08-28-student-rehearsal-walk.md` and
they are the authority here, not this summary of them.

His sentence for the whole thing:

> We need to establish a system where the text appears as if it is designed on the graphic,
> regardless of whether the text is short or long.

The fixture this was measured on is `e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg` - a
chess-themed quiz board he drew in Illustrator: a tan question plate holding `<text id="question">`,
and four orange answer plates each holding one unnamed text. Every plate is rotated a few degrees,
which is what a hand-drawn board looks like, and what two of the three defects below turned on.

## What is broken today, measured

Three defects, all reproduced on 2026-09-02 by importing that file at `/app` -> Import graphic and
measuring inside the composed document. **All three are fixed.**

### D1. Shape geometry ignores `transform`

`assets/svgImport.ts` builds its panel inventory from the raw `x`/`y`/`width`/`height` attributes
of each `rect` (and from `panelPathGeometry` for a path), with no ancestor transform applied. The
quiz board's question plate is a portrait rect turned 88.68 degrees, so:

- it is **1238 x 259** on screen, and the step's own picker prints it as **231 x 1233**;
- the inventory is sorted widest-first, so the ordering, `proposeBannerGrowth`'s auto-pick and
  the follower derivation all run on rectangles that are not where the shapes are. On the fixture
  the growth default landed on an ANSWER plate, and named two answer texts as its followers -
  which is exactly the owner's "more rows in the question affected the placement of the answers";
- the wizard's hover highlight is drawn from the same numbers, so the amber box on the preview
  sits outside the artwork entirely.

The runtime is not affected the same way: `svg.ts` measures through `getBoundingClientRect` and
the element's CTM, so it sees the real geometry. The corruption is design-time, and it reaches the
runtime through the growth table the wizard writes.

FIXED 2026-09-02 (`assets/svgGeometry.ts`, a pure transform module with its own self-tests in
`scripts/svg-geometry.test.mjs`; `transformChain` in `svgImport.ts` collects the ancestor chain).
Measured on the fixture, before and after:

| | Picker reads | Growth default | What a long question does |
|---|---|---|---|
| Before | `q bg - 231 x 1233` | an ANSWER plate, dragging two answer texts | question shrinks to 62%, two of four answers move |
| After | `q bg - 1238 x 259` | the question's own plate | question stays at its drawn 36 px and wraps to two lines; all four answers move down together by 19 units |

The answers still move, and that is now the design rather than a defect: the question's plate
genuinely grew taller, and the owner allowed exactly that - *"if we allow the box to get bigger,
then maybe we can permit it to affect other graphics."* What made it wrong before was that a plate
he had not typed into grew and took half its neighbours with it. **D3 is what stops the plate
needing to grow at all**, since a two-line question fits inside a plate drawn 259 px tall.

### D2. Anything below a line collapses its wrap room, even from outside its box

`svgFitCeiling` (svg.ts) walks every drawn element, keeps the ones that overlap the line
horizontally and sit below it, and sets the ceiling to the line's OWN bottom - correct in intent
(the designer's gap is kept whole), but the candidate set is the whole artwork rather than the
line's own box. On the fixture the answer plates sit below the question and overlap it
horizontally, so the question gets **zero** room to wrap inside a plate drawn 259 px tall, and the
ladder goes straight to shrinking. That is the owner's "it immediately shrinks, which doesn't make
any sense because we have room in the box".

The rule this needs, and the rule the design below promises: **the inside of the box is the room,
and only things inside the box bound it.** A neighbour inside the same box (a role drawn under a
name in one banner) still bounds the block with its drawn gap kept whole, which is the 2026-08-29
ruling and stays exactly as it is.

FIXED 2026-09-02 (`svgInsidePanel`, applied to `svgFitCeiling` and `svgFitNeighbour`). It changes
nothing on this fixture, because D3 below binds first; it is the same rule stated once, and it is
what stops a plate standing beside another plate from bounding text it has nothing to do with.

### D3. A block can only grow DOWNWARD, so text centred in a tall box gets one line

This is the defect the owner walked into. The wrap ceiling is the panel's bottom less the panel's
own TOP padding mirrored (`svgPanelTopPad`, bought by the 2026-08-29 walk so a wrapped name would
stop sitting hard against the panel edge). On a line the designer drew in the vertical MIDDLE of a
tall plate, that mirror eats almost the whole plate: the question's drawn top leaves about 91 px
above it, mirrored to 91 px below, leaving 64 px of room in a plate 259 px tall - one line.

Measured inside the composed document, with a real long question and "the text wraps onto more
lines":

| | Room the block gets | Result |
|---|---|---|
| Today | 820 x **64** | 1 line, shrunk to **22.44 px against a drawn 36** (62%) |
| With the block free to use the plate | 820 x **149** | 2 lines, **at the drawn 36 px**, block 816 x 83 in a plate 259 tall |

So the plate has room for the question at full size and the ladder cannot reach it. The mirror
itself is right where something is drawn below the line INSIDE the box - that case keeps its whole
gap, unchanged. What is missing is the other half: **where nothing inside the box sits below it, a
block should grow about the drawn line rather than only downward from it**, which is the vertical
half of the alignment model below - which is why the two were built together rather than patched
apart: fixing the room without the alignment drops a two-line question low in its plate.

FIXED 2026-09-02, together with the alignment (`svgAlignOf`, `svgLocalBox`, `svgRise`). Measured on
the fixture at three question lengths, with the growth control left at its default:

| Question | Lines | Size | Off the box centre | The four answers |
|---|---|---|---|---|
| short | 1 | drawn 36 px | x 0, y -12 | unmoved |
| long | 2 | drawn 36 px | x 0, y -12 | unmoved |
| very long | 3 | drawn 36 px | x 0, y -12 | unmoved |

Horizontally the block sits exactly on the plate centre at every length. Vertically it holds the
position it was composed at instead of drifting down as it gains lines - the -12 is the drawn
optical position, and it is CONSTANT, which is the property that matters. Nothing else on the board
moves at any length, because the plate no longer has to grow to hold the question.

### The gap that is not a defect

Fixing all three still leaves what the owner is really asking for. Today the binding is DERIVED and
never declared, never shown, and never correctable; there is no alignment answer at all, so text
fills rightwards from where it was drawn whatever the box says; and growth is ONE choice for the
whole graphic naming ONE shape, which cannot express "the question plate grows down, the answer
plates stay". The rest of this document is that system.

## The model

Every text field lives in a **box**: the shape drawn under it. **The text owns its alignment, the
box owns its growth.** That split is the whole model.

Vocabulary, fixed for anything the user reads: box, aligned (left / centre / right, top / middle /
bottom), and what the box does - stays as drawn, gets wider, gets taller, gets wider then taller.
Never "panel", "container", "bounding box", "room", "ladder", "fit" or "follower".

What the fixture derives to with no interaction, in the artwork's own px:

| Field | Box | Left / right inset | Alignment read off the drawing |
|---|---|---|---|
| Question | tan plate, 1238 x 259 | 209 / 280, centres 36 px apart (3%) | centred, middle |
| Answer 1-4 | orange plates, ~524 x ~120 | 31-36 / ~250 | left, middle |

A human reads the same thing off the board in one glance. The step's job is to show that it read
the same thing.

## The step, redesigned

### Rows grouped by box

The flat Editable text list becomes one group per box, the box as a header row and its fields
indented under it. Text with no shape under it sits in a final "On the artwork" group. The
grouping IS the binding.

```
Editable text                              5 of 5 editable on air

* Tan plate                                       stays as drawn v
  [x] Question  [Question 1: Who is the best at chess in the world?]
      centred - fits - 1 more line fits, then smaller            >

* Orange plate 1                                  stays as drawn v
  [x] Answer 1  [2. Magnus Carlsen                               ]
      left - fits - room for about 14 more characters            >
```

The bullet is a swatch in the shape's own fill colour - the cheapest trust device there is, and it
works for a reader who has never heard the word binding. A machine-looking layer id (`q_bg`) is
replaced by colour and kind ("Tan plate"); a designer who named the layer "Question plate" sees
that.

### The preview overlay

Drawn only while a row is hovered or its strip is open, and it replaces the axis-aligned amber
rectangle, which reads as a box around the wrong thing on rotated artwork:

- **the box**, tinted 12% amber on the shape ITSELF (a class carried in through the canvas
  protocol), so rotation is free;
- **the inside**, a dashed line at the drawn insets mirrored, with the two figures. This is the
  room, made visible;
- **the text bounds**, a thin line around the current block. The gap between it and the dashed
  line is how much room is left;
- **the alignment caret** under the block at its anchor, with the word.

### Correcting a wrong box

The field's strip opens with the box: a dropdown of every shape that contains or touches the
text, plus "None. The text sits on the artwork.", and a "point at it on the artwork" button that
arms the existing pick mode. Dragging a row between groups was rejected - undiscoverable, and
awful to drive from a spec.

### Alignment

A nine-dot reference-point grid, the widget every Illustrator user has already used, in the fit
strip. One click sets both axes. Horizontal decides which edge the text fills from; vertical
decides where a wrapped block sits in a fixed box and which edge stays put when the box grows.

The default is read from the drawing: compare the drawn insets on the two sides; centred if the
two centres are within 5% of the box on that axis, otherwise aligned to the smaller inset. It is
emitted as real `text-anchor` plus an `x` at the box's inside edge or centre, and wrapped tspans
restart there - which is what answers "even if we have room to the right, we can't have that
because then we have too much room on the left".

**Centring SNAPS to the box's real centre** (owner, 2026-09-02): *"that just usually looks better."*
A question drawn 36 px off centre is moved onto the centre, and both a short and a long value then
sit where a designer would have put them.

**In the box's OWN frame, not the screen's.** His plates and their text are all on a slight angle,
deliberately - *"my design here is wonky on purpose to see how we manage it when we import it."*
Every measurement and every anchor is taken in the box's local coordinate system, so the tilt is
carried for free rather than being a case to handle: a centred line on a plate turned 3 degrees is
centred along that plate. Doing this in screen axes would straighten his board, which is the one
thing an import must never do.

**And the nudge he drew is kept as a number, defaulted to zero.** His follow-on question is the
real one: *"what if you want to have the text a little bit to the right, and it would fit the
design?... There should be a way to customize anything."* The answer costs no new mechanism,
because the offset is already in the file: alignment is an ANCHOR plus an OFFSET along each axis,
measured at import as the distance between where the text was drawn and where the anchor puts it.
The offset defaults to **zero**, which is the snap he ruled for. The alignment strip shows it only
when the file actually has one, as one line under the grid:

```
  Aligned   o o o        centred, middle
            o * o        read from your drawing
            o o o        [ ] keep the 36 px nudge to the right that you drew
```

Ticking it restores his intentional wonk, and it survives wrapping, shrinking and growth, because
the offset rides the anchor rather than the value. Untouched, nothing about it is on screen. He
asked for this NOT to become a project - *"this is also something that is not breaking our system,
so I do not want to make a big issue out of this because we have bigger fish to fry"* - and it
does not: one measured number per axis, one checkbox that appears only where it applies.

### Growth, per box

Growth sits on the box header row as one select: stays as drawn / gets wider / gets taller / gets
wider, then taller. The values are today's ladder; what changes is that the shape is never asked
for, because the row is the shape. Per box, so one plate may grow while its neighbours stay.

The limit is a dashed cap line on the preview, defaulting to the design's own margin mirrored
(`svgGrowCap` today) and labelled in the reader's terms ("same margin as the top"). It can be
dragged, but never past the frame's safe margin and never inside the box as drawn, so a wrong
value is unreachable rather than warned about. For a taller box the label also says how many
lines the cap buys at the drawn size - the owner's "we shouldn't be able to put one page of text",
derived from the cap rather than asked as a second question.

Today's "What else moves" list is kept, unchanged in mechanism, nested under the box that grows -
and it is a list of WHICH layers, never of how each one behaves. That second half is settled below.

### What travels is not a question - settled 2026-09-06

The owner, on 2026-09-05, about the per-layer picker each listed follower carried ("Moves out of
the way" / "Grows by the same amount"):

> I feel like this option seems unnecessary. I think it might even just be more confusing to get
> these options ... when the question becomes long and the box gets bigger, everything else should
> just move out of the way.

**Settled with the corpus rather than by taste.** Every fixture in `e2e/fixtures/svg-corpus/` was
marked up with the real importer, rendered at design size and swept over every panel a reader could
pick as the grower against both axes - 172 combinations - running `proposeFollowers`, `canStretch`
and `svgCollectSpanners` unchanged from the source they live in:

- **79** follower rows carried the question;
- **35** of those even offered the second answer (the other 44 are groups, pictures and outlines,
  which cannot stretch and were already move-only);
- **0** of them were a layer that should stretch.

Zero is structural, not a property of this corpus. **A row in that list is a layer drawn PAST the
growing edge; a layer that must stretch is one drawn TO BOTH of the panel's edges** - a rail down
its side, a tint band behind it. The two sets cannot intersect, so the question was asked exactly
where its second answer could not be right. The artwork that genuinely stretches is real and
common - 31 such layers across 23 of the 46 importable fixtures - and it never needed the control:
`svgCollectSpanners` measures those at play time and grows them, in the same breath as the end caps.

**So the picker is gone and the row states its answer.** Stretching stays reachable and is not
equal weight: it happens by itself where the artwork asks for it, and a pro writes `mode: 'grow'`
in the `NOACG_LAYOUT` table, which the generated code documents in place.

One defect came out with it. Spanners were collected only while a rule carried NO declared follower
list, so the moment a reader edited that list - dropped a strap, added a layer - the rail on their
lower third silently stopped growing with its plate. It is collected always now, exactly as end
caps are, and a declared entry still wins.

### The guardrail, said once

**Text never paints outside its box, and a box that stays as drawn moves nothing.** A box that
grows moves exactly the layers listed under it, by exactly the amount it grew. That is a stronger
promise than a warning, and it is the whole of what a student needs to know.

What of the ladder is visible: the gap to the dashed line (fill), the moving box with a ghost of
the drawn one and the cap (grow), a live fit line under the Text input counting lines and the
size ratio (wrap, shrink), and an amber "too long, cut about 20 characters" tag (report). The
squeeze stays invisible machinery.

### Zero interaction

A student who ticks nothing gets: every text in the smallest drawn shape that holds it, aligned
the way they drew it, room = the box's inside less their own margins mirrored, every box staying
as drawn except the existing measured lower-third default, and text that wraps inside its box
before it shrinks. Nothing outside a fixed box ever moves. On the fixture that is a long question
wrapping to two or three lines in the tan plate with the answers exactly where he drew them.

## What it costs the formats

`NOACG_LAYOUT` gains an alignment pair per line and a cap per rule, and the growth rows become
per-box rather than one per graphic - all additive, so version 1 survives
(`root/version-every-persisted-format-ship-breaking`). The
draft holds, per field, a box id or none plus alignment with an `authored` flag; per box, growth,
cap and followers.

`docs/SVG_IMPORT_PLAN.md` §6b's "ONE FIT for the whole graphic" survives as a MEASUREMENT rule
(one measure, one fit, one apply, never iterated). What ends is one ANSWER for the whole graphic.

## Plan

1. ~~D1, D2, D3 and the alignment model~~ - DONE 2026-09-02. Alignment is DERIVED and EMITTED at
   runtime, with nothing stored and no UI: the file already says how the designer aligned each
   line, so nothing has to be asked and no persisted format moves. What is left of this step is
   the step SHOWING it, and the override.
1b. ~~The vertical snap, the repeat rule, and the untick question~~ - DONE 2026-09-02 evening.
   The three rulings given after step 1 was walked. Each is written up in its own section below.
   None of them stores anything either: the snap is a `dy`, the repeat rule is a measurement of the
   artwork, and the untick answer is a wizard choice that emits one CSS rule.
2. The derived box binding, shown: grouping, the swatch, the overlay. No new controls - just the
   step admitting what it already decided.
3. The alignment CONTROL: the nine-dot grid, the "read from your drawing" label, and the checkbox
   that hands back the nudge the file recorded. `align.nudge` is measured already and nothing
   reads it yet, which is deliberate - it is the whole cost of the wonky-on-purpose case.
4. Growth per box, with the cap line.
5. The fit line and the too-long tag.

## THE FIT DOCTRINE - why a graphic does what it does

**Owner, 2026-09-02, and this is the section to read before touching any fit rule:**

> I don't want to test every single graphic and explain how I want each one to be. We need to find
> the "why." Why will a graphic do something, and when will text wrap? When will text be centered?
> When will text be left-aligned? When will text create new rows?

His answer, in his own order.

### 1. Grow the box before you shrink the type

> When possible, we want to make the box bigger, allowing the text to go to new lines so we don't
> make the text smaller. However, if the box can't get bigger, then we have to make the text
> smaller. Additionally, when we can no longer increase the size of the box, we should also make
> the text smaller.

That is the ladder we already have, stated as a preference rather than a sequence: **shrinking is
the last resort, not the second rung.** It also settles the thin answer plates on his quiz board -
a plate 120 units tall cannot take a second line and must not grow, so its text shrinks, and a very
long answer is simply going to be small:

> Since the box is so thin, I think the only solution we have is that the text becomes smaller
> because it can't go outside of the box.

### 2. A box is a promise, and text stays inside it

> Any text that has a box around it needs to stay in the box, because that's kind of the purpose of
> the box.

Near-hardcodable, and already true of the ladder (nothing may paint outside its panel; past the
readability floor the block is squeezed). What is new is that it is now a stated PRINCIPLE rather
than a consequence, so anything that would let text leave its box is wrong by definition.

### 3. A graphic that comes up REPEATEDLY keeps a fixed box

This is the rule that decides the quiz, and he arrived at it himself:

> When we have a graphic that comes up many times in a row, like in a quiz question where the
> question changes or a poll result or something, then the text part where the question is - that
> box can't change for every different graphic, because it might look weird if it changes all the
> time. That should be the default behavior for quizzes and polls.

> For specifically a quiz page, it should not grow, because a quiz page should be the same for each
> question. It can't live depending on how long the text is.

So the axis is not the graphic's SHAPE, it is whether the audience sees the same graphic again with
different content. A board the viewer sees ten times in ten minutes must not breathe between
questions; a strap they see once may be cut to its content.

**BUILT 2026-09-02** (`repeatsWithNewContent`, the mapping step). What says "the audience sees this
again" on the artwork itself, before anybody picks a behaviour: **a REPEATED ROW - two or more
plates of one size, standing apart from each other, each holding its own editable line.** That is
what a quiz board, a poll board and a scoreboard look like; a lower third draws ONE band and stacks
its lines inside it. Three conditions, each of them a case that reads as a repeat and is not: the
sizes match within a tenth (hand-drawn plates are never identical, and every one of his carries its
own rotation); the plates stand APART (a filled plate and the outline path tracing it are the same
rectangle twice, which his board draws for every plate); and each holds a line (two identical rules
under a name are decoration). The board's own backplate is left out by area - it holds every line
there is.

**WHICH shape and WHETHER it grows are asked separately.** A board still proposes its question's own
plate, so a reader who overrides the ladder lands on the plate their text is in rather than the
widest rectangle on the board. It simply does not grow it unasked. Measured against the whole
exporter corpus, the rule moves exactly one file - his - and the nine that grow still grow
(`e2e/import-svg-corpus.spec.ts`; the fixture's sidecar carries the superseded `grow-y` claim and
why it changed).

### 4. A graphic seen ONCE may grow with its content

> For lower thirds, and maybe text boxes in general where you want to just inform something, it
> might grow with the amount of text you have.

Which is the catalog's existing HUG/FIXED split (`docs/FOOTPRINT_STABILITY.md`) reached from a
different direction, and agrees with it. This doctrine is that split's missing WHY.

### 5. Where the criteria are unclear, let it be CHOSEN ONCE

> It's a hard choice to choose what the criteria are for this, so it would be good if one could
> just choose it once for a design, and then it could stay that way.

The wizard already has that control ("When the text is too long"). What is wrong is only its
DEFAULT, which today proposes growth for a board that must not grow. Rules 3 and 4 give the
default; the control stays for the cases the rules read wrong.

### 6. Alignment follows the graphic's place in the frame

> In the lower third, if it comes to the left corner, it should most likely be left-aligned. The
> actual lower third box could vary in length according to the text, and there might be a fixed
> length for the box; however, it is seldom that the text will be centered there.

The derived alignment (`svgAlignOf`) already answers this without being told, because a strap's
text is drawn against the left of its band and the derivation reads the drawn insets. Worth
CHECKING on a real lower third rather than assuming - it is the one prediction this model makes
that has not been measured.

### 7. The answer depends on the artwork and the value, and on nothing else

Added 2026-09-04, from the owner's walk of his own board on production: the same question in the
same graphic came out right or wrong depending on what he had toggled beforehand, and toggling the
behaviour back and forth a few times eventually recovered it.

> There's something funky going on with the wizard there. It seems to be very difficult to get the
> text working as it should.

Rules 1 to 6 all say what the ladder should DECIDE. This one says what it may decide it FROM, and
it is the rule the other six are worthless without: an answer that moves when nothing about the
artwork or the value moved cannot be reasoned about, taught, or gated.

The concrete thing it forbids is **recording a measurement nobody could take**. Every number the
ladder uses is read off the laid-out design, and the design is not always laid out when the
document runs - a playout renderer preloads its templates before anything is on air, a control
page holds its monitors in a `display:none` column while the operator is on another workspace, and
a drawn state is `display:none` from the first frame until its state fires. All of those measure
zero. Recording the zero turned "I have not measured this yet" into "this line has no room",
which nothing downstream could tell apart and no later pass could undo, so the line was skipped
for the life of the graphic and painted at its drawn size on one line, across the artwork.

So a line with no box records nothing and stays OWED; the ladder re-measures while anything is
owed, a drawn state pays its own debt the moment it appears, and a design that gains a box with no
`update()` to prompt it refits on its own. `svgFitLaidOut` and `svgFitUnmeasured` in
`src/templates/importedDesign/svg.ts` are the two functions this rule lives in.

The gate that follows from it is not "walk the ladder harder": every existing ladder gate built
its document on a surface that was on screen, so all of them were green throughout. It is to mount
the SAME document twice, once visible and once out of sight, and assert the two agree
(`e2e/import-svg-corpus.spec.ts`).

## Owner rulings, 2026-09-02 evening

Given after seeing the built behaviour. The first is a correction to what shipped; the second
opens a distinction the design had folded into one word.

### 1. A centred block snaps on BOTH axes

> I think by default a centered text should snap both vertically and horizontally.

**BUILT 2026-09-02.** `svgAlignOf` measures `align.snapY` - the distance from the drawn block's
centre to the box's - and `svgPaintLines` adds it to the first line's `dy`, beside the rise that was
already there. Measured on his board: 9 units, and the block now sits on the plate's middle at one,
two and three lines. Three consequences worth knowing:

- **A one-line value may now carry a tspan.** A plain text node has no `dy` to ride, so a single
  line that is being centred is painted as one marked tspan instead. Everything else still emits
  plain text, which is what keeps a graphic that neither wraps nor snaps identical to the artwork
  the designer exported.
- **The room is measured about the BOX's middle**, not the height the block happened to be drawn
  at - that is where it now stands. On his plate that is 216 units of room rather than 198.
- **Only a MIDDLE line.** Text drawn against the top or the bottom of its box was composed against
  that edge, and moving it would invent a centring nobody drew. The drawn offset is kept as
  `align.nudgeY`, for the same checkbox `align.nudge` is waiting on.

### 2. BLOCK alignment and LINE alignment are two different questions

> A few buttons to choose how our text is aligned with the background box is one thing, and then
> the actual text alignment is another question.

He is right, and the design above only names the first:

- **Block alignment** - where the text block sits in its box. Left, centred or right; top, middle
  or bottom. This is what is built.
- **Line alignment** - when a block wraps, how its lines sit relative to EACH OTHER. Flush left
  with a ragged right edge, or every line centred on the block.

Today the two are welded: a centred block also centres every line, because the anchor is emitted
as one `text-anchor` that each wrapped tspan inherits. His tentative answer for the second:

> If we get a text that does not have two lines, how do we resolve it when it goes on the second
> line? By default I think it should be left aligned, but of course if you want, it should also be
> center aligned... in a quiz at least, well, both can work, but I think the default could be left
> align, but then you could change it to be centered.

**Recorded as tentative, and NOT built, because it disagrees with what he has already seen and
liked.** The three-line question he walked was centred line by line and he raised no objection to
how it looked - so before this becomes the default, somebody should put the two side by side on
his own board and let him pick. That is a five-minute comparison, not an argument to have in prose.

### 3. Choosing the alignment in the app is wanted, and is not urgent

> It would be nice that you could, inside the app, choose, even after you have designed the text,
> if you want to snap to the left of the box, left-aligned or right-aligned. But that is quite an
> advanced feature, so if we have the possibility to center text and it looks good, that's already
> good.

So the control is the direction, and correct-by-default is the bar for the class on 2026-09-12.

### 4. "Are we building something twice if we still gonna have an editor later?"

No, and the reason is the first non-negotiable principle. The alignment is not held in a wizard
data structure that an editor would have to reimplement: it is derived from the artwork and
emitted as real `text-anchor` and `x` attributes in the template's own code. The editor edits
that code. A wizard control would write the same attributes the editor's user types by hand, and
the runtime reads only what is in the file. The one thing that WOULD be built twice is an
alignment stored beside the code as a second source of truth, which is exactly what
`docs/STATE_MACHINE_SCHEMA.md` and principle 1 forbid.

## Resolved 2026-09-02, after the side-by-side

**Line alignment: CLOSED, no work.** He was shown his own board with a wrapped question laid out
three ways - every line centred (today), the block centred with lines flush left, and the block
moved to the plate's left margin - at two and three lines, with the real wrap points and measured
widths.

> To be honest, all these look pretty good. If it can do any of these, I'm already happy. The one
> that I tentatively said to be default, the B one, actually doesn't look as good here because the
> second line is longer than the first one. Here I would stay with A, what it does today, every
> line centered. I think that is the best one of these, and to be honest, I can't even tell the
> difference between B and C.

So **centring a block centres its lines**, and the two stay welded. He could not distinguish the
flush-left variants at all, which is the useful finding: the distinction the design was preparing
to spend a control on is invisible on real artwork. Being able to CHANGE the alignment is still
wanted and goes to the backlog, not the push:

> Of course, with moving the text field and choosing alignments, it would be nice for the customer
> user to have the ability to change it. However, that might be a thing for the backlog. The
> important thing is that we don't want to break this; if this works for the quiz, then this is
> good.

**The vertical snap: BUILT 2026-09-02 evening, and it still needs the look.** He ruled "snap both
axes" before seeing anything. Every board in the side-by-side he then approved was rendered at the
CURRENT vertical position, 9 units above the plate's true centre - so building the snap changes the
thing he just said was best. Both are in front of him in the queue item; do not treat his approval
of A as approval of the unsnapped vertical, and do not treat this note as him having looked.

## Open

- **Re-entering the wizard for a graphic that has since been hand-edited** - the second of the two
  smaller ones from the same walk, still in the queue item rather than here. The first (what
  unticking a field should do to the text it leaves behind) was BUILT on 2026-09-02: the step asks,
  keeping the words as drawn is the primary answer, and a removed layer is hidden by one CSS rule
  rather than deleted. Removal is never automatic - *"what if it's there for a reason anyway?"*
- **How MXMZ handles a text that outgrows its box** (owner, 2026-09-02, wondering aloud). Their
  public site was checked the same day and says nothing about it: it sells "pure SVG & HTML",
  Illustrator and Figma import, layers and JSON data binding, and puts the editor behind
  `app.mxmz.com`. So the question can only be answered from inside their editor or by watching one
  of their live graphics take a long value. Worth one narrow look before step 3 is built, not a
  study.

The full UX write-up this is condensed from was produced by Fable on 2026-09-02 at the owner's
request ("here we should use Fable to really think about a UX/UI that would make it intuitive").
