# Worktree lifecycle: finished work cleans itself up, builds never need ports

Status: AGREED - the owner answered `questions.md` on 2026-10-08. Research:
`docs/research/worktree-lifecycle-2026-10-08.md`.

## Why

On 2026-10-08 a new worktree could not install and a build failed three node tests, because all 60
dev ports were reserved by 71 worktrees. Nothing involved was starting a server. A port was reserved
when a worktree first resolved one (postinstall, session start, any load of the Vite or Playwright
config) and released only after the worktree was removed. Only `/cleanup-worktrees`, run by someone
from the primary checkout, removed worktrees. So landed work piled up, and the ports went with it.

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
- `catalog-cost.mjs` running its measurement at import (`docs/backlog/catalog-cost-test-runs-the-measurement-on-import.md`).

## Owner answers (2026-10-08)

1. Remove landed worktrees under `.claude/worktrees/` automatically, desktop-app and `agent-*` ones
   included, never Codex's, never unlanded. A session whose work landed must not "just disappear":
   never remove a worktree a live session holds, and make a resumed chat's follow-up work with
   nothing for the owner to run.
2. `delete_branch_on_merge` is ON (set by the owner). The lease-guarded local delete stays as the
   fallback; `post-land.yml` is unchanged.
3. Remove worktrees with no commits of their own after 3 idle days.
4. Keep the desktop app's "Auto-archive after PR merge or close" OFF (documented in
   `.agent-workflows/cleanup-worktrees.md`).
5. Idle hold after landing: desktop session worktrees 24 hours, `agent-*` worktrees 2 hours.

## Decisions

### Ports are reserved by starting a server

1. **Asking never reserves and never throws.** `devPorts()` answers the `DEV_PORT` override, 5174
   in the primary checkout, this checkout's ticket, or the port a server start would take now
   (`peekPort`: preference, walk, then decision 3). When even that finds nothing it answers 0,
   never the preference: that belongs to another live worktree, and a suite waiting there would
   adopt its server. Config files, tests, hooks, sweeps and postinstall all ask; none writes a
   ticket.
2. **Only a server start reserves** (`claimDevPorts`). Vite's `noacg-dev-port` plugin reserves when
   a dev or preview server is about to listen - not for `build`, not in middleware mode - and
   `dev:worktree` reserves before it starts Vite. The Playwright configs and `dev:worktree` pass the
   port explicitly, so Vite reserves exactly that number or refuses to start. A checkout that holds
   a ticket gets it back.
3. **A full registry takes back an idle reservation instead of failing.** The least recently
   claimed ticket whose port and live port answer nothing and which nobody claimed for ten minutes.
   A claim refreshes the ticket's mtime; the ticket is renamed away and re-checked before it is
   replaced. No process is ever signalled.
4. Postinstall writes `.claude/launch.json` from the read-only answer and exits 0 whatever happens.
   Session start prints the port, marked "reserved when a server starts" until one does.

### An unattended sweep removes finished worktrees

5. **`node scripts/cleanup-worktrees.mjs --unattended`** runs the existing assessment and apply,
   narrowed by `unattendedPlan`: a removal must also be under `<primary>/.claude/worktrees/` on a
   managed branch, LANDED (the landing ledger names the branch) or with no commits of its own, quiet
   for its window (landed `agent-*` 2 h, other landed 24 h, no commits of its own 3 days) by its
   Claude transcripts AND by its HEAD's last movement (no transcript is not proof of quiet: a
   worktree made a minute ago has none), and have no queued or running job. Anything that needs a
   person is written to
   `<git-common-dir>/noacg-cleanup/last.json` (report in `last.txt`) and never acted on; the
   orchestrator home's session start prints the count.
6. **Triggers:** session start and `land-watch.mjs` after a landing spawn it detached from the
   primary checkout, running the PRIMARY CHECKOUT'S copy of the script (fast-forwarded first when
   safe), so a destructive sweep only ever runs landed code, never a feature branch's. It runs at
   most once per 30 minutes, takes a lock that `--apply` also takes, and starts only on Windows
   (decision 7 depends on it). `NOACG_NO_AUTO_CLEANUP=1` is the off switch.
7. **A worktree in use is never touched.** Every sweep removal (manual or unattended) first moves
   the worktree aside with `git worktree move` - before archiving anything - and Windows refuses
   that rename while any process has its working directory or an open file inside (measured:
   EBUSY/EPERM). That refusal is a skip ("in use"), not an error; any other refusal is an error.
   This replaces the old behaviour where `git worktree remove` deleted every file under a live
   process and failed only on the empty folder. `--self` keeps removing its own session's
   worktree, which is its purpose.
8. **Branches.** Before assessing, the sweep fast-forwards a clean primary `main` to `origin/main`
   (the handoff workflow's own rule), so the documented "contained in local main and origin/main"
   rule holds for landed branches. `git branch -d` stays the backstop and is pointed at
   `origin/main` first (its upstream), because harness branches have none and git would otherwise
   judge them against the primary's `HEAD`. GitHub deletes remote branches at merge; the
   lease-guarded remote delete stays as the fallback.
9. **A chat the owner comes back to** (`scripts/worktree-followup.mjs`, from the SessionStart
   hook): (a) a session that starts in a worktree whose branch landed, with a clean tree and
   nothing unlanded, is moved to a fresh branch cut from `origin/main` (not on a compaction);
   (b) a RESUMED session whose transcript says it last worked in a worktree that is now gone gets a
   fresh worktree at the same path on a new branch from `origin/main`, and is told to enter it
   with `EnterWorktree`. Both refuse on any doubt and never delete anything.

### Rejected

- **Ports leased only to a running process:** loses the stable number Vite, Playwright,
  `launch.json` and the sweeps each derive.
- **More ports:** the same failure, later.
- **The desktop app's auto-archive or Claude Code's `cleanupPeriodDays` sweep as the mechanism:**
  neither archives ignored output first.
- **A Windows scheduled task:** a standing machine setting for something session starts and
  landings already trigger.
- **Deleting branches against `origin/main` only, without the fast-forward:** would relax the
  documented branch rule; the fast-forward keeps it true instead.

## Acceptance

### AC-1: a landed branch's worktree, local branch, remote branch and port reservation disappear with nobody running a command

- A branch lands through the queue; GitHub deletes its remote branch at merge. Once its session has
  been quiet for its window, the next session start or landing removes the worktree, deletes the
  local branch with `git branch -d` and releases its ticket.
- Evidence: `scripts/worktree-unattended.test.mjs` (real repositories, origin/main moved the way
  the queue moves it, local main lagging), plus the real repository's unattended dry assessment.

### AC-2: the safety rules of `.agent-workflows/cleanup-worktrees.md` hold when nobody is watching, and a worktree in use is never touched

- Dirty, mid-operation, locked, live session, queued job, unarchivable or lone-secret: skipped,
  recorded, nothing deleted. Unlanded commits, detached, primary, orchestrator home, outside
  `.claude/worktrees/`: untouched. A worktree a process is in: left exactly as it is, removed on a
  later run once free. No `--force`, no `-D`, no remote delete without an exact-head lease.

### AC-3: a build or test that starts no server takes no port

- With no `DEV_PORT` set, `npm run build` and `node --test` over
  `scripts/catalog-cost.test.mjs`, `scripts/e2e-readiness.test.mjs` and
  `scripts/pro-harness-exemplars.test.mjs` leave the registry exactly as they found it.

### AC-4: with every port reserved, a fresh worktree installs and builds

- A scratch clone with 60 registered worktrees, each holding a ticket. A fresh worktree runs
  `npm ci` and `npm run build`; both exit 0 and the registry is unchanged.

### AC-5: a server start does not fail on ports while any reservation is idle

- Derived, not asked for by the owner. 60 tickets, nothing listening on one of them: a server start
  in a fresh worktree reclaims it. With every one claimed recently it refuses and lists the holders.

### AC-6: a desktop chat whose work landed can take a follow-up with nothing for the owner to run

- A session starting in a landed worktree is moved to a fresh branch from `origin/main`. A resumed
  session whose worktree was cleaned up gets a fresh worktree at the same path and is told to enter
  it. Evidence: `scripts/worktree-followup.test.mjs` drives the real SessionStart hook. What the
  desktop app itself does when it reopens a chat whose folder is gone could not be driven from here
  (see `evidence/`).

## Preserved behaviour

- A worktree keeps its port number across restarts while the registry has room.
- Primary checkout 5174/5175; `DEV_PORT` overrides everything and reserves nothing.
- Manual `/cleanup-worktrees` and `--self` work as before, except that a worktree in use is now
  skipped instead of emptied.
- Nothing ever kills a process it did not start.
