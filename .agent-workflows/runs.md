# runs - watch the live plan runs from a local helper session

Shared canonical procedure, invoked as `/runs` in Claude Code and `$runs` in Codex. Plan runs
have their own local or cloud coordinators (`plan-run.md`); the owner opens a helper beside them to
see how they are going, keep the session list tidy and help with anything that needs this computer.

**The coordinators own their runs.** Never record ledger events, launch or stop workers, stamp or
queue a run's pull requests, or renew blocks from here. Each message to a coordinator costs it a
turn, so send one only when this procedure says to.

## 1. Read

- Live runs are the open issues whose heartbeat comment (`scripts/plan-kit.mjs heartbeat`) says
  "Phases passed":

  ```bash
  gh search issues '"Phases passed"' --repo NoaCG/NoaCG-Studio --state open --json number,title
  ```

  Read each one's heartbeat, newest milestone and existing ledger/PR timestamps for progress.
  Prefer a later owner closure over a stale heartbeat; keep unverified criteria separate from closure.
  Skip finished runs. Create no reporting store or scheduled report; report when this helper is invoked.
- Use available native session inventory (Claude Code: `ListAgents`; Codex: exposed session/thread
  tools), and count each run's open sessions. Unavailable inventory means unknown, never zero.
- Read a coordinator's own log (Claude: `RemoteTrigger` `get_run_log`; Codex: native read/follow)
  only when its heartbeat is older than its stated next check-in, or something looks stuck.
  An active Codex run arms no wake; absence of a scheduled check-in alone is not evidence of a stall.

## 2. Act

- **Finished sessions still open** (a passed phase's builder, checker, diagnose or review
  sessions, qualification sessions): send that run's coordinator one message asking it to archive
  them, keeping itself, anything running and the in-flight phase. No reply is needed; check the
  count again before answering.
- **A stalled coordinator** (heartbeat past its check-in, idle in the log): report its last event.
  The owner continues a run by typing its `/plan-run` line in any session.
- **Work for this computer** (an `OW:` phase, an owner item, a local-only step): say what it is
  and offer to do it here.

## 3. Answer

Per run, at most five lines:

1. Phases independently passed / total; in-flight phase and PR. Merged or worker-completed is not PASS.
2. Elapsed wall time since start; active time only if measured; phases passed in the last 24 hours.
3. Remaining-time range and estimated completion at the observed pace, with as-of time and basis.
   Use comparable build-through-check durations, including CI/review waits, and remaining phase types,
   dependencies and hardware needs. Few comparable phases, blocked work or missing timestamps mean
   "too early to estimate" or a conditional estimate; never invent precision from phase counts alone.
4. Problems and their owners; distinguish a hard deadline, a planning target and authorized until-complete.
   Internal block boundaries are not completion deadlines; the helper never changes or renews authority.
5. Owner items. Report stale or unavailable evidence explicitly; use the owner's timezone for forecasts.

Then the open session count before and after tidying. End with what the owner must do, or
"Nothing needed from you." Reuse existing receipts; no new telemetry, worker or recurring automation.
