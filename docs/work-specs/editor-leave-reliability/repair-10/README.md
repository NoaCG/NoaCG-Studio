# Conflicted copy relink (#1466)

## Scope

The owner authorised this on 2026-10-18 as the last repair of the phase: "one bounded repair of
#1466. When a Save loses a sync conflict, the draft links to the record that holds its own saved
work (the "<name> (conflicted copy)" record the sync made), clean, and is never linked to the
record that won. Nothing asks about unsaved changes afterwards, at Home, New, Open or after a
reload, unless the user edits again. This replaces "asks for a name" for the sync-conflict case;
the eighth checker's first-Save collision case must still end with each device's work in a record
of its own and nothing overwritten. The ninth checker's two-device spec (independent-9/probe.patch)
must pass unchanged, together with every earlier carried checker, #1383's double refusals, #1402's
case H and #1443's two-device case." The ninth check failed on main `85911aa7`
([independent-9](../independent-9/README.md)). Scope is acceptance criterion 2 (no repeated or
delayed question). Telling the user that a save became a conflicted copy is Phase 3's.

## What failed

Repair-9's rule 3 unlinked a draft whose record lost a sync conflict (`graphicId: null`,
`dirty: true`). On the device whose Save lost, the Save said "Saved", and about 2.5 seconds later
the pass unlinked the draft. Home and New then asked about "unsaved changes", again after a
reload, and "Save first..." minted a duplicate of the conflicted copy, which already held that
work. Nothing was lost.

## The design

The sync engine already writes this device's losing version as a "(conflicted copy)" under a fresh
id before it pulls the winner (`backend/sync.ts`). It now hands that copy to the local side with
the loser (`StorageProvider.lostConflict(record, copy)`), and the draft moves to it:

1. **The draft links to the copy** (`graphicSuperseded(id, copy)`, model/project.ts). A slot
   linked to the record that lost is relinked to the copy, and the live link in every tab moves the
   same way (templateStore's `onGraphicSuperseded`). It reads clean only when the draft holds
   exactly the copy's source (`linkAfterLoss`: everything a Save writes, the template, legibility,
   AI spec and thread); an edit made between the
   Save and the pass stays unsaved, asks as usual, and its Save writes into the copy. A slot that
   named the record only as its reservation (a first Save whose link write was refused) links to
   the copy when it is that save's draft (same source, or the mint mark); the reservation is dropped
   as before. Without a copy (none known) the draft is unlinked, as repair-9 did.
2. **Every tab hears it with the copy.** A `BroadcastChannel` (`noacg-graphic-superseded`) carries
   the record's id and the copy. The `storage` event on `spx-gfx-superseded` carried no copy and
   never fired when that list could not be written (a newer build's version, or localStorage
   refusing it): the ninth check's V-superseded cases, where the second tab stayed linked to the
   record that won and its Save wrote over it. The list is still written, unchanged in format, for
   the mint-overlap fallback below, and its event is still heard half a second later when no
   message came, which is how a tab of an older build tells (the draft is then unlinked).
3. **A Save the pass overlapped settles on the copy.** A linked Save whose record write a pass
   overlapped finds its draft already moved and links the copy (`saveLinked`; a move during its
   link write is the same document, so the Save still settles, `movedToCopy`); a first Save
   whose record write a pass overlapped links the copy it heard of (`conflictCopyOf`), or stays
   unlinked when it heard of none (`isGraphicSuperseded`, repair-9's fallback).
4. **The pass shares the rewritten slot.** When the pass that found the conflict is also pushing
   the slot, it pushes the relinked slot rather than the one it listed, which was linked to the
   record that won. Repair-9's limit ("another device that pulls the slot and reloads would see that
   draft linked to the record") is closed for that pass.
5. **A save waits for a copy its tab has not adopted yet.** Another tab hears of the copy on the
   channel before its library mirror adopts the copy, which the durable store announces only once
   the write commits. A Save or Discard of a draft linked to a copy this tab heard of but cannot
   read yet waits for it (`conflictCopyArriving`, at most ten seconds, shown as saving), instead of
   finding no record and asking for a name. It never falls back to the record that won.

Repairs 8 and 9's reservation rules are untouched: `reservedGraphicId`, `isOwnReservation`, the
pull rule in `upsertProject` and the boot relink.

### Departures from the wording, and why

- **The ninth one-browser checker** (`e2e/leave-ninth-checker.spec.ts`, carried unchanged) asserts
  repair-9's "asks for a name" rule, which the owner's wording replaces. C-pull, C-overlap and both
  V-superseded cases now fail only on those assertions: `graphicId` null after the pass, and the
  next Save asking a name. Their facts show the owner's rule holding instead. In C-overlap and in
  both V-superseded cases, the draft and the second tab link to "Beta (conflicted copy)", clean,
  and the next Save writes there with no name asked. Alpha stays byte-equal, and so does the second
  tab's record. In V-superseded that was the counted overwrite on main. In C-pull, after the pass
  the editor is linked to the copy, which holds its work. After a reload it opens the pulled draft
  of the other device, linked to that device's record, as on main. The three V-reservations cases
  give main's result (a second record, nothing lost), the disclosed limit independent-9 did not
  count.
- **The ninth device spec's R-departure** is red on the same line as on main, the checker's own
  expectation that a draft exactly equal to its baseline asks at Home (independent-9 recorded it;
  AC 4's pristine-baseline guard answers it correctly). Every product fact in it holds. S-concurrent,
  the failure this repair answers, passes in both orders.
- **The maintained matrix row** for the first-Save collision asserted repair-9's unlink and the
  naming question. It is rewritten to the owner's new rule, no looser: the draft and a second tab
  move to the copy, clean; an edit's Save writes into the copy with no name asked; Alpha is
  byte-equal; nothing asks after a reload.

### Declined

- Renaming the draft to "<name> (conflicted copy)" so the topbar agrees with Home: that is telling
  the user, Phase 3's job, and it would change the source and so mark the draft unsaved.
- A boot rule that refuses to link a superseded id: the winner is a legitimate record to open
  later, and the rule would unlink it after every reload.
- Persisting the copy mapping: only a first Save whose record write a pass overlapped needs it,
  within one session; without it the draft is unlinked and asks a name (repair-9's outcome).
- From review: keeping the relinked slot when the same pass pulls a newer slot. The pulled slot is
  the other device's draft, linked to that device's own record (the ninth C-pull), and this tab's
  live link stays on the copy. Sending only ids on the channel instead of the copy's source: a
  receiving tab cannot read the copy from its mirror until the durable store announces it, and
  losses are rare enough that the source in memory costs little.

## References

No new reference task, as in the ninth check: Studio v0.17 saves a project by download and Eyevinn
saves to its own `localStorage`. Neither syncs a graphic between devices.

## Results

Disposable probes, never queued, each this branch's source plus the 21 carried paths taken
byte-identical from `claude/probe-editor-p2-check-9-ci` `9bef784b` (`git diff 9bef784b` over them
is empty; each run logs the independent-9 sha256s, ninth checker `2e8fdba7…`, ninth device
`dbeb98be…`). The probe that counts is `claude/probe-editor-p2-repair-10-ci2` (`8fb47c56`), the
final source after review; `…-ci` (`ffbd6be6`, the first source) gave the same result in every scope,
and the ninth checker's facts read the same in both. CI used `--workers=1 --retries=0`.

| Scope | Result | ci2 (final) | ci |
| --- | --- | --- | --- |
| Configured | signed-in task **1/1**; eighth X-device **1/1**; ninth S-concurrent **2/2** (leaves at once, stays in the editor); R-departure red at line 281 only, as on main | [39119755899](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119755899) | [39111744762](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111744762) |
| Ninth checker | C-pull, C-overlap, V-superseded x2 red only on the replaced "asks for a name" assertions (facts above); V-reservations x3 as on main | [39119757924](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119757924) | [39111746741](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111746741) |
| Eighth checker | **7/7** | [39119759499](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119759499) | [39111748636](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111748636) |
| Unchanged | original **3/3**, second **4/4**, third **10/10**, `:24` x20 **20/20**, fourth **11/11** | [39119761102](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119761102) | [39111751045](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111751045) |
| `:228` x20 | **20/20** | [39119763243](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119763243) | [39111753025](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111753025) |
| Sixth | **10/10**, S6 included | [39119764821](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119764821) | [39111755175](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111755175) |
| Seventh | **16/16**, H included | [39119766867](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119766867) | [39111756934](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111756934) |
| Fifth | **17 passed, 3 timed out**: B1, F-hold, F-late, the recorded departures (A1 passes); bounded B1 **1/1** | [39119768467](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119768467) | [39111758804](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111758804) |
| Maintained | **85 passed, 8 legacy skips**; two-graphic export **1/1** | [39119770403](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119770403) | [39111760989](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111760989) |
| References | **6/6** | [39119772196](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119772196) | [39111762754](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111762754) |
| Visual | 125% cumulative **4/4** | [39119774342](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119774342) | [39111764648](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111764648) |
| Matrix | `save-transaction.spec.ts` **45/45** (42, the conflict row rewritten, three new); the fourth new row's run is below | [39119776363](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39119776363) | [39111766544](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39111766544) |

The control for S-concurrent is the ninth check's own: main fails it
([39107860639](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39107860639) and the three runs
after it).

Local (this VM, 2 workers, `--retries=0`): the five device rows and three new rows **8/8** (j-0033);
all of `save-transaction.spec.ts` and `sync.spec.ts` **47/47** (j-0036, and j-0037/j-0038 on the
reviewed and final source). Control, the four conflict
rows on main's `src/` (j-0034): **all four fail**: the draft is not linked to the copy (first-Save
collision, lost conflict), the edit-between case is not linked to it, and with the list refused the
second tab stays linked to the record that won. Mutations of single rules were not run: the
session's permission policy refused editing the source for them.

## Copy-arrival completion after #1474

#1474 merged at `89ca46c37` without the fix for review comment
[r4306741476](https://github.com/NoaCG/NoaCG-Studio/pull/1474#discussion_r4306741476).
The three follow-up commits, through `0ccd8754e`, add the wait above and its held-adoption row.
This completes the same authorised #1466 repair. Current `origin/main` was merged into the
follow-up branch as `f6755fe93`; no rebase or force push.

The previously unread ci3 runs on `2546da73` have now been read in full. That probe's `src/`
and maintained matrix are byte-identical to the reconciled follow-up:

- [Configured 39121557623](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39121557623):
  signed-in task and eighth X-device pass, ninth S-concurrent **2/2**, R-departure fails only
  at line 281, as on main and as the ninth checker explains.
- [Ninth 39121561735](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39121561735):
  C-pull `:117`, C-overlap `:158`, and both V-superseded `:199` fail on the replaced
  null-link assertions. All three V-reservations fail at `:247` (two records rather than one),
  the same disclosed reservation-list departure recorded by independent-9, not a new failure.
- [Matrix 39121559522](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39121559522): **46/46**.

This continuation's local targeted checks on `f6755fe93`: device-reservation and lost-conflict
rows **9/9**, including the held-adoption row; sync **2/2**; TypeScript, changed-file ESLint and
changed gates pass. Review and simplification ran inline over the five changed files, against
merge base `89ca46c37`, with no additional defect or behaviour-preserving simplification found.
No build was needed for this save-transaction change; full PR and merge-group checks remain CI's.
The fresh tenth independent check must judge the disclosed departures against the owner's
acceptance itself; this repair receipt is not its verdict.

## Limits

- A Save whose record write lands after the pass listed the library but before it wrote the copy:
  the pass skips the pull (`unchanged`), the copy holds the version before that Save, and the
  draft moves there reading unsaved until the next pass, which the slot rewrite schedules. That
  pass writes a second copy holding the Save, and the draft follows it, clean (`lostLinks`). The
  first copy stays, holding the earlier version.
- A copy that has not reached the tab's library ten seconds after the message (the durable store
  degraded, say) makes the waiting Save ask for a name, as a record deleted elsewhere does.
- A tab of an older build, open across a deploy, tells other tabs only through the list, with no
  copy: those tabs unlink, as that build does.
- The topbar shows the draft's own name ("Gamma") while the record is "Gamma (conflicted copy)";
  the sync never renamed the copy's template. Phase 3 says so.
- A tab that cannot receive the message (no `BroadcastChannel`) keeps its link until it reloads,
  when it reads the rewritten slot.
- Budget: the four rows add about 35 seconds to `e2e/save-transaction.spec.ts` at one worker. The
  suite reads 98% of its envelope (`scripts/e2e-capacity.mjs`); the pre-run estimate counts an
  edited spec at its table value, so no exception was written.
