# Phase 17: Connect imported content fields to the existing Sheet adapters

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-14: "Sheet changes update declared imported credits, ticker and editable multiline-text fields
  through existing source/data bindings; adapter mapping, failure, empty data, pause/reconnect,
  closed-page delivery and each existing/selected playback update policy are proven. No AI per
  refresh."
- Row 17: "Bind declared imported fields without assuming f0. Credits preserve role/name columns,
  headings/order/multiple names; existing ticker consumers preserve ordered message rows through
  the existing lines adapter; ordinary text preserves keyed values and multiline content.
  Save/reopen each binding, distinguish empty from missing values, and retain imported styling. No
  new connector, poller or arbitrary-text layout engine."

## Pinned main

Worktree from `9c2980d04352e5533d2ffcb931fffd8ac2f37c66` (PR #1940). Previous verified main: that SHA.

## The defect

A saved imported credits roll whose artwork draws a Heading above the list compiles the list to
`f1` (`NOACG_BEHAVIOUR.fields.credits = "f1"`). `listFormatFor` and `sheetShapeFor` looked only at
`f0` and `f2`, so a Sheet connected to it read its rows as keyed values, and `offeredValues`
stamped every list leaf with key `f0`, so the review proposed a ticker's or a credits tab's lines
onto whatever imported text was `f0` (the Heading, a drawn ticker's title).

## What changed

- `contentFormats.ts`: `graphicListFormat(graphic)`, the one list field a graphic fills from rows.
  An imported design's is the `credits` role in its emitted `NOACG_BEHAVIOUR` table, the same map the
  roll engine finds its field by; the original-artwork roll (`options.artwork`, its field hidden and
  inert) has none. `listFormatFor` answers an imported design from the same reading. Native graphics
  keep `f0`/`f2` exactly.
- `sheetSource.ts`: `sheetShapeFor` asks `graphicListFormat`; `listLeaves` and `offeredValues` take
  the reviewed graphic, so an imported design's list leaf names its real field, or no field when its
  list takes another shape. Without a graphic, or for a native one, the keys are as before.
- `components/home/CueEditor.tsx` (approved departure from the row's files, coordinator 2026-11-01):
  line 262 passes the graphic to `offeredValues`; line 690's starter download asks
  `graphicListFormat` instead of `f0 ?? f2`. No copy, layout or native behaviour change.
- No new connector, poller, adapter, grammar or layout engine. The reader, the server tick, the
  bindings and the stored source shape are the existing ones.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Declared fields without assuming f0 | `imported-credits-source` 1: the real importer's editable roll puts the list at f1; shape `credits`, `listFormatFor(f1)` credits, f0 stays text. Test 4: the review keys `sheet.s1.lines` to f1, and without the graphic (main's behaviour) to the Heading |
| Credits: role/name columns, headings, order, several names | Test 3: a tab with a heading, three names under one role on the rows below it, a role waiting for names and a section break reaches the field in the native grammar; the shipped credits parser reads it back as the expected sections, groups and names in order |
| Ticker consumers, ordered rows via `lines` | `imported-text-source` 4: one lines tab keys the native ticker's f0 as before and no imported field; the drawn ticker's message line, once picked, takes the same ordered text (kicker tab kept); reordered and emptied rows follow |
| Text: keyed values, multiline | `imported-text-source` 2: Field ID rows key the imported `f1` by id; a three-line value arrives with its line breaks through the data template, the Sheet read and `pathValue`; Name/Value rows match by title |
| Save/reopen each binding | Credits 5 and text 5: `connectShowSource` writes the bindings and source shapes; read back from storage they are as reviewed, and a reopened review proposes nothing new |
| Empty versus missing | Text 3: an empty Value writes "" and clears; a missing row writes nothing, is reported missing and is written again when it returns. Credits 6: a list is never missing; an emptied tab writes "" |
| Retain imported styling | Credits 5 and text 5: the pooled template's html, css and js are byte for byte the import's after save and reopen. `check:catalog-emit` PASS (528) |
| Failure, pause/reconnect | Credits 6: denied and unreachable reads write nothing (last good list kept), three misses mark it stale, the next good read clears stale. Credits 7: Pause reads nothing and holds; Resume writes only what changed |
| Closed-page delivery | Credits 8: the server tick (`runDataTick`, built as Vercel builds it) reads a published credits source with every page closed, writes the list, then nothing when unchanged, then "" when emptied |
| Playback update policy | Credits 9: the existing editable roll's `update()` calls `creditsDataUpdated`, which rebuilds from the written list; the artwork roll's list field is hidden, so it is offered nothing. The styled static/roll/cards policies do not exist yet (rows 19 to 23); keeping an active roll's snapshot until the next Play is row 24 (see Follow-ups) |
| No AI per refresh | Credits 8 and 10, text 6: the reader and the tick fetch only the Sheet's export address; the adapter modules import nothing from the AI layer |

Mutation: both new files run against main's `contentFormats.ts` and `sheetSource.ts` fail credits
1 to 5 and text 4, and pass with this change.

## Verification on this worker

- `node --test scripts/imported-credits-source.test.mjs`: 10/10. `scripts/imported-text-source.test.mjs`: 6/6.
- `content-formats` 27/27, `sheet-source` 41/41, `source-mapping` 66/66, `data-tick` 13/13,
  `credits-parser` 16/16.
- `npx tsc --noEmit -p .`, `npx eslint` on the changed files: pass.
- `npm run gates -- run --changed origin/main`: pass (167 tests and the cheap checks).
- `npm run check:catalog-emit`: PASS, 528 designs.
- Browser, through the job queue: `e2e/production-views.spec.ts` and `e2e/production-data.spec.ts`
  (the Sheet review and data surfaces): 44 passed, 1 failed. The failure is `Connect closes only
  once the save landed` (a native lower third, keyed values: no path this change reaches): the
  app's "Could not save" dialog covers Connect after the test fills storage. The same test on
  unmodified main `9c2980d0` fails the same way (control run in a detached worktree), and
  `e2e/production-data.spec.ts` is already in `e2e/quarantine.json` (since 2026-11-01). Reported
  in the PR, not repaired here.

## Review rounds

- `/check` code review (8 points): fixed the per-field reparse of the behaviour table (now read
  once per template), the recipe id and the field role folded into one constant (now two, each
  pinned to `credits.ts`), and three simplifications in `listLeaves`/`importedListFormat`. Not
  changed: a hand-edited table naming a field the graphic lacks (the roll engine resolves the same
  id, so Sheet and graphic agree; nothing renders either way), and an operator binding a credits
  list by hand to a lines leaf of a reused ticker source (the operator's explicit choice, the same
  as on native graphics).

## Decisions

- **Read the list from the behaviour table, never a field title.** The table is what the roll
  engine itself resolves its field by, so the Sheet and the graphic cannot disagree about which
  field holds the list. `control` may import `blocks`, not `templates`, so the role name `credits`
  is restated once and the test pins it equal to `CREDITS_FIELD_ROLE` from the bundled recipe.
- **The artwork roll takes values.** Its credits field is hidden and inert (the drawn text
  scrolls); offering it a list would bind a field nothing shows.
- **An imported list leaf names no field when the shapes differ.** The native default `f0` would
  otherwise bind a lines tab onto an imported title. Natives keep `f0`/`f2`/`f3`, so their reviews
  are unchanged.
- **A stored source keeps its shape.** A Sheet connected to an imported credits graphic before this
  change was saved as `values` and keeps reading that way; connecting again offers the credits
  adapter. No stored record is rewritten.
- **Ordinary review scenario.** No state rule changes: the reader, its lease, Pause, the tick and the
  snapshot diff are unchanged; only which adapter and which field a graphic names.

## Known limits

- Several names written across one row's cells join into one name (the existing adapter's
  grammar, shared with native credits). Several names go on the rows below the role, as the starter
  rows and docs/END_CREDITS.md show.
- A drawn ticker has no ticker engine: its message field shows the ordered rows as text. Moving SVG
  stays out of scope (spec, "Goal and boundaries").

## Follow-ups

- Row 24 (spec): active roll/cards keep their snapshot until the next Play/Take and a linked
  multiline field updates without replaying motion. Row 25: live delivery failures and native ticker
  continuity in the browser. Rows 19 to 23 (#1937) build the styled engines whose playback policies
  row 24 then proves.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-17-build')"

A revert returns imported credits to keyed values; saved bindings and stored source shapes are untouched.
