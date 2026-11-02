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
- **R2 A verified match is an exact key that occurs once on each side.** No similarity, no
  position, no name-only fallback. A data holder (a behaviour's field, a clock or credits holder)
  is keyed by its kind and the title its import gave it.
- **R3 A verified match keeps its earlier field id.** The new build's ids are renamed all at once.
  An added field keeps its own id unless the earlier graphic used it; then it takes the lowest id
  no field and no node holds. A removed field's id is never reused.
- **R4 Keys made after the import come across.** A track that differs from the earlier baseline
  replaces the new build's track for the same timeline, selector and property, and a track
  deleted after the import stays deleted (after, from the `/check` review). An untouched track is
  the import's own motion, and the new walk's choice stands.
- **R5 A key must still have a target.** An editor-minted `artwork-N` moves only to the one layer
  with the same key (R1, R2); otherwise the key is unresolved.
- **R6 A label changed after the import wins** on a verified match, and the definition in the
  markup is rewritten with it.
- **R7 Action identity is the operator event.** Every event the earlier graphic answered must be
  answered by the new build, or it is unresolved.
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

## What landed

- `src/templates/importedDesign/reimport.ts` (new): the source key, the exact matcher, the
  simultaneous id rename, the key, label and event comparison. Pure.
- `src/components/wizard/import/draft.ts`: `svgReimported`, the glue that parses and serializes
  the animation data, moves an editor identity, and names each unresolved item in the reader's
  words (a field's title, the designer's group name).
- `src/blocks/svgIdentity.ts`: `carrySvgIdentity`, the identity patch shared with
  `commitSvgIdentity`.
- Approved departure from TOUCHES (coordinator, 2026-11-02): `shell/walkState.ts` (reconcile on
  save, the separate import, the copy before a reviewed replace), `CreationWizard.tsx` (the
  library seam and the Finish review), `steps/FinishStep.tsx` (the list and the Replace anyway
  box in the existing name warning).
- `e2e/import-svg-reimport.spec.ts` (new), six tests: the matcher on changed artwork (ids, keys,
  label, a fresh id for the added layer), a removed and a look-alike layer, an edited-artwork
  identity that follows its layer and one that is named, a behaviour's fields and actions, and two
  journeys through Finish into a production: changed artwork keeps the record, ids, keys, label
  and binding; a removed layer saves beside the earlier graphic, and Replace anyway keeps a copy.

## Decisions

- **Product choice A** (coordinator, 2026-11-02): unresolved work saves a separate graphic by
  default; Replace anyway stays a deliberate choice. The earlier graphic stays recoverable through
  the existing `duplicateGraphic` copy, since the library has no restore path to name instead.
- **An exact structural key, not a name.** The saved template no longer carries the designer's
  layer ids (the build replaced them with `fN`), so the key is read from what both sides keep.
  A moved or restyled layer is therefore unresolved: safe, and stated as the limit below.
- **Review on Finish's existing warning**, no new step, two short sentences and one checkbox.
- **Only a save over a graphic this walk never opened reconciles.** A second press of the same
  walk writes over its own record as before.

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
