---
v: 1
scope: src/components/wizard/CreationWizard.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-list-saved-brands-name-footer-brand.md
---
List SAVED brands by name in the footer brand chooser and show no control at all when there are none - never a disabled one. It starts at None even when one brand is the default, because matching is explicit; creating inside a PRODUCTION is the one exception, where a show that names a brand preselects it and one that only captured a look is offered that look under a synthetic entry.
