# Sixth independent leave-editor check

**FAIL product: a leave can start while a topbar Save is still writing, and the Save's refusal
then shows up at Home as a delayed repeat question.** Repair-6 (#1391) holds against every carried
challenge and against most of the new ones. It fails on one ordering outside its write inventory.

- [#1392](https://github.com/NoaCG/NoaCG-Studio/issues/1392) (P1). A linked graphic has an edit.
  The user presses the topbar Save. Once the record lands, the transaction marks the draft clean
  (`dirty: false`, status `saving`) and waits for the link write (K). Home pressed in that window
  (or a hash change to `#/home`) does not ask or wait, because the guard reads only
  `saved.dirty`. If K is then refused, the Save claims the refusal as designed. But the only
  place that answers it, the topbar status, is gone. Home shows nothing. Then **+ New graphic**
  asks "“…” has unsaved changes" about the graphic just saved, and it still asks after a reload.
  The record holds exactly the saved source. This is the owner's "delayed repeat question at the
  destination" (AC 2).
- [#1383](https://github.com/NoaCG/NoaCG-Studio/issues/1383), still open, residual (commented).
  The single-refusal form is fixed: fifth A1 passes. Repair-6's disclosed limit, with both the
  reservation and the link write refused followed by a reload, still mints a second record
  (AC 3).

This is the sixth failed check of the leave-editor phase. Phase 3 (save/cloud-status) does not
start. No edit is lost in any case.

## Scope

Checked main `ea71261c9` (merge of #1391). The checker built neither the phase nor its repairs. It
changed no product code, maintained test, gate or limit.

The disposable branch `claude/probe-editor-p2-check-6-ci` holds tests and CI recipes only. It has
no pull request and must never be queued. It contains main plus the carried checker files and the
repair-6 probe's dispatch recipes, plus two scopes (`sixth`, and a bounded B1 step in `fifth`).
Commits: `00cdbf60` (the carried runs), then `12129544` (the sixth spec's three checker fixes,
below). The carried files are byte-identical to independent-5 and repair-6. Each CI run records
their sha256: original `28988d71…`, second `ef78c1eb…`, third `71f8378b…`, fourth `95317231…`,
fifth `145756a7…`, references `8aaf0a47…`, `2447cef0…`, `bae58ddb…`. This check's spec is in
[probe.patch](probe.patch): `e2e/leave-sixth-checker.spec.ts` (`68698bc6…`). It is the challenge
a repair carries unchanged. The bounded B1 copy, `e2e/leave-fifth-b1-bounded.spec.ts`
(`32b0d289…`), is the fifth file with line 262 changed and nothing else:
`.textContent()` became `.textContent({ timeout: 1000 })`.

## How the transaction was attacked

The task was to break the transaction, not to re-run its matrix. Repair-6's inventory lists the
writes a Save-family operation makes or claims. Its ordering rule is that an operation answers
only after every one of them settled, over its own dialog. So the search looked for **callers
that act on the draft while a transaction is still running, without going through it**:

- `requestSwitch` (`saveActions.ts`) and `guardNavigation` decide by `hasUnsavedWork()`, which reads
  `saved.dirty`. `commitLink` sets `dirty: false` before it awaits K. Nothing on the leave path
  reads `status: 'saving'` or the transaction queue. The guarded doors for Save & continue, the
  naming dialog and the wizard are modal while they wait (repair-6's cell (e)). The topbar Save
  and Ctrl+S are not modal.
- `discardDraft` drains with `commitDurableWrites()` (#1360's API) inside the queue.
- The reservation (R) is the only record of a minted id before K.

The fifth checker's probe was reused, renamed. It wraps `IDBObjectStore.put`, records the
caller's stack, and holds, refuses or late-refuses one chosen put.

| Case | Door / write | Operation | Result on main |
| --- | --- | --- | --- |
| S1-home-late | linked topbar Save / K | late refusal; Home pressed meanwhile | **Fail** (#1392): Home without a question or notice; New asks; asks again after a reload |
| S1-hash-late | linked topbar Save / K | late refusal; `location.hash = '#/home'` meanwhile | **Fail** (#1392): same facts |
| S1-home-hold, S1-hash-hold | linked topbar Save / K | held; Home or hash meanwhile; then released | Pass: one record with the source; New asks nothing, before or after a reload |
| S2 | linked topbar Save / L | held; Home asks; Discard queued behind it | Pass: Discard does not leave before the Save answers, then leaves; one record with the source; no notice; nothing asks after |
| S3-hold | leave first Save / L | held; reload mid-transaction | Pass: the source is kept; the next Save leaves one record |
| S3-late | leave first Save / L | late refusal; reload mid-transaction | Pass: the source is kept; the next Save leaves one record |
| S4 | linked Save & continue / L | held; `history.back()` while busy | Pass: the Back is absorbed; the Save lands and the leave reaches Home once; the URL matches; no question is left open |
| S5 | first Save in tab A; tab B idle on the same draft | none | Pass: B writes nothing to the slot; A reloads clean; one record |
| S6 | first Save, kept name / R and K | both refused once; reload; Save again | **Fail** (#1383 residual, repair-6's disclosed limit): `afterReloadLink {graphicId: null}`, 2 records |

S1 facts (CI and VM agree): `linkDuringK {dirty: false, status: 'saving'}`, `homeAsked: 0`,
`homeMountedBeforeAnswer: 1`. After the refusal: `link {dirty: true, status: 'failed'}`,
`alert: 0`, `errors: 0` (claimed, so no notice), `records: 1` and `recordHasRequested: true`.
Then `newAsked: 1`, "“Sixth S1 home late” has unsaved changes. Save them before continuing?". The
slot is `dirty: true`, and `newAskedAfterReload: 1`. S6's refused stacks are
`persistLink ← mintGraphic` (R) and `persistLink ← commitLink` (K).

S5's tab B still holds its own in-memory copy and asks when it leaves. That is real unsaved work
in that tab, so it is recorded and not counted.

Checker bugs fixed between j-0028 and j-0029, all three in this spec: S3-late read the raw slot
while the late-refused transaction was still open, so the read queued behind it. S4 used
`page.goBack()`, which waits for a load that a guarded hash entry never fires. S6 kept only
160 characters of each stack. The S1 and S6 assertions are unchanged.

Not attacked, and why: a wizard door during a running transaction is modal (repair-6 (e)); no
door was found that saves outside the three functions. Discard during Save & continue is not
reachable, because the dialog is busy. Open from Home while a save is pending is fifth F-hold and
F-late, which still pass. The other `commitDurableWrites` callers (#1360) write other keys, and
the S2 drain claimed nothing of the Save's.

## Fifth B1

As asked, B1 was run unchanged and with only its unbounded read bounded:

- Unchanged: **19 passed, 1 failed** (B1 timed out) in CI
  [39037258308](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39037258308) and in VM j-0030.
  The report points at the next call (`link`, line 263) because the 120 s test timeout cancels the
  `textContent()` at line 262.
- Bounded: **B1 passes**, 1/1 in CI (same run) and in VM j-0030, where the bounded file's other 19
  cases pass too. Judged by its assertions, B1 passes. The refused put is the trailing flush
  (`flushPendingProject ← settleTrailingAutosave`, no `persistLink`). `alert: 0`, the link is
  `{dirty: false, status: 'idle'}`, `records: 1` and `newAsked: 0`.

## Criteria

| Criterion | Result |
| --- | --- |
| AC 1: Home asks over the editor; Cancel/Escape/cancelled naming keep source, selection, history | Pass. The carried original, second, third and fourth checkers; native 125% leave dialog. |
| AC 2: Save/first Save keep source; discard mints nothing; saved copies byte-equal; no repeated question | **Fail.** S1-late: New asks about a graphic just saved, with no notice, after a leave that did not wait for its Save (#1392). The rest passes: fifth A3, A4, B1 (bounded), B2, C1, D1 to D3, G1; S1-hold, S2. |
| AC 3: New/Open/Back/hash share the boundary; a failed write and double submission cannot navigate early or duplicate; no resurrection | **Fail.** S6: two refused slot writes and a reload mint a second record (#1383 residual). S1-hash-late also reaches Home before its Save answered. The rest passes: fifth A1, E1, E2, F, R1, H1-again, H1-renamed, H3; `:228` 20/20; S3, S4. |
| AC 4: baseline guard, wizard walk, library links, cloud separation, production copies; mutation | Pass. The maintained selection gives 85 passed, 0 failed, with the same 8 legacy skips, and the two-graphic export passes 1/1 ([39037260012](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39037260012)). The signed-in localhost task passes ([39037269283](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39037269283)), against a disposable local Supabase. The new failures are not vacuous: the held-only S1 controls pass on the same code. |
| AC 5: fresh Studio `3142fc7d` / Eyevinn `616841bd` executions, hashes, no copied source | Pass, 6/6 ([39037261850](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39037261850)). [reference.json](reference.json): the same 17 files, sha256 identical to independent-5. Studio binary `9ba1de31…`. |
| AC 6: desktop/laptop/native 125% cumulative text, artwork, animation, save/reopen, outputs | Pass, 4/4 ([39037264226](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39037264226)). Nine SPX/CasparCG/OGraf outputs, 0 errors. Native 125%: 1093x545 CSS, 196px canvas, 180px timeline, 280px inspector. |
| Carried checkers, unchanged | Original 3/3, second 4/4, third 10/10, `:24` x20 20/20, fourth 11/11 ([39037256888](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39037256888)). Fourth `:228` x20 20/20 ([39037265835](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39037265835)). Fifth 19/20, with B1 as above. Repair-6's matrix 54/54 as a regression check only ([39037267440](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39037267440)). |

## References

The references were not given a new task. The carried six ran and passed. For #1392 the
comparison is a reading of the hashed files, not an execution. Eyevinn's `saveToStorage` writes
both keys to `localStorage` synchronously, so no navigation can happen between its record and
pointer writes, and the carried fifth reference task refuses `setItem` in the same turn. Studio
v0.17's Save Project downloads the file. Its later autosave fails silently, and Studio has no
dirty tracking, so a late refusal can never become a question (fifth reference task). Neither
can leave while its save is still unanswered. NoaCG's durable writes are
asynchronous by design (`model/durableStore.ts`), which is why a leave has to wait for the save,
or ask.

## CI, VM and main

- CI used `--workers=1 --retries=0`, and the VM queue used 4 workers with `--retries=0`.
  [runs.json](runs.json) holds every run.
- Sixth spec: VM j-0028 (5 failed: S1 x2 and S6, which are findings, plus S3-late and S4, which
  were checker bugs), then j-0029 on `12129544` (**7 passed, 3 failed**: S1-home-late,
  S1-hash-late, S6). CI [39037645885](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39037645885)
  on `12129544` gives the same 7/3 with the same facts.

## Captures

[captures.json](captures.json) lists what was opened. None is committed.

Not run: a fix, which is not the checker's job. Physical hosts, owner comfort and hosted cloud
status stay outside the phase. The mutation runs of repair-6 were not repeated. This check's
failures are on main itself.
