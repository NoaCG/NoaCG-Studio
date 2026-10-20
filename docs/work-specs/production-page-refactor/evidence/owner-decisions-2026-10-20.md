# Owner decisions and plan fixes, 2026-10-20

Planning only. Reconciled against main `331a98a91`. No product code, run opening or acceptance.

**Guiding principle (owner, 2026-10-20):** the owner cares about the outcome and the goal, not
rules for their own sake. Every rule, limit and gate is read for its purpose. Where wording would
block the goal without serving its purpose, the plan follows the purpose and the pull request
says why. Invariants stay binding: land only through `/queue-merge`; only the merge queue writes
`main`.

## Decisions and where they live

| | Decision | Changed |
| --- | --- | --- |
| A | No owner thumbs-up gates. Phase PASS uses only criteria an agent verifies (cloud worker, GitHub Actions). Owner-only items go on a running owner list with a phone notification and never block the next phase. | parent §8-§10, extensions table (gating column), every child's phase table |
| B | One cloud coordinator for the whole project. Owner-local checks (Windows speed, CasparCG/Bridge, OBS/browser source) run in laptop sessions whenever the laptop is on, on exact landed revisions, and never gate. A regression they find becomes a repair. Phase 2 no longer waits for phase 1's baselines. | parent §6-§10, AC-1, AC-9; runner PR (below) |
| C | The final owner block, H0.2 (physical deck and the operator's buttons) then S (real studio), is the only part that waits for the owner. | extensions table rows 46-47; H0, E3, E6, E7, E8, parent AC-14 |
| D | Human trials are trial kits, not gates (Q students, H0 new operator, E6 unfamiliar operator, E8 five newcomers, phase 14 trial). Findings become issues. | data AC-14, sheet AC-12, audience AC-7, H0 AC-1, E6 AC-4, E8 AC-3 |
| E | Q is agent-run with the owner's access (verified 2026-10-20) and each record gates only its phase: Sheet records C1b, tick cost C2, YouTube C3, feeds C4. Twitch and trial-paste are non-blocking. | data-sources Q, matrix, readiness; audience AC-9 |
| F | All features stay. E3 AC-4 (independent controller) is backlog issue [#1531](https://github.com/NoaCG/NoaCG-Studio/issues/1531). The external replay provider becomes our own authenticated replay server, run beside the trusted agent (no Vercel function). | E3, E4, E7, E8, extensions |
| G | E4's source route gets its own planned ingress limits; E8's endurance fixture shrinks to 1,000 records. Limits may change when the goal needs it, reviewed with the reason recorded; a repair still never hides a failure by loosening a check. | E4 "Ingress limits", E8 envelope |
| H | C2's tick reuses the existing Production `CRON_SECRET` (checked exactly as `api/render/cleanup.ts`), ships behind a fail-closed switch, is measured for an hour and turned on by the agent only within Pro's included usage, with a daily budget watch. `maxDuration` is set in `vercel.json`. | data-sources C2, readiness |

## Review fixes

| # | Fix | Where |
| --- | --- | --- |
| 1 | C0 operator insert RPC on the control slug without viewer caps (100 items per call), reused by C3; fence widened to the Messages label lines and `setFieldBinding(s)`; vote boards stay excluded; local inbox persistence reverses `localAudience.ts`'s decision | data-sources C0, C3; audience "Persistence" |
| 2 | One shared evaluator `src/control/sourceMapping.ts` for typed JSON, recipes and keyed selectors, used by the browser reader, the server tick and the source route; results go through the existing apply path as strings and lists; SQL keeps legacy bindings; E1 has its own typed envelope; E4.2 migration with version gate, fixtures and rollback | E4, E5, E7, E1 |
| 3 | E1.1 and E7.1 land the read-only gate; the writers land in a later deploy (E1.2a, E7.2a); output readers obey Chromium 71 like `payloadVersion.ts` | E1, E7 |
| 4 | `.github/workflows/endurance.yml`, manual dispatch, 90-minute timeout, not a required check; lands before the run opens so no phase lands a workflow file | E4, E8, parent §9.2 |
| 5 | Foreign Companion actions move from E8.1 into E6; E6.1 follows E1.1's type model and runs after it; E6.2 after E3.2; one protocol bump, one deck requalification (H0.2) | E6, E8, extensions |
| 6 | C1 → C1a/C1b/C1c; E1.2, E3.2, E7.2, E8.1 → a/b; counts updated | data-sources, E1, E3, E7, E8, extensions |
| 7 | C4's shared cache: a `feed_cache` table in Supabase, one row per address, with a short claim so one instance fetches | data-sources C4 |
| 8 | E4 AC-1's installed-agent part in E4.2; authenticated Read sample through the trusted agent; "created by phase 2+7"; E1.1 subset enumerated; registration is C2's lease | E4, E5, E1 |
| 9 | YouTube quota: live chat at 5 s spends the 10,000-unit day in about 2.8 hours; Q and C7 budgets; remaining runtime in the UI | audience, data-sources Q/C3/C7 |
| 10 | Stale facts refreshed: §5.3 (minTests 104, five allowed skips, empty quarantine, `skipOldEditor` gone, `rundown-timing-recovery` configured); the C1/sheet `skipOldEditor` clause; DEPLOYMENT.md and the Pro plan's function text (12 of 13); cron readiness closed | parent §5.3, data-sources, sheet, DEPLOYMENT.md, VERCEL_PRO_NO_OVERAGE_PLAN.md |
| 11 | Preflight accepts the last real deploy-verify pass when main's head deploy was skipped; stale PR #1450 closed | parent §9; PR #1450 closed 2026-10-20 |
| 12 | Prerequisites table | parent §9 |

## Owner additions, same day

| # | Addition | Where |
| --- | --- | --- |
| 13 | Free stop and continue: the same project continues in any new session, cloud or laptop, by typing the same `/plan-run` line; the old restrictions go; the newest coordinator takes over and an older one still alive stops by itself; tested once before the run opens | runner PR; parent §9, §10 step 6 |
| 14 | The coordinator never sits idle while it waits: it waits inside a running background job or monitor | parent §9 "Never idle"; runner PR procedure text |
| 15 | Laptop helper session beside the cloud coordinator: never changes the run; runs the local checks on landed revisions that lack receipts; lands receipts; opens an issue on a regression; the repository is the channel; direct messages only as a nudge; first task is a non-blocking channel test | parent §9.1, §10 step 4 |
| 16 | Speed and stalls: no CI timeout changes (only the new endurance workflow gets 90 minutes); existing bounded waits plus one progress check that catches a worker with no progress for about 30 minutes and restarts or repairs it | parent §9 "Silent workers", "Speed"; runner PR |
| 18 | The run is separate from the editor (owner: "two completely different things"). A failing spec counts against a phase only when the phase adds or changes it, or when it passes on main without the phase (test selection proves nothing either way); anything else is named in the checker's `mergeChecks` with its issue and never fails a phase or stops the run. Quarantined specs gate nothing. Main's CI already quarantines flakes and reverts landings that turn a green main red; a phase taken out by that revert is landed again, and any other red main is its own landing's repair owner's to fix while the phase waits at no cost, with the owner told after two hours. Fresh flakes #1532 (import-svg-behaviour, which most production page changes select) and #1533 are quarantined | parent §5.3, §8; e2e/quarantine.json; runbook and plan-run.md `mergeChecks` |

## Second opinions, same day

Two independent reviews (Argon, Astra) walked all 47 phases against the landed plan and runner.
Claims were checked against the code before acting; a few cited file names and quotes were not in
the plan, but the risks behind them were.

| # | Fix | Where |
| --- | --- | --- |
| 17 | Owner decision: a second failed check is diagnosed by one fresh deciding agent (one last scoped repair, a re-check after infrastructure clears, or a real owner decision), not an automatic stop; infrastructure failures are waits, not spent failures | parent §8; second runner PR |
| R1 | C2 gates on the local stack (tick driven with the Bearer secret, closed-browser run against it); production log, switch and cost steps are coordinator follow-ups with their own access row | data-sources C2, parent §9.2 |
| R2 | C1b gates only on its local halves (data AC-3, sheet AC-5 browser lease, sheet AC-7); published persistence, the tick's lease and closed-page Pause are C2's | extensions row 7, data-sources C1b |
| R3 | Configured specs use stubs; provider runs are cloud-worker receipts | data-sources Verification |
| R4 | The evidence-only commit covers every programme evidence folder (`':!docs/work-specs/*/evidence/**'`); phase notes move to `evidence/phase-notes.md` so no phase changes a spec digest | parent §6, "Phases" |
| R5 | H0.1 refreshes the stale hardware-panel record and measures hosted latency against staging | H0 phase table |
| R6 | Migrations follow the live-safe rules; a HELD live-path migration is waited out and post-landing re-run | extensions |
| R7 | Chromium 71: outputs are protected by Vite's `es2017` target, not source syntax | extensions, E1, E7 |
| R8 | A narrowed AC in the gating column is the phase's gate; E6.1/E6.2 and E2 AC-4 wording aligned; E1 owns the typed foreign target adapter | extensions, E6, E2, E1 |
| R9 | Bounded local selections, broad runs in Actions, one configured run per revision; the 2+7 builder pushes a mid-phase checkpoint | parent §6, "Phases" |
| R10 | The coordinator builds a Q-gated phase only once its record is on main; open quarantine PRs are agent cleanup before opening; the helper lists the recovery branch with `git ls-remote origin 'refs/heads/claude/noacg-recovery/*'` (checkpoints moved there in #1545, because a cloud session cannot push `refs/noacg-recovery/*`) | extensions, parent §9 |
| R11 | Second runner PR, landed (#1543): worker handoff identity, progress since launch, consistent publication, the diagnosis step, checking from the merge. The restart watchdog is not built: a routine-started session has no `send_message` or `list_events` (#1545's receipt), so a stopped coordinator is continued by typing the same `/plan-run` line, and the laptop helper reports a stale heartbeat, as does a missing morning summary | parent §9, §9.2, §10 step 6 |

Not taken: recombining the a/b splits (the owner asked for builder-sized phases) and a function
budget note (already stated).

## Second opinions after the runner PRs, same day

Two reviews (Claude, Astra) of `main` `1b9091537`, after #1540, #1542, #1543, #1545 and #1547.
Each claim was checked against the code before acting.

| # | Fix | Where |
| --- | --- | --- |
| R12 | Counts never go down: a diagnosis, or the owner's answer to a phase out of attempts, grants exactly one more attempt, and any failure after it, product or blocked, stops; diagnose stays `repair` after product failures and `check` after blocked ones; a coordinator resumed at a diagnosis passes preflight | #1549; parent §8 |
| R13 | Infrastructure that is down is no failure: the checker reports it unavailable and the coordinator records a wait, never `fail blocked:` | #1549 (checker brief); parent §8 |
| R14 | The progress check counts the worker session's own newest events and its pull request's merge-queue runs; a run queued over an hour is an infrastructure wait, told to the owner after two hours | #1549 |
| R15 | The preflight checks each landing operation by its own receipt (from a real landing, never a probe that could queue unfinished work), the four keys by presence, the quarantine bot by a recent pull request, other active plan projects by the remote checkpoints' status, and open quarantine pull requests by one REST call; a refused landing gets one replacement builder, then a stop; a stuck quarantine pull request never holds the run | parent §8, §9 |
| R16 | C2: month-to-date usage is read before the switch goes on, and while it cannot be read the switch stays off; a run with no recorded duration counts as 30 s; refused calls show in the month's usage; the switch holds an expiry at most 48 h ahead (a later one reads as off) that the daily watch moves forward, so a lost coordinator cannot leave the tick running, and the final report says when it turns off; the first-call proof is a recorded run | data-sources C2, matrix, cron note; parent §9.2 |
| R17 | Phase notes: every phase of the programme, a child spec's included, writes to `evidence/phase-notes.md`; the data-sources spec points there, and the builder brief keeps notes under `## Phase notes` or the file it names. §10 step 6 continues in the same cloud environment as step 3, never from a routine, with the laptop as a fallback that needs the same keys | parent §9, §10; data-sources "Phase notes"; #1549 |

## Third review round, same day

Argon's review of `main` `1b9091537`, and the automated review comments on #1548 and #1549.

| # | Fix | Where |
| --- | --- | --- |
| R18 | Test selection is no proof of cause (it has missed real coverage, #927): a failure counts against a phase whenever it passes on main without the phase | parent §8 decision 18 |
| R19 | A merge whose main run was cancelled as superseded is checked on its own SHA, by dispatching `ci.yml` on a `claude/check-<sha7>` branch, never by a later main run that tests other landings too | parent §8; runbook; plan-run.md |
| R20 | The progress check counts a branch not pushed yet from the launch, so a worker stalled before its first push turns idle, and ignores times more than five minutes ahead of its clock | worker-progress.mjs |
| R21 | In a cloud session a quarantine is entered without `--queue` and landed through the cloud path; between phases the coordinator lists open quarantine pull requests and carries a red one through; stale ones close through REST | parent §8, §9; queue-merge.md |
| R22 | A worker refused auto-merge as self-approval (#1408) is covered by the coordinator, which can turn it on; the start line's permission policy names it | parent §8, §10 step 3 |

## Runner check

Read on `331a98a91`: `scripts/plan-run.mjs`, `scripts/run-supervisor.mjs`,
`scripts/project-control.mjs`, `scripts/project-authorization.mjs`, `scripts/run-recovery.mjs`,
`scripts/plan-run-preflight.mjs`, `.agent-workflows/plan-run.md`, `cloud-delegate.md` and the
continuing-project runbook.

- **Supported as is.** One SQLite store and wave ledger on one host; a Claude cloud container is
  such a host. Blocks are at most 24 hours and the same owner opens the next with `start-block`.
  PASS needs the independent checker's evidence for every listed criterion in the phase's one
  environment string, so moving owner-only items out of phase acceptance is enough for A. A cloud
  coordinator launching and reading cloud workers, and waking itself with `send_later`, is
  measured (`docs/work-specs/cloud-execution/evidence/claude-measurements.md`). The opt-in Git
  recovery ref publishes every admission with `--force-with-lease`, and a stale host's next
  publication is already rejected (`scripts/run-recovery.test.mjs`).
- **Gaps.** A restored project is refused outright (`recordRun`, `start-block` and `tickRun` stop
  on `doc.restoration`), the preflight refuses any continuation but the active owner, and a new
  block refuses while a phase in flight has not acknowledged a checkpoint through an adapter that
  does not exist. So a lost container, a stopped session or a move to another machine ended the
  run. Nothing checked a live worker's progress.
- **Runner change, separate verified PR before the run opens** (branch
  `claude/plan-run-container-restart`): the recovery ref is the project's shared state; the same
  `/plan-run` line opens or continues the project from it in any session; the newest coordinator
  claims a new generation and an older one is refused at its next step and stops; the old
  refusals and the in-flight acknowledgement requirement go (the ledger already refuses to
  relaunch an in-flight step); a progress check flags a worker idle for about 30 minutes; one live
  test (start a coordinator, end it, continue in a new session, confirm the ledger carries on).

The purpose of the old restriction, never two coordinators acting at once, is kept by the
recovery ref's compare-and-swap at every admission. A worker an older coordinator launched just
before a takeover is in the ledger as in flight and is reconciled, not relaunched.
