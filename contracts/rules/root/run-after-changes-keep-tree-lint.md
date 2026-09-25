---
v: 1
scope: **
kind: rule
fires: contract
status: active
since: 2026-09-07
supersedes: root/read-build-own-exit-code-never
record: contracts/records/root/2026-09-07-run-after-changes-keep-tree-lint.md
---
Run `npm run build` after changes and read its own exit code, never a pipe's. Keep lint clean without disable comments. There are no unit tests, so observable work also needs a real check in the browser.
