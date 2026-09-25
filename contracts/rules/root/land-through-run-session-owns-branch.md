---
v: 1
scope: **
kind: invariant
fires: contract
status: active
since: 2026-09-07
supersedes: root/publishing-past-still-needs-user-message
record: contracts/records/root/2026-09-07-land-through-run-session-owns-branch.md
---
Land finished work with `/queue-merge` from the session that owns the branch; nobody else queues it, and nothing but the GitHub merge queue writes `main`. Anything past `main` that a later commit cannot take back, such as publishing a package or spending money, needs the owner in that message.
