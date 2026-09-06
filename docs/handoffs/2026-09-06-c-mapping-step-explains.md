# Handoff: the mapping step explains itself (session C)

**Branch:** `claude/c-mapping-step-explains` (from `8c1b39ba37`, two commits: `7db7a20`,
`6b84603`). **Date:** 2026-09-05 into 2026-09-06. **State:** built green, checked, NOT pushed,
NOT queued - the orchestrator integrates this branch. Cloud container: no browser, no dev
server, no landing queue.

## What landed

All three in-product asks of
`docs/backlog/the-mapping-step-should-explain-and-offer-to-do-it.md` (ask 4, the CLI road, was
out of scope and is untouched).

1. **The name under an empty box** (`NameHint` in `MapSvgFieldsStep.tsx`): `name it “C selected”`,
   `name it “Score 2”`, `name it “Timer bar”`. Derived, never copied: `namesThatFill`
   (`src/components/wizard/fieldAutoMap.ts`) takes `teach`/`also` from `words.json`, re-keys the
   example to the row, and keeps only names `matchRole` accepts for that row. A rule the matcher
   drops stops being shown the same moment. The row's key is the one the matcher reads off the
   row's own layer (`rowKeysOf`): a board named `Answer 1..4` is taught `1 selected`, which is
   what the drop honours; an unnamed board falls back to positional keys.
   The quiz's boxes are now **Selected / Correct / Wrong** and the countdown's are the docs'
   words (`roleLabel` reads `words.json`) - the vocabulary ruling of
   `docs/SVG_STATES_FROM_ARTWORK.md` §7, ratified 2026-09-03 and not applied until now.
2. **The unmatched notice** (`map-svg-unmatched`): "13 boxes below are still empty, and the file
   has 5 layers nothing is using. Their names did not say what they are. Name them as the line
   under each box says and drop the file again, pick them by hand, or press Fill them in and
   check what it chose."
3. **Fill them in** (`proposeFill`), with one **Undo**. Every pick carries a reason shown under
   its box (`filled: the red drawing on row A`) while the box still holds that pick.

Docs: `docs/SVG_AUTHORING.md` §5b gained the paragraph describing the three; the generated
tables are untouched (`check:behaviour-docs` green). `src/components/wizard/AGENTS.md` carries the
rule (one sentence; 9.8 KB headroom left on that chain). Owner-queue item:
`docs/acceptance/owner-queue/2026-09-06-c-the-mapping-step-explains-itself.md`.

## Decisions taken (design defaults - revert where wrong)

- **The threshold for the notice is THREE empty boxes**, and only when the file holds at least
  one unused layer of a pool an empty box draws from. One or two empty boxes are what the line
  under each already answers; three with unused layers is where clicking through becomes the
  chore the owner named. A board with nothing hidden shows no notice: its boxes are empty because
  there is nothing to put in them, which is a valid board (rung 1 of the ladder), and twelve
  amber lines on a valid board would read as twelve faults.
- **The hint under a box is grey and 11px**, not amber, for the same reason. The notice above is
  the loud version.
- **The fill's ladder, most certain first**: names through `matchRole`; the question takes the
  topmost unused text; row text (answers, teams, options) top to bottom, words before figures; a
  row's figure is the numeric text sitting on the row; a row's drawings are the unused HIDDEN
  drawings whose centre sits on the row and that reach across its words, told apart by colour
  where a role has one (green = correct, red = wrong; amber is neither) else by file order; a bar
  is the widest drawing BESIDE the words, never the plate spanning them; a rowless drawing role is
  filled only when exactly one box and exactly one drawing are left. Anything less certain stays
  empty - "Nothing filled: no unused layer sits where an empty box would need it."
- **A `look` is filled only from HIDDEN drawings** - a visible group over a row is the base look,
  and binding it would hide the artwork. A `gauge` may take a visible rectangle (bars are drawn
  visible, full length).
- **Undo empties the boxes that still hold their picks and nothing else** (review fix): a box the
  reader changed after the press, a row they added, an option they ticked all stay.
- **Hidden layers are measured with their hiding lifted** through a `data-reveal` `!important`
  rule on the offscreen stage, set and removed inside one synchronous read.

## /check - legs and modes

- **review: delegated.** The code-review skill (level high) returned nine findings for THIS branch
  and these files (scope-checked against merge-base `8c1b39ba37`). All nine verified against the
  code and fixed in `6b84603`: Undo scope and the stale-fill guard; positional row keys vs the
  matcher's; switch/choice layers counted as unused; the question heuristic firing on the meter's
  percent; the gauge branch taking a row's plate (and the `across` test refusing a bar beside its
  label); the duplicated tokenizer (`withRowKey` now lives beside `rowTokenOf`, positional keys
  come from `rowKeys`); `rolesOf` compiling regexes per call (memoized at the source); row text in
  inventory rather than top-to-bottom order; unmeasured layers sorting first.
- **simplify: inline.** The skill returned fan-out instructions, so the four angles were worked
  here: `recipeIdOf` is one exported function (the step's copy deleted), and `fillGap`/`proposeFill`
  share one `emptyAndClaimed`. Nothing else warranted a change.
- **verify: build green** on `6b84603` (branch stamp `claude/c-mapping-step-explains@`, full
  `npm run build` twice over the final state - once before and once after the check's fixes).
  **e2e: not run** - this container has no Playwright browsers. The affected plan
  (`node scripts/e2e-affected.mjs --list`) names 40-odd specs including
  `import-svg-behaviour.spec.ts`, which carries the new case. The integrator should run
  `npm run test:e2e:affected:queued` (or the integration form after taking `main`).
- **taste: not applicable** - nothing here moves what a graphic looks like; the step's own
  layout is the one unseen surface (below).
- **Stamp NOT written.** The isolated worktree harness refuses any write to the shared
  `.git/noacg-jobs/checks/` path, so `claude-c-mapping-step-explains.json` does not exist. The
  mode lines above are the record; the orchestrator writes the stamp on the laptop (reviewedSha
  `110b35f`, review delegated 9/9, simplify inline 2/2, verify build green, e2e not run) or
  re-runs `/check` there.

## Observed vs reasoned - be honest with the owner

- **Observed (node, 55 checks over synthetic boards, script in the session scratchpad and not
  committed):** every taught name for every role survives `matchRole` re-keyed to another row;
  a "Group N" quiz with three coloured hidden drawings per row fills 13 of 13 with the right
  colours; a Home/Away board fills names, figures and a "Layer 9" flash by position; a switch
  layer is never taken; the meter's percent never takes the title; a vote's bar is the rail, not
  the plate; `Answer 1` rows key as 1..n and `2 selected` fills row 2; Undo keeps a later edit;
  nothing is guessed without geometry except by name or the one-left rule.
- **Reasoned, not seen:** the CSS. Hints hang under the select inside `.save-field`; the quiz row
  and states grid switched from bottom to top alignment so a hinted box and an unhinted neighbour
  keep their selects level; the row letter moved from `padding-bottom: 9px` to `padding-top: 21px`
  (11px label + 6px gap, estimated). If the letter or the selects sit off their line, that number
  is the one to move. The `data-reveal` measurement of hidden groups is reasoned from CSS
  precedence (a stylesheet `!important` beats an inline `display:none` and a presentation
  attribute); the new spec case is the observation that would confirm it.
- **The new spec** (`e2e/import-svg-behaviour.spec.ts`, last case) walks hint, notice, fill,
  reason-drop and undo on an inline quiz with unnamed moments. Its geometry expectations were
  traced by hand (row A's drawings at y 770-814 against Answer A's text at baseline 800, size 32).
  It has not run.

## Known gaps, deliberately

- The notice's "layers nothing is using" count for a VOTE includes every plain rectangle (the
  gauge pool), so background plates inflate it. The fill itself no longer takes them; the count
  wording is the remaining inaccuracy. Fix if it shows: count gauge spares only among rectangles
  that do not span an anchor's words - needs geometry at notice time.
- `pickersOf`/`withFill`/`clearFill` mirror the five draft shapes that `proposeSvgBehaviour` in
  `draft.ts` also mirrors (row A owned `draft.ts` tonight). If `draft.ts` is opened next, the two
  could share one walk.
- No wiring in `CreationWizard.tsx` was needed: everything lives in the step and its module.

## For the integrator

Nothing to wire. Merge `main` in, run `npm run test:e2e:integration:queued`, and read the new
case in `import-svg-behaviour.spec.ts` as the first observation of this work.
