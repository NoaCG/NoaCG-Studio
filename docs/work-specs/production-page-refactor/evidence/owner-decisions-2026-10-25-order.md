# Owner decision, 2026-10-25: rows 32a and 32b run before row 32

Planning only. Reconciled against main `960e4aff3` while row 31 (E7.2a) was in flight. No product
code, no change to the run's project record by this document; the coordinator reconciles the
record at the next admission.

**What the owner decided.** Pinned live controls (L1, row 32a) and place and size (L2.1, row 32b)
are needed for a studio game show on Monday 26 October; the election rehearsal (E7.2b, row 32) is
not. At the measured pace (about 3 to 5 hours a row, a failed check adding 3 to 6), the original
order puts L2.1 at Monday 05:00 to 10:00 Helsinki time or later. The owner chose to run 32a and
32b right after row 31 and move only row 32 later.

**What changed in `extensions.md`.**

| | Change |
| --- | --- |
| Admission order | 31 (E7.2a), 32a (L1), 32b (L2.1), 32 (E7.2b), 32c, 32d, 33 (E1.1). Row IDs are unchanged and stay stable labels; the table order is the admission order. |
| L1 bullet | runs after E7.2a and before E7.2b |
| L2.1 bullet | runs after L1 and before E7.2b |

**Why the dependencies still hold.** L1 sat after E7.2b so that the cue editor's read-only
candidate fields were settled before its prep rule lands. Those fields come from E7.1 (row 30,
passed) and E7.2a (row 31); E7.2b is the replay rehearsal, its runbook and browser-output
captures, and changes no editor seam. L1's spec already notes that E4 and E5 do not touch its
seams. E7.2b now runs on a main that has L1 and L2.1, so its rehearsal covers them as they are; its
gating text is unchanged. Rows 32c and 32d keep their place after 32b and before E1.1, now behind
E7.2b. No other row moves.

**What the coordinator does.** When adding rows 32a to 32d and 38a to the project record, admit
them in the table's order: after row 31 passes, the next phase is 32a, then 32b, then 32.
