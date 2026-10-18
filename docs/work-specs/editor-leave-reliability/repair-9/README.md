# Device reservation repair (#1443)

## Scope

The owner authorised this on 2026-10-18 as the last repair of the phase: "one bounded repair of
#1443. A graphic's reserved id stays on the device that made it: the synced working draft does not
carry reservedGraphicId or mintingReserved, and a device that pulls the draft keeps its own
reservation or makes a fresh one. A Save whose id turns out to be taken (a sync conflict) asks for
a name and never stays linked to the other device's record. The eighth checker's two-device spec
(independent-8/probe.patch) must pass unchanged, together with every earlier carried checker,
#1383's double-refusal cases and #1402's case H." The eighth check failed on main `00d7e58d`
([independent-8](../independent-8/README.md)). Scope is acceptance criteria 2 and 3.

## What failed

The working slot syncs as a per-account singleton (`backend/storage.ts` `SINGLETON_KINDS`) and
carried `reservedGraphicId`. Device B booted device A's never-saved draft and resumed A's
reservation. A first-saved it as "Alpha". B's library learns of Alpha only on B's next sync pass,
so repair-8's rule 1 (`graphicIdTaken`, this browser's library) could not see the id was taken,
and B's Save of its draft as "Beta" minted Alpha's id. The sync kept Alpha, turned B's record into
"Beta (conflicted copy)" and left B's editor linked to Alpha; B's next Save asked no name and
wrote into Alpha.

## The design

Three rules. Repair-8's one-browser rules (the write rule, the `mintingReserved` mark, the content
rule) are unchanged; they now apply only to a reservation this device made.

1. **A reservation is honoured only on the device that made it.** Each device keeps the ids it
   reserved in a device-local list (`spx-gfx-reservations`, localStorage, the last 20; never a
   sync kind; versioned `{ version: 1, ids }` in `model/deviceIds.ts`, a newer version read as
   empty and never written over). `reservedGraphicId` (model/project.ts) records each fresh id there. Boot
   (store/templateStore.ts) resumes or relinks the slot's reservation only when
   `isOwnReservation` says so; a pulled draft naming another device's reservation is left
   unlinked and its first write names a fresh id of this device's own. Tabs and duplicated tabs of
   one browser share the list, so repair-8's tab rules decide between them as before.
2. **A pull keeps this device's reservation.** `upsertProject`, the sync engine's local write of
   the slot, keeps the reservation of a slot this device reserved whatever the pull carries, and
   never writes a mint mark, which speaks only for this device's own minting write. A double
   refusal (sixth S6) therefore still relinks after a pull brings the same draft back without the
   fields, as an older build pushes it.
3. **A record that loses a sync conflict unlinks the draft.** When the sync engine keeps the
   cloud's version of a graphic and writes this device's as a "(conflicted copy)", it tells the
   local side first (`StorageProvider.lostConflict`, backend/sync.ts), before the pull replaces
   the record. `graphicSuperseded` (model/project.ts) unlinks a slot linked to that record, drops
   a reservation naming it, and moves the slot's time so the next pass shares the unlinked draft;
   templateStore drops the live link. The next Save asks for a name and mints a record of its own.
   The id is kept in a second device-local list (`spx-gfx-superseded`), whose write tells every
   other tab of the browser (a `storage` event) to drop its link too, and which a first Save
   whose record write a pass overlapped reads before it links. The slot write the unlink makes is
   the pass's own, so it does not hold back a pull of the slot in the same pass.

### Departure from the owner's wording, and why

The owner wrote that "the synced working draft does not carry reservedGraphicId or
mintingReserved". The cloud copy of the slot still carries `reservedGraphicId`, as data no other
device honours. The eighth device spec, which the owner requires to pass unchanged, makes that
necessary: its setup polls the cloud's `project` row until its `reservedGraphicId` equals device
A's (`leave-eighth-device.spec.ts` lines 69 and 74 of the file), and polls device B's pulled slot
for the same value, each with a 60-second timeout. Stripping the field on push makes the spec time
out in that setup, before it reaches the case. What the owner's rule protects is that no other
device can mint or relink the id; rules 1 and 2 hold that wherever the field travels. A mint mark
never reaches another device's slot (rule 2), and is not honoured there if it did (rule 1).

### Declined from review

- Relinking the draft to its "(conflicted copy)" instead of unlinking it would save the naming
  question and a record, but the owner's rule is that such a Save asks for a name.
- A device id stamped on the reservation (`reservedBy`) instead of a device-local list would add a
  field to the synced slot, which the owner's rule keeps the reservation's fields out of.
- Node tests for `upsertProject` and `graphicSuperseded` alone: what the rows assert is a boot after
  a reload and the naming question, which need the browser.

## References

No new reference task, as in the eighth check: Studio v0.17 saves a project by download and
Eyevinn mints the record's id when it saves, in `localStorage`. Neither syncs a working slot or
reserves an id another device can resume, so neither has this case to compare.

## Results

Disposable dispatch-only probes, never queued. Each is this branch's `src/`, matrix and tests
plus the carried files and dispatch recipes taken byte-identical from
`claude/probe-editor-p2-check-8-ci` `0040421e`. A `git diff` over those 19 paths is empty, and each
run logs every carried sha256 equal to independent-8's: device spec `a1a991e0…`, eighth `5f64b001…`,
seventh `352905b1…`, sixth `0b5207f2…`, and the rest. The probe that counts is
`claude/probe-editor-p2-repair-9-ci3` (`6fdffc85`), the final `src/` (8e5e255, versioned lists).
`…-ci2` (`c451f1ed`, after the review fixes) and `…-ci` (`0d3695db`, before them) gave the same
result in every scope. CI used `--workers=1 --retries=0`.

| Scope | ci3 (final) | ci2 | ci |
| --- | --- | --- | --- |
| Configured: signed-in task, eighth X-device | **1/1**, X-device **passes**, [39104861595](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104861595) | the same, [39104204278](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104204278) | the same, [39103621856](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103621856) |
| Eighth checker | **7/7**, [39104863945](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104863945) | 7/7, [39104205770](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104205770) | 7/7, [39103623155](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103623155) |
| Unchanged: original, second, third, `:24` x20, fourth | **3/3, 4/4, 10/10, 20/20, 11/11**, [39104866236](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104866236) | the same, [39104207093](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104207093) | the same, [39103624408](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103624408) |
| `:228` x20 | **20/20**, [39104868261](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104868261) | 20/20, [39104208641](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104208641) | 20/20, [39103625608](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103625608) |
| Sixth (S6 included) | **10/10**, [39104870116](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104870116) | 10/10, [39104210207](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104210207) | 10/10, [39103627206](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103627206) |
| Seventh (H included) | **16/16**, [39104872096](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104872096) | 16/16, [39104211318](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104211318) | 16/16, [39103628641](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103628641) |
| Fifth; bounded B1 | **17 passed, 3 timed out**: B1, F-hold and F-late, the recorded departures (A1 passes); bounded B1 **1/1**, [39104874328](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104874328) | the same, [39104212619](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104212619) | the same, [39103629742](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103629742) |
| Maintained; two-graphic export | **85 passed, 8 legacy skips; 1/1**, [39104875995](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104875995) | the same, [39104213899](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104213899) | the same, [39103630829](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103630829) |
| References | **6/6**, [39104877742](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104877742) | 6/6, [39104215107](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104215107) | 6/6, [39103631975](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103631975) |
| 125% cumulative | **4/4**, [39104879798](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104879798) | 4/4, [39104216257](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104216257) | 4/4, [39103633558](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103633558) |
| Matrix `save-transaction.spec.ts` | **42/42** (37 + 5 device rows), [39104881584](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104881584) | 42/42, [39104217506](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39104217506) | 42/42, [39103635044](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39103635044) |

The control is the eighth check's own: main fails the X-device case ([39101304436](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39101304436)).

Local (this VM, 2 workers, `--retries=0`): j-0026, all of `save-transaction.spec.ts` and
`sync.spec.ts` after review, **44/44**; the eighth checker **7/7** (j-0023, j-0027), the sixth **10/10**
(j-0028) and the seventh **16/16** (j-0030) on the reviewed source; the five device rows **5/5** on the
final one (j-0029); `scripts/device-ids.test.mjs` **5/5**.

Mutations, each run here on the five device rows and reverted:

- M1, every reservation honoured (`isOwnReservation` always true), j-0020: **the two pulled-draft
  rows fail** ("this device minted the id another device reserved"; "a draft is linked to a record
  another device minted"). The other three pass. Before the rows started from a device with no
  draft (j-0019), M1 passed all five: the pull rule masked it (Trap, phase note).
- M2, a pull writes the slot whole, j-0021: **the own-reservation and S6-after-pull rows fail**
  ("the pull replaced this device's reservation"; "this device's reservation did not survive the
  pull").
- M3, no `lostConflict` call, j-0022: **the conflict row fails** ("the draft stayed linked to the
  other device's record").
- M4, no `storage` listener, j-0025: **the conflict row fails** ("the other tab stayed linked to
  the other device's record").
- All three of M1 to M3 together (main's behaviour), j-0018: all five rows fail.

## Limits

- An upgrade: a slot reserved by a build before this repair is not in the new list, so it is
  treated as another device's. A save left half-done by such a build (both slot writes refused)
  asks for a name after the upgrade and mints a second record; nothing is overwritten.
- If the list cannot be written (localStorage refused), this device's reload treats its own
  reservation as another device's, with the same outcome.
- An older build on another device still resumes a pulled reservation and can mint this device's
  id. Rule 3 answers that collision when it reaches this device as a conflict. It does not when the
  other device's record arrives with an `updatedAt` older than this device's sync bookmark (the
  bookmark is taken at the end of a pass), where the engine's last-write-wins pushes this device's
  record over it. That is the engine's general bookmark window, not specific to the reservation,
  and this build never mints another device's reservation.
- The pass that finds the conflict pushes the slot it listed at its start, still linked; the
  unlinked slot follows on the next pass, which the unlink schedules. In between, another device
  that pulls the slot and reloads would see that draft linked to the record.
- Rule 3 also unlinks a draft whose linked graphic was edited on two devices at once and lost the
  conflict. Its next Save then asks for a name instead of writing over the other device's edit,
  which is the engine's own "never a silent overwrite" rule.
- Budget: the five rows add about 40 seconds to `e2e/save-transaction.spec.ts` at one worker. The
  suite reads 98% of its envelope (`scripts/e2e-capacity.mjs`); no exception was written.
