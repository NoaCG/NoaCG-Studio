# runs - watch the live plan runs from a local helper session

Shared canonical procedure, invoked as `/runs` in Claude Code and `$runs` in Codex. Plan runs
coordinate themselves in the cloud (`plan-run.md`); the owner opens a local session beside them to
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

  Read each one's heartbeat comment and its newest milestone comment. Skip a run whose heartbeat
  says it is done.
- List your sessions (Claude Code: `ListAgents`) and count each run's open ones by title.
- Read a coordinator's own log (`RemoteTrigger` `get_run_log`, its session id is on the run issue)
  only when its heartbeat is older than its stated next check-in, or something looks stuck.

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

Per run, at most five lines: phases passed of the total, what is in flight with its pull request,
what is left against the deadline or target, problems with who owns each, and owner items. Then
the open session count before and after tidying. End with what the owner must do, or
"Nothing needed from you."
