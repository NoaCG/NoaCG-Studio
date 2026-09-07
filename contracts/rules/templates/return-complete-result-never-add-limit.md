---
v: 1
scope: src/templates/search.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-return-complete-result-never-add-limit.md
---
Return the complete result from `browseTemplates` and never add a limit argument. Leave pagination to `BrowseStep`, over `best` then `also`, resetting on every filter or sort change and retaining the full total.
