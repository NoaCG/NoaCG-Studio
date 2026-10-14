# AC-6: rungs testable without the wizard, mirror checked

**Verdict: pass.**

- **Phase 6** (https://github.com/NoaCG/NoaCG-Studio/pull/1142, merge `06045b284`). The first
  check FAILED: the room rung found the pen through the runtime's own `svgFitNeighbour`, and
  the neighbour rule reached only 8 files.
- **Repair:** https://github.com/NoaCG/NoaCG-Studio/pull/1152 (merge `16339862d`). The neighbour
  is now found from the artwork as its own rung, and two honest corpus files were added.
- **Second check, PASS:** https://github.com/NoaCG/NoaCG-Studio/pull/1156 (merge `2078568ef`).
  - Two probes of the checker's own showed the neighbour rung bites.
  - The margin rung holds on 20 of 20 files. Vertically 0 files reach the limit, tracked in
    #1153.
  - The mirror compared 138 of 141 bound lines; the 3 not compared are printed with reasons.
- **On CI for #1188** (factory job 115778723859, Linux), `scripts/svg-fit-rungs.test.mjs` ran
  51 files. Every rung held on every file it reaches, except `room` (45 of 46), with the
  findings listed. The mirror compared 138 of 141 lines.
- **Recorded findings, not fixed inside a move (D10):**
  - #1143 (`settle`) and #1148 (the end-anchored ticker) have since been fixed in their own
    pull requests and are closed. That is why `settle` now holds on 49 of 49 and `neighbour`
    on 13 of 13.
  - #1144, #1145 and #1153 are open.
