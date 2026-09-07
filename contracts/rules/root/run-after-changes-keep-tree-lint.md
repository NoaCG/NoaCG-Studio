---
v: 1
scope: **
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-run-after-changes-keep-tree-lint.md
---
Run `npm run build` after changes and keep the tree lint-clean rather than adding disable comments. There is no application unit-test suite, so never mark observable work done on a green build alone.
