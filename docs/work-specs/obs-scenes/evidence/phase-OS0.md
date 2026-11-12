# OS0: Landing hold, evidence

Acceptance AC-15 (`docs/work-specs/obs-scenes/spec.md`): with the hold on, the CI gate fails on a
pull request and on a merge group with "Landing hold" and who set it, so a queued pull request
leaves the queue. With it off, the gate behaves as today. If the hold state cannot be read, the
gate fails. The workflow sets and lifts it with a reason, and the guide says what it does not
cover.

## Per clause

| Clause | Changed behaviour | Proof |
| --- | --- | --- |
| On: the gate fails with "Landing hold" and who set it | `CI gate` job's last step, `Landing hold`, runs `scripts/landing-hold.mjs check` on `pull_request`, `merge_group` and branch dispatches | `scripts/landing-hold.test.mjs` R1/R3 (workflow body and a hand-labelled issue), R2/R6 (the step, its condition and `issues: read` in ci.yml); the live pull request check below |
| A queued pull request leaves the queue | The same step runs on `merge_group`, the gate the queue waits on | R2/R6 test on the step's condition. A real merge group cannot read the step before it is on `main`; first live proof after landing (below) |
| Off: as today | The step prints "Landing hold: off." and exits 0; "Require every gate" is untouched; nothing runs on a push to `main` | R1/R5 test; this PR's own green CI gate with the hold off |
| Unreadable: fails | No token, no repository, three failed attempts, or an answer that is not a list all fail with "Landing hold state could not be read" | R4 tests (network down, odd answers, transient failure inside the attempts, missing environment) |
| The workflow sets and lifts it with a reason | `.github/workflows/landing-hold.yml`, dispatch only, `state` and required `reason`, serialized, reads back | R7/R8 tests (idempotent on, off closes every hold with who and why, a reason required, read back fails on mismatch) |
| The guide says what it does not cover | `docs/LANDING_HOLD.md`, "What it does not cover" | the file; indexed in `docs/README.md` |
| (R11) A held gate is not a fault | `scripts/repair-wake.mjs` `heldOnly`; a line in `.agent-workflows/queue-merge.md` | `scripts/repair-wake.test.mjs` "landing hold" tests; the alarm test fails with the check removed (mutation run locally) |

## Local runs

- `node --test scripts/landing-hold.test.mjs scripts/repair-wake.test.mjs`: pass.
- `node scripts/check-workflows.mjs`, `node scripts/check-gate-coverage.mjs`,
  `node scripts/check-shared-instructions.mjs`, `node scripts/check-docs-index.mjs`, eslint on the
  changed scripts: pass.

## Live check on this pull request

Recorded below once run: a hold issue labelled by hand, this PR's `CI gate` job re-run (expected
red with "Landing hold: set by ..."), the issue closed, the job re-run again (expected green).

## Not provable before landing

GitHub offers `workflow_dispatch` only for a workflow on the default branch, and only this branch's
gate reads the hold until it lands. After landing, the coordinator runs the workflow once with
`state=on` and once with `state=off` (neutral reasons) and confirms a merge group fails while on.
