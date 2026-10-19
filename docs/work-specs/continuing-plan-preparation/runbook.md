# Future planned-run readiness

This is preparation guidance. No example below authorizes or starts a real plan.
Keep the owner's original deadline, scope, phase set and acceptance throughout.

## Project and work blocks

Prepare the following JSON from the current owner's authorization and actual plan.
IDs, dates, phases and environments below are placeholders, not reusable authority:

```json
{
  "version": 1,
  "id": "owner-project-id",
  "ownership": "local-single-owner",
  "authorization": {
    "source": "current owner authorization reference",
    "scope": "exact accepted scope",
    "permissionPolicy": "actual effective policy and its evidence",
    "startedAt": "2030-01-01T09:00:00Z",
    "deadline": "2030-01-04T18:00:00Z"
  },
  "status": "paused",
  "phases": [
    {
      "id": "phase-id",
      "title": "Exact plan phase title",
      "dependsOn": [],
      "acceptance": ["Exact criterion or acceptance reference"],
      "environment": "environment required by this phase's acceptance"
    }
  ]
}
```

Preserve every phase object and its additional plan data. Dependencies reference
earlier phase IDs; sequential admission preserves the authorized phase order.
A required acceptance environment may describe several named checks/environments;
do not replace hardware, OS, performance or human acceptance with cloud fixtures.

`wave-plan-store --open ... --project <json>` creates the continuing wave file in
the existing job store, with its immutable authorization and copied phase titles.
It starts paused. Use that same file and deadline on every restart. Different
project IDs must not be used to escape an unfinished run. Existing short legacy
windows still load; adding continuing metadata to one requires an explicit
reviewed migration preserving its original phases/events/authorization. The
bounded-production-pilot resume helper is separate and keeps its original limits.

Register the existing version-1 supervisor manifest: same `id`, `kind: "plan"`,
absolute wave path, identical `authorization`, bounded packet and explicit local
adapter. Packet/adapter requirements remain in the native-recovery runbook.
Start a block with `run-supervisor.mjs start-block <db> <id> <json-file>` where the
JSON contains `owner`, `deadline` and `evidence` of reconciliation. A block lasts
at most 24 hours and ends no later than the project deadline. Save the returned
block's `id`, `owner` and `epoch` as the authority receipt for phase recording.
An active block cannot be replaced by a competing caller. An old receipt becomes
invalid after resume. SQLite and the wave admission lock coordinate this host only.

Use `run-supervisor.mjs record ... --authority <block.json>` for every project
phase event. A build/repair/check detail is a one-line JSON receipt with `actor`
and useful branch/worktree/native-action references. A checker cannot be any
previous builder/repairer of that phase. PASS is the same checker's JSON receipt:

```json
{
  "actor": "independent-checker-id",
  "findings": "findings carried forward",
  "evidence": [
    {
      "criterion": "Exact criterion or acceptance reference",
      "environment": "environment required by this phase's acceptance",
      "evidence": "original exact-revision evidence link"
    }
  ]
}
```

Every criterion needs its own evidence. Product failures and prerequisite failures
keep `product:`/`blocked:` details and their existing repair/check limits.
Record acceptance only after observing it. A ledger receipt cannot prove the
truth of supplied evidence or qualify a provider by itself.

## Pause, restart and recovery boundaries

- `pause` stops new phase admission immediately. `wait` also records the blocked
  prerequisite; clear it with explicit resolution evidence before another block.
- The in-flight worker checkpoints. A bounded supervisor `tick` asks its existing
  adapter for `operation: "checkpoint"`, including `workBlock` and reason. It
  accepts only `state: "checkpointed"`, matching `blockId`, `phase`, `step` and
  nonempty `evidence`. No new worker is launched. Missing/uncertain acknowledgement
  keeps resume refused; inspect the original worker and its external actions.
- At block end keep-awake and block wakes stop. A stale active header does not
  extend the block. Resume uses the same identity/deadline and a new block receipt.
- Preserve unresolved external intents. An absent local record or empty provider
  listing does not establish non-delivery. Reconcile original action ID/hash and
  native receipt before replay; never delete pending state to get past a refusal.
- Owner cancellation is terminal. Expiry refuses work even if a phase is in
  flight. Completion is distinct and requires every required phase PASS.
- A mismatched wave/control digest fails closed, including an interrupted update.
  Preserve both records and reconcile the last acknowledged update; there is no
  automatic state rewrite. An interrupted `.admission` lock also stays refused;
  inspect its owner-pid and records before removing a proven abandoned local lock.
- The existing Git checkpoint/restore can retain multi-day authorization, exact
  source and ledger. Its CAS protects checkpoint publication, not remote action
  acceptance. Restored project execution and automatic native replacement remain
  refused: native stale-owner rejection, cloud-owner acceptance and wake/bootstrap
  are unqualified. Closing a coordinator therefore checkpoints and stops.

No scheduling acknowledgement changes these boundaries. Do not claim durable or
cross-machine execution from this single-host protocol or its deterministic tests.

## Checklist before any future planned run

1. Current owner authorization: finite deadline, immutable scope, complete phases,
   dependencies, criteria and required acceptance environments.
2. Separate landed preflights and a fresh delegated context; record actual shell,
   child, network and policy evidence. Resolve every prerequisite once.
3. One current local block owner and authoritative control store; reconcile first
   unfinished phase, workers, PRs, failures, repair counts and pending action IDs.
4. Actual native launch/inspection/result transport qualified for that provider;
   software checks on qualified cloud, other checks in their required environment.
5. Explicit checkpoint behavior in flight; bounded wakes only if authorized and
   observed. Otherwise the active coordinator remains and stops at block end.
6. Before a manual verification dispatch, record the observation-only lookup.
   Keep experiment dispatches and existing failure/retry policy unchanged.
7. Independent acceptance, /check, merge queue admission, merge commit and checks
   on the actual merge SHA. No unfinished acceptance is converted into completion.
