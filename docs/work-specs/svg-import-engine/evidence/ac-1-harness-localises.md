# AC-1: the harness exists and localises a change

**Verdict: pass.**

- **Built in phase 1** (https://github.com/NoaCG/NoaCG-Studio/pull/1122, merge `f6634cbd6`).
  `scripts/svg-import-passes.test.mjs` is the harness, and `scripts/fixtures/svg-corpus-passes.json`
  is the snapshot it compares against.
- **Phase 1 check, PASS** (carried in the phase 2 notes). The checker made two probes of its own.
  - A clock suffix in `bindSvgMarkup` was caught by `bind` and `emit` on the one file it touches.
  - Removing `numberRepeats` was caught by `inventory` on 6 files, while `bind` and `layout`
    stayed green.
  - CI's factory job ran the harness twice on `f6634cbd`: 106 of 106 both times.
- **On current main (this review).** `node scripts/gates.mjs audit` reports "OK - 45 check(s)
  and 238 test file(s) declare where they run and what they guard". The harness header reads
  `// gate: factory`.
- **Phase 7 widened the localisation proof.** Each break was made in `src/` and then reverted. Its
  table is in the spec's phase 7 build notes.
  - Every probe failed only the reading for that rule, or only the records of the files drawn
    in that shape.
  - CI's factory job on #1188 (job 115778723859) ran 51 files and 601 records in 8.7 s: 159
    pass, 0 fail, 0 skipped.
