---
v: 1
scope: **
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-never-occupy-checkout-holds-feature-branch.md
---
Never occupy the checkout that holds `main` with a feature branch, and never read or build there. A build there gates `main` instead of your branch while still reporting green; the build stamp is what says which.
