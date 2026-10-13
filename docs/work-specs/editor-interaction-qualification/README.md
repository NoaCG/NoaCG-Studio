# Remaining everyday interaction qualification

## Why and goal

October 6 feedback still names familiar selection, keyboard/context actions, modifier-drag
copying and property discovery. Qualify the remaining R1.2b interactions on current main
`dba61b8e1`, preserving the already qualified transforms, layers, short-height layout and
cumulative editing/output work. Engineering verification is separate from owner acceptance.

## Boundaries and decisions

- Reuse the existing operation registry, source adapters, session history and preview.
  No scene store, transform/property replacement or workspace redesign.
- Alt/Option-drag duplicates selected artwork roots and moves only copies in one transaction.
  Alt-click still cycles overlapping artwork. Shift constrains the drag; Alt on a scale
  handle retains its established pivot behavior. Copies reuse the existing stable-ID,
  field, animation and reference handling and its concrete unsupported-source refusals.
- Ctrl/Cmd+D duplicates; Ctrl/Cmd+A selects the current visible artwork scope. Inputs retain
  native keyboard ownership. Canvas and layer keyboard context actions use the same menu.
- A/P/S/R/T reveal existing Anchor/Position/Scale/Rotation/Opacity controls; U reveals
  animated timeline properties. Previous/next property key buttons seek without editing.
  Anchor remains static under the October 1 decision. Do not imply anchor animation support.
- Reproduce first. Already correct behavior gets evidence, not replacement code. Preserve
  existing cumulative text/animation/save/reopen and SPX/CasparCG/OGraf browser-output tests.
- No leave-editor/cloud status, clipboard import, locking, loops, projects, AI funding,
  R2/R3, default switch, broad acceptance or receiving-host claim.

## Observable acceptance

1. Ordinary, additive, range and marquee selection agree across current-scope canvas and
   timeline. Context actions retain selected sets; keyboard duplicate/delete/undo/redo work
   without stealing from text/numeric/rename controls (E02/E07/E17, B02/B06).
2. Alt-drag previews a copy while original source/history remain unchanged, commits only once,
   selects stable copy IDs, and undoes/redoes the whole gesture. Escape, pointer cancellation,
   and unsupported mixed selections preserve original source/history. A stale gesture retains
   the latest authoritative source/history and removes its draft. Repeat
   with several roots, nested groups and an animated layer. Alt-click and handle constraints
   remain intact (E07/E17, B02/B03).
3. Property reveal and previous/next-key navigation work from editor focus, leave source,
   assets and history unchanged, and respect input ownership. Unkeyed properties remain
   available; key buttons explain their action (E02/E17, B03/B06 and property contract).
4. Inspect desktop 1920x1080, laptop 1366x768 and actual native browser 125% rendering. Preserve
   the approved short-height allocation and reachable controls, without claiming comfort acceptance.
5. Execute the same bounded interactions in pinned Zero Density Studio `3142fc7d` (official
   v0.17 with inspected-source equivalence) and a suitable documented secondary reference.
   Trace event -> mutation -> preview and tests. Record exact revisions, differences and
   omissions. Copy no AGPL code.
6. Existing cumulative import/create, ordinary editing, editable text, motion, exact cancellation,
   durable reopen and executable SPX/CasparCG/OGraf regressions continue to pass. Full suites
   belong to CI. Local browser jobs use the scheduler and unchanged 4GB RAM floor.

## Reproduction and evidence

Current-main reproduction used product `dba61b8e1` in disposable CI run
[38425103564](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38425103564).
All three new cases failed at their intended missing behavior: Alt-drag cancellation lost
selection, Ctrl+D did not duplicate, and P did not reveal Position. Existing additive/range
selection, rename/eye, context actions, numeric scrubbing and transforms were retained.

The change reuses the operation registry for copy batches, previews temporary rendered clones,
and commits once on release. Escape/pointer cancellation removes drafts. Changed source,
time, cue or selection refuses the gesture. The existing stable-ID/reference rules still
refuse unsupported structures atomically. Keyboard commands use the existing input guard
and only canvas/timeline/inspector focus; property shortcuts and key navigation only change
editor view state.

- [Verification and limits](verification.md), including failed assertions and driver corrections.
- [Pinned source and executed reference comparison](reference.md),
  [source hashes](provenance.json), [reference runtime receipt](reference-runtime.json).
- [Workspace, native zoom and executable output receipt](workspace-runtime.json).
- `ci-probe.patch` reproduces the builder tasks on a disposable branch. It is evidence only,
  never merge-queue input. It installs pinned dependencies and the hash-checked Studio release.

Earlier transform/layer/short-height receipts and specifications remain unchanged; the six
original layer/property cases remain an exact source prefix. Full owner acceptance, native
macOS device behavior and receiving-host certification are not claimed. Save/leave/cloud
status are subsequent phases.
