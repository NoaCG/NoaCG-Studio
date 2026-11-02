# Phase 18: Preview linked credits structure using the existing data format

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-23: "Show a readable preview of headings, roles and associated names from the declared
  source/list binding. Preserve zero, one and multiple names per role, row order and one shared
  source through role-above/role-beside and static/roll/cards. Ambiguous columns get one mapping
  choice. Do not expose JSON/JSONata, create a field per person, or replace the native list grammar
  with another collection store. Later rendering rows prove each layout."

## Pinned main

Worktree from `66a61064f5f90acb4f68abef9738e38ea1ae9f3e` (PR #1948). Previous verified main: that SHA.

## What changed

- `creditsRoll.ts`:
  - `readCreditsList(text)`: the list as the shipped parser (`CREDITS_PARSER_JS`) reads it, compiled
    once with no escaping. No second grammar and no other store: the preview reads the same text the
    Credits field holds and a linked Sheet writes.
  - `analyseCreditsStyle(readings, ids, choice)`: a line is read in its text direction, so a
    right-to-left role beside its name reads the role first (#1941 point 1). `choice.swap` reads
    each line the other way: the one mapping choice.
  - `creditsColumnsAmbiguous`: true when both readings describe credits and name different layers as
    roles. Only role beside can be read both ways.
  - `creditsPreview(root, ids, creditsId, choice)`: for the layer picked as Credits, the styled
    reading of it and every text layer at or below it (a title drawn above stays artwork), with its
    layout, direction, ambiguity and list; otherwise the picked layer's own lines as the list.
  - `creditsLayerText`: a layer's drawn lines, read the way the editable roll reads its sample.
- `BehaviourSection.tsx`: under the Credits picker, a "Credits preview": headings, each role with
  its names, loose names, in order. Beside, a role shares its line with its first name and later
  names stay in the name column; above, names follow under their role. Where the columns are
  ambiguous, one select names the roles each reading gives ("Roles: Réalisation, Image" or
  "Roles: Léa Orme, Noé Rivage").
- No change to `contentFormats.ts` or `designTypes.ts`: the Sheet adapter already writes the native
  grammar into the one list field (row 17), and the stored model already holds the anchor kinds
  the choice decides.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Readable headings, roles, names from the declared list | `imported-credits-source` 4: the Sheet's tab reads as headings, roles and names, equal to the shipped parser's reading. e2e `the Credits preview reads roles and names…`: the wizard shows Réalisation / Léa Orme, Image / Noé Rivage, Émilie Lac; the artwork test shows NIGHT SKY first from the composed text |
| Zero, one, several names; row order | Test 4: Director (one), Camera (three), Sound (none), sections in order. Test 6: a Hebrew role with two names, a swapped reading with a role of none |
| One shared source through above/beside and static/roll/cards | Test 7: six styled bindings (credits-1 above, credits-2 beside, each playback) are valid against their drawings, have one list field `f0`, take the credits Sheet adapter and get the same list text |
| Role above, role beside | Test 5: credits-1 reads role above with its anchors in order; credits-2 role beside. e2e: a role and its first name on one line, a second name below |
| Ambiguous columns get one choice | Test 6: names drawn left of their roles read ambiguous; the choice swaps roles and names and the anchor kinds. e2e: the select offers the two readings; choosing flips the preview and back. Above is never ambiguous (test 5) |
| No JSON/JSONata, no field per person, native grammar | e2e: no `{` in the preview and one Credits picker. The preview reads `CREDITS_PARSER_JS`; no field, store or format added |
| Later rows render | Nothing renders here: `creditsEngine` and the assembler are unchanged. `imported-credits-model` 19/19, including the pins of the editable roll, the artwork roll and the plain credits drawings; `check:catalog-emit` PASS (528) |

Mutation: reading every line left to right (main's rule) fails test 6 and passes the rest.

## Verification on this worker

- `node --test scripts/imported-credits-source.test.mjs`: 14/14. `scripts/imported-credits-model.test.mjs`: 19/19.
- `npx tsc --noEmit -p .`, `npx eslint` on the changed files, `npx depcruise`: pass.
- `npm run gates -- run --changed origin/main`: pass. `npm run check:catalog-emit`: PASS, 528 designs.
- Browser, through the job queue: `e2e/import-svg-credits.spec.ts` 5/5 passed.
  `check-e2e-protection --changed origin/main`: OK.
- The wizard walked on the dev server with credits-1 and credits-2: preview read as above; no
  console errors.

## Decisions

- **The preview reads the field's list, not a Sheet.** The Credits field is the declared list
  binding; a linked Sheet writes the same text into it through the row-17 adapter. One reading of
  one text means the preview cannot disagree with the source or the roll.
- **The choice reads lines the other way.** It decides which look is the role and the reading order
  on a line together, which is what a name-first or right-to-left drawing needs. It is offered only
  when both readings succeed and differ.
- **The choice is held by the step, not saved.** The wizard writes no styled binding yet: every new
  credits import is `options.artwork` (`draft.ts`), and the assembler does not build `styled`. The
  choice's output is the anchor kinds `DesignSvgCredits` already stores; writing them belongs to
  the rows that build the engine (#1937, rows 19 to 23).
- **Anchors are the picked layer's line and every text layer below it.** A title above the list is
  artwork in every dev fixture. A layer that is not part of a two-look drawing previews as its own
  text, never a guess.
- **Ordinary review scenario.** Pure readers and a display with one local choice; no state rule.

## #1941

- Closed here: point 1, right-to-left role beside reads the role first.
- Remains for row 19: point 2 (loose characters before the first run) and point 3 (the parsed
  fallback compares colour spellings). Both end in a refusal today, which the preview shows as the
  layer's own text.

## Known limits

- The column choice is not saved (see Decisions).
- The preview shows the structure, not the drawn looks or measured overflow; rows 19 to 23 render.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-18-build')"

A revert removes the preview and the reading-order rule; no saved graphic or stored binding changes.
