# Wrapped text on an imported graphic can leave a short, stranded last line

**Filed:** 2026-09-26. **Source:** handoff of `claude/h-quiz-question-wraps` (2026-09-21),
re-checked against `src/templates/importedDesign/svg.ts` on 2026-09-26.

## Why

Outcome 1 in `docs/GOALS.md` asks that text fits its box for short and long values and that the
result looks premium. The runtime that wraps a long value on an imported SVG graphic breaks lines
greedily: it fills each line as far as it goes and puts whatever is left on the last one. A long
quiz question on the lower-third quiz fixture wraps to a full first line and a second line of two
short words ("made of?"). It fits and nothing overflows, but a stranded last line reads as a layout
accident on air, and the same happens on every wrapped field, not only on quiz questions.

## What it would take

- Balanced breaking in `svgWrapLines` (`src/templates/importedDesign/svg.ts`): once the greedy pass
  knows how many lines a value needs, choose the breaks that make those lines closest in width
  (or, more cheaply, pull words down until the last line is at least a set share of the widest).
  Same line count and same size; only where the breaks fall moves.
- It changes every wrapped graphic, so it needs the import corpus sweep
  (`e2e/import-svg-corpus.spec.ts`) and a look at the catalog emit fingerprints before and after.
- A spec case with a value that currently strands its last words, asserting the last line is no
  longer much shorter than the others and the line count is unchanged.

## Evidence

- `svgWrapLines(el, value, budget, max)` pushes a line only when the next word would overflow the
  budget: a greedy fill with no look-ahead.
- `e2e/fixtures/illustrator-quiz-lower-third.svg` with a 131-character question: two lines, the
  second one "made of?".
