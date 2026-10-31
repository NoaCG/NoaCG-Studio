# Phase 6: Make inferred fields inspectable and easy to correct

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-20: "Selecting a prepared field highlights its actual SVG source; the existing mapping
  surface shows its editable label, type, sample and binding. A deliberate correction survives
  reanalysis and save/reopen, including two similar text layers. Routine reliable imports still
  need no mapping checklist. No new inspector framework or expression editor."

Builder: Claude Code cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`,
environment `env_017nuiDZBW9smUNLdWVQK8cf`. No model call, no spend; the holdout was not read.
Allowed files: `src/components/wizard/import/MapSvgFieldsStep.tsx`, `AnalyzeProposalPanel.tsx`,
`draft.ts`, `fieldAutoMap.ts`, `+e2e/jev-svg-preparation.spec.ts` and this file. Used: the
step, `draft.ts`, the new spec and this file, plus one reconciled entry in
`scripts/e2e-affected.test.mjs` (below).

## Pinned main

Worktree created from `11523106a407cb856e619e0d4ddbbfa3785d5739` (PR #1866) after a fresh fetch.
Previous verified main: `11523106`: merge-group CI (41227594711), push CI (41228424514),
configured-suite (41228424640), Post-landing, Quarantine, Push on main and deploy-verify all
succeeded.

## What the product did before this row

Measured on that main, walking the mapping step with two plates drawn alike (the spec's fixture):

- The step already shows each field's editable label (Field name), its sample (Text), its type
  (Text, with "(number)" on a numeric layer and the Text or Countdown choice on a clock-shaped
  one) and its binding (the row sits under the plate it is drawn in, and hovering it outlines the
  exact layer on the preview).
- The outline followed the POINTER only. Clicking into a row to correct it and then looking at
  the preview took the outline away, and keyboard focus in a row lit nothing.
- Dropping the same artwork again on the Design step was a fresh drop: every correction was gone.
  It was the only way a reader could make the import read the artwork again.
- No screen asks for a new analysis yet: row 5's proposal door (`svgDraftWithProposal`) is the
  one way a later analysis reaches the draft, and rows 35 and 36 wire a proposer into it.

## Rules

This row sets state rules (what selection is, and when a drop is the same artwork). They were
written after the first code, not before; a fresh read-only `/so`
(`session_017SdbwQFFwtf2WjFtjBzLhY`, on `07b7b5a5`, AGREE WITH CORRECTIONS, grade B) challenged
them against that code before the PR was opened. Its corrections are folded in and listed after
the rules.

- **S1 Selection is focus in a row.** Focus anywhere inside a text, picture or outlined-text row
  (or a text row's keep-the-nudge line) selects it; focus leaving that row ends it. The preview
  outlines the pointer's hovered row if there is one, else the selected row. A hover written by
  focus rather than the pointer never outranks a selection: focusing a row clears it. Selection
  is screen state in the step, never in the draft.
- **S2 Same artwork is same markup.** A drop whose sanitized markup equals the current draft's
  `designSvg.markup`, on a draft with at least one text row, keeps the draft. Anything else is a
  fresh drop exactly as before. "Use a different design" clears the artwork, so a drop after it
  is fresh: that is now how a reader starts the same file over.
- **S3 A same-artwork drop keeps the reader's draft.** It keeps the rows, pictures, outlined
  text, the behaviour, the switches, growth, fonts, the reference (`svgApplied`), the fields the
  reader drew and the motion, and takes the fresh drop's artwork size and name rule. The reader
  would find exactly what it found before, so it proposes nothing.
- **S3a A reanalysis goes through the door.** A later analysis reaches the draft only through
  `svgDraftWithProposal`, so row 5's A1-A9 decide: an untouched value may be replaced, a
  corrected one stays (A4) and is named in `kept`, and applying it again changes nothing (A9).
- **S4 Identity is the layer, never the words.** A row is matched by its candidate id, which is
  its position in the same markup, so two layers with the same words and the same name each keep
  their own answers.
- **S5 Save and reopen add no persistence.** The saved graphic's field carries the corrected
  label and sample, on the node of the layer the correction was made on.
- **S6 No checklist.** A routine import still finishes without answering anything on the step.

Corrections taken from the rules review: the same-artwork drop first re-applied the fresh
drop's own proposal, which could change nothing today and would later let the plain reader
replace a model proposal's untouched answers, so it now only keeps the draft (S3) and the door is
proven on its own (S3a); "holds rows" is now checked as at least one row (S2); the spec proves
the type with a number layer rather than matching the word "Text", which the sample's label also
carries; an unused selection attribute was dropped; and the PR states that a same-file re-drop no
longer starts over.

## Review rounds after the PR opened

- PR review of `44783ae6` (P2), class product defect, family S1: the alignment dots and the
  keep-the-nudge box still wrote the hover on focus and never cleared it, so tabbing on to the
  other twin left the old layer outlined. Those focus writes are gone (row focus selects), the
  nudge line selects its row, and a row's focus clears a hover focus left behind (a behaviour
  picker still writes one, outside this row's files). The spec's new step failed on `44783ae6`
  (line 82) and passes after the fix.

- CI Build of `44783ae6`, class faulty test expectation: `scripts/e2e-affected.test.mjs` pins the
  exact specs an import-folder change plans, and the new spec joined them. Outside the row's
  files, so the coordinator reconciled the boundary first (19:39Z): one entry added to that
  test's `road` list, nothing else in the file. The same test requires every road spec to run on
  a wizard shell change, so the new spec's own covers header now also names the shell, as the
  other import specs do. `node --test scripts/e2e-affected.test.mjs` 115/115.
- Configured suite on `44783ae6` (41234246878): 145 passed, 0 failed, 1 flaky,
  `e2e/configured/late-send-abandoned.spec.ts` (failed then passed). It is already quarantined
  and tracked in open issue #1805; playout code this row does not touch.

## What landed

- `MapSvgFieldsStep.tsx`: the focus selection (S1), on the three row kinds that hover already
  served. No copy, no new control, no CSS.
- `draft.ts`: `svgDraftFromImport` keeps the draft on a same-artwork drop (`svgKeptOnRedrop`, S2,
  S3). The drop is told the draft's answers; the shell already passed the whole draft.
- `e2e/jev-svg-preparation.spec.ts`, three tests: the two-plate walk (the label, sample and
  number type on the rows, select, hover hand-back, keyboard, correction, same-file re-drop, save
  into a production, reload, the saved fields and the node each one binds); a reanalysis through
  the proposal door that renames both look-alike layers, which renames the untouched twin, keeps
  the corrected one, names it in `kept` and is idempotent (S3a); and a routine development lower
  third finished from the step with no answer given (S6).

No inspector, no expression editor, no new persisted key.

## Verification on this worker

- On the head after the review fix: `e2e/jev-svg-preparation.spec.ts`, `import-svg.spec.ts` and
  `import-svg-behaviour.spec.ts`, 109/109 through the queue.
- `e2e/jev-svg-preparation.spec.ts` 3/3 through the queue.
- `e2e/import-svg.spec.ts` and `e2e/import-svg-behaviour.spec.ts`: 106/106 through the queue,
  on `07b7b5a5` (the selection code is unchanged since; the re-drop now keeps rather than
  re-applies).
- `e2e/import-svg.spec.ts` and `e2e/svg-examples.spec.ts` (both drop SVGs several times): 86/86
  through the queue on `9c295197`.
- Mutation checks, each reverted: a same-artwork drop always fresh fails the walk at the
  re-drop ("Second guest" expected, "name-2" received), before and after the correction; the
  preview outlining only the hover fails it at the selection.
- `node --test scripts/import-drop.test.mjs` 11/11, `scripts/jev-svg-apply.test.mjs` 12/12.
- `npx tsc --noEmit`, eslint on the changed files, `check-e2e-protection`, and
  `npm run gates -- run --changed origin/main`: clean.

## Decisions and traps

- No reanalysis button was added: the model route (rows 35 and 36) proposes through row 5's
  door, and a re-run of the deterministic reader alone would restate what is already there. The
  door is proven here on the two look-alike layers; the same-file re-drop, the one place the
  product reads the artwork again today, keeps the draft.
- A same-file re-drop no longer starts over; "Use a different design" first does.
- A changed file is not a reanalysis here; keeping work across changed artwork is reimport,
  rows 26 and 27 (AC-15).
- Selection by focus, not by a click handler, so the keyboard selects too and nothing has to
  clear it by hand.
- `AnalyzeProposalPanel.tsx` (the raster road's vision panel) and `fieldAutoMap.ts` needed no
  change.
- Trap: the step's hint still says "Hover a row"; it stays true and one line, so it was left.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-6-build')"

A same-artwork drop is then a fresh drop again and the outline follows the pointer only. No saved
graphic or draft key depends on this row.
