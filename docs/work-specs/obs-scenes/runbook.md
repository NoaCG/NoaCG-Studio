# obs-scenes: preparation and start

Preparation only. The owner said on 2026-11-12: "Let's not start the run yet. Build the planned run
plan, and then give me a second opinion prompt so we can check if the planned run has everything it
needs to work." Until he says start, do not open a project, start a block, create the run issue or
arm triggers. This overrides plan-create's automatic handover.

## Prepared files

- `spec.md`: why, evidence, owner decisions D1 to D7, behaviour, the contract with the
  live-publishing run, AC-1 to AC-15 and the ten phases in run order.
- `phases.json`: the phase objects plan-create copies into the project, in that order.
- `work.json`: the acceptance record, `agreed` with the owner's words.
- Private run notes in `NoaCG/noacg-private` (the coordinator knows the path): the owner's live
  windows, the landing hold schedule, the run's end, targets and fallbacks. Only the coordinator
  reads them; no worker needs the private repository. Nothing from them goes into public text, the run issue, a
  commit, a receipt or the recovery branch.

## The owner's answers (2026-11-12, verbatim)

- Start: "let's not start the phases yet." / "Let's not start the run yet."
- End: "The end date, should be before the actual event, but I don't have a hard deadline except
  that one." The resolved instant, which he confirmed, is in the private run notes.
- Blocks: "There should be no daily blocks. It can open up new blocks by itself" (`blockRenewal`;
  it never extends past the end).
- Migrations: "database changes are okay if we're not live broadcasting and there are no landing
  freezes."
- Live windows: "there won't be anything landing on those three days in the playout system on
  noaCG because we are doing live streams."
- Not granted: `untilComplete`. The end is binding.
- "all as recommended" (2026-11-12), to the planning session's six questions: the bare end date
  may appear in public run state (`authorization.deadline`, heartbeat, recovery branch) with no
  event named; scenes are taken through Studio Mode preview with a short fade as the default (D9);
  the Sheet is the score baseline and the JSON source a bonus (D8); the live-publishing run's
  `production_copies` switch is fixed before the feature freeze and not changed after; the AC-13
  numbers; the landing hold from 24 hours before each live window to its end and through the
  landing freeze, the live-publishing run paused during the live windows, and its owner studio
  check after the event.

## Before start

1. Done 2026-11-12: the owner's answers above.
2. The owner's 30-minute laptop probe, with no new code: today's cloud output link as twelve
   browser sources at 60 fps with OBS Stats open, and Google sign-in inside a Custom Browser Dock.
   His result goes into the private run notes.
3. Qualification, before any runtime state (`plan-run.md` section 1): the coordinator and one
   fresh cloud worker run `plan-run-preflight.mjs`, and a real wake re-enters the coordinator.
   Workers do not attach the private repository: in auto mode a worker's `add_repo` is refused
   (qualification, 2026-11-12), and no phase needs it.
4. The end date goes in `authorization.deadline` as usual (answered above).
5. The owner says start.

## Start

Follow `.agent-workflows/plan-create.md` sections 3 to 6 with `phases.json` unchanged: project id
`plan-obs-scenes-<start date>`, `wave-plan-store --open`, `run-supervisor register` and
`start-block`, then the run issue (no private dates or names), then the kit with that issue
number, the heartbeat and the check-in. Then `/plan-run obs-scenes`.

The kit's `brief.rules`, written once:

- Make no change that risks reliable playout. With the OBS scenes switch off, everything behaves
  as today.
- Rename nothing persisted (`src/model/AGENTS.md`).
- Phases touching `src/output/` or the publish code follow the spec's contract with the
  live-publishing run; merge `origin/main` right before landing.
- A migration only in a quiet window (`supabase/AGENTS.md`) and never while the landing hold is on.
- OBS hardware results come only from the owner phases; a builder or checker never counts one as
  passed.
- A behaviour choice the spec does not settle goes to the owner as one question.
- Public text names no event, date, site or person.

## During the run

- **Landing hold.** The hold (OS0, until it lands: the coordinator withholds its own stamps) is on
  from 24 hours before each owner live window until the window ends, and during the landing freeze
  in the private run notes. The coordinator arms the scheduled triggers that set and lift it and
  checks each one fired. Every route to `main` stops while it is on, including the other run's.
- **The live-publishing run** is paused with its supervisor's `pause` for each live window, if the
  owner agrees. Before a phase touching `src/output/` or `src/control/hostedControl.ts`, this
  coordinator posts a note on that run's issue; the later lander owns the integration.
- **Production deploys** follow `main`, so the hold stops them. Whether the Vercel project can
  also be pinned to a known-good build, and what the deploy drift alarm does then, is unchecked;
  the coordinator checks and tells the owner before the first window.
- **Owner phases.** OS2 and OS7 are handed over on the run issue and in the coordinator's chat
  with their checklist and receipt template. The owner reports in that chat, which wakes the
  coordinator; his receipts land as evidence through an Ordinary pull request. A checker may
  assess his evidence and never claims a physical check it did not do. A product repair after an
  owner phase is a normal Risky row.
- **A failed owner line** goes to the owner with the fallback in the private run notes before the
  next phase starts.
- **Event graphics** are not a phase (spec D6). The run gives them, in time: the adapter's data
  paths and the deadline format (in the spec now), scene links once OS1a lands, and the template
  improvements once OS4 lands (a graphic made before needs Update, because a production's graphic
  is its own copy). The retrospective after OS7 records which steps used local-only shortcuts.
