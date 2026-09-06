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

## Owner feedback, 2026-09-06 (recorded in `docs/OWNER_RULINGS.md`)

- `show:` and `choice:` stay the only two prefixes, and "require lock before reveal" stays a
  checkbox, until the students have used them. Do not reopen either.
- **No more work on the quiz.** It has its hard-coded control page and now opens bound.
- **The next session works through the OTHER graphics**, chosen for the two kinds of show the
  students will make: GAME SHOWS and LATE-NIGHT TALK SHOWS. The list we already have is the
  challenge set (`docs/BEHAVIOUR_AUTHORING_RESEARCH.md` §4, C1 to C8) and the plan's worked
  examples (`docs/SVG_BEHAVIOUR_PLAN.md` §9). The question behind it is what American TV already
  uses in those shows that needs special operator commands.
- The method is the plan's reuse test made real: draw the graphic as an SVG, import it, and see
  whether the system copes. Phase 6 (back to the wizard from the table) and the `arrange` spike
  for ranking wait behind this.

## Start the next session with this prompt

> Read `docs/handoffs/2026-09-06-svg-behaviour-system.md` and `docs/SVG_BEHAVIOUR_PLAN.md` §0,
> §7, §9 and §13, then work in a fresh worktree from `main`.
>
> The SVG behaviour system has landed and the quiz is done; leave it alone. Your job is the OTHER
> graphics. Our students will produce GAME SHOWS and LATE-NIGHT TALK SHOWS this term. First,
> investigate what American TV already uses in those two formats that needs special operator
> commands during the show (survey boards that reveal one answer at a time and count strikes,
> category and value boards, puzzle boards that reveal letters, bid and price reveals, a top-ten
> list stepped from ten to one, guest lineups that advance, desk polls, brackets, over/under
> calls, "coming up next" strips, applause and segment bugs). Cross that list with the challenge
> set in `docs/BEHAVIOUR_AUTHORING_RESEARCH.md` §4 and the plan's §9 examples, and pick the five
> or six complicated graphics that best test what the system can do. Write the pick and the reason
> for each down before building anything.
>
> Then, for each pick: draw it as an SVG the way a student would (layer names per
> `docs/SVG_AUTHORING.md` §5b, `show:` and `choice:` where they fit, no other prefixes), import
> it through the wizard, and report honestly which of four outcomes it is: binds with the shipped
> recipes and extras; needs a new field kind in `behaviourRuntime.ts`; needs a new recipe of the
> shipped shape under `src/templates/behaviours/`; or breaks the model (a comparison, a data
> condition, a second full recipe). Build what is a field kind or a recipe of the shipped shape,
> with its words in `words.json`, its marker block in `docs/SVG_AUTHORING.md` §5b
> (`npm run write:behaviour-docs`), its spec in `e2e/import-svg-behaviour.spec.ts` and its own
> owner-queue walk file. Record what breaks the model as a finding in
> `docs/SVG_BEHAVIOUR_PLAN.md` §13 with the graphic that produced it; do not bend the doctrine
> to fit it. Keep the SVGs you draw as a corpus under `e2e/fixtures/` so the specs drive the real
> artwork.
>
> Verify with the affected plan through the queue, land through `/queue-merge` when a graphic
> is finished, and file a walk per graphic that works so the owner can see it in under a minute.
> Do not touch `show:`, `choice:` or the quiz's lock checkbox: both are ruled to stay until the
> students have used them (`docs/OWNER_RULINGS.md`, 2026-09-06).
