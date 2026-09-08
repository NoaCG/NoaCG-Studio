# A handoff kept on purpose is printed as one somebody failed to delete

**Filed:** 2026-09-08. **Source:** the 2026-09-02 orchestrator live run, friction 7 (handoff since
drained)

## Why
`scripts/handoff-drain.mjs:45` has four classes: consumed, spent, deferred, owner. Consumed, spent
and owner are DELETED by the wave. On 2026-09-02 a row was told to delete eleven files and
correctly kept two that `docs/backlog/` still cited as Evidence, and the drain went on printing
them as `consumed`, which reads as "somebody failed to delete these". `deferred` does not fit
either: it means machine-continuable work, and carries a graduate-or-die staleness flag these
files should never trip. So the right outcome has no vocabulary, and the next planner re-derives
the same argument or deletes the file. The 2026-09-08 drain hit it again, on six files kept purely
because a live backlog item cites them.

## What it would take
Either a fifth class ("cited: <file> still names it as Evidence") that is never deleted and never
goes stale, or make deletion the responsibility of the repoint, as `7fc1016a` did by hand,
repointing two backlog files at themselves before the handoff they cited was deleted.

## Evidence
`scripts/handoff-drain.mjs:45`; `.agent-workflows/orchestrator/collisions.md`, "Consuming the
handoff folder"; commit `7fc1016a`.
