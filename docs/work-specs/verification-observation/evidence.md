# B verification evidence

Final review baseline: `9294d250d67b6e274c7da7fac580bbb9f3391f73`, reconciled
with concurrent landings including A (#1508). The PR and /check stamp pin the
exact reviewed tip. Changes are tooling/tests/docs only; workflow YAML and
product tests/configuration are absent from this diff.

`/check` review: inline, seven findings fixed: supplied requirements were not bound
to the actual dispatch ref/inputs; old-attempt evidence could survive uncertain
attempt identity; injected readers did not honor bounded/binary reads; a missing
requirement file could gate dispatch; manual stdin needed forwarding unchanged;
changing freshness could otherwise hide a prior uncertain intent; and gh's `-r`
ref spelling needed resolving alongside `--ref`, including flags before the
workflow position. Simplify:
inline, reuse the existing job store and runner, extract the original recovery
body without changing its dispatch/return behavior, keep the live observer and
offline enforcement model separate. Verify: inline.

- `npm run gates -- run --changed origin/main`: PASS, six selected test files,
  55 tests, zero skipped/cancelled. Shared instructions and selected cheap checks
  passed. `git diff --check`: PASS.
- Targeted ESLint over the eight changed/new script/test files: PASS with zero
  warnings. No local production build is warranted by this tooling/docs change.
- Sixteen new lookup/dispatch fixture tests cover exact/mismatching repository,
  actual head/merge revision, workflow/configuration/defaults/inputs, actual test
  IDs, environment, purpose, freshness, pending/completed attempts, missing or
  stale artifacts, failed/incomplete/skipped work, untrusted local admissions,
  uncertain intent and accepted-then-acknowledgement-lost offline reconciliation.
- A controlled ZIP/API fixture demonstrates bounded exact-artifact digest,
  run/attempt/report and required-job read-back. This is not live proof that a
  current workflow emits the complete identity report.
- Each supported dispatch path is exercised for WAIT, REUSE, RUN, UNRESOLVED and
  thrown lookup failure. Original dispatch argument vectors/order/count and
  fail-closed absence reads hold. Two callers still dispatch twice in observation;
  no duplicate-prevention or zero-latency claim is made. Uncertain acknowledgement
  adds no retry. The existing App-token bypass still adds no dispatch.
- A read-only live observer invocation resolved main
  `9294d250d67b6e274c7da7fac580bbb9f3391f73`, read existing GitHub runs and reported
  `UNRESOLVED: actual required test selection is unresolved`. It launched no run.
  This confirms the current evidence gap rather than claiming passing coverage.
- Separate B coordinator preflights passed at 12:43:59.325Z and 12:44:44.024Z under
  supported additional shell network permission, no escalation. Fresh delegated
  same-VM root/nested loads resolved Codex and Claude verify/queue adapters to the
  updated canonical procedures and activation runbook. Native-child/remote-owner
  qualification remains outside this evidence.

The GitHub Teams experiment remains active. Live mode is hard-coded observation;
no runtime enforcement switch exists. The runbook gives a separate explicit
experiment-owner completion/evidence/ownership/admission activation procedure.
Current workflows lack the full identity artifact; live automatic reuse remains
unqualified. Raw gh/UI/external and automatic workflow-internal dispatches are
listed with their unsupported boundaries. No schedules, actual plans, native
implementation workers or duplicate live verification were created for tests.
