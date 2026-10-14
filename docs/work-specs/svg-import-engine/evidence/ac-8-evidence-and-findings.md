# AC-8: evidence precedes landing and findings are named

**Verdict: pass.**

Every phase's notes under `## Phase notes` in `spec.md` carry four things:
- the main sha before;
- the revert command;
- the proof §7 names for that phase;
- the harness run time.

The proofs, phase by phase:
- **Phase 1:** a deliberate bind probe, and two CI runs that agree.
- **Phase 2:** an equality assertion over every corpus file.
- **Phases 3 to 5:** an AST token check and the `js` sha256 byte gate.
- **Phase 6:** a probe per rung.
- **Phase 7:** a probe per `## Test maintenance` line.

Run times recorded:
- **Phase 1:** 5.5 s locally; 8.8 to 10.3 s on CI.
- **Phase 6:** 17.1 s on CI for the rungs.
- **Phase 7:** 8.7 s on CI for the harness, 51 files.

The next phase's first note carries each check's verdict and findings ("Last check's
findings").

**Findings were named, not fixed inside a move.**
- **The harness:** five sidecar disagreements, recorded in the snapshot's `findings` and
  unchanged since phase 1.
- **The lint, phase 4:** two findings, fixed separately in
  https://github.com/NoaCG/NoaCG-Studio/pull/1133.
- **Phase 6, as issues:** `settle` (#1143, since fixed and closed), the rotated strip (#1144),
  the mirror's list (#1145), the end-anchored ticker (#1148, since fixed and closed) and the
  vertical margin reach (#1153).
- **The e2e planner gap a runtime-only change exposes:** #1138.
- **Phase 7:** no new finding. Its note on #800 records the tests kept because their only other
  guard is skipped.
