# Handoff - phase 2b, the contract migration, and what is left after it

**Written:** 2026-09-07, at the end of the session that landed phases 1c, 1d and the four module
rows of 2a (`docs/handoffs/2026-09-06-workflow-phases-1c-1d-2a.md` is that record). **Plan:**
`docs/WORKFLOW_ARCHITECTURE.md` - §5.3 is the specification for everything below, §7 is the phase
order. **Measurements:** `docs/METRICS.md`, three dated columns.

## Where the tree stands

`main` is landed only by GitHub's merge queue; ten pull requests went through it in one evening
with no human step. A red `main` re-runs its failed specs once, quarantines a flake through the
queue and reverts a batch that stays red. The build line discovers its own checks and tests from
their headers. The template contract, the kernel helpers and the Import-graphic capability are
where the layer rules put them. `npm run check:owner-setup` reports every account-level
prerequisite in place, so nothing is waiting on the owner.

## What phase 2b is

Move 108 hand-written `AGENTS.md` and `CLAUDE.md` files (572 KB, and the root file is loaded by
all 54 chains) into the rule store, and generate the loaded contracts from it. The store holds two
rules today; everything else is still prose in the files every branch edits.

The order, by cost, from §7: root and the kernel; `src/templates`; `src/components/wizard` (now
per capability, so `import/`, `ai/`, `template/`, `shell/` are separable); `src/ai`;
`src/components`; `e2e`; then the remaining 48.

Each row: split one area's contract into rule files and records, run the symbol-survival audit,
regenerate, delete the sibling `CLAUDE.md` where `.claude/rules` now covers Claude, land. A section
whose meaning is not clear enough to become a rule becomes a `kind: walk-p` owner-queue item that
quotes it, and the row ships without waiting.

## What exists, and what phase 2b has to build first

Already landed and working:

- `contracts/rules/<area>/<slug>.md` and `contracts/records/<area>/<date>-<slug>.md`, with
  `npm run learn` as the only write path. It refuses a date, a run id or a measurement in the rule
  text and routes it to the record, and it refuses a rule that reads like one already in the store
  unless you say `--distinct` or `--supersedes`.
- `scripts/compile-contracts.mjs` writes `.claude/rules/*.md` and `contracts/index.md`, and
  `--check` is in the build. `npm run rules -- <path>` says what applies to a file.
- `scripts/check-contract-freshness.mjs` already extracts every backticked token from a contract
  and checks the ones that name a path, a script or an npm command against the tree. Its extractor
  is what the symbol-survival audit should reuse rather than write again.
- `scripts/check-contract-evidence.mjs` freezes a per-file count of evidence-bearing lines and
  refuses a file whose count goes UP, so a hand-written contract cannot grow new dated paragraphs
  while it waits its turn.

Missing, and the first rows of 2b:

1. **The symbol-survival audit.** The gate for every migration row: the set of backticked tokens
   in the pre-migration contract must be a subset of the tokens in the rules plus records that
   replaced it. Without it, a row that quietly drops a rule looks exactly like a row that moved it.
   Build it as `scripts/contract-migrate.mjs audit <path> --since <ref>`, reusing the freshness
   gate's extractor, and make it print what went missing rather than a count.
2. **Nested `AGENTS.md` generation.** The compiler writes only the additive `.claude/rules/` layer
   today. A migrated area needs its `AGENTS.md` GENERATED from the rules whose scope lives under
   it, or the migration has nowhere to put what it took out. Generated files are committed, and
   `.gitattributes` needs the merge driver that regenerates from the merged store.
3. **The near-duplicate threshold**, calibrated on the migrated corpus rather than on two rules,
   and then enabled in `--check`.
4. **`contracts/retired.json` and its negative check**: a retired mechanism, its date and its
   replacement, so a contract or a doc naming `safe-merge` as the landing path fails the build.

## The gates a migration row has to satisfy

- `npm run build` green, with the exit code read directly (`npm run build > log 2>&1; echo $?`).
  A pipe reports the pipe's status; that is a recorded rule, `root/read-build-own-exit-code-never`.
- `check:contract-evidence` counts only ever go down.
- `check:shared-instructions` still passes, and its byte ceilings are not raised: the tightest
  chain is `src/components/wizard` at about 102 KB of 110 KB.
- `check:contract-freshness` passes, so every path a rule names exists.
- `npm run check:gate-coverage`: a new script declares its tier and guards in its own header.

## Everything else open, in payoff order

- **Domain row 1's second half:** rewrite the 619 importers of `model/wizard` to the new paths and
  delete the shim and its dependency allowance. The trap is in the shim's own header: thirteen
  scripts and five specs load `/src/model/wizard.ts` by Vite path inside `page.evaluate`, which
  neither tsc nor the dependency checker sees.
- **Wizard rows 3 to 6** (AI under `wizard/ai/`, the template steps, the capability registry that
  deletes the eight hand-written step tables, and finally nesting `WizardDraft` into slices) and
  **domain rows 2 and 4 to 10**. Row 5 (`control/`) and row 6 (`ProductionPage.tsx`) are the two
  that need a quiet window.
- **Phase 3:** selection from the dependency graph, the registries split, the orchestrator reading
  the reports. The sprint-focus gap belongs here: a `src/model/cssVars.ts` edit under focus no
  longer runs `inspector.spec.ts`, and the fix is graph-derived selection, not another map rule.
- **Phase 4:** the load test - twelve branches queued within five minutes, all landing within
  sixty.
- **Watch the first mechanical landing.** The quarantine and the revert have never fired on
  GitHub. The account setting they needed is on now, so the next flake or red batch is also the
  first test of a workflow-opened pull request entering the queue.
- **Not taken from the reviews:** `queueOnGitHub` in `scripts/jobs.mjs` and `queuePullRequest` in
  `scripts/queue-pr.mjs` are the same sequence twice; four older checks each spawn their own
  `git ls-files` where `repositoryFiles()` in `scripts/gates.mjs` would do; eight helpers in
  `draft/core.ts` became public because they cross the new boundary.
- **Seven worktrees are disposable** - every commit on each is an ancestor of `origin/main`:
  `cloud-lander`, `test-discovery`, `model-debts`, `templates-contract`, `wizard-draft-split`,
  `wizard-import-module`, `owner-preflight`. `node scripts/cleanup-worktrees.mjs` from the primary
  checkout is dry-run by default.

## Two things about the queue, learned by using it

- A stacked pull request can leave the merge queue when its parent lands, with every check green.
  `scripts/land-watch.mjs` reports it rather than re-adding it; `gh pr merge <n> --auto` puts it
  back. Read the queue ENTRY, not `autoMergeRequest`, which reads null for a queued pull request.
- `deploy-verify.yml` files a "Production is not running the latest main commit" issue during a
  burst of landings and closes it itself once Vercel catches up.
