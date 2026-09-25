# Scheduled sessions start in a checkout that no longer follows main

**Filed:** 2026-09-26. **Source:** measurement while verifying how instructions load.

## Why

The desktop app's scheduled tasks (daily morning brief, weekly owner session, the monthly
reviews) start their sessions in the primary checkout, `C:\claude\NoaCG-Studio`. That checkout's
`main` stopped moving when landing moved to GitHub's merge queue: nothing fast-forwards it any
more, and `scripts/main-ref.mjs` already makes scripts read `origin/main` for that reason. But a
session reads its INSTRUCTIONS, settings and hooks from the checkout it starts in, and nothing
covers that. So every scheduled run gets whatever instruction system was current when the
checkout last moved - on 2026-09-26 that was `be901f39`, from before the always-loaded cut
(41 KB of instructions instead of about 7 KB, the old question hook, relative hook paths) - and
runs scripts of the same age.

## What it would take

Pick one, measured rather than assumed:

- **Fast-forward at session start.** `scripts/hooks/session-start.mjs` already reattaches `main`
  in the primary checkout when that is safe (`scripts/reattach-main.mjs`). It could also fetch and
  `git merge --ff-only origin/main` there when the tree is clean and on `main`, and say when a
  dependency change needs `npm ci`. SessionStart hooks run after instructions load, so a session
  would always be one run behind.
- **Start scheduled work somewhere current.** Each scheduled prompt opens by entering a checkout
  that tracks `origin/main` - the orchestrator home (`scripts/orchestrator-home.mjs` keeps it
  detached there and fast-forwards it) or a fresh worktree via EnterWorktree. Whether instruction
  files reload after the switch has to be measured, not assumed.
- **Move the checkout before the first run.** A small scheduled job fast-forwards the primary
  checkout before the 07:01 brief.

The root rules still hold: no feature branch in the primary checkout, no build there.

## Evidence

- `git worktree list` on 2026-09-26: the primary checkout at `be901f39 [main]` while `origin/main`
  had #420 (the always-loaded cut) and #421 (load-once) on top.
- The 2026-09-25 morning brief transcript (`~/.claude/projects/C--claude-NoaCG-Studio/`, session
  `d0fc345b`) records `cwd: C:\claude\NoaCG-Studio`, `entrypoint: claude-desktop`, and its start-up
  instructions loaded the checkout's root `AGENTS.md`.
- `node scripts/instruction-load-probe.mjs session <id>` shows what any scheduled run received.
