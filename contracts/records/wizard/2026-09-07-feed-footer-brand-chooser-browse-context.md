# wizard/feed-footer-brand-chooser-browse-context

Rule: `wizard/feed-footer-brand-chooser-browse-context`. Recorded 2026-09-07 on `claude/wizard-rules` at 32e60266.

The paging signature is built from the filters and the sort only, so a brand change reorders the list in place. That is deliberate; the contract used to say the page resets on any result change, which was too strong.

## Recorded 2026-09-09 on `claude/b-browse-page-reset-signature` at c5840fb0.

Measured on claude/b-browse-page-reset-signature: Browse narrowed to lower thirds (93 results), Show 12 more pressed once, then the saved glass brand chosen in the footer. The 24 cards stayed 24, the count line read "Showing 24 of 93", the brand family led the grid, and the shown names equalled the first 24 of browseTemplates with brandFamily glass exactly - no stale card survived the change. The rule holds by measurement, not only by intent. It was re-filed as a defect on 2026-09-09 (docs/backlog/browse-page-reset-key-omits-brand-and-hidden.md, now deleted) because the code comment above the paging key still carried the pre-2026-09-07 wording this rule withdrew. The comment now states the rule, and e2e/wizard-filters.spec.ts pins the behaviour so the collapse-to-twelve change cannot land green.
