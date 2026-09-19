# templates/run-factory-gate-before-queueing-catalog

Rule: `templates/run-factory-gate-before-queueing-catalog`. Recorded 2026-09-19 on `claude/catalog-battery-names-factory` at fbe4f1d4.

On 2026-09-19 branch claude/quiz-score-templates-dbd324 (PR 326) added nine catalog designs and ran every command catalog:affected printed, plus npm run build, all green. CI's Factory gates job then failed on the literal-token drift scan: qz14 wrote an accent glow out by hand instead of reading var(--accent-glow). The landing was refused for about two hours and the owner went looking for templates that were not on main. The printed battery named six gates and not the factory; it names it now, and scripts/catalog-affected.test.mjs pins that.
