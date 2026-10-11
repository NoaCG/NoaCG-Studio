---
v: 1
scope: **
kind: rule
fires: contract
status: active
since: 2026-10-09
supersedes: root/run-only-targeted-checks-machine-leave
record: contracts/records/root/2026-10-09-verify-against-spec-acceptance-criteria-proportion.md
---
Verify against the spec's acceptance criteria with `/check`, in proportion to the change: run only targeted checks on this machine and leave full builds and browser suites to GitHub Actions, so the machine stays responsive for the agents sharing it. Only what needs human judgment reaches the owner, never as a note to read later: a look goes in the pull request comment, and a decision is asked in the session at once, or decided and recorded in the pull request when unattended (`.agent-workflows/verify.md`, step 5).
