# Ninth independent leave-editor check

**FAIL product: when one saved graphic is saved on two devices at once, the device whose Save
loses the sync conflict is asked about "unsaved changes" after its Save said "Saved". The
question comes at Home and on every later New, also after a reload.** Repair-9 (#1455) closes the
eighth check's failure. Device B no longer mints device A's reserved id. No device honoured another
device's reservation in any path tried: boot, reload, sign-out and sign-in, the pull, or an older
build's marked slot arriving through the cloud. Every carried and maintained check gives its
recorded result. The failure is in what repair-9 added for the conflict: rule 3 unlinks the
losing draft. The repair disclosed that the next Save then asks for a name. It did not disclose
the delayed, repeated question this check found.

- **S-concurrent, the question after "Saved"** (AC 2 "a later New/Open does not repeat the
  question"; the October 6 review and the owner's "no repeated or delayed questions"). Device A and
  device B both have "Gamma" open, a saved graphic. Both edit it. A saves. B then saves from the
  topbar. B's Save asks no name and says "Saved". B goes Home, and Home asks nothing. Two and a
  half seconds later, B's sync pass finds A's version. Gamma keeps A's version, B's becomes "Gamma
  (conflicted copy)", and rule 3 unlinks B's draft (`graphicId: null, dirty: true`). B presses the
  new-graphic door and is asked: "“Ninth S Gamma” has unsaved changes. Save them before
  continuing?" Cancel. B reloads and presses New again, and the same question comes back. B answers
  "Save first…": a name is asked, and a third record, a duplicate of the conflicted copy, is
  minted. If B stays in the editor instead, the topbar changes from "Saved" to "Not saved" with no
  word on why, and Home asks the same question over the editor. No edit is lost:
  Gamma holds A's save and the conflicted copy holds B's. But B's work is saved, so the dialog's
  "unsaved changes" is wrong, and "Discard changes" reads as losing it.
- Control, main before #1455 (`98e0bb97`): the same case asks nothing at Home or at New, before or
  after a reload. Gamma holds A's version and the conflicted copy holds B's, as on main. There B
  stays linked to Gamma, clean. That is the overwrite risk rule 3 removes: B's editor holds B's
  source but calls it Gamma, so a later edit and Save there would write over A's version. So
  rule 3 removes a latent overwrite and adds a question. The question is in the wrong place and
  has the wrong words. Issue: not filed by this session, which has no tool that can open one
  (`gh` is unauthenticated here, and the GitHub tools available cannot create issues). The issue
  text is in the pull request that adds this receipt, for the coordinator to file.

This is the ninth failed check of the leave-editor phase. Phase 3 does not start. The owner
authorised no further repair, so the next step is his.

## Scope

Checked main `85911aa7`. It contains #1455 (merge `10ce6403`), and the only later landing, #1459,
changed `docs/work-specs/codebase-lean` and `e2e/ai-more-control.spec.ts`: `src/` is identical to
`10ce6403`. The checker built neither the phase nor any of its repairs. It changed no product
code, maintained test, gate or limit.

Disposable branches, never queued, no pull request:

- `claude/probe-editor-p2-check-9-ci`: `bf38d864` is main `85911aa7` plus the 19 carried files
  and dispatch recipes taken byte-identical from `claude/probe-editor-p2-check-8-ci` `0040421e`.
  A `git diff 0040421e bf38d864` over those 19 paths is empty. `b103aede` adds this check's specs
  and a `ninth` scope. `b4935784` to `9bef784b` change only the device spec. S now records what "Save
  first…" does. In R, B's UI sign-out also revoked device A's session (a global sign-out), which
  stopped A's next sync. The sign-out request is now answered locally, so the app's own sign-out
  path still runs on B and A keeps its session. [probe.patch](probe.patch) is `bf38d864..9bef784b`.
- `claude/probe-editor-p2-check-9-pre` (final `0476033f`): `98e0bb97`, main just before #1455,
  plus the same 21 paths, byte-identical.

Each run logs the carried files' sha256, identical to independent-8: original `28988d71…`,
second `ef78c1eb…`, third `71f8378b…`, fourth `95317231…`, fifth `145756a7…`, bounded B1
`32b0d289…`, sixth `0b5207f2…`, seventh `352905b1…`, eighth `5f64b001…`, eighth device
`a1a991e0…`, references `8aaf0a47…`, `2447cef0…`, `bae58ddb…`. New: `e2e/leave-ninth-checker.spec.ts`
`2e8fdba7…` and `e2e/configured/leave-ninth-device.spec.ts` `dbeb98be…` (earlier runs `d2455a2e…`, `fce77f9c…`, `66946b0f…`).

## Main after #1455

The merge group's CI for `10ce6403` passed ([39106298397](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39106298397)).
`10ce6403` reached main in the same push as `85911aa7` (#1459), so the push runs are `85911aa7`'s.
CI passed ([39106949151](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39106949151)), and so
did Post-landing ([39106949135](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39106949135))
and Quarantine ([39106949160](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39106949160)).
The merge group for `85911aa7` also passed ([39106620017](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39106620017)).
configured-suite on `85911aa7` ([39106949132](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39106949132)):
passed. No red run.

## Carried and maintained, on CI (`--workers=1 --retries=0`)

| Run | Result (expected) |
| --- | --- |
| unchanged, [39107433624](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107433624) | original **3/3**, second **4/4**, third **10/10**, `:24` x20 **20/20**, fourth **11/11** |
| repeat228, [39107435361](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107435361) | `:228` x20 **20/20** |
| sixth, [39107437077](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107437077) | **10/10**, S6 included |
| seventh, [39107438525](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107438525) | **16/16**, H included |
| eighth, [39107439878](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107439878) | **7/7** |
| fifth, [39107441594](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107441594) | **17 passed, 3 timed out**: B1 (`:246`), F-hold and F-late (`:447`), exactly the recorded departures; bounded B1 **1/1** |
| maintained, [39107443021](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107443021) | **85 passed**, the same **8 legacy skips**; two-graphic export **1/1** |
| references, [39107444755](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107444755) | **6/6**; the 17 hashed reference files sha256-identical to the earlier receipts; Studio binary `9ba1de31…` |
| visual, [39107446099](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107446099) | 125% cumulative **4/4** |
| matrix, [39107447515](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107447515) | `save-transaction.spec.ts` **42/42** |
| configured, [39107449029](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107449029) | signed-in task **1/1**; eighth X-device **1/1**: `bMintedAlphaId: false`, B minted its own "Eighth X Beta", `alphaFinalUnchanged: true` |

The eighth X-device case passes again in each later configured run on main (`b103aede` to
`9bef784b`). S-concurrent was reproduced in each of the four device runs on main
([39107860639](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107860639),
[39108463258](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39108463258),
[39109033496](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39109033496),
[39109544481](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39109544481)), and its question
was absent in the control runs whose facts were read ([39107888957](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107888957),
[39109546111](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39109546111)). On the control,
the eighth X-device case fails as the eighth check recorded: "device B's first Save minted the id
of the graphic device A saved" ([39107888957](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107888957)).

## How repair-9 was attacked

### Two devices, local Supabase stack (`leave-ninth-device.spec.ts`)

| Case | Attack | Main | Control `98e0bb97` |
| --- | --- | --- | --- |
| S-concurrent, leaves at once | the case above; B goes Home right after "Saved" | **Fail**: New asks "has unsaved changes", and again after a reload. "Save first…" asks for a name and mints a duplicate of the conflicted copy. No edit is lost | Pass on every question; B stays linked to Gamma, clean |
| S-concurrent, stays in the editor | the same; B stays until its pass lands | **Fail**: "Saved" turns to "Not saved"; Home asks over the editor | Pass on the question; B stays linked, "Saved" |
| R-departure | A's never-saved draft and its reservation reach the cloud and B. B reloads twice, signs out and in, edits, first-saves. Then an older build's slot, marked as minting Alpha and holding exactly Alpha's source, is written into the cloud. B reloads onto it. A third device with no draft signs in onto it | Pass on every product fact. No boot links B to a record. B's own list never holds A's id, its first write names a fresh id, and "Beta" is minted under B's own id. On the older build's slot, the pull keeps B's own reservation and drops the mark; Home asks and Save asks for a name. C boots unlinked, and Alpha is unchanged. The run is red only on a wrong checker expectation: C's draft is exactly its baseline, so its leave correctly asks nothing and mints nothing (the pristine-baseline guard, AC 4). The assertions after that one were read from the facts | **Fail**: B's write names A's reservation, and B's "Beta" is minted under Alpha's id. On the older build's slot, B and C both boot linked to that record |

### One browser (`leave-ninth-checker.spec.ts`)

A pull is replayed through the sync engine's own local write, and a conflict through `runSync`
against an in-page cloud, as repair-9's matrix does. CI: main [39107858847](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107858847),
control [39107886442](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107886442). The same
results came from a local run (j-0032).

| Case | Attack | Main | Control |
| --- | --- | --- | --- |
| C-pull | the conflict pass also pulls a newer cloud slot: the other device's draft, linked to the record that won. Then both tabs reload and save | Pass. Both tabs unlink in the pass. After a reload, each opens the pulled draft (the other device's source), linked to that record. A Save with no name writes that source, never this device's conflicted work, which stays in its copy | **Fail**: stays linked through the pass |
| C-overlap | a conflict pass runs while a first Save's record write is unconfirmed | Pass. The Save ends unlinked ("Not saved"), stays so after a reload, and the next Save asks for a name; Alpha byte-equal | **Fail**: linked, its next Save writes into Alpha |
| V-superseded, newer version | `spx-gfx-superseded` holds `{version: 2}`; a conflict must reach a second tab | Fails: this tab unlinks, the second tab stays linked, and its Save writes over Alpha | Fails the same: neither tab unlinks |
| V-superseded, refused | the same list's write refused by localStorage | Fails the same | Fails the same |
| V-reservations, newer / corrupt / missing | S6 (R and K refused), the reservation list newer, corrupt or removed before the reload | Asks for a name, mints a second record; nothing lost or overwritten | Pass: relinks, one record |

Not counted as findings:

- **V-superseded.** The second tab is reached only through the list's `storage` event. A list
  this build cannot write leaves that tab linked. That is no worse than before #1455, where no
  tab unlinked. Both states need something this product does not do today. One is a build newer
  than this one followed by a rollback. The other is localStorage refusing a small key after the
  conflicted copy's write succeeded.
- **V-reservations.** This is repair-9's disclosed limit ("if the list cannot be written"),
  stretched to a corrupt or cleared list. It needs both slot writes refused and the list lost
  before the reload. The outcome is a duplicate record with nothing lost, which the brief allows.

## The departure from the owner's wording

The cloud copy of the slot still carries `reservedGraphicId`. R-departure shows it there. It
also shows that no device running this build honours it. B boots it as data twice, and again
after a sign-out and sign-in, and stays unlinked each time. Its first write takes a fresh
id. Its own list never holds A's id. A device with no draft, signing in onto an older build's
marked slot that names Alpha and holds exactly Alpha's source, is not relinked to Alpha. On the
control, both B and that device boot linked to it, and B mints A's id. Runs: main
[39109544481](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39109544481), control
[39109546111](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39109546111).

The field still reaches devices, and only a build from before #1455 would act on it. Such a
build would have to boot fresh against the account after A reserved. With one web deployment,
that happens only on a rollback or on a stale preview deployment signed into the same account.
The owner's wording would close that window. The repair could not take it: the eighth device spec,
which the owner required to pass unchanged, polls the cloud slot for that field. The two
requirements conflict. The owner's intent, that no other device mints or relinks the id, holds
for every build from #1455 on. Judged acceptable, with the rollback window recorded here.

## Criteria

| Criterion | Result |
| --- | --- |
| AC 1: Home asks over the editor; Cancel/Escape/cancelled naming keep source, selection, history | Pass. Carried original to eighth. |
| AC 2: Save keeps the source; discard mints nothing; saved copies byte-equal; no repeated question | **Fail**: S-concurrent. After a Save that said "Saved", New asks about "unsaved changes", again after a reload. No edit is lost, and saved copies are byte-equal in every counted case (the uncounted V-superseded states write over Alpha, as before #1455). |
| AC 3: same boundary for New/Open/Back/hash; no early navigation, no duplicate records; no resurrection | Pass, apart from the duplicate-only V-reservations states above. |
| AC 4: baseline guard, wizard walk, library links, cloud-sync separation, production copies | The maintained selection gives 85 passed and the same 8 skips; export 1/1; the signed-in task passes. |
| AC 5: references | Pass, 6/6, hashes identical. |
| AC 6: 125% cumulative | Pass, 4/4. |

## References

No new reference task. Studio v0.17 saves a project by download, and Eyevinn saves to its own
`localStorage`. Neither syncs a graphic between devices, so neither has a sync conflict or a
draft that a conflict can unlink.

## Runs

[runs.json](runs.json) lists every run. Not run: a fix, which is not the checker's job;
repair-9's mutations; physical devices, hosted accounts and owner comfort, all outside the phase.
