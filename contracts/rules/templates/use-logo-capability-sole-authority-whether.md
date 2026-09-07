---
v: 1
scope: src/templates/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-use-logo-capability-sole-authority-whether.md
---
Use the logo capability as the sole authority for whether a design can offer and draw a logo, following `docs/MARK_CAPABILITY_AUDIT.md`. Gate logo CSS on `logoEnabled` whenever the field is gated, so a disabled slot does not change the default design.
