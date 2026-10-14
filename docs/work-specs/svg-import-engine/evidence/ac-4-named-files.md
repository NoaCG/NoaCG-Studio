# AC-4: named passes in named files

**Verdict: pass.**

- **Built in phase 3** (https://github.com/NoaCG/NoaCG-Studio/pull/1130, merge `ef3ada8f6`).
- **Phase 3 check, PASS** (carried in the phase 4 notes). The checker's own AST token check found
  all 45 declarations once each, with 0 code differences. The harness passed 15/15 and the
  catalog's 528 designs were unchanged.
- **On current main (`20bda8867`), from `wc -l`:**
  - `svg.ts`: 437 lines, under 500.
  - `svgBind.ts` 217, `svgLayout.ts` 132, `svgFonts.ts` 62.
  - `node --test scripts/svg-layout-table.test.mjs scripts/svg-font-css.test.mjs`: 10 pass,
    0 fail. Both are `// gate: build`.
- **One file over 800:** `behaviourRuntime.ts` (1,105 lines). It belongs to another plan and is
  older than this one. The coordinator ruled it outside AC-4 at the phase 5 check (phase 6 build
  notes). No file this plan created or split is over 217 lines.
