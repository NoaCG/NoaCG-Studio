# Bounded post-landing CI retry repair

Run 38004289115 on receipt merge df5f8424 completed nine full browser shards.
Shard 4 reached the unchanged 20-minute cap after 194/226 cases, with no
assertion error in its complete log. The retry was skipped because eligibility
accepted only failure; the final gate also accepted a successful retry only
beside failure. A cancelled matrix therefore could not use the existing
single-missing-report path. This is a concrete qualification-workflow gap.

Goal: execute the existing bounded retry for a timed-out shard and accept only
its completed successful verdict. Keep the current retry planner, 20/45-minute
caps, more-than-one-missing-report refusal, changed-failing-spec refusal,
manual workflow cancellation guard and absence of PR retries.

Scope: two workflow conditions and their executable regression coverage. No
editor, source model, test assertions, budgets, permissions or retry-count change.
No additional editor reference task applies to this CI-only repair; the landed
phase's independent main/reference/production comparison remains the UI proof.

Acceptance:
- Main pushes and merge groups may retry failed or cancelled matrices; PRs,
  successful/skipped matrices and manual workflow cancellations may not.
- The actual final gate accepts a cancelled matrix only after a successful retry;
  missing, skipped or failed retry results remain non-passing. Build, plan,
  factory and catalog failures remain non-passing.
- Existing planner refusal tests and targeted workflow validation pass. The timed-out
  shard is rerun on its unchanged SHA before repair, per scoped guidance.
- Land through /check and /queue-merge, inspect actual jobs, then verify a full main
  verdict without raising limits or reading an unfinished run as passing.

Evidence: https://github.com/NoaCG/NoaCG-Studio/actions/runs/38004289115.
GitHub cancellation semantics: https://docs.github.com/en/actions/reference/workflows-and-actions/expressions.

Verification before repair: shared job j-4125 ran 15 tests. The 11 existing
planner cases and two gate-preservation cases passed; the two new cancelled
eligibility/final-verdict cases failed against the actual workflow expression and
Bash body. This reproduces both gaps without mocking the workflow implementation.
The requested unchanged-SHA shard rerun is attempt 2 of 38004289115; concurrency
superseded it before any jobs started, so it supplies no assertion verdict.

/check: inline review read the three changed files against merge base
87fc65c11636eb15aec4e2e6b05c51c323abc923. One finding was fixed: the new
short-lived Bash subprocess must set windowsHide, as the existing repository
contract requires. Simplify inline retained the two workflow conditions and
exercised their actual expression/shell without a new runtime helper.

Verification: j-4126 passed all 15 retry tests; final affected-gate job j-4132
completed with exit 0, including all 19 workflow/action schema validations,
contract/docs/copy/security/coverage checks and the discovered targeted tests.
The first gate attempt lacked installed dependencies. An intermediate NODE_PATH
wrapper could resolve the validator but not ESM TypeScript imports; it was not
counted as passing. Final setup uses this session's own installed dependency tree
through a junction: both complete package-lock.json files have SHA-256
D6BE32275270A9618AA2FC7F3C597CEC5B36EC7CDAFE92D3E2F9DD2138737AA5.
No full app build or browser suite ran locally for this CI-only repair. Cloud PR,
merge-group and actual main outcomes are recorded in the landing PR comment.
