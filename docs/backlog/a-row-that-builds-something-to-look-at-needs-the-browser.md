---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "A row whose deliverable was a presentation to look at was planned `browser:no`; verifying it from a file:// URL cost three hours inside one tool call, and four layout defects could not have been found any other way."
serves: NOW
size: small
touches: .agent-workflows/orchestrator/prompts.md
needs-owner: none
---

# A row that builds something to look at needs the browser, and a `file://` artifact needs its route named

**Filed:** 2026-09-09. **Source:** the row that built and then withdrew the HTML deck for
25 September, "The browser question, in my own words" in
`git show a2ab4097:docs/handoffs/2026-09-09-n-presentation-25-september.md`. The row's own view,
recorded here because the row's file is consumed and the wave plan that gave it `browser:no` is
gitignored.

## Why

The row's deliverable was a seven-card presentation. It was planned `browser:no`, so verification
was supposed to be a read of the markup - and a read of the markup cannot see that card 5 overflows
its bottom edge at both widths, that "24.8 s" breaks across two lines, that two sublabels run past
their boxes, or that the print fallback puts pale text on white paper. All four were found by
looking, and all four were fixed. The five reviews of the sibling `.pptx` deck found their defects
by looking too.

The cost of the workaround is measured, not estimated. The Browser pane refuses page tools on a
`file://` tab outright, so an offline artifact can only be looked at through Playwright from a Node
script, and that script has to import Playwright from the primary checkout's `node_modules` because
a linked worktree carries none. The row's fonts were copied at 12:31Z and its first CI run started
at 15:31Z: **three hours passed inside one tool call**, and the relay says a permission prompt held
it. The owner cannot answer a prompt he never sees.

## What it would take

Two sentences in `.agent-workflows/orchestrator/prompts.md`, where the browser column is decided:

1. **A row whose deliverable is meant to be looked at gets the browser.** "Verify by reading the
   markup" is not verification of something built to be seen.
2. **For a `file://` artifact, the prompt names the route up front** - Playwright from a Node script
   importing the primary checkout's `node_modules` - and allows `node` on a scratchpad script, so
   the row does not discover the permission wall three hours in.

The second half may want a small helper rather than a prompt sentence, since every row that needs
it will write the same twenty lines. Worth measuring how often the case comes up before building
one.

## Evidence

- `git show a2ab4097:docs/handoffs/2026-09-09-n-presentation-25-september.md` - the four defects,
  the timestamps, and the row's own argument. Its predecessor is `77376353`; `ff9b4ce5` withdrew it.
- The sibling `.pptx` row reached the same place from the other direction: it verified without a
  browser by unzipping the XML, opening the deck through PowerPoint COM and rasterising a
  LibreOffice PDF, and **three rounds of layout fixes came out of the rasterised pages** - not out
  of the XML read.
- `docs/DEV_PORTS.md` and `scripts/dev-worktree.mjs:65` - why a worktree's browser work is awkward
  in the first place.
- `docs/backlog/the-allowlist-is-not-what-stops-a-row-at-night.md` - the same night's other
  permission cost, parked. It is about which entries the allowlist carries; this is about whether
  the prompt asked for the browser at all. Named here so nobody files a third item over one
  evening's stoppages.
