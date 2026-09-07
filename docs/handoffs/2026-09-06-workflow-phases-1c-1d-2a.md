# Session - workflow phases 1c and 1d, and the four module rows of 2a

**Date:** 2026-09-06, evening into the night. **Plan:** `docs/WORKFLOW_ARCHITECTURE.md` (§5 the
target, §7 the phases, §9 the metrics). **Baseline and re-measurements:** `docs/METRICS.md`.
Seven branches went through `/check` and `npm run queue:merge`; nothing was merged by hand, and
GitHub's merge queue landed every one of them.

## What landed

1. **Phase 1c - a red `main` answers itself** (PR 66). When the E2E shards fail on `main` or in a
   merge group, `ci.yml`'s `e2e-retry` job re-runs the failed spec FILES once on the same commit,
   read off the shards' own blob reports. It refuses, and leaves the run red, when a shard
   uploaded no report, when nothing failed, or when the failing spec is one the change itself
   edits. A fail-then-pass is the receipt a flake needs: the `after-gate` job writes those specs
   into `e2e/quarantine.json` through the merge queue, `quarantine.yml` runs each quarantined spec
   on every push to `main` and posts `noacg/quarantine/<spec>` as a commit status, and the release
   is queued after twenty consecutive passes read off those statuses. A failure that survives the
   second run, after a green last verdict, reverts everything since that verdict on
   `revert/<sha7>` and queues it; the red-main issue names the pull request, or the reason nothing
   was reverted. `scripts/queue-pr.mjs` is the bot's landing client. The required check `CI gate`
   went back to being a read-only verdict; every write lives in `after-gate`. Rules:
   `docs/VERIFICATION.md`, "A red main answers itself first".
2. **Phase 1d - the gates are discovered** (PR 67). The build line names no check and no test:
   `node scripts/gates.mjs run` finds every `check:*` whose entry declares `// gate: build` and
   every `scripts/**/*.test.mjs` on disk, ci.yml's Factory job runs `--gate factory`, and the line
   ends with the `after-build` tier. Each gate declares its tier and the paths it guards in its
   own header; `check:gate-coverage` audits those declarations rather than asking whether the
   build line names the gate. 32 checks and 99 test files declare both today, and the most
   conflicted line in the repository has no reason to change again.
3. **Phase 2a, domain row 3** (PR 68): the five §6 debts are gone - `defaultTemplate` to
   `templates/`, `ensureExternalRefs`, `cssVars` and `slug` to `model/`, `EditorTab` to `blocks/` -
   with their dependency allowances and the eslint exemption deleted, and one narrow
   `store -> templates` edge added for the store's seed.
4. **Domain row 1** (PR 69): the template contract moved to `src/templates/contract.ts`, the
   Import-graphic shapes to `src/templates/importedDesign/designTypes.ts`, and the six vocabulary
   types a brand and a generation spec are written in to `src/model/templateVocabulary.ts`, so the
   kernel stops importing the catalog. `src/model/wizard.ts` is a fifteen-line re-export shim with
   one temporary allowance, and 619 importers still read it.
5. **Wizard row 1** (PR 71): `draft.ts` split into `draft/core.ts`, `draft/template.ts` and
   `draft/import.ts`, with `draft.ts` re-exporting them.
6. **Wizard row 2** (PR 73): the Import-graphic capability under `src/components/wizard/import/`
   behind one `index.ts`, with a dependency rule that refuses a deep import and a test rule that
   takes a file in that folder from 38 planned specs to 13 - the road's own nine plus the four
   that assert on testids only these components render.
7. **The measurements** (PRs 70 and 77) and **the build-exit-code rule** (PR 72).

## Needs you: nothing

Both account-level asks are closed, and `npm run check:owner-setup` is what says so from now on.

The organisation and the repository now let Actions open a pull request, which is what a
quarantine entry, a quarantine release and a revert need in order to finish; default workflow
permissions stay at `read`, so a workflow still asks for what it uses. The `production`
environment holds SUPABASE_ACCESS_TOKEN, and `post-land.yml` has been applying with it: production
and staging both hold all 54 migrations.

The reason these arrived one at a time is that nothing asked all of them at once. `check:owner-setup`
does: the two Actions-permission settings, the ruleset on `main` and its two required checks, the
migration token, the `land` label. It reports and never changes anything, it names the command that
fixes each miss, and an answer a login cannot obtain reads `unknown` rather than `missing`. When
`scripts/queue-pr.mjs` is refused at `gh pr create`, its error names that command, so the mechanism
that is blocked points at the list rather than at the branch.

## Open, in payoff order

- **Domain row 1's second half:** rewrite the importers of `model/wizard` to the new paths and
  delete the shim and its allowance. The trap is written into the shim's own header: thirteen
  scripts and five specs load `/src/model/wizard.ts` by Vite path inside `page.evaluate`, which
  neither tsc nor the dependency checker sees.
- **Phase 2b** (the contract migration, area by area) can start: the wizard is per capability now.
- **Wizard rows 3 to 6** and the remaining domain rows run alongside it.
- **Watch the first mechanical landing.** Nothing has exercised the quarantine or the revert on
  GitHub yet; the first one is also the first test of the dispatched run with `require_review` and
  of the queue accepting a pull request the workflow opened.
- **A sprint-focus gap:** a `src/model/cssVars.ts` edit under sprint focus no longer runs
  `inspector.spec.ts`. Phase 3's graph-derived selection is the fix, not another map rule.
- **Not taken from the reviews:** `queueOnGitHub` in `scripts/jobs.mjs` and `queuePullRequest` in
  `scripts/queue-pr.mjs` are the same sequence written twice; four older checks each spawn their
  own `git ls-files` where `repositoryFiles()` in `scripts/gates.mjs` would do; eight helpers in
  `draft/core.ts` became public because they cross the new boundary and could collapse into two
  functions owned by the import slice.
- **Six worktrees are disposable** (`cloud-lander`, `test-discovery`, `model-debts`,
  `templates-contract`, `wizard-draft-split`, `wizard-import-module`): every commit on each is an
  ancestor of `origin/main`. `node scripts/cleanup-worktrees.mjs` from the primary checkout is
  dry-run by default.

## Two things the landing burst showed

- **A stacked pull request can leave the merge queue when its parent lands**, with every check
  still green. `scripts/land-watch.mjs` reports that ("no longer queued for auto-merge") rather
  than re-adding it, which is right when the drop was a failure and needs a hand when it was not:
  `gh pr merge <n> --auto` puts it back. Read the QUEUE ENTRY, not `autoMergeRequest`, which reads
  null for a pull request that is sitting in the queue.
- **`deploy-verify.yml` filed three "Production is not running the latest main commit" issues**
  during the burst and closed each one itself as Vercel caught up. Expected while seven landings
  go through in an evening; worth knowing before treating one as a fault.

## One thing I got wrong, and the rule it earned

Three builds were verified with `npm run build 2>&1 | tail -3`, which reports the exit code of
`tail`, not of the build. A branch was queued on that evidence with a failing copy gate: moving
the template contract out of `model/wizard.ts` put eight em-dashes under a path the baseline had
never seen, and three of them are catalog descriptions the wizard shows, so the honest fix was to
record the path rather than rewrite the copy. A review caught it before CI did. The rule is in the
store as `root/read-build-own-exit-code-never`: read the build's own exit code,
`npm run build > log 2>&1; echo $?`, never through a pipe.
