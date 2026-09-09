# Session S - the 25 September deck as a PowerPoint file

**Branch:** `claude/s-presentation-pptx`, from `origin/main` at `0ad1e1e0`. Documents only.
New: `docs/presentation-2026-09-25/NoaCG-2026-09-25.pptx` (the deck),
`docs/presentation-2026-09-25/make-deck.mjs` (its starting-point generator),
`docs/presentation-2026-09-25/README.md` (the directory's one-paragraph map, so the docs-index
gate covers the row), one owner-queue item, this handoff. Edited: `docs/README.md`, one row;
`docs/DEMO_2026-09-25.md`, the cells the two sibling landings and this deck made stale.

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
6. CI on the pushes of `c28a90b7`, `14daa934` and `8301fc51`: `E2E plan`, `Factory gates`,
   `Build` and `CI gate` ran and passed on each; the E2E shards, `Reviewed` (a push run, not a
   pull request) and the after-gate jobs were skipped, which is the honest plan for a docs-only
   change. The run on the final tip is read to a verdict before queueing.

## /check

- `review: inline`. The code-review skill answered with a promise of later agent reports, which
  the check workflow classes as not run, so the diff was read here: each slide sentence against
  its beat row, the generator for defects. One finding, fixed: `step()` put a paragraph break on
  every step, so a step with no route line ended in an empty paragraph a hand editor would meet.
- `simplify: inline`. The simplify skill returned fan-out instructions, so the pass ran here over
  its four angles. Nothing further to change: no repo helper exists for pptx, the brand constants
  are cited to their source, and the refusal is the mechanism rather than a note.
- `verify: inline`. Build green on the final tree; the deck re-validated, re-read and re-opened
  in PowerPoint after the fix and again after the relay's edits regenerated it.
- `taste: not applicable`. Nothing here moves what a graphic looks like.

## The review relay, and what was done with it

The cross-file review's report reached the orchestrator rather than this session, as a fan-out's
does, and came back by relay with five findings. All five were acted on before queueing.

1. **The script said no deck exists.** `docs/DEMO_2026-09-25.md` O2 read GAP and §7 row 12
   bundled the deck with the printed index, which its own §8 rule forbids leaving after a commit
   that closes half of it. O2 now names the deck and reads UNSEEN (eyes), closed by the owner's
   walk; row 12 is G2 alone; the deck has its own row 13.
2. **The deck was more current than the script.** Slide 5's 24.8 s and slides 4 and 7's
   `#first-graphic` came from rows A and D (pull requests 190 and 191), which landed after the
   script was written, so R2.5 and G1 still read GAP. R2.5 now carries the measurement and the one
   leg it could not walk, folded into §7 row 8 with a stopwatch; G1 reads WORKS; §7 rows 4 and 5
   are deleted and their numbers are not reused, so every slide note that cites a row stays true.
   The §0 paragraph that introduced the two branches as running now says they landed.
3. **The README row had no orphan protection.** `check-docs-index.mjs` only sees rows whose first
   cell ends in `.md`, so a row naming a `.pptx` fails no build when the file is gone. The row now
   names `presentation-2026-09-25/README.md`, a real file beside the deck, and says why.
4. **Nothing lints or runs the generator.** True, and decided rather than papered over: the
   header now says in plain words that the script is allowed to drift from the deck, that no gate
   checks it, and that this is accepted because the alternative is a generator that rewrites the
   owner's slides. The deck at HEAD was built from the generator at HEAD; the reviewer saw the
   `breakLine` edit mid-review, before the regeneration that followed it.
5. **No owner-queue item named the deck.** It was being written in the QUEUE step; it exists now,
   and the font substitution sits in its "what to look at" as the one-step Replace Fonts swap.

## What is not done, deliberately

- **G2, the printed one-page index**, is still a GAP in the script (§7 row 12). The deck is not
  it; if the laptop dies, the notes pages print one slide per page with the notes under it.
- **Two dated items the notes lean on** are worth closing before the day and are cheap: the
  install lines on a fresh machine (B5, §7 row 6) and the terminal path and live save against
  `noacg.studio`, now with a stopwatch on it (§7 row 8).

## Safe to archive

Yes, once landed. Nothing uncommitted, no relay, no owner receipt served
(`owner-receipts.mjs --serves` reports none).
