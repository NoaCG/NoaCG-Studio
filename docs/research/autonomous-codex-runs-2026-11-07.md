# Autonomous planned runs in Codex

Revised 7 November 2026 using the owner's independent second opinion and the full original proposal. Source inspection remains pinned to repository `fee8818c9fb20317548c1213538b07bab41b4c7b`; cited follow-up comments were read again for this revision. This is planning only. The proposed implementation files and workflows are unchanged.

## Verdict

Keep the working runner and give Codex its own small execution procedures and briefs. Share authorization, phase admission, the ledger, recovery storage, verification and merge-queue contracts. Preserve Claude's procedures, templates, defaults and current run ownership.

Deliver useful work through an explicitly bounded **active-session route** first. Qualify **unattended continuation** separately through one meaningful recovery drill, then accumulate longer-running evidence during useful delivery. There is no mandatory 72-hour, seven-day or fourteen-day qualification programme before the first useful change.

The original proposal correctly retained the existing infrastructure and identified portability and recovery gaps. It put too much work behind native recovery qualification, left the active-session fallback implicit, and proposed wider shared-template changes than necessary. This revision replaces its P0–P8 sequence with six smaller steps.

## Two operational promises

| Promise | What Codex can claim after qualification | Boundary |
| --- | --- | --- |
| Active-session execution | Fresh builders and independent checkers deliver authorized work while the coordinator remains active through merge, acceptance and required post-landing results. | The session retains repair responsibility. Ending a turn, registering a timer or keeping a process alive does not establish recovery after interruption. |
| Unattended continuation | A supported wake resumes the coding session, or a supported replacement reconstructs and reconciles the same run, without an owner restart. | Qualify each supported interruption class. An idle wake does not establish machine-loss recovery, and restored files do not establish native worker reconciliation. |

Fresh same-machine contexts can satisfy review independence when they have separate conversations, owned worktrees and enough resources. Start serially; allocate separate ports, service instances and test accounts where needed. Separate cloud machines are required only when the selected run's actual authorization or environment contract requires them. Preserve that requirement for existing runs rather than silently changing their topology.

The current [queue-merge procedure](../../.agent-workflows/queue-merge.md) expressly permits the current cloud session to remain the repair owner through merge and post-land results when no durable wake is proven. Current plan-create/plan-run instructions, however, require wake qualification before creating runtime state. A future Codex-specific procedure must explicitly define the bounded active-session mode for newly authorized Codex runs. It must not quietly reinterpret the shared procedure or mark [#1301](https://github.com/NoaCG/NoaCG-Studio/issues/1301)'s stricter recovery criteria passed.

Record the selected mode and finite work window in the existing kit and launch receipt. Reuse still-applicable owner decisions. Neither selecting active mode nor restarting grants new scope, attempts, provider permission or an extension. If a session is interrupted, treat outstanding work as unresolved until reconciled. An explicit owner pause still requires explicit resume.

## Lessons from the completed runs

| Run | Evidence | Consequence for this proposal |
| --- | --- | --- |
| Production page, [#1553](https://github.com/NoaCG/NoaCG-Studio/issues/1553) | The [retrospective](https://github.com/NoaCG/NoaCG-Studio/issues/1553#issuecomment-6496870487) reports 50 cloud phases in about eight days and eight product FAILs found by independent checkers. The [6 November owner closure](https://github.com/NoaCG/NoaCG-Studio/issues/1553#issuecomment-6686105172) retains hardware limitations and unrecorded formal completion/reconciliation. | Keep fresh independent acceptance. Honor owner closure without reopening the run to fill historical paperwork or calling it a full technical PASS. |
| Jev SVG import, [#1850](https://github.com/NoaCG/NoaCG-Studio/issues/1850) | All 40 phases completed. The [release kit](../work-specs/jev-svg-import/evidence/phase-40.md) records a rejected model route, useful deterministic import and $0.045931275 paid inference against a $5 ceiling. | A valid autonomous decision can be no-go. Do not activate the rejected route, reuse the exhausted holdout for qualification or equate inference spend with coding-agent cost. |
| CI/CD improvement, [#1842](https://github.com/NoaCG/NoaCG-Studio/issues/1842) | All 18 phases passed, but [CI17](../work-specs/cicd-improvement/evidence/phase-ci17.md) reports only one of eight initial criteria met, one not met and six pending. | The accurate final report is a legitimate terminal outcome. Missing goals do not authorize indefinite follow-up. Preserve separately required observation periods, including the CI selection audit. |
| Editor | Repeated independent Save/leave checks found missing state rules. A later [scoped closure](../work-specs/editor-leave-reliability/scoped-closure/README.md) deliberately accepted bounded single-device behavior and deferred historical diagnosis. | Resolve current decisions before resuming. Continue one useful authorized journey rather than reopening a closed conflict campaign. |

An apparent ordering violation in [#1934](https://github.com/NoaCG/NoaCG-Studio/issues/1934) was [withdrawn](https://github.com/NoaCG/NoaCG-Studio/issues/1934#issuecomment-6564847774) after daylight-saving timestamp reconciliation. All 26 judged successors started after predecessor acceptance. There is no demonstrated admission-order failure in that sample.

Two CI17 follow-ups are already resolved and must not become repeated owner questions:

- [#1951's delivery receipt](https://github.com/NoaCG/NoaCG-Studio/issues/1951#issuecomment-6589066068) records the acknowledged owner-alarm route. GitHub assignment did not notify the owner, and a scheduled-task email attempt was dropped. A Claude “Owner alarms (daily)” session surfaced the alarm and the owner confirmed seeing it. Assignment remains bookkeeping, not delivery proof. Reuse the acknowledged route after checking its current status; its recorded daily cadence is not an immediate-notification guarantee.
- [#1895's completion receipt](https://github.com/NoaCG/NoaCG-Studio/issues/1895#issuecomment-6640597131) records critical journeys on every product change, implemented by cf12/#2037. The set became 12 specs. Do not repeat the original critical-test decision from CI17.

The production retrospective's cost ranges are self-reported; the CI co-run lacked a matched throughput comparison. These records support the workflow design without establishing Codex cost savings or a parallel-throughput target.

## Keep the infrastructure already implemented

The current [plan-create](../../.agents/skills/plan-create/SKILL.md) and [plan-run](../../.agents/skills/plan-run/SKILL.md) skills point to shared procedures. Their runner already provides durable kits and briefs, rendered heartbeats, adaptive check-ins, owner phases, bounded block renewal, stable phase IDs and consolidated traps. Retain those mechanisms.

The existing wave ledger is execution authority, `work.json` is acceptance evidence and the issue heartbeat is a view. Show three distinct facts using these records: **execution status**, **overall acceptance verdict** and **owner disposition**. A separate acceptance ledger or lifecycle service is unnecessary.

Keep normal targeted worker checks and authoritative Actions checks, source and merge pinning, fresh independent reviews, exactly one acknowledged PR repair owner, the existing retry/diagnosis limits and the merge queue. Neither a green workflow summary with flaky tests nor a later same-commit pass erases the first failure.

Preserve `claude/noacg-recovery/` if Codex can use it. Its name reflects an actual Claude push restriction, not a naming mistake. Qualify Codex access rather than cosmetically renaming refs or migrating checkpoints. A branch in this public repository is not private storage.

## Separate the harness procedures narrowly

Add Codex-only instructions for worker launch/status/follow-up/result collection, fresh checker contexts, absolute worktree paths, landing authority and the two execution modes. Keep the same user-facing `$plan-create` and `$plan-run` entry points. Claude's commands continue to use their current canonical files unchanged.

Use references beneath the two existing Codex skill directories. This avoids adding more top-level workflows that the current discovery guard would expect to have both Claude and Codex adapters. Keep wrappers thin and point them at the explicit Codex references.

`check-shared-instructions.mjs` currently requires both harnesses to name the same canonical procedure. Add an explicit mapping for **only plan-create and plan-run** to permit their Codex references. Continue validating the mapped files, wrapper size, script references and shared critical contracts. Reject missing or stale mappings and arbitrary alternate targets. Keep the default shared mapping for every other workflow.

Use the existing kit's tailored-template mechanism. Store four Codex brief templates in the Codex plan-run references and copy them into a newly created Codex kit's `templates/` directory. Leave `docs/plan-runs/templates/` and Claude defaults byte-identical. Generalize template fields or template loading only if the first implementation demonstrates a real need.

The checker template currently hardcodes `claude/check-*` and `.claude/worktrees/*`; `state.branchPrefix = codex` cannot replace those literals. Codex briefs should provide their actual owned branch/path and selected runtime's browser instructions. Link shared invariant and verification rules instead of duplicating them. Do not copy dated Claude browser-image assumptions into Codex instructions.

## The missing launch and re-entry handling

This is the main implementation gap to close before automatic recovery can safely re-dispatch plan work:

- In `run-supervisor.mjs`, `tickRun` returns before its delivery handling for a continuing project; phases use `record`/`next`.
- `continueProject` restores with an adapter that returns `unknown`.
- Therefore the durable pending-request machinery in the other delivery path does not automatically protect worker launches issued directly by a plan coordinator.

Extend the **existing continuing-plan path**, without routing projects into the unrelated tick loop or inventing a universal provider API. Before a launch, persist the exact brief/request bytes or their existing saved-file reference and hash, full source SHA, stable action identity, phase/step and current authority. Use the existing ledger event and kit's `state.json`/`inFlight` data, published through the existing checkpoint mechanism. Define an opt-in Codex record shape; existing Claude records remain valid.

The intent must be durably published before dispatch. If publication acknowledgement is uncertain, reconcile the existing checkpoint; do not dispatch speculatively. After native acceptance, publish the returned worker identity. Retain the original intent on timeout, missing response or missing status. Before any replacement, inspect the original worker, branch, PR, queue and Actions state. Unknown remains unresolved; safe stopping is acceptable, duplicate execution is not. Do not clear the intent merely because a local process or partial inventory is absent.

Preserve the distinction between intent and launched work. A recorded build intent cannot prove a worker started. Store acceptance and replacement receipts without resetting phase or repair counters. The first implementation needs one narrow way to persist and reconcile these plan-launch facts, with focused tests, not a general command/event abstraction.

On re-entry, explicitly reconcile and update the kit's current coordinator session and return destination. Preserve the original authorization and unresolved intents. Transfer a PR's acknowledged repair ownership through its existing owner comment when needed, and disable any old wake as the queue procedure requires.

Git checkpoint compare-and-swap prevents stale publication. It cannot stop an old native worker or an external stamp. Require native stop acknowledgement or authoritative reconciliation before replacement, and verify current authority before external actions. When that cannot be established, stop the replacement rather than claim distributed fencing.

## Landing and renewal need actual role evidence

A worker/coordinator split is useful but does not guarantee permission to approve. The later [Jev follow-up report](https://github.com/NoaCG/NoaCG-Studio/issues/1850#issuecomment-6665906088) records self-approval refusals for both workers and coordinator. Some changes landed; four required the owner to queue them. This is a demonstrated limitation of that wave, not proof that every Codex landing will fail.

Prove the first Codex landing with the actual intended roles. Required reviews/tests must be complete on the exact head, the coordinator must be permitted to use the normal stamp/auto-merge route, and the queue must land the change. A moved head needs fresh evidence. Different actor labels alone do not establish independent approval. On a policy refusal, preserve it and report the specific permission boundary; do not bypass it by changing actor names or trying another stamping route. The plan is not qualified for autonomous landing until this succeeds.

There is also a static renewal mismatch: `plan-kit.checkin` can return the exact block deadline, while `rearmNative` rejects a next wake at or beyond it. It is not a demonstrated outage of the completed runs. Define one Codex transition: a check-in admitted inside the current block checkpoints at its end, then renews only under existing standing permission and current pause/cancel checks; replacement work receives the new block's authority. If the native route cannot retain control across that boundary, it needs a supported renewal wake before unattended mode can qualify. No worker receives authority beyond its own block. Change shared code only where the focused test shows it is necessary, preserving fixed-deadline and Claude behavior.

Honor the scheduler's actual frequency. The inspected automation interface supports at most hourly scheduling; a kit ETA or desired 30-minute idle check does not override it. Use supported completion events and bounded live waits during active execution. Record the recovery bound actually observed, without creating another scheduler or requiring perfect timing.

## Minimal ordered implementation plan

These steps are proposed work, not execution authorization. They do not transfer completed Claude runs or require clearing the existing backlog.

| Step | Smallest deliverable | Exit condition |
| --- | --- | --- |
| 1. Reconcile one selected scope | Read current main, the selected spec, launch receipt, latest owner decisions, run state and ownership. Select active or unattended mode and the actual worker topology. | One current, bounded scope and a precise next action. Completed or owner-closed runs stay closed. Reuse existing answers; ask only a genuinely missing outcome decision. |
| 2. Add Codex instructions and tailored briefs | Add the two Codex references, four briefs and narrow instruction-guard mapping. Reuse shared runner contracts. | Fresh root/nested Codex contexts load the intended guidance; Codex briefs use correct paths and roles. Claude adapters/templates/defaults are unchanged and still pass their checks. No wake is required merely to prepare or explicitly authorize active mode. |
| 3. Close the plan-launch gap | Add the opt-in intent/acceptance/reconciliation record on the current plan path and explicit re-entry steps. | Intent precedes dispatch; accepted native IDs survive restoration; uncertain launches cannot duplicate; pause, authority and consumed attempts survive; kit return destination and repair ownership reconcile. Preserve legacy checkpoint compatibility. |
| 4. Deliver one useful change | Fresh builder, required tests/reviews, actual coordinator approval, merge queue, fresh checker and terminal exact-merge/post-land evidence. | One useful accepted change, with the active coordinator retaining ownership throughout. This tests the real landing roles early. Recovery qualification is not a prerequisite for this bounded active route. |
| 5. Qualify unattended continuation | One bounded live drill at a meaningful boundary in authorized work; focused tests for other failure cases. Resolve the block-renewal boundary as part of this step. | Observe real coding wake/re-entry, reconcile the same run without duplicate work, complete acceptance, perform one authorized bounded renewal and stop all run wakes at terminal state. Record which interruption class was actually proved. |
| 6. Run one bounded editor pilot | A newly authorized import → edit → save → reopen → export journey addressing one agreed defect or missing capability. Start serially and retain single-device restrictions. | Independent browser/software acceptance and exact-merge results for that journey. Use active mode if recovery is still unqualified; use unattended mode only to the level step 5 proved. Accumulate longer-running evidence during useful authorized delivery. |

If the first useful change reveals a landing refusal, resolve that precise permission dependency before claiming autonomous landing. Do not expand step 4 into a general approval redesign. Likewise, failure of step 5 leaves active delivery available; it does not justify building a new control plane.

Days and weeks remain the intended service duration, with evidence collected as useful work proceeds. There is no obligation to keep a completed run alive, generate dummy PRs or invent more scope to fill a trial window. Required existing CI observation periods and audit-reset rules remain binding.

### Exact proposed file changes

Only the research proposal is edited by this planning revision. The following is the future implementation allocation:

| Files | Proposed change and protection |
| --- | --- |
| `.agents/skills/plan-create/SKILL.md`, `.agents/skills/plan-run/SKILL.md` | Point the thin Codex wrappers to their mapped references. Describe active and unattended modes without claiming that wake qualification has passed. Preserve skill names. |
| New `.agents/skills/plan-create/references/codex.md` | Current-scope/owner-decision lookup, explicit mode, authorization and kit creation using existing commands; install tailored Codex briefs. No new phase or acceptance store. |
| New `.agents/skills/plan-run/references/codex.md` | Serial native worker lifecycle, active-session retention, plan intent handling, actual landing authority, re-entry/return-address reconciliation, decision routing and stopping. Reference shared verification and merge contracts. |
| New `.agents/skills/plan-run/references/templates/{build,check,repair,fix}.tmpl` | Tailored Codex paths, branches and result transport. Keep fresh checkers, exact criteria, review requirements and all attempt limits. These are skill sources; kits retain their existing flat template layout. |
| `scripts/check-shared-instructions.mjs`, `scripts/check-shared-instructions.test.mjs`, `docs/AGENT_WORKFLOWS.md` | Explicit two-workflow Codex mapping and documentation. Mutation tests reject missing mappings/files, wrong wrapper targets and missing shared critical contracts; other harness mappings remain unchanged. |
| `scripts/run-supervisor.mjs`, `scripts/continuing-project.test.mjs`, `scripts/run-supervisor.test.mjs` | Small opt-in continuing-plan launch-intent/acceptance/reconciliation extension, using the ledger and kit. Prove authority/pause/attempt preservation and refusal to replay unresolved delivery. Keep existing project and non-project paths compatible. |
| `scripts/plan-kit.test.mjs`, `scripts/run-recovery.test.mjs` | Test that tailored briefs, unresolved intent, native identity and coordinator/return fields round-trip through the existing kit/checkpoint. Change `plan-kit.mjs` or `run-recovery.mjs` only if this reveals missing support; both already carry the needed kit data. |
| `scripts/native-recovery-contract.test.mjs` and existing plan-kit/continuing-project tests | A joined expiry/renewal case, owner pause, fixed deadline and uncertain delivery. Change `native-recovery-contract.mjs` or `plan-kit.mjs` only for the demonstrated boundary contract, retaining existing callers. |
| Existing cloud-execution evidence location and selected run kit/issue | Append short qualification receipts with actual native IDs, action identity, source/head, policy, landing/wake results and cleanup. Record execution, acceptance and owner disposition from existing authorities. No extra monitoring service or metrics ledger. |

Leave `.claude/**`, `.agent-workflows/plan-create.md`, `.agent-workflows/plan-run.md` and `docs/plan-runs/templates/**` unchanged in the first implementation. Preserve the shared queue, verification and authorization contracts. Any later shared behavior change needs a demonstrated requirement and its own compatibility checks; it is not implied by this proposal.

The instruction guard is a shared implementation file, so its narrow mapping is a real compatibility risk even without editing Claude files. Keep the existing guard active, test the original Claude targets and existing adapters, and add the mapped Codex checks. Do not use a broad exception or make unrecognized workflows silently pass.

## Smallest qualification and first useful pilot

**First useful change:** use the small Codex procedure/brief compatibility change itself if its reviewed scope and ownership permit, or select one contained tooling defect. One fresh builder and one independent checker are enough to exercise the roles. The active coordinator stays through every required gate, merge and post-land result. No arbitrary three-phase minimum is needed.

**Live continuation drill:** interrupt after a legitimate landing but before independent acceptance has been recorded. Before interruption, checkpoint the merge, worker identities, unresolved action and repair owner. A supported coding-session wake must restore or locate the same run, read actual GitHub/native state, avoid rebuilding the already-landed phase, launch or resume only the legitimate checker, and record its result. Perform one bounded renewal under standing permission, then demonstrate terminal wake shutdown.

The native drill must use a supported interruption mechanism. If only idle re-entry is available, call it idle-wake qualification and retain machine-loss recovery as unqualified. A manual owner restart is not an autonomous wake. A local process kill or deleted scratch directory is fixture evidence, not native recovery.

Use focused tests for uncertain delivery, stale authority, pause/cancel, missing local state and duplicate callbacks. Preserve unknown outcomes and stop safely. Do not force genuinely ambiguous provider sends if the platform cannot reconcile them; the safe refusal is the correct result. Account usage stops remain unqualified until observed or supported by an authoritative route.

**Editor pilot:** read [EDITOR_PLAN](../EDITOR_PLAN.md), the [acceptance register](editor-acceptance-register-2026-09-17.md) and the current [leave-editor disposition](../work-specs/editor-leave-reliability/README.md) before selecting one actual remaining gap. Phase 2 was accepted at `12eccdd8533ba710f0917cb3bcc78101070ecca8` under single-device scope; Step 6 is complete and historical diagnosis is deferred. This does not authorize Phase 3, qualify current main or accept concurrent authoring/physical receivers.

Choose an existing import/edit/save/reopen/export task, then name the exact missing capability or defect to address. Do not presume that the old save/cloud-status handoff is the next authorized phase. Retain one active authoring tab/device per account and serial ownership of shared editor/save files. Prepare native/hardware and usability trial items separately. Human-only evidence is not replaced by a browser receipt, and useful engineering slices need not wait for every broader editor milestone.

## Essential work and work to defer

**Essential for useful active execution:** current scope/decision reconciliation, the narrow Codex procedure/brief split, independently qualified conversations and worktrees, launch-intent handling, the actual landing-role proof, and one owner retained through terminal results.

**Essential only before claiming unattended continuation:** a supported coding wake/re-entry path, reconciliation of the original workers and PR ownership, one bounded renewal, observed terminal stop and an honest statement of the interruption classes proved.

**Conditional:** small shared kit/recovery changes if existing storage cannot carry the opt-in record; a broader failure drill only for a promise that is being made; an owner decision if a selected existing run requires separate hosting or a different provider.

**Deferred:** universal provider adapters, a new scheduler or ledger, Temporal or other hosted infrastructure, cosmetic recovery-ref changes, mandatory multi-day trials, a three-plan concurrency study, broad benchmark collection, unrelated CI cleanups, old campaign reconstruction and whole-editor acceptance. Reconsider one only when useful delivery demonstrates that the existing system cannot meet a concrete requirement.

## Demonstrated facts and unresolved hypotheses

| Finding | Evidence class | Implication |
| --- | --- | --- |
| Codex wrappers point to shared procedures; checker template retains Claude literals; instruction guard requires a shared target. | Direct source inspection. | Tailor Codex instructions/templates and narrowly extend the guard. No universal abstraction is needed. |
| Continuing projects bypass tick delivery; restored adapter answers unknown. | Direct source inspection. | Persist/reconcile actual coordinator-issued launches on the plan path. Existing fixture success does not close this integration gap. |
| Kits, brief persistence, heartbeat rendering, adaptive check-ins, stable IDs and block renewal exist. | Source and original targeted tests. | Reuse them. |
| Check-in at block expiry conflicts with native next-wake admission. | Static contract mismatch. | Write a joined test and define the transition; a completed-run outage is not established. |
| Later Jev wave reported worker and coordinator self-approval refusals. | Read-back of #1850 comment 6665906088. | Actual intended Codex roles need a real landing receipt. Their refusal is possible, not yet demonstrated for the new route. |
| Issue assignment did not notify the owner; an existing session route was acknowledged. | Read-back of #1951 comment 6589066068. | Reuse the current acknowledged route, without treating a posted issue or daily schedule as immediate delivery. |
| Codex active-session work/landing and some wakes have historical receipts; cloud inventory returned 401 on October 30/31. | Historical qualification records and #1301. | Do not repeat known denials or generalize them into a permanent platform ban. Fresh authenticated capability and exact mapping need supported evidence. |
| Current tools can report coding-thread and inherited cloud-environment metadata for automations. | Original 7 November schema/metadata inspection; the old recovery task's run/result were null and delivery unknown. | Candidate route to qualify. Scheduling acknowledgement and metadata do not prove executor delivery or machine-loss recovery. |
| Longer Codex runs will recover every interruption, use less money or achieve better throughput. | Unproved hypothesis. | Accumulate measurements during useful work and state actual gaps. |

Repository code cannot manufacture provider authentication, the intended hosted-environment mapping, native wake/restore semantics, stop acknowledgement, approval permission or notification delivery. Resolve the exact missing capability if encountered. Continue the bounded active route where supported rather than creating new infrastructure by default.

Keep the canonical owner environment binding intact; runtime instance IDs and saved configuration selectors are not interchangeable. Preserve configured models, effort, billing and permissions. Neither a denial nor a recovery gap authorizes credential substitution, provider switching or a weaker landing route.

Measure a few useful facts from existing records: accepted work, build-to-PASS/queue delay, failed/repeated work, required owner restarts, observed recovery and unresolved evidence. Record available usage without treating missing values as zero. Extend service duration only while useful authorized work remains; do not impose statistical or operational claims on a small sample.

## Revision evidence

The second reviewer inspected source `fee8818c9` and GitHub evidence but did not have the full original proposal. This revision reconciles its recommendations against that full text. Material changes are the explicit active-session route, separate Codex procedures/briefs, narrowly scoped instruction guard, continuing-plan launch handling, actual landing/notification evidence and removal of elapsed-time gates.

This revision reread the relevant runner/kit/recovery and instruction-guard source, queue ownership fallback, and comments 6589066068 (#1951), 6640597131 (#1895) and 6665906088 (#1850). Historical run findings and accepted editor scope retain their dated qualifications.

The original assessment's 52 targeted runner tests passed; they are baseline fixture evidence, not a newly qualified native route, and were not repeated for this documentation revision. The revised document passed all five affected documentation gates, its nine relative links resolve, and the diff whitespace check passed. No implementation, worker launch, run, automation, permission change or Claude workflow modification is part of this revision.
