# templates/return-complete-result-never-add-limit

Rule: `templates/return-complete-result-never-add-limit`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 193-201.   **It returns the WHOLE result and the step renders a PAGE of it.** `browseTemplates` has no   limit argument and must not grow one - the total is what the step reports ("Showing 12 of   82"), and a filter's honest effect is a number the engine has to know in full to produce.   Paging is `BrowseStep`'s, over `best` then `also`, reset by any change to the filters or the   sort.  **THE STOREFRONT'S SHAPE** is owned by `src/components/wizard/AGENTS.md`, section **Browse**: the Option A two-level dropdown, style-family chips, paged "Show 12 more" results, and search as the route to a named design are drawn there.
