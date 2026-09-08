# The wave-plan check accepts a fallback pool by word match, not by structure

**Filed:** 2026-09-08. **Source:** the 2026-09-02 orchestrator live run, friction 6 (handoff since
drained)

## Why
`scripts/wave-plan-check.mjs:314` decides whether a non-Claude row named its fallback by matching
the word "fallback" over the row's raw text and its prompt block. On 2026-09-02 it refused a row
whose POOL column read `codex + opus` and whose prose named the fallback twice: the refusal was
right about the plan and wrong about its own reason. The mirror case is the one that costs - "no
fallback needed here" passes the check while naming no pool at all.

## What it would take
Make POOL carry the fallback in its own grammar (`codex, fallback opus high`) and have the check
read the parsed column rather than grep the row. `.agent-workflows/orchestrator/routing.md:47`
already states the rule the grammar would encode.

## Evidence
`scripts/wave-plan-check.mjs:314-315`; `.agent-workflows/orchestrator/routing.md:47`,
`.agent-workflows/orchestrator/prompts.md:111`.
