---
source: derived
---
# A fresh worktree fails the build for a missing install, and says something else

**Filed:** 2026-09-06. **Source:** build feedback, `claude/noacg-task-skill-3dc224`

## Why

`git worktree add` does not populate `node_modules`, and a worktree made before a dependency
landed carries a `node_modules` that no longer matches `package.json`. On 2026-09-06 this
worktree failed `npm run build` on a markdown-only change with two failing script tests
(`pro-harness.test.mjs`, `pro-harness-exemplars.test.mjs`), a `TypeError: fetch failed` and
`TS2307: Cannot find module 'ai'`. The cause was that the `ai` package had never been installed
here; `npm install` fixed all of it.

The cost is not the install, it is the diagnosis. Every symptom points at the AI harness, so a
session reads three unfamiliar failures on a branch that touched neither and starts investigating
someone else's code - or worse, believes it broke something. That is minutes at best and a wrong
fix at worst, and it fires for every worktree that outlives a dependency change.

## What it would take

A preflight that compares installed packages against `package.json` and says the one useful
sentence. Cheapest honest version: at the top of the build, check that every dependency resolves
and fail with "run `npm install` in this worktree" if one does not - before tsc and the script
tests get a chance to report it as something else. The worktree-creation path could also just run
the install, but that is slower and does not help a worktree that already exists.

## Evidence

- `npm run build` on 2026-09-06 in `.claude/worktrees/new-session-a06227` with only two markdown
  files changed: exit 1, `fail 2`, `TS2307: Cannot find module 'ai'`. `npm install` then `npm run
  build`: exit 0.
- `package.json` declares `ai@^7.0.93`; `node_modules/ai` did not exist.
