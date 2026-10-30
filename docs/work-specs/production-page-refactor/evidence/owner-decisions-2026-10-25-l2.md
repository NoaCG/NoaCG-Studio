# Owner decision, 2026-10-25: row L2.1, playout adjustments (place and size), admitted to the run

Planning only. Reconciled against main `cfcf65b30`. No product code, no change to the run's
project record by this document; the coordinator reconciles the record at admission.

**What the owner decided.** On 2026-10-24 he took the three decisions recorded in
[`docs/work-specs/playout-adjustments/spec.md`](../../playout-adjustments/spec.md) under "Owner
decisions" (the first delivery is place and size per cue with a per-graphic default, on the
production page, with the hosted page applying but not editing; the production look is a
reversible render-time setting; the Google-font subset defect was fixed as its own change, landed
as pull request 1689), had the spec corrected after an independent second opinion and landed it
(pull request 1692), and on 2026-10-25 said: "once PR #1692 has landed, prepare the admission of
row L2.1 for the production-page coordinator the way L1 was admitted, as its own docs-only
change." The spec's work ledger is a **draft**: this admission authorizes the one row below, not
the design as a whole, and phases 1b, 2 and 3 are not admitted.

**What changed in `extensions.md`.**

| | Change |
| --- | --- |
| Row 32b | L2.1 between row 32a (L1) and row 33 (E1.1), environment CA, gating L2 AC-1 to AC-4, AC-8, AC-9's frame half and AC-10's unchanged-production part; AC-11 is a trial-kit task and S's dress-rehearsal case. Every other row keeps its number. |
| Row 33 (E1.1) | the `update` message's optional `appearance` field is a native wire member outside E1's typed envelope; the read gate preserves it |
| Row 36 (E1.2b) | output replay keeps the renderer's last applied appearance (L2 rule 4) |
| Row 41 (E3.2b) | a foreign frame takes the frame adjust and nothing else; L2 AC-10's foreign case is taken here |
| Row 43 (E8.1a) | cross-feature cases: an adjusted cue bound to a source, a pinned adjusted graphic |
| Row 45 (E8.2) | L2 AC-11's adjustment task in the kit |
| Row 47 (S) | L2 AC-11's case in the dress rehearsal |
| Integration decisions | one "Playout adjustments" bullet with the child obligations and the sequential file ownership |
| Counts | 33 named work packages, 49 execution phases; the parent spec's "47" and L1's "48" counts predate this row and are read with it |

**What the coordinator does.** At the next admission after L1, add row 32b to the project record
with the spec path, its gating ACs and environment CA, and carry the amended gating text of rows
33, 36, 41, 43, 45 and 47. The child spec's own files are not edited (its digest stands); the
obligations live in `extensions.md`, which is normative for integration. Phases 1b, 2 and 3 of the
same spec wait for their own admission, proposed after E2.2, once the row above has landed and
the owner has agreed the design as a whole.
