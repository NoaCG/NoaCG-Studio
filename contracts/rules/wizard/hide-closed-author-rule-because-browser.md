---
v: 1
scope: src/styles/wizard-and-dialogs.css, e2e/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-hide-closed-author-rule-because-browser.md
---
Hide a closed `<details>` with an author rule - `details:not([open]) > *:not(summary) { display: none }` - because the browser own `display: none` on non-summary children loses to ANY author `display`, and the Style step disclosures wrap a flex row. Assert measured HEIGHT is 0 in specs, never the `open` attribute.
