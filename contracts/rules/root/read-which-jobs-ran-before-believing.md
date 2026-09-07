---
v: 1
scope: **
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-read-which-jobs-ran-before-believing.md
---
Read WHICH JOBS RAN before believing a green run, and re-run an unchanged sha before bisecting a job that stopped at its own `timeout-minutes`. A stop at the cap is not a verdict, and a green run is not one either until you have read the job list.
