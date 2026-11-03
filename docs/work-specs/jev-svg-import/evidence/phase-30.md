# Phase 30: Update optional naming conventions and examples

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-18: "Existing generated naming docs/examples remain logical and correct, without making their
  names mandatory."
- Row 30: "Regenerate existing guidance and verify examples against behavior. Keep names optional;
  do not hand-maintain duplicate catalogs or redesign templates."

## Pinned main

Worktree from `83c21c3fd1c32a802052ac93720d4be0073cceab` (PR #1996, row 29). Previous verified
main: that SHA. Revert this row after it lands with `git revert -m 1 <merge sha>`.

## What was wrong

Read against the code rows 1 to 29 landed:

- **Credits.** The generated table (`words.json`), the wizard's credits summary line (it reads the
  same `verbs` and `buttons`), `docs/SVG_AUTHORING.md` 5b and 9, `docs.html` and
  `docs/END_CREDITS.md` all said an imported credits list is one text object that scrolls as fixed
  artwork and never becomes an editable list. Since rows 19 to 23 and #1958, credits drawn one
  layer per role and per name in two looks (role above, or beside) build in that styling with one
  editable list, as a roll, a still page or cards; fixed artwork is the deliberate `Show as` choice
  or the named fallback (`creditsPreview`, `BehaviourSection.tsx`, `draft.ts`).
- **Clock.** `docs.html` told a file with only a time layer to pick Countdown in What it does. The
  picker no longer offers Countdown there (`(timer || countdownDrawn)`); it offers the Clock
  choice with three modes (`clock.ts`, `svgClockRows`). Neither page described the Clock.
- `src/templates/importedDesign/AGENTS.md` said new credits imports scroll the original text; it
  now names the styled build, the artwork marker and `artworkLayers`.

## Decisions

- **One source for the credits words.** Only `words.json` changed for the table and the summary
  line; both pages were regenerated with `npm run write:behaviour-docs`. No second catalog.
- **The Clock has no words entry.** It has no named role (its time layer is picked), so a
  generated table would teach a name it does not read. It is prose in 5b and in `docs.html`.
- **Examples unchanged.** The two `end-credits.svg` files are one text object, so they are the
  fixed-artwork case. The docs now say so, and `scripts/check-example-layers.test.mjs` holds the
  files to that sentence (the taught `Credits` name is read by the importer's words; its text
  draws several baselines; both pages carry the claim). Mutation: stripping the `y` values makes it
  fail. An example of editable credits needs a new example file, outside this row: #1999.
- **Names stay optional.** The new text says no special names are needed for credits or the
  clock; the cheat sheet and `layer-names.json` are unchanged, because the examples they govern
  still follow them.
- **Commit trailers.** The repository's hook refuses `Co-Authored-By`; commits carry the session
  line only.

## Approved departure from TOUCHES

`docs/END_CREDITS.md` and `src/templates/importedDesign/AGENTS.md`, wording only, pre-approved in
the brief (fix #1958, PR #1962 /so point 1). This notes file is the row's phase notes.

## Verification

- `npm run check:behaviour-docs`, `npm run check:example-layers`: match.
- `node --test scripts/check-example-layers.test.mjs`: 19 of 19.
- `npm run gates -- run --changed origin/main`: exit 0.
- `e2e/docs.spec.ts` and `e2e/import-svg-credits.spec.ts` through the queue: see the PR.

## Traps

- `e2e-affected` lists nearly the whole suite for a `words.json` change; locally run the specs
  that cover exactly the change and leave the rest to CI.
