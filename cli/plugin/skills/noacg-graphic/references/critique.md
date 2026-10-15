# Critique and improve (OPT-IN - only when asked)

Run this only when the user asks for it ("critique my graphic", "make it better",
`/noacg:graphic --critique ./my-graphic`) or says yes when you offer it. It is a taste check on YOUR design, judged
against the brief and against the bar a paying broadcaster sets. It is not NoaCG's house look:
that is the separate guidelines switch (`design-notes.md`), and this check never imports it.
The result is an improved package and the frames that show why.

## The fresh-eyes review

When you are asked to review a graphic you did not make (as a second agent, or a second session
with its folder), you change nothing: you look and answer, and the author repairs. Read the brief,
`noacg inspect --json <folder>`, and every frame the coverage folder's `coverage.json` lists, one
file at a time (a contact sheet makes small text illegible). A state the frames do not show (a
long value in a field the long frames left short, an event after another) is yours to shoot with
`noacg screenshot <folder> --data <field>=<value> --event <op> --at 1500ms --out <png>`.

For each question answer pass or fail. A fail names the frame file, the element and what is
wrong; a pass the frames do not show is a fail ("not shown").

1. Does every line of text sit clear of every other text and mark, in every frame: long values,
   the Update strip and every event's strip included?
2. Does every text read against what is behind it, on the dark ground and the light one?
3. Is every text whole: no cut letters, no ellipsis the operator did not type, nothing past its
   panel or the frame, a long value wrapping or shrinking inside a box that grows with it?
4. Can the operator do every live action the brief needs with a press (`inspect`'s buttons), and
   does each press visibly change the picture in its strip?
5. Does the Take, every event, the Update and Out each end in a frame you would air: no empty
   panel, nothing left over from the state before?
6. Anything else a broadcast designer would refuse to air.

End with one line: `PASS`, or `FAIL: <n>`. Where you and the picture disagree, the picture wins.

## 1. Look at it where it airs

- Render it: `noacg validate <dir> --screenshots ./critique-before`. Keep these frames; they are
  the "before".
- The frames are transparent, and a viewer never sees them on white. Judge each one as it will
  sit on the programme: over a dark picture, a bright one and a busy one (composite the PNG over
  each with any image tool you have). A dark plate that vanishes on black, or a cream card that
  glares on a bright set, is a finding.
- A state only a button reaches (a reveal, a timer, a final) is part of the design too; look at
  it however you can.
- Write three lines before you judge: who watches and on what screen, the tone the brief asks
  for, and what a viewer must read first.

## 2. Judge it (one honest line per question)

**Taste**

1. Would it sell on a paid stock marketplace (MotionArray, Envato Elements) beside graphics made
   for this kind of show? If it is the default answer any template tool gives (a dark plate, a
   sans, a thin accent rule), say so.
2. Does it say what THIS show is? If the same frame could serve a different brief with only the
   colours changed, that is a defect.
3. Hierarchy: what does a viewer read in the first second, then second, then third? Is that
   the order the brief needs?
4. Type: does the face carry the tone, and do size and weight read at viewing distance and
   after stream compression?
5. Colour and contrast: does the palette serve the content and hold against the ground it
   actually sits on?
6. Space and shape: does the box hug its text, is the composition balanced, and does it cover
   more of the picture than it must?

**Motion**

7. Does the entrance have the character the tone asks for (a ceremony may build slowly; a score
   change must be instant)? Does the exit leave faster than the entrance came? Does anything move
   for no reason?

**Basic mistakes**

8. The fresh-eyes review's questions 1 to 5 above, on your own frames (`stress.png` doubles every
   text), and: is anything set once still sitting on the operator page?

## 3. Improve

Pick the changes that matter most, rarely more than three. Make them, validate again, render
the "after" frames (`--screenshots ./critique-after`). Do not restyle for the sake of it: when
every line in step 2 passes, change nothing and say why it already meets the bar.

## 4. Report

Show the user, briefly: the before and after frames side by side, each change with the line
from step 2 that caused it, and anything you chose not to change and why.
