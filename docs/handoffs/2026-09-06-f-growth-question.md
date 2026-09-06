# Session F - should the growth question exist

**Branch:** `claude/f-growth-question`. **Merge-base:** `8c1b39b`. **Date:** 2026-09-06.
**State:** finished, built, `/check` run (see the verdict at the end). **Not pushed, not queued** -
this ran in a Claude Code cloud container with no CI and no landing queue; the orchestrator
integrates the branch.

## READ THIS FIRST IF YOU ARE MERGING MapSvgFieldsStep.tsx

The launch prompt told this session its worktree already carried rows A and C. **It did not** - the
branch is cut from `8c1b39b`, so the `MapSvgFieldsStep.tsx` edited here does **not** contain row C's
work (name hints under empty pickers, the unmatched-count notice, the fill-them-in button with its
per-box reasons and scoped undo). None of that was seen, touched, or reasoned about here, and no
attempt was made to pull it in.

**What this branch does to that file, as intent rather than diff** - all of it inside the
`map-svg-followers` block, which is the "What else moves" sub-list of the growth section:

1. **Removed the per-row `<select>`** that offered *Moves out of the way* / *Grows by the same
   amount*, and the `canStretch` helper that existed only to decide whether to show its second
   option. The row now renders the layer name, a static statement of what the row's stored `mode`
   does, and the unchanged ✕.
2. **Reworded that block's ⓘ second paragraph and the ✕ tooltip.** The old ⓘ paragraph explained
   the two modes; the new one says what ✕ does and that a layer spanning the panel grows with it
   either way. The tooltip went from "This one stays where it was drawn" to "Take this one off the
   list", because the first is false for a spanning layer.
3. **Touched nothing else in the file** - not the field checklist, not the pickers, not the growth
   ladder select, not the panel picker, not the per-panel overrides.

A three-way merge should therefore take C's version of the file wholesale and re-apply exactly
those three edits inside the followers block. If the merge is ever ambiguous, the intent is: **that
sub-list declares WHICH layers travel and never HOW each one behaves.**

## The ask, and how it was settled

Owner receipt (deleted by this branch; `git show ce67f59^:docs/backlog/should-growth-followers-be-a-question.md`):

> I feel like this option seems unnecessary ... when the question becomes long and the box gets
> bigger, everything else should just move out of the way.

The receipt itself said to settle it with the corpus rather than by taste. Commit `ce67f59` records
the numbers **while the old behaviour was still in the tree**, so the measurement is on the record
independent of the change it justified.

**Method.** Rolldown-bundle `src/assets/svgImport.ts`, open the container's Chromium on a blank
page, mark up each of the 47 files in `e2e/fixtures/svg-corpus/` with the REAL importer, render the
marked artwork at design size, then run faithful copies of the four predicates that decide the
question - `proposeFollowers`, `canStretch`, `panelsHoldingText` (`MapSvgFieldsStep.tsx`) and
`svgCollectSpanners` (`templates/importedDesign/svg.ts`) - over EVERY panel a reader could pick as
the grower against BOTH axes, so no number depends on which panel the measured default lands on.
The instrument was a scratch file, deliberately not committed; the method above rebuilds it in
about twenty lines.

**The numbers.** 47 fixtures, 46 importable (`geometry-unescaped-ampersand` refuses by design).
172 panel x axis combinations. **79** follower rows carried the question, in 16 files. **35** of
those offered the second answer at all (the other 44 are groups, pictures and outlines, already
move-only), in 10 files. **0** of the 79 were a layer that should stretch.

**Why zero is structural.** A row in that list is a layer drawn PAST the growing edge; a layer that
must stretch is drawn TO BOTH of the panel's edges. The sets cannot intersect, so the question was
asked exactly where its second answer could not be right. Hand-read of the ten files agrees: a
timer bar below a board, a divider right of a ticker flag, a card below an ident.

**What genuinely stretches was never the control's job**: 31 spanning layers across 23 of the 46
files, found and grown at play time by `svgCollectSpanners`, in the same breath as end caps.

## The decision, and what shipped

**The question is gone.** Each follower row states what it does and keeps its ✕; the list declares
which layers travel and no longer asks how.

- **`svgCollectSpanners` now runs even when a rule carries a declared follower list** (`627144d`).
  It used to be skipped there, so the moment a reader edited what travels the rail on their lower
  third silently stopped growing with its plate. Removing the picker without this would have taken
  the last road to stretching away from the artwork that needs it. **Pinned by a spec proven to
  fail without the fix**: reverted, the board grows 11.7 px and the rail grows 0.
- **The road for the rare file is the generated code** - `NOACG_LAYOUT`'s comment now says a
  follower travels by default and what `mode: 'grow'` does. Saved templates carrying `'grow'` still
  stretch, so nothing needed a migration; `SvgFollowerDraft.mode` stays two-valued and says why.
- **The receipt is deleted** per `docs/backlog/README.md` ("Landed is not a state"), with the
  doctrine moved to `docs/TEXT_BOX_BINDING.md` §"What travels is not a question - settled
  2026-09-06". `docs/SVG_IMPORT_PLAN.md` §6c claimed "no geometry rule separates" stretch from
  move; amended in place, because the measurement refutes it.

## What `/check` found and fixed (`d21610a`)

The review found four real defects in the above, all fixed and re-verified:

- **A `'grow'` follower that cannot grow wrote a garbage transform.** Growing remembers an
  attribute map, travelling remembers a transform string, and the demotion happened *after* the
  pose was captured - so the layer travelled with the map and `svgTravel` produced
  `translate(12,0) [object Object]`. Blink discards an invalid transform list whole, taking the
  designer's own transform with it, and the restore then put back a size nothing had changed. The
  mode is now decided before the pose is captured. Pre-existing for saved templates; my unconditional
  spanner sweep widened how it could be reached.
- **The sweep collected shapes it could never stretch** (circle, ellipse, polygon carry no
  width/height attribute) - which fed the above. It now skips them.
- **The sweep's dedup compared identity only**, so a rail inside a declared group got the group's
  translate *and* its own stretch. Containment is now checked both ways.
- **The row hard-coded "Moves out of the way"** regardless of the stored mode, and the ✕ tooltip
  plus the ⓘ promised a freeze that spanner collection makes false. Both now state the truth.

Simplify (inline) found one thing: `svgRestOneRule` resolved `.noacg-art` twice; the second query
is gone.

## Verification

- `npm run build` green, stamped `claude/f-growth-question@…` each time (a green build on the wrong
  tree is the thing that stamp exists to catch).
- `e2e/import-svg.spec.ts`: **76 of 77**. The one failure, `hovering a checklist row highlights that
  layer in the preview`, **reproduces on the merge-base `8c1b39b` with this branch stashed**, so it
  is not this work. Filed as `docs/backlog/hover-highlight-spec-red-in-a-cloud-container.md` with
  the measurement and the likely one-line fix.
- `e2e/import-svg-corpus.spec.ts` + `e2e/import-svg-behaviour.spec.ts`: **40 of 40**, run again
  after the check's fixes. This is the gate that measures rendered geometry across the corpus.
- **Taste**: `svg-import-sweep --shots` on `illustrator-internal-css-lower-third` (a spanner-bearing
  lower third) rendered clean - plate, three lines, and the amber rail flush from the plate's top
  edge to its bottom. The GROWN state was verified numerically rather than as a picture (the rail
  spec measures the rail growing by exactly the board's growth), which is the honest limit of what
  was looked at.

## Traps worth knowing

- **A first full run died on `ENOSPC` while printing a passing tail and `exit code 0`.** Playwright
  artifacts plus sibling worktrees filled the disk; workers were being killed as the reporter
  summarised. A run ending in `ENOSPC` is not a verdict.
- **The corpus's `every file arrives on the too-long answer` test stops AT its own `test.slow()`
  ceiling in this container** (3.0 min for 47 fixtures through the app) and reports as a failure at
  `startNewProject`. It passes at `--timeout=900000`. Per the root contract, a job that stops at its
  own timeout is not a verdict - do not bisect on it.
- **This container has no CI and no landing queue**, so the pre-merge gate that does strictly more
  has not run against this branch.

## What is NOT done

- **Nothing is pushed, queued or merged.**
- **No spec covers a DECLARED `mode: 'grow'` follower end to end.** The spanner path is covered by
  the new rail spec, but the picker that used to generate a declared `'grow'` is gone, so no UI
  route can produce one - and `draft.ts` still promises saved templates carrying it keep working.
  The honest gap: a future refactor of `svgFollowersOf`'s grow branch would go green while breaking
  those. Worth a fabricated-template spec.
- **A spanning layer can no longer be pinned "stay exactly as drawn".** Before, declaring any
  follower list disabled the sweep - which is the bug that was fixed, but it did make that state
  reachable by accident. It is now representable only as "travels" (list it) or "stretches"
  (leave it). Accepted deliberately, on the end-cap precedent that panel furniture is not an
  author's decision; recorded here because it is a real narrowing.
- **The spanner sweep now runs per rule per update** rather than short-circuiting on a declared
  list, alongside the end-cap sweep that already did. Bounded, but it is the `update()` hot path;
  the two sweeps read almost the same nodes and could share one pass.
- **The per-row wording is a taste call the owner has not seen** - five rows all reading "Moves out
  of the way" may be noise. First item in
  `docs/acceptance/owner-queue/2026-09-06-f-one-less-question-on-import.md`.

## /check verdict

`review: delegated` (11 findings, 6 fixed, 5 reported) · `simplify: inline` (Agent tool
unavailable, single pass) · `verify: inline` · `taste: answered` · verdict
**pass-with-known-gap** (the pre-existing hover spec, and no CI here). Stamp at
`.git/noacg-jobs/checks/claude-f-growth-question.json`, `reviewedSha` `d21610a`.
