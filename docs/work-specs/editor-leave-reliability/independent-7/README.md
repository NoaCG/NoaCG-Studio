# Seventh independent leave-editor check

**FAIL product: the durable reservation lets a second tab's older draft relink to the graphic
another tab saved, and its Save overwrites that graphic.** Repair-7 (#1397) holds against every
leave it changed: the dialog's three states, each answer pressed in each state, an edit made
during the save, Back while the dialog is open, a reload while it is open and a second tab opened
while it is open. Its reservation change introduced one regression.

- [#1402](https://github.com/NoaCG/NoaCG-Studio/issues/1402) (P1). Tabs A and B have the same
  never-saved draft open. A edits again and first-saves it as "Alpha" (record X). B still holds
  the draft as it was when B opened. B edits, and B's autosave writes the slot unlinked, with
  `reservedGraphicId: X`, because B resumed that reservation at boot. B reloads. Boot finds record
  X and an unlinked slot naming it, so it links B's draft to "Alpha". B presses Save. No name is
  asked for, the topbar says "Saved", and "Alpha" now holds B's source. A's later edit is gone
  from the saved graphic. On main before #1397 (`6f910963`), the same case passes: B reloads
  unlinked, Save asks for a name, and "Beta" is minted beside an unchanged "Alpha".

This is the seventh failed check of the leave-editor phase. Phase 3 (save/cloud-status) does not
start. In one tab nothing failed, and no edit was lost.

## Scope

Checked main `0ea3b314` (merge of #1397). The checker built neither the phase nor its repairs. It
changed no product code, maintained test, gate or limit.

Disposable branches, tests and CI recipes only, no pull request, never to be queued:

- `claude/probe-editor-p2-check-7-ci`: main plus the carried files and dispatch recipes taken
  byte-identical from `claude/probe-editor-p2-repair-7-ci` `78b4d0d0`, plus a `seventh` scope
  (`d3f39115`), then this check's spec (`e27983ce`).
- `claude/probe-editor-p2-check-7-pre` (`f08bb306`): main before #1397 (`6f910963`) plus the
  same spec and recipe, the control for #1402.

Every CI run records the carried files' sha256, identical to independent-6 and repair-7: original
`28988d71…`, second `ef78c1eb…`, third `71f8378b…`, fourth `95317231…`, fifth `145756a7…`, bounded
B1 `32b0d289…`, sixth `0b5207f2…`, references `8aaf0a47…`, `2447cef0…`, `bae58ddb…`. This check's
spec is in [probe.patch](probe.patch): `e2e/leave-seventh-checker.spec.ts` (`c11b4932…`), the
challenge a repair carries unchanged.

## How repair-7 was attacked

Repair-7 changed three things: the guard asks while `useSaveUi.inFlight` is set, the leave dialog
has three states and continues only on the user's word (`saveBeforeLeave`), and every slot write
carries the next mint's id (`reservedGraphicId`), resumed at boot. Its matrix crosses doors,
writes and refusals. The search here went after what the matrix does not press: the other answers
in each dialog state, state the dialog reads (`landed`) that an edit can change, browser and page
events while the dialog is open, and the reservation's owner when two tabs share one slot. The
sixth checker's probe was reused, renamed: it wraps `IDBObjectStore.put`, records each put's
stack, and holds or late-refuses one chosen put. Every case below acts on the topbar Save's own
link write (stack `persistLink`) of a linked graphic with an edit.

| Case | Attack | Result on main |
| --- | --- | --- |
| A-cancel-late | Home asks ("Saving “…”…"); Cancel; the link write is then refused | Pass: the editor stays, topbar "Save failed", no notice; the next Home asks; Save & continue reaches Home; one record with the source; New asks nothing, before or after a reload |
| A-cancel-hold | the same, the link write lands | Pass: "Saved"; the next Home leaves without asking; nothing asks after |
| B-discard-late | Discard changes pressed while it says Saving; then refused | Pass: Discard waits for the save; Home only after it; the record holds the source; no notice; nothing asks after |
| C-save-late | Save & continue pressed while it says Saving; then refused | Pass: the leave saves again and reaches Home; one record; nothing asks after |
| D-edit | an edit accepted while the save writes; Home asks; the save lands | Pass: the dialog says "has unsaved changes", not "is saved"; Save & continue writes the newer edit; one record |
| E-back | Home asks; `history.back()` while the dialog is open; the save lands | Pass: one dialog, the editor stays; "is saved"; Continue reaches `#/home` once, no editor or wizard |
| F-reload-saving, F-reload-saved | reload while the dialog says Saving, or "is saved" | Pass: the source is kept, linked and clean; nothing asks after |
| G-second-tab | tab B opens while A's dialog says Saving; A's save lands; A continues | Pass: idle B writes nothing; A asks nothing after, before or after a reload |
| H-reservation-two-tabs | A first-saves a draft B also has open; B edits, reloads, Saves | **Fail** (#1402): `slotReservationAfterB: X`, B linked to "Alpha" after its reload, `bNamingAsked: 0`, one record, `alphaUnchanged: false`, `alphaNowHoldsB: true` |

Control: H on main before #1397 passes: `slotReservationAfterB: null`, B unlinked, the name asked,
two records, "Alpha" unchanged. VM j-0042, CI
[39048135358](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39048135358).

Not crossed here, and why: the modal doors (Save As, the naming dialog, Discard and the wizard's
Finish doors) cannot be left while they write; the matrix pins hash and Back under them. New and
Open during a topbar Save are the matrix's 30 non-modal rows.

## The two recorded departures

- **Fifth B1.** Run unchanged, it times out, as in repair-6, independent-6 and repair-7
  ([39047556378](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39047556378)). Its unbounded
  `textContent()` on `storage-alert` waits out the test when the alert is absent, which is the
  fixed behaviour. With only that call bounded, B1 passes 1/1 (same run). The departure is correct: judged by its assertions (no notice, the link clean, one
  record, New asks nothing), B1 passes.
- **Fifth F-hold and F-late** (`leave-fifth-checker.spec.ts:447`). Both time out at `:464` (same run; the fifth file gives 17
  passed and these 3 timed out). They open
  **Open saved graphics…** while the topbar Save's link write waits, press Cancel when that asks,
  then wait for a library row a cancelled leave never shows. The departure is correct. AC 3 says
  New and Open use the same boundary and that a durable write still unsettled cannot navigate
  early. The owner's scope for repair-7 names Open among the leaves that wait or ask. AC 1 says
  Cancel keeps the editor. A fix that let this Open through would reopen #1392. Their remaining
  assertions (the record holds its source, the opened graphic owns the link, before and after a
  reload) are the matrix's updated `replace` cases, which pass (MATRIX).

## Criteria

| Criterion | Result |
| --- | --- |
| AC 1: Home asks over the editor; Cancel/Escape/cancelled naming keep source, selection, history | Pass. Carried original, second, third, fourth; seventh A, E. |
| AC 2: Save/first Save keep source; discard mints nothing; saved copies byte-equal; no repeated question | **Fail.** H: a saved graphic's content is overwritten by another tab's older draft after a reload, with no name asked (#1402). In one tab it passes: seventh A to G; fifth (B1 bounded); sixth 10/10. |
| AC 3: New/Open/Back/hash share the boundary; a failed write and double submission cannot navigate early or duplicate; no resurrection | Pass in one tab: seventh A to G, `:228` 20/20, sixth S6 (the #1383 residual) passes. H is recorded under AC 2. |
| AC 4: baseline guard, wizard walk, library links, cloud separation, production copies; mutation | Pass. The maintained selection gives 85 passed with the same 8 legacy skips, and the two-graphic export 1/1 ([39047563682](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39047563682)). Signed-in localhost task passes ([39047573162](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39047573162)). Mutation: repair-7's M1/M2 were not repeated; H's control on pre-#1397 main shows the failing assertion is not vacuous. |
| AC 5: fresh Studio `3142fc7d` / Eyevinn `616841bd` executions, hashes, no copied source | Pass, 6/6 ([39047566239](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39047566239)). [reference.json](reference.json): the same 17 files, sha256 identical to independent-6. Studio binary `9ba1de31…`. |
| AC 6: desktop/laptop/native 125% cumulative text, artwork, animation, save/reopen, outputs | Pass, 4/4 ([39047568730](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39047568730)). |
| Carried checkers, unchanged | Original 3/3, second 4/4, third 10/10, `:24` x20 20/20, fourth 11/11 ([39047553747](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39047553747)). `:228` x20 20/20 ([39047561209](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39047561209)). Sixth 10/10 ([39047558774](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39047558774)). Fifth as above. |

## References

The references got no new task; the carried six ran and passed
([39047566239](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39047566239)). For #1402 the
comparison is a reading of the hashed files, not an execution. Eyevinn's `saveToStorage` writes
the record and its pointer synchronously to `localStorage`, and the id is the record's identity,
minted when it is saved (independent-5's reading). Studio v0.17 saves a project by download and
has no library record to relink. Neither keeps an id for a record that does not exist yet, so
neither can link one tab's draft to a record another tab created. NoaCG's reservation is a shared, durable pointer to a
record that does not exist yet, so who owns it has to be decided, which is what #1402 asks.

## Runs

[runs.json](runs.json) holds every run. CI used `--workers=1 --retries=0`; the VM queue used 4
workers and `--retries=0`.

- Seventh spec: VM j-0041 on `e27983ce`, **9 passed, 1 failed** (H). CI
  [39047990848](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39047990848) gives the same
  9/1 with the same facts.
- Control on `f08bb306` (main before #1397): VM j-0042, H passes. CI
  [39048135358](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39048135358): H and D pass, and
  the other 8 fail because the leave does not ask while the save writes (#1392 on that code). So
  those 8 cases are not vacuous.

## Captures

[captures.json](captures.json) lists what was opened. None is committed.

Not run: a fix, which is not the checker's job; repair-7's mutation runs; physical hosts, owner
comfort and hosted cloud status, which stay outside the phase.
