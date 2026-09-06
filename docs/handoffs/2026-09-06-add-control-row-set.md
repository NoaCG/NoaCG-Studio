# Session - the `add` control, the `row-set` kind and the bingo caller

**Branch:** `claude/add-control-row-set-field-d1d013` (from `main` `296df0ef`). **Date:**
2026-09-06. **State:** see the wrap-up at the bottom - the focused walks, the build and the
affected plan are the three verdicts, and the branch is queued for landing only once all three
are green.

## What landed

The game-shows session (`docs/handoffs/2026-09-06-svg-behaviour-game-shows.md`) left one
mechanism three of six graphics asked for and one field kind the plan named and never built.
Both are here.

- **`add` and `remove` on `MachineControl` / `TypeControlEvent` / `ControlButton`** - the fourth
  member of the payload family and its honest inverse (`docs/CONTROL_LAYER.md`, "Buttons come
  from the machine"). `add: { <listField>: <sourceField> }` appends the source's current value to
  the list as a line unless it is already one; `remove` takes the last equal line out. The whole
  list rides as ordinary payload, so the machine applies it only on an accepted press and every
  surface writes it back into its own box. Resolved in ONE place per surface: `controlModel.ts`
  (`addedValue`, `removedValue`, `eventPayload`, `movedKeys`, the new `sourceKeys`,
  `adjustWords`), the inlined copies in `controlPanelHtml.ts` and `productionControllerHtml.ts`,
  `compileControls` (refuses a non-`lines` list), `animData.ts` (shape gate: one road per field,
  add and remove never both on one list; canonical serialization with sorted keys), the validator,
  the OGraf writer and reader (`v_noacg.add` / `.remove`, the list taken out of the plain payload
  keys), and the bridge's type summary. The empty-source rule is deliberate: nothing rides, so a
  press cannot blank a board.
- **The exported panels repaint every box a press moves, not only numbers.** Both generated pages
  registered a repainter for number inputs alone, so a `set` on a select (the survey's Reveal 3
  writing `on`) or a text box landed in the panel's state without moving what the operator saw.
  Text, line list and select (segmented and dropdown) now repaint too.
- **The puzzle got Guess, Reveal letter and Take back a letter** on a `letters` group of one
  state; the revealed letters became a `lines` field the puzzle kind still reads typed on one line.
- **`row-set`** in `behaviourRuntime.ts`: `listed` / `unlisted` / `last` per row, `any` / `none`
  for the whole list, and the derivations `count`, `last`, `key`.
- **The bingo caller** (`src/templates/behaviours/bingo.ts`, `e2e/fixtures/svg-shows/bingo-board.svg`,
  the seventh show graphic): Call it rides `add`, Take back `remove`, New game `set`; the tile
  numerals are a per-row `write` role deriving the row's own key, which is what keeps a named
  numeral out of the operator's fields.
- Words in `words.json` (the bingo entry, the puzzle's buttons line), the generated §5b tables,
  the shows doc's §4d and new §4g, plan §13's "The list twin, built", two owner-queue walks, two
  backlog items for the import traps, and the rules in `src/templates/behaviours/AGENTS.md`.

## Findings

- **The two-row-set question stays open.** A five-by-five bingo grid is ONE keyed repetition,
  so it never needed a second row set; the bracket, the Jeopardy board and the case board need two
  independent ones on one recipe, and nothing here made that declaration's shape obvious. Recorded
  in plan §13, not designed.
- **`ProductionPage.fireEvent` mirrored EVERY moved key into the cue**, with `''` for one the
  payload did not carry. Harmless for `adjust` and `set` (always on the wire); for an `add` whose
  source box is empty it would have wiped the list. It now mirrors only what rode.

## Traps that exist in no repo file

- **A backtick in a comment inside `controlPanelHtml.ts` or `productionControllerHtml.ts` closes
  the page's template literal**, exactly as the game-shows handoff said of `behaviourRuntime.ts`.
  Three comment backticks around `set` produced TS1005 / TS1443 on lines that looked innocent.
- **A hidden `<text>` is not a text candidate**, so a written look role's layer (the bingo's big
  number) has to be drawn VISIBLE; the runtime hides it until its rule holds.
- **`words.json` is CRLF**; a splice that writes LF lines makes a mixed-endings diff. The entry was
  added with a script that kept the file's own line endings and inline arrays.

## Where to look next

The bracket's cross-row lookup is still the one design question the reuse test left. The
`static:` prefix in `docs/backlog/decorative-numerals-arrive-as-fields.md` is the smallest change
that would retire the numerals trap for every recipe at once.
