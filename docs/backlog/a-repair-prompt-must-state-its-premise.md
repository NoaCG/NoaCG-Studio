# A repair prompt must state its premise and let the row refuse it

**Filed:** 2026-09-08. **Source:** the 2026-09-05 refill-loop live run (handoff since drained)

## Why
A completion notification is not a death certificate. On 2026-09-05 two rows both reported
finished, went quiet for tens of minutes, then woke and completed their own work; repair rows were
launched against both on the premise that their sessions were dead. Neither did damage, and the
reason is worth keeping: the one repair prompt that stated its premise and told the row to refuse
if the premise was false did exactly that, refusing its assignment on evidence it gathered itself.
It carried that line only because the launch looked unusual.

The liveness rule in `night.md` was corrected the same day, but that is the detector. The premise
line is what makes a wrong detection cheap, and it is in no contract file.

## What it would take
One sentence in `.agent-workflows/orchestrator/recovery.md` or `launch.md`: a repair prompt states
the premise it was launched on, and instructs the row to verify it first and refuse if it is false.
The common path is at its byte ceiling, so it costs a line that must be found first.

## Evidence
`.agent-workflows/orchestrator/night.md:188-213` carries the detector half; the two rows are in the
2026-09-05 live-run record.
