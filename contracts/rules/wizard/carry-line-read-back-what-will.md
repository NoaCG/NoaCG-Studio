---
v: 1
scope: src/components/wizard/steps/ai/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-carry-line-read-back-what-will.md
---
Carry a one-line read-back of what will actually run on the settings button, so the common case needs no click. The panel is NOT a popover: it opens ITSELF whenever nothing is configured, and a floating sheet would cover the controls it exists to make work.
