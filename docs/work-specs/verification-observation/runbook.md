# Verification observation and future activation

The GitHub Teams CI/E2E experiment is **active**. Live mode is hard-coded
`observe`; there is no environment flag or CLI switch to enforce decisions.
Current owner authority covers preparation only. No experiment run was dispatched
to test this change, and no workflow YAML, trigger, concurrency, shard, selection,
required check, retry, timeout or product assertion is changed.

## Supported entry points

| Path | Observation integration | Existing dispatch retained |
| --- | --- | --- |
| `cloud-queue.mjs` / `reviveReviewed` | After its successful absence read, immediately before dispatch | Same `ci.yml --ref <branch> -f require_review=true`; denied/malformed absence reads still refuse |
| `queue-pr.mjs` mechanical fallback | Immediately before its original dispatch | Same ref, `require_review`, optional `diff_base`, order and bot-App bypass |
| `jobs.mjs` recovery | Existing recovery body delegates to tested `dispatchRecovery` | Same full-CI dispatch, return value, diagnostics and retry restrictions |
| Human/manual command | `node scripts/verification-dispatch.mjs -- workflow run <workflow> --ref <ref> ...` | The exact gh arguments execute once after the advisory, for every decision or lookup failure |
| `candidate-dispatch.mjs` (plan-run configured-suite dispatch) | First, before its branch-head check, recorded intent and dispatch | One dispatch of the workflow on that ref; the advisory still gates nothing. Its own head, run-ID and supersession refusals are not observation decisions |
| Raw `gh`, GitHub UI, external callers | Not intercepted; use the supported manual wrapper | No global hook or false cross-machine duplicate-prevention claim |
| `.github/workflows/e2e-durations-refresh.yml` token fallback | Inventory only: this is a workflow-internal automatic call, outside the supported manual paths | Its existing shell dispatch and measured workflow/configuration remain unchanged |
| Scheduled freshness/deploy checks and native Actions triggers | Inventory only; no lookup gate is added | All existing schedules and event behavior remain unchanged |

Before the documented cloud landing fallback, for example, use:

```sh
node scripts/verification-dispatch.mjs -- workflow run cloud-queue-merge.yml --ref main -f branch=<branch> -f sha=<reviewed-sha> -f review=<actual-verdict>
```

The observer performs bounded reads (eight-second overall lookup budget, at most
three seconds per read), then emits a JSON advisory containing `mode`, `decision`,
`advisory`, `reason`, `requestId`, repository/tested revision, original run and
evidence links, and retained attempt/failure history. It does not wait for a run
to finish. Independent callers gain no new shared lock or serialization. The
read-only prelude has a cost; no claim of zero added command latency is made.

- `would WAIT`: complete identity proves equivalent verification is pending/running.
- `would REUSE`: complete, trusted evidence satisfies that exact requirement.
- `would RUN`: new verification is needed; existing failure/repair/retry policy
  still governs whether dispatch may occur.
- `UNRESOLVED`: identity, delivery, enumeration or required evidence is unproved.

**Every advisory leaves the existing dispatch unchanged.** Observation therefore
does not prevent duplicate dispatches. Lookup errors, logging errors, missing
requirements and missing reports introduce no new gate or retry. The original
dispatch's failure/uncertain acknowledgement is returned unchanged, with no
automatic retry. Existing fail-closed absence checks remain before the observer.

## Evidence and identity boundary

The observer reads the existing job/admission directory and GitHub run API.
Local `source`/`kind` admissions and green landing stamps alone do not establish
CI coverage. Provider run metadata alone lacks actual checkout/merge identity,
resolved test selection, relevant environment and trustworthy complete reports.
Those cases deliberately remain UNRESOLVED, with original links for inspection.
Run enumeration is bounded; a truncated page never proves absence or RUN.

An optional `--request <requirement.json>` supplies a full requirement to the
manual wrapper. Its version-1 schema is exercised in
`scripts/verification-lookup.test.mjs`: repository, full actual tested revision,
workflow path/revision/configuration SHA-256, resolved inputs/defaults digest,
exact selected test IDs, relevant environment, purpose, freshness (`maxAgeMs`,
optional `since`) and required report names. The wrapper resolves the actual
dispatch ref/configuration/defaults and rejects identity inference if they differ.
Typed file/stdin/unknown fields remain unresolved. No workflow-name or supposed
superset coverage inference is permitted. Different commits never reuse results.

The optional evidence reader supports an exact GitHub `verification-evidence`
artifact containing `verification-evidence.json`. It validates the downloaded
ZIP against the API digest and bounds decompression, then binds version, run ID,
attempt, workflow path/provider head, complete requirement identity, required
job names, and report artifact IDs/names/attempts/completeness. Reports need
provider digests, unexpired artifacts created in the current attempt and completed
successful required jobs. Later attempts supersede earlier success. Failures,
skips, cancellations, incomplete work and their original links remain history.

Current workflows do **not** emit that full identity artifact. This task adds no
artifact-producing step to the experiment. Artifact read-back is demonstrated by
controlled ZIP/API fixtures, not claimed as live provider qualification. Most
current automatic requests also lack explicit selection/environment/freshness
requirements and therefore report UNRESOLVED. Owner-approved evidence production
is a future prerequisite for automatic reuse, not a reason to infer coverage now.

## Separate future activation procedure

1. Obtain and record the **experiment owner's explicit measurement-complete
   receipt**. Preserve the measured run/attempt/failure history. Calendar expiry,
   a green run, this PR or another coordinator cannot substitute for that receipt.
2. In a separate reviewed change, establish the actual required identity and
   trustworthy report production/read-back for each supported workflow. Rehearse
   merge revisions, defaults, actual test IDs, environments, freshness, missing
   reports and failed attempts offline. Keep scheduled freshness requirements.
3. Keep **one authoritative dispatch coordinator**. Qualify ownership where
   dispatch is accepted, including stale-owner rejection. Existing local locks
   and SQLite do not exclude another machine. Without that support retain the
   single-owner constraint, refuse remote continuation and report the gap.
4. Persist each intent in the existing job/admission record **before** dispatch,
   binding its immutable request ID, owner and stable action ID. On uncertain
   acknowledgement, read back that exact accepted run/evidence before replay.
   Empty listings, a matching head, a local PID or a timeout do not prove final
   non-delivery. Without unique provider reconciliation, remain UNRESOLVED.
5. Exercise `offlineEnforcement` with controlled adapters: accepted-then-ack-lost
   returns the original run, stale/competing owners fail closed, and RUN/REUSE
   cannot override existing failure, quarantine, repair or retry policy. No
   automatic dispatch retries are introduced.
6. Only then implement and review a separate live admission call-site change.
   Changing the mode constant alone does not enforce anything: today's callers
   intentionally ignore every advisory. Retain original input/selection behavior,
   exact-revision checks and a rollback to observation; run /check and queue-merge.

No activation step has been performed. No native/distributed ownership, durable
recovery, provider idempotency or live reuse guarantee follows from fixture tests.
