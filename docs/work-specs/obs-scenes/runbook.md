# obs-scenes: preparation and start

Preparation only. The owner said on 2026-11-12: "Let's not start the run yet. Build the planned run
plan, and then give me a second opinion prompt so we can check if the planned run has everything it
needs to work." Until he says start, do not open a project, start a block, create the run issue or
arm triggers. This overrides plan-create's automatic handover.

## Prepared files

- `spec.md`: why, evidence, owner decisions D1 to D6, behaviour, AC-1 to AC-14 and the seven phases
  in run order (OS4, OS1, OS2, OS3, OS5, OS6, OS7).
- `phases.json`: the phase objects plan-create copies into the project, in that order.
- `work.json`: the acceptance record, `agreed` with the owner's words.
- Private run notes: `runs/obs-scenes.md` in `NoaCG/noacg-private` (clone it into `docs/private` as
  `.agent-workflows/cloud-delegate.md` says). It holds the owner's live windows, the landing freeze,
  the run's end and the private context. Nothing from it goes into public text, the run issue or a
  commit.

## The owner's answers (2026-11-12, verbatim)

- Start: "let's not start the phases yet." / "Let's not start the run yet."
- End: "The end date, should be before the actual event, but I don't have a hard deadline except
  that one." The resolved instant is in the private run notes.
- Blocks: "There should be no daily blocks. It can open up new blocks by itself" (`blockRenewal`).
- Migrations: "database changes are okay if we're not live broadcasting and there are no landing
  freezes."
- Live windows: "there won't be anything landing on those three days in the playout system on
  noaCG because we are doing live streams." The days are in the private run notes.
- Not granted: `untilComplete`. The end is binding.

## Before start

1. The owner says start, after the second opinion on this preparation.
2. OS4 may start at once. OS1 starts only after the live-publishing run's phase 4 has landed.
3. Confirm the resolved end instant in the private run notes with the owner if the second opinion
   questions it.

## Start

Follow `.agent-workflows/plan-create.md` sections 3 to 6 with `phases.json` unchanged: project id
`plan-obs-scenes-<start date>`, `wave-plan-store --open` with the end from the private run notes,
`run-supervisor register` and `start-block`, the kit (its `brief.rules` point every worker at the
private run notes), one run issue with no dates from the private notes, the heartbeat and the
check-in. Then `/plan-run obs-scenes`.

## During the run

- **Live windows and landing freeze.** The coordinator posts no `noacg/reviewed` stamp and enables
  no auto-merge for a pull request that touches playout (`src/output/`, `src/control/`,
  `src/components/home/`, `api/`, `supabase/`) inside an owner live window or the landing freeze
  in the private run notes. Builds and checks may continue; the landing waits for the window to
  end. Nothing else in the repository enforces these windows, so the coordinator also tells the
  owner, before each window, which other open pull requests touch playout.
- **Beside the live-publishing run.** Both runs change the output page. OS1, OS3 and OS6 merge
  `origin/main` right before landing, and use `node scripts/merge-order.mjs` to land after an
  overlapping live-publishing pull request that is already queued. Neither run works around the
  other's design.
- **Owner phases.** OS2 and OS7 are handed over on the run issue with the checklist the previous
  builder leaves; his receipts land as evidence through a pull request.
- **A failed gate.** If OS2 shows the load or the stinger timing breaks a plan assumption, the
  coordinator brings the owner the spec's fallback before OS3 starts.
- **Event graphics** are not a phase (spec D6). They are made with the owner in this repository in
  parallel, and their retrospective is written after OS7.
