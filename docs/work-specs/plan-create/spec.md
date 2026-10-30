# Plan runs: setup skill and the production-page retro fixes

## Why

The production-page plan run (2026-10-20 to 2026-10-29, issue #1553) built and checked 50 phases
in about eight days. Its retro (#1553, comment 6496870487) lists what cost hours or risked the run:
parallel builders cancelling each other's configured-suite runs, an inconsistent self-approval
path, run state kept in a 6 KB trigger prompt and in one container only, a fixed 30-minute
check-in, owner phases the tool treated as cloud builds, a manual daily block renewal, two
numbering schemes, boilerplate pasted into every brief, and a heartbeat edited by line number.
It also found that a coordinator has to learn the whole procedure before it can plan anything.

## Goal

A coordinator sets up a plan run with `/plan-create` and executes it with `/plan-run`, and the
retro's failure modes are fixed in the tool, the workflow or the shared procedure where they
belong, not left to each session's care.

## Non-goals

- No change to the running production-page project's state (paused, waiting on the owner's
  phases 51 and 52). Its recovery branch is only read.
- No new scheduler, ledger or launch path. The supervisor stays the only phase admission.
- No change to the ledger's order, repair, diagnose or PASS rules.
- Cost tracking (retro item 14): no change; the retro itself says the /so rounds paid for
  themselves.

## Decisions (revertible)

- **The configured suite's dispatches off `main` get one concurrency group per branch.** Pushes
  keep one group per commit; cron and dispatches on `main` keep the shared group. A second
  dispatch on the same branch still replaces that branch's own pending run, which is wanted.
- **In a plan run the coordinator posts the review stamp and turns auto-merge on.** Builders stop
  at "every gate green" and report the PR and reviewed SHA. The harness refused self-approval for
  some builders and not others; the coordinator path is the one that always works.
- **Run state is a small `state.json` in a run kit next to the wave file** (`<wave>.kit/`), with
  the rendered brief templates and the briefs sent. The recovery checkpoint carries the kit, so it
  is pushed with every recorded event and `continue` restores it. The check-in trigger's message
  only says where the state is and to follow `plan-run.md`.
- **Owner phases** are the ones whose environment starts with `OW:`. `next` answers `owner` for
  them instead of a build launch.
- **Block renewal** needs a standing permission recorded verbatim in the project authorization
  (`authorization.standing.blockRenewal`). `run-supervisor renew` then opens the next block from
  a check-in, never after an owner pause.
- **One id:** the phase id in `project.json` (the spec's own id, for example `E8.2`) names the
  phase in briefs, branches and receipts; `record` accepts it in place of the row number.
- **Shared traps** live in `docs/plan-runs/known-traps.md`; base brief templates in
  `docs/plan-runs/templates/`. `scripts/plan-kit.mjs` renders briefs and the heartbeat from the
  kit and refuses an unfilled placeholder.

### AC-1: Parallel builders do not cancel each other's configured-suite runs

A dispatch on one branch never replaces a pending run of another branch; cron and `main` keep
the shared group. Layer: the workflow's concurrency expression, read in review.

### AC-2: Owner phases are first-class

For a project whose next phase's environment starts with `OW:`, `next` answers `owner` with the
phase id and the hand-over to write, never `launch build`; a build is still recordable when the
owner's walk starts. Layer: Node test (`plan-run.test.mjs`).

### AC-3: Blocks renew under a standing permission only

`run-supervisor renew` opens the next bounded block when the block ended and the authorization
holds `standing.blockRenewal`; it refuses without it, while a block is active, and after an owner
pause. Layer: Node test (`continuing-project.test.mjs`).

### AC-4: The run kit is durable

A checkpoint published with a kit beside the wave carries it, `continue` restores it into the new
store, and a checkpoint without a kit still restores. Layer: Node test (`run-recovery.test.mjs`).

### AC-5: One phase id everywhere

`next` names the phase id and title for a project, and `record` accepts the id. Layer: Node test.

### AC-6: Briefs and heartbeat are rendered, not edited

`plan-kit brief` fills a template from the kit and the phase, links the traps file, saves the
brief in the kit and refuses an unfilled placeholder; `plan-kit heartbeat` renders the heartbeat
and the next check-in from `state.json` and the ledger, with an adaptive delay. Layer: Node test
(`plan-kit.test.mjs`).

### AC-7: `/plan-create` exists in both tools and `/plan-run` stays canonical

`.agent-workflows/plan-create.md` with Claude and Codex adapters passes the shared-instruction
check; `plan-run.md` stays within its line limit and links the kit, traps and templates instead
of carrying briefs. Layer: `check-shared-instructions.mjs`.
