---
v: 1
scope: .github/workflows/release-cli.yml, scripts/release-cli.mjs, cli/**
kind: trap
fires: gate:release-cli
status: active
since: 2026-09-10
record: contracts/records/root/2026-09-10-repository-rename-breaks-npm-trusted-publishing.md
---
A repository rename breaks npm trusted publishing until the owner deletes and re-adds the connection, because npm matches an exact organisation, repository and workflow filename, never follows a rename, and answers the refused publish with a 404 on the PUT that names none of them.
