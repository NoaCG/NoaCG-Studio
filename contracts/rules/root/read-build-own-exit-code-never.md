---
v: 1
scope: **
kind: trap
fires: contract
status: active
since: 2026-09-06
record: contracts/records/root/2026-09-06-read-build-own-exit-code-never.md
---
Read a build's own exit code, never a pipeline's: `npm run build > log 2>&1; echo $?`, because piping the build through `tail` or `head` reports the pipe's status and a failing gate reads as green.
