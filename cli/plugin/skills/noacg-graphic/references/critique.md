# Critique and improve (OPT-IN - only when asked)

Run this only when the user asks for it ("critique my graphic", "make it better",
`/noacg:graphic --critique ./my-graphic`) or says yes when you offer it. It is a taste check on YOUR design, judged
against the brief and against the bar a paying broadcaster sets. It is not NoaCG's house look:
that is the separate guidelines switch (`design-notes.md`), and this check never imports it.
The result is an improved package and the frames that show why.

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

**Auto-fit**

8. In `stress.png` (every text doubled): do long values wrap or shrink inside the design, does
   the box follow the text (no empty half after a wrap), and does nothing clip?

**Operability**

9. Read `noacg inspect` against SKILL.md's "Fields and behaviour": can the operator do every
   live action with a press, without typing a label, and is anything set once still sitting on
   the operator page?

## 3. Improve

Pick the changes that matter most, rarely more than three. Make them, validate again, render
the "after" frames (`--screenshots ./critique-after`). Do not restyle for the sake of it: when
every line in step 2 passes, change nothing and say why it already meets the bar.

## 4. Report

Show the user, briefly: the before and after frames side by side, each change with the line
from step 2 that caused it, and anything you chose not to change and why.
