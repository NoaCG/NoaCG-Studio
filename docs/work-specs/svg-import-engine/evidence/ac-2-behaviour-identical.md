# AC-2: behaviour is identical at every phase

**Verdict: pass.** Each phase's own check established it on evidence the checker produced.

| Phase | Pull request | Snapshot | `svg01` / catalog | Affected e2e plan |
|---|---|---|---|---|
| 1 | https://github.com/NoaCG/NoaCG-Studio/pull/1122 | created | unchanged | green; harness 106 of 106 twice on `f6634cbd` |
| 2 | https://github.com/NoaCG/NoaCG-Studio/pull/1125 | unchanged except the added `draft` record (§4 allows it) | unchanged | `import-svg` 54, `import-svg-behaviour` 34 on `cb3d9557` |
| 3 | https://github.com/NoaCG/NoaCG-Studio/pull/1130 | unchanged | 528 designs unchanged | green; harness 15/15 against a fresh runtime baseline |
| 4 | https://github.com/NoaCG/NoaCG-Studio/pull/1136, with https://github.com/NoaCG/NoaCG-Studio/pull/1133 | unchanged across #1136; #1133's re-record was its own D10 lint fix (48 `emit.js` hashes) | unchanged | green; the runtime is byte-identical at four shas |
| 5 | https://github.com/NoaCG/NoaCG-Studio/pull/1139 | unchanged | unchanged, fidelity too | `import-svg` 54, corpus 21, behaviour 34, fidelity 11 on the merge group |
| 6 | https://github.com/NoaCG/NoaCG-Studio/pull/1142 and https://github.com/NoaCG/NoaCG-Studio/pull/1152 | unchanged; #1152 added two files' records, with no existing record changed | unchanged | factory 133 of 133; corpus shard 21 passed |
| 7 | https://github.com/NoaCG/NoaCG-Studio/pull/1188 | unchanged | unchanged; `check-catalog-emit` PASS, 528 designs | `import-svg.spec.ts` 46 passed, 44 skipped (#800); factory 159 of 159 |

Where each verdict was recorded:
- **Phases 1 to 5:** in the next build's "Last check's findings".
- **Phase 6:** its second check, https://github.com/NoaCG/NoaCG-Studio/pull/1156.
- **Phase 7:** its check, https://github.com/NoaCG/NoaCG-Studio/pull/1193, which read the job lists of PR run 38541990487 and
  merge-group run 38543390296.

**The follow-up #1194 changed no product code.** It made two readings stricter (#1192). Its CI ran the
factory gates green on `fccdf892`.
