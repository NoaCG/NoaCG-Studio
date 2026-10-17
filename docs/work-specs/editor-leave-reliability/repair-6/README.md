# Save transaction repair (#1382 #1383 #1384 #1386)

## Scope

The owner authorised this as the single save-design repair after the fifth independent check
failed ([independent-5](../independent-5/README.md), main `0b985904`). Five checks had each failed
on one more ordering of a Save's separate durable writes. The owner's decision: stop patching one
case at a time, make Save one ordered transaction with one owner for refusals, and test the whole
family at once. Scope is acceptance criteria 2 and 3 and the owner's row "Unsaved work is
questioned after reaching Home": resolve unsaved work before leaving, no delayed repeat question at
the destination, no duplicate saved graphic.

## The write inventory

Every durable write a Save-family operation makes or waits on, on main `6d66070e`, and every
autosave that could trail it. "Slot" is the working draft, `spx-gfx-project`; "library" is
`spx-gfx-graphics`.

| Write | Made by | Key | Before this repair |
| --- | --- | --- | --- |
| L, the record | `saveCurrentGraphic` (`updateGraphic`), `saveGraphicAs` (`createGraphic`) | library | Captured, awaited and claimed (#1351). |
| K, the link | `commitLink` → `persistLink`, after L | slot | Awaited and claimed (#1367). |
| A, an edit's autosave | `templateStore`'s 800 ms timer, pending when Save starts | slot | Fired after the answer, often at Home. Its refusal raised the app notice and marked the saved graphic unsaved (#1382, C1). |
| N, the name adoption's autosave | the same timer, scheduled by Save/Save As adopting the record's name | slot | Same as A (#1382, B1, B2). |
| I, an autosave in flight | the timer above, fired just before Save started | slot | Not waited for. A late refusal was announced generically. |
| The minted id | `createGraphic`'s `uuid()` | memory only | Durable only through K. K refused, then a reload: the slot was unlinked and the next Save minted a second record (#1383, A1). |
| The walk's record | `saveBuiltGraphic` (walk memory) | memory | Noted after the door answered. A second press under a new name while the first mint was pending found neither the record nor the name, and minted again (#1384). |
| D, Discard's replacement | `discardCurrentGraphic` → `saveProject`, and the restore write after a stale refusal | slot | Captured and claimed (#1147, #1333). Unchanged. |
| The leave's history replay | the router's `history.go(1)` after the guard approved | browser history | Lost when the preview frame navigated while the guard asked (#1386, below). |

Callers: the topbar Save and Ctrl+S (`SaveControls`), the naming dialog for first Save and Save As
and its retry (`SaveDialog`), the leave guard's Save & continue and Discard (`ConfirmSwitchDialog`,
for Home, Open, New, Back and a hash change through `guardNavigation`), and the wizard's Finish
doors (`saveBuiltGraphic` through `LIBRARY_IO`). Every one calls `saveCurrentGraphic`,
`saveGraphicAs` or `discardCurrentGraphic`, so the order is enforced there, once.

## The design: one ordering rule, implemented once

`src/store/saveActions.ts` runs each Save, Save As and Discard as one transaction, one at a time
(`transaction`, a promise chain owned by the store, which every caller awaits). A save's order:

1. Claim the slot writes already in flight (I, `unsettledWrites` in `durableStore`).
2. First Save / Save As only: **reserve** the record's id in the slot (`reservedGraphicId`) and wait
   for it. Refused, the save fails and nothing is minted.
3. Write the record (L) under that id and wait.
4. Wait for the writes claimed in 1, so the link lands after them.
5. Write the link (K) and wait.
6. Flush the source's pending autosave (A or N) and wait: `settleTrailingAutosave`. It carries
   exactly what K just made durable, so its refusal loses nothing, and it is claimed. A newer
   edit's autosave is left to its own timer, because that save is stale and its caller stays in
   the editor to ask again.

The rule: **a Save-family operation answers (saved, failed, or stale: `saved` with `dirty`) only
after every write it made or claimed has settled, and their refusals are its own.** They are
answered by the operation's dialog, over the editor, never by the app-level notice once the leave
has gone on. Writes that anything else makes while it waits stay theirs and are announced by the
app as before. That keeps the fourth checker's "another write's refusal during a held Save is
announced by the app".

The record's identity is durable before the record: on boot, `templateStore` links the draft to
`reservedGraphicId` when that record exists, so a reload after a refused link write relinks rather
than minting. Every later slot write drops the field, since it carries the live link.
`SavedProject.reservedGraphicId` is additive and optional, so the version does not change.

`saveGraphicAs` returns the minted id with every answer. The wizard's `saveBuiltGraphic` notes it
as the walk's record and, while a mint is pending, makes a second press wait for it. Only a mint is
waited for, because a write over a known record already names it. The walk-state test "neither
waits on the other" pins that.

Reuse: `captureDurableWrites` and `commitDurableReceipt` fit and stay. They are what lets each step
name and claim exactly its own put. `durableStore` gains one export, `unsettledWrites(key)`, for
step 1. `commitDurableWrites` and its other callers (#1360) are not replaced here. The rule wording
in `src/model/AGENTS.md` therefore stays with #1360. `src/store/AGENTS.md` now describes the
transaction.

## #1386: why the hash-change leave did not continue

Mechanism, measured in this VM with a scratch diagnosis spec (`e2e/diag-1386.spec.ts`, not
committed). It is deterministic once the order is forced:

- A hash change pushes `#/home`. The router restores the editor entry with `history.go(-1)`, asks,
  and on approval replays `history.go(1)`.
- The editor's preview (`PreviewController.load`) sets `iframe.srcdoc` on the same frame whenever
  the template changes, the name included, because no fast path covers a name-only change. A
  subframe navigation joins the joint session history. It inserts an entry after the restored
  editor entry and **drops the forward `#/home` entry**. `history.length` is unchanged (one entry
  dropped, one added), which is why the checker saw "the forward entry in place".
- Renamed while the guard asks, then wait for the frame's load, then `go(1)`: no `popstate`, no
  `hashchange`, the editor stays (j-0008 "rename-wait", j-0009 "ui forward rename"). The same
  with no rename leaves at once (j-0009 "ui forward none"). Renamed and `go(1)` at once: the
  traversal ran before `srcdoc` was set (14 ms vs 112 ms), and it left (j-0008 "rename-now").
- In `:228` the first Save adopts the new name before its link write, then calls `go(1)` once the
  link landed. Whether the frame navigation commits first is a race, which explains 7/12 and 3/10.
  With the name kept, nothing navigates the frame, which explains 10/10.

Fix, in `src/app/router.ts`: approval replays the attempted move onto its destination, never by
counting entries. A forward attempt (a hash change or Forward) pushes the attempted route. Back
traverses to the attempted entry's Navigation API key where the browser has one, since an entry
inserted after the restored one would put the editor's own previous frame entry under `go(-1)`.
Otherwise it uses `go(-delta)` as before. The matrix's "leave replay" cases hold the link write
until the renamed preview has loaded, which forces the losing order, for a hash change and for
Back.

## The case matrix (`e2e/save-transaction.spec.ts`)

Each case fault-injects one write, found by its key and the function names on its put's stack.
`hold` defers the completion notice, `refuse` throws `QuotaExceededError` once, and `late` keeps
the transaction open and then aborts it. Each case then asserts the door's own answer, the record
count, the record's source, the live link, no `spx-storage-error`, no app notice, New asking
nothing, and the link after a reload.

| Operation | topbar Save (linked) | Save & continue (linked) | first Save, new name | first Save, kept name | Save As | wizard door |
| --- | --- | --- | --- | --- | --- | --- |
| refuse + retry | L, K, F | L, K, F | R, L, K, F | R, L, K | R, L, K, F | R, L, K, F (production door) |
| refuse + reload | (a) | L, K, F | R, L, K | K | K | (b) |
| hold + edit | K | L, K, F | R, L, K, F | (c) | L, K | (d) |
| replace during | K, F | (e) | (e) | (e) | (e) | (e) |
| double submission | L | L | R, L | (c) | L | L, same name and renamed (export door) |
| in flight at start (I, late refusal) | (f) | I | I | (c) | (f) | (g) |
| leave replay after the frame navigated | – | – | hash, Back | (c) | – | – |

Reasons for the cells without a case:

- (a) The topbar door has no continuation, so reload is the same draft state as Save & continue's
  case for L and K, which runs. F reload is covered by Save & continue / F.
- (b) Wizard reload: the walk lives in memory and a reload ends it. The record and the slot's
  reservation are the same writes as first Save's, whose reload cases run.
- (c) First Save under the kept name differs from the new-name door only by having no N. Every
  write it does make (R, L, K) has its refuse+retry, and K has its reload (A1's case). Its hold,
  double-submission and in-flight cases are the same code path as the new-name door's.
- (d) The wizard renders no editor during its save, and nothing writes the template on `#/new`
  (repair-4 note), so no edit can arrive during the hold.
- (e) Save & continue, the naming dialog and the wizard door are modal and busy while they wait.
  The only route to another document is through the guard, which asks, and whose Save or Discard
  now queues behind this transaction. Topbar / L has no case for the same reason: until K starts,
  the draft still reads unsaved, so Open asks first.
- (f) In-flight I at the start of a topbar Save or Save As is the same claim, made by the same
  function, as the two cases that run. Those two prove it is claimed before the record write.
- (g) The wizard writes no autosave of its own before the door: on `#/new` the template changes
  only through the door's apply.

Discard (D) is not crossed again here. Its refuse, refuse+reload, hold+edit and stale cases are the
carried original, second, third and fifth (G1) checkers and the maintained `new-graphic-guard`
cases. It now runs through the same transaction queue, and its click-time snapshot is taken before
it queues.

## Results

Disposable dispatch-only probes, no pull request, never queued. Each run records the carried files'
sha256, byte-identical to independent-5: original `28988d71…`, second `ef78c1eb…`, third
`71f8378b…`, fourth `95317231…`, fifth `145756a7…`, references `8aaf0a47…`, `2447cef0…`,
`bae58ddb…`.

- Fix probe `claude/probe-editor-p2-repair-6-ci`: this branch at `5ca13fa8`, plus the carried files
  and the checker's recipe, with two scopes added (`repeat228`, `matrix`).
- Main probe `claude/probe-editor-p2-repair-6-main` (`4b64b3d3`): main `6d66070e`, plus the same
  files and this matrix only.

| Run | Result |
| --- | --- |
| Fifth checker on main, [39030466888](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39030466888) | **5 failed / 15 passed**: A1, B1, B2, C1 and H1-renamed, exactly where the fifth receipt says. |
| Fifth checker on the fix, [39030410046](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39030410046) | **19 passed / 1 failed**. A1, B2, C1 and H1-renamed now pass. B1 fails by timeout inside the checker's facts step (see Limits). In this VM, j-0012 gives the same result, and the copy with only that call guarded passes 60/60 over 3 repeats (j-0013). |
| `:228` x20 on the fix, [39030411353](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39030411353) | **20/20**. In this VM, j-0017 gives **20/20**. |
| Unchanged checkers on the fix, [39030408693](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39030408693) | Original **3/3**, second **4/4**, third **10/10**, `:24` x20 **20/20**, fourth **11/11** (`:228` and both `:298` included). |
| Maintained selection on the fix, [39030412630](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39030412630) | **85 passed**, the same **8 legacy skips** (new-graphic-guard, library, wizard-draft-guard and the preserved editor selections). Two-graphic export **1/1**. |
| Matrix on the fix, [39030414011](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39030414011) | **52/52**, one worker, 9.3 min, every case under 30 s. In this VM: j-0016 52/52, and j-0020 52/52 on the final head after review. |
| Matrix on main, [39030465479](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39030465479) | **22 failed / 30 passed**. The behaviour failures are first-kept K reload (#1383, A1's shape), in-flight I for leave and first Save (late refusal announced after the save), the renamed export double (#1384), and the leave replay for **hash and Back** (#1386; Back was lost the same way). The R and F cases fail on main because those writes do not exist there: no reservation, and the trailing autosave fired after the answer. |
| Walk-state and door Node tests | **53/53** (`scripts/wizard-walk-state.test.mjs`, `scripts/wizard-doors.test.mjs`), including "held writes: … neither waits on the other". |

Mutations, each run on the matrix in this VM and then reverted:

- M1, the answer before settle: `commitLink` answers without waiting for K or F (j-0018). **16
  failed / 36 passed**: every K refusal and K hold case, leave/F and first-named/F hold+edit, wizard
  K, and both leave-replay cases.
- M2 and M3 together: no step-6 flush, and no reservation (j-0019). **10 failed / 42 passed**:
  every F case (M2) and first-kept/K reload (M3, A1's shape).

Gates: `node scripts/gates.mjs run --changed origin/main` passes, `check-e2e-protection --changed
origin/main` passes, and `eslint` on the changed files and `tsc --noEmit -p .` are clean.

Captures: none committed. The fix's change is not visual. The dialogs, the copy and the notice are
unchanged, and only which writes reach them changed.

## Limits

- The carried fifth case B1 cannot pass as written, for a reason inside the checker. Its facts
  step reads `page.getByTestId('storage-alert').textContent()` with no action timeout. With the
  fix there is no alert, so that call waits out the 120 s test timeout. Run unchanged, B1 fails
  that way (j-0012). The same file with only that call guarded by a count
  (`e2e/diag-b1.spec.ts`, scratch) passes B1 and every other case, 60/60 (j-0013, 3 repeats).
  Its assertions hold on the fix: the refused put is the timer flush (no `persistLink`), there is
  no alert, and New asks nothing. The matrix's F cases pin the same thing.
- A refused trailing autosave (F) is not reported when K landed. That is by design: K holds the
  same source and link, and the mirror rolls back to it.
- Studio and Eyevinn reference tasks were not rerun. The change touches neither rendering nor
  editing, and the fifth check's two new reference tasks are about ordering, which the matrix covers.
