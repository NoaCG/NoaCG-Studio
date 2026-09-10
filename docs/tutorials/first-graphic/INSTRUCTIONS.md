# Instructions: your first graphic

What is on screen against each beat of `SCRIPT.md`. Written for somebody who has never used NoaCG,
so nothing here assumes you can find a control by name.

Every quoted phrase below was read off the frame beside it, not off the source, so you can search
the screen for it.

## Before you start

- **The frames are the truth.** `frames/` holds one screenshot per beat, captured from the product
  by the end-to-end test that drives this exact road. If a frame disagrees with a sentence here,
  the frame is right and this file is stale. Say so rather than working around it.
- **The frames were captured at 1280 by 720.** Record at that size or wider. Narrower and the
  wizard drops to its one-column layout, which is a different screen from the one in the frames.
- **The file being imported** is `scorebug.svg` from the NoaCG practice library, which `/docs`
  links from "Export settings, app by app". It is a football scoreboard: HJK against KuPS, 2 to 1,
  a clock reading 12:00, and a strap reading VEIKKAUSLIIGA / MATCHDAY 21.
- **Turn Advanced mode off** in Settings before recording. With it on, the Finish step grows a
  third door into the code editor that the script does not mention.
- **No account is needed** for any of this, so nothing on screen should show one.

## The beats

### Beat 1 - three doors
**Frame:** `step-1-import-door.png`

The studio opens on a headline, "Create live graphics. Run the show.", and three cards: **Start
from a template**, **Create with AI**, and **Import graphic**, which spans the full width
underneath the other two. A fourth strip, "Video or animation with AI", sits below them and is not
one of the three doors.

Show the panel whole for a moment, then click **Import graphic**. Its own line reads "bring your
own artwork in - no AI", and that is worth a beat on screen: viewers arriving with a drawing often
assume the AI card is the only way in.

### Beat 2 - the canvas, then the file
**Frame:** `step-2-drop-zone.png`

The Design step, "STEP 2 / 6" in the top right, with the six-step rail down the left: Start,
Design, Prepare, Text, Animation, Finish. Remember that rail. It changes in the next beat.

Two things carry this beat, in the order the script says them:

1. **PROJECT FORMAT** at the top: "Choose the canvas before artwork is measured and placed", with
   Authored aspect ratio, Canvas resolution and Project frame rate.
2. **The help line above the drop zone**, a pill with an amber "?" reading **Need help exporting
   SVG?** followed by "named layers, live text, one artboard".

**The frame shows that help line closed, because the walk that captures these frames does not open
it.** Open it in the recording, and hold long enough for the three rules to be read. If you want to
see what it looks like open before you record, `public/docs/svg-drop.png` in this repository is
that same panel, opened, at a larger size.

The drop zone itself reads "Drop your finished design here / A layered SVG is best. PNG, JPEG,
WebP, .html and .zip work too."

### Beat 3 - what it found
**Frame:** `step-3-what-it-found.png`

Drag `scorebug.svg` onto the zone. Four things change, and the beat needs all four:

1. The counter goes to **STEP 2 / 5**, and the rail loses Prepare and Text and gains **Fields**.
2. PROJECT FORMAT now reads "Remove the current artwork before changing its authored canvas", and
   its three controls are greyed.
3. A **YOUR DESIGN** block appears: "SVG artwork 1920 × 1080", "7 text layers found. Pick which
   ones the operator can retype, next step.", "Five steps now, not six: an SVG needs no erasing and
   no placing, so Prepare and Text became the one Fields step.", and "Typefaces: Archivo, JetBrains
   Mono, Inter".
4. The preview pane on the right fills with the scoreboard.

Hold on the layer count while that sentence is spoken. It is the line a viewer will need on their
own file.

Then press **Next →**.

### Beat 4 - fields
**Frames:** `step-4-fields.png`, `step-4b-what-it-does.png`, `step-4c-pictures-and-fonts.png`

The Fields step, headed "Choose what the operator can change", with "Tick what can be retyped.
Hover a row to see it in the preview." underneath. This is the longest beat and the most important
one, and **the step is about three screens tall**, which is why it has three frames.

**Top of the step** (`step-4-fields.png`): "EDITABLE TEXT   7 of 7 editable on air". The rows are
grouped under the panels they are drawn on, **Black plate** and **Orange plate**, each with its own
tick. Every row has a FIELD NAME box, a TEXT box holding the words drawn in that layer, and a
three-by-three ALIGNED grid with its answer written beside it ("left, middle", "right, middle",
"centred, middle").

Point at these three, in this order:

1. The **Home team** row, to make the point that the layer name is what the operator reads.
2. The two score rows, whose boxes are labelled **TEXT (NUMBER)**.
3. The **Match clock** row, which has an extra **BINDS AS** dropdown reading "Text" and offering
   Countdown.

**Scroll down** (`step-4b-what-it-does.png`): "WHAT IT DOES" reads "2 numbers, each with + and -",
and the behaviour dropdown reads "Nothing extra. The number layers already get + and -." That
sentence is the beat: the board already works and nobody chose anything. Below it, "WHEN THE TEXT
IS TOO LONG" reads "the panel stays the size you drew", which is what NoaCG read off this
particular artwork.

**Scroll to the bottom** (`step-4c-pictures-and-fonts.png`): "PICTURES   0 of 1 swappable on air",
with a **Home crest** row that is **unticked** - the only row on the whole step that arrives
switched off. Tick it on camera; that is the difference between an operator who can swap the badge
and one who cannot. Then "TYPEFACES   3 of 3 embedded in the template", with Archivo, JetBrains
Mono and Inter each marked "✓ Bundled with NoaCG".

Nothing else on this step is changed. Then press **Next →**.

### Beat 5 - animation
**Frame:** `step-5-animation.png`

DIRECTION (In and out / In only / Out only) above ANIMATION STYLE, whose note reads "click a preset
to watch it in the preview". **Fade** is already selected. The others are Slide, Pop, Zoom, Blur,
Wipe and Layer stagger; Slide and Wipe carry direction arrows. SPEED and EASING sit at the bottom.

Click one other card so the preview plays it, then leave Fade selected and press **Next →**. Do
not explore the whole grid; the script gives this beat two sentences.

### Beat 6 - finish
**Frame:** `step-6-finish.png`

The Finish step. Three parts, and the frame shows all of them:

1. **NAME THIS GRAPHIC**, with "Used in the library, on the topbar, and as the exported folder
   name." Type `Match scorebug`.
2. **WHAT YOU BUILT**, a five-row summary with an Edit link on each: Design, Project format,
   Fields, Typefaces, Motion. Let it be readable for a moment; it is the receipt for the last four
   steps.
3. **PRODUCTION**, a picker reading "+ New production..." beside a name box. Type `Saturday
   Match`. The paragraph under it is the one to point at: "Name it for the show, like Friday Show
   or Class Quiz, not for this graphic."

The name box only exists while the picker says new production. If it is not on screen, that picker
is the reason.

Then press **▶ Add to the production - go live**. A dialog names the production it is about to
write to; confirm it, and do not cut it out. A viewer who has not seen it will think their press
did not register.

### Beat 7 - the dashboard
**Frame:** `step-7-production.png`

The production page, titled **Saturday Match**, marked NOT PUBLISHED, with Playout / Data /
Audience tabs.

- **PREVIEW** on the left, outlined amber, showing the scoreboard.
- **PROGRAM - ON AIR** on the right, outlined red, reading **"Nothing on air"**.
- The verb row underneath: **TAKE** (with SPACE on it), Re-take, Update, » Next, Out.
- **Cue rundown** on the right with one row, "Match scorebug", badged **PVW**.
- The cue editor below, headed "EDITING PREVIEW CUE · 1" with "changes air on ⟳ Take" beside it,
  and the seven fields F0 to F6.

Point at the program monitor while the word "nothing" is spoken. It has to be visibly empty here,
or beat 8 has nothing to land on.

### Beat 8 - take
**Frame:** `step-8-on-air.png`

Press **TAKE**. Four things change at once, and they are the payoff shot of the video:

- the program monitor fills with the scoreboard;
- the cue's badge goes from PVW to a red **ON AIR**;
- the verb becomes **TAKE OFF**, and the chip on the right reads "on air: Match scorebug";
- the cue editor's heading turns red, "EDITING ON-AIR CUE · 1", and its note becomes "changes push
  live on ✎ Update".

Let the fade finish, then hold for about two seconds of silence before the next beat.

### Beat 9 - the scores act at once
**Frame:** `step-9-score-bumped.png`

Scroll down past the fields to the strip headed **± LIVE NUMBERS act on air**. Its own sentence is
the beat, and it is worth showing rather than paraphrasing: "One press changes the figure on the
live graphic and keeps this cue in step - no ✎ Update needed. Typing a value above still stages it
for ✎ Update instead."

It carries a minus and a plus for **Home score** and for **Away score**. Press Home plus twice,
then Away minus once. The program monitor must stay in shot for all three presses, because the
point of the beat is that the picture changes on the press and nothing else is pressed. It goes
from 2-1 to 4-0.

The activity line at the bottom counts them: "Updated 1 field", three times.

### Beat 10 - typing waits
**Frame:** `step-10-typed-not-on-air.png`

Scroll back up so the cue editor's heading is under the monitors, then type `Ilves` over `HJK` in
**F0 · Home team**.

Four things have to be in the same shot for this beat to work, and the frame shows all four:

- the amber line reading **"1 change not on air yet - press ✎ Update"**;
- the **Update** button, now wearing an amber dot;
- the preview monitor, reading Ilves;
- the program monitor, still reading HJK.

A small **⟲ Reset** appears beside every field that differs from what is on air, which is a nice
detail to point at but not one the script mentions.

If your recording cannot hold all four at once, split the beat and show the monitors first, then
the warning. Do not let the viewer take it on trust: this is the one behaviour the video exists to
teach.

### Beat 11 - update
**Frame:** `step-11-updated.png`

Press **✎ Update**. The program monitor changes to Ilves, the amber warning goes back to its calm
form, "changes push live on ✎ Update", and the dot leaves the Update button.

Hold on the program monitor as it changes. The contrast with beat 10 is the whole lesson.

### Beat 12 - out
**Frame:** `step-12-off-air.png`

Press **Out**. The program monitor empties and reads "Nothing on air", the chip on the right goes
back to "nothing on air", the cue's badge returns to PVW, and the verb is TAKE again. The preview
monitor keeps the board, which is the point of a preview.

Close on the empty program monitor.

## What must not appear

- **No email address, no account, no signed-in state.** This road needs none, and showing one
  makes a viewer think they do.
- **No code editor.** There is a door to it on the Finish step under Advanced mode, and taking it
  by accident sends the video somewhere else entirely.
- **No OBS, vMix or CasparCG.** Getting the picture into a switcher is about the production's
  output URL, it is a separate video, and this one ends at the dashboard.
