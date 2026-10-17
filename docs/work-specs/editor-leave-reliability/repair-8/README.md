# Reservation owner repair (#1402)

## Scope

The owner authorised this on 2026-10-17 as the last repair of the phase: "one bounded repair of
#1402 (a reserved record id is honoured only by the tab and draft that made it; a draft that does
not match the saved record asks for a name instead of relinking; #1383's double-refusal cases and
the seventh checker's spec must pass)". The seventh check failed on main `0ea3b314`
([independent-7](../independent-7/README.md)). Scope is acceptance criteria 2 and 3.

## What failed

Case H. Tabs A and B have the same never-saved draft open. Both resumed the slot's reservation R at
boot. A edits and first-saves it as "Alpha", so record R exists. B edits; B's autosave writes the
slot unlinked and still names R, because B's reservation never learnt that R had become a record.
B reloads. Boot finds record R and an unlinked slot naming it, links B's older draft to "Alpha",
and B's Save writes into "Alpha" without asking for a name. A's later edit is gone from it.

The cause is in what the reservation is: a durable pointer to a record that does not exist yet,
shared by every tab that resumes it. Repair-7 made it ride every slot write (for #1383) but gave
it no owner, so a slot naming an existing record was trusted whoever wrote it.

## The design

Two rules, one at each end of the pointer. No tab id.

1. **A slot write never names a record it did not mint.** `reservedGraphicId` (model/project.ts)
   drops an id that a record already holds (`graphicIdTaken`, tombstones included) for a fresh
   one, unless this tab is minting that id right now. So once A mints R, B's next write names a
   fresh id. This also replaces the mint's own "already taken" check, which now lives in the one
   place every slot write and every mint goes through.
2. **Boot relinks only this draft's record.** A mint marks the window from taking the id until it
   releases it (`mintReservedGraphicId` ... `endMint`). Slot writes made in that window, the
   save's own reservation write and an autosave that fired during the save, carry
   `mintingReserved: true`. Boot (store/templateStore.ts) relinks the slot's reservation only
   when the record exists and either the slot carries that mark, or the slot's draft holds exactly
   the source that record was minted with: the same template once the mint's two changes are
   applied, its name and the prepared Out step (`sameSource`). Otherwise the draft stays unlinked,
   and its Save asks for a name.

Why each part is needed (the mutations below fail exactly these cases):

- The mark alone is not enough: in #1383's double refusal (sixth S6) both slot writes made during
  the mint were refused, so the landed slot is the autosave from before the Save, unmarked. Its
  draft is exactly the record's source, so the content rule relinks it.
- The content rule alone is not enough: in the matrix's `reservation kept` case the user edits
  while the record write waits, that edit's autosave lands during the mint, and the link write is
  refused. The landed draft is newer than the record but is the same draft's own work. The mark
  relinks it.
- Rule 1 also stops a second tab's mint from taking an id another tab already minted.

Why no tab id: the owner's "tab and draft that made it" is what the mark records, the writer was
the tab minting it, for the draft it was minting. A sessionStorage tab id would not be unique
(a browser Duplicate tab copies sessionStorage), and a draft restored in a new tab after a crash
has no tab of its own any more. With the mark and the content rule, a reload of the same tab, a
new tab and a duplicated tab are all decided by the same evidence in the slot. A duplicate is
replayed in the matrix with the original's sessionStorage copied in.

Old slots: `mintingReserved` is additive and optional. A slot written before this repair has no
mark, so only the content rule can relink it: a draft holding exactly the record's source is that
record (no duplicate), any other asks for a name. A slot without `reservedGraphicId` never
relinks, as before.

## The matrix (`e2e/save-transaction.spec.ts`)

The 107 cases stay unchanged. Eight are added (115 in all), under "reservation owner":

- {a second tab, a duplicated tab} x {B saves without a reload, B reloads first}: A first-saves
  the draft B has open after editing it; B adopts A's record, edits, and its slot write must not
  name A's record. B's Save asks for a name and mints "Beta" holding B's source; "Alpha" is
  byte-equal to what A saved; two records.
- A duplicated tab is open while the minting tab's R and K are both refused; the minting tab
  reloads and is relinked; its next Save writes into the record; one record; the idle duplicate
  took nothing.
- R and K refused, then the tab is closed without its unload work (a crash) and the editor opens
  in a new tab: the draft holds exactly the record's source, so it is relinked and saves into it.
- A slot with no mint mark (as a build before this repair left it) names a record that holds
  other work: the new tab is unlinked, asks for a name, and the record stays byte-equal. The same
  slot holding exactly the record's source: relinked, and the Save asks nothing and mints nothing.

## Results

Disposable dispatch-only probe `claude/probe-editor-p2-repair-8-ci` (`a31e8e73`): this branch at
`ea59191` plus the carried files and dispatch recipes taken byte-identical from
`claude/probe-editor-p2-check-7-ci` `5aad888b` (a `git diff` between the two refs over those paths
is empty). Each run records the carried files' sha256. Control `claude/probe-editor-p2-repair-8-pre`
(`4f7a89fd`): main `0b3790f8`, whose `src/` is identical to the checked main `0ea3b314`'s, plus the same
carried files and this branch's matrix. Neither is ever queued. CI used `--workers=1 --retries=0`.

RESULTS_TABLE

Local runs (this VM, 2 workers, `--retries=0`), before the probe:

| Run | Result |
| --- | --- |
| j-0002, the fix: seventh H, sixth S6, fifth A1, matrix `refuse+reload`, `reservation kept`, `double refusal` | **16/16** |
| j-0003, the fix: the eight new cases | **8/8** |

Mutations, each run in this VM and reverted:

- M1, boot trusts any record the slot names (main's rule; rule 1 kept), j-0004: **the unmarked
  slot holding other work fails** ("a draft that does not match the record is not linked to it").
  H and the two-tab cases still pass: with rule 1, B's writes no longer name the record.
- M2, rule 1 off (a taken id stays reserved; boot rule kept), j-0005: **H fails** ("B's Save kept
  B's source in no record of its own": B's mint took Alpha's id), and so do the four two-tab
  cases ("B's slot write names the record A minted") and the unmarked slot holding other work.
- M3, the mark ignored (content only), j-0006: **`reservation kept` fails** ("the autosave dropped
  the reservation, so the reload lost the minted record"); S6, A1 and the other 20 pass.
- M4, the content rule ignored (mark only), j-0010: **S6 fails**, and so do `double refusal:
  first-kept`, `double refusal after a reload`, the duplicate-tab and crash cases, and the
  unmarked slot holding its own source. `first-named` and `save-as` double refusals still pass:
  the adopted name's autosave relinks them on its own (repair-7's M2 note).

## Limits

- Rule 1 reads the tab's mirror of the library, which adopts another tab's write a moment after
  it lands (`model/durableStore.ts`, cross-tab invalidation). A write made in that window still
  names the record, unmarked; the boot rule then decides by content, so it is not trusted.
- A draft whose source is byte-equal to another tab's record (B undid back to exactly what A
  saved) is relinked to it. Its Save writes the same source; the owner's rule calls that matching.
- An unmarked slot is trusted only while the record still holds what it was minted with. If the
  record changes before the reload (another tab saves or renames it), or the slot's last landed
  write is older than the record (an edit's autosave was still pending when Save was pressed, and
  R, K and that autosave were all refused), the reload asks for a name, and the Save mints a
  second record beside the first. That is the owner's rule applied: nothing is overwritten, at
  the cost of a duplicate in a triple-refusal case. Before #1397 every double refusal did this.
- From review: two tabs that resumed the same id and both first-save inside the mirror's adoption
  window both mint it. In that window the library's whole-list write already drops one tab's
  record whatever its id (`model/durableStore.ts` names the window), so this repair neither opens
  nor closes it. The same window, with tab A's record write refused after its marked reservation
  write landed, A gone, and tab B's reservation and link writes both refused, would leave a marked
  slot naming B's record. Three refusals across two tabs; not reproduced.
- Budget: the eight rows add about 1.3 minutes (local, two workers) to `e2e/save-transaction.spec.ts`,
  which the duration table weighs at 7.5 minutes against a 14-minute shard. The table does not see
  minutes added to an existing file until its next recording; the suite already reads 98% of its
  envelope (`scripts/e2e-capacity.mjs`, #1405).
- Not rerun: repair-7's leave mutations (M1/M2 there), which this change does not touch.
