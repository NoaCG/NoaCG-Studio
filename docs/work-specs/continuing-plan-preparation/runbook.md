# Future planned-run readiness

This is preparation guidance. No example below authorizes or starts a real plan.
Keep the owner's original deadline, scope, phase set and acceptance throughout.

Timezone-free owner dates and times use `Europe/Helsinki`, including today/tomorrow.
Resolve the date's daylight-saving offset and report it; pass explicit-offset ISO
timestamps to the tools. An explicit owner timezone/offset takes precedence, and
resuming never changes an already recorded instant. See the canonical plan-run procedure.

## Project and work blocks

Prepare the following JSON from the current owner's authorization and actual plan.
IDs, dates, phases and environments below are placeholders, not reusable authority:

```json
{
  "version": 1,
  "id": "plan-<plan>-<first-date>",
  "ownership": "local-single-owner",
  "authorization": {
    "source": "current owner authorization reference",
    "scope": "exact accepted scope",
    "permissionPolicy": "actual effective policy and its evidence",
    "startedAt": "2030-01-01T09:00:00+02:00",
    "deadline": "2030-01-04T18:00:00+02:00"
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
absolute wave path, identical `authorization`, bounded packet, explicit local
adapter and the `recovery` block, so the project can continue in any session (below).
Packet/adapter/recovery requirements remain in the native-recovery runbook.
Start a block with `run-supervisor.mjs start-block <db> <id> <json-file>` where the
JSON contains `owner`, `deadline` and `evidence` of reconciliation. A block lasts
at most 24 hours and ends no later than the project deadline. Save the returned
block's `id`, `owner` and `epoch` as the authority receipt for phase recording.
On one host an active block cannot be replaced by a competing caller. An old
receipt becomes invalid after resume.

Use `run-supervisor.mjs record <db> <id> <phase> <event> <detail> --authority <block.json>`
for every project phase event; `<phase>` is the 1-based row number of the project's
`## Phases` list. A continuing project is driven by `continue`, `start-block`,
`record` and `next` only, never `tick`: a continued store's adapter answers every
native request with unknown. A build/repair/check detail is a one-line JSON receipt
with `actor` and useful branch/worktree/native-action references. A checker cannot
be any builder/repairer of that phase, replacements included.

A worker that went idle is replaced, not relaunched: stop it, record
`resume {"actor":"<replacement>",...}` for the in-flight step, then start the
replacement on the pushed branch. The handoff is fenced like any record (current
block, no wait, pending action or lease), a replacement checker must be independent
of every builder, and failure/repair counts do not change. `next` then shows the
replacement's receipt, and PASS comes from the latest checker.

`landed {"mergeSha":"<40-hex merge commit>"}` is recorded as soon as the merge is
observed, and the checker starts on that immutable SHA. PASS is the latest checker's
JSON receipt: its `mergeSha` is the one the phase landed, and its `mergeChecks` says
every required check on that exact merge SHA is green; the checker waits for them
before recording PASS. When main cancelled that SHA's run as superseded, the checker pushes a
`claude/check-<sha7>` branch at the merge SHA and dispatches `ci.yml` on it once (an empty
`diff_base` runs the full suite; a second dispatch on that branch cancels the first); that run stands in, never a later main run, which would test
other landings too. A plan may let a failing spec its own rule
shows the phase did not cause be named with its issue and that evidence instead
(production-page decision 18):

```json
{
  "actor": "independent-checker-id",
  "findings": "findings carried forward",
  "mergeSha": "<the landed merge SHA>",
  "mergeChecks": "every required check on <merge SHA> green: <checks link>",
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
keep `product:`/`blocked:` details: one repair, or one more check. An
infrastructure or capacity outage during a step is not a failure: the step stays in
flight under a `wait`, then `clear-wait` and resume it, spending no budget.

A second failure is diagnosed, not an automatic owner stop (owner decision
2026-10-20): `next` answers `diagnose`. One fresh agent, independent of every
builder, repairer and checker of the phase, records
`diagnose {"actor":"<decider>","decision":"repair"|"check"|"stop","reason":"..."}`.
`repair` (after product failures) buys one last scoped repair, whose launch carries
the reason; `check` (after blocked checks) one more check once the prerequisite
recovered; `stop` stops for the owner with the reason. A phase is diagnosed once: any
failure after the diagnosed repair or check, product or blocked, is a real `stop`.
Counts never go down; the owner's `answered` to a phase out of attempts grants
exactly one more, and a failure after that stops it again.
Record acceptance only after observing it. A ledger receipt cannot prove the
truth of supplied evidence or qualify a provider by itself.

## Pause, restart and recovery boundaries

- `pause` stops new phase admission immediately. `wait` also records the blocked
  prerequisite; clear it with explicit resolution evidence before another block.
- The in-flight worker checkpoints: ask it in its native session to acknowledge its
  exact phase, step and block. (A store with its original adapter may still ask
  through `tick`, which accepts only `state: "checkpointed"` with matching
  `blockId`, `phase`, `step` and `evidence`.) No new worker is launched. A new
  block does not wait for it: the step stays in flight in the ledger, so `next`
  says wait, never relaunch.
- At block end keep-awake and block wakes stop. A stale active header does not
  extend the block. Resume uses the same identity/deadline and a new block receipt.
- Preserve unresolved external intents. An absent local record or empty provider
  listing does not establish non-delivery. Reconcile original action ID/hash and
  native receipt before replay; never delete pending state to get past a refusal.
- Owner cancellation is terminal. Expiry refuses work even if a phase is in
  flight. Completion is distinct and requires every required phase PASS.
- A mismatched wave/control digest fails closed. A transition whose checkpoint
  publication fails restores the wave file with the SQLite rollback, so a retry
  works. A push GitHub accepted after the network failed is this store's own next
  checkpoint (same restoration generation, parented on its head): the next
  operation adopts its state and merges its ledger with lines written locally since
  (a conflict is refused) instead of reading it as superseded. An interrupted `.admission` lock also stays refused;
  inspect its owner-pid and records before removing a proven abandoned local lock.
No scheduling acknowledgement changes these boundaries. Nothing wakes a stopped
coordinator by itself, except a plan's own check-in (production-page spec §9) until the run is
paused: the owner continues the project by typing the line again.

## Continuing in any session

The recovery branch, `claude/noacg-recovery/<id>`, is the project's shared state:
a branch because that is the namespace a Claude cloud session can push (pushes to
`refs/noacg-recovery/*` were dropped, `cloud-recovery-probe-2026-10-20.md`). Each
checkpoint commit holds only `checkpoint.json`, the wave ledger as its own blob
`ledger.md`, and a `vercel.json` that turns Vercel deployments off, so no preview is
built and no workflow runs. `checkpoint.json` (at most 256 KiB) names the ledger's
sha256, and a reader refuses a ledger that differs; the ledger may grow to 8 MiB.
Older checkpoints with the ledger inline are still read. A publication
is a `--force-with-lease` push of a commit on top of the previous checkpoint, so a
stale host is refused. Worktree cleanup never deletes these branches, and wave-tick,
merge-order and the jobs view do not list them as unlanded work. In any session,
cloud or laptop, the same `/plan-run` line first runs, from a checkout of this
repository:

    node scripts/run-supervisor.mjs continue <state-root> <plan> <owner>

It finds the plan's active project (`plan-<plan>-*`), restores its latest checkpoint
into a fresh directory under `<state-root>` (on Windows keep it short, e.g.
`C:\noacg-state`: it holds a full checkout), opens a new block (at most 24 hours,
never past the original deadline) and prints `db`, `wave`, `block` and `next`. Save
`block` as the authority receipt and carry on from `next`; failures, repair counts
and in-flight steps carry over. `open` means no project is active: open one.
`blocked` means this session now owns the project but its recorded wait must be
resolved (`clear-wait`) before `start-block`.

A Claude cloud session continued a disposable project this way on 2026-10-20
(`cloud-checkpoint-branch-2026-10-20.md`).

The previous coordinator needs nothing. Its next `record`, `next` or `tick` answers
`superseded: another coordinator continued this project; stop` and launches nothing.

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
