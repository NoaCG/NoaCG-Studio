# Worktree lifecycle and dev ports, 2026-10-08

Research for `docs/work-specs/worktree-lifecycle/`. What happened, what the code does today, and
how other tools handle the same two problems.

## What failed, traced

On 2026-10-08 about 04:00 UTC a new worktree failed `npm ci` in postinstall
(`node scripts/dev-port.mjs`): all 60 ports 5180-5298 were reserved, with 71 worktrees registered.
`npm run build` then failed three node tests with the same error. None of them starts a server.
All three reach the allocator through a config file:

| Test | Path to `allocatePort` |
| --- | --- |
| `scripts/e2e-readiness.test.mjs` | imports the three Playwright configs, which call `devPort()` / `livePort()` at load |
| `scripts/pro-harness-exemplars.test.mjs` | Vite `createServer({ middlewareMode })` loads `vite.config.ts`, which evaluates `server.port: devPort()` for every command, `build` included |
| `scripts/catalog-cost.test.mjs` | imports `catalog-cost.mjs`, which runs `main()` at import; that loads `prerender.mjs`, which loads `vite.config.ts` (traced with a resolve hook, `DEV_PORT` set so nothing was reserved) |

Every place that mints a reservation today, against what actually binds a port:

- Mint a ticket and start no server: postinstall, the SessionStart hook (every session in a linked
  worktree), `vite build`, Vite in middleware mode, every import of a Playwright config,
  `scripts/hooks/guard-command.mjs` through `portsFor()` (for the checkout a command targets), and
  about 60 sweep and bench scripts that only look for a running server.
- Mint a ticket and start a server: `scripts/dev-worktree.mjs`, Vite serve, and Playwright's
  `webServer` (run through Vite serve).

A ticket lives as long as its worktree (`scripts/port-registry.mjs`, "ownership rules"). It is
released only after the worktree is removed, and the only remover is `/cleanup-worktrees`, run by
someone from the primary checkout. So port capacity tracked worktree count, and worktree count
grew with every landing.

State at the time of writing, after someone cleaned up by hand: 16 registered worktrees, 7
tickets. 29 of 35 remote branches and 16 of 23 local branches are already contained in
`origin/main` (refs as of the last fetch). The repository has `delete_branch_on_merge: false`.

Two details that matter for the design:

- `git branch -d` judges a branch against its upstream, or against `HEAD` when it has none
  (`branch_merged()` in git's `builtin/branch.c`). Harness-created branches here have no upstream,
  so `-d` measures them against the primary checkout's local `main`, which lags `origin/main`
  because landings reach `origin` only. A branch pushed with `-u` falls back to the same `HEAD`
  once its remote branch is deleted.
- `scripts/jobs.mjs` runs a queued job in `process.cwd()` when the job's checkout no longer exists
  (`cwd: existsSync(job.checkout) ? job.checkout : process.cwd()`), so removing a worktree with a
  job still queued for it would run that job in the wrong checkout.

Found on the way, separate from this work: `catalog-cost.test.mjs` takes 17.8 s on this machine
because `catalog-cost.mjs` has no CLI guard and runs its whole measurement at import, inside every
build's node tests.

## How others solve it

### Ports

- **Pick a free port when the server starts.** `get-port` and `portfinder` take a preferred port
  or range and fall back to any free one; the Claude desktop preview does the same with
  `autoPort: true` and passes the result as `PORT`. Nothing outlives the server. The cost is a
  small race between choosing and binding, and a number that can change between restarts.
- **A fixed block per workspace.** Conductor gives each local workspace `CONDUCTOR_PORT` to
  `CONDUCTOR_PORT+9` and frees it when the workspace is archived. This is the same shape as our
  registry, and it works because Conductor owns the archive step end to end.
- **Names instead of ports.** Vercel Labs' `portless` runs a local reverse proxy and routes by
  hostname, so URLs stay stable while the real port is chosen at start. It needs a proxy and a
  locally trusted certificate authority, which is more than this problem needs.

The common thread: a port is bound either to a running server or to a workspace whose whole
lifecycle the tool owns. Ours is bound to a worktree lifecycle that nothing ends.

### Worktree cleanup

- **Claude Code CLI.** Leaving a `--worktree` session removes a clean worktree and its branch, and
  asks when there are changes or new commits. A subagent's worktree is removed when it finishes
  without changes; one with changes stays until a periodic sweep, after `cleanupPeriodDays`
  (default 30), and only with no changed, untracked or unpushed work. Claude Code holds
  `git worktree lock` while an agent runs and its sweep releases locks left by exited sessions.
  Nothing here copies ignored files out first.
- **Claude desktop app.** Archiving a session removes its worktree and branch. An optional
  "Auto-archive after PR merge or close" (Settings > Claude Code) does that when the session's
  pull request merges, for local sessions that have finished. User reports describe its worktree
  pool removing worktrees with `git worktree remove --force`, and pruning its own entry when a
  folder has gone. It does not archive ignored output either.
- **Codex app.** Keeps the 15 most recent Codex-managed worktrees in `$CODEX_HOME/worktrees`
  (here `C:/Users/ahonemi/.codex/worktrees`), deletes on archive or over the limit, saves a
  snapshot first, and spares pinned, in-progress and permanent ones. Nothing happens on merge.
- **GitHub.** "Automatically delete head branches" (`delete_branch_on_merge`) deletes a pull
  request's head branch once it merges, retargets open pull requests based on it to the base
  branch, and never touches fork branches or branches a rule protects. One dormant community
  report says merges by a GitHub App token left branches behind (discussion #63409); here a person
  enables auto-merge through `gh`, and the landing ruleset covers `main` only.
- **git on Windows.** `git worktree remove` run from another checkout deregisters the worktree and
  deletes its files while a process still sits in it, failing only on the empty folder, which the
  SessionStart sweep removes once that process exits (measured earlier, recorded in
  `scripts/cleanup-worktrees.mjs`).

## What this means here

- No vendor cleanup can replace ours. None copies ignored output out before deleting, which is the
  rule that exists because paid bench rounds were lost. Our sweep already has every safety rule;
  what it lacks is a trigger that runs without a person.
- Codex-managed worktrees already have an owner that caps them. Ours should leave them alone.
- The registry should reserve when a server is about to start, the way every tool above does, not
  when a worktree exists.

## Sources

- [Claude Code: worktrees](https://code.claude.com/docs/en/worktrees)
- [Claude Code: desktop app](https://code.claude.com/docs/en/desktop)
- [Report: desktop WorktreePool sweep](https://claudeissues.com/issue/77506-bug-desktop-app-worktreepool-maintenance-sweep-detached-the-main-repositorys-hea)
- [Report: session folder removed after a merge with auto-delete on](https://claudeissues.com/issue/64044-session-ui-goes-stale-broken-when-its-git-worktree-is-deleted-by-pr-merge-auto-d)
- [Codex: git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [GitHub: managing the automatic deletion of branches](https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-the-automatic-deletion-of-branches)
- [GitHub community discussion #63409](https://github.com/orgs/community/discussions/63409)
- [Conductor: environment variables](https://docs.conductor.build/tips/conductor-env)
- [portless](https://betterstack.com/community/guides/web-servers/portless.md)
- [get-port](https://npmjs.com/get-port)
