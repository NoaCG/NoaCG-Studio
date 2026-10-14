# AC-7: each phase stays inside its fence and the docs follow

**Verdict: pass.** The file lists below were read from GitHub's REST API for this review.
Every pull request also touches the plan's own `spec.md`, and most its `work.json`; those are
left out below.

| Phase | Pull request | Files changed besides the spec and work.json | Fence (§7) |
|---|---|---|---|
| 1 | https://github.com/NoaCG/NoaCG-Studio/pull/1122 | `docs/SVG_IMPORT_PLAN.md`, `scripts/driven-clock.mjs`, `scripts/fixtures/svg-corpus-passes.json`, `scripts/svg-import-passes.test.mjs` | inside |
| 2 | https://github.com/NoaCG/NoaCG-Studio/pull/1125 | `docs/ARCHITECTURE.md`, `scripts/driven-clock.mjs`, the snapshot, the harness, `CreationWizard.tsx`, `import/draft.ts` | inside |
| 3 | https://github.com/NoaCG/NoaCG-Studio/pull/1130 | `svg.ts`, `svgBind.ts`, `svgLayout.ts`, `svgFonts.ts`, the two Node tests, `importedDesign/AGENTS.md` | inside |
| 4 | https://github.com/NoaCG/NoaCG-Studio/pull/1136 | `svg.ts`, `runtime/svgFit.js`, `runtime/svgFitBoot.js`, `eslint.config.js`, `importedDesign/AGENTS.md` | inside |
| 4, prerequisite | https://github.com/NoaCG/NoaCG-Studio/pull/1133 | the ES5 lint fix, landed as its own pull request (D10) | its own fence |
| 5 | https://github.com/NoaCG/NoaCG-Studio/pull/1139 | `svg.ts`, `runtime/svgGrowth.js`, `runtime/svgShapeShift.js`, `eslint.config.js`, `importedDesign/AGENTS.md` | inside |
| 6 | https://github.com/NoaCG/NoaCG-Studio/pull/1142 | `scripts/svg-fit-rungs.test.mjs` | inside |
| 6, repair | https://github.com/NoaCG/NoaCG-Studio/pull/1152 | the rung test, two corpus files with their sidecars, the snapshot | outside by two corpus files; see below |
| 6, check 2 | https://github.com/NoaCG/NoaCG-Studio/pull/1156 | notes only | inside |
| 7 | https://github.com/NoaCG/NoaCG-Studio/pull/1188 | `e2e/import-svg.spec.ts`, `scripts/svg-import-passes.test.mjs` | inside |

**The one excursion.** #1152 added two corpus files. The phase 6 second check judged this the
only way to reach 10 files without changing `LADDER_VALUES`, which would have changed existing
records. The snapshot diff is additions only. It is recorded there as an observation, with its
revert.

**The docs followed in the phase that changed each fact:**
- `docs/SVG_IMPORT_PLAN.md`'s harness pointer, in phase 1.
- ARCHITECTURE §5's command and numbers, in phase 2.
- The `importedDesign/AGENTS.md` file map, in phases 3 to 5. Its lines 62-63 name the runtime
  files and `svgBind.ts`.
- The `## Test maintenance` section, in phase 7.

ARCHITECTURE §5's prose has since been overtaken by another plan's move (see the AC-3
receipt), and that plan owns its rewrite.
