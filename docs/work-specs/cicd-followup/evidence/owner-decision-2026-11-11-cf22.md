# Owner decision, 2026-11-11: add phase cf22 "Measure and rank the repair loop"

Given by the owner (`miwco`) in the cicd-followup coordinator session (session_017SdbwPphatUYXtpZ9CHkPu, run #1967) on 2026-11-11. Recorded verbatim below; the coordinator's placement note follows it.

## The owner's words

> Owner request: add a phase to the cicd-followup run for the repair loop. When a PR's CI or merge-queue run fails and goes back to its agent, measure from GitHub history over the last two weeks: how many PRs bounced, how many rounds each, the time lost per bounce (failure to next green), and the cause (real defect, flake, gate refusal like budget or review stamp, or infrastructure). Then rank fixes by time saved, for example re-running only the failed part, agents running the affected tests before pushing, and gate refusals that an agent cannot fix going to the owner alarm at once instead of looping. Same measurement rules as cf03; change no test, check or limit in this phase. Show me the numbers and the ranked list before building anything.

## Placement (coordinator)

The run's ledger admits a phase only after the last phase with a ledger event, which is cf17. cf22 is therefore inserted directly after cf17, as phase 19, before cf18, cf19 and cf20, so cf20 reports it. cf22 follows cf17 for order only; it uses no data from cf17. It runs in the spec's standing environment: a qualified Claude Code Cloud worker plus GitHub Actions, with measurements from existing Actions history. Every other phase keeps its acceptance, order and dependencies.
