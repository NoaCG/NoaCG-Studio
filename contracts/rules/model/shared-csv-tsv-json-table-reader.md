---
v: 1
scope: src/model/csv.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-shared-csv-tsv-json-table-reader.md
---
`csv.ts` is the shared CSV, TSV and JSON table READER, with no dependency, and it is a real RFC-4180 state machine rather than a split on the separator: a spreadsheet export carries quoted separators, quoted NEWLINES and doubled quotes, and a split gets all three wrong QUIETLY - the table looks imported and is wrong on air. It also detects the separator and strips a UTF-8 BOM before it can become part of the first column LABEL. JSON is accepted in the shapes people actually have; anything else is REFUSED with a reason, never coerced. `scripts/csv.test.mjs` pins it.
