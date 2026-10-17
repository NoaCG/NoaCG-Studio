# Third independent leave-editor check

**FAIL product: a refused linked Save can still be reported as saved and leave the editor.** The
Save's own library write is refused, but the leave decision continues to Graphics. The edit is not
in the library, the link is marked clean, and the app-level notice says "Your work is still open
here" over Home. It reproduces intermittently with the original independent assertion, unchanged
(`leave-checker.spec.ts:24`): CI 1 of 2 runs, locally 1 of 5 and 1 of 15. Everything else checked
passes. This is the third failed check of Phase 1, so Phase 2 does not start.

## Scope

Checked main `5ccdbbc4471bafbba81a90f58b8335e4fc64ab18`. It contains repair #1333 (merge
`c683409351071bb66675baadced88c51df22c3a3`). Its product tree is identical to `0cf2e0511`, the base
of the disposable probe branches; only `scripts/e2e-durations.json` differs. The checker built
neither the phase nor its repairs, and changed no product code, maintained test, gate or limit.
Probe branches `claude/probe-editor-p1-check-3-ci` (`e4370357`) and
`claude/probe-editor-p1-check-3-diag` (`7dd7e2d7`) hold tests and CI recipes only. They have no pull
request and must never be queued.

Unchanged assertions, compared byte for byte:

- The original independent `e2e/leave-checker.spec.ts` matches the file in
  [independent/ci-probe.patch](../independent/ci-probe.patch). Its sha256 prefix is `28988d718686064e`.
- `e2e/leave-second-checker.spec.ts` matches `39a900183`, including `:91`, `:106` and the `:135`
  assertion. Its sha256 prefix is `ef78c1eb394c0c24`.

## The failure

The original case `:24` arms a one-shot `QuotaExceededError` on the next `spx-gfx-graphics` put. It
then chooses Open saved graphics… → Save & continue on a linked, edited draft. In
[CI 38994640363](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38994640363) it failed. On a
rerun in the same job it passed. Locally on `5ccdbbc4` (j-0013, `--repeat-each=5`) it failed in
repeat 2. Both captures show the same result: the editor is gone, Graphics is mounted, and the
app-level "Could not save" dialog reads "Your work is still open here".

The repair-2 receipt says another library write used the refusal before Save did. This check
measured the opposite. The diagnosis spec keeps the original preamble and injection unchanged and
records every put and every app-level storage error
([linked-save-race.json](linked-save-race.json), j-0014). In all 15 iterations the refused put
comes after the Save click, and no other library put occurs. In 14 iterations the decision shows
its own error and stays. In the failing iteration the following happens:

- the refused put is the Save's own;
- a working-slot autosave put (`templateStore.ts:421`) is in flight at the same time;
- the failure is dispatched as an unclaimed `spx-storage-error` at 328 ms, while the app is still on
  `#/editor-foundation`;
- `persistLink` then writes the slot, and the app navigates to `#/home/graphics`;
- the library lacks the edit, and the link is `{dirty: false, status: 'idle'}`.

Likely mechanism, from reading the code only (not fixed and not fault-injected here):
`commitDurableWrites` awaits `Promise.all` over every pending write. `reportError` hands an
unclaimed failure to a `setTimeout(0)`. When a slower concurrent write keeps the await open past
that macrotask, the timer takes the failure first. `saveCurrentGraphic` then answers `'saved'`.
This breaks AC 3 ("a failed durable write ... cannot navigate early") and the components invariant
"never report a save the storage layer has not agreed to". The user can lose an edit: the draft
is marked clean, so a later replacement does not ask.

Also seen once locally (j-0013, `:53`): the one-shot working-slot refusal was used by a background
slot write when Home was clicked. The app-level notice covered the question, and the editor and
source stayed intact. This was not counted as a product failure.

## Criteria

| Criterion | Result |
| --- | --- |
| AC 1: Home asks over the editor; Cancel/Escape/cancelled naming keep source, selection, history | Pass. Maintained selection 83/0 (8 legacy skips) in [38994642554](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38994642554). Third checker Back/Cancel case passes; Back asks after 2 traversals. |
| AC 2: Save/first Save keep source; discard mints nothing; saved copies byte-equal; no repeated question | Pass. Third checker linked and never-saved ordinary Discard keep library bytes and survive reload with no question ([38995037370](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38995037370), 10/10). |
| AC 3: New/Open/Back/hash share the boundary; failed write and double submit cannot navigate early or duplicate; no resurrection | **Fail.** A refused linked Save navigates intermittently (above). Back/hash, the discard-refusal cases and double submission pass. |
| AC 4: baseline guard, wizard walk, library links, cloud separation, production copies | Pass. Maintained guard, wizard-draft, library and project specs pass. The [signed-in localhost task](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38994644646) passes against a disposable local Supabase only. |
| AC 5: fresh Studio `3142fc7d` / Eyevinn `616841bd` lifecycles, hashes, no copied source | Pass. [38995038980](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38995038980) runs both, 2/2. [reference.json](reference.json) hashes 17 files; the Studio pin is identical to its release. |
| AC 6: desktop/laptop/native 125% cumulative text, artwork, animation, save/reopen, outputs | Pass. 4/4, with 9 executable SPX/CasparCG/OGraf outputs and no errors. Native 125%: 1093x545 CSS content, 196px canvas, 180px timeline, 280px inspector. |
| Refused-discard contract: newer edit during the autosave drain and during the replacement wait | Pass, 4/4. Held writes; real drag, Ctrl+Z, Escape and Back cannot move the source or route; refusal keeps the newer source, history, selection and library bytes. |
| Redo after refusal, reload straight after refusal, successful retry | Pass. Reload keeps the newer source. Redo/Undo walk both states. Retry restores saved bytes and mints nothing. |
| Never-saved draft, store/text edit during the replacement wait | Pass, 2/2. Retry resets to the clean default with no library record. |
| Quota refusal of the autosave/replacement write, then Undo/Redo, reload, retry | Pass, 2/2. After a refused autosave, a reload straight after returns the last accepted draft: not the saved copy, and not the refused edit. |
| Wizard-open and native export-notification continuations; two sequential exports | Pass. `project.spec.ts` and `new-graphic-guard.spec.ts` are in the maintained 83; two-graphic export 1/1. |
| Original independent assertion; second checker `:91`/`:106`/`:135` | `:24` **fails intermittently** (above); `:53` and `:69` pass. The second checker passes 4/4 and again inside the maintained selection. |

## CI and main

- `38994642554` failed only because its first step named a spec that `8cf5ce1e1` did not yet
  contain. That is a recipe fault, fixed in `e43703571`; its other steps are counted.
- `38994640363` failed on `:24`. That is the product finding above, not a recipe fault.
- Main CI on `5ccdbbc44` (38997059058) was in progress at 03:37Z: E2E 1/11 cancelled with its retry
  running, the other shards and Build green. Post-landing, Quarantine and configured-suite are green
  on `5ccdbbc44` and on `0cf2e0511`.
- The last completed green main CI is `8d48e2c5e` (38986504813), a descendant of `c6834093`.
- `e2e/editor-cli-round-trip.spec.ts` passed inside the probe's maintained selection.

The exact steps and counts are in [runs.json](runs.json).

## Captures

All 25 captures were opened and inspected; [captures.json](captures.json) records their hashes. The
native 125% full-content capture (`fce24ce3…`) shows the complete inspector and timeline.
`actual-125.png` is clipped by the screenshot to the 1093x545 CSS viewport at device scale. The
refused-decision captures show the "changed while discarding" error over the mounted editor. The
blue text highlight in them is the checker's drag across the dialog.

Unrun: nothing in the row. Hosted cloud status, owner comfort and physical hosts stay outside
Phase 1.
