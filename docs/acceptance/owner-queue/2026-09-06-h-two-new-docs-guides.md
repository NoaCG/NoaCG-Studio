---
kind: agent
date: 2026-09-06
serves: now
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

The nav-length question was already moved out of this item to 2026-09-09-how-to-work-with-a-
team.md with the right count. What is left is docs voice, which the repo's own copy rule governs,
and the fact that nobody has rendered the page - a claim an agent drives.

Re-kinding and deleting are separate commits by rule, so this item stays here until an
agent drives the route below and records what it saw. The original text follows,
unchanged.

# Three more guides on /docs: countdowns, artwork that is not an SVG, and which package to take

**Date:** 2026-09-06 · **Branch:** `claude/h-docs-guides`

## What changed

Your 2026-08-26 walk asked for the next guides in the order they earn their place, with the
binding half being "only the most important information on the left". Items 2, 3 and 4 of that
list are now on the page. Item 1, the creation wizard, is deliberately not: the wizard's own
steps were being changed the same night, and a step-by-step guide to a moving surface documents
a screen the reader will not find.

- **Countdowns and clocks** joins the four kind guides in the Graphics shelf. A timer's content
  is a length in minutes, not the digits you want on screen, and the field holding it is
  deliberately invisible. Neither is guessable, and both cost a wrong graphic on air.
- **Pictures, logos and Lottie animations** is a new section beside the SVG guide. What happens
  to a PNG you bring in, what leaves in an export, and the one that quietly ruins a show: a
  missing font is silent, so the graphic simply airs in the wrong typeface.
- **Which package do I want** now leads Connect playout, which used to start halfway through the
  answer. Six rows, and it opens by asking whether you need to export at all.

The left nav grew by two entries, from ten to twelve. That is the cost, and it is the thing to
judge: whether these two are worth the weight every reader pays.

## The route, under a minute

1. `/docs` -> left nav -> **Graphics** -> scroll to **Countdowns and clocks** (or go straight to
   `/docs#countdowns`). The two lines to look at are "reading stops at a colon" and the
   paragraph about the length never being on screen.
2. `/docs#artwork`, under **Make a graphic**. Read the last sub-head, "Fonts, and what a missing
   one does".
3. `/docs#export`, the new first entry under **Connect playout**. The question is whether the
   table lets you find your own row in a couple of seconds.

## What to look at

- ~~**The nav.**~~ **Removed 2026-09-10, asked twice.** This said "twelve entries now"; the live
  nav has fourteen, counted off `docs.html` on 2026-09-10, and
  `2026-09-09-how-to-work-with-a-team.md` asks the same question with the right number. Answer it
  there. The two entries this item wanted to argue about, "Pictures, logos & Lottie" and
  "Which package do I want", are named there too so nothing is lost.

  The original wording of this bullet ended: "either can go back into a neighbouring section."
- **The voice.** Three guides written to match the four already there. If any paragraph reads
  like it is selling something, that is the defect.
- **The countdown guide's length.** It carries six sub-heads, more than any other kind guide,
  because it covers the holding screen and the two clocks that work the other way round as well.
  Say if that is one guide too wide.

## Not seen by anyone yet

No browser ran tonight, so nothing on this page has been LOOKED at. Every factual claim was
derived from the code that implements it (named in the handoff), the page's own gates are green,
and the assertions `e2e/docs.spec.ts` adds were verified against the markup by extraction rather
than by a run. The page rendering correctly is the part still unconfirmed.
