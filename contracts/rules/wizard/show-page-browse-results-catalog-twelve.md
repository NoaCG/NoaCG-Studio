---
v: 1
scope: src/components/wizard/steps/BrowseStep.tsx, e2e/_browse.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-show-page-browse-results-catalog-twelve.md
---
Show a PAGE of Browse results, not the catalog: twelve plus a "Show 12 more", with both numbers stated in the count line. Keep `browseTemplates` returning the WHOLE result with no limit argument, spend the limit on the RANKING and then split it into the two sections, and derive the page reset during render off a signature rather than in an effect. In specs, search for a named design and assert `resultTotal`, never a card count.
