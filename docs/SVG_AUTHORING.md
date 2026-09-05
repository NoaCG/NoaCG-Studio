# Making an SVG that imports well

Draw your graphic in Illustrator, Figma or Inkscape. Export an SVG. Drop it into NoaCG. Your text
layers turn into fields the operator types into. Nothing is redrawn. What you drew is what goes on
air.

This page is for the person holding the design app. The engineering contract is
`docs/SVG_IMPORT_PLAN.md`.

**Where to drop it:** `/app` -> **New graphic** -> **Import graphic** -> the drop zone.

**Try it first.** Twenty-three files in [`svg-samples/`](svg-samples/README.md) are ready to drop -
one for almost every kind of graphic the catalog has, and each one teaches a single thing about
importing. The README there says which, file by file, and they open in Illustrator so you can keep
working on them.

Start with `lower-third.svg`: three text layers, all named, nothing else going on. Then
`scorebug.svg`, which shows every field the import can propose - numbers, a countdown clock, a
picture layer, the `f:` prefix and two labels placed apart on one baseline - and `quiz-board.svg`,
where each moment of the graphic is drawn as its own hidden layer.

---

## 1. Five rules

1. **Give the file a size.** It needs a `viewBox`, or a `width` and a `height`. A file with
   neither is refused. That size is the space every field is measured in. Illustrator writes one
   under *File > Export > Export As > SVG*. Turning "Responsive" on drops the width and height,
   which is fine as long as the viewBox is there.
2. **Keep text as text.** Every `<text>` layer becomes a field. Text turned into outlines cannot
   be edited. Section 5 says what happens then.
3. **Name your layers.** Layer names become the labels the operator reads. "Home team" beats
   "Rectangle_3". Nothing else is asked of you.
4. **Embed your pictures.** A linked image points at the internet, so it is stripped on the way
   in. An exported graphic has to play with no network. Export with images embedded.
5. **Do not animate in the design app.** SVG animation (SMIL) is removed, and the import says so.
   Add the motion in NoaCG's Animation step. The timeline and the playout server drive it there.

## 2. Sizing the artboard

- **1920x1080, transparent background.** The safe choice. Artwork the size of the frame lands
  exactly where you drew it.
- **A smaller artboard** (a 1040x190 lower third, say) comes in as a floating object. The wizard's
  zone picker places it. Handy when the same bug goes in different corners.
- **Millimetres, points or inches are fine.** Inkscape defaults to millimetres, and so does most
  print software. The file is read at its real size, not at the bare number in it. A
  338.67 x 190.5 mm page is a 1280 x 720 graphic.

Your artwork sets the size of the graphic. NoaCG never rescales your geometry behind your back.

## 3. What each layer becomes

| In your file | In NoaCG |
|---|---|
| `<text>` with plain content | one text field, bound in place |
| one text object you pressed Return inside | **one** field. NoaCG re-wraps it into the room you drew |
| two separate `<text>` objects | two fields, however they line up. Separate objects is you saying so |
| two labels apart on one baseline | two fields. The gap between them is what says so |
| a line broken into runs by kerning or tracking | **one** field. The runs are one line, not three |
| text on a path | one field, and it keeps its curve when the operator types |
| text inside a symbol | drawn, but **not** editable. Every copy shows the same words |
| a plain number as the sample (`84`, `2`) | offers a **number** field |
| a clock as the sample (`12:00`, `1:05:00`) | the row asks: plain text, or a **countdown** whose field is its length in minutes. One countdown per graphic |
| `2 - 1`, `10 pts` | stays text. An SPX number box only holds digits |
| an embedded picture - placed on its own, or filling a shape you drew (which is what Figma exports) | a **picture field**. The operator swaps it, and clearing it brings your drawing back |
| a group of two or more glyph shapes | offered as **outlined text** (section 5), off by default |
| everything else: panels, rules, gradients, masks, filters | rides along exactly as drawn |

**One thing to say is one field.** A question, a headline, a paragraph of standfirst - one text
object, however many lines it takes in your design app. The operator gets one box holding the whole
of it, and NoaCG decides where the words break on air, at the size and the width your artwork gives
them (section 4). Where you pressed Return is where the words fell at the size *you* were looking
at, and it is not what the next value will need.

So **do not draw a paragraph as one text layer per line.** Three layers called "Body line 1", "Body
line 2" and "Body line 3" are three fields, because three separate objects is you telling NoaCG
they are three separate things - and the operator then has to break their own sentence across them
by hand. It is one of the few ways to make the import do the wrong thing on purpose.

If you really do want two lines that never re-flow into each other - a name over a role, a heading
over a strap - draw them as separate objects. That is the same rule read the other way.

**Name layers for the operator, not for you.** The name is what they read on air. Two layers both
called "Name" arrive as "Name" and "Name 2". You can read that. It tells the operator nothing.

The label comes from the nearest named thing: the layer itself, else the closest named group
around it. Illustrator's escaping is decoded, so `Home_x20_team` arrives as "Home team". Inkscape
layer labels are read too. A name the editor generated (`text123`, `layer1`) counts as no name, so
the named layer above it wins.

**Two kinds of layer are never offered as fields.** Both still ride into the graphic as drawn:

- **A layer you switched off.** Hidden copy is a draft. A field for text nobody can see is worse
  than no field.
- **Text inside a symbol or `<defs>`.** It only paints where a `<use>` copies it, so binding the
  original is a promise the import cannot keep. Put editable text on the artboard.

**Shortcut:** start a layer name with `f:` or `field:` (`f:Competition`) to mark it editable. The
prefix is dropped from the label. Useful if your organisation wants one convention. It is never
required, and it switches nothing else off: every text layer is offered ticked either way. On a
**picture** layer it does more, because a picture arrives unticked. Inside a design a picture is
usually part of the artwork.

## 4. Fonts, and text that is too long

### Fonts

An SVG names its fonts (`font-family="Gotham"`). If the playout machine does not have that family,
your graphic will not look like your design.

So the import lists every family it finds. For each one it matches a bundled face, offers the
Google Fonts library, or takes a font file you upload for a licensed face. A Google family is
fetched while you design and **embedded**, so the exported code never touches the network.

A family nothing matches gives a warning and carries on, because you may know the playout machine
has it. The Finish step names it again. That is the last screen before the graphic is made.

**PostScript names are understood.** Illustrator writes the face, not the family:
`Archivo-Bold`, `JetBrainsMono-Regular`, `HelveticaNeue-CondensedBold`. The suffix gives the
weight, the rest gives the family, and spelling does not matter, so `JetBrainsMono` finds JetBrains
Mono. The font still ships declared under the exact name your artwork asks for.

A family Google does not carry says so on its row and points you at the upload. It will not offer
a download that could only fail.

**Pick a family you can hand over as a file, or one of the bundled or Google faces.**

### When the operator types more than you drew for

SVG text does not wrap and does not clip. So the code has a ladder, and it climbs it in this
order:

1. **Fill the shape** the line was drawn in.
2. **Grow the panel**, if you asked for that.
3. **Wrap** onto another line.
4. **Shrink**, down to 55% of your type size.
5. **Squeeze** the letters narrower, and tell the operator the text is too long.

Nothing is cut, and the artwork is never reshaped to make words fit. Step 5 is deliberately ugly
and it goes away the moment a shorter value arrives.

**What that means when you draw.** A line's room is the **panel behind it**, out to a right margin
the same size as the left one you drew. So a short name in a wide banner can grow to most of that
banner at full size.

**Every gap you drew is kept.** Wrapping never eats the space between a line and what you drew
under it, and never runs onto the panel's bottom edge. It only uses room the panel gains by
getting taller. So a name with a role right under it wraps only if you let the panel grow. A
question alone on a board wraps into the space you left below it. Leave vertical room where you
want wrapping, and none where you do not.

**Or let the panel grow.** On the mapping step, "when the text is too long" has four answers: the
panel gets wider; the panel gets wider, then taller; the panel gets taller; the panel stays the
size you drew. Every one of them wraps the text and shrinks it if it still will not fit - what you
are choosing is how much room the panel offers first. You also pick which rectangle grows, and the widest one is proposed. It widens
at your full type size, anything you drew past its right edge travels with it, and it stops inside
the frame's safe margin.

**A panel grows away from the frame edge you composed it against.** A lower third near the bottom
gets taller upwards, so the edge you lined up stays put and the lines under the wrapped one never
move. A band across the top grows downwards, for the same reason. Anything you drew onto the
panel's own edges, an accent rail down its side, grows with it.

**Sideways, your text decides which way.** A panel holding text set against its left edge widens
to the RIGHT, because that is the only side those lines gain anything from. A panel holding text
you CENTRED widens from its MIDDLE, both ways at once, because centred text fills both ways and a
panel that slid one way would leave its own composition behind. It stops at whichever margin it
reaches first, so the offset you drew survives the growth. You do not choose this and there is
nothing to set: it is read off where you put the type.

**Draw your panel the way you want it read, tilt included.** A plate turned on an angle grows
along its own edges, not the screen's, so a board composed on a slant keeps its slant. That holds
for a plate drawn as a portrait rectangle and rotated flat, which is what most design apps write
when you turn a shape.

That is what a lower third wants. A board or a scoreboard wants the default, because its layout
*is* the design.

**A graphic played as one of a SEQUENCE keeps its box.** A quiz board, a poll, a scoreboard: the
audience sees the same graphic again with different words in it, and a box that breathed between
items would read as a different graphic each time. So those keep every plate exactly as drawn and
fit the text inside it - fill the box, wrap onto as many lines as the box has room for, and only
then get smaller. Nothing about the category decides this. It is read from the BEHAVIOUR you
attach, and from the artwork itself where you attach none: two or more plates of one size,
standing apart, each holding its own line, is a repeated row.

**Leave the box room for the lines you might need.** The corollary of a fixed box is that the
words have to fit inside it, so a question plate drawn tall enough for one line will get a
smaller second line rather than a taller plate. Draw the plate for the longest item you expect,
and the type stays the size you set for every item shorter than that.

**A panel can be a picture as well.** If the shape you want to grow is the one you dropped a
photograph into - a full-bleed guest card, a photo strap - you get both: a picture field the
operator can swap, and that same shape in the list of shapes that grow. You never have to pick
one. On the artwork, clicking it ticks the picture and dragging it sets the direction it grows.
**The picture stretches with the panel**, because that is what your design app wrote: the
photograph fills the shape's box, so a wider box means a wider photograph rather than more of it.
A texture, a gradient wash or a blurred backdrop takes that without anyone noticing; a face does
not. If the panel behind a face has to grow, draw the face as its own shape beside it.

**Draw the panel as a rectangle if you want it to grow.** Rounded corners are fine. So is the
`<path>` Illustrator writes a rounded rectangle as. Any shape whose geometry reads as a rectangle
counts, and it grows by its straight middle, so your corner radii stay exactly as drawn. A truly
freeform shape has no width to change. A narrow decoration at the panel's far end, an end cap or a
closing bar, is read as the panel's own furniture: text stays off it, and it travels with the edge
when the panel grows.

## 5. If the text was converted to outlines

Outlined text has no text node to bind. So the import offers each glyph group as an **outline
row**: a group of two or more path or polygon shapes. Up to 24 rows are listed, named layers first.

Tick one and that drawing is hidden. It is never deleted. A real editable line is placed over its
measured box, matching the original's position, cap height and fill.

This is the fallback, not the good road. The stand-in is re-rendered type, so the kerning is the
font's and not yours. **Re-export with live text where you can.**

Rows that read as a line of type, several glyphs on one baseline in a wide box, are listed first.
The rest are marked "looks like artwork" so you can skip the crests and icons. Nothing is hidden
from you: a two-letter logotype really can be the text you want editable.

## 5b. Drawing a graphic that DOES something

A graphic can carry behaviour the operator drives live, with real buttons on the control page.
There are four: a **quiz**, a **score tracker**, a **live vote** and a **countdown**. You draw what
each moment looks like; NoaCG decides when each one is on. Your artwork is never redrawn.

**The three rules that apply to all of them:**

- **Draw the base look first.** The panel and the text layers, and nothing else. That alone is
  enough: pick the behaviour in the Fields step, fill in the pickers, and the graphic already does
  its job. It simply shows nothing extra while it does.
- **Hide the moment layers in your design app.** Click the eye off. That is how you keep seeing
  your own artwork while you draw, and it is what the import expects. A hidden layer is offered to
  the behaviour pickers *because* it is hidden. Hidden text is still skipped as a field.
- **Put the words last.** SVG has no z-index. Whatever comes later in the file paints on top. Draw
  a highlight after the text and it covers the word it was meant to highlight. Keep the panels and
  the moment layers below, and the text at the top of the stack.

**Any hidden layer can be a switch or part of a choice, with no behaviour at all.** Hide a layer and
name it `show:Sponsor`, and the operator gets Show Sponsor and Hide Sponsor. Hide two or more and
name them `choice:Status/Live`, `choice:Status/Replay`, `choice:Status/Standby`, and the operator
gets one button per option, with one look showing at a time. Both work beside a quiz or a score
tracker on the same graphic, and both are offered in the Fields step on every hidden layer that
nothing else claimed, so the names are a shortcut here too.

**Naming is a shortcut, not a rule.** Every layer below is a picker in the Fields step, so a file
whose layers are called "Group 7" still works. Name them the way the tables say and the binding
arrives filled in, and you change nothing. The row number or letter has to stand as its own word:
`Score 1` is row 1's, `Score 10` is not, and a layer called just `Score` belongs to no row. A name
is read the same way whichever behaviour it belongs to, and the behaviour NoaCG proposes is the
one the names carry the most evidence of - a board with option rows AND bars is a vote, one with
option rows and a drawn pick is a quiz. The tables are generated from the same word list the
import reads, so what this page teaches is what the import understands.

### The quiz — select, lock, reveal

Copy [`svg-samples/quiz-board.svg`](svg-samples/quiz-board.svg). Draw the panel, the question and
one text layer per answer, then the moments:

<!-- behaviour:quiz:start - generated by scripts/behaviour-docs.mjs from src/templates/behaviours/words.json; edit the JSON, then `npm run write:behaviour-docs` -->
| Layer | Name it | What it is |
|---|---|---|
| question | `Question` | always - it is a field the operator types |
| answer (one per row) | `Answer A` | always - a field |
| selected (one per row) | `A selected` | while that answer is the pick |
| correct (one per row) | `A correct` | on the reveal, if it is the correct answer |
| wrong (one per row) | `A wrong` | on the reveal, if it is not |
| locked in | `Locked in` | once the answer is locked (one, whole board) |

`Vastaus A` works as well as `Answer A`; `A picked` works as well as `A selected`; `A right` works as well as `A correct`.

Two to six answers. The operator gets Select answer, Lock it in and Reveal correct.
<!-- behaviour:quiz:end -->

### The score tracker — a point, a flash, full time

**Two or more teams**, however many you drew. A row is a team name and a figure.

<!-- behaviour:score:start - generated by scripts/behaviour-docs.mjs from src/templates/behaviours/words.json; edit the JSON, then `npm run write:behaviour-docs` -->
| Layer | Name it | What it is |
|---|---|---|
| team (one per row) | `Team 1` | a field the operator types |
| score (one per row) | `Score 1` | a field - draw a plain number in it |
| flash (one per row) | `Flash 1` | shown for the moment that team's point lands |
| full time | `Full time` | once the game is called (one, whole board) |

`Side 1`, `Player 1`, `Joukkue 1` work as well as `Team 1`; `Points 1`, `Goals 1`, `Team 1 Score` work as well as `Score 1`; `Goal 1`, `Scored 1` work as well as `Flash 1`; `Final`, `Game over` work as well as `Full time`.

Two to eight teams. The operator gets a +1 and a −1 under each team's own name, plus Clear flash, Full time and New game.
<!-- behaviour:score:end -->

**The score layer must hold a plain figure** — `0`, `12`. That is what makes it a number field
(section 3), and a `+1` button can only move a number. `2 - 1` and `10 pts` are text however they
look, and the Fields step will say so rather than letting you build a board whose buttons do
nothing.

The `−1` is the correction for a mis-press: it takes the point back and the flash down. New
game puts every score to zero and undoes full time. You can also just type a score into its box —
that is the road for when you have lost track rather than fumbled.

**Home and Away boards work too**, they just are not proposed for you: a board with two rows called
`Home` and `Away` needs one pick per row in the Fields step. The numbering is what tells NoaCG a
board is a score tracker rather than a versus card, and a wrong guess would be worse than none.

### The live vote — the room votes, the bars move

The counts come from a real audience voting at your join link, so most of these layers are things
NoaCG **writes into** rather than fields anyone types.

<!-- behaviour:vote:start - generated by scripts/behaviour-docs.mjs from src/templates/behaviours/words.json; edit the JSON, then `npm run write:behaviour-docs` -->
| Layer | Name it | What it is |
|---|---|---|
| question | `Question` | written from the round |
| option (one per row) | `Option 1` | written from the round |
| bar (one per row) | `Bar 1` | draw it at its FULL length - that length is 100% |
| percent (one per row) | `Percent 1` | appears with the result |
| winner (one per row) | `Winner 1` | only on the row that won, and never on a tie |
| total votes | `Total votes` | written from the round |
| vote badge | `Vote badge` | while voting is open |

`Choice 1`, `Answer 1`, `Vaihtoehto 1` work as well as `Option 1`; `Palkki 1` works as well as `Bar 1`; `Share 1`, `Osuus 1` work as well as `Percent 1`; `Voittaja 1` works as well as `Winner 1`; `Ääntä` works as well as `Total votes`; `Äänestä` works as well as `Vote badge`.

Two to eight options. The operator gets Close voting, Show result and Call the winner.
<!-- behaviour:vote:end -->

**A bar is the one layer you draw at an extreme rather than as a moment.** It has no separate
looks — it has one length per share — so draw it full and NoaCG scales it. Everything else in the
table is either written into or switched on and off.

**A layer the vote writes stops being a field the operator types into**, and the Fields step says
which. Two writers on one layer is a graphic whose operator watches their own typing be
overwritten.

### The countdown — it starts on air, and you hold it

For a question timer, a break clock, a holding card counting down to the start.

**Draw the clock as a text layer reading a time** — `5:00`, `0:30`, `1:05:00` — and in the Fields
step set that row's kind to **Countdown**. That is the one thing this behaviour cannot run without,
and it is the same choice section 3 describes. Picking Countdown as the behaviour sets it for you
on the first clock-shaped layer it finds.

<!-- behaviour:countdown:start - generated by scripts/behaviour-docs.mjs from src/templates/behaviours/words.json; edit the JSON, then `npm run write:behaviour-docs` -->
| Layer | Name it | What it is |
|---|---|---|
| clock | anything | the readout - set its row to Countdown |
| timer bar | `Timer bar` | draw it at its FULL length - that length is the whole count |
| warning | `Warning` | the look the final seconds wear |
| paused | `Paused` | while the operator is holding the clock |
| time up | `Time up` | once it reaches zero |

`Drain`, `Aikapalkki` work as well as `Timer bar`; `Last stretch`, `Hurry` work as well as `Warning`; `Hold`, `Tauko` work as well as `Paused`; `Expired`, `Finished`, `Aika loppu` work as well as `Time up`.

The operator gets Start, Pause and Reset.
<!-- behaviour:countdown:end -->

**The count starts when the operator Takes the graphic** and holds at 0:00 until they take it out.
They get Start, Pause and Reset. Reset puts the clock back to the top without counting, which is
also how you get a "3, 2, 1, go" — Reset, then Start.

**The length is a field**, in minutes, so it is typed into the cue like any other value and can be
corrected while the graphic is on air. Beside it sits **Warn at (seconds)**, which is when the
`Warning` layer comes up; it starts at 10.

**A bar is drawn at an extreme, not as a moment** — the same rule as a vote board's bars. It has no
separate looks, only one length per second remaining, so draw it full and NoaCG shortens it.

**One clock per graphic.** If you draw a second time layer, leave it as ordinary text.

## 6. Export settings, app by app

### Adobe Illustrator

*File > Export > Export As... > SVG*. Not "Save As", which writes a much heavier file.

| Setting | Value | Why |
|---|---|---|
| Styling | Internal CSS *or* Presentation Attributes | both are read |
| Font | **SVG** | "Convert to outlines" is what section 5 exists to survive |
| Images | **Embed** | linked images are stripped |
| Object IDs | **Layer Names** | this is what makes the labels readable |
| Decimal | 2-3 | smaller file, no visible difference |
| Minify | off | keeps the file readable in Advanced mode |

Name your layers before you export. Illustrator renames duplicates and keeps your spelling in
`data-name`, which the import reads first. Duplicate names are safe.

### Figma

Name the layers, select the frame, then *Export > SVG* with:

- **Include "id" attribute** ON. Without it every layer arrives unnamed.
- **Outline text** OFF. With it on you are on the outlines road.
- Flatten or rasterise nothing you want to stay editable.

### Inkscape

*File > Save As... > Plain SVG*. Optimized SVG also works, with **Embed raster images** on and
ID-shortening off.

Label your layers and objects. Inkscape keeps the label apart from the id, and the import reads it.
Do not run *Path > Object to Path* on text you want editable.

**Do not use flowed text**, meaning a text box you dragged out with the text tool. It exports as
`<flowRoot>`, a draft SVG element no browser ever implemented, so it is invisible in every
browser-based renderer. That includes NoaCG's preview and every export target. The import says so
when it sees one. Select it and use *Text > Convert to Text* before exporting.

## 7. Check this before you drop the file

- [ ] The artboard is the size you want. 1920x1080 for a full-frame graphic.
- [ ] The background is transparent, unless the graphic really is full-screen.
- [ ] Every editable headline is live text, not outlines.
- [ ] Layers are named the way an operator would say them, "Home team" and not "Group 12", and no
      two editable layers share a name.
- [ ] Pictures are embedded. Nothing links out to the internet.
- [ ] No SVG animation.
- [ ] The fonts are ones you can hand over, or bundled or Google families.

## 8. What the import always removes

Your file goes into previews, into exports, and into other people's libraries if you share it. So
on drop it loses `<script>`, `on*` handlers, `<foreignObject>`, SMIL animation and every
`http(s)://` reference.

Each removal is reported on screen. The import tells you what it did rather than quietly changing
your file.
