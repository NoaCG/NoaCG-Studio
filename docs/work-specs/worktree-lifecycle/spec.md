# Worktree lifecycle: finished work cleans itself up, builds never need ports

Status: DRAFT for the owner's answers in `questions.md`. Research:
`docs/research/worktree-lifecycle-2026-10-08.md`.

## Why

On 2026-10-08 a new worktree could not install and a build failed three node tests, because all 60
dev ports were reserved by 71 worktrees. Nothing involved was starting a server. A port is reserved
when a worktree first resolves one (postinstall, session start, any load of the Vite or Playwright
config) and released only after the worktree is removed. Only `/cleanup-worktrees`, run by someone
from the primary checkout, removes worktrees. So landed work piles up, and the ports go with it.

## Goal

Finished work cleans itself up for good, without anyone running `/cleanup-worktrees`, and a build
never fails on ports.

## Non-goals

- Changing what makes a deletion safe. Containment against a fresh `origin/main`, the three classes
  of ignored files, archive-then-verify, no `--force`, no `-D`, no branchless worktree: all stay.
- Removing work that has not landed, or worktrees outside `<primary>/.claude/worktrees/` (the Codex
  app's own worktrees in `~/.codex/worktrees` are capped by the Codex app).
- Changing the desktop app's or the Codex app's settings from a script.
- A bigger port range, or a reverse proxy instead of ports.
- `catalog-cost.mjs` running its measurement at import (found while tracing, a separate item).

## Decisions

Owner requirements are the goal and the acceptance in the row. Everything below is derived; the
choices the owner would notice are in `questions.md` and marked Q1-Q5 here.

### Ports are reserved by starting a server

1. **Resolving a port never reserves one and never throws.** `devPorts()` answers, in order: the
   `DEV_PORT` override, 5174 in the primary checkout, this checkout's ticket, or else the port a
   reservation would take right now (its preference, then the walk, skipping ports held by an
   active worktree or answering TCP, then decision 3). When even that finds nothing it answers the
   preferred port. It writes no ticket. Config files, tests, hooks, sweeps and postinstall all use
   this.
2. **Only a server start reserves.** Vite reserves in a small plugin `config` hook when it is about
   to listen (dev server or preview): not for `build`, not in middleware mode. `vite.config.ts`
   stops calling `devPort()` eagerly. The Playwright `webServer` commands and `dev:worktree` pass
   the port they resolved explicitly, so Vite reserves exactly that port and fails loudly if another
   worktree took it in the seconds between, instead of serving where the tests are not looking.
   A reservation is idempotent: a checkout that holds a ticket gets that ticket back.
3. **A full registry gives up an idle reservation instead of failing.** When every port is held, a
   reservation reclaims the least recently claimed ticket whose port and live port both answer
   nothing and which was claimed more than ten minutes ago. Its worktree takes a new number at its
   next server start. No process is ever signalled. A ticket records `claimedAt`, refreshed on
   every claim.
4. Postinstall keeps writing `.claude/launch.json` from the read-only answer and exits 0 whatever
   happens. Session start prints the reserved port, or the port a server would get, and reserves
   nothing.

### An unattended sweep removes landed worktrees

5. **`node scripts/cleanup-worktrees.mjs --unattended`** runs the existing assessment and applies
   only items that are safe by every current rule AND eligible:
   - the worktree is under `<primary>/.claude/worktrees/` and its branch is in a managed namespace
     (`claude/`, `codex/`, `worktree-agent-`);
   - the branch LANDED: the landing ledger (`landed.jsonl`, kept in sync with GitHub's merged
     `land` pull requests) names it, and its tip is contained in a freshly fetched `origin/main`
     (Q1). Optionally (Q3) also a branch whose tip is on `origin/main` with no landing, idle for
     three days;
   - its Claude session has been idle for the existing two-hour hold (Q5);
   - no job is pending or running for that checkout in the job store (a queued job would otherwise
     run in the runner's own directory).
   Anything that needs a person is never acted on; it is written to
   `<git-common-dir>/noacg-cleanup/last.json`, and the orchestrator home's session start prints one
   line when that list is not empty.
6. **Triggers, both automatic:** session start (after the primary is reattached to `main`) and
   `land-watch.mjs` right after it records a landing. Each spawns the sweep detached, from the
   primary checkout, with its own checkout's copy of the script. The sweep takes a lock and skips if
   one ran in the last 30 minutes; the manual `/cleanup-worktrees --apply` takes the same lock.
7. **Remote branches:** GitHub deletes the head branch when the pull request merges (Q2). The
   sweep keeps its lease-guarded deletion of contained managed branches as the fallback.
8. **`git branch -d` stays the backstop, measured against `origin/main`.** After its own
   containment check the sweep sets the branch's upstream to `origin/main` and then runs `-d`.
   Today `-d` measures harness branches against the primary checkout's local `main`, which lags,
   and a branch whose remote was deleted falls back to the same `HEAD`.
9. Removal releases the port ticket and an empty leftover folder is swept later, as today.

### Rejected

- **Ports leased only to a running process (port 0, pid leases):** loses the number that Vite,
  Playwright, `launch.json` and the sweeps each derive on their own; decisions 2 and 3 keep it
  stable in the normal case.
- **More ports:** the same failure, later.
- **The desktop app's auto-archive or Claude Code's `cleanupPeriodDays` sweep as the mechanism:**
  neither archives ignored output first, the desktop one force-removes, and the CLI one waits 30
  days and skips agent worktrees with commits.
- **Cleaning only from `land-watch`:** the landing session spoke minutes earlier, so the idle hold
  refuses its own worktree and a second trigger is needed anyway.
- **A `post-land.yml` step deleting the head branch:** the same outcome as the GitHub setting with
  more code. It is the fallback if Q2 is no.
- **A Windows scheduled task:** a standing machine setting for something session starts and
  landings already trigger.

## Acceptance

### AC-1: a landed branch's worktree, local branch, remote branch and port reservation disappear with nobody running a command

- A branch lands through the queue. GitHub deletes its remote branch at merge. Once its session has
  been idle for two hours, the next session start or landing removes the worktree, deletes the
  local branch with `git branch -d` and releases its ticket. `git worktree list`, `git branch`,
  `git ls-remote --heads origin` and `node scripts/dev-port.mjs --list` no longer show it.
- Evidence: an end-to-end run in a scratch repository with a local bare remote, plus the real
  repository's dry run listing this wave's landed worktrees as eligible after the hold.

### AC-2: the safety rules of `.agent-workflows/cleanup-worktrees.md` hold when nobody is watching

- A landed worktree that is dirty, mid-bisect or mid-rebase, locked, in use by a live session, has
  a queued job or a running Codex delegation, holds a secret with no other copy, or holds output
  that cannot be archived: skipped, reported, nothing deleted.
- A landed worktree holding valuable ignored output: archived and verified before removal.
- A branch with commits not on `origin/main`, a detached worktree, the primary checkout, the
  orchestrator home, a worktree outside `.claude/worktrees/`: untouched.
- No `--force`, no `-D`, no remote delete without an exact-head lease.

### AC-3: a build or test that starts no server takes no port

- With no `DEV_PORT` set, `npm run build` and `node --test` over
  `scripts/catalog-cost.test.mjs`, `scripts/e2e-readiness.test.mjs` and
  `scripts/pro-harness-exemplars.test.mjs` leave the registry exactly as they found it.

### AC-4: with every port reserved, a fresh worktree installs and builds

- A scratch clone with 60 registered worktrees, each holding a ticket. A fresh worktree runs
  `npm ci` and `npm run build`; both exit 0 and the registry is unchanged.

### AC-5: a server start does not fail on ports while any reservation is idle

- Derived, not asked for by the owner. 60 tickets, nothing listening on one of them: `npm run dev:worktree` in a fresh worktree
  reclaims that ticket and serves. With all 60 listening it refuses and lists the holders.

## Preserved behaviour

- A worktree keeps its port number across restarts while the registry has room.
- Primary checkout 5174/5175; `DEV_PORT` overrides everything and reserves nothing.
- Manual `/cleanup-worktrees` and `--self` work as today.
- Nothing ever kills a process it did not start.

## Phase 2 files

`scripts/port-registry.mjs`, `scripts/dev-port.mjs`, and three files not in the row's TOUCHES:
`vite.config.ts` (the eager `devPort()` is there), `playwright.config.ts` and
`playwright.catalog.config.ts` (one `--port` each); `scripts/dev-worktree.mjs` if it does not
already pass the port in every mode; `scripts/cleanup-worktrees.mjs`, `scripts/worktree-cleanup-lib.mjs`,
`scripts/land-watch.mjs`, `scripts/hooks/session-start.mjs`, their tests, `docs/DEV_PORTS.md`,
`.agent-workflows/cleanup-worktrees.md`, `docs/BRANCHING_AND_LANDING.md`. `post-land.yml` only if
Q2 is no. `package.json` only if a script entry is needed. Gate: `npm run build`, the port and
cleanup unit tests, and the AC-4 simulation.
