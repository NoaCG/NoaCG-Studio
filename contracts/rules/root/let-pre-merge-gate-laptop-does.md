---
v: 1
scope: **
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-let-pre-merge-gate-laptop-does.md
---
Let CI be the pre-merge gate, not the laptop: it does strictly more, on a clean checkout. A clean `git merge main` is not proof the integration worked, because both sides were verified against a tree that no longer exists - after taking `main` in, run the integration plan from the FORK POINT so it covers both sides.
