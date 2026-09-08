# The weekly review's candidate rows reached no wave, and nothing anywhere says so

**Filed:** 2026-09-09. **Source:** measurement, while draining the handoff folder - this is the
judgement `docs/handoffs/2026-09-03-orchestrator-week-routine.md` asked somebody to make about the
routine's first real run, made once and then deleted with the file it came from.

## Why

The weekly orchestrator review exists to turn a week of measurement into wave rows. Its first real
run produced them and they went nowhere, and no gate, report or file recorded the miss.

The run happened. `docs/handoffs/2026-09-08-orchestrator-week.local.md` was written at 09:59 on
2026-09-08, 188 lines, with a section 5 carrying three well-formed candidate rows - the wave plan
outliving its worktree, one walk covering a route rather than an item, and capability observations
re-probed on a clock - each with GOAL, WHY, TOUCHES and POOL, one of them explicitly pooled to
`sonnet`. That is exactly what the workflow's step 5 is supposed to emit, so step 5 is not the
defect.

Both of that day's wave plans were written after it. Neither lifted a candidate row, and neither
mentions the file at all:

- `2026-09-08-day-wave-plan.local.md`, written 21:35, references the routine only to classify
  `2026-09-03-orchestrator-week-routine.md` as consumed by its row D.
- `2026-09-08-night-wave-plan.local.md`, written 00:11 on 2026-09-09.

So the loop the owner asked for on 2026-09-03 ran, measured well, and closed the circuit into
nothing. The three rows it proposed are still unplanned, and the first of them - the wave plan
dying with its worktree - is the reason that same review could report 0 waves and 0 `DECIDED:`
lines for a week in which nine lettered rows landed on 2026-09-05 alone. The measurement failure
it named is now on its second week.

**Two mechanisms that would have surfaced the file both skip it.**

- `scripts/handoff-drain.mjs:75` filters the folder to `.md` that is not `.local.md`, so the
  weekly recap never appears in the listing the plan check enforces a classification for. Every
  other handoff owes the plan a line; this one owes nothing.
- `scripts/wave-plan-check.mjs` has no notion of the weekly file. Its only matches on the word
  "weekly" are the Codex rate-limit parsing at lines 259-279.

`.agent-workflows/orchestrator/grounding.md:45-49` does name it - "the weekly file's candidate rows
are frontier input" - and `docs/ROUTINES.md` says the next `/orchestrator` "turns its candidate rows
into a wave, or says why not". Prose in two contracts, and nothing that counts. That is the same
shape as `nothing-counts-a-receipt-whose-work-already-landed.md`: a rule whose only enforcement is
somebody remembering.

## What it would take

The narrow fix is a plan-check rule: when a `*-orchestrator-week.local.md` exists in the primary
checkout dated inside the window the plan covers, the plan owes each of its candidate rows a line -
planned as row X, or rejected with a reason. That is one file read and one heading check, the same
shape as the `## Handoffs` rule the check already enforces.

The cheaper half, worth doing whether or not the check lands, is making `handoff-drain.mjs` list the
weekly file rather than filter it out. It is a handoff by name and location; excluding it because it
is gitignored is an implementation detail leaking into the contract.

Do not build an SLA or an expiry on top of this. The owner ruled that nothing in his queue expires
and he will get to all of it; the same restraint applies here. The ask is that a skipped row is
skipped ON PURPOSE and says so, not that anything is forced into a wave.

## Evidence

- `docs/handoffs/2026-09-08-orchestrator-week.local.md` (untracked, primary checkout) - the run,
  its numbers, and section 5's three rows. Timestamps above are file mtimes.
- `.claude/worktrees/orchestrator/docs/handoffs/2026-09-08-day-wave-plan.local.md:348` and
  `2026-09-08-night-wave-plan.local.md` - the two plans that followed it.
- `scripts/handoff-drain.mjs:70-75` - the `.local.md` filter.
- `scripts/wave-plan-check.mjs:259-279` - the only place the check says "weekly", and it is about
  Codex quota.
- `.agent-workflows/orchestrator/grounding.md:45-49`, `docs/ROUTINES.md` (the weekly routine
  section) - where the obligation is written down.
- The scheduled task `weekly-orchestrator-review` is now disabled, merged into the weekly owner
  session by `032678a2`; the obligation moved with it and is unchanged.
