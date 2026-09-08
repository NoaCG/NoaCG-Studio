# The handoff folder went from 33 files to 15, and every one that stays says why

Branch `claude/p-handoff-drain`, from `main` at `b119dbdd`, three commits, pushed as PR #162.

Eighteen files went. Fifteen stay, and each is named below with the citation or the unhoused item
that holds it, so the next planner does not re-derive this. Eleven backlog files were filed or
corrected: nine carrying items that lived nowhere else, two from the review of this branch.

## The rule I worked to

`.agent-workflows/orchestrator/collisions.md`, "Consuming the handoff folder": **spent is a claim
about each open ITEM, not about the file.** So no file was deleted on its own "what is left"
heading, and none on last night's word either - last night's drain kept eight on purpose and
reached fifteen more without resolving them, and tonight's plan classified all twenty-three
`deferred` rather than call them spent on a description. Every deleted file's items were traced
individually to a landed commit, a backlog file, a contract rule, a source-file header or an
owner-queue item. The tracing fanned out over five readers, one batch each; the two claims I acted
on directly I verified against the code myself before filing them.

## Deleted, and where each file's items went

**Five the plan had already traced** - `2026-09-08-a-model-contract` and `-b-red-alarms` seeded
rows F and N; `-c-delete-laptop-lander`, `-d-drain-handoffs` and `-e-receipt-truth` describe work
that landed (`37a7e2d4`, the 27 backlog files the drain names, and `0c5909e0`). The parser defect
`-d-drain-handoffs` said was "still there and is not filed" landed as `353e42cd` and `3c9f51ee`.

**`2026-09-03-orchestrator-week-routine`** carried a stated exit condition, and it is the one
judgement this row owed. See the section below.

**Twelve traced tonight.** Six had every item housed already: `-d-scroll-speed-and-through` (row
O's whole recipe is in `docs/backlog/scrolling-speed-and-through.md`, verbatim, which I checked
because row O depends on it), `-g-use-case-metadata`, `-h-docs-guides`, `-i-steer-to-the-cli`,
`-svg-behaviour-game-shows`, `-svg-behaviour-system`. Six more were spent once one to three items
were filed: `-add-control-row-set`, `-b-pro-harness-exemplars`, `-c-mapping-step-explains`,
`-workflow-phases-1c-1d-2a`, `2026-09-07-two-row-set-and-import-names`,
`2026-09-07-wizard-row-blocked-on-codex`.

The workflow-phases file was cited by path from `2026-09-07-phase-2b-contract-migration.md`, which
stays; that line now names `docs/WORKFLOW_ARCHITECTURE.md` §7 and
`docs/metrics/2026-09-06-phases-1c-1d.md`, which do not move.

## The weekly review's first run, judged

`2026-09-03-orchestrator-week-routine.md` said to delete it once somebody had judged the routine's
first real run. Both its open items are now settled, so it went.

Its other item, that the weekly percentage stays the owner's to read off his account page, is
written into `docs/ROUTINES.md:139` and `.agent-workflows/orchestrator-week.md:195`.

**The run happened.** `docs/handoffs/2026-09-08-orchestrator-week.local.md` was written at 09:59 on
2026-09-08 - 188 lines, and a good page: 5.9 billion tokens by model, the delegation ledger's
coverage gap stated rather than hidden, and a section 5 with three well-formed candidate rows.

**Its rows reached nothing.** The 2026-09-08 day wave plan was written at 21:35 and the night wave
plan at 00:11; neither lifted a candidate row, and neither mentions the file. So the workflow's step
5 is not what wants fixing - it emitted exactly what it was supposed to. The break is at the reading
end, and it is invisible: `handoff-drain.mjs:75` filters `.local.md` out of the listing the plan
check enforces, and `wave-plan-check.mjs` has no notion of the weekly file at all.

Filed as `docs/backlog/the-weekly-recap-reaches-no-wave-and-nothing-notices.md`, which the review of
this branch then made worse in an interesting way - see below.

## What was filed, and why each mattered enough to file

Two are live defects nobody had recorded, both verified against the code before filing:

- **`browse-page-reset-key-omits-brand-and-hidden.md`** - `BrowseStep.tsx:346` builds the paging key
  from `filters` and `sort` while the result memo depends on `filters`, `brandFamily` and
  `hiddenIds`. Pick a brand after paging and you stay on page five of a list that no longer exists.
  The comment directly above the key states the intent it fails. This was a Codex claim from
  2026-09-07 that its own session held back as unverified, because the same delegate was wrong on
  two of six claims that day. It was right about this one.
- **`the-vote-notice-counts-plates-as-spare-layers.md`** - `fillGap` counts every unclaimed
  candidate in an empty role's pool, so on a vote the gauge pool makes background plates read as
  "layers nothing is using". The notice is deliberately gated at three empty boxes so it only fires
  when the reader should act, which makes an inflated count fire exactly when they will follow it.

The rest carry evidence that would otherwise have gone: `an-enospc-run-prints-a-passing-tail-and-exit-zero.md`
(a full run that filled the disk, killed workers and exited 0 - the exit code is the right thing to
read and it lied), `no-spec-covers-a-declared-grow-follower.md` (a compatibility promise no spec can
reach, because the UI no longer emits the shape), `three-machine-traps-belong-in-mistake-triggers.md`
(carried verbatim, with the note that moving them there is a five-minute edit),
`the-exemplar-card-is-still-unmeasured-against-a-model.md` (270 tokens on every Pro request, and the
one round that ran cannot separate the card from the graphic type),
`four-checks-each-spawn-their-own-git-ls-files.md`, and
`words-json-is-crlf-and-nothing-normalises-it.md`.

Three existing files were corrected rather than duplicated: `a-handoff-kept-on-purpose-has-no-class.md`
gained its third occurrence and, for the first time, a cost in wave slots;
`a-stacked-branch-queues-its-parents-commits.md` gained the fact that the two callers its plan
assumes share one place are the same sequence written twice; `draft-ts-out-of-components.md` gained
the two duplications that become cheap the moment that module moves.

## The review found two defects in yesterday's alignment ledger

The delegated review resolved `main` from a stale local ref and read 43 files across two landed
PRs this branch never touched, so I discarded it per the phase-1 scope rule and redid the review
inline. But two of its findings were real, verified, and about code that landed yesterday:

- **`alignmentState()` reads the wrong checkout.** It resolves `docs/handoffs/` under the script's
  own `REPO_ROOT`, while the weekly file is written to the primary checkout by absolute path and is
  gitignored - and `orchestrator-home.mjs` pins every orchestrator session to
  `.claude/worktrees/orchestrator`. So the refusal shipped yesterday to stop an answered ruling
  going unrecorded returns `{ source: null, pending: [] }` every time it runs where the planning
  happens. It is the same root cause as the weekly-recap item, so it is recorded there rather than
  filed twice, and that item now leads with fixing the path.
- **A wrapped answer is truncated at its first line.** `FIELD` captures the remainder of the
  `**Answer:**` line only; a continuation line is neither a heading nor a field, so it is dropped
  and the truncated text is what gets written into `docs/OWNER_RULINGS.md`. The docs here wrap at
  about 100 characters. Filed as `a-wrapped-owner-answer-is-recorded-truncated.md`, with two smaller
  parser defects in the same file to take in the same pass.

Neither was fixed here - they are outside this branch's diff and belong in their own change.

## The fifteen that stay, each with its reason

Seven are held by a live citation for evidence existing nowhere else. I re-checked every one by
path AND by prose; all seven citations are still live, so none is free:

| file | what holds it |
| --- | --- |
| `2026-09-02-a-teams-spec-diagnosability` | `check-fanout-in-launched-sessions.md:57` cites it by line |
| `2026-09-02-b-queue-walks-itself` | `scripts/hooks/guard-preview.mjs:10`, wired in `.claude/settings.json:186` |
| `2026-09-02-c-ograf-host-page` | seven live OGraf backlog items name it as their Evidence |
| `2026-09-02-d-leaving-the-wizard` | the same hook, plus `e2e-webserver-hang-blocks-the-machine.md` (an owner ask) |
| `2026-09-02-d-mistake-trigger-hooks` | `mistake-trigger-hooks.md:72` (an owner ask, parked) |
| `2026-09-04-t-shard-cap-poisons-every-gate` | `docs/CI_STABILITY.md:223`, `scripts/e2e-affected.mjs:928`, two backlog items |
| `2026-09-04-u-honest-timings-and-selection` | `the-durations-table-is-refreshed-by-hand.md:4,39` |

Three stay for an item whose durable home is a file this row does not own:

- **`2026-09-06-a-brand-model-chooser`** - `docs/BRAND_PLAN.md:278` names it as required reading for
  row 2, which is unbuilt. That is a live forward pointer from a binding plan, not a leftover. Its
  substantive unhoused item, for whoever runs row 2: `captureLookFromTemplate` falls back to
  `styleTag: 'minimal'`, nothing anywhere records that this is a degradation or what it costs
  Browse ranking, and the honest fix is a created graphic recording its own family.
- **`2026-09-06-f-growth-question`** - one item is a deliberate product NARROWING: a spanning layer
  can no longer be pinned "stay exactly as drawn". Its home is `docs/TEXT_BOX_BINDING.md`
  §"What travels is not a question", which records the decision and its numbers but not this. Row L
  owns that file tonight, so the edit waits; it is one paragraph.
- **`2026-09-08-type-aware-size-floor`** - four named residue rows (`imp01` 12px/8px, `ss12` 30px,
  `card48` 20px, `lt48` 26px) with their measured sizes and why each was left warning. They belong
  appended to `docs/acceptance/owner-queue/2026-09-08-type-aware-size-floor.md`, which names only
  the four checklist info-cards. Not this row's file to write.

Five are tonight's or another row's, classified by the plan and untouched by me:
`2026-09-06-cloud-lander`, `2026-09-07-phase-2b-contract-migration`, `2026-09-07-phase-2b-first-areas`,
`2026-09-08-blocks-contract-migrated`, `2026-09-08-orchestrator-on-the-queue`.

## The drain's own output, at the end

```
Handoff drain (no fresh wave plan found - every file reads as unclassified):
  UNCLASSIFIED   7d  2026-09-02-a-teams-spec-diagnosability.md
  UNCLASSIFIED   7d  2026-09-02-b-queue-walks-itself.md
  UNCLASSIFIED   7d  2026-09-02-c-ograf-host-page.md
  UNCLASSIFIED   7d  2026-09-02-d-leaving-the-wizard.md
  UNCLASSIFIED   7d  2026-09-02-d-mistake-trigger-hooks.md
  UNCLASSIFIED   5d  2026-09-04-t-shard-cap-poisons-every-gate.md
  UNCLASSIFIED   5d  2026-09-04-u-honest-timings-and-selection.md
  UNCLASSIFIED   3d  2026-09-06-a-brand-model-chooser.md
  UNCLASSIFIED   3d  2026-09-06-cloud-lander.md
  UNCLASSIFIED   3d  2026-09-06-f-growth-question.md
  UNCLASSIFIED   2d  2026-09-07-phase-2b-contract-migration.md
  UNCLASSIFIED   2d  2026-09-07-phase-2b-first-areas.md
  UNCLASSIFIED   1d  2026-09-08-blocks-contract-migrated.md
  UNCLASSIFIED   1d  2026-09-08-orchestrator-on-the-queue.md
  UNCLASSIFIED   1d  2026-09-08-type-aware-size-floor.md
  15 file(s) unclassified - the plan owes each a line under "## Handoffs".
```

Tonight's other rows add their own files on top of this. The drain reads every one as
`UNCLASSIFIED` because it runs in this worktree and the plan lives in the orchestrator's; that is
the same wrong-checkout shape as the two defects above, and it is why seven files that nothing
disputes still print as though somebody had failed at them.

**I did not write the trace into the wave plan.** The deletion hook asks for a line there OR the
items carried into backlog files, and I took the second route. The plan is a gitignored file in a
disposable worktree - which is the first candidate row of the weekly review nobody lifted - so this
handoff is the durable copy of what went where.

## Verification

`build: green` - `npm run build`, exit code read directly, three times: after the first drain, after
the second, and after the check's fixes.

`check: review discarded+inline (6 findings, 5 fixed here, 2 filed as out-of-scope defects),
simplify inline (3 findings, 3 fixed), verify inline. taste: not applicable` - nothing in this diff
can move what a graphic looks like; every file is markdown. The review's delegated pass was
discarded because it read a stale `main` and reviewed two landed PRs' files; the simplify skill
returned fan-out instructions rather than a result, so that leg went inline over reuse,
simplification, efficiency and altitude. Verdict stamp written to
`.git/noacg-jobs/checks/claude-p-handoff-drain.json` by the `cp` route, because the Write tool
refuses that path from an isolated worktree.

CI on `29b945cc`: Build, Factory gates, E2E plan and CI gate all green; the E2E shards skipped
because the plan found no product code, which is right for a docs-only diff. `Reviewed` failed, as
it does on every branch until `queue:merge` posts the stamp.

## What is left

- The three kept-for-an-item files each name a one-paragraph edit somebody else owns tonight. Once
  those land, all three are free.
- The seven kept-for-citation files are the third night in a row that a row has re-derived the same
  argument, because `deferred` is the only word the plan can write for them. That is filed, with the
  cost, in `a-handoff-kept-on-purpose-has-no-class.md`.
- Eleven new or corrected backlog items, unscheduled by design. Two are shaped for a night row:
  `browse-page-reset-key-omits-brand-and-hidden` is one line plus a spec, and
  `four-checks-each-spawn-their-own-git-ls-files` is mechanical.
- The two alignment-ledger defects are the sharpest thing here. The refusal that landed yesterday to
  stop losing the owner's rulings cannot fire where the orchestrator runs, and the one that can
  record a ruling records it truncated.

Needs the owner: nothing.
