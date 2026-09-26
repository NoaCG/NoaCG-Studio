# Session liveness reads a session inside one long tool call as a dead session

**Filed:** 2026-09-26. **Source:** handoff of `claude/night-transcript-liveness` (2026-09-11),
re-checked against `scripts/session-liveness.mjs` and `.agent-workflows/orchestrator/night.md` on
2026-09-26.

## Why

The night loop queues a branch itself only when all three liveness signals are quiet: the harness
inventory, the branch tip's age, and the transcript's mtime. The transcript signal is blind while a
session sits inside one long tool call, because the call is written when it starts and nothing
more is written until it returns. The inventory does not cover Agent-tool subagents, which is what
wave rows are, so for a row inside a long browser call two of the three signals go quiet together
with the row still working.

On 2026-09-11 the loop called a row dead after two quiet hours while it sat inside one browser call.
Another session rebuilt that row's files, then had to revert the rebuild when the row came back
and landed its own work. `night.md` now tells the reader to check for a pending call by hand, but
`scripts/session-liveness.mjs` still decides from the newest transcript mtime against a 120-minute
idle window, exactly the two quiet hours that produced the wrong call.

## What it would take

- In `sessionHold` (`scripts/session-liveness.mjs`), treat a transcript that has a tool call with
  no result yet as live, whatever its age. `waitingOn()` in `scripts/blocked-sessions.mjs` already
  finds every pending call, batched calls included; export it and reuse it rather than writing a
  second parser.
- Keep the resident-idle case in mind: `docs/backlog/blocked-sessions-cannot-tell-waiting-from-abandoned.md`
  is the same signal read from the other side (a finished session left resident with an unanswered
  call). A pending call should hold a worktree, never authorise anything, so reading it as live
  fails safe.
- A unit test with a transcript whose last entry is an unanswered call three hours old.

## Evidence

- `scripts/session-liveness.mjs`: `DEFAULT_MIN_IDLE_MINUTES = 120`; the transcript branch of
  `sessionHold` compares only the newest mtime with that window.
- `.agent-workflows/orchestrator/night.md`, the three-signal test for a branch nobody can declare,
  and its note that the transcript is blind during a pending tool call.
- `scripts/blocked-sessions.mjs`: `waitingOn(entries)`.
