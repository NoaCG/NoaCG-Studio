# Session - game-show and late-night graphics on the SVG behaviour system

**Branch:** `claude/svg-behaviour-game-shows-518d88` (from `8df51e2c`, `origin/main` `75f4ffc7`
merged in). **Date:** 2026-09-06. **State:** finished; the six show walks green
(`e2e/import-svg-behaviour.spec.ts`, queue job j-0661, 6 of 6); build queued (j-0668) and the
affected plan queued behind another session's suite (j-0669); queued for landing.

## What landed

The owner's 2026-09-06 brief (`docs/OWNER_RULINGS.md`): the quiz is done, work the OTHER
graphics, filtered by what the students will make - game shows and late-night talk shows.
**`docs/SVG_BEHAVIOUR_SHOWS.md`** is the investigation, the pick of six graphics with the reason
for each, the honest first import of each file through the shipped wizard, and the outcome.

- **Five recipes of the shipped shape** under `src/templates/behaviours/`: `survey` (Family Feud:
  reveal in any order, three strikes, a summed total), `list` (a top ten stepped from ten to one
  on Next), `lineup` (who is on now, who has been on), `puzzle` (letters revealed from a typed
  phrase), `reveal` (typed text sealed until one press). Words in `words.json`, tables generated
  into `docs/SVG_AUTHORING.md` §5b.
- **Three field kinds** in `behaviourRuntime.ts` (`counter`, `list`, `puzzle`) and the
  `row-pick` order facts `before` / `after`.
- **Two additive shapes**: a rule about ONE row (`LookRule.row`) and a recipe owning a field per
  row (`RecipeField.row`). Neither bumps the table's version.
- **The wizard's generic draft holds rows and field roles** (`SvgRecipeDraft.rows`,
  `DesignSvgRecipeBehaviour.rows` / `.fields`), so every recipe with rows is proposed, picked
  and persisted through one shape; the behaviour list on the Fields step reads the registry.
- **The corpus**: six student-style SVGs under `e2e/fixtures/svg-shows/`, mapped to the
  behaviour spec in `scripts/e2e-affected.mjs`.
- Six owner-queue walks under `docs/acceptance/owner-queue/2026-09-06-*`.

## The findings (recorded in `docs/SVG_BEHAVIOUR_PLAN.md` §13)

- **No control can append to a list field.** The puzzle's "Reveal R", the bracket's "advance"
  and a bingo caller's "call 42" all want it - the list twin of `adjust` §9e named. The puzzle
  ships on the data road (type the letter, Update). A fourth payload member, `add`, resolved on
  the control surfaces like the other three, is the design; not built.
- **A recipe carries ONE row set and a grid has two** (bracket, Jeopardy, Deal or No Deal). The
  bracket binds as data plus a choice and a switch, which is brief C6's own answer; the cross-row
  lookup ("the winner's name moves up") is a kind derivation the doctrine allows and the one-row
  shape cannot host.
- **Two import traps**: a text layer named after its own sample text loses its name to its
  parent group (`namesItsOwnCopy`); decorative numerals arrive as fields to untick. Backlog
  material, not filed as backlog items here.

## Traps that exist in no repo file

- **A backtick inside a comment inside `behaviourRuntime.ts` closes the template literal.** The
  runtime is one big template string; `spec.when` in backticks in a comment produced a TS1005 at
  a line that looked innocent.
- **`rows.role` must name a declared role id** or `proposeBinding` finds no rows and the recipe
  is silently never proposed (the puzzle's row role was `tile.letter` for one round).
- **The queue's 4 GB floor stalls for as long as the Codex and Antigravity apps are open**;
  `npm run reclaim -- --apply --include-heavy` is the sanctioned way to free them, and it was what
  let j-0661 start after thirty minutes of waiting.
- **A heredoc through the Bash tool fails on a single quote inside a `'EOF'` body** on this
  machine; write the block with the Write tool and `cat` it in.

## Where to look next

The `add` control (the list twin of `adjust`) is the one mechanism three of the six graphics
asked for; it is contained to `controlModel.ts`, `controlPanelHtml.ts` and `compileControls`. The
two-row-set recipe is the design question the bracket left. Phase 6 of the plan (back to the
wizard from the table) now has a generic rowed draft to reconstruct into.
