# Owner decision, 2026-10-25: rows 32c, 32d and 38a (playout adjustments, phases 1b, 2 and 3) admitted to the run

Planning only. Reconciled against main `6cc87afb9`. No product code, no change to the run's
project record by this document; the coordinator reconciles the record at admission.

**What the owner decided.** On 2026-10-25, after the spec's revision of the same day (pull request
1709) and three independent second opinions, the owner said: "I agree the playout-adjustments
design as a whole as revised. Once PR #1709 and the two-rectangle follow-up have landed, move the
ledger to agreed and prepare the admission of row 32c (phase 1b), row 32d (phase 2) and row 38a
(phase 3) as one docs-only change, the way L2.1 was admitted." The ledger
[`docs/work-specs/playout-adjustments/work.json`](../../playout-adjustments/work.json) moves to
agreed with that quote as its source in the two-rectangle follow-up (pull request 1712), which
lands beside this change. Agreement authorizes the design and this placement, not implementation:
each row starts only when the coordinator admits it in sequence.

**What changed in `extensions.md`.**

| | Change |
| --- | --- |
| Row 32c (L2.1b) | after 32b: the catalog sweep that decides the transform's host in a document that is the page, then L2 AC-9's receiver and export half and AC-10's unchanged-behaviour part for those targets; place and size only; environment CA; non-gating laptop walk of one exported overlay |
| Row 32d (L2.2) | after 32c, before 33 (E1.1): L2 AC-5, AC-6's per-graphic and per-cue half, AC-10's imported-SVG and agent-made lines; depends on phase 0 items 1 and 2 landed; environment CA |
| Row 38a (L2.3) | after 38 (E2.2), before 39 (E3.1): L2 AC-6's production-look half, AC-7, the Adjust block on the hosted page and phone; AC-10's foreign case after E3.2b; environment CA; kit tasks join E8.2 |
| Row 43 (E8.1a) | cross-feature cases gain an activated look over a pinned graphic and a bound cue with a cue-level typeface |
| Integration decisions | one bullet for the three rows, naming what each adds, why 38a waits for E2.2, and that no wire member is added after L2.1 |
| Counts | 33 named work packages (L2 is one), 52 execution phases |

**Why this placement and not the end of the run.** Appending after E6.2 would build the owner's
rank 1 outcome after the rank 6 OGraf track (`docs/GOALS.md`), leave type correction many rows
away from the show that needed it, and hand E8 and S four new rows at once. Rows 32c and 32d touch
receivers, export targets, the composed document, fonts and the editor's rows, none of which E1
owns, and add no wire member; row 38a waits for E2.2 because its bulk send and hosted controls
sit on the seams E2 settles.

**What the coordinator does.** Carry rows 32c, 32d and 38a into the project record with the spec
path, their gating criteria and environment CA, in that order, and the amended gating text of row
43; start 32c only after 32b has passed, and 38a only after E2.2. Phase 0's two font fixes land
through the ordinary merge flow before 32d starts.
