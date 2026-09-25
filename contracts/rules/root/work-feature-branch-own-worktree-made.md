---
v: 1
scope: **
kind: rule
fires: contract
status: active
since: 2026-09-07
supersedes: root/never-occupy-checkout-holds-feature-branch
record: contracts/records/root/2026-09-07-work-feature-branch-own-worktree-made.md
---
Work on a feature branch in its own worktree, made before the work starts, and commit each verified phase. Never work or build in the checkout that holds `main`: a build there gates `main` while reporting green for your branch.
