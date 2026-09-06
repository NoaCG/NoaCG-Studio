---
kind: walk
date: 2026-09-06
---
# The landing queue runs on GitHub

**What changed.** Phase 1 of `docs/WORKFLOW_ARCHITECTURE.md`, first half. `npm run queue:merge`
now pushes the branch, opens its pull request, posts the `/check` verdict as the
`noacg/reviewed` commit status and adds the `land` label; `.github/workflows/land.yml` runs
`scripts/land.mjs` for one labelled pull request at a time on a GitHub runner: merge `main` in,
a `ci.yml` run on exactly that commit, fast-forward `main` on green. Refusals (a conflict, a red
run, no verdict) are written on the pull request. Nothing on your laptop is in the landing path
any more. `npm run land:ruleset -- --apply` created the ruleset that lets only that workflow and
you push `main` (you said yes to it on 2026-09-06). Branch pushes now plan CI from the fork
point, and a `main` run that is already superseded cancels itself instead of re-running the
full suite.

**Route, under a minute.** Open the Actions tab, workflow "Land", and read the last few runs:
each names the pull request it landed or why it refused. Then Settings, Rules, Rulesets shows
"main is landed by the queue" with its two bypass actors. `npm run jobs` still lists the recent
landings, now pulled from the merged pull requests.

**What to look at.** Whether a refusal comment reads as help, and whether you want the
repository-admin bypass on the ruleset removed once the lander has landed a week of work (the
plan keeps it for emergencies).
