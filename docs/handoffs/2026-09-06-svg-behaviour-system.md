# Session - the SVG behaviour system, phases 0 to 5

**Branch:** `claude/svg-behaviour-control-system-459532` (from `a3dcc68e`). **Date:** 2026-09-05
into 2026-09-06. **State:** finished, built, affected specs green (140 of 140), `origin/main` at
`582670b2` merged in (one `package.json` conflict, both sides kept), integration plan run, queued for
landing.

## What landed

The design in **`docs/SVG_BEHAVIOUR_PLAN.md`**, then phases 0 to 5 of it, in one night on the
owner's go-ahead ("work until phase 5, land when ready").

- **One binding format and one runtime replace the five behaviour modules.** Role stamps on the
  artwork (`data-noacg-role="answer.selected/B"`), a versioned `NOACG_BEHAVIOUR` table in
  design-owned JS (`src/blocks/behaviourData.ts`), one emitted paint runtime with a field-kind
  library (`src/templates/importedDesign/behaviourRuntime.ts`), and a compiler that turns a recipe
  plus a binding into everything the assembler needs (`importedDesign/behaviour.ts`).
- **Behaviours are declarations** under `src/templates/behaviours/`: quiz, score, countdown, vote,
  meter, alert, and the two instanced micro-recipes `switch` and `choice`. Role words live once in
  `words.json`; `scripts/behaviour-docs.mjs` generates `docs/SVG_AUTHORING.md` §5b from it and
  fails the build on drift (`npm run check:behaviour-docs`, `write:behaviour-docs`).
- **One tokenizer and one scorer propose a behaviour** (`behaviours/naming.ts`); two filed naming
  defects closed, and the student's `Option 1` quiz with drawn Pick/Right/Wrong moments now opens
  bound.
- **Switches and choices** on any hidden layer (`show:X`, `choice:Group/Option`, or the pickers in
  the new "Switches and choices" section), composing beside one full recipe (`composeParts`).
- **The moment ladder's rung 1**: an undrawn quiz moment wears NoaCG's own look, built by the
  runtime from the row's panel.
- **The quiz's first options**: require lock (default on) and reveal by itself; every rowless
  recipe is held by the wizard in one generic draft (`kind: 'recipe'`).

Owner-queue walks: `docs/acceptance/owner-queue/2026-09-05-one-binding-for-any-svg-behaviour.md`,
`2026-09-05-four-behaviours-one-table.md`, `2026-09-06-switches-defaults-and-options.md`.

## What is deliberately not done, and why

- **Pages** (the survey's biggest gap) wait for a bounded counter that reaches the control
  surfaces; a runtime that clamps while the operator's box runs past it is the drift `adjust`
  exists to prevent.
- **Ranking** (the owner's "amazing") waits for an `arrange` spike: moving the designer's layers
  under the fit ladder is a paint mechanism to measure before it is a recipe.
- **Two full recipes on one graphic** are refused: each owns the default path.
- **Phases 6 and 7** (back to the wizard from the table; the sentence board) are P2's.

## Traps that exist in no repo file

- **A regex in `words.json` written from Python is a backspace.** `"\\bbar\\b"` in a Python
  string is `\b` in the file, which JSON reads as U+0008. Write the JSON by hand or from a raw
  string; the docs check caught it as "the docs teach Meter but the matcher would not read it".
- **A machine event must be a bare identifier**, so an instanced recipe namespaces events and
  group ids with `ctx.nsId`, never `ctx.ns` - the shape gate refuses the dotted role namespace
  with a message about branches and parallel groups, which sends you to the wrong place.
- **The self-contained gate reads any `http` URL in template JS as a network dependency.** The
  SVG namespace for `createElementNS` is taken from the artwork's own `namespaceURI`.
- **The copy-tell gate counts em-dashes per file.** A new user-facing string copied from an old
  one's style fails the build; the deleted module's baseline row needs `check:copy -- --update`.
- **`catalog:affected` reads the change as catalog-wide** (structure.ts, validateTemplate.ts);
  `check-catalog-emit` passing on all 504 designs is the proof no design moved, and the rendered
  sweeps were not run on that basis.

## Where to look next

Phase 6 in the plan (reconstruct the mapping draft from the table) is small and closes
`docs/backlog/back-to-the-wizard.md`'s second half. The `arrange` spike is the interesting one.
