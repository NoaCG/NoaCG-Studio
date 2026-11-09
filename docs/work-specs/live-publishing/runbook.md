# live-publishing: preparation and start

Preparation only. The owner said on 2026-11-09: "create a planned run with all of these new things
we need to add, so we can start it later when we have time. We don't start it yet. Now we just
prepare the planned run." Until he says start, do not open a project, start a block, create the run
issue or arm triggers. This overrides plan-create's automatic handover.

## Prepared files

- `spec.md`: agreed and open decisions, measured sizes, requirements, measurement rules,
  acceptance and the ten phases.
- `phases.json`: the phase objects plan-create copies into the project, in order.
- `work.json`: the acceptance record. `draft` until the owner finishes the plan after a second
  opinion; then `agreed` with his words.
- `docs/work-specs/retire-hosted-control/`: phase 1's own spec, agreed on issue #2301.

## Before start

1. D1 to D6 and S1 to S4 are decided and recorded in the spec (2026-11-09). The owner settles the
   plan, and `work.json` reads `agreed` with his words.
2. The interaction run has finished (the owner: "to start after the current interaction tab run").
3. Ask the owner, once, only what is missing: the authorization line (scope, start, an end date only
   if he gives one) and standing permissions in his words. Already given: "Our database migration
   is fine" covers a phase 4, 6 or 7 migration, in a quiet window when it is live-path; nothing
   else is granted.

## Start

Follow `.agent-workflows/plan-create.md` sections 3 to 6 with `phases.json` unchanged: project id
`plan-live-publishing-<start date>`, `wave-plan-store --open`, `run-supervisor register` and
`start-block`, the kit, one run issue, the heartbeat and the check-in. Then `/plan-run
live-publishing`.

## During the run

- Phase 1 rebases on current `main` right before landing.
- A migration applies before the app that relies on it; a live-path one only when no production
  is live (`supabase/AGENTS.md`).
- The run works on its own: every check is the agent's (spec, "How the agent tests and measures").
  The owner tests once, at the end.
- A target the phase 2 numbers prove wrong goes to the owner before the phase that depends on it.
- Phase 10 is the owner's final check; `next` hands it over with the checklist phase 9 prepared.
