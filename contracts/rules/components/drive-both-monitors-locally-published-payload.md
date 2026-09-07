---
v: 1
scope: src/components/HostedControlPage.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-drive-both-monitors-locally-published-payload.md
---
Drive both monitors locally from `PayloadStage`: the published payload already carries every graphic's code, so PREVIEW is a stage this page drives itself and PROGRAM is a second one driven by the shared LOG, which is what makes it show a take from somebody else's device. Replay each live layer's last REPORTED data into PROGRAM on boot - safe HERE because this stage drives nothing but itself, and not safe in an exported package.
