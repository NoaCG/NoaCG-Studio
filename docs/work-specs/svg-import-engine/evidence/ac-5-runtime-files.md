# AC-5: the runtime is a lintable file and the bytes did not move

**Verdict: pass.**

- **Phase 4** (https://github.com/NoaCG/NoaCG-Studio/pull/1136, merge `4e4eb8b0c`). It had a
  prerequisite, https://github.com/NoaCG/NoaCG-Studio/pull/1133 (merge `b18fe3d1e`), which fixed
  two ES5 lint findings separately, under D10.
  - **Phase 4 check, PASS** (carried in the phase 5 notes). The runtime baselines at `6e8bfb503`,
    `b18fe3d1e`, `4e4eb8b0^1` and `4e4eb8b0` are byte-identical. The snapshot and catalog blobs
    are unchanged across #1136, and the only snapshot diff, #1133's, is the 48 `emit.js` hashes
    of its own lint fix.
- **Phase 5** (https://github.com/NoaCG/NoaCG-Studio/pull/1139, merge `a05aefebe`).
  - **Phase 5 check, PASS** (carried in the phase 6 build notes). Byte identity held on the
    checker's own literal comparison for LF, a synthesised CRLF copy and the CRLF working tree.
  - The snapshot, catalog and fidelity blobs are unchanged, and ESLint is clean.
- **On current main (`20bda8867`):**
  - `src/templates/importedDesign/runtime/` holds `svgFit.js`, `svgFitBoot.js`,
    `svgGrowth.js` and `svgShapeShift.js`.
  - `npx eslint src/templates/importedDesign/runtime` is clean.
  - Each is emitted through `fillRuntime` (`svg.ts:108`, used at 140, 152 and 158).
