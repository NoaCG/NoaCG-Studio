---
v: 1
scope: **
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-version-every-persisted-format-ship-breaking.md
---
Version every persisted format, and ship a breaking change together with its migration in the same commit. Additive optional fields never bump the version; a breaking change bumps it and migrates ON READ so everything downstream sees one shape; serialization always writes the current version; an unknown version degrades to read-only rather than crashing.
