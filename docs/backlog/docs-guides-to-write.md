---
v: 2
source: owner
kind: ask
raised: 2026-08-26
state: superseded
note: >-
  all four items are on the page. Items 2 (countdowns and clocks), 3 (artwork that is not an
  SVG) and 4 (which package do I want) landed 2026-09-06; item 1 (the creation wizard, end to
  end) landed 2026-09-09 as #first-graphic, written by walking the road rather than from this
  file. The list is spent. The UI work the walk turned up is its own file,
  docs/backlog/import-walk-hesitations.md.
asked: >-
  "I like the new docs" - the next guides on the /docs shelf, in the order they earn their place
  (paraphrase of the 2026-08-26 walk)
---
# The next /docs guides, in the order they earn their place

**Filed:** 2026-08-27. **Source:** the owner's walk of `/docs` on 2026-08-26 ("I like the new
docs"), plus the /docs shelf restructure this file was written beside (in `git log` on
2026-08-27; the handoff that described it has since been consumed).

## Why

The page now has a shelf that new guides slot into: `#graphics` holds one guide per graphic kind,
and the left nav stays main-topics-only. That makes "write another guide" cheap, which is exactly
why it needs a stated order. The owner's constraint is the binding half of this file:

> only the most important information on the left

**Do not inflate the docs.** A guide earns its place by answering a question a reader actually
arrives with, and every one that does not is nav weight paid by every reader who wanted a different
page. Four kinds are documented because each asks for its content in a shape nobody would guess.
A lower third does not, and it does not get a guide.

## What it would take

One guide is roughly an afternoon: run the flow, write it, pin its load-bearing line in
`e2e/docs.spec.ts`, and hold the voice in `src/docs/AGENTS.md`.

**Tactically, in order:**

1. ~~**The creation wizard, end to end.**~~ **Done, 2026-09-09.** `#first-graphic`, "Your first
   graphic, step by step", between `#graphics` and `#svg` under "Make a graphic".

   Holding it back was right, and the paragraph that described it was already wrong by the time it
   was written. The steps this file named (Entry, Browse, Fields, Style, Animation, Finish) are not
   the steps the wizard has: the import road is Start, Design, Fields, Animation, Finish, and the
   rail carries a sixth step (Prepare) that an SVG drop removes. So the guide was written by
   walking the road cold with an SVG drawn for the walk, from the Import door to a cue taken to air
   on a production dashboard, and every quoted string in it was read off the running app that day.
   That is the method to repeat, not this paragraph.

   Scoped to the SVG road rather than to the wizard in general, because the owner's ask for the
   2026-09-25 release is how a student imports their own graphics, and because a walk of one real
   road is checkable in a way a tour of every mode is not. Pinned in `e2e/docs.spec.ts`.
   `#getting-started` and `#svg` both hand off to it; `#dashboard` gained the wizard's own
   one-press route into a production, which it had not carried.

   **The walk's own output is the UI list this file asked for**, filed as
   `docs/backlog/import-walk-hesitations.md`: the three places where a sentence of documentation
   was needed to make the screen usable. The importer itself was clean on the walk.
2. ~~**Countdowns and clocks.**~~ **Done, 2026-09-06.** `#countdowns` in the `#graphics` shelf.
   It carries the length-not-text rule, the colon trap (`2:30` reads as two minutes), the
   `noacg-data-source` holder and why the class rather than an inline `display:none`, what an
   Update does to a running count, the optional wall-clock start time, and the two clocks that work
   the other way round (the scorebug's typed match clock, the speaking timer). Pinned in
   `e2e/docs.spec.ts`.
3. ~~**Bringing artwork in that is not an SVG.**~~ **Done, 2026-09-06.** `#artwork`, beside the SVG
   guide under "Make a graphic". Routes in, what is copied and downscaled, what a folder package
   writes versus what a single-file one embeds, that the exported operator page only switches
   between the pictures the graphic already carries, that a Lottie autoplays and loops from load,
   and that a missing font is silent. Pinned in `e2e/docs.spec.ts`.
4. ~~**Exporting for each target.**~~ **Done, 2026-09-06.** `#export`, leading the "Connect
   playout" group, because that group used to start halfway through the answer. One page: a
   six-row table of "playing it in / take / what you get", led by the question that comes first
   (a production driven from NoaCG needs no package at all) and closed by the fact that makes a
   wrong pick cheap (export again). The two hosts with their own guide are linked, not
   re-explained. `e2e/docs.spec.ts` pins that each of the six targets has a row, from a
   hand-kept list: the registry reaches a Vite-only `?raw` import and cannot be read from a
   spec, so adding a seventh target means adding it to that list as well.

**Deliberately not on this list:** one guide per catalog design, an AI page (that work is
postponed), and anything about the editor beyond what Advanced mode already implies.

## Evidence

- Owner walk, 2026-08-26: the docs home was accepted, with end credits and tickers as top-level
  nav entries named as the confusion. That restructure landed; this file is what stops the same
  mistake being made again with the next four guides.
- `src/docs/AGENTS.md` holds the voice and the structure rules a new guide has to satisfy.
- The 2026-09-12 student production is the reader this list is ordered for: someone who has to make
  a graphic and play it out, not someone reading for interest.

## Teams needs a guide, and the guide is not the goal (owner, 2026-09-03)

Reading the register he asked for Teams instructions, and immediately named the standard they
should be held to:

> we need to add it to our instructions. There should be instructions on how to do it as well.
> Of course, it should be so intuitive that you can just use it without reading anything.

So the guide is the fallback, not the design. Anything the guide has to explain twice is a defect
in the dialog, not a gap in the page. Write the guide by walking the flow and noting every place a
sentence was needed - that list is the stage-4 UI work.
