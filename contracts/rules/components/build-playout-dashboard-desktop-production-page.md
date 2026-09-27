---
v: 1
scope: src/components/HostedControlPage.tsx, src/components/home/ProductionPage.tsx
kind: rule
fires: contract
status: active
since: 2026-09-27
supersedes: components/render-playout-dashboard-identically-hosted-page
record: contracts/records/components/2026-09-27-build-playout-dashboard-desktop-production-page.md
---
Build THE PLAYOUT DASHBOARD of `docs/PLAYOUT_DASHBOARD.md` for the desktop production page first: it is the surface that must work, and its design leads. The hosted `?control=<slug>` page is a best-effort companion for a phone or a second operator: it follows the dashboard where that is cheap and may look different or lack controls, and a control that needs the operator's own NoaCG Bridge lives only on the production page. A change must never break what the hosted page already does.
