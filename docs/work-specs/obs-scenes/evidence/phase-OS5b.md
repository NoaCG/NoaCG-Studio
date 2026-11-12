# OS5b: Bracket adapter and current match, evidence

Acceptance AC-10 (`docs/work-specs/obs-scenes/spec.md`). Rules B1 to B16, with the Rules-first `/so`
amendments, are in the spec's phase notes. Every fixture is synthetic. No OBS hardware is involved.

## Per clause

| Clause | Changed behaviour | Proof |
| --- | --- | --- |
| Both row shapes produce the same ordered result with stable match ids | `src/control/bracketAdapter.ts` `adaptBracket`: rows as a list or keyed by row number, in feed order; ids from the mapped match field, else positional (B3 to B5) | `scripts/bracket-adapter.test.mjs` "both row shapes give the same ordered result": list, 1-based and 0-based objects deep-equal; ids `m1` to `m4`; positional ids equal in both shapes |
| Unknown scores stay null and "—" in tie lines | `scoreOf`, `tieLine`, `forFields` (B6, B9, B10) | "an unknown score is null, never zero": `null`, `''`, `'W'` are null, `0` and `'0'` are 0; tie line `Semi-finals \| Aster 2 \| Dahl —`; a field gets empty text |
| Duplicated or missing rows are reported, not guessed | `rowsOf` and the duplicate check (B3, B5, B7) | "missing, empty, unnumbered and duplicated rows are reported": a gap, an empty row, an unnumbered key, an empty match id, a repeated row, and a disagreeing duplicate that keeps its values and its slot |
| The field mapping is a source setting | `config.adapter`, judged by `readSourceAdapter`, kept by `readExternalRegistration` and `connectorPlan` only beside `read` (B1, B2); the review's "Read as a bracket" picks each field from the sample | "the field mapping is the source's setting, judged"; "the review keeps the adapter beside read, drops it with read, and never moves the config revision"; e2e fourth test: the saved config holds `adapter` with the picked fields |
| The current match holds across reads, keeps its last values with `held` true when its match disappears or changes players | `resolveCurrent` (B12), the memory in the snapshot (`projectedState` keeps `#` keys), the bound `current` paths standing in when there is no memory | "the current match follows the operator's pick only", against a model written from B12 (14 steps); "through the reader": held true and nothing else written, the tick never moves it and keeps the memory; "with no memory, the bound current paths stand in"; e2e: players change, the field keeps `Dahl`, the line says held |
| Moves only when the operator picks another | The pick is `<p>.currentMatchId` in the tree, read by an open page; the source line's picker writes it and pokes the reader (B11, B14) | model test; e2e: picking m2 then m1 moves both fields, a read does not |
| Covered by synthetic fixtures | Invented field names, players and ids | the test and the e2e fixtures |
| Nothing new with the switch off (rule) | "Read as a bracket" shows only beside "Read by NoaCG", which shows only with the OBS scenes switch on (OS5a R2); the picker only for a source whose reads offer matches | e2e first and third tests unchanged and passing |

## Local runs

- `node --test`: bracket-adapter 16, json-source 15, data-tick 15, sheet-source 44, source-mapping 66,
  connector-review 27, external-data-connector 64, feed-source 10, file-source 16,
  show-fixture-compat 16, json-fetch 13: all pass.
- `npm run gates -- run --changed origin/main`: every gate ok, 336 tests, 0 failed.
- `e2e/production-api-mapping.spec.ts` (5, the new bracket journey included) and
  `e2e/production-data.spec.ts`, through the job queue (`j-0001`).
- `npx tsc --noEmit` (root and api configs) and eslint on the changed files: clean.

## Not checked here

- The owner's private sample: the coordinator runs the adapter on it and records pass or fail
  privately.
- The published lease row carrying the memory key through the real database: the configured
  suite's path; the row stores the snapshot as given (`0097`, `control_source_settle`).
