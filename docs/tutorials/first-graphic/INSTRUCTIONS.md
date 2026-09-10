# Instructions: your first graphic

What is on screen against each line of `SCRIPT.md`. Written for somebody who has never used NoaCG,
so nothing here assumes you can find a control by name.

## Before you start

- **The frames are the truth.** `frames/` holds one screenshot per beat, captured from the product
  by the walk that tests this road. If a frame disagrees with a sentence here, the frame is right
  and this file is stale. Say so rather than working around it, and the pack gets fixed.
- **The whole video is one browser window** at 1280 by 720 or wider. Nothing here needs a terminal,
  an account, or any playout hardware.
- **The file being imported** is `scorebug.svg` from the NoaCG practice library. The link is on
  `/docs` under "Export settings, app by app". It is a football scoreboard: HJK against KuPS, 2 to
  1, a clock reading 12:00, and a competition strap reading VEIKKAUSLIIGA.
- **Nothing on this road needs Advanced mode.** If the recording machine has it on, turn it off in
  Settings first, or the Finish step grows a third door the script does not mention.

## The beats

### Beat 1 - three doors
**Frame:** `step-1-import-door.png`

The studio opens on a panel asking how to start. Three cards: start from a template, create with
AI, and import graphic.

Show the panel whole for a moment, then move to the third card, **Import graphic**, and click it.
Its own line reads "bring your own artwork in - no AI", which is worth a beat on screen because
viewers arriving with a drawing often assume the AI card is the only way in.

Do not linger on the AI card. This video is about the road that needs nothing.

### Beat 2 - the drop zone
**Frame:** `step-2-drop-zone.png`

The import step. A dashed drop zone, and above it an amber line reading **Need help exporting
SVG?** with "named layers, live text, one artboard" beside it.

Open that line so the three rules are readable while they are spoken. The viewer has to see the
rules, not just hear them, because this is the moment their own file either works or does not.

Then close it again before the drop, so the drop zone is what is on screen when the file lands.

### Beat 3 - what it found
**Frame:** `step-3-what-it-found.png`

Drag `scorebug.svg` onto the zone. A card headed **Your design** appears under it.

Three things in that card carry the beat, and each needs a moment to be read:

1. `1920 × 1080` beside "SVG artwork".
2. "7 text layers found."
3. "Five steps now, not six: an SVG needs no erasing and no placing, so Prepare and Text became
   the one Fields step."

The line about outlines is the one a viewer will need on their own file, so hold on the layer
count while it is spoken rather than moving on.

Then press **Next**.

### Beat 4 - fields
**Frame:** `step-4-fields.png`

The Fields step, headed "Choose what the operator can change". This is the longest beat and the
most important one. The frame shows the step as it arrives, with nothing changed.

Point at these, in this order:

1. **The list of rows**, each with a tick, a field name and the words drawn in that layer. Its
   summary reads "7 of 7 editable on air".
2. **One row's field name box**, to make the point that the layer name is the operator's label.
   "Home team" is a good one to sit on.
3. **The rows that are not plain text.** The two scores came in as numbers, the match clock offers
   a countdown, and the crest is a picture. These are separate sections further down the step, so
   scroll to them while that sentence is spoken instead of trying to show everything at once.

Nothing is changed on this step. The point of the beat is that a well drawn file arrives already
correct.

Then press **Next**.

### Beat 5 - animation
**Frame:** `step-5-animation.png`

The Animation step, with a default already chosen. One short beat. Show the cards, do not explore
them, press **Next**.

### Beat 6 - finish
**Frame:** `step-6-finish.png`

The Finish step. The frame shows both name boxes already filled, which is what the beat is about.

Type into the first box: `Match scorebug`. Then, with the production picker on **New production**,
type into the second: `Saturday Match`. The second box only exists while the picker says new
production, so if it is not on screen, that picker is the reason.

Then press **Add to the production**. A dialog appears naming the production it is about to write
to. Confirm it. Do not cut the dialog out: a viewer who has not seen it will think their press did
not register.

### Beat 7 - the dashboard
**Frame:** `step-7-production.png`

The production page. Two monitors side by side, preview on the left and program on the right, with
the rundown below or beside them and one cue in it.

Point at the program monitor while the word empty is spoken. It has to be visibly empty here, or
beat 8 has nothing to land on.

### Beat 8 - take
**Frame:** `step-8-on-air.png`

Press **Take**. The scoreboard plays on in the program monitor.

Let the entrance animation finish on screen. This is the payoff shot of the whole video and it is
worth two seconds of silence after the line.

### Beat 9 - the scores act at once
**Frame:** `step-9-score-bumped.png`

The live number controls carry a plus and a minus for each number field the graphic has: home
score and away score. They are separate from the cue's own fields, and they act on air on the
press.

Press home plus twice, then away minus once. The program monitor has to be in shot the whole time,
because the point of the beat is that the picture changes with the press and nothing else is
pressed. It goes from 2-1 to 4-0.

### Beat 10 - typing waits
**Frame:** `step-10-typed-not-on-air.png`

Now the cue's own fields, which are a different place on the page from the plus and minus buttons.
Type `Ilves` over `HJK` in the home team field.

Two things must be in the same shot for this beat to work:

- the amber line reading "1 change not on air yet - press ✎ Update";
- the program monitor, still reading HJK.

If the frame does not hold both, split the beat and show them one after the other rather than
letting the viewer take it on trust. This is the one behaviour the video exists to teach.

### Beat 11 - update
**Frame:** `step-11-updated.png`

Press **Update**. The program monitor changes to Ilves, and the amber line goes back to its calm
form, "changes push live on ✎ Update".

Hold on the program monitor as it changes. The contrast with beat 10 is the whole lesson.

### Beat 12 - out
**Frame:** `step-12-off-air.png`

Press **Out**. The graphic plays off and the on-air line reads "nothing on air".

Close on the empty program monitor, then the practice library, if the video wants an end card.

## What must not appear

- **No email address, no account, no signed-in state.** This road needs none, and showing one
  makes a viewer think they do.
- **No code editor.** There is a door to it on the Finish step under Advanced mode, and taking it
  by accident sends the video somewhere else entirely.
- **No OBS, vMix or CasparCG.** Getting the picture into a switcher is a separate video about the
  production's output URL, and this one ends at the dashboard.
