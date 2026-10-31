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
step, `draft.ts`, the new spec and this file.

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

## Rules

This row sets state rules (what selection is, and when a drop is the same artwork). They were
written after the first code, not before; the fresh read-only `/so` named below challenged them
against that code before the PR was opened, and anything it changed is listed after them.

- **S1 Selection is focus in a row.** Focus anywhere inside a text, picture or outlined-text row
  selects it; focus leaving that row ends it. The preview outlines the hovered row if there is
  one, else the selected row. Selection is screen state in the step, never in the draft.
- **S2 Same artwork is same markup.** A drop whose sanitized markup equals the current draft's
  `designSvg.markup`, on a draft that holds rows, is a reanalysis. Anything else is a fresh drop
  exactly as before. "Use a different design" clears the artwork, so a drop after it is fresh.
- **S3 Reanalysis keeps the reader's draft.** It keeps the rows, pictures, outlined text, the
  behaviour, the switches, growth, fonts, the reference (`svgApplied`), the fields the reader
  drew and the motion, takes the fresh drop's artwork size and name rule, then applies the fresh
  drop's own proposal through `svgDraftWithProposal`, so row 5's A1-A9 decide: an untouched value
  may be restated, a corrected one stays (A4), a refused proposal leaves the kept draft (A1).
- **S4 Identity is the layer, never the words.** A row is matched by its candidate id, which is
  its position in the same markup, so two layers with the same words and the same name each keep
  their own answers.
- **S5 Save and reopen add no persistence.** The saved graphic's field carries the corrected
  label and sample, on the node of the layer the correction was made on.
- **S6 No checklist.** A routine import still finishes without answering anything on the step.

## What landed

- `MapSvgFieldsStep.tsx`: the focus selection (S1), on the three row kinds that hover already
  served. No copy, no new control, no CSS.
- `draft.ts`: `svgDraftFromImport` turns a same-artwork drop into `svgReanalysed` (S2, S3). The
  drop is told the draft's answers; the shell already passed the whole draft.
- `e2e/jev-svg-preparation.spec.ts`: the two-plate walk (select, hover hand-back, keyboard,
  correction, reanalysis, save into a production, reload, the saved fields and the node each one
  binds) and a routine development lower third finished from the step with no answer given.

No inspector, no expression editor, no new persisted key.

## Verification on this worker

- `e2e/jev-svg-preparation.spec.ts` 2/2 through the queue.
- Mutation checks, each reverted: a same-artwork drop always fresh fails the walk at the
  reanalysis ("Second guest" expected, "name-2" received); the preview outlining only the hover
  fails it at the selection.
- `node --test scripts/import-drop.test.mjs` 11/11, `scripts/jev-svg-apply.test.mjs` 12/12.
- `npx tsc --noEmit`, eslint on the changed files, `check-e2e-protection`, and
  `npm run gates -- run --changed origin/main`: clean.

## Decisions and traps

- Reanalysis is a same-artwork drop, because that is the one place the product reads the artwork
  again today. No button was added: the model route (rows 35 and 36) proposes through the same
  door, and a re-run of the deterministic reader alone restates what is already there.
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
