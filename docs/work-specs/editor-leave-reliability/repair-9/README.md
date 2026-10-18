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
   sync kind). `reservedGraphicId` (model/project.ts) records each fresh id there. Boot
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

TODO

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
