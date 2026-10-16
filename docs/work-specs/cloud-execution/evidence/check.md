# Measurement delivery check

Reviewed implementation revision: 4abc5e07f27ab24fa45efda428ec9c112510e9a5.
Base: 55d01c993188d66e61f3ab9ccbe64e7d41cf06bd, origin/main.

Review and simplify ran inline. The attempted Codex review CLI could not
initialize its in-process app-server client (read-only filesystem), so it supplied
no review verdict. The inline review covered the exact review-request scope:

- docs/work-specs/cloud-execution/evidence/capabilities.md
- docs/work-specs/cloud-execution/evidence/ci-comparison.json
- docs/work-specs/cloud-execution/evidence/ci-visual-control.md
- docs/work-specs/cloud-execution/evidence/codex-measurements.json
- docs/work-specs/cloud-execution/evidence/measurements.md
- docs/work-specs/cloud-execution/evidence/provider-runbook.md
- docs/work-specs/cloud-execution/spec.md
- docs/work-specs/cloud-execution/work.json
- scripts/cloud-measure-gates.mjs
- scripts/cloud-measure.mjs
- scripts/cloud-measure.test.mjs

Review: 0 outstanding findings, 0 fixes in this final pass. Checked command scope,
branch/platform boundaries, cgroup-limit claims, detached descendant attribution,
PID identity, bounded termination, canonical gate reuse, explicit queued cohorts,
actual outcomes versus skips/unrun cases, and limits of provider qualification.
JSON receipts were inspected programmatically, including all ten browser runs,
commands, case outcomes, retries, positive tree samples and identical healthy
shard cohorts. The runbook's six named cohorts and four gate path sets resolve
against those receipts. Its provider steps remain pending, not passing evidence.

Simplify: reused descendantsOf and canonical gate functions; removed an unused
process-group field without changing descendant/identity behavior. No shared
instruction, policy, planner or scheduler was changed.

Verification, inline:

- npm run gates -- run --changed origin/main: passed, two files / 11 tests,
  zero failures/skips. Includes the four measurement tests and the process-call
  contract. Final log: /tmp/noacg-final-gates.log.
- Four measurement tests also passed with cwd in an actual detached checkout at
  3f9bad2b2; log /tmp/noacg-detached-check-cwd.log. The owned temporary worktree
  was removed after verification. The subsequent source cleanup only removed
  the unused field and is covered by the final targeted gates.
- node scripts/jobs.mjs add 'npm run test:e2e': refused with exit 1; unchanged
  whole-suite guard retained. No browser job was enqueued by this negative check.
- node scripts/e2e-affected.mjs origin/main --json: mode none for this
  measurement-tool/docs change. No product browser flow was added.
- git diff --check: passed. Fresh merge-tree and merge-order checks: clear.
- Production build and live bounded browser measurements are recorded separately
  in measurements.md and codex-measurements.json. They include failures; this
  check does not promote those failures to green verification.

Initial PR Build run 38895003090 found the checkout-dependent timeout fixture.
Repair attempt 1 isolated the test in a temporary owned Git repository and added
explicit main/detached refusal assertions. The whole Build log was read; no test,
gate, timeout, retry or baseline was weakened. Fresh PR/merge-group CI must test
the repaired SHA; the original red run is not a passing result.

AC-6 passes for the bounded measurement-tool/evidence delivery slice. AC-1..AC-5
remain unverified: Claude measurements, numerical-policy approval, both intended
environment launch proofs, delegation/recovery and narrow click-free Claude
landing are outstanding. No unattended readiness or archived revival is claimed.
