# The orchestrator contract on the merge queue, and the retired-names gate

**Written:** 2026-09-08. Branch `claude/orchestrator-on-the-queue`. Follows
`docs/handoffs/2026-09-07-phase-2b-contract-migration.md` (the phase plan) and closes §7's
"`retired.json` and the negative check" item of phase 2b.

## What was wrong

GitHub's merge queue replaced the laptop lander on 2026-09-06 (#63). Two days and about fifty
landings later, the orchestrator contract still planned against the old path: `grounding.md` read
landing preconditions off `auto-merge.mjs --dry-run`, the core quoted `merge-order` verdicts as the
landing order and named `safe-merge` as "the mechanical landing path", `report.md` classified
`auto-merge` refusal kinds, and `night.md` had the loop queue a dead session's branch behind a
`merge-order` `clear`. `queue-merge.md` told every row to run `auto-merge.mjs --dry-run` and
explained `--accept <kind>` and a twelve-hour ordering hold that no longer exist. Nothing failed,
because the freshness gate checks that a named script EXISTS, and every one of those scripts still
does. What changed was the meaning of the name.

## What landed

- **`contracts/retired.json`** - six retired mechanisms, each with a pattern, the date, the
  replacement and the reason: the manual landing workflow, the laptop lander, `merge-order`
  verdicts as a gate, the ordering hold, the lander's flags, and a red `main` refusing landings.
- **`scripts/check-retired-names.mjs`** (`npm run check:retired-names`, `// gate: build`) - reads
  every AGENTS.md, CLAUDE.md, workflow, module, agent definition, command adapter and rule file
  paragraph by paragraph and fails one that names a retired mechanism without saying it is history
  ("retired", "no longer", "used to", "until <year>", "never"). It found 24 paragraphs on first
  run, two of them in contracts I had not read (`supabase/AGENTS.md` twice), and one false
  positive that tightened a pattern. Tests in `scripts/check-retired-names.test.mjs`.
- **The orchestrator contract, on the queue.** Core section 3 reports each branch's state from
  `npm run jobs` and says order is the queue's; `grounding.md`'s cheap set reads `npm run jobs` and
  uses `merge-order` only as a collision instrument; `report.md` item 5 names the four refusal kinds
  a pull request can carry plus the stacked-pull-request drop; `night.md`'s loop re-arms a watcher
  with `requeue`, puts a dropped stacked pull request back with `gh pr merge --auto`, and queues a
  dead session's branch with `npm run queue:merge -- <branch>` on the three liveness signals alone.
  Core 198/200 lines, common path 640/640 - both unchanged, paid for by one shortened sentence.
- **`queue-merge.md`** - the pre-queue look is now `git merge-tree` against `origin/main`; the
  `clear`/`caution`/`hold` ladder, `--accept`, the ordering hold and the "pin allows the lander's
  own integration commit" paragraph are gone. `next.md`, `so.md` and `cleanup-worktrees.md`
  followed.
- **The safe-merge workflow is deleted** - canonical file, both adapters, and its pinned markers
  in `check-shared-instructions.mjs`. Its own header said the queue "runs THIS procedure's
  mechanical path", which was false, and its ending is `git push origin main`, which the ruleset
  refuses. `docs/BRANCHING_AND_LANDING.md` says so where it used to point at it.
- **A rule through `npm run learn`**: `landing/retire-mechanism-same-change-replaces-naming`,
  firing on the new gate.
- `docs/backlog/delete-the-laptop-lander-scripts.md` - the scripts stay because 25 scripts and
  three workflows import them; that is a mechanical row of its own.

## Verified

`node --test scripts/check-retired-names.test.mjs` 4 of 4; `check:retired-names`,
`check:shared-instructions`, `check:contracts`, `check:contract-freshness`, `check:workflows`,
`check:gate-coverage`, `check:contract-evidence`, `check:docs-index`, `check:line-endings` all
green on this tree; `npm run build` exit code read from its own file. Nothing here is observable in
the product, so no owner-queue item.

## What the review changed

`/check` ran four finder passes over the diff and they found real things. The gate now judges a
SENTENCE rather than a paragraph, because "never" is this repository's ordinary word and a
paragraph grain hid the compiled rule lists entirely (one injected stale bullet in `AGENTS.md`
produced no finding; it does now). `scripts/land-watch.mjs` reads `mergeable` and treats a
conflicting pull request as a refusal instead of waiting on it for ever. `queue-merge.md` regained
the stop on a branch cut from another unlanded branch, stopped claiming an owner-receipt refusal
the queue never runs, and says what `requeue` really does; `next.md` maps `merge-order` to what it
prints. `contracts/` is classified as never product code in the e2e map, and the freshness gate
now shares the gate's file set, so the two cannot disagree. Two more backlog items:
`a-stacked-branch-queues-its-parents-commits.md` (the mechanism, a pull request base) and two
unenforced claims folded into the laptop-lander item.

The full e2e suite did not run here: `scripts/e2e-affected.mjs` changed, and the selector
escalates its own files to the full suite by design, which CI runs on the pull request.

## The orchestrator can run now

Nothing in its contract names a retired mechanism, and the gate keeps it that way. The two rules
that still say `never merge` and `never push by hand` are the ones it should keep. What its first
plan should find on the frontier, from what this session read:

- **Phase 2b, the remaining areas**, largest first: `src/model` (31 KB, and domain row 1's shim
  with 619 importers is mid-flight there), `src/export`, `e2e`, `src/components/home`,
  `src/ai/pro`, `src/components/timeline`. 94 hand-written files remain of 102.
- **Two rolling alarms on `main`**: #85 (the nightly's type-floor / overflow sweep since #131
  landed; every spec file green) and #112 (the weekly dependency audit, unread). Neither gates a
  landing, which is why they survive.
- **The memory drain into records** (§7 phase 2b): `MEMORY.md` is at its line ceiling and the
  corpus is 101 KB against 40. Nothing mechanical moves it yet.
- **Phase 3** has not started: graph-derived test selection, the registries split, and
  `prompts.md` losing its GATE instructions in favour of "push and let CI plan".
- `docs/backlog/delete-the-laptop-lander-scripts.md`, a `sonnet` row.

One thing the gate cannot do: it reads prose, not code comments. `scripts/jobs.mjs` still carries a
header describing the laptop lander it calls into; the backlog item above is the fix.
