# Review after the idle wake

Reviewed source `82765306fe8b08abfc6fbb22289ad9044a92f3a1`, reconciled with main
`6d66070e19644cbaeca01531b951dd7188c65296`. Modes: review inline, simplify inline,
verify inline. The earlier `review.md` describes its original source; this receipt supersedes
its pending AC-3 verdict after the real re-armed wake.

Read scope: `docs/research/durable-orchestration.md`; this spec's `spec.md`, `work.json`,
`evidence/qualification.md`, `evidence/context.json` and `evidence/review.md`;
`scripts/native-recovery-contract.mjs`, `scripts/native-recovery-contract.test.mjs`,
`scripts/native-recovery-context.mjs` and `scripts/native-recovery-context.test.mjs`.
The fresh review request named exactly those ten paths against the reconciled main.
This new receipt and the review-only ledger update follow the reviewed source under the
existing evidence-followup rule. No code, test, authority or specification changed after it.

No new source defect or simplification was needed. The original three fixes and their tests
remain as recorded in `review.md`. The same native task/thread delivered twice, with the
second arrival after the previous response ended; repository and harmless write access were
observed again. The native tool confirmed the one-shot disabled before the original end.
Scheduling discrepancies and the rejected absolute reschedule are preserved. This establishes
the stated bounded idle-wake scenario, without asserting a new VM, remote fence, pending
approval continuation, exactly-once native submission or indefinite monitoring.

The 67 targeted protocol/compatibility checks passed in the first phase. Final changed-path
gates and targeted lint are rerun over this reconciled source; no product/build-input change
requires a local production build or browser suite. Initial draft CI's Build/Factory/plan/gate
passed; the sole failed job was the missing remote Reviewed status. Its entire log was read,
and final source status/CI use the normal queue flow. Nothing is weakened to clear that job.

AC-1 and AC-2 pass for the guards. AC-3 passes for the actual two-delivery/re-arm/stop scenario.
AC-4 stays unverified: only the real 1,825-byte prompt is known; native loaded context, usage
and repeated-planning counters are unavailable. Parent #1301 and #805 remain open for their
broader boundaries. No hosted infrastructure, credential, default wake or owner transfer.
