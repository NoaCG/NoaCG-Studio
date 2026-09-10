---
kind: walk
date: 2026-09-09
because: taste
serves: now
---
# The 25 September deck, as a file you double-click

Seven slides for the session with students and Yle, in a `.pptx` that opens, presents and edits
in PowerPoint or LibreOffice with no network and no browser. It is built from the beats in
`docs/DEMO_2026-09-25.md`, which stays the content of record. Branch `claude/s-presentation-pptx`.

## The route, under a minute

Double-click `docs/presentation-2026-09-25/NoaCG-2026-09-25.pptx` in the checkout. Press F5 to
present, Esc to come back, then open **View > Notes Page** (or the Notes pane under the slide) on
slide 5.

**What to look at.**

- **The shape.** Title; what NoaCG is; the one picture of the two roads; road 1; road 2; on air;
  the guide. Three slides stay on screen while the room works (4, 5, 6) and they carry only what a
  live product cannot: what to do now, where to go, and the two sentences to say before they are
  asked. Is seven the right count, or would you cut one?
- **Slide 5, the number.** "24.8 s" is the tool time of the seven CLI verbs, measured on
  2026-09-09 (`docs/AGENT_CLI.md`, "Time to air, measured"). The sentence next to it says nobody
  has timed the leg from the library to air with a stopwatch. That wording is deliberate: "minutes
  to air" end to end is not proven, because the cloud save leg has never been walked, and the
  slide does not say it. If you would rather the room hear nothing about the untimed leg, delete
  the sentence; do not replace it with a time.
- **The notes.** Every slide's notes name the beat ids, their status on 2026-09-09 (WORKS, UNSEEN,
  GAP), the dates, and the file that proves each claim, so you can tweak a slide the night before
  without re-reading the script. Slide 6's notes carry what is not on the slide and why (CasparCG
  Connect, NoaCG driving an OGraf renderer).
- **The type.** Arial and Consolas, not the brand faces, because Space Grotesk, IBM Plex Sans and
  JetBrains Mono are not installed on this laptop and a `.pptx` cannot carry a fallback stack. If
  you install them, **Home > Replace > Replace Fonts** swaps Arial for Space Grotesk and Consolas
  for JetBrains Mono in one go.

**Editing is safe.** `make-deck.mjs` beside the deck refuses to write over the file, so your edits
always win; a rebuild from the script means moving the old deck aside first, on purpose.

## Consolidated 2026-09-10, and one thing decided rather than asked

`2026-09-09-aa-slide-4-no-longer-sends-the-room-through-create-project.md` opened the same file at
the same double-click and asked about one slide of it, so it is folded in here. Its question, in
its own words:

> **Step 05 now reads** "Finish: name it, then take the production door. It saves the graphic and
> puts it in a show." ... Is that the instruction you want to give the room, or would you rather
> they were told to press Export and take the package home?

That one is genuinely yours, and it is sharper now than when it was written: your 2026-09-10 call 6
says each group takes a lower-third quiz template and a scoreboard home and finishes them in their
own time, so what the room does with its graphic inside the session and what it takes away are two
different answers.

**Decided, not asked: the `Create project` door gets fixed rather than worked around.** The slide's
notes currently tell whoever presents not to say "Create project" out loud, because that button
does not save. A control whose name promises something it does not do is a defect - your own rule
from the outlined-text walk is that we should not offer things that do nothing - so the answer is
not a presenter's workaround. It stays filed as
`docs/backlog/create-project-is-a-door-that-saves-nothing.md`, now covering both controls (Finish's
Advanced-mode "Open in the editor" is wired to the same non-saving call), and the slide note comes
out when the product is fixed.

**Read this one AFTER the deck is rebuilt.** `docs/backlog/deck-contradicts-the-2026-09-10-calls.md`
records that the file on disk now contradicts the script on three slides, worst on slide 5, which
still shows four playout targets and sends the room to point OBS at the output URL - the thing you
cut on 2026-09-10. Opening it before the rebuild would show you a deck we already know is wrong.
