# Session S - the 25 September deck as a PowerPoint file

**Branch:** `claude/s-presentation-pptx`, from `origin/main` at `0ad1e1e0`. Documents only.
New: `docs/presentation-2026-09-25/NoaCG-2026-09-25.pptx` (the deck),
`docs/presentation-2026-09-25/make-deck.mjs` (its starting-point generator), one owner-queue
item, this handoff. Edited: `docs/README.md`, one row.

## What was built

A seven-slide `.pptx` the owner double-clicks, presents from and hand-edits in PowerPoint or
LibreOffice, needing no network and no browser. The slides, in order: the title; what NoaCG is
(four sentences, each with a row in `docs/PROMISE_AUDIT.md`); the one picture of the two roads,
drawn in native shapes so it can be moved by hand; road 1, your own graphic; road 2, your coding
agent; on air, one production and one URL, with the four targets prepared for the day; the guide
is the docs page. Slides 4, 5 and 6 are the ones that stay on screen while the room works, and
they carry only what a live product cannot: what to do now, where to go, and the two sentences
the script says to say before they are asked.

The content of record is `docs/DEMO_2026-09-25.md` and nothing here competes with it. Every
sentence on a slide traces to a beat's evidence column, and the speaker notes of every slide name
the beat ids, their status on 2026-09-09, the dates and the proving file, so the night-before
tweak does not need the script open. Row N's HTML draft was read for its thinking and its order,
which are kept; its format was not.

**The one measured number is on slide 5 and it is worded to what was measured.** 24.8 s is the
tool time of the seven CLI verbs, measured by hand on 2026-09-09 (`docs/AGENT_CLI.md`, "Time to
air, measured"). The sentence beside it says nobody has put a stopwatch on the leg from the
library to air, because the cloud save leg has never been walked. "Minutes to air" end to end
appears nowhere on the slides, and `verify_deck.py` in the session's scratchpad greps for it.
Beats the script marks GAP or UNSEEN are either off the slides (CasparCG Connect, NoaCG driving
an OGraf renderer) or on them without a status claim, and the notes say which and why.

## The hand-edit hazard, and the mechanism for it

The prompt named the trap: a generator that rewrites the deck silently overwrites the owner.
`make-deck.mjs` therefore **refuses to write when the target file exists** and says so; a rebuild
from the script means moving the old deck aside first, which is a deliberate act. It takes
`--out <path>` for a fresh copy elsewhere. Proven this session: the second run exited 2 with the
refusal. Nothing in `npm run build` runs it, and `pptxgenjs` is not a project dependency; the
header says to install it ad hoc with `npm install --no-save pptxgenjs`.

**His edit always wins.** When the script changes after he has edited, the deck is edited by
hand and the generator is not re-run to catch up.

## Typefaces, a decision to know about

The brand faces (Space Grotesk, IBM Plex Sans, JetBrains Mono) are not installed on this laptop
(`C:\Windows\Fonts` has IBM Plex Mono only), and a `.pptx` cannot carry a fallback stack, so a
deck set in them would render in whatever PowerPoint substitutes, with different widths and the
overflow that brings. The deck is set in Arial and Consolas, which every Windows and Office
install has. Fonts were not vendored into the file: the repo's self-contained rule is about
generated templates, not about this. If the brand faces are installed later, PowerPoint's
Home > Replace > Replace Fonts swaps them in one go, and the owner-queue item says so.

## How it was verified, without a browser

1. `validate.py` from the pptx skill: all checks passed, twice (before and after the review fix).
2. The file was unzipped and its XML read: `<p:sldIdLst>` has 7 entries, 7 slide parts, 7 notes
   parts, and every intended string is present on its slide and in its notes (the script is
   `verify_deck.py` in the scratchpad; 88 needles).
3. **PowerPoint itself opened it** through COM with no window (`PowerPoint.Application`,
   `Presentations.Open(path, ReadOnly, Untitled, WithWindow=0)`): 7 slides, 960x540 points, the
   text of every slide read back.
4. LibreOffice headless converted it to PDF (7 pages) and every page was rasterised and looked at.
   Three rounds of layout fixes came from that: a wrapped title colliding with its body on slide
   2, the agent node's title wrapping on slide 3, a panel's text running to its edge on slides 4
   and 6. The final render is clean on all seven.
5. `npm run build` exit 0, read from the build's own exit code, on both commits.
6. CI on the push of `c28a90b7`: `E2E plan`, `Factory gates`, `Build` and `CI gate` ran and
   passed; the E2E shards, `Reviewed` (a push run, not a pull request) and the after-gate jobs
   were skipped, which is the honest plan for a docs-only change. The run for `14daa934` is read
   before queueing.

## /check

- `review: inline`. The code-review skill answered with a promise of later agent reports, which
  the check workflow classes as not run, so the diff was read here: each slide sentence against
  its beat row, the generator for defects. One finding, fixed: `step()` put a paragraph break on
  every step, so a step with no route line ended in an empty paragraph a hand editor would meet.
- `simplify: inline`. The simplify skill returned fan-out instructions, so the pass ran here over
  its four angles. Nothing further to change: no repo helper exists for pptx, the brand constants
  are cited to their source, and the refusal is the mechanism rather than a note.
- `verify: inline`. Build green on the final tree; the deck re-validated, re-read and re-opened
  in PowerPoint after the fix.
- `taste: not applicable`. Nothing here moves what a graphic looks like.

## What is not done, deliberately

- **G2, the printed one-page index**, is still a GAP in the script (§7 row 12). The deck is not
  it; if the laptop dies, the notes pages print one slide per page with the notes under it.
- **O2's status cell in `docs/DEMO_2026-09-25.md`** still reads GAP and §7 row 12 still stands.
  The script's rule is that closing a row edits the cell and deletes the row in the same commit,
  and row 12 bundles the deck with the printed index, which does not exist. Splitting that row is
  the script owner's edit, not this branch's; it is one line and the next session that touches
  the script should make it.
- **Two dated items the notes lean on** are worth closing before the day and are cheap: the
  install lines on a fresh machine (B5, §7 row 6) and the terminal path and live save against
  `noacg.studio` (§7 row 8).

## Safe to archive

Yes, once landed. Nothing uncommitted, no relay, no owner receipt served
(`owner-receipts.mjs --serves` reports none).
