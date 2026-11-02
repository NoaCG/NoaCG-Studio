# Phase 26: Preserve editor layers and field animation

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-15: "Layers remain editable fields and animation targets; verified-match IDs, keyframes,
  source bindings and controls survive save/reopen/reimport; unresolved work is protected."
- Row 26: "A nested imported layer remains an editable field and animation target through
  prepare/save/reopen. Verify timing/easing and behavior paint ownership; no new animation feature
  or editor default switch."

AC-15 is shared. This row owns the nested layer through prepare, save and reopen. Reimport
(verified-match IDs, keys, bindings, removed or ambiguous layers) is row 27; control arrangements
are row 28.

## Pinned main

Worktree from `d3e28a8dd9ff42f74a9a7f94fbb166f2291b6d89` (PR #1981, row 25). Previous verified
main: that SHA.

## What the product did before this row

Measured on that main, through the wizard and the editor:

- **A plain import.** The nested headline of `e2e/fixtures/fidelity-nested.svg` is field `f0`
  inside `#card` inside the transformed `#parent`. It is a timeline row, takes keys and eases,
  and save and reopen keep them. Nothing failed.
- **A behaviour import.** On the four-team scoreboard (score recipe) the nested scores `f2`, `f4`,
  `f6`, `f8` sit inside their `Row` groups. They are fields (number type) and timeline rows, and
  base placement edits apply. The drawn flash and final layers, which the recipe paints by class,
  are not offered as rows. Every key on any layer is refused by the editor's standing rule
  "This sequence has calls, measured motion, loops or state-machine ownership" (the machine owns
  the sequence; the On air step carries the `noacgRepaint` call). The refusal changes nothing.

Nothing lost its field or its target, so no product source changed. The files in TOUCHES other
than the spec (`svgIdentity.ts`, `artworkLayers.ts`, `svgBind.ts`) are unchanged; the credits
binding, its pins and the catalog emit did not move.

## Rules

Observable lines; the two journeys in `e2e/editor-fidelity-trim.spec.ts` check each one.

- L1 A nested field bound by the import stays a field after save and reopen: same id, title and
  type, on the same node inside the same groups.
- L2 Its keys and their eases come back byte for byte; its timeline row still selects, reads the
  keyed value at the key's time and takes a new key.
- L3 After reopen the text editor and the runtime's `update()` both write the nested node.
- L4 The compiled graphic plays the keyed timing and ease the editor model computes, sample for
  sample.
- P1 On a behaviour graphic the recipe owns its drawn looks: they are no timeline rows, and the
  paint runtime sets their class on air after save and reopen.
- P2 The machine owns the sequence: a key is refused whole and the document is unchanged. The
  nested field keeps its field and takes a base placement edit, which the paint never moves.

## What landed

- `e2e/editor-fidelity-trim.spec.ts`, two tests:
  - **Nested field, timing and ease** (L1 to L4): the wizard import of the nested fixture (the
    preparation), two Position X keys on `#f0` with Easy Ease, save, reload. The source, fields,
    keys and eases equal the saved ones; the row reads the same Position X at 0.6 s and takes a
    key at 0.4 s (undone); Apply text writes the nested node and changes only the field's
    value; the self-contained graphic's `update()` writes it; and its step timeline at 0, 0.15,
    0.3, 0.45 and 0.6 s matches `resolveValue` to 0.05 px, where 0.15 s is more than 5 px from
    linear.
  - **Behaviour paint ownership** (P1, P2): the four-team scoreboard imported with the score
    recipe. No look layer is a row; a key on `#f2` is refused with the ownership reason and the
    template is unchanged; the Inspector shows the reason; a base placement of +12 on `#f2`
    leaves the JS and fields alone. After save and reload the rows and source are unchanged. In
    the self-contained graphic, `update()` writes 3 into `#Row_x20_1 > #f2`; `score1` with 4
    makes it 4 and paints team 1's flash and no other; `#f2` stands 12 artwork units from where
    it was drawn before and after the paint.
- `docs/work-specs/jev-svg-import/evidence/phase-26.md`: this file.

## Verification on this worker

- `e2e/editor-fidelity-trim.spec.ts` whole: 13/13 through the queue (j-0009).
- The two new tests: 2/2 (j-0006, j-0007). Earlier runs failed on test faults, not product ones:
  Position X shows base plus key (98, not 40); Apply text updates the field's value; `score1`
  takes the adjusted value as its payload, as the production page sends it; gsap's `x` on an SVG
  text reports its drawn matrix, so the placement is read through the artwork's scale.
- Mutations, each reverted (j-0008): the runtime ignoring per-key eases fails the ease test at
  sample 1 (played -12.5, expected -19.06). Dropping `look` from the part registry's hidden-class
  test changed nothing: those layers are also hidden by the designer's `display:none` class, so
  the rule holds twice and the test's row assertion still guards the outcome.
- `npx eslint e2e/editor-fidelity-trim.spec.ts`, `npx tsc --noEmit -p .`: pass.
- `node scripts/check-e2e-protection.mjs --changed origin/main`: OK.
  `npm run gates -- run --changed origin/main`: 7/7.
- Not run here: the configured suite (CI selects it), a production build (no build input
  changed), a manual browser walk (the journeys drive the same UI and the compiled graphic).

## Decisions

- **"Prepare" is the import's preparation**, the wizard's mapping step and behaviour choice, as
  this plan uses the word (`e2e/jev-svg-preparation.spec.ts`). The production page's Prepare for
  Live is a publish and readiness check, not an editor surface, so it is not walked here.
- **Keys under a recipe stay refused.** The editor's documented rule refuses keys where a machine
  owns the sequence and keeps the recipe's motion and paint. Allowing them would be a new
  animation capability, which this row may not add. Filed as #1982 (P3, editor) so row 39's
  matrix states the limit: on a behaviour graphic a nested layer is a field and a placeable
  layer, not a keyframe target.
- **Tests only.** Nothing failed to reproduce, so no source in TOUCHES changed.

## Traps

- Position X in the Inspector is the base plus the key, so a keyed offset reads as base + value.
- A score's `+1` reaches the graphic as the adjusted value (`noacgDispatch('score1', { f2: '4' })`);
  a bare `score1` paints the flash but leaves the number.
- An Easy Ease is stored on the arriving key of a segment (a `cubic` ease string there).

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-26-build')"

Tests and notes only; a revert changes no graphic.
