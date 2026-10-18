# Durable run restoration, 2026-10-18

Continuation of #1301/#805 after #1477. The owner authorized a durable recovery
record and restoration flow, with autonomous diagnosis and repair of technical
failures. This adds Git-backed persistence to the existing opt-in supervisor;
the previous guard and timing qualifications remain historical. Both timing probes
stay closed. No new scheduler, credential, hosting service or repair owner is added.

## Acceptance

- Losing the source checkout, phase ledger and SQLite control database can be
  recovered from the existing repository's remote recovery ref alone, plus an
  explicit local bootstrap configuration and the existing authenticated tooling.
- The checkpoint retains the exact pushed revision, spec/evidence hashes, original
  absolute authorization window, waits, pending request/hash/receipt and PR owners.
- Publication precedes delivery and acknowledges phase/checkpoint changes only
  after the remote accepts them. A failed or superseded publication blocks dispatch.
- Restoration preserves terminal/expired state and never extends authorization.
  An interrupted restoration can reuse only its own unchanged prepared files.
- Before dispatch from a restored store, the adapter must return fresh exact native
  binding/policy/turn inspection and current GitHub PR/owner-comment observations.
  Unknown sends retain their original action ID, request hash and packet for
  reconciliation. Missing read-back does not authorize another worker.

## Record and command flow

`run-supervisor.mjs` keeps its existing `runs` table and adapter protocol. A run opts
in through `manifest.recovery`:

```json
{
  "repository": "/absolute/owned/checkout",
  "remote": "origin",
  "repositoryFullName": "NoaCG/NoaCG-Studio"
}
```

Its current `packet.recovery` contains `branch`, full `revision`,
`spec: {path, sha256}`, `evidence: [{path, sha256}]`,
`native: {provider, sessionId, environmentId, policySha256}` and
`repairOwners: [{prNumber, commentId, sessionId, headSha}]`.
`packet.workspace.worktree` names the actual source worktree. Empty owner/evidence
arrays are explicit when nothing is owned; unavailable native identity or policy
is stored as null and keeps the dispatch gate closed. Never put credentials, private files,
transcripts or raw authenticated responses in a packet or ledger.

Commit and push owned work before checkpointing. Dirty/untracked source is refused,
so uncommitted work is never silently described as recoverable. The first checkpoint
checks the source branch on the remote and verifies evidence bytes from the pinned
commit. Recovery commits retain the source revision as a parent, preserving it even
after its feature branch is deleted. Only `checkpoint.json` appears in their trees.
The original adapter executable/arguments/cwd are omitted from the durable document;
they remain local and are replaced explicitly at restoration. Generated commits use
a fixed NoaCG Recovery author/committer identity without changing host Git settings.
All effective fetch and push URLs, including separate or multiple push URLs and
Git URL rewrites, must identify that same repository before any record is exported.
The dedicated `refs/heads/noacg-recovery/<run-id>` ref is state storage, never a
product landing branch; product changes still use `/check` → `/queue-merge`.

Registration, waits, checkpoints, terminal changes, pending delivery intents and
receipts automatically publish for an opted-in run. Use the supervisor wrapper for
phase records so the ledger also reaches the remote before the next action:

```sh
node scripts/run-supervisor.mjs register /state/control.sqlite /state/manifest.json
node scripts/run-supervisor.mjs record /state/control.sqlite run-id 1 build native-worker-id
node scripts/run-supervisor.mjs checkpoint /state/control.sqlite run-id /state/packet.json
node scripts/run-supervisor.mjs tick /state/control.sqlite run-id
```

Publication uses an exact expected previous remote ref (`--force-with-lease`), never
an unconditional force. If push acknowledgement is ambiguous, it checks for that
exact generated commit. Otherwise the operation fails and dispatch stays blocked.
SQLite rolls back failed state mutations; a remote commit accepted before a local
crash is recovered from the remote, rather than overwritten by the stale local row.
The underlying phase file can already contain a failed-to-publish event: preserve
it and republish the checkpoint before any external action; do not repeat the event.

## After a reset

The existing wake/coordinator bootstrap retains the run ID and repository locator
outside the disposable filesystem. It fetches the checked implementation in an
ordinary bootstrap checkout, then supplies a local configuration:

```json
{
  "id": "run-id",
  "repository": "/absolute/bootstrap/checkout",
  "remote": "origin",
  "repositoryFullName": "NoaCG/NoaCG-Studio",
  "worktree": "/absolute/restored/worktree",
  "wave": "/absolute/state/phase-ledger.md",
  "adapter": {
    "command": "/absolute/supported/adapter-executable",
    "args": [],
    "cwd": "/absolute/bootstrap/checkout"
  }
}
```

The adapter is explicitly selected on the current host; recovered paths or command
text are never executed automatically. Its executable and working directory must
exist, resolve canonically and be executable/searchable before fetch or a new
recovery generation is published. `restore` rebuilds without ticking. `resume`
restores an empty store automatically, or continues the matching existing run:

```sh
node scripts/run-supervisor.mjs resume /state/control.sqlite /state/bootstrap.json
```

Restoration fetches the latest recovery ref, verifies identity, authorization and
hashes, creates a detached worktree at the retained revision, restores the ledger
and inserts the original run state with no old local lease. It publishes a new
restoration generation. A stale host's subsequent publication is rejected.
The local preparation journal permits retries after interruption without replacing
unrelated paths or overwriting dirty work. Expired and terminal runs remain stopped.

The first active tick requests read-only adapter operation `restore`, carrying
`restoration` and `recovery`. Its response includes the same `checkpoint`, an
`evidence` reference, `native` in the existing `inspectNative` observation shape,
and `github` observations. Each saved PR requires exactly one current observation
with `repositoryFullName`, `prNumber`, `headSha`, `ownerSessionId`, `commentId`,
`state` (`open`, `closed` or `merged`), `observedAt` and `evidence`. Native and GitHub
observations must be no more than 30 seconds old. The adapter reads the PR and
acknowledged owner comment from GitHub; packet assertions are not observations.
The resulting current PR states enter the recovery packet. Existing inspection and
same-action reconciliation then run before delivery. Failed inspection or changed
ownership stays unresolved for the active technical repair path, without prompting
the user or inventing permission to replay.

## Verification and limits

`/check` reviewed these five changed paths against merge base
`2c36ba0be224d464938538428d02b8b77c56b5b9`, then reconciled with current main
`25384c35d66f22062cf90f81461ddd46ff5b6261` before the final check. Review ran inline and fixed three
issues: preserving a restored native permission wait, waiting before the original
authorization start on a replacement clock, and invalidating an in-flight local
tick when a phase record changes. The permission-wait regression failed before
the correction. Simplification ran inline and reused a single delivery-packet
builder. Automated review then found adapter-argument exposure and missing commit
identity on fresh hosts; both were reproduced before omitting adapter configuration
and setting a machine identity per commit command. A subsequent review reproduced
publication to a different `pushurl`; checking all effective fetch/push destinations
now rejects that configuration before export. A fourth automated finding reproduced
a missing replacement adapter claiming a new generation; adapter path/access checks
now precede restoration. An additional inline regression proved unknown policy could
dispatch on initial registration; every durable tick now parks incomplete native
bindings, including before the first restoration. Both cases failed before fixing.
The first source CI build
`39153528551` failed ESLint on an empty cleanup catch in the new test. Its complete
19,623-line job log was fetched and inspected; adding the cleanup explanation fixed
that source defect. This is one CI repair, not a same-commit fail-then-pass.
Final verification passed nine changed-path checks and all 55 selected tests
in five files, plus targeted ESLint and `git diff --check`. Contract regeneration changed no generated
files. No product, bundle or browser inputs changed, so no production build or
browser run was needed. Initial subprocess execution was refused by the command
sandbox; the supported per-command grant resolved it without source/test changes.
Automatic approval initially rejected the Git tests as possible external writes;
restricting child Git to file transport allowed their safe local execution.

The automated Git transport tests use temporary bare repositories and restrict all
child Git processes to `file` transport. An injected Git transport maps the expected
endpoint to that exact temporary repository; other destinations stay distinguishable
and are rejected. The CLI always uses the real transport. Tests perform real publication and fresh
repository/worktree reconstruction after deleting the original filesystem state,
including original-request preservation, stale-host rejection, expired/terminal
suppression, deleted source branches, interrupted restoration, accepted-worker
reconciliation, phase publication and invalid native/GitHub read-back. They make no
provider requests and establish no provider-level uncertain-send qualification.

This implements portable state restoration and a dispatch gate. The current Codex
surface still lacks the supported native approval/usage inspection and recovery
adapter needed to complete an unattended provider run. No CLI denial is retried.
Git compare-and-swap protects checkpoint publication; it does not atomically fence
an action accepted by a different service. Remote action fencing, native wake after
host loss, genuine uncertain native transport and native context/usage remain open.
No full unattended-readiness or exact hourly-delivery claim follows from these tests.
