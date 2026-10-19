# Editor keys gate investigation — 2026-10-19

Separate repair owner: the active `/root/editor_keys_gate_repair` Codex session.
The owner authorized investigation and gate repair separately from independent
Phase 2 acceptance. Start: 16:09:36 UTC (19:09:36 Kyiv); implementation ends
18:09:36 UTC (21:09:36 Kyiv). No durable wake is claimed. This session owns its
work through terminal landing checks if a repair is proved and queued.

Initial source: `86e795dc9f66183633d7c99a73bea8c27e4e32f6`, fetched
`origin/main`. Own branch `codex/repair-editor-keys-gate`, worktree
`/workspace/NoaCG-Studio-editor-keys-gate`. The activity helper reports nothing else in this checkout; local `main` is
absent, so it is supplemented by `git worktree list --porcelain`
and `git diff --name-only origin/main <branch>` identify the separate account
repair and independent receipt branches. Their paths remain untouched.
Shared product store/router/saved-data/preferences/CSS/editor/save files remain
reserved. No Phase 2 acceptance, Step 6 or Phase 3 work is authorized here.

## Original failure

Original main CI [39259495974](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39259495974),
source `901116aab4a9f19843631940cf4596b2595c9f1e`, attempt 1, failed.
Whole failed shard job `118087214783` was fetched and read: 124 passed,
1 failed. `e2e/editor-keys.spec.ts:161:1`, “nested SVG armed parent-coordinate
drag and explicit base offset preserve motion”, fails after the drag at
`:177:162`, via `ready` at `:23:49`: `.ef-stage-error` expected 0, received 1
for the unchanged 7000 ms assertion budget. The screenshot was opened and shows
“Wait for the preview to reach this playhead and revision before editing.”
The trace confirms ruler click, request-change wait, pending-false/zero-error
checks, selection/artboard measurements, mouse down/move/up, then the refusal.
The same-commit retry job `118092999541` passed 14/14. It does not clear the
original failure. Automated quarantine #1513 is classification, not a repair.

Failure artifact `test-results-7`, id `12189853796`, SHA256
`dc76f062589d11a16f1d4a451424986dd21d05c96199fe62558accdf6ba69b60`.
Local original: `/workspace/attachments/f05a91d3-e82b-4147-bf77-b45ac742c55f/editor-keys-original-failure.zip`.

## Scope and resource limits

Read root/e2e AGENTS, scoped rules, `/check`, verification, cloud-delegate,
queue-merge, #1466, #1487 corrected receipts, #1509 fault receipt and #800 cleanup
comments. Network preflight passes Git and Actions API reads. Executing worker
reports four CPUs, 16 GiB machine memory and two browser workers. Hidden cgroup
ancestors are unreadable, so machine totals stand in for unobserved limits.
All browser commands use the existing queue, named selection and five-minute cap.
No full suite or build runs locally; no budgets, retries or limits change.

## Reproduction investigation

Every local command below is exactly:

```sh
node scripts/jobs.mjs add "npm run test:e2e -- e2e/editor-keys.spec.ts --grep 'nested SVG armed' --retries=0" --cap 5
```

- `j-0001`: unchanged source, 1 passed, 8.9 seconds wall. This does not resolve the
  original failure or establish its cause.
- `j-0002`: disposable test-only message scheduling probe, 1 passed, 7.7 seconds.
  It held an actual zero-time preview pose and released it on ruler pointerdown;
  the intended exact numeric `time === 1` current-pose delay did not reproduce
  the refusal. This is an unsuccessful fault probe, not passing fix evidence.
- `j-0003`: same probe with a tolerance around one second, 1 passed, 7.5 seconds.
  No matching failure; no repair proof.
- `j-0004`: broadened positive-time delay to four seconds and diagnostics,
  1 passed, 8.1 seconds. It prints `FAULT_CAUGHT_ZERO` and
  `FAULT_AFTER_SEEK 1`; the intended current-pose delivery hold did not hold the
  tested window. Again, no matching failure or repair proof.

After these three fault-probe attempts, the scheduling strategy was stopped
under verification's three-attempt rule. All temporary test instrumentation was
removed; the maintained spec is byte-identical to initial source. No product
source, test name/gesture/assertion, skip, quarantine entry or budget was edited.

The unchanged spec SHA256 is
`4c946a7ddd997e00a9fde680813ad7441d5b4d826f1795835f7aae2fecd45929`.
All 14 cases remain: 12 declarations, one expanded across three viewport widths.
[Exact temporary hook recipes and limitations](fault-probes.md) and
[machine-readable source/job facts](facts.json) retain the unsuccessful attempts.

Static candidate: `ready` observes source pending/error but not the correlated
rendered receipt. `seek` treats any changed `data-request` as the requested pose;
`PreviewController.receive` can publish a preceding pose while another seek is
queued, and `requireCurrentPose` rejects mismatched time/cue/revision on pointer
down. This is a candidate path only: the attempted fault did not establish the
original root cause. #1509's proven cancellation race is separate evidence and
is not assumed to prove this case.

**Blocked investigation; no repair claimed.** Original failure and normal gate
restoration remain unresolved. The independent checker remains paused for an
owner decision. A passing retry or quarantine is not authorization to bypass it.


## Proposed next owner decision (historical; authorized below)

Authorize one additional bounded **observational diagnostic round**, not a repair
or gate release. Run the same single nested-SVG target once through the existing
queue, cap five minutes, zero retries, in this own worktree. Keep every existing
case/title/gesture/assertion and all budgets unchanged. Temporary test-only
instrumentation would import `foundationDiagnostics` from `Canvas.tsx` and
`activeEditorSession` from `documentAdapter.ts` before the ruler interaction.
A capture listener would record every actual preview reply's source identity,
document id, generation, request id, source/assets revision and selected part's
appearance time/cue/revision. A capture listener at the **exact canvas pointerdown**
would synchronously record the live session version/view, controller
`receipt(session.version(), session.port.view())`, DOM pending/request/pose stamps,
selection and the most recent correlated actual reply. Do not change a reply,
delay it or replace a timer in this observational round.

This resolves the missing fact: whether the refusal is time, cue or revision
mismatch, and whether a stale intermediate reply supplied the request change.
If it does not reproduce the original refusal, its result remains diagnostic,
not a passing repair. The envelope timeline would guide a separately reviewed
matching scheduling fault rather than assuming #1509's cancellation race.
No reserved product-file commit is proposed. If establishing or repairing the
cause requires changes in the reserved editor/store/save source, stop with the
concrete required path/change for a separate owner disposition. No automatic
fourth fault attempt, repair or quarantine release occurs under this receipt.


## Receipt review and verification

Review ran inline against the three documentation paths printed by
`node scripts/review-request.mjs --json`, merge base
`86e795dc9f66183633d7c99a73bea8c27e4e32f6`. It checked the original whole-job
failure, artifact hash, queue records, exact temporary hooks, final spec bytes,
three-attempt stop and lack of any claimed fix. No receipt finding remains.
Simplification ran inline; no further restructuring was needed.
`npm run gates -- run --changed origin/main` passed all five reached cheap gates:
contract freshness/citations, docs index, client secrets and copy.
`git diff --check` passed. No local full suite/build ran. These are documentation
checks; repair verification is **not passed**, and no passing repair stamp or
queue admission is claimed. This branch is pushed only to make the blocked
investigation retrievable; it is not submitted for landing.


## Owner-authorized single observational round — 16:51 UTC

The owner explicitly authorized **one observational targeted run only**, with no
injected delay/mutation, product-file change, gate reclassification, further
fault probe or repair. The original 18:09:36 UTC implementation end is unchanged.
Runtime context and activity/reservations were rechecked at 16:51:11 UTC.
`origin/main` was fetched at
`929d1f1f1137297e8763745f5217b48ee0370e6c` (#1515, separate account gate repair).
The own branch reconciled that main as
`c3904ed4623bdeceac432153869e12ef0c9c5b96` before the observational patch.
Product `src` bytes remained identical to initial `86e795dc9`; only the account
spec/quarantine entry and other landed documentation changed on main.

The exact temporary [observational patch](observation-hook.md) has SHA256
`d967b50438b914913416252a487ff97903b01058e9670740a9ebf29ef6e0723c`.
It adds passive message/pointer listeners after setup and before the nested SVG
fixture. It reads the existing diagnostic controller/session, actual reply
metadata and DOM stamps. It calls no source/store setter, changes no reply,
blocks no event, injects no timer/delay and adds no readiness wait. A `finally`
collects observations even if an existing assertion fails, then removes the
listeners. Original test statements, gestures and assertions remain.

Exact command:

```sh
node scripts/jobs.mjs add "npm run test:e2e -- e2e/editor-keys.spec.ts --grep 'nested SVG armed' --retries=0" --cap 5
```

Queue `j-0005`: start **16:52:25.838 UTC**, finish **16:52:37.563 UTC**,
state done, exit 0, retry count 0. Playwright reports **1 passed**, 4.3 seconds
test time, 10.6 seconds wall, one worker; no failures/skips/flakes/retries.
The executor selector still permits two workers from four CPUs/16 GiB machine
totals, with unreadable cgroup ancestors. The named affected plan selects exactly
`editor-keys.spec.ts`; cap remains five minutes. No other runtime run followed.
Local exact log:
`/workspace/NoaCG-Studio/.git/noacg-jobs/logs/j-0005.log`.
[Direct events and exact job/source facts](observation.json) retain all 23 events,
including actual replies from the current and replaced frames and both pointer
boundaries.

At pointerdown, epoch time `1792428756130.5999` milliseconds:

- Controller receipt is **ready**, request **11**, generation **4**, revision
  **source 5 / assets 1**, time **1**, cue **null**.
- Live session view is time **1**, cue **null**, selection **#nested** and the
  same source/assets revision.
- DOM pending is **false**, request **11**, generation **4**, pose time **1**,
  pose cue **arriving** (the DOM spelling for unspecified cue).
- Actual request-11 reply carried #nested at time **1**, cue null, revision
  source 5 / assets 1. It was observed about 135 ms before pointerdown.

No mismatched pointerdown or original refusal was observed. Pointerup has a
pending receipt while the gesture's transient draft is still active; that alone
is not the original refusal. This passing observation proves no original cause
and clears no gate.

### Correcting the listener label and prior probe limits

The raw event label `reply-before-handler` is retained verbatim. It is **not a
valid claim that the observer ran before the controller**. At the event carrying
request 11, `foundationDiagnostics().receipt(...)` is already ready at request
11 while DOM stamps still show request 10 / pose 0. Requests 8 and 10 similarly
already appear in controller receipts when the observer runs. Therefore the
controller had processed those replies before this observer captured its state.
The observer is installed after setup; the controller installs its own window
message listener in its constructor. A capture option did not establish the
intended ordering in this actual runtime.

The three earlier failed probes also installed their listeners after setup.
This new evidence offers a concrete explanation for their ineffectual message
hold, but they did not log ordering, so it does not retrospectively prove each
probe's complete event sequence. It explains a faulty control strategy; it does
not establish the cause of original CI 39259495974's refusal.

### Removed instrumentation and unchanged gate

After this one run, `e2e/editor-keys.spec.ts` was restored from the reviewed
source. Its SHA256 is again
`4c946a7ddd997e00a9fde680813ad7441d5b4d826f1795835f7aae2fecd45929`.
`git diff --exit-code -- e2e/editor-keys.spec.ts` and
`git diff --exit-code origin/main -- src e2e` both exit 0. All 14 existing cases
remain unchanged. The machine queue reports no running/waiting job or browser
holder. No gate/classification change, repair, PR, landing or Phase 2 acceptance
is claimed. Runtime work is stopped.

### Next concrete owner disposition

If further investigation is desired, authorize **one matching-window fault
probe only**, through the same named target/queue cap 5/zero retries. Move the
test-only message listener into `page.addInitScript` on the top-level document,
registered before the application/controller exists; do not clear localStorage.
Arm it only for the nested SVG journey. Establish from request ids and receipt
state that an actual zero-time reply is stopped **before** the controller
consumes it; release that actual reply after the real ruler pointerdown, and
hold the actual latest one-second reply briefly. Keep every original gesture
and assertion. The required outcome is the original `.ef-stage-error` expected
0/received 1 failure and exact refusal text after the drag, with an observed
mismatched time/cue/revision at pointerdown. A different failure or ineffective
hold is a failed probe, not proof.

This would change only temporary test instrumentation; **no reserved product
file or maintained test change is proposed**. It is not authorized by the
observational round and has not run. Stop after that one probe and report its
outcome for a separate concrete repair decision. A correlated-readiness repair
is not justified until the matching failure has actually been established.

Receipt continuation review ran inline over the same five documentation paths
printed by `review-request.mjs`, now at merge base `929d1f1f1137297e8763745f5217b48ee0370e6c`.
It cross-checked raw events, the literal-label correction, job timestamps,
temporary diff hash, removed-instrumentation proof and the explicit no-repair
verdict. Simplification ran inline; no additional change remained. All five
reached cheap gates and `git diff --check` passed again for the new receipt
content. These passing documentation checks do not constitute passing repair
verification or authorize a gate release.
