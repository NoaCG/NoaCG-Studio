---
kind: agent
date: 2026-09-05
serves: now
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

Its own first line is 'nothing you can see on air, deliberately'. The two visible halves are a
generated code table and a generated docs page, both gated by the build - developer-facing
machinery, and the owner would have to ask an AI what a NOACG_BEHAVIOUR table should look like.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# The same four behaviours, one table, and a naming page that cannot drift

**Date:** 2026-09-05 · **Branch:** `claude/svg-behaviour-control-system-459532`

## What changed

Nothing you can see on air, deliberately. The quiz, the score tracker, the live vote and the
countdown do exactly what they did yesterday; every spec that pinned them still passes. What
changed is underneath: the four hand-written behaviour modules are gone, and each is now a
declaration (`src/templates/behaviours/`) compiled through one binding table and one paint runtime
(`docs/SVG_BEHAVIOUR_PLAN.md`, phases 0-2 of the plan you read this evening).

Two things ARE visible, and they are the ones to look at:

- **The generated code reads as words.** Open an imported quiz in Advanced mode and find
  `var NOACG_BEHAVIOUR` in template.js: which layer plays which role is stamped on the artwork
  (`data-noacg-role="answer.selected/B"`), and the table says when each shows -
  `selectedAnswer:picked`, `main/locked` - in a shape you could edit by hand.
- **The naming page is generated from the word list the import reads.** `docs/SVG_AUTHORING.md`
  §5b's four tables come from `words.json`, and the build refuses a page that disagrees. The line
  that taught `Answer 1` for a vote and never worked is gone with the defect behind it: a file
  with answer rows AND bars is now read as a vote, and a heading called `Options` is no longer read
  as a fourth option.

## The route, under a minute

`/app` -> **Import graphic** -> drop `docs/svg-samples/quiz-board.svg` -> Next through to
Create project -> Advanced mode -> the code view, template.js, search `NOACG_BEHAVIOUR`.

Then `docs/SVG_AUTHORING.md`, section 5b.

## What to look at

- Whether the table reads as something you would dare to edit. That was the reason for making it
  words rather than ids.
- Whether the four naming tables on the docs page say what you would tell a student. They are
  generated now, so a wording change goes into `src/templates/behaviours/words.json` and the page
  follows.
