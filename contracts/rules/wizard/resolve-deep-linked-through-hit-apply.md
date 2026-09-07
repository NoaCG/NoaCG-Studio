---
v: 1
scope: src/components/wizard/CreationWizard.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-resolve-deep-linked-through-hit-apply.md
---
Resolve a deep-linked `#/new/<variantId>` through `pendingDesignId` and `variantById`, and on a hit apply the SAME patch a BrowseStep card click applies, jumping straight to Fields in template mode - never creating a project, because Finish stays the only door that does. An id that does not resolve falls through to the ordinary Entry-step open.
