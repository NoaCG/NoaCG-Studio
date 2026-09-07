# templates/check-before-placing-machine-bearing-data

Rule: `templates/check-before-placing-machine-bearing-data`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 285-288.   **THE PAIRING RULE:** `spliceAnimData` replaces only the literal, so a saved template keeps   its FROZEN interpreter - machine-bearing data must never land under one that predates the   engine. Check `hasMachineRuntime(js)` first and re-emit the whole region when false (the   `hides` precedent); validateTemplate treats a mismatch as an export-blocking error.
