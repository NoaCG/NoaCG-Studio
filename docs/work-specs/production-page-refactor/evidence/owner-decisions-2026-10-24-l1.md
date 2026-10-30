# Owner decision, 2026-10-24: row L1, pinned live controls, admitted to the run

Planning only. Reconciled against main `ad3c7238b`. No product code, no change to the run's
project record by this document; the coordinator reconciles the record at admission.

**What the owner decided.** On 2026-10-24 he agreed the spec
[`docs/work-specs/pinned-live-controls/spec.md`](../../pinned-live-controls/spec.md) (landed in
pull requests 1676, 1677 and, after an independent second opinion, 1685) and said: "Yes, land the
extensions.md edit that admits row L1 after E7.2b and before E1.1, with the child obligations the
spec names."

**What changed in `extensions.md`.**

| | Change |
| --- | --- |
| Row 32a | L1 between row 32 (E7.2b) and row 33 (E1.1), environment CA, gating L1 AC-1 to AC-7, AC-9 and AC-10; AC-11 is a trial-kit task and S's dress-rehearsal case. Every other row keeps its number so the project record's row numbers (1 to 47) stay valid. |
| Row 33 (E1.1) | a pinned native block never carries a typed envelope |
| Row 34 (E6.1) | a native action's target kind is the pool graphic, resolved by L1's `liveSelection`; E6's snapshot, lease and capability checks retained |
| Row 38 (E2.2) | pinned program-instance controls, argument forms and instance replacement tested explicitly |
| Row 42 (E6.2) | presets for the pinned graphics' live controls; pins as preset material only |
| Row 43 (E8.1a) | cross-feature cases: a pinned foreign graphic, a pinned graphic bound to a source |
| Row 45 (E8.2) | L1 AC-11's two-graphic task in the kit |
| Row 47 (S) | L1 AC-11's quiz-and-score case in the dress rehearsal |
| Integration decisions | one "Pinned live controls" bullet with the child obligations |
| Counts | 32 named work packages, 48 execution phases; the parent spec's "47" counts predate this row and are read with it |

**What the coordinator does.** At the next admission after E7.2b, add row 32a to the project
record with the spec path, its gating ACs and environment CA, and carry the amended gating text of
rows 33, 34, 38, 42, 43, 45 and 47. The child specs' own files are not edited (their digests stand);
the obligations live in `extensions.md`, which is normative for integration.
