---
v: 1
scope: src/model/id.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-always-returns-valid-rfc-4122-including.md
---
`uuid()` ALWAYS returns a valid RFC-4122 v4, including where `crypto.randomUUID` is undefined - plain-HTTP LAN hosts and CasparCG's CEF. Record ids must be real UUIDs: the cloud documents table's id column is a uuid primary key, so a non-UUID id would be rejected by Postgres and poison sync.
