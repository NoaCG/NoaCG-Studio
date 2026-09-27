---
v: 1
scope: src/**/*.tsx
kind: rule
fires: contract
status: active
since: 2026-09-27
supersedes: root/add-playwright-spec-any-new-flow
record: contracts/records/root/2026-09-27-give-any-new-flow-playwright-spec.md
---
Give any new UI flow a Playwright spec in the same commit, with its mapping in that spec's own `// covers:` header, never in a shared list.
