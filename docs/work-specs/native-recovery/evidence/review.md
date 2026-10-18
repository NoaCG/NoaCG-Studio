# Native recovery source review

Reviewed source `df8d14b969addfbf6910a1eb572589656ae108dd`, base
`3010e41134f1e3a6ebf3933582eb9b7e52055241`. Modes: review inline, simplify inline,
verify inline. No separate native reviewer/model call or worker is claimed.

Scope: `docs/research/durable-orchestration.md`; this spec's `spec.md`, `work.json`,
`evidence/qualification.md` and `evidence/context.json`; `scripts/native-recovery-contract.mjs`,
`scripts/native-recovery-contract.test.mjs`, `scripts/native-recovery-context.mjs` and
`scripts/native-recovery-context.test.mjs`. The stale 639-file request was discarded; the fresh
request contained exactly these nine paths. This new receipt and the review-only ledger update
follow that source under the existing evidence-followup rule.

Review found and fixed three measurement/protocol edges before the reviewed commit: validate
native wait deadlines before passing them to the supervisor protocol; leave the first Codex
request size unavailable when only a later request exposes it; and reject incomplete Claude
cache counters rather than defaulting absent fields to zero. Regressions cover all three.
The native provider must supply truthful authoritative receipts; these pure guards do not
create native idempotency, permission introspection, scheduling, durability or a remote fence.
Simplify reused the existing native usage readers/deduplication rather than creating another
usage accounting model. No shared wake/hook or execution/merge policy changed.

Verification: 67 targeted tests passed across the contract/context, supervisor, run-wake,
plan-run, wave-launch and wave-recovery files. The supported runtime permission was needed
for child-process tests; the original sandbox failures and successful unchanged rerun remain
in the qualification receipt. Changed-path gates passed seven cheap checks and 20 tests in
three selected files. Targeted ESLint and `git diff --check` passed. No production build or
browser test was needed: no build inputs or product flow changed; authoritative CI still applies.

AC-1 and AC-2 pass only for their stated guards. AC-3 remains unverified until the second real
wake and terminal disable. AC-4 remains unverified because real native usage/tool-context and
repeated-planning counters are unavailable. The observed prompt bytes and null metrics are
preserved. Parent #1301 and context follow-up #805 remain open.
