# Phase 20: Render role-beside credits using imported styling

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-13: "Imported credits styling supports roles above/beside, multiple names and
  static/roll/cards, with defined overflow and source/animation identity. Fixed artwork remains
  compatible."
- Row 20: "Test columns, multiple names per role, alignment and overflow using imported samples.
  Do not substitute cr02 and call it preservation."
- Moved here by the owner (2026-11-02), from AC-23: "Ambiguous columns get one mapping choice".

## Pinned main

Worktree from `bc9be3b683654a681ce197bb13eedce9367ce98b` (PR #1956, row 19). Previous verified
main: that SHA. CI, configured-suite, Post-landing and Quarantine all succeeded on its push.
`origin/main` moved to `93d91127` (#1957, `scripts/e2e-traced.json` only) and is merged in.

## What changed

- `creditsRoll.ts`, the styled engine:
  - `CREDITS_RENDERED['role-beside']` is `['roll']`, so a role-beside binding builds styled.
  - `styledCreditsConfig` gives role beside its own numbers: `nameAlign`, the name column's edge
    (`align` stays the role column's); `roleToName: 0`, because a role and its first name share a
    baseline; and the line step, which is the name step or else the group gap.
  - `creditsStyledRuntimeJs` differs for role beside in a few places only:
    - each column sits on its own edge, the mean of its drawn layers;
    - the stylesheet anchors each kind on its own edge;
    - each column's room for the overflow rule ends where the columns meet, halfway across the
      gutter between the drawn layers' ink;
    - a drawing of one line, which shows no step, takes 1.2 times the drawn name size.
    Role above emits the same bytes as before (`ROLE_ABOVE_PINS`, taken on `bc9be3b`).
  - `creditsPreview`:
    - It reads a NAME picked as Credits from its block's first role. The layers above, nearest
      first, are taken in while the whole stays within two looks. The wider reading is used only
      where the picked layer then reads as a name, so a role picked first keeps exactly the
      block row 19 read.
    - A preview that falls back now says why (`reason`, the analysis's own message).
- Wizard (owner-approved files, see the PR):
  - `BehaviourSection.tsx`: the Credits preview adds two selects.
    - "Which column contains the roles?" (Left / Right) appears only where the columns are
      ambiguous. Its answer updates the preview and is saved as the binding's anchor kinds,
      which the runtime copies. It is read back from the saved binding.
    - "Show as" (Editable, in this design's styling / Fixed artwork) appears where styled
      credits can build, and defaults to editable.
    Where a design falls back, the preview says so in one line: "Fixed artwork: <reason>".
  - `draft.ts`: `SvgRecipeDraft.creditsArtwork` holds the deliberate fixed-artwork choice.
    `styledCreditsOf` accepts any role or name the binding reads as the picked layer, so a name
    picked as Credits saves the styled binding.
- `svg.ts`, `svgBind.ts`, `MapSvgFieldsStep.tsx`: unchanged. The row-19 paths already build,
  mark and describe any styled binding, and the fixed-artwork choice reaches the checklist
  through `svgDesignOptions`.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Role beside renders in imported styling | Node "the sample rebuilds in its two columns": credits-2 (the dev sample), roles set against their end, right to left, names drawn left of their roles, and a name layer picked. Every row's first character is within 0.05 units of its source's, with the same fill, size, weight, style, family and effective opacity. e2e: the wizard walk on credits-2 saves the binding, and the take shows roles at x 90 in pale green 26 and names at x 440 in white 32, at baselines 195 / 195 / 365 / 365 / 420 |
| Columns and alignment | Node: credits-2 roles start at 90 and names at 440 for every list. Roles set against their end all end at 300 whatever their length, with names from 340. Right-to-left roles reach 900 and names 600 |
| Multiple names per role | Node: nine rows (three names under one role, a role with none, a section break) at 195, 195, 250, 305, 475, 475, 645, 815, 815: names 55 apart, 170 from a group's last line to the next role, a role and its first name on one line. e2e: an Update rebuilds at 195, 195, 250, 305, 475, 645, 645 |
| Overflow, measured | Node, on three drawings: names measured in the drawn name look against their column's room (credits-2: the frame edge 1100, less 440, less 16) fit, shrink, are reported past 55% and floor at 30%. A 39-character role against the role column's room (to where the columns meet) shrinks to it and is reported under the one Credits field; the report clears when the list fits |
| Ambiguous columns get one mapping choice | Node: names drawn left of roles read either way. Read as drawn, the names roll as roles at x 100 in white; with the answer, roles roll in gold at 600 and names in white at 100. Both bindings validate, and the anchors differ. e2e (owner's test): the preview first lists the names as roles; after "Right" it lists Director and Sound; the saved field is `Director:\nAlex Rivera\nIda Lake\nSound:\nAri Moss`; on air the roles are gold at 600 and the names white at 100. Role above never asks (node, and the row-19 e2e) |
| Name layer picked as Credits | Node: a name picked on credits-1 and on credits-2 gives the same anchors, list and field count as the first role. e2e: picking Léa Orme saves the styled binding and rolls all five rows |
| Fixed artwork as a deliberate, explained choice | e2e: "Show as" defaults to editable; Fixed artwork turns the checklist rows to "scrolls as artwork"; Editable turns them back; picking the title shows "Fixed artwork: ..." and no Show as |
| Source and animation identity | Node "role beside keeps the source layers": the take moves the roll's own group, a second take measures the same roll, Out stops it, every source layer's markup is unchanged after a take and stays hidden, and a reset of inline styles leaves the rows as built |
| Not cr02 | The rows are copies of the imported drawing's own layers (above). Nothing in the engine reads a catalog design |
| Fixed artwork and saved graphics compatible | Pins of the editable roll, the artwork roll and the three plain credits drawings unchanged. Row 19's five role-above styled builds are byte for byte as on `bc9be3b` (new test). `check:catalog-emit` PASS (528). The draft saves `options.artwork` exactly as before wherever it holds no styled binding |

Mutations, each caught:
- Names placed on the role column's edge: three node tests fail.
- Each column's room the whole window: the overflow test fails.
- No upward reading for a picked name: two node tests fail.
- e2e, in one run (j-0003, 2 failed): the Roles answer not applied, and `styledCreditsOf`
  restored to "the first anchor only".

## Verification on this worker

- `node --test scripts/imported-credits-model.test.mjs`: 36/36. `scripts/imported-credits-source.test.mjs`: 14/14.
- `npx tsc --noEmit -p .`, `npx eslint` on the changed files: pass.
- `npm run gates -- run --changed origin/main`: pass. `npm run check:catalog-emit`: PASS, 528.
- `scripts/svg-import-passes.test.mjs`: 18 pass, 4 fail. The output is identical to a clean
  worktree of `origin/main` on this machine, except paths and timings (row 19 recorded the same).
- Browser, through the job queue: `e2e/import-svg-credits.spec.ts` 9/9 (j-0001). Mutation run
  j-0003 above. `check-e2e-protection --changed origin/main`: OK.
- The wizard walked on this worktree's dev server with credits-2. The Credits preview shows Show
  as, the Roles question (Left) and the two columns. No console errors.

## Decisions

- **Role beside differs in a few runtime lines, chosen at build.** Role above must keep its bytes,
  so the emitted runtime branches in TypeScript (`beside(...)`). That beats a generic runtime that
  would change every row-19 graphic.
- **Where the columns meet** is halfway across the gutter between the drawn layers' ink, in the
  first role's frame. A column's room runs from its edge to there, or to the window on its outer
  side, less half its type at each side, as role above spends its room.
- **The Roles question appears wherever both readings describe credits**, which includes credits-2.
  Geometry cannot tell a role column from a name column, so the author answers. "As drawn" is
  preselected: the left column, or the right for right-to-left text. The labels are Left and
  Right because the author sees the columns.
- **The answer lives in the saved anchors**, not a separate field. The kinds are what the runtime
  copies and what `validateCreditsBinding` already accepts either way (row 18). The step reads
  the answer back from the binding.
- **Fixed artwork is a draft choice** (`creditsArtwork`), so the step's automatic styled write
  never overrides it. Saved, it is the same `options.artwork` binding every artwork import has.
- **A picked name reads its block from the first role** only when the wider reading makes it a
  name. A role picked first keeps row 19's block, so a heading drawn in the role look above it
  is never pulled in.
- **Ordinary review scenario.** A renderer, two selects and one draft field; no state rule changes.

## Known limits

- Fixed artwork of a drawing made of separate role and name layers rolls only the text holding
  the Credits layer, as role-beside imports did before this row. The other layers stay drawn and
  become ordinary fields (#1958, P2: it needs `creditsArtwork.ts`).
- The Behaviour summary still says the original artwork scrolls. That is the recipe's own line
  (`words.json`), unchanged here because the brief allows no other copy change.
- Row 19's limits stand: fallback fonts at validation, a stale binding builds the editable roll,
  a source's own filter, clip or mask is not carried, and px letter spacing does not scale.

## Follow-ups

- Rows 21 to 23 (#1937): roll qualification (21, including inline opacity on a source in its own
  group), static (22), cards (23).
- #1958 (P2): fixed artwork of a separate-layer drawing rolls only the Credits layer.
- #1955 (P3): the editable roll's list holder through the formatter.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-20-build')"

After a revert, new role-beside imports save artwork credits again. A graphic saved with a
role-beside styled binding in between then builds the editable roll of its one list field. Its
other drawn layers show as drawn. Role-above graphics are unaffected.
