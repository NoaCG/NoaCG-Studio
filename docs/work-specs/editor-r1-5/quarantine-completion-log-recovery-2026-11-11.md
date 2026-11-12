# Operator completion: recovering existing log evidence

The eleven completion tests in native run43094048053/job130778205104 at
5688142041b4a60e19647bd08b01f4ac61208e0d finished their Run step successfully
at2026-11-11T20:21:08Z. The always-upload step failed at20:29:55Z; GitHub still
reports the enclosing job/run in progress and has exposed no artifact. This is
not a causal verdict. No completion observation is currently qualified, and no
new test dispatch is proposed. Preserve the original incomplete primary batch
and its one unknown attempt/eight unadmitted slots unchanged.

## Proposed read-only recovery, before implementation

Prefer the existing reviewed artifact reader if GitHub eventually publishes the
normal artifact. Otherwise read the ORIGINAL native job's durable stdout, once
GitHub makes it available, using the bounded authenticated read-only Actions
reader. Do not rerun the producer, resubmit any test, change a test assertion or
change test waits, retries, worker count, caps or backend guards.

A log fallback is acceptable only after an independent method review confirms
that its evidence is equivalent for the eleven successful observations. Require:

- Exact repository, native run/job, attempt1, head5688142041b4a60e19647bd08b01f4ac61208e0d,
  completion ref and original workflow script/inputs; no arbitrary run selection.
- Terminal Run step SUCCESS, with any enclosing workflow failure explicitly
  retained and attributed to the receipt-upload step. Missing/in-progress Run
  outcome is unresolved. Preserve GitHub's eventual terminal overall conclusion.
- All eleven exact scheduled pair/arm records, in seeded order, no duplicates or
  additional records: matched pairs41–45 then parent46. Distinct queue identities.
- Every record has failed=false, expected2/unexpected0/skipped0/flaky0. No inferred
  success from exit status alone. Reject malformed, missing or failing records.
- Independently inspect the immutable producer: its sole per-trial JSON console
  record occurs AFTER exact historical HEAD/spec/lock/Supabase guards, clean
  worktree, unchanged worker1/retries0 invocation, terminal queue/report agreement,
  no hidden queue replacement, all two first case attempts, zero skips/flaky/global
  errors, and successful terminal/trial receipt writes. A Run-step success also
  requires completion of the exact loop and complete.json write.
- Retain/hash the original complete job log, the native metadata and selected
  console records. Distinguish log-qualified observations from artifact-qualified
  observations. Do not invent raw reports or queue files when their artifact is
  unavailable. Preserve the upload failure and lack of raw completion artifacts
  as an evidence limitation.

Only the all-pass completion may use this path: a failed or ambiguous completion
record needs its case-level/terminal receipts and remains unresolved without
those. This does not qualify the ORIGINAL partial parent41: that controller
threw before its guarded console record or terminal receipt existed.

Keep original and completion identities/censoring separate. Aggregate all295
artifact-qualified parent and296 landing observations plus only actually
log-qualified completion records. Require301 qualified observations per arm and
300 complete within-worker pairs, with the two unmatched observations retained.
The final reader and final causal disposition each need a fresh independent
second opinion before the editor gate can clear. No additional test is part of
this recovery, and no old workflow is turned green.

## GitHub Actions recovery blocker

Reader43097924632 ended with startup_failure before any job was created.
GitHub's public run annotation says an unexpected internal error occurred and
that GitHub was automatically notified (request3f42ceac-de11-11f1-8c46-7ccd4a9cdbeb).
The CLI's generic suggestion of a workflow-file issue is not the server's actual
diagnostic; endurance.yml is unchanged from the last executed reader0c16ec82d.
No product test or evidence retrieval ran in this failed startup.

The original completion job still reports in_progress although its steps are
finished. Its job-log endpoint returns502 (connectorReadTimeout), whole-run log
archive returns404, and artifact listing is empty. Public job UI requires sign-in
to view logs. These are evidence-access failures, not eleven inferred passes.
No new test dispatch is permitted by this recovery. Once the service exposes the
original log/artifact, use the independently reviewed reader and retain this
failed reader run as well. Until then the operator verdict and editor gate remain
unresolved; the same run is durably checkpointed, not restarted.

## Recovery observed on2026-11-12

The original native log became available through the connected GitHub tool.
Authoritative CLI metadata now reports the original run/job FAILURE and no
artifacts. The original decoded log and metadata were saved privately; reader
78ea5b5e3 (fresh delta AGREE/A,13unitPASS) corrected API seconds precision with
actual command-group boundaries. Importing its approved read_batch against
exactly those four authentic saved API responses qualified all11records. No
GITHUB_ACTIONS or runner identity was spoofed and no new tests/workflows ran.
Original workflow failures and unknown attempts remain unchanged. The final
operator report and selected evidence JSON record counts, hashes and limits.
