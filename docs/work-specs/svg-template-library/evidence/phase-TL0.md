# Phase TL0 evidence: inventory and gate

Base: `main` at `df0c7a0e15b7b8d87ced52c8db73120d85dc1965`. Acceptance for this phase: AC-2 as a
gate with `planned` rows allowed, and AC-8 for the D5 labels.

## AC-2 (gate form): every row in scope, covered rows held to their proof

- `docs/template-library/coverage.json`, generated from the registries by
  `node scripts/template-coverage.mjs --write`: 101 rows. 72 types (registry), 8 untyped kinds
  (end credits scroll, columns, pager, crawl, static; versus; frames; Picture), 17 recipes, 4
  feature contracts (Join link, Message, Vote results, word cloud target). Of the 197 untyped
  catalog designs, 195 map to a row (by `variants`, a `looks` variant with its capability, or
  their category); the two import doors (imp01, svg01) are excluded.
- 31 covered: 12 types (lower-third, title-card, holding-screen, countdown, quiz-board,
  scoreboard, duel-score, standings, live-poll, goal-meter, process-steps, roster), end credits
  scroll and columns, all 17 recipes. 70 planned with their phase: TL1 7, TL4 29, TL5 28, TL6 6.
- Every covered row names its proof test, a case text found verbatim in it, the inventory the test
  loops over (each template listed there with the row's recipe), and what it observes, limited to
  what that case asserts (after the final /so). What a covered route still owes is an open
  `extensions` entry with its phase: 7 rows carry one (countdown, scoreboard, duel-score,
  live-poll, goal-meter, end-credits-columns in TL4; standings in TL5).
- `coveredFloor` lists the 31 covered rows; a listed row that is not covered fails (demotion
  ratchet), and regeneration keeps the list. The
  proofs are `e2e/svg-templates.spec.ts` and `e2e/svg-examples.spec.ts`, neither quarantined.
- The gate is `scripts/template-coverage.test.mjs` (build tier). It fails when a registered id
  has no row, a row names an unregistered id, a covered row loses a template, its proof file or
  case, its inventory entry or recipe, its proof spec is quarantined, a planned row has no
  mechanism, proof or phase, or an untyped design maps to no row. `--complete` refuses planned
  rows (TL7).
  - `node --test scripts/template-coverage.test.mjs`: 8 pass, 0 fail (fixture cases for each
    failure, then the real registries through Vite).
  - Mutation: moving `docs/tutorials/svg-templates/SVG/quiz.svg` away made
    `node scripts/template-coverage.mjs` exit 1 with
    `type quiz-board: template docs/tutorials/svg-templates/SVG/quiz.svg is missing`.
- The proofs pass: see Browser checks below.

## Illustrator exports archived (D2)

- `e2e/fixtures/illustrator-exports/`: the 19 Illustrator 30 exports, byte for byte from `main`.
  `scripts/illustrator-exports.test.mjs`: 2 pass (every file an Illustrator export, a look-wrapped
  line present, identical to the download while it exists).

## AC-8 (D5 labels): one name per concept, ids unchanged

- `docs/template-library/names.json` lists 16 concepts with the recipe, type and kind label that
  carry each name, and the retired labels. `scripts/concept-names.test.mjs`: 5 pass. It checks
  the real registries and `graphicKindLabel`, that no two recipes or types share a name, and that
  none of 474 user-facing files (app UI and type files read as strings and JSX text through the
  TypeScript parser, docs pages, SVG authoring guide,
  tutorials, docs examples, skill copies, CLI README) uses a retired label.
- Renamed labels (ids, role words, field titles and persisted keys unchanged):
  - recipes: score "Score tracker" to Scoreboard; meter "Meter" to Goal meter; alert "Alert" to
    Pop-up alert; credits "Credits roll" to End credits.
  - types: roster "Roster / ordered list" to Lineup; standings "Standings / result table" to
    Standings; result-board "Vote result" to Vote results; alert-level "Alert" to Alert level.
  - chip kind labels: Timer to Countdown, Credits to End credits, Holding to Holding screen.
    Results stays: that family also holds lineups, brackets and timing towers. Alert stays as
    the family word for the alert category (Alert level types and breaking banners).
  - end credits descriptions (cr02, cr13) and the editor's refusal for a key on imported end
    credits (`CREDITS_REFUSAL`, its assertion in `e2e/editor-fidelity-trim.spec.ts` follows).
    The emitted CSS comment in `importedDesign/creditsRoll.ts` keeps its words: it names a
    section of exported code, and exports are out of scope.
  - the standings design description: "A quiet result table" to "Quiet standings".
  - inventories and templates: Score tracker, Meter, Alert, Credits roll, Digital clock and
    timer, Editable credits; Game timer to Countdown, Show countdown to Show clock (it runs the
    Clock recipe). Slugs unchanged. READMEs, CLOCKS.md, EDITABLE-CREDITS.md, SVG titles, the
    docs page, the authoring guide, the layer cheat sheet and both skill copies follow.
  - Stale counts removed ("Eleven ready-made", "There are thirteen").
- Zips repacked: `pack-svg-examples.mjs` (4 pages) and `--set templates` (2 pages).

## Checks

- `npm run gates -- run --changed origin/main`: every check ok, 20 test files, 278 tests, 0 fail.
- `npx tsc --noEmit -p tsconfig.json`: exit 0. `npx eslint` on the changed files: clean.
- Browser checks, job j-0001 (`npm run test:e2e -- e2e/svg-templates.spec.ts e2e/svg-examples.spec.ts
  e2e/downloads.spec.ts e2e/docs.spec.ts`): 76 passed in 2.2 min, 0 failed. Test titles show the new
  names ("Countdown template imports...", "Pop-up alert: its Illustrator export imports...").

- `node scripts/check-catalog-emit.mjs`: PASS, 539 designs. The rendered catalog sweeps were not
  run: only names and descriptions changed, which no design draws; CI's Factory gates job runs.

## Not checked here

- `e2e/import-svg-behaviour.spec.ts` and the wider affected list (types.ts reaches most specs):
  left to the PR's CI. Its assertions name no changed label (searched).
- The docs screenshot `public/docs/type-scoreboard-fields.png` still shows the old option text
  "Score tracker" inside the picture; its alt text and caption are updated. Re-shooting it
  (`node scripts/docs-shots.mjs --only=type-scoreboard-fields`) showed "Scoreboard. A point per
  press..." but the analytics consent card now covers the lower right of every shot, so the old
  picture is kept; filed as #2679.
