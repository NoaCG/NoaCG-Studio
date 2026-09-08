# components/rewrite-every-code-reference-asset-moves

Rule: `components/rewrite-every-code-reference-asset-moves`. Recorded 2026-09-07 on `claude/components-contract-migration` at 550fd5cf.

A rename that leaves the code pointing at the old path breaks the graphic silently, and a folder persisted with no file in it would sync as content the template does not have.
