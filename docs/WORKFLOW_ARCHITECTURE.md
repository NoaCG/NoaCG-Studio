# NoaCG development workflow

How work on NoaCG Studio is done, verified and landed today, for an outside developer or a fresh
agent session that needs the whole picture before touching the machinery. Each section links to
the file that owns the procedure instead of restating it. Code map: `docs/ARCHITECTURE.md`.
Direction: `docs/GOALS.md`.

History is not retold here. The 2026-09-06 diagnosis, target architecture, staged plan and
module audit this file used to hold are in git (`git show 353527c3:docs/WORKFLOW_ARCHITECTURE.md`);
code comments that name its phases (phase 0, 1c, 1d, 2a, 2b) or its wizard and domain rows refer
to that version. Later measurements are under `docs/metrics/`, incidents under `contracts/records/`.

## 1. The short version

- Many sessions run in parallel, Claude Code and Codex alike. Each works on its own feature
  branch in its own git worktree, made before the work starts. Nobody works or builds in the
  checkout that holds `main`.
- Both tools read one set of instructions, compiled from `contracts/rules/`, and one set of
  procedures in `.agent-workflows/` (section 2).
- A lesson is recorded as an observation first. It becomes a loaded rule only when a fix, a
  mechanism or a check cannot carry it (section 3).
- A session verifies its own work against the acceptance criteria, and `/check` stamps the tip
  (section 4).
- `/queue-merge` hands the branch to GitHub's merge queue, the only writer of `main`. CI on the
  merge group is the landing gate; nothing on a laptop is (sections 5 and 6).
- Browser-driving work on a machine goes through a local job queue that holds it to the
  machine's memory (section 7).
- An orchestrator session plans waves of these sessions from `docs/GOALS.md` and the owner's
  feedback, launches them and watches them land (section 8).

## 2. Instructions

**One source.** Every rule is a file, `contracts/rules/<area>/<slug>.md`, with a scope (globs), a
kind (`invariant`, `trap`, `rule` or `taste`), `fires:` (what carries it) and a status. Its
evidence goes in a record under `contracts/records/`, which nothing loads. `contracts/README.md`
has the format.

**Compiled, never hand-edited.** `npm run contracts:compile` (`scripts/compile-contracts.mjs`)
writes:

- the root `AGENTS.md`: only the `**`-scoped rules, which every session loads, capped at 3 KB
  (`KERNEL_MAX_BYTES` in `scripts/contracts-lib.mjs`), so adding a rule there retires another;
- a folder `AGENTS.md` in each directory the compiler owns, which is any directory whose
  `AGENTS.md` carries the generated marker (for example `src/`, `src/components/`,
  `src/templates/`). Each glob in a rule's scope goes to the deepest owned folder that holds it,
  so a rule spanning two areas lands in both rather than in a shared ancestor (`ruleHomes`);
- `.claude/rules/*.md`, one file per scope set, with `paths:` front matter;
- `contracts/index.md`, every rule with its scope and status.

A rule whose `fires:` names a hook, gate or test that prints it is left out of the loaded files:
the mechanism says it at the moment it matters. `scripts/hooks/guard-edit.mjs` refuses hand edits
to generated files, and a merge conflict in one is settled by regenerating from the merged store
(the `noacg-contracts` merge driver, `scripts/contracts-merge-driver.mjs`).

The remaining folder contracts (for example `api/`, `e2e/`, `supabase/` and most template
categories) are still hand-written `AGENTS.md` files, each with a one-line `CLAUDE.md` that
imports it. `node scripts/compile-contracts.mjs --report` lists the rules no owned folder holds.

**How Claude Code loads them.** The root `CLAUDE.md` imports `AGENTS.md` at start.
`.claude/settings.json` sets the built-in agents-md plugin to `claude-md`, so Claude reads
`CLAUDE.md` files rather than `AGENTS.md` files: a hand-written folder contract arrives through
its `CLAUDE.md` on the first read in that folder, and compiled rules arrive through
`.claude/rules/` when a file they scope to is read. A compiled folder has no `CLAUDE.md`, so no
rule reaches Claude twice.

**How Codex loads them.** Codex reads `~/.codex/AGENTS.md` and the `AGENTS.md` chain from the
repository root down to the folder it started in, once, at start. It never reads `CLAUDE.md` or
`.claude/rules/`. The root contract therefore tells it to run `npm run rules -- <files>` before
editing, adding `--loaded <AGENTS.md>` for each folder contract already in its context;
`scripts/rules.mjs` prints the other folder contracts on those paths and the rules scoped to them.
The chain budget is `project_doc_max_bytes` in `.codex/config.toml`, which is lowered and never
raised. `docs/metrics/2026-09-26-codex-instruction-loading.md` is the measured behaviour.

**Procedures.** Each reusable workflow is one tool-neutral file, `.agent-workflows/<name>.md`.
Claude Code exposes it as `/<name>` through `.claude/commands/` or `.claude/skills/`, Codex as
`$<name>` through `.agents/skills/<name>/SKILL.md`, and both adapters only point at the shared
file. `docs/AGENT_WORKFLOWS.md` is the maintenance contract.

**The gates that keep this honest**, all part of `npm run build`:

| Gate | Refuses |
|---|---|
| `npm run check:contracts` | a rule that does not parse, carries evidence, duplicates another or names a mechanism that is not there; generated files that are stale |
| `npm run check:contract-evidence` | a hand-written contract gaining a line with a date, run id or measurement |
| `npm run check:contract-freshness` | a contract naming a path or `npm run` script that does not exist |
| `npm run check:shared-instructions` | adapter drift; a missing `CLAUDE.md` beside a hand-written contract or one beside a compiled contract; a Codex chain less than 4 KiB under its budget; the orchestrator workflow over its line limits |
| `npm run check:retired-names` | an instruction naming a mechanism listed in `contracts/retired.json` |
| `npm run check:contract-citations` | a citation of a rule id or contract section that does not exist |

## 3. Learning

A mistake is evidence, not automatically a rule. The ladder, stopping at the first step that
works: fix the cause (code, name, default or doc) so it cannot recur; make it mechanical (a test,
gate, hook or better default whose failure message is the rule); give it the narrowest scope; an
always-loaded rule comes last. `contracts/README.md` is the ladder in full.

`npm run learn -- --area <area> --evidence "..."` with no `--rule` records an observation: one
record under `contracts/records/<area>/`, nothing else. That is the default. With `--rule`,
`learn` also needs `--because` (why a fix, a mechanism or a check does not cover it); it writes a
rule and its record, appends to the existing rule's record instead when the rule is already in the
store, refuses a `**` scope without `--always`, and recompiles. Either way it writes only new
files with unique names, so parallel sessions never conflict over a lesson.

`npm run audit:instructions` is the monthly drift audit of what every session is made to read.
Any change to how instructions load is measured afterwards (section 9).

## 4. Verification

One procedure serves both tools: `.agent-workflows/verify.md` (`/verify` in Claude Code, `$verify`
in Codex). It takes the acceptance criteria from the spec, the work prompt's goal or the
`docs/GOALS.md` outcome; picks the checks the change needs and no more (the build always, the
tests that guard a script, affected E2E through the job queue for product code, the running app
for anything visible, the catalog battery for designs); loops until they hold; and records the
evidence per criterion, including what was not checked. `docs/VERIFICATION.md` is the reference
for the suites and gates.

`/check` (`.agent-workflows/check.md`) is the pre-merge chain: review, simplify, then verify. It
ends with `npm run stamp` (`scripts/check-stamp.mjs`), which writes a stamp for the exact tip into
the shared job store. The verdict is derived from the legs, so a leg that did not run is a fail.

Only what needs human judgment reaches the owner: one file per item under
`docs/acceptance/owner-queue/`, of kind `decision`, `phone` or `desktop`
(`docs/acceptance/OWNER_QUEUE.md`). Work an agent can verify never goes there, and a technical
problem is never the owner's.

## 5. Landing

`/queue-merge` (`.agent-workflows/queue-merge.md`) is the one way work reaches `main`. Only the
session that owns the branch runs it, because queueing declares the work finished.

1. The tip is committed, `npm run build` is green on it, and `/check` has stamped it.
2. `git fetch origin && git merge-tree --write-tree origin/main HEAD` shows no conflict, and
   `node scripts/merge-order.mjs --branch <branch>` finds no unlanded branch inside this one.
3. `npm run queue:merge -- --why "<reason>"` (`scripts/jobs.mjs add-merge`) refuses a tip the
   stamp does not cover, an unanswered owner receipt or unread relay mail. It then pushes the
   branch, opens or reuses the pull request, posts the verdict as the `noacg/reviewed` commit
   status, adds the `land` label and turns auto-merge on.
4. GitHub queues the pull request once its two required checks pass: `CI gate`, and `Reviewed`
   (the `ci.yml` job that reads `noacg/reviewed`). It builds a temporary merge of up to five queued
   pull requests on top of `main`, runs `ci.yml` on that merge group, and merges them when
   `CI gate` is green on the integrated result. An entry whose checks fail is dropped from the
   queue and its auto-merge is turned off.
5. Queueing also adds a local merge job running `scripts/land-watch.mjs`. It follows the pull
   request until it merges or is dropped, and it is what the frozen-branch hook, the wave tick and
   the landing ledger (`<git-common-dir>/noacg-jobs/landed.jsonl`, also fed from GitHub by
   `scripts/landings.mjs`) key on. It lands nothing. `node scripts/jobs.mjs wait <id>` waits for
   the verdict, bounded at 30 minutes, and `npm run jobs` shows each branch as `QUEUED`, `LANDED`
   or `LANDING FAILED`.

The ruleset on `main` (`scripts/landing-ruleset.mjs`) requires the merge queue and the two checks
and forbids deleting or rewriting the branch; the repository admin is the only bypass.
`npm run check:owner-setup` reports the account settings the machinery needs.

**A refusal goes back to the owning session.** A red check is fixed on the branch. A conflict with
`main` is reconciled in the branch's own worktree: merge `origin/main`, regenerate generated files
with their generators (the contracts and `package.json` have merge drivers), build, run
`npm run test:e2e:integration`, `/check`, and queue again. A landing that reached no verdict is
retried once automatically; one that reached a verdict never is. Another session, usually the
orchestrator, may queue a branch only when no live session holds it. A cloud session without `gh`
queues through `.github/workflows/cloud-queue-merge.yml`, as `queue-merge.md` describes.

`docs/BRANCHING_AND_LANDING.md` carries the worktree, landing, migration and cleanup rules with
their reasons.

## 6. Validation tiers

Each tier answers a different question. All of them live in `.github/workflows/`.

| When | Workflow | What runs |
|---|---|---|
| Every branch push and pull request | `ci.yml` | `npm run build` (the gates `scripts/gates.mjs` discovers from file headers, typecheck, lint, dependency rules, the bundle) and the CLI package; the factory-tier gates, which need a browser or servers; the E2E specs this change can affect, planned by `scripts/e2e-affected.mjs` from the merge-base with `main` and sharded by measured duration; the catalog calibration gate when the plan flags it; `Reviewed` on pull requests |
| The merge group | `ci.yml` | the same, planned from the group's base; its `CI gate` is what lets the group merge |
| Every push to `main` | `ci.yml` | the full E2E suite (a run whose commit `main` has already moved past cancels itself), a check that Vercel accepted the commit, and the red-main answers below |
| Every push to `main` | `post-land.yml`, `quarantine.yml`, `configured-suite.yml` | migrations for production and staging, then the Supabase advisors; each quarantined spec in its own job, reported as a commit status; the suite that needs a real backend, against a local Supabase stack |
| Production deployments, and four times a day | `deploy-verify.yml` | that the deployed commit is the one live, and that the site answers |
| Scheduled | `nightly.yml`, `catalog-gates.yml`, `nightly-drift.yml`, `weekly-audit.yml` and others | the full sweep and the catalog-wide gates; the catalog battery; a watch that those schedules actually ran; the weekly dependency and freshness audit |

The E2E plan fails toward running more: an unmapped file, a shared-core file or an unusable diff
base plans the full suite. `docs/VERIFICATION.md`, "E2E is TIERED", has the detail, including the
focus set that stands in for a full escalation on branches during the current sprint.

**A red main answers itself first.** When E2E shards fail on `main` or in the merge group, the
`E2E retry` job runs exactly the failed spec files once more on the same commit (branch pushes get
no second run). Fail then pass is a flake: the gate passes, and the `after-gate` job writes the
specs into `e2e/quarantine.json` through the merge queue (`scripts/e2e-quarantine.mjs`). A
quarantined spec leaves the blocking shards and is released after twenty consecutive passes. A
failed Build or Factory job on `main` also gets one re-run. A failure that survives its second run,
on a `main` whose last verdict was green, is reverted: `scripts/revert-landing.mjs` reverts
everything since that verdict on a branch and queues it, and the rolling red-main issue
(`scripts/red-main-issue.mjs`) names the pull request. These mechanical pull requests land through
the same queue (`scripts/queue-pr.mjs`). `docs/VERIFICATION.md`, "A red main answers itself
first", holds the rules.

## 7. The job queue and machine limits

Several worktrees share one machine, so heavy local work is queued rather than started.
`npm run queue -- "<command>"` (`scripts/jobs.mjs add`) returns a job id at once, and a single
runner drains the queue. The store is one JSON file per job in `<git-common-dir>/noacg-jobs/`,
so every worktree of the repository sees the same queue (`scripts/jobs-store.mjs`). `npm run jobs`
lists running and waiting jobs with the reason each one waits; `node scripts/jobs.mjs wait`, `log`
and `cancel` take a job id.

- **One browser-driving budget per machine.** Jobs are costed in suite-equivalents: an E2E suite
  or catalog battery is 1, an unrecognised command (assumed to open one browser) 0.5, a known cheap
  command such as the build 0.4. The machine runs one suite-equivalent at a time by day and two
  between 00:00 and 07:00 local time, and browser work the queue did not start counts against it.
  A landing watcher is not charged against the budget. `--cost` and `--kind sweep` declare a cost
  the guess would get wrong.
- **One E2E run per machine.** `scripts/hooks/guard-command.mjs` refuses to start an E2E suite
  while another checkout on the machine runs one; the `:queued` script forms wait their turn.
- **RAM admission.** A job starts only when free memory covers its share of a per-suite floor:
  4 GB while someone may be at the keyboard, 3.5 GB while the machine is declared away.
  `NOACG_JOBS_FREE_MB` overrides both.
- **Presence.** `npm run jobs -- presence away` declares nobody is at the machine,
  `presence present` the opposite, and `presence` alone reports what the scheduler believes
  (`node scripts/jobs.mjs presence` is the same command). A declaration lasts twelve hours, or
  `--for <minutes>` (1 to 720) as a brief override, for example to let one blocked run through.
  An expired or unreadable declaration reads as present.

`docs/JOB_RUNNER_PLAN.md` has the measurements behind these numbers.

## 8. The orchestrator

`/orchestrator` (`.agent-workflows/orchestrator.md`, with its modules in
`.agent-workflows/orchestrator/`) is a planning session: it plans a wave, launches its rows and
watches them land, and it never edits product code, merges or pushes.

It has two authorities and only two: the unsatisfied outcomes marked `(now)` in `docs/GOALS.md`,
with their done criteria, and the owner's current feedback. Handoffs, backlog items, owner
receipts, bugs and red CI are inventory; they supply tasks, not priority.

A wave is a table of rows. Each row is one session in its own worktree, with a goal, the files it
will touch, any scarce shared slot it takes (a migration number, a re-recorded baseline), a worker
pool, and whether it drives a browser. Rows are planned so they can land in any order, because
the merge queue decides the order; a row that depends on another starts when that one lands.
Every row's prompt ends by queueing its branch. In Claude Code a row is launched as one of the
agent definitions in `.claude/agents/`, which carry the model, the effort and worktree isolation.
`node scripts/wave-plan-check.mjs` must pass before a wave launches. A night wave then runs a
watch loop (`scripts/wave-watch.mjs` over `scripts/wave-tick.mjs`) until its rows have landed.

Handoffs in `docs/handoffs/` are continuation records only: a session writes one when it leaves
work unfinished, and the session that finishes the work deletes it. A running wave asks nothing.
It defers only a decision that materially changes direction, costs significantly or unusually,
changes an important external, security or privacy boundary, or is hard to reverse
(`docs/GOALS.md`, "Autonomous work"), records it, and continues with other work.
`/orchestrator-week` is the weekly session with the owner.

## 9. Measurements

| Question | Command |
|---|---|
| How long landings take, and what made the slow ones slow | `npm run metrics:landing` |
| CI runner minutes per change | `npm run metrics:ci` |
| Which merges needed a hand resolution, and in which files | `npm run metrics:conflicts` |
| How often work on one capability is forced into shared files | `npm run metrics:cochange` |
| What the instruction contracts cost a session | `npm run metrics:contracts` |
| Which instruction files reached a Claude session, and any that arrived twice | `node scripts/instruction-load-probe.mjs run <files>`, or `session <transcript or id>` for one that already ran |
| Codex chain sizes against the budget | `npm run check:shared-instructions` |
| Bytes per compiled file and the root budget | `node scripts/compile-contracts.mjs --report` |
| Instruction drift over time | `npm run audit:instructions` |

The live budgets, each enforced by a gate in the build: the root `AGENTS.md` at 3 KB
(`check:contracts`), every Codex chain at least 4 KiB under `project_doc_max_bytes` and the
orchestrator workflow's line limits (`check:shared-instructions`), and `docs/GOALS.md` under 200
lines (`check:goals-budget`). `docs/METRICS.md` is the
2026-09-06 baseline with its targets; each later measurement is its own file under
`docs/metrics/`.
