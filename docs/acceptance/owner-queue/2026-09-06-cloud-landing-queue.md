---
kind: walk
date: 2026-09-06
---
# The landing queue runs on GitHub

**What changed.** Phase 1 of `docs/WORKFLOW_ARCHITECTURE.md`, first half. `main` is on GitHub's
merge queue. `npm run queue:merge` pushes the branch, opens its pull request, posts the `/check`
verdict as the `noacg/reviewed` commit status, labels it and turns auto-merge on; when `CI gate`
and `Reviewed` pass, GitHub queues it, tests the queued group as one merge on `main`, and merges
it in order. The ruleset "main is landed by the queue" requires the queue and the two checks and
forbids deleting or rewriting `main`; you are the one bypass. Nothing on your laptop is in the
landing path. Every landing is a push to `main`, so `main`'s full suite, the configured suite and
the migrations (`post-land.yml`, from the Production environment's token) run by themselves.
Branch pushes plan CI from the fork point, and a `main` run that is already superseded cancels
itself instead of re-running the full suite.

**Route, under a minute.** Open any recent pull request: the checks list shows `CI gate` and
`Reviewed`, and a queued one shows "in the merge queue". Settings, Rules, Rulesets shows the
ruleset with "Require merge queue" on. `npm run jobs` lists the recent landings, pulled from the
merged pull requests.

**What to look at.** Whether a dropped landing reads as help on the pull request (the local
watcher names the failed check), and whether you want the admin bypass removed after a week of
landings (the plan keeps it for emergencies).
