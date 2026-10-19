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

Codex cloud: preserve owner binding `ccarenv_b64_Y2NhcmVudl8xNmNlODA4YjUyMzQ4MTkxYWE1ZmI1ZDQ0OGU1NGIzNA`; qualify CLI mapping separately.
At Codex cloud startup, run the network preflight in `.agent-workflows/cloud-delegate.md` with the shell tool's network permission.
