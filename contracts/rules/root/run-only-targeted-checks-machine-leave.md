---
v: 1
scope: **
kind: rule
fires: contract
status: retired
since: 2026-10-09
supersedes: root/verify-proportion-change-against-spec-acceptance, root/let-pre-merge-gate-laptop-does
record: contracts/records/root/2026-10-09-run-only-targeted-checks-machine-leave.md
---
Run only targeted checks on this machine and leave full builds and browser suites to GitHub Actions, because the machine must stay responsive for the agents sharing it. Verify in proportion to the change and against the spec's acceptance criteria with `/check`. Only what needs human judgment reaches the owner: a check in the pull request comment, a decision as a `needs owner` issue.
