# Handoff: one layer-naming system (row B, night wave 2026-09-24)

Branch `claude/b-one-naming-system`, worktree `.claude/worktrees/agent-a4a68b621409daed9`.
Ruling and revert: `docs/OWNER_RULINGS.md`, section "2026-09-24 - one layer-naming system".
Owner walk: `docs/acceptance/owner-queue/2026-09-24-b-one-naming-system.md`.

## The settled names, for row E to draw from

| What | Name | Where it lives |
|---|---|---|
| Top layers (top of the Layers panel first) | `Text`, `Moments`, `Board` | three top-level layers; `Moments` only when the graphic has a moment |
| Background | `Panel` | Board |
| A plate under one text | the text's name plus `box`, row last: `Question box`, `Answer box A`, `Score box 1`, `Credits box` | Board |
| Fixed words | `static:` + name: `static:Letter A` | Board |
| Anything else drawn | any English name (`Edge`, `Rule`) | Board |
| Show intro (title) | `Title`, `Subtitle` | Text |
| Name tag | `Name`, `Role` | Text |
| End credits | `Heading`, `Credits` (ONE text with the whole list; title lines end in `:`) | Text |
| Quiz | `Question`, `Answer A` to `Answer D`; moments `Selected A`, `Correct A`, `Wrong A` (per row), `Locked in` | Text / Moments |
| Score tracker | `Team 1`, `Team 2`, `Score 1`, `Score 2`; optional moments `Flash 1`, `Flash 2`, `Full time` | Text / Moments |

Every behaviour word is the `teach` spelling in `src/templates/behaviours/words.json`; the check
reads it from there, so row C's `Credits` and `Credits box` count the moment C lands. The names
are English. A hidden moment is a GROUP with its eye off; a bar (`Bar 1`, `Timer bar`) is drawn
full and left visible. Style the Credits text in the name look and give each title line its own
style (the pattern in `public/docs/examples/end-credits.svg` and in row C's fixture).

## The empty-Moments decision, and its evidence

A graphic with no moments has NO `Moments` layer. Probe on 2026-09-24 through Illustrator 2026
(30.1) COM scripting: a document with layers Text, Moments (empty) and Board, saved with
`exportFile(ExportType.SVG)` (the plug-in Save a Copy > SVG runs), came out with only `Board`
and `Text`; adding one empty hidden group to Moments changed nothing, and an empty group in
Board was dropped too. The `.ai` kept all three layers. So the check never requires `Moments`,
and refuses an empty one in hand-written files. E: do not draw an empty Moments layer.

## What landed

- `src/templates/behaviours/layer-names.json`: the one source (layers, `Panel`, `box`,
  `static:`, the simple types' field sets, the five-line cheat sheet).
- `scripts/check-example-layers.mjs` (`npm run check:example-layers`, a build gate) and its
  mutation test `scripts/check-example-layers.test.mjs` (17 tests: every drift the owner saw,
  the things the system allows, the folder walk over a throwaway repo, a genuine Illustrator
  file in `scripts/fixtures/illustrator-talk-show-quiz.svg`). `--write` rewrites the cheat sheet
  (`npm run write:layer-cheat-sheet`) into `docs.html#svg-layers`, `docs/SVG_AUTHORING.md`, both
  skill contract copies and both noacg-graphic-local adapters. Pass folders as arguments to
  check files outside the covered set: `node scripts/check-example-layers.mjs <dir>`.
- Examples: quiz plates `Answer box A` to `D`; ticker `Panel` and `Kicker box`; end credits
  `Heading` plus one `Credits` text; new `public/docs/examples/name-tag.svg`, which now feeds the
  import walk and its Fields picture. Docs trees, the Board and simple-type sections, docs.spec
  pins and five docs pictures follow.
- Rule `templates/name-every-layer-svg-you-draw`, scoped to the examples, tutorials, samples,
  `scripts/illustrator/**`, the skill and the authoring page.
- `docs/svg-samples/README.md` says it does not follow the system, with the measurement (all 24
  fail the check). Two samples had `font-family: Source Serif 4` unquoted, which is invalid CSS;
  quoted, and both still import the same fields.
- The 2026-09-21-l handoff is consumed and deleted: its item 7 (two New graphic titles) is
  already identical on main in `NewGraphicButton.tsx`; the samples item is answered above; the
  name-from-file string comparison stays accepted; its quiz-spelling question is folded into
  the ruling.

## Verification

- `npm run build` exit 0 on the final tree (twice: `6cdd6687`, `65fb3791`), the new gate in it.
- Mutation shown on broken copies of each covered folder (examples, a tutorial's
  `import-ready/`, a tutorial's `SVG/`): each exits 1 naming the file and the fix; the unbroken
  copies exit 0. The exempt talk-show folder fails when pointed at directly.
- Through the queue: docs, quiz-live-consistency and wizard-preview specs 43 passed (j-1829);
  the four docs-example tests in import-svg-behaviour 4 passed (j-1836); docs.spec 17 passed on
  the final tree (j-1842); svg-samples-check 2 pass (j-1839).
- `/check`: `review: delegated` (code-review skill, scope matched the branch at base
  `2ef02332`; 10 findings, all 10 fixed in `65fb3791`), `simplify: inline` (the skill returned
  fan-out instructions; one HTML escape and one examples path deduplicated), `verify: inline`.
  `taste: answered`: the five re-shot pictures were opened; the credits render fell back to a
  default serif (the unquoted font, fixed and re-shot). One NO stands, see below.

## What is left

- **The credits Fields picture shows the pre-roll state**: until row C lands, a `Credits` text
  imports as one wrapping paragraph ("Camera: Ina Berg Noel Kivi Sound: ..."). Whichever of B
  and C lands second re-shoots it: `node scripts/docs-shots.mjs --only=type-end-credits-fields`
  (dev server up), and C should check its roll against `public/docs/examples/end-credits.svg`.
- `docs.html#end-credits` "A scrolling roll" still says an imported credits graphic does not
  scroll; C owns that paragraph.
- The talk-show set is exempt by name; remove its `EXEMPT` entry when the owner deletes it.

## Traps not in any repo file

- A Playwright job can fail with "Port <n> is already in use" when this worktree's dev server
  is up and answers slowly; re-queue it. Do not chain queue jobs with `--after` on a job that
  might fail: the dependants die with it.
- The sandbox refuses Bash lines that combine git with pipes or loops, and `node -e` programs
  with shell escapes; write the script to the scratchpad and run it.
