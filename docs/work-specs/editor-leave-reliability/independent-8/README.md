# Eighth independent leave-editor check

**FAIL product: across two devices signed into one account, the reserved record id is still
honoured by a device that did not make it, and that device's Save overwrites the graphic the
other device saved.** In one browser, repair-8 (#1414) holds against every case tried here. That
includes another tab's write landing in the library-mirror lag the repair names as a trap,
answered with Save & continue or Discard, with and without a reload, and from a duplicated tab.
It also holds for a crash while the record write is unconfirmed, a duplicate tab beside a refused
link write, and an older build's slot answered with Discard. Every carried and maintained check
gives its recorded result.

- **Device B mints device A's record id** (AC 2, AC 3; the owner's rule for repair-8, "a
  reserved record id is honoured only by the tab and draft that made it"). The working slot
  syncs as a per-account singleton (`backend/storage.ts` `SINGLETON_KINDS`), and it carries
  `reservedGraphicId`. So device B, opening the editor after device A's draft synced, continues
  A's never-saved draft with A's reservation. A first-saves it as "Alpha", which mints that id.
  B's library learns of Alpha only on B's next sync pass, which runs on B's own change, a focus
  or online event, or a boot. Until then, rule 1 of repair-8 (`graphicIdTaken`, read from this
  browser's library) cannot see that the id is taken. B leaves its draft through the dialog,
  names it "Beta", and B's Save mints Alpha's id. On sync, the cloud keeps Alpha and turns
  B's record into "Eighth X Beta (conflicted copy)". B's editor stays linked to Alpha and reads
  "Saved". B edits and presses Save, no name is asked, and the cloud's Alpha now holds B's
  second save. What A saved is gone from every record.
- Control: on main before #1414 (`cd35484b`), the same case fails the same way. On main before
  #1397 (`6f910963`), it passes: B mints its own id, "Beta" sits beside an unchanged "Alpha", and
  B's second Save writes into Beta. So this is #1397's regression, which #1414 closed in one
  browser but not across devices.

This is the eighth failed check of the leave-editor phase. Phase 3 does not start. The owner
authorised no further repair, so the next step is his.

## Scope

Checked main `00d7e58d` (merge of #1414), probed on `ffbf63b4`, whose `src/` is identical to it
(#1431 changed scripts and docs only). The checker built neither the phase nor any of its
repairs. It changed no product code, maintained test, gate or limit.

Disposable branches, never queued, no pull request:

- `claude/probe-editor-p2-check-8-ci`: `a372cace` is main `ffbf63b4` plus the carried files and
  dispatch recipes, taken byte-identical from `claude/probe-editor-p2-check-7-ci` `5aad888b`.
  A `git diff 5aad888b a372cace` over those 17 paths is empty. `973e93ec` adds this check's
  specs and an `eighth` scope. `7a2b3fed` to `0040421e` adjust the device case's comparisons only:
  jsonb reorders keys, the cloud stores assets as storage references, and the reservation is
  recorded as a fact because no reservation exists before #1397. [probe.patch](probe.patch) is
  `a372cace..0040421e`.
- `claude/probe-editor-p2-check-8-pre` (final `e3c9db20`): main `cd35484b`, before #1414, plus
  the same files, byte-identical.
- `claude/probe-editor-p2-check-8-pre1397` (final `1b478414`): main `6f910963`, before #1397,
  plus the device spec and the configured recipe, byte-identical.

Each run records the carried files' sha256, identical to independent-7: original `28988d71…`,
second `ef78c1eb…`, third `71f8378b…`, fourth `95317231…`, fifth `145756a7…`, bounded B1
`32b0d289…`, sixth `0b5207f2…`, seventh `352905b1…`, references `8aaf0a47…`, `2447cef0…`,
`bae58ddb…`. New: `e2e/leave-eighth-checker.spec.ts` `5f64b001…`, and
`e2e/configured/leave-eighth-device.spec.ts` `a1a991e0…` at `0040421e`.

## Main after #1414

The merge group's CI for #1414 passed: CI gate, Build, the 15 E2E subsets, Factory gates and
Reviewed. Post-landing on `00d7e58d` passed
([39099010274](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099010274)), as did
configured-suite ([39099010281](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099010281))
and Quarantine. The push CI runs on `00d7e58d` and `ffbf63b4` show cancelled, superseded by the
next landing's push. No red run.

## Carried and maintained, on CI (`--workers=1 --retries=0`)

| Run | Result (expected) |
| --- | --- |
| unchanged, [39099349849](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099349849) | original **3/3**, second **4/4**, third **10/10**, `:24` x20 **20/20**, fourth **11/11** |
| repeat228, [39099351219](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099351219) | `:228` x20 **20/20** |
| sixth, [39099352789](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099352789) | **10/10**, S6 included |
| seventh, [39099354404](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099354404) | **16/16**, H included |
| fifth, [39099355938](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099355938) | **17 passed, 3 timed out**: B1, and F-hold and F-late at `:464`, exactly the recorded departures; bounded B1 **1/1** |
| maintained, [39099357164](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099357164) | **85 passed**, the same **8 legacy skips**; two-graphic export **1/1** |
| references, [39099358811](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099358811) | **6/6**; the 17 hashed reference files are sha256-identical to independent-7; Studio binary `9ba1de31…` |
| visual, [39099360407](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099360407) | 125% cumulative **4/4** |
| signed-in task, [39099362007](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099362007) | **1/1** (`account-lifecycle.json` all true) |
| matrix, [39099363785](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39099363785) | `save-transaction.spec.ts` **37/37**, as a regression check only |

## How repair-8 was attacked

Repair-8's matrix presses two tabs and a duplicated tab only after the second tab's mirror has
adopted the first tab's record, and only through the topbar Save. It also covers a crash after a
double refusal and an unmarked slot. These cases press what it leaves out.

- **The mirror lag.** The second tab's delivery of the library write is held, as on a busy or
  throttled tab. Its BroadcastChannel message is queued until released, so its autosave names
  the record unmarked. Each case asserts that it did before going on.
- **A different device.** Two browser contexts sign into one throwaway account on a local
  Supabase stack.

| Case | Attack | Main | Control `cd35484b` |
| --- | --- | --- | --- |
| L-tab-reload-save | B's autosave lands in the lag naming Alpha's id (`bSlotMark: null`); B reloads; Home; Save & continue | Pass: B unlinked; Home asks; the name is asked; "Beta" minted; Alpha byte-equal; 2 records; New asks nothing, before or after a reload | **Fail**: B linked to Alpha after the reload |
| L-duplicate-reload-save | the same from a duplicated tab (sessionStorage copied) | Pass, the same | **Fail**, the same |
| L-tab-no-reload-save | the same without the reload | Pass: B's mint takes a fresh id once its mirror adopts | Pass |
| L-tab-reload-discard | the lag write, a reload, then Discard | Pass: no graphic made or changed; Alpha byte-equal; after a reload the draft is unlinked and nothing asks | **Fail**: B linked to Alpha |
| C-crash-edit | first Save from the leave dialog; the record write lands unconfirmed; an edit during it lands marked (`mark: true`, unlinked); the tab crashes | Pass: the new tab is linked to the record by the mark, with the edit; Home asks; Save & continue asks no name; one record holding the edit | Pass |
| D-duplicate-refused | a duplicated tab is open; A's leave first-saves; the link write is refused in the dialog; A cancels; the duplicate edits, reloads and leaves; A leaves again | Pass: the duplicate names a fresh id, is unlinked, is asked for a name, "Beta"; A's Save writes into Alpha with no name; Alpha holds A's source, Beta holds B's | **Fail**: the duplicate's write names Alpha's id |
| O-old-slot-discard | an older build's unmarked slot names a record holding other work; a new tab; Home; Discard | Pass: unlinked, asked, record byte-equal, the slot reset and naming a fresh id | **Fail**: linked to the record |
| X-device (configured) | A's never-saved draft syncs; B signs in and continues it; A first-saves "Alpha"; B, with no sync pass since, leaves and saves "Beta", then edits and Saves | **Fail**: see below | **Fail**, the same; `6f910963` passes |

X-device facts, main ([39101304436](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39101304436)):
`alphaIsReserved: true`, `bLibraryHasAlpha: false`, `bLeave: {asked: 1, named: 1}`,
`bMintedAlphaId: true`. After both sync: the cloud holds "Eighth X Alpha" (unchanged, still A's)
and "Eighth X Beta (conflicted copy)" (B's source). `bLinkAfter.graphicId` is Alpha's id, clean.
On B's next Save, `bSecondSaveNamed: 0`, `alphaFinalUnchanged: false` and
`alphaFinalHoldsBSecondSave: true`. Control `cd35484b`
([39101306363](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39101306363)): the same facts.
Before #1397, `6f910963` ([39101307979](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39101307979)):
**passes**. B mints its own id, the cloud holds "Eighth X Alpha" and "Eighth X Beta", B stays
linked to Beta, and Alpha is unchanged after B's second Save. The earlier device runs on each
branch, before the comparison fixes, gave the same id facts:
[39100657576](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39100657576),
[39101029368](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39101029368) (main), and
[39100659125](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39100659125),
[39101031109](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39101031109) (`cd35484b`).

How a user meets it: two computers on one account. The draft started on the laptop opens on the
desktop. The laptop saves it. Back at the desktop, whose window kept its focus, so no sync pass
ran, the user saves the same draft under another name. The desktop's work becomes a "conflicted
copy", and the desktop's editor now edits the laptop's graphic. A focus or online event, or any
edit followed by a sync pass before the Save, closes the window. So does B's Save landing after
B's library has learnt the record.

Not counted as a finding: two tabs that both first-save within the mirror's millisecond adoption
window. Repair-8 records it, and the library's whole-list write already loses a record there
whatever the id.

## Criteria

| Criterion | Result |
| --- | --- |
| AC 1: Home asks over the editor; Cancel/Escape/cancelled naming keep source, selection, history | Pass. Carried original to seventh; eighth L, D, O ask over the editor. |
| AC 2: Save keeps the source; discard mints nothing; saved copies byte-equal; no repeated question | **Fail** across devices: X-device. Another device's Save overwrites "Alpha" without asking for a name. In one browser: pass (eighth L, C, D, O; seventh H; sixth; fifth with the recorded departures). |
| AC 3: same boundary for New/Open/Back/hash; no early navigation, no duplicate records; no resurrection | Across devices, the same id is minted twice and the sync turns one into a conflicted copy. In one browser: pass (seventh, `:228`, sixth S6, eighth L-discard, O). |
| AC 4: baseline guard, wizard walk, library links, cloud-sync separation, production copies | The maintained selection gives 85 passed and the same 8 skips; export 1/1; the signed-in task passes. Cloud-sync separation fails in X-device. |
| AC 5: references | Pass, 6/6, hashes identical to independent-7. |
| AC 6: 125% cumulative | Pass, 4/4. |

## References

No new reference task. Studio v0.17 saves a project by download, so no record is reserved before
it exists. Eyevinn mints the record's id when it saves, in `localStorage` (independent-5's
reading). Neither syncs a working slot, nor reserves an id another device can resume, so neither
can mint one record's id twice.

## Runs

[runs.json](runs.json) lists every run. The VM runs were development only (j-0014 to j-0016). CI
is the evidence.

Not run: a fix, which is not the checker's job; repair-8's mutations; physical devices, hosted
accounts and owner comfort, all outside the phase.
