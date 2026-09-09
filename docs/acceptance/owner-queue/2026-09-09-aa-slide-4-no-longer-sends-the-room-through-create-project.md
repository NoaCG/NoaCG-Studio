---
kind: walk
date: 2026-09-09
serves: now
---
# Slide 4 stops sending the room through a door that saves nothing

The deck landed this afternoon (pull request 198) with slide 4 telling students to press
**Create project**. That button does not save. On 25 September that is a student closing a tab and
losing the graphic they just drew, in the beat where the whole room is watching. The slide now
sends them to **Finish** and names the production door. Branch `claude/aa-deck-repair`.

Three other defects went with it, all found by the reviews of that pull request and none of them
fixed before it landed. They are described at the bottom; the walk is about slide 4.

## The route, under a minute

Double-click `docs/presentation-2026-09-25/NoaCG-2026-09-25.pptx` and go to **slide 4, "Your own
graphic"**. Read step 05 and the middle panel on the right. Then open the notes for that slide
(**View > Notes Page**).

**What to look at.**

- **Step 05 now reads** "Finish: name it, then take the production door. It saves the graphic and
  puts it in a show.", pointing at `the Finish step > Add to the production`. It used to read
  "Create, then Finish: add it to a production." Is that the instruction you want to give the
  room, or would you rather they were told to press Export and take the package home?
- **The middle right-hand panel** now puts the font upload "in the Typefaces row, on the Fields
  step". It used to say "on the last screen before Create", which is two screens out: the SVG road
  is Start, Design, Fields, Animation, Finish.
- **The notes carry a warning you may want to say differently.** They tell whoever presents not to
  name "Create project" out loud. That is a workaround for a product question that is still open
  (`docs/backlog/create-project-is-a-door-that-saves-nothing.md`): whether that button should
  save, be renamed, or is fine as it is. Nobody has reproduced it in the running app yet. **If you
  want that settled in the product rather than worked around in a slide, say so** - it is a taste
  call with your deadline on it, and it now covers two controls, because Finish's Advanced-mode
  "Open in the editor" door is wired to the same non-saving call.
- **The rhythm of the left column.** Steps 03, 04 and 05 each wrap to two lines and sit closer
  together than 01 and 02 do. Nothing overlaps or runs off the slide, but the column is
  bottom-heavy. If it bothers you, the fix is shorter step text, not a re-layout.

Slide 5's paragraph changed one sentence in the same pass: it said `validate` was the only verb
that opens a browser, and every CLI verb does. The number, 24.8 s, is unchanged.

## What else changed in the file, with no slide to look at

- The generator refused to overwrite a hand-edited deck, except that `--out <name-without-.pptx>`
  walked straight past the refusal and destroyed the file. Reproduced, then fixed at the write
  itself. Your hand edits to that deck are now safe from a rerun of the script whatever it is
  passed.
- Every panel on every slide was rendering half a point larger per side than the script's own
  numbers, because the library reads a requested zero-width outline as 1pt. 24 phantom outlines
  are gone. The nine deliberate ones (slide 3's arrows and its One URL box, slide 5's code panel)
  are untouched, which is the thing to spot-check on slide 3 if you want to.

The deck was regenerated and every slide was rendered and read after the change.
