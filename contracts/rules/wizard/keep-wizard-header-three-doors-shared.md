---
v: 1
scope: src/components/wizard/CreationWizard.tsx, src/components/home/HomePage.tsx, e2e/wizard-shell.spec.ts
kind: invariant
fires: contract
status: active
since: 2026-09-28
supersedes: wizard/keep-three-header-doors-distinct-destinations
record: contracts/records/wizard/2026-09-28-keep-wizard-header-three-doors-shared.md
---
Keep the wizard header's three doors in the shared `.shell-nav` that Home's topbar also wears, at the same positions: the brand lockup is an `<a href="/">` to the public front page, `wz-home` goes Home, and `wz-new-graphic` is the shared NewGraphicButton. Mark the page you stand on `aria-current="page"` and never render it as a button - `wz-new-graphic` on Entry, Home on Home's dashboard. Mid-walk `wz-new-graphic` is a guarded start-over that keeps the draft, Home stays one press from every step, and the close control only rewinds to the front page.
