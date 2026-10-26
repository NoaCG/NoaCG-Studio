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
Verify acceptance criteria with `/check` and `.agent-workflows/verify.md`: targeted locally, bounded on the cloud worker, full checks in GitHub Actions. Local implementation, review and targeted verification need no permission. Use `cloud-delegate` when useful; keep device/private-local work local. Send human judgment to the owner as that procedure requires.
