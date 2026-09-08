# Session A - teams spec diagnosability

**Branch:** `claude/a-teams-spec-diagnosability`
**Landed:** `aa269f83` (the settle-wait fix, the AGENTS.md rule, nine handoff deletions),
`69a6f834` (the check's fixes), `d1a876b1` (merge of `origin/main` at `c66604b8`).

## What the goal was, and whether it is true

A settle-wait that misses a third settled state now fails within seconds naming that state.
Measured on a page rendering exactly what `PickScreen` emits for a failed fetch: the old wait took
**20009 ms** and said "element(s) not found"; the new one fails in **29 ms** and names
`teams-load-error`. A page with a team present still passes in 5 ms, and a screen that genuinely
never settles still times out at 20 s - so the change did not buy its speed by weakening the wait.

The reproduction ran against a static page carrying `PickScreen`'s three shapes rather than against
a live backend, because the configured suite needs credentials this worktree has none of. What the
static page cannot prove - that a failed fetch really produces that shape - is proven by reading
the source instead, and it is airtight: `listMyTeams` returns `{ teams: [], error }` on failure
(`src/backend/teams.ts:148`), and `PickScreen` renders `teams-load-error` on
`teams?.length === 0 && loadError` (`src/components/teams/ShareWithTeamDialog.tsx:435`). Neither
`no-teams` nor `.team-pickrow` renders in that state, which is the whole defect.

## The sweep, and why only one site changed

All five `.or(` sites were read against their components. Only `teams.spec.ts` had a settled state
its wait could miss. The other four are complete, and each verdict is a source reading rather than
an opinion:

- `e2e/advanced-mode.spec.ts:103` and `e2e/_create.ts:158` - `confirm-switch` or the destination.
  `requestSwitch` (`src/store/saveActions.ts:155`) is strictly binary: a dirty document sets the
  guard, a clean one calls `proceed()`. There is no third branch to miss.
- `e2e/import-prepare.spec.ts:347` - `erase-proposal-dismiss` or `baked-yes`. `baked-yes` renders
  whenever `marking === null` (`PrepareDesignStep.tsx:412`), which is the step's initial state, and
  the proposal block renders *alongside* it rather than instead of it. `erase-scan-refusal` and
  `erase-unavailable` both coexist with one of the two, so the wait always settles.
- `e2e/ograf-contract.spec.ts:181` - `textbox` or `spinbutton`. Not a settle-wait between exclusive
  outcomes; it asserts that at least one field input of either role exists, and the line below it
  counts inputs. Nothing to enumerate.

## What needs the owner

Nothing.

## Two handoff files were deliberately KEPT, and are not a missed deletion

The prompt listed eleven files to delete. Nine went. **Two were kept on purpose**, because live
backlog items name them as their Evidence and nothing catches a dangling handoff pointer
mechanically - `scripts/check-docs-index.mjs` exempts `docs/handoffs/` by design:

- ~~`docs/handoffs/2026-08-30-n-ograf-checker.md`~~ - **the keep-reason expired on 2026-09-02 and
  the file is deleted; this entry is kept so the third drain does not have to re-derive it.** It was
  cited by `docs/backlog/ograf-host-page-restyle.md:38` ("the two candidate fixes and their
  trade-offs"), and had already been restored once, on 2026-09-01, for exactly that reason
  (the 2026-09-01 svg-state-workflow handoff recorded the earlier thirteen-file list as WRONG;
  drained 2026-09-08). Both halves are now gone: `claude/c-ograf-host-page` picked one of the two candidate
  fixes and landed it, deleting that backlog item, and the defect is measured fixed - a built
  `graphic.mjs` carries zero selectors addressing the document on all six lower-third designs, and
  `GRAPHIC_BOX_CSS` is scoped to `:where([data-noacg-graphic="..."])`. Nothing cites the handoff
  any more, so it went with the other drained ones. `git show b0750116:docs/handoffs/2026-08-30-n-ograf-checker.md`
  still prints it.
- ~~`docs/handoffs/2026-09-02-h-orchestration-guardrails.md`~~ - **drained 2026-09-08.** It was
  kept for `docs/backlog/mistake-trigger-hooks.md`, which cited it for the three hooks and how each
  was fed a real event. What went with it is the VERIFICATION, not the reasoning: it enumerated 22
  cases with observed exit codes for `guard-command.mjs`'s `branchCreations`, `warn-command.mjs`'s
  stale-landing-pin notice and `warn-edit.mjs`'s migration-number notice, and none of those three
  hooks has a test file. `docs/backlog/hook-tests-run-only-by-hand.md` is the standing item for
  that gap. `git show b8d1f58f^:docs/handoffs/2026-09-02-h-orchestration-guardrails.md` prints the
  22 cases.

**`claude/d-mistake-trigger-hooks` is a LIVE session on the second of those two backlog items as of
2026-09-02 12:57 UTC** - had that file gone, that session would have followed its Evidence line to
nothing.

Both citations were re-checked after `origin/main` moved to `c66604b8`, and the other nine were
re-checked for citations across the whole tree and have none. **Read this as deliberate, not as a
drain that missed two files.**

## Follow-on this session did not build, with the evidence for it

**A dangling-handoff-pointer check.** The deletion list has now been wrong twice in three days, and
both times a human review caught it - which is the shape of a missing mechanism rather than a
missing rule. The natural home is `scripts/check-docs-index.mjs`, already in the build chain, with
`scripts/check-docs-index.test.mjs` beside it. **It cannot be added as a one-liner**, and this is
the fact worth carrying: the repo already has **nine pre-existing dangling references**, so a
strict check fails the build today. They are

```
2026-08-27-editor-stage-blank      2026-08-29-cc-playout-polish      2026-08-29-dd-svg-fitting-two
2026-08-30-ae-autonomous-cleanup   2026-08-30-e-poll-live-update     2026-08-30-x-control-panel-research
2026-09-01-d-thing                 2026-09-01-night-wave.local.md    ci-morning-report.local.md
```

The two `.local.md` ones are **not** defects: those live in the orchestrator home and are
deliberately outside the repo, so any check must exempt that suffix. The other seven need triage
(rewrite the citing line to stand alone, or restore the file) before the gate can go green. That
triage is the work, not the checker.

## Verification

- `npm run build` green on the integrated tree, stamped `claude/a-teams-spec-diagnosability@d1a876b1d9`.
- `ci.yml` green twice, and the two runs are worth reading differently.
  - On `69a6f834` (branch-only) the **E2E shards were SKIPPED, correctly rather than as a hole**:
    `scripts/e2e-affected.mjs` ignores `e2e/configured/**` on purpose, because those specs need a
    real backend, so a change confined to them plans `mode: none`. Do not read that run as
    coverage of anything.
  - On the integrated `d1a876b1` (run 33632511815) **all nine E2E shards ran and passed, plus the
    catalog calibration gate** - `main`'s SVG work escalated the plan, so the integrated tree got
    the real suite.
- `configured-suite` is a **separate workflow**, not a job inside `ci.yml`. Worth knowing: a gate
  line asking anyone to "confirm `configured-suite` is among ci.yml's jobs" can never be satisfied,
  and the way to get that verdict is `gh workflow run configured-suite.yml --ref <branch>`.
- `configured-suite` was dispatched on this branch (`gh workflow run configured-suite.yml --ref
  claude/a-teams-spec-diagnosability`) - it runs `e2e/configured/` against a local Supabase stack,
  which is the only automation that executes `teams.spec.ts`. **Run 33631896118 on `69a6f834`:
  success, and it really ran - "Ran 39 tests (39 passed, 0 failed, 0 flaky), 0 skipped", with all
  three `teams.spec.ts` tests green including the changed walk (4.4 s).** That verdict is on the
  pre-integration sha; `main`'s changes since are SVG import work that cannot reach the share
  dialog, and the landing queue gates the integrated sha itself.
- No local full suite was run before landing, deliberately: the integration plan from the fork
  point is effectively the whole suite plus the catalog gate, and that gate belongs to CI and the
  landing queue on a clean checkout.

## Check

`/check` on this branch: **review: delegated** (returned findings scoped to this branch and this
worktree's files; three findings, all three confirmed against the source and fixed in `69a6f834`),
**simplify: inline** (the skill returned fan-out instructions, which in a launched session means it
did not run, so the four angles were covered here), **verify: build + CI**.

The review earned its place - two of its three findings were defects I had introduced. The kept
handoffs above are findings 1 and 2. Finding 3: the assertion message blamed the `teams` table
alone, but `loadError` is set by the member fetch too (`ShareWithTeamDialog.tsx:104`), so a missing
`team_members` grant would have sent the reader to the wrong table. The message names both fetches
now, and the comment says which direction the snapshot read can miss instead of claiming it cannot.
