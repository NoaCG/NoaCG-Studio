# live-publishing: preparation and start

Preparation only. The owner said on 2026-11-09: "create a planned run with all of these new things
we need to add, so we can start it later when we have time. We don't start it yet. Now we just
prepare the planned run." Until he says start, do not open a project, start a block, create the run
issue or arm triggers. This overrides plan-create's automatic handover.

## Prepared files

- `spec.md`: decisions, measured sizes, what must be true (with design-gate lists), test and
  measurement rules, acceptance and the nine phases.
- `phases.json`: the phase objects plan-create copies into the project, in order.
- `work.json`: the acceptance record. `draft` until the owner settles the plan; then `agreed` with
  his words.
- `docs/work-specs/retire-hosted-control/`: phase 1's own spec, agreed on issue #2301.

## Before start

1. The owner has settled the plan and `work.json` reads `agreed` with his words. Every decision so
   far is recorded in the spec (O1 to O14, D1 to D6, S1 to S4, E1 to E5).
2. The interaction run has finished (the owner: "to start after the current interaction tab run").
3. Ask the owner, once, only what is missing: the authorization line (scope, start, an end date only
   if he gives one) and standing permissions in his words. Already given: "Our database migration
   is fine" covers a migration in phases 4, 6 or 7, in a quiet window when it is live-path; nothing
   else is granted.

## Start

Follow `.agent-workflows/plan-create.md` sections 3 to 6 with `phases.json` unchanged: project id
`plan-live-publishing-<start date>`, `wave-plan-store --open`, `run-supervisor register` and
`start-block`, the kit, one run issue, the heartbeat and the check-in. Then `/plan-run
live-publishing`.

## During the run

- Phase 1 rebases on current `main` right before landing.
- Phases 4 to 7 open with a design gate: the design lands as its own pull request only after an
  independent `/so` grades it A; product code follows in the next pull request. A design that cannot
  reach A without a behaviour choice the owner has not made goes to him as one question.
- A migration applies before the app that relies on it; a live-path one only when no production is
  live (`supabase/AGENTS.md`). Installing a migration and switching a feature on are separate steps.
- Every check the run can do, it does itself (spec, "How the agent tests and measures"). Hardware
  checks are listed for the final check and never counted as passed.
- A target the phase 2 numbers prove wrong goes to the owner before the phase that depends on it.
- Phase 9 is the owner's final check; `next` hands it over with the checklist phase 8 prepared.
