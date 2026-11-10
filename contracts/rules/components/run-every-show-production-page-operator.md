---
v: 1
scope: src/components/home/ProductionPage.tsx, src/components/OldControlLink.tsx
kind: rule
fires: contract
status: active
since: 2026-11-10
supersedes: components/build-playout-dashboard-desktop-production-page, components/drive-both-monitors-locally-published-payload, components/carry-app-page-whole-operator-block
record: contracts/records/components/2026-11-10-run-every-show-production-page-operator.md
---
Run every show from the production page, the one operator surface of `docs/PLAYOUT_DASHBOARD.md`: a second operator signs in and opens the same production, a no-account mode would be a mode of this page and never a second page, and `?control=<slug>` only forwards an old link to `#/production/<id>` (`components/OldControlLink.tsx`).
