# Fourth independent leave-editor check

**FAIL product: when storage refuses the Save's own link write, the leave still goes to Home and
the question comes back there** ([#1367](https://github.com/NoaCG/NoaCG-Studio/issues/1367)).
After its library write lands, Save and Save As persist the working draft's link (`persistLink`).
That write is neither awaited nor claimed. When storage refuses it, the leave dialog has already
continued to Home. The app-level notice then says "Your work is still open here" over Home and
marks the draft unsaved. The next New graphic asks again about the graphic that was just saved,
with or without a reload. The library record holds the exact source, so no edit is lost. Two
criteria fail: "a failed durable write … cannot navigate early" (AC 3) and "a later New/Open does
not repeat the question" (AC 2). So does the owner's outcome, "avoid a delayed repeat question at
the destination". Both #1351 and #1359 hold under fault injection, and everything else checked
passes. This is the fourth failed check of the leave-editor phase. Phase 3 (save/cloud-status) does
not start.

## Scope

Checked main `8e4358dbaab519163939485d145efeddf89e30e8`. It contains #1363 (merge `8e4358db`) and
with it #1355 and #1333. The checker built neither the phase nor its repairs. It changed no product
code, maintained test, gate or limit. The disposable probe branches hold tests and CI recipes only.
They have no pull request and must never be queued:

- `claude/probe-editor-p2-check-4-ci` is main plus test files and two replaced workflow files, which
  are dispatch-only recipes. Its runs used `16e52beb` and, for the added reference tasks, `63f492ee`.
- `claude/probe-editor-p2-check-4-mut1` (`bc9a2d11`) and `-mut2` (`f7bd13b2`) each add one deliberate
  product mutation. They exist only to prove that this check's cases are not vacuous.

The carried checker files are compared byte for byte. The sha256 hashes are recorded by each run:

- `e2e/leave-checker.spec.ts`, the original independent checker: `28988d718686064e…`.
- `e2e/leave-second-checker.spec.ts`: `ef78c1eb394c0c24…`.
- `e2e/leave-third-checker.spec.ts`: `71f8378b2bbb5ab0…`.
- This check's `e2e/leave-fourth-checker.spec.ts` (`953172315c885923…`) and
  `e2e/leave-reference-fourth.spec.ts` (`bce939422786e5fb…`) are in [probe.patch](probe.patch),
  so a repair can carry them unchanged.

## The failure

`e2e/leave-fourth-checker.spec.ts:298` (both the `first` and the `linked` variant). The probe
refuses, with a one-shot `QuotaExceededError`, the first `spx-gfx-project` put that follows the
Save's `spx-gfx-graphics` put. The recorded stack of the refused put is `persistLink ←
saveCurrentGraphic` (linked) or `persistLink ← saveGraphicAs` (first Save), so the refused write
is the Save's own. The run is [CI 39016115244](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39016115244),
and the facts are in [link-refusal.json](link-refusal.json). Both variants show the same result:

- Home is mounted and the editor is gone. The guard showed no error.
- The app-level "Could not save" notice says "Your work is still open here — export it or free
  some room, then save again", over Home.
- The live link is `{dirty: true, status: 'failed'}`, set by `App.tsx`'s unclaimed-error handler,
  while the library holds one record with the exact source.
- After a reload the slot still reads `dirty: true`, and Home's New graphic raises "has unsaved
  changes. Save them before continuing?" about that saved graphic.

Mechanism, from the code and the stack: `saveCurrentGraphic` and `saveGraphicAs` commit only the
library receipt (`commitLibraryWrite`). `persistLink()` runs after it and is not captured, so its
refusal goes to `reportError`'s generic path. The leave dialog continued on `'saved'` before that
write settled. This is the class of #1351 on the Save's second write. Mutation M2 shows that #1351
itself still holds.

## Criteria

| Criterion | Result |
| --- | --- |
| AC 1: Home asks over the editor; Cancel/Escape/cancelled naming keep source, selection, history | Pass. Carried checkers, maintained selection and cumulative tasks (below). Two new paths keep the editor's own history entry: after a Back, cancelling the guard that a held first Save raised again; after a hash change, Escape on the naming dialog that showed a refusal. |
| AC 2: Save/first Save keep source; discard mints nothing; saved copies byte-equal; no repeated question | **Fail** on the refused link write (above). Otherwise passes: held topbar Save, Save As (the original record is byte-equal) and the wizard door keep the exact sources, and reopening asks nothing. |
| AC 3: New/Open/Back/hash share the boundary; failed write and double submit cannot navigate early or duplicate; no resurrection | **Fail** on the refused link write (above). Otherwise passes. During a held Save, a drag, Ctrl+Z, Ctrl+S, Escape, double clicks, Back and a hash change move nothing, and exactly one library put is made. A refused first Save mints nothing, and a double-submitted retry makes one put and one record. |
| AC 4: baseline guard, wizard walk, library links, cloud separation, production copies; mutation of the guard | Pass. The maintained selection, including every `new-graphic-guard` case from #1333, #1355 and #1359: 80 passed, 0 failed, with the same 8 legacy skips ([39016116396](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39016116396)). The two-graphic export passes 1/1. The signed-in localhost task passes ([39016120901](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39016120901)), against a disposable local Supabase only. The mutations are in the next table. |
| AC 5: fresh Studio `3142fc7d` / Eyevinn `616841bd` executions, hashes, no copied source | Pass. The carried lifecycles pass 2/2 ([39016117794](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39016117794)) and with two new tasks 4/4 ([39016426816](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39016426816)). [reference.json](reference.json) hashes the same 17 files as independent-3 with identical sha256, the Studio pin is identical to its release, and the binary is `9ba1de31…`. |
| AC 6: desktop/laptop/native 125% cumulative text, artwork, animation, save/reopen, outputs | Pass, 4/4 ([39016119294](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39016119294)). Nine SPX/CasparCG/OGraf outputs, 0 errors. Native 125%: 1093x545 CSS content, 196px canvas, 180px timeline, 280px inspector. |
| #1359: a newer edit during each Save's wait stays unsaved | Pass. The cases hold the Save's own put and assert its value: leave Save, topbar Save with a real canvas drag, Save As, first Save via Back, the wizard New door, and Open-saved-graphics followed by Discard after the stale refusal. Reload keeps the newer draft, and the second Save writes into the same record. |
| #1351: refusal of the Save's own library write vs another write's | Pass. A refused topbar Save while the autosave put is held reads "Save failed" and stays dirty, and Home asks. An autosave refused during a held Save is announced by the app, while the Save lands its exact source and continues. |
| Carried checkers: original `:24`/`:53`/`:69`, second `:91`/`:106`/`:135`, third (10) | Pass, unchanged ([39016114073](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39016114073)): original 3/3, second 4/4, third 10/10. `:24` repeated 20/20 as a regression check only; the race is proven by the held cases. |

### Mutations (non-vacuity)

| Mutation (disposable branch) | Fourth-checker result |
| --- | --- |
| M1, `bc9a2d11`: Save and Save As mark the draft clean whatever changed during the wait (the #1359 regression) | [39016182350](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39016182350): 7 failed / 4 passed. The topbar, Save As, Back first-Save, wizard-door and Open-path cases fail. The capture shows Graphics mounted with nothing asked. The two `:298` cases fail as on main. |
| M2, `f7bd13b2`: the linked Save waits on every pending write again (the #1351 regression) | [39016183758](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39016183758): 3 failed / 8 passed. The refused-topbar-Save-with-held-autosave case fails ("Saved" instead of "Save failed"). The two `:298` cases fail as on main. |

## References

The existing lifecycle tasks were run again, and two new tasks match this check's new
challenges. The stubs are this probe's own:

- Studio v0.17 (`3142fc7d`). Save Project awaits a compatibility check and then the file writer.
  With the writer's `close()` held, an edit made during the save is not in the written file. New
  then asks "Start a new project? Unsaved changes in the current project will be lost." Studio has
  no dirty tracking, so New always asks, and it never treats an edit as saved. NoaCG matches the
  outcome: the edit stays unsaved and leaving asks.
- Eyevinn (`616841bd`) saves to localStorage synchronously. With that write refused once, the editor
  still says "Template created successfully". It dispatches a storage event that no UI listens to,
  logs one console error, and after a reload the template is gone. NoaCG deliberately differs: a
  refused Save must be Save's own answer, and it must not leave. The fourth case fails exactly
  there.

No upstream source was copied.

## CI and main

- Every case ran in GitHub Actions on the disposable branches, with `--workers=1 --retries=0`.
  This VM refuses browser jobs (#1361), so nothing ran locally. [runs.json](runs.json) holds each
  run's steps and counts.
- Main CI on `8e4358db` ([39015354033](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39015354033))
  **failed** in E2E 1/13 on `e2e/editor-groups.spec.ts:342`: a group canvas drag left the CSS
  unchanged (`:347`). That spec has a quarantine history and is not on a leave-editor path. It is
  not counted here. Every other job passed. Post-landing and Quarantine passed. The configured-suite
  run was still in progress at 08:16Z. The last green main CI is `0854925a` (39005842892).

## Captures

[captures.json](captures.json) lists all 59 captures with their hashes. None is committed. The 16
marked `opened` were looked at: every finding, refusal, reference and native-zoom capture among
them. The maintained selection's own captures were not reviewed one by one beyond the
`autosave-newer-edit` refusal. The `:298` captures show the "Could not save … still open here" notice over Home, then after
reload the "Unsaved changes … Save & continue" question about the saved graphic. The refused
first-Save capture shows the naming dialog with "Browser storage is full" over the editor. The
Back capture shows the completed wizard's own "Back to the wizard?" notice, which is that
surface's deliberate behaviour. The Studio capture shows "Newer during the save" live while the
status reads "Project source saved". The Eyevinn capture shows its success toast for the refused
template.

Unrun: nothing in the row. Hosted cloud status, owner comfort and physical hosts stay outside the
leave-editor phase. #1360 (the other `commitDurableWrites` callers) was not needed for any
criterion and was not examined.
