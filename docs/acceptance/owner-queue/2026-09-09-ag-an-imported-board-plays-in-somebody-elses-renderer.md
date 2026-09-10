---
kind: walk
date: 2026-09-09
serves: now
---
# A student's own drawing, behaving, in a renderer nobody here wrote

Beat A7 of the 25 September script was the last GAP in the on-air section, and it is the one the
Yle half of the day rests on: a graphic somebody drew in Illustrator, imported here, exported as
OGraf, and driven in somebody else's renderer. Everything proven before this was a NoaCG design or
a CLI scaffold.

It works now, in SuperFly.tv's ograf-server. Getting there found a defect, and it was the bad
kind: **every operator action answered `200` and the graphic painted nothing.** Select, lock and
reveal all reported success, the state machine really did move, and the board on screen never
changed. No error, no console line, no status code anywhere that said so. Under SPX and CasparCG
the same board is fine, which is why nothing here had ever caught it.

## The route, under a minute

You do not need the renderer for the half that matters. In the app:

1. **New graphic** -> **Import graphic** -> drop `docs/svg-samples/quiz-board.svg`.
2. **Create project**, then the **Export** tab -> **OGraf (EBU) export** -> **Validate &
   download**.
3. Open `graphic.mjs` in the downloaded folder and search for `scopedWindow`. The comment above it
   is the whole story, and the block just below `function initTemplate(document, window)` is the
   fix: the function names this board's timeline fires, handed to the graphic's own window because
   inside a renderer they are no longer the page's.

The renderer half is `docs/OGRAF.md`, section **2026-09-09**: the exact commands that fetch and
build the renderer, the walk that drives it, and what was seen at each press.

## What to look at

- **The reveal, on the production page in the app** (library row -> **+ Production** -> a cue ->
  **Start production**, then Select answer / Lock it in / Reveal correct). The renderer shows the
  same drawn states; what you are judging is the DESIGN, and it is the designer's own artwork
  rather than ours. If the reveal reads wrong, the answer is a drawing note, not a code change.
- **`docs/OGRAF.md`, "The trap that nearly made this round lie, twice".** Two runs of this walk
  reported a dead board when the only thing wrong was that the page was not in front, so a
  browser had throttled its animation clock. Worth knowing before anyone here trusts a headless
  reading of MOTION again.

## What still needs you

**Which renderer Yle brings.** This round proves the package behaves in SuperFly.tv's
ograf-server, which is the EBU repository's own reference server. It says nothing about a
different vendor's renderer, and nothing anywhere records which one Yle runs. That question has
its own item, `2026-09-10-be-which-ograf-renderer-yle-runs.md`; it used to ride along with the B0
network screenshot, which the owner took off the ledger on 2026-09-10.

## What is NOT in this folder

No frames. The walk writes one PNG per beat into `ograf-external-out/`, and it needs the renderer
built first, which is more than a minute; the states were read out of the renderer's DOM instead,
and the A/B against what `main` emits is what makes the verdict a result rather than an
impression. If you want pictures, `scripts/ograf-external-walk.mjs` produces them in one command
once the renderer is built.

## If you disagree

Say so and A7 goes back to GAP with your note as the reason. It was closed on a machine's reading
of the renderer's DOM plus a controlled comparison; the taste call on what those states look like
is yours.
