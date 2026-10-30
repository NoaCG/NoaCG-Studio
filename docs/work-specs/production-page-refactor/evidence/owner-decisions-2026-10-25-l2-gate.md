# Owner decision (delegated), 2026-10-25: row 32b's gate narrowed to phase 1 as revised

Planning only. Reconciled against main `cad2f01c5`. No product code, no change to the run's
project record by this document; the coordinator reconciles the record at admission and is told
that row 32b's gate changed before L2.1's builder starts.

**What the owner decided.** On 2026-10-25, after two further independent second opinions on
[`docs/work-specs/playout-adjustments/spec.md`](../../playout-adjustments/spec.md) (both
"agree with corrections", source review against main `8ebb429b4` and `bb7890068`), the owner
said: "Take a look at them and implement the things that you see as good solutions and makes it
better." The spec's revision of the same day folds in the amendments that held up against the
code. One of them narrows phase 1: the transform's host in a document that is the page (the
hosted and relay receivers, the exported controller's overlays, the html-overlay, CasparCG, SPX
and OGraf bakes) is undecided until a catalog sweep over `vw`/`vh` designs settles it, so phase 1
must not gate on it. Agreement on the design as a whole is **not** given by this; the spec's work
ledger stays a draft.

**What changed in `extensions.md`.**

| | Change |
| --- | --- |
| Row 32b (L2.1) | gate narrowed: L2 AC-1 to AC-4, AC-8, AC-9's renderer half (the `/output` renderer's and both PROGRAM stages' restart and reconnect), AC-10's unchanged-production part, and the export dialog's disclosure that adjustments are not carried; no receiver, overlay or bake |
| Integration bullet | names the surfaces L2.1 owns outright and the documents-that-are-the-page it leaves to phase 1b |
| Counts | unchanged: 33 named work packages, 49 execution phases |

**Proposed, not admitted.** Row 32c (L2.1b, phase 1b: the sweep, then the receivers, the exported
controller and the bakes with per-target parity checks) after 32b; rows L2.2 and L2.3 (phases 2
and 3) after E2.2. They wait for the owner's agreement of the design as a whole and their own
admission.

**What the coordinator does.** Carry the narrowed gating text of row 32b into the project record
before L2.1's builder brief is written; nothing else moves.
