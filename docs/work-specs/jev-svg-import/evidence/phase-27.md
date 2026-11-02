# Phase 27: Protect source bindings and keys on reimport

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-15: "Layers remain editable fields and animation targets; verified-match IDs, keyframes,
  source bindings and controls survive save/reopen/reimport; unresolved work is protected."
- Row 27: "Keep verified-match IDs, keys, data-source bindings and action identities.
  Removed/ambiguous layers retain authored work and trigger a reviewed resolution or separate
  import; no fuzzy matching engine."

Row 26 owns the nested layer through prepare, save and reopen; row 28 owns control arrangements
(pin, hide, rename) and the panel dispatch. This row owns reimport of changed artwork.

## Pinned main

Worktree from `4a1ee55913b4c63425a00bedf8a2c85792a45bde` (PR #1984). Previous verified main: that
SHA.

## What the product did before this row

Measured in code and in the journey on that main:

- Importing changed artwork under a saved graphic's name writes the whole new template and
  baseline over the record (`saveCurrentGraphic`). Finish warns "saves over" and names cue values
  that no longer match a field.
- Field ids are positional (`f${i}` in build order). One text layer drawn before the others moves
  every id after it, so a production binding (graphic name, field id, path), a cue value or a
  control entry then addresses a different layer. The journey's version two, with a badge drawn
  first, built `badge f0, name f1, role f2` where the saved graphic had `name f0, role f1`.
- Keys made in the editor after the import, labels changed after it, and identities the editor
  minted on artwork layers (`artwork-N`, `blocks/svgIdentity.ts`) were dropped without a word.

## Rules

These are state rules (revision-to-content identity), so this row is the Risky scenario. They
were written after the first matching code, not before it; the fresh read-only `/so` named in the
PR challenged them against that code. Rules found after coding are marked (after).

- **R1 Identity is the drawn layer.** A field's source key is the layer's tag, its designer-named
  groups, and every attribute the designer exported on it. Never its words, never its id (the
  build replaced it), never the build's own classes or `data-noacg-*` stamps.
- **R2 A verified match is an exact key that occurs once on each side**, counted across every
  drawn layer of the artwork (an unbound twin counts; second half from the PR review bot on
  `be7be458`), and the match is a field of the new build. No similarity, no position, no
  name-only fallback. A data holder (a behaviour's field, a clock or credits holder)
  is keyed by its kind and the title its import gave it.
- **R3 A verified match keeps its earlier field id**, unless another node of the new markup
  already holds that id (then the field is unresolved; from the PR review bot on `a13edb02`). The new build's ids are renamed all at once.
  An added field keeps its own id unless the earlier graphic used it; then it takes the lowest id
  no field and no node holds. A removed field's id is never reused.
- **R4 Keys made after the import come across.** A track that differs from the earlier baseline
  replaces the new build's track for the same timeline, selector and property, and a track
  deleted after the import stays deleted (after, from the `/check` review). An untouched track is
  the import's own motion, and the new walk's choice stands.
- **R5 A key must still have a target.** An editor-minted `artwork-N` moves only to the one layer
  with the same key, and only when that key is unique in the earlier artwork too (R1, R2; the
  second half from the PR review bot on `3bf9b4f5`); otherwise the key is unresolved.
- **R6 A label changed after the import wins** on a verified match, and the definition in the
  markup is rewritten with it.
- **R7 Action identity is the operator event's name, carried by the recipe.** A verified build
  answers the same events by construction (the behaviour test compares them). An action the walk
  itself drops, through a behaviour profile the reader chose (a quiz with no Lock), is that
  choice, not lost work, and is not listed (narrowed after coding: the first version listed it,
  which broke AC-22's reopen-and-change journey in `import-svg-behaviour.spec.ts`).
- **R8 Unresolved work is never written over.** A removed, look-alike or untargeted item makes
  every Finish door save the new version as a separate graphic (`<name> 2`), leaving the earlier
  graphic, its bindings and cues untouched. Finish names the items first. Replace anyway is the
  reader's reviewed choice, and it first keeps the earlier graphic as its own library entry
  (`<name> copy`).
- **R9 Bindings, cues and entries ride on R3.** Nothing writes to a production: they are keyed by
  graphic name and field id, both kept.
- **R10 (after) The new Reset target is the renamed build without the carried work**, so a later
  reimport still reads the carried keys and labels as work made after an import.
- **R11 (after) Keys on a field named as removed are said once**, with the field, and are not
  written: no track is left on an id nothing holds.
- **R12 (after, from `/so`) After a separate save, Finish carries the name it was saved under**,
  so a second door press updates that graphic and never renames it back over the earlier one.
- **R13 (after, from `/so`) A key on a positional selector is unresolved**: it names a place, not
  a layer (R5).
- **R14 (after, rule-model reassessment) Reconciliation follows the record, not the press.** Each
  door rebuilds the raw, positionally numbered build, so a save reconciles against any record it
  would write over, unless that record is still exactly what this walk last wrote by a plain write
  (`reimportTarget`). This replaces "only a save over a graphic this walk never opened".
- **R15 (after) What a save learned is part of the walk's memory**: the record it reconciled and
  the record's write time sit on the walk's `MadeGraphic`, so walk-back and rename keep them.
- **R16 (after) Finish's review asks the save's own question** (`reimportTarget`) and shows the
  list whatever the name's effect, this walk's own record included; should the two documents
  still disagree, the save errs to a separate graphic.
- **R17 (after, final `/so`) A Replace anyway tick belongs to the list it was given for** on that
  target, and is spent by the save it was given for; a later press needs its own review.
- **R18 (after) Only an id names one layer**: a key on a designer's class is not carried (a class
  may gather other layers in the new artwork); the build's own `.imported-design-*` structure is.

## What landed

- `src/templates/importedDesign/reimport.ts` (new): the source key, the exact matcher, the
  simultaneous id rename, the key and label carry. Pure.
- `src/components/wizard/import/draft.ts`: `svgReimported`, the glue that parses and serializes
  the animation data, moves an editor identity, and names each unresolved item in the reader's
  words (a field's title, the designer's group name).
- `src/blocks/svgIdentity.ts`: `carrySvgIdentity`, the identity patch shared with
  `commitSvgIdentity`.
- Approved departure from TOUCHES (coordinator, 2026-11-02): `shell/walkState.ts` (reconcile on
  save, the separate import, the copy before a reviewed replace), `CreationWizard.tsx` (the
  library seam and the Finish review), `steps/FinishStep.tsx` (the list and the Replace anyway
  box in the existing name warning).
- `e2e/import-svg-reimport.spec.ts` (new), eleven tests: the matcher on changed artwork (ids, keys,
  label, a fresh id for the added layer, a deleted track, the new build's motion through an id
  cycle), a removed and a look-alike layer, an edited-artwork identity that follows its layer and
  one that is named, an identity on one of two look-alike layers, a field whose unbound twin
  survives, an earlier id another node now holds, a behaviour's fields and actions, three journeys through Finish into a production
  (changed artwork saved through Export and then the production door keeps the record, ids,
  keys, label and binding; a removed layer saves beside the earlier graphic, the production
  follows the saved name, and Replace anyway keeps a copy; walking back after a clean reimport
  shows the list on Finish), and the record rule's four states.

## Verification on this worker

- `e2e/import-svg-reimport.spec.ts` 11/11; with `import-name-collision`, `wizard-finish`,
  `jev-svg-preparation`, `wizard-draft-guard` and `import-svg-behaviour`: 94/94 on the final source (j-0036); 49/49 with
  R14 (j-0020).
  40/40 after the first `/so` fixes (j-0016). `editor-fidelity-trim` with the
  first three: 47/47 earlier on this branch (j-0007).
- Mutations, each reverted: no id rename fails the matcher test and the first journey; no
  reconcile on save fails the second journey (the earlier graphic is written over); no
  deleted-track rule fails the matcher test; no Finish name follow-up fails the second journey at
  the name check; no R14 (reconcile on the `over` effect only) fails the first journey at the
  field ids and the rule test; a second rename pass over the script fails the matcher test at the
  badge's motion; Finish's list shown for the `over` effect only fails the walk-back journey;
  identity uniqueness checked on the new side only fails the look-alike identity test; a
  bound-only uniqueness count fails the unbound look-alike test; no collision check fails the
  held-id test.
- `npx tsc --noEmit`, eslint on the changed files, depcruise over the wizard,
  `npm run gates -- run --changed origin/main` (includes the CreationWizard line budget),
  `check-e2e-protection`, `node --test` on `e2e-affected`, `import-drop`, `jev-svg-apply`,
  `wizard-draft`, `wizard-walk-state`, `wizard-walks` and `wizard-kit-moves`: pass.
- Not run here: the configured suite and the full e2e set (CI), a production build (no build
  input changed).

## Decisions

- **Product choice A** (coordinator, 2026-11-02): unresolved work saves a separate graphic by
  default; Replace anyway stays a deliberate choice. The earlier graphic stays recoverable through
  the existing `duplicateGraphic` copy, since the library has no restore path to name instead.
- **An exact structural key, not a name.** The saved template no longer carries the designer's
  layer ids (the build replaced them with `fN`), so the key is read from what both sides keep.
  A moved or restyled layer is therefore unresolved: safe, and stated as the limit below.
- **Review on Finish's existing warning**, no new step, two short sentences and one checkbox.
- **A walk's own fresh graphic keeps today's plain write** on a second press, as long as nothing
  else has written to it (R14); every other save over a record reconciles.

## Limits

- A layer the designer moved, restyled or regrouped has a new key and is listed as removed, so
  that version goes in as a separate graphic unless the reader replaces anyway.
- A saved graphic edited in the editor's artwork (an attribute changed on a bound layer) reads as a
  different layer on the next reimport, for the same reason.
- R3 holds within one reimport. After Replace anyway, the removed field's id is free again, so a
  later reimport may give it to a new layer, and a production binding left on that id would then
  drive it. The editor's own add-field has the same property today.
- A graphic keyed before the editor minted `artwork-N` identities addresses those layers by
  position; such keys are listed as not carried (R13).
- "Edit this graphic" saves nothing: it opens the rebuilt, positionally numbered build in the
  editor under the held name. The editor's own Save mints a new record for an unsaved document
  (`saveGraphicAs` always mints), so the earlier graphic is never written over, but that new
  graphic carries no reconciled work. Filed as #1986 (P3, editor).
- CSS and script renames touch exact quoted or `#`-prefixed field ids, so a stylesheet colour
  spelled `#f10` would be renamed when field `f10` is (11 or more fields and that exact colour).
- A record saved without a baseline (older saves) reads every key as made after the import, so the
  earlier motion wins over the new walk's; holder titles are read as they are now. Both err safe.
- After Replace anyway with look-alike layers, the record keeps the twins, so a later press of the
  same walk lists them again and saves separately unless the reader replaces again.
- If keeping the copy succeeds and the save then fails, a spare copy is left in the library.

- Keys only: a step's duration or default ease changed after the import is the new walk's again.

## Review rounds

- `/check` inline review on `a3cc91f`: one finding fixed, class product defect, family R4: a track
  deleted in the editor after the import came back from the new build. The matcher test now
  deletes one and asserts it stays gone; removing the fix fails it at that assertion.

- Fresh read-only `/so` on `15e93fc8` (`session_017SdbwPUh4B83xDgsDeDjeo`): AGREE WITH
  CORRECTIONS, grade A-. Taken: (1) class product defect, family R8: after a separate save the
  Finish name still read the earlier name, so a second press (Export, then Add to the production)
  renamed "Guest 2" back to "Guest" and replaced the pooled copy; fixed (R12), and the journey now
  saves through Export first and checks the pool. (2) class product defect, family R3/R11: keys
  on a removed field were written as orphan tracks; no longer written. (3) the review and the save
  read two documents: the save's doc comment now says which way a disagreement errs. (4) the
  module header misstated the import rule; corrected (the folder rule against new blocks/ imports
  is why the glue stays in the wizard). (5) the copy name now takes a free name; markup renames
  touch id attributes, `url(#…)` and the definition only, never a colour like `fill="#f12"`;
  positional keys are unresolved (R13). Two limits added above.

- Final `/so` on `9ab30dbc` (`session_017SdbwM5iPfFH8aUWSbyRTL`): AGREE WITH CORRECTIONS, grade B.
  Blocking, class product defect (data loss), family R3/R4/R9, the second in the "later press"
  family after R12: after a clean reimport a second press is an update of the same record and
  wrote the raw build back over it. Repeated family, so a read-only rule-model reassessment came
  first (`session_017SdbwMqKjCHbjmbmz21QrV`, AGREE WITH CORRECTIONS): key the rule on the record's
  state, keep it on the walk's snapshot, let Finish use the same test. Taken as R14 to R16. The
  first journey now presses Export and then Add to the production; with R14 removed it fails at
  the field ids. A fifth test pins the rule's four states. Its non-blocking points are listed
  under Limits.

- PR review bot on `9ab30dbc` (PR opened): two P1 findings. (1) class product defect, family R3:
  the stylesheet and script rename ran two passes, so on an id cycle a quoted `"#f1"` was renamed
  twice and the new build's own field motion moved to another layer. Fixed with one pattern per
  text; the matcher test now gives the new build a track on the badge and checks it follows the
  badge through the cycle; restoring the second pass fails it. (2) the second-press finding, the
  same as the final `/so`'s, fixed by R14.
- Code scanning on `9ab30dbc`: "DOM text reinterpreted as HTML" at `parseHtml`. Not a defect:
  `DOMParser` builds an inert document from the graphic's own stored template, scripts never run
  in it and nothing from it is inserted into the page; `model/structure.ts` reads templates the
  same way. Answered on the PR thread.

- Final `/so` on `3bf9b4f5` (`session_017SdbwLe43NApYKwZhHc75P`): AGREE WITH CORRECTIONS, B+
  as it stood, A- after one bounded fix. Class product defect, family R16/R8 (the third "later
  press" round): Finish showed the list only for a graphic the walk never opened, while the save
  also reconciles the walk's own record; and a Replace anyway tick could carry to a list never
  shown. Fixed as R16 and R17, with a journey that walks back after a clean reimport, swaps in a
  version without the badge and the role, and finds the list on Finish and a separate graphic.
  Its non-blocking points are taken: class keys (R18) and three limits above.

- PR review bot on `3bf9b4f5`: one P2, class product defect, family R2/R5: an editor identity on
  one of two look-alike layers moved onto the survivor when the keyed twin was removed. Fixed
  (uniqueness on both sides); a new test keys the removed twin and finds the identity not moved
  and the key listed; without the fix it fails at the move.

- Final `/so` on `be7be458` (`session_017SdbwPs4E1vqTNddirrQcE`): AGREE WITH CORRECTIONS, grade
  A-, nothing blocking. Its three points are filed as #1987 (P3): a Replace anyway tick that can
  outlive its list when Finish and the save read differently (the earlier graphic is still copied
  first), Finish's review shown in SVG mode only while the save reconciles in any mode (fails to a
  separate graphic), and machine edits after the import not compared (no UI edits the machine
  today).
- PR review bot on `be7be458`: one P2, class product defect, family R2 (the bound-only count):
  a field whose layer had an unbound twin matched the twin after the bound one was deleted.
  Fixed (artwork-wide count); a new test unbinds one of two identical captions, deletes the bound
  one in version two, and finds the field ambiguous and its id not reused; with the bound-only
  count it fails.

- Neighbouring run on the artwork-wide fix: `import-svg-behaviour.spec.ts` "a second author
  reopens a saved quiz ... makes it a true no-Lock quiz" failed: the first R7 listed the dropped
  Lock event, so the save went beside the quiz instead of over it. Class product defect, family
  R7 (a rule wider than the contract). R7 narrowed as above; the spec is unchanged.

- Final `/so` on `a13edb02` (`session_017SdbwQbvR1UL8YTjveTpFr`): AGREE WITH CORRECTIONS, grade
  A-, nothing blocking. Its one point (R7 says "the reader chose" while the code cannot tell a
  chosen behaviour drop from a missed proposal; Finish could say "No longer answers: Lock") is
  added to #1987 as point 4.
- PR review bot on `a13edb02`: one P2, class product defect, family R3: a matched field taking
  back `f1` could collide with an unbound designer node already called `f1`. Fixed (such a field
  is unresolved); a new test builds that case; without the check it fails.

## Traps

- The Finish review reads the wizard preview, which on Finish is the build itself; the save reads
  the formatted build. Both keys are attribute-based, so formatting does not change them.
- `getTemplateParts` names an unnamed artwork node by an `nth-of-type` path ending in
  `rect:nth-of-type(n)`, not `rect`.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-27-build')"

A reimport then writes over the saved graphic as before. No persisted format changed; a separate
graphic or a copy made meanwhile stays an ordinary library entry.
