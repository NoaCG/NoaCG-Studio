# Session - the workflow plan, phase 0 (the rule store) and phase 1 (the cloud lander)

**Branch:** `claude/cloud-lander` (from `origin/main` `5e30efdc`, which is phase 0 landed).
**Date:** 2026-09-06. **State:** phase 1's first half built and verified; queued for landing
through the LAPTOP lander one last time (the Land workflow reads `scripts/land.mjs` from `main`,
which does not have it until this lands). After it lands, `npm run land:ruleset -- --apply` was
run from a main checkout (the owner said yes to the ruleset on 2026-09-06).

## What this session did

1. **`docs/WORKFLOW_ARCHITECTURE.md`** - the measured plan: three structural faults (landing on
   one laptop with the full suite per landing, learning written into loaded contracts, single-line
   registries), five architectures, the recommendation, the orchestrator's role, the source
   modularity audit (§5.5) and the staged phases. `docs/METRICS.md` is the baseline with the
   `npm run metrics:*` commands.
2. **Phase 0, landed as `5e30efdc`**: `contracts/` rule store, `npm run learn`, the compiler to
   `.claude/rules/`, `check:contracts`, `check:contract-evidence`, the `/check` stamp consumer in
   `add-merge`, `scripts/metrics/`.
3. **Phase 1, this branch**:
   - `.github/workflows/land.yml` + `scripts/land.mjs`: one landing at a time on a GitHub runner;
     merge `main` in, a `ci.yml` run on that commit by dispatch, fast-forward `main` on a green
     `CI gate`; refusals written on the pull request, label removed. `migrate` job applies
     migrations from the `production` environment's `SUPABASE_ACCESS_TOKEN` when it exists.
   - `npm run queue:merge` is the cloud client: push, PR, `noacg/reviewed` status, `land` label.
     The laptop lander (`auto-merge.mjs` under the job runner) is no longer reachable from it.
   - `scripts/landing-ruleset.mjs` (`npm run land:ruleset -- --apply`): only the Land workflow and
     the repository admin may push `main`; no deletion, no rewrite.
   - `ci.yml`: every branch push plans from the fork point (never `github.event.before`); a
     `main` run whose commit main has already moved past cancels itself.
   - `scripts/landings.mjs`: keeps `landed.jsonl` fed from merged `land`-labelled pull requests
     (called by `npm run jobs`, the tick and the session-start notice).
   - Docs: `docs/BRANCHING_AND_LANDING.md`, `.agent-workflows/queue-merge.md`, root `AGENTS.md`.

## Open, in order of payoff (phase 1's second half, then phase 2a)

- **Owner, when home**: the Supabase token as the `production` environment secret, from his own
  terminal (`docs/WORKFLOW_ARCHITECTURE.md` §10 has the command and the bounded-token shape).
  Until then the `migrate` job says "no token" and migrations stay on the laptop as before.
- **Auto re-run and quarantine** (phase 1c): a red `main` run re-runs its failed shards once on
  the same sha; fail-then-pass writes a quarantine entry through the queue; a revert PR for a
  batch that stays red. Today a red main still needs a person.
- **Test discovery** (phase 1d): the `build` line enumerates 84 `node --test` files and is the
  most-conflicted line in the repo (66 edits in 30 days). A runner that globs
  `scripts/**/*.test.mjs` with a header for the browser-needing ones, and `check-gate-coverage`
  inverted to "every check declares its scope".
- **Watch the first cloud landings**: `gh run list --workflow land.yml`. Two things to confirm
  on the first real one: the dispatch after the token push produces a run the lander picks up
  (the run list is filtered by `--commit`), and the PR is marked merged by the ff push.
- **Retire the local merge kind**: `jobs.mjs requeue`/`adopt` still know merge jobs; nothing
  creates them now. Remove when the ledger sync has run for a few days.
- **Phase 2a** (the four module rows) before the contract migration: the §6 debts, `model/wizard.ts`
  out of `model/`, `draft.ts` split, Import-graphic under `wizard/import/` with its own rule.
