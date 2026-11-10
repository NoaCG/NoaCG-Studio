# Owner decision 2026-11-10: Codex review-guidelines rule at the root

- Date: 2026-11-10
- Owner: miwco
- Asked in: coordinator session for the cicd-followup plan run (run issue #1967), after the cf21 check (PR #2348).

## Question

"cf21 passed its check, with one gap in your change 5 (the short Codex review-guidelines rule). The rule is about 400 bytes. The root AGENTS.md has a size cap of 3072 bytes and is at 3017, so the builder put the rule only in src/AGENTS.md. Codex therefore uses it only on PRs that touch src/. PRs in scripts/, .github/ and docs/ (where this CI work lives) don't get it. What should happen?"

## Answer

Option chosen: "Raise cap ~400 bytes (Recommended)"

Option description: "Raise the root AGENTS.md cap from 3072 to about 3480 bytes, recorded as your decision, and move the rule to the root so Codex uses it on every PR. Small fix PR through the queue."

## Applied

`KERNEL_MAX_BYTES` in `scripts/contracts-lib.mjs` goes from 3072 to 3480. The rule `root/codex-review-guidelines-real-defect-product` takes scope `**`, so it compiles into the root AGENTS.md (3447 bytes) and leaves src/AGENTS.md.
