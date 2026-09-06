---
v: 2
source: owner
kind: ask
raised: 2026-08-26
state: advanced
note: >-
  items 2 (countdowns and clocks) and 3 (artwork that is not an SVG) are on the page,
  2026-09-06. Item 1 (the creation wizard) is deliberately not written yet - see the body.
  Item 4 (which package do I want) still stands.
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

1. **The creation wizard, end to end.** The most-used surface on the product and the least
   documented: Entry, Browse, Fields, Style, Animation, Finish, and the fact that Finish can export
   without the editor ever opening. `#getting-started` currently compresses all of it into three
   list items. This is the one guide a first-time reader most needs and it is not a graphic kind,
   so it belongs beside `#svg` under "Make a graphic".

   **STILL OPEN, and held back on purpose.** It was skipped on 2026-09-06 while items 2 and 3 were
   written, because the wizard was being changed the same night: a step-by-step guide to a surface
   that is moving documents a screen the reader will not find. Write it once the wizard's steps
   have settled, and check what Entry and Finish actually look like on the day rather than working
   from this paragraph.
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
4. **Exporting for each target.** Six targets exist and the page documents playing them, not
   choosing between them. A short "which package do I want" page, not six pages.

   **STILL OPEN.** The constraint above is the hard part of it: this is one page, and if it cannot
   be made short it should not be made.

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
