---
v: 1
scope: src/components/video/VideoAppShell.tsx, src/components/home/GraphicControlPage.tsx, src/components/home/HomePage.tsx, src/components/home/ProductionPage.tsx
kind: invariant
fires: contract
status: active
since: 2026-09-24
supersedes: components/make-logo-every-header-real-link
record: contracts/records/components/2026-09-24-link-logo-every-header-public-front.md
---
Link the logo in every header to the public front page, never a Home door, and follow it with the same trio - Home, then the new-graphic door - all LEFT of the bar's `.spacer` and none of them wearing `primary`, because amber is the on-air accent. Home is the crumb on Home and a labelled Home control everywhere else. `e2e/project.spec.ts` pins the order, the before-the-spacer position and the logo's link on every studio surface.
