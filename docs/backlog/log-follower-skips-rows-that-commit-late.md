---
v: 2
source: derived
kind: finding
raised: 2026-09-29
state: advanced
note: "The client stopgap landed 2026-09-30 (research §16 item 9, src/control/logFollow.ts): a follower applies a row that commits late below its cursor. Still missing: the per-show sequence and the stale-Take refusal of Phase 6 step 2, which fix the out-of-order sends and the report baseline."
found: "A command-log follower advances its cursor past rows that are inserted but not yet committed, then drops them as duplicates when they commit; waiting sends also commit in a different order from the presses."
serves: NOW
size: standard
touches: src/control/hostedControl.ts, src/output/main.ts, supabase/migrations/
covered-by: e2e/configured/hosted-control-recovery.spec.ts, e2e/configured/playout-both-roads.spec.ts
needs-owner: none
---

# A log follower can skip rows that commit late, and late sends land out of order

**Filed:** 2026-09-29. **Source:** Phase 6 playout research (`docs/PLAYOUT_ISOLATION_RESEARCH.md`
§5.3, §16), from code and from runs on a Supabase preview branch.

## Why

`control_events.id` is allocated when a row is inserted, not when it commits.
`control_send_many` inserts its rows and then updates the production's `control_shows` row
(0057:62-77); the renderer report, staging and data patches lock that row first and insert
afterwards. While the row is held for a while (a mid-show re-publish writes the multi-MB payload to
it; an `ALTER`; an overloaded database), a batch with no cue item (an Update, a quiz event, a second
operator's press) can commit a HIGHER id first. A follower that sees it holds it 25 ms, finds the
gap still open, refills from the tail, and moves its cursor past the rows that have not committed
yet (`src/control/hostedControl.ts:1066-1149`). When they commit they are dropped as `id <=
lastId`, fast frames arriving during the refill walk are dropped too (`:1157-1158`), and the next
renderer report stores a recovery baseline past them, so a later reboot inherits the loss.

Separately, measured on the branch: when a lock on `control_events` or the `control_shows` row
releases, the sends that were waiting commit within about 30 ms of each other and reach followers
in a different order from the presses. In one run the last command to arrive was the FIRST of
four presses (a Take), so air showed the graphic although the operator's last press was Out.
Under a database overload 23 of 79 sends arrived out of press order.

## What it would take

- The real fix (Phase 6 step 2 in the research document): a per-show, gap-free sequence allocated
  under a small per-show row that every log writer locks FIRST, so commit order equals sequence
  order; followers track that sequence instead of the global id; a per-graphic revision the send
  checks, so a Take older than the graphic's current state is refused instead of airing.
- A client-only stopgap: a refill re-reads a window behind its cursor and dedupes by a set of seen
  ids instead of trusting that nothing below the cursor can still commit. *Done 2026-09-30*
  (`src/control/logFollow.ts`): a row arriving below the cursor is applied if it was never seen,
  and the poll and every rejoin re-read from where the cursor stood 60 s earlier. What it does not
  cover: the renderer still reports the highest applied id as its recovery baseline, so a reboot
  inside the few seconds between a report and a late commit misses that row. Reporting a lower,
  settled id instead would make every reboot replay rows its snapshot already contains, and a
  replayed `next` or `event` is not idempotent, so that waits for the step 2 sequence, which makes
  the baseline exact.

## Evidence

- Code as cited above.
- Research document §5.3: the table-lock and row-lock runs (arrival order after release), the
  overload run (23 of 79 out of order), and the commit-order runs: a follower received log row 2396
  about 2.4 s before rows 2393-2395, and in the app a watching hosted page's action log (durable
  rows only) never recorded the delayed Take in 5 of 5 trials, while its chip still showed the
  graphic on air through the fast road.
