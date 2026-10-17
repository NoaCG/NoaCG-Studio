# Fifth independent leave-editor check

**FAIL product: Save's separate writes still have orderings that break the phase.** Three of them
fail acceptance criteria 2 and 3 and the owner's outcome. One more breaks a carried checker
challenge that #1376 had passed.

- [#1382](https://github.com/NoaCG/NoaCG-Studio/issues/1382) (P1): a working-slot autosave of the
  source that Save just saved is still pending when the Save answers. If storage refuses it at
  Home, the app says "Could not save … Your work is still open here" over Home, marks the draft
  unsaved, and **+ New graphic** asks about the graphic that was just saved. A first Save or Save
  As under a new name schedules that autosave every time, through the name adoption. A recent edit
  leaves one pending too.
- [#1383](https://github.com/NoaCG/NoaCG-Studio/issues/1383) (P1): a first Save keeps the
  template's name, the dialog's default. Its link write is refused, and the page is reloaded
  without a retry. The draft comes back unlinked, and the next Save mints a **second record**.
  This is the limit the #1367 repair recorded. Measured, it fails "cannot … mint duplicate
  records".
- [#1386](https://github.com/NoaCG/NoaCG-Studio/issues/1386) (P1): a hash-change leave whose first
  Save adopts a new name often lands the save but never continues the leave. The carried
  `leave-fourth-checker.spec.ts:228` fails on main 1 of 1, then 7 of 12 in CI and 3 of 10 in this
  VM. With the name kept, it passed 10 of 10.
- [#1384](https://github.com/NoaCG/NoaCG-Studio/issues/1384) (P2): the wizard's Export door,
  pressed again under a new name while its mint is pending, mints a second record.

This is the fifth failed check of the leave-editor phase. Phase 3 (save/cloud-status) does not
start. No edit is lost in any of these cases.

## Scope

Checked main `0b98590417875e7eb833099017d393df77b6e53d`, which contains #1376 and with it #1363,
#1355 and #1333. The checker built neither the phase nor its repairs. It changed no product code,
maintained test, gate or limit. Later main `fc9dcc63` (#1379) changes only
`scripts/execution-profile.mjs`. The VM jobs ran on the probe merged with it, so the product code
is identical.

The disposable branches hold tests and CI recipes only. They have no pull request and must never
be queued:

- `claude/probe-editor-p2-check-5-ci` is main plus the carried checker files, this check's specs
  and the dispatch-only recipes (`deploy-verify.yml`, `configured-suite.yml`).
- `claude/probe-editor-p2-check-5-mut` (`dfe624eb`) adds one product mutation: Save's link write
  is made but neither waited for nor claimed. It proves that the passing new cases are not vacuous.

The carried checker files are byte-identical to independent-4. Each run records their sha256:
original `28988d71…`, second `ef78c1eb…`, third `71f8378b…`, fourth `95317231…`, references
`8aaf0a47…` and `2447cef0…`. This check's own specs are in [probe.patch](probe.patch):
`e2e/leave-fifth-checker.spec.ts` (`145756a7…`), `e2e/leave-reference-fifth.spec.ts`
(`bae58ddb…`) are the challenges a repair carries unchanged. The same patch holds a diagnosis
aid, `e2e/leave-fifth-diag.spec.ts` (`933d4b8e…`). It is not a carried challenge.

## How the write family was searched

A Save makes these durable writes. L is the library record, as `spx-gfx-graphics`. K is the
draft's link, `persistLink` from `commitLink`, as `spx-gfx-project`. A is an edit's 800 ms
autosave timer, and N is the timer that a Save's own name adoption schedules, both as
`spx-gfx-project`. Discard makes its own slot write, D, after it drains the pending writes.

The probe wraps `IDBObjectStore.put` and records the caller's stack for every put. So each case
proves which write it acted on: `persistLink` for K, the `templateStore` timer for A and N. It can
act on a write in three ways. **hold** defers the completion notice. **refuse** throws
`QuotaExceededError` once. **late** keeps the transaction open with reads and then aborts it, so
the refusal arrives after whatever happened meanwhile.

The operations were sampled across the writes, not crossed with every one of them. K got all five
operations. L got hold, late refusal and double submission. A and N got refusal only. Discard's
slot write got refusal with reload. The rest of the combinations are untried, and they stay open
for the next check.

| Case | Door / write | Operation | Result on main |
| --- | --- | --- | --- |
| A1 | first Save, template's name kept / K | refuse, reload, save again | **Fail**: the draft comes back unlinked; 2 records (#1383) |
| A2 | first Save, new name / K | refuse, reload after N | Pass: N lands the link; 1 record |
| A3 | linked leave Save / K | refuse, reload, Save & continue | Pass: 1 record with the source; New asks nothing |
| A4 | Save As / K | refuse, reload | Pass: the draft stays the copy; the original is byte-equal |
| B1 | first Save, new name, leave to Home / N | refuse at Home | **Fail**: app notice over Home; New asks; after a reload it does not (#1382) |
| B2 | topbar Save As / N | refuse | **Fail**: "Save failed" and the app notice for a copy that landed (#1382) |
| C1 | linked leave Save straight after an edit / A | refuse at Home | **Fail**: as B1 (#1382) |
| D1 | first Save from the leave dialog / K | hold, edit meanwhile | Pass: asks again over the editor; Save & continue writes the newer source |
| D2 | linked leave Save / K | hold, edit meanwhile | Pass: "changed while saving"; the retry writes the newer source |
| D3 | Save As / K | hold, edit meanwhile | Pass: the copy stays unsaved; the original is byte-equal |
| E1 | first Save / K | refuse twice, retry twice | Pass: 1 record, one leave, no app notice |
| E2 | first Save / K | refuse, Escape, leave again | Pass: Save & continue writes the same record |
| F-hold, F-late | topbar Save / K | hold or late refusal, another graphic opened meanwhile | Pass: the opened graphic owns the link and the slot; the saved record holds its source |
| R1 | linked leave Save / L | late refusal, edit meanwhile | Pass: stays; keeps the newer edit; no app notice; the retry writes it |
| G1 | Discard / D | refuse, reload, Discard again | Pass: the draft is what the refusal said; the record is byte-equal; nothing asks after |
| H1-again | wizard Export door / L | hold, pressed again | Pass: 1 record |
| H1-renamed | wizard Export door / L | hold, renamed and pressed again | **Fail**: 2 records (#1384) |
| H2 | wizard Export door / L | hold, Home pressed meanwhile | Pass: 1 record. The export window then opens over Home, which is noted but not counted |
| H3 | wizard production door / K | refuse, press again | Pass: an alert, 1 record, then one production |

Runs: [39025100026](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39025100026) (first cut;
E2 failed on a checker bug, since fixed), then
[39025540639](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39025540639): **15 passed, 5
failed** (A1, B1, B2, C1, H1-renamed). This VM gave the same result through the job queue, j-0004:
15 passed, the same 5 failed. The mutation run
[39025542073](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39025542073) turns A2, A3, A4, D1,
D2, E1, E2, F-late and H3 red as well. That is 14 failed in all, so those cases do pin the link
write. R1, G1, H1-again and H2 act on other writes and stay green under it. D3 and F-hold hold K
but stay green too: their outcome, an unsaved copy or the replacement owning the link, is the same
whether or not the Save waits for K. So this mutation does not show them non-vacuous.

The facts each case recorded are written to its artifact (`*.json`). A1:
`slotBeforeReload {graphicId: null}`, `afterReloadLink {graphicId: null, dirty: true}`,
`homeAsked: 1` ("Save first…"), `recordsAfterSecondSave: 2`. B1: the refused put came from the
timer (no `persistLink` in its stack), about 1 s after Home mounted. Then `alert: 1`, live link
`{dirty: true, status: 'failed'}`, `newAsked: 1`, slot `{dirty: false}`, `newAskedAfterReload: 0`.

## The carried :228 failure

`leave-fourth-checker.spec.ts:228` is unchanged. It does a hash change, then a refused first Save,
Escape, and a renamed retry that is double-submitted while the record is held. On main it failed
at "Home is visible" after the retry landed. The page reads "✓ Saved" on the editor URL, with no
dialog. Measured frequency, a regression signal only:
[39025101795](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39025101795) 1 of 1, and
[39025894976](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39025894976) 7 of 12. In this VM,
j-0005 failed 3 of 10. It had passed in the fourth check's run and in #1376's two reruns.

The diagnosis copy logs every history call and navigation event. The failing repeat shows the
guard's approval calling `history.go(1)` with the forward `#/home` entry in place, then no
`popstate` and no `hashchange`. In j-0005 the copy that renames failed 3 of 10. With the template's
name kept, it passed 10 of 10. The measured correlate is the name adoption, a template change that
rebuilds the preview just before `go(1)`. The exact browser mechanism is not established. Browser
Back left in all its sampled runs (j-0006, 2 of 2 each for renamed and kept). The j-0006 job itself
was cancelled on a checker bug: it read the save status after the editor had unmounted. The facts
it wrote are in [runs.json](runs.json). With the bug fixed (`290c38a7`), j-0007 left in all 12
runs: 3 each for Back and hash, renamed and kept. The hash-plus-renamed failure is intermittent, so
a passing run proves nothing.

## Criteria

| Criterion | Result |
| --- | --- |
| AC 1: Home asks over the editor; Cancel/Escape/cancelled naming keep source, selection, history | Pass. Carried original, second, third and fourth checkers (except :228, below); the maintained selection; E2 (Escape after a refused first Save keeps the draft); native 125% leave dialog. |
| AC 2: Save/first Save keep source; discard mints nothing; saved copies byte-equal; no repeated question | **Fail.** B1, B2, C1: New asks again about a saved graphic after a trailing write of its source is refused (#1382). Otherwise passes: A3, A4, D1 to D3, G1, the carried cases and the maintained selection. |
| AC 3: New/Open/Back/hash share the boundary; a failed write and double submission cannot navigate early or duplicate; no resurrection | **Fail.** A1: a refused link write followed by a reload lets the next Save mint a duplicate (#1383). The carried :228: a hash-change leave does not continue after a renamed first Save lands (#1386). H1-renamed: the wizard door duplicates on a renamed second press (#1384). Otherwise passes: E1, E2, F, R1, G1, H1-again, H3, and the carried original, second and third checkers. |
| AC 4: baseline guard, wizard walk, library links, cloud separation, production copies; mutation | Pass. The maintained selection gives 85 passed, 0 failed, with the same 8 legacy skips ([39025103178](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39025103178)). It covers every `new-graphic-guard` case from #1333, #1355, #1359 and #1376. The two-graphic export passes 1/1. The signed-in localhost task passes ([39025107529](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39025107529)), against a disposable local Supabase only. The mutation run is above. |
| AC 5: fresh Studio `3142fc7d` / Eyevinn `616841bd` executions, hashes, no copied source | Pass, 6/6 ([39025104537](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39025104537)): the carried four tasks and two new ones (below). [reference.json](reference.json) hashes the same 17 files as independent-4, with identical sha256. The Studio pin is identical to its release, and the binary is `9ba1de31…`. |
| AC 6: desktop/laptop/native 125% cumulative text, artwork, animation, save/reopen, outputs | Pass, 4/4 ([39025105765](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39025105765)). Nine SPX/CasparCG/OGraf outputs, 0 errors. Native 125%: 1093x545 CSS content, 196px canvas, 180px timeline, 280px inspector. |
| Carried checkers, unchanged | Original 3/3, second 4/4, third 10/10, `:24` 20/20 as a regression check, fourth 10/11 ([39025101795](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39025101795)). The fourth's `:298` pair passes there and in `new-graphic-guard`. |

## References

Two new tasks match this check's new challenges. Each one splits a save into two writes. The stubs
are this probe's own:

- **Studio v0.17 (`3142fc7d`).** Save Project writes the file, and a 500 ms autosave of the same
  project follows. With that autosave refused once, Studio says nothing, and the downloaded file
  holds the edit. New asks as it always does, because Studio has no dirty tracking. After a reload,
  its autosave slot lacks the edit. NoaCG deliberately keeps its working slot durable and reports a
  refused write. #1382 is about refusing to call a saved graphic unsaved, not about staying silent.
- **Eyevinn (`616841bd`).** `saveToStorage` writes `ograf-templates` and then
  `ograf-current-template`, in the same order as NoaCG's record and link. With the pointer write
  refused once and the page reloaded, the template is listed once and the stale pointer selects
  `kept`. Making `linkcheck` again is refused with "already exists", because identity is the
  template id. NoaCG mints a new id per save, so the same ordering duplicates (#1383).

The carried Studio and Eyevinn lifecycle tasks and the fourth's two tasks pass unchanged. No
upstream source was copied.

## CI, VM and main

- Probe runs used `--workers=1 --retries=0` in GitHub Actions. Mid-check, #1379 landed and the VM
  queue took browser jobs. j-0004 to j-0006 ran here with 4 workers. [runs.json](runs.json) holds
  every run's steps and counts.
- Main CI on `0b985904` passed ([39024082606](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39024082606)),
  and so did post-landing and quarantine. The configured suite was still in progress when read.

## Captures

[captures.json](captures.json) lists the captures that were opened. None is committed. A1's Home
shows two "Riverlight festival" cards. B1 shows "Could not save … still open here" over Home, then
"“Fifth B1” has unsaved changes". B2 shows the notice over the editor after a Save As that landed.
The native-125% leave dialog, the Studio capture (saved, no error) and the Eyevinn capture
(`linkcheck` listed once) were also looked at.

Not run: a fix, which is not the checker's job. Physical hosts, owner comfort and hosted cloud
status stay outside the phase. #1360 was not needed for any criterion and was not examined.
