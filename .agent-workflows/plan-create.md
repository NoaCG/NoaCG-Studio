# plan-create - set up a plan run

`/plan-create <plan> [until <time>]` (Codex: `$plan-create`). Turns a spec into a run the supervisor
can execute: the project and wave file, the owner's authorization and standing permissions, the run
kit with its brief templates, the run issue, the heartbeat and the check-in. Then it hands over to
`/plan-run`, which only executes. It launches no phase and lands no product code.

Read first: the spec(s), `AGENTS.md`, `docs/GOALS.md`, `.agent-workflows/plan-run.md` and
`docs/work-specs/continuing-plan-preparation/runbook.md` (project JSON, blocks, receipts, recovery).

## 1. Propose the phases

- One entry per executable phase of the spec, in its order: `id` (the spec's own phase id, the one
  id briefs, branches, receipts and `record` use; never a second numbering), `title`, `acceptance`
  (the spec's criteria verbatim, each one a checker can evidence), `environment` (`CA: <the
  qualified cloud worker> plus GitHub Actions`, or `OW: <the owner's hardware, studio or trial>`
  for an owner phase, which `next` hands over instead of launching), `dependsOn`, and the spec path.
  Optional `brief` fields fill the templates: `goal`, `read`, `touches`, `checks`, `notes`.
- Order fixes before the docs or reconciliation phase that must describe them, and owner phases
  last when they need the finished build. Refuse a phase without acceptance; ask nothing about
  operational metadata.
- A plan not under "Runnable plans" in `plan-run.md` is added there by a small PR (`/queue-merge`).

## 2. Ask the owner once

A plan run needs current explicit authorization, so this step is never decided for him; an
unattended session without it stops with one request. Ask one question at a time, each with your
recommendation, and record every answer verbatim:

- **The authorization line:** scope, start and finite deadline. Timezone-free times are
  `Europe/Helsinki`; report the resolved date, time and offset.
- **Standing permissions**, each his words or absent, never inferred: `blockRenewal` (open the next
  24-hour block yourself), production migrations, and anything else he grants for nights.
- **The phase list**, when it differs from the spec's order or scope.

## 3. Write the project

- The project JSON from the runbook: id `plan-<plan>-<first-date>`, `ownership`, `authorization`
  (`source`, `scope`, `permissionPolicy` with its evidence, `startedAt`, `deadline`, and `standing`
  holding his words), `status: "paused"` and the phases.
- `node scripts/wave-plan-store.mjs --open <first-date> plan-<plan> --until <deadline> --project <json>`
  writes the wave file, paused, with the phases copied.
- Register the manifest with its recovery block: `node scripts/run-supervisor.mjs register <db> <manifest.json>`,
  same id and authorization. Then `node scripts/run-supervisor.mjs start-block <db> <id> <block.json>`
  (owner, a deadline at most 24 hours away, evidence); save the returned block as `block.json` in the kit.

## 4. The kit

- `state.json`: `version: 1`, `project`, `plan`, `spec`, `issue`, `coordinator` (`session`,
  `environment`, `return`: how a worker sends its receipt back), `authorization` (`line` verbatim,
  `deadline`, `standing`), `brief` (`read` and `rules` every worker of this plan needs, such as a
  production switch that stays off), `branchPrefix`, and the running fields `waitingOn`,
  `inFlight`, `owner`, `fixes` and `triggers`.
- `node scripts/plan-kit.mjs init <wave> <state.json>` creates `<wave>.kit/` with the build, check,
  repair and fix templates from `docs/plan-runs/templates/`. They link
  `docs/plan-runs/known-traps.md`; a new trap goes into that file, never into a template. Tailor a
  template only for what this plan needs.
- `node scripts/run-supervisor.mjs publish <db> <id>`: the recovery checkpoint now carries the kit,
  the durable copy a new session's `continue` restores.

## 5. Run issue, heartbeat and check-in

- One GitHub issue for the run: the spec, the authorization line and standing permissions verbatim,
  the phases with ids and environments, and the owner's items. The repository is public: no
  credentials, nothing from `docs/private/`.
- Post `node scripts/plan-kit.mjs heartbeat <wave>` as a comment on it; record the issue and
  comment ids in `state.json`.
- Arm the check-in trigger `plan-run check-in <project id>` for this session at
  `node scripts/plan-kit.mjs checkin <wave>`'s time. Its message only says: read the kit's
  `state.json` beside `<wave>` and follow `.agent-workflows/plan-run.md`. It is the block trigger
  too: `checkin` never sets it past the block's end, and a check-in renews the block first under a
  standing `blockRenewal`, or asks the owner without one. Record its id in `state.json`.
- Qualify as `plan-run.md` section 1 says, then publish once more.

## 6. Hand over

Report the project id, wave file, kit, run issue, heartbeat and check-in, and the first `next`.
Then follow `/plan-run <plan> until <deadline>` from its loop in this session, on the store just
created; a later session starts at its `continue`.
