---
v: 1
scope: cli/**, .github/workflows/release-cli.yml
kind: rule
fires: contract
status: active
since: 2026-09-20
record: contracts/records/cli/2026-09-20-write-every-published-text-person-who.md
allow-numbers: true
---
Write every published text for the person who reads it cold: a release's notes are the version's own section of cli/CHANGELOG.md, saying what was wrong or missing, what it does now and what the reader has to do. Never publish generated notes, a list of pull request titles, a username or an internal name; the same standard as a commit message and a pull request description applies to anything that leaves the repository.
