# The stop-hook widening was designed against a cost the transcripts refute

**Filed:** 2026-09-08. **Source:** the 2026-09-05 orchestrator-simplification session (handoff since
drained)

## Why
Both stop-hook items price the failure at about forty minutes of dead wall clock per occurrence,
and the widening of the matcher was designed against that figure. The transcript read on
2026-09-05 found the opposite: two rows were re-invoked by their own live background tasks within
one to eight minutes, so the forty minutes never happened
(`docs/ORCHESTRATOR_SIMPLIFICATION.md:125`). The two backlog files still carry the old figure, and
a Stop hook that over-refuses blocks every session on the machine. The expensive direction here is
the false refusal, not the miss.

## What it would take
Not a revert. Correct the cost line in both files, and add the other half to the miss-rate
measurement that `stop-hook-detects-waits-by-word-list.md` already proposes: record the waits the
hook now REFUSES that a live background task would have woken. Decide the matcher's shape on both
numbers.

## Evidence
`docs/ORCHESTRATOR_SIMPLIFICATION.md:125`; `docs/backlog/stop-hook-background-wait-gap.md` under
"Cost, measured", and `docs/backlog/stop-hook-detects-waits-by-word-list.md`.
