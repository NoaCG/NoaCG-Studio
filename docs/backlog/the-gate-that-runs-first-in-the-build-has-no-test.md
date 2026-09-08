# The gate that runs first in the build has no test

**Filed:** 2026-09-08. **Source:** the 2026-09-01 modular-orchestrator session (handoff since
drained)

## Why
`scripts/check-shared-instructions.mjs` runs first in `npm run build` and now decides four
separate things: the adapter and alias architecture, the Codex byte chain with its 4 KB reserve,
the modular core's line limit, and the common-path budget. It has no `*.test.mjs` sibling, where
most gates in `scripts/` do. Its three modular failure modes - a core over its limit, a module
nothing links to, a link to a module that does not exist - were proven once by hand mutation, and
that evidence is not repeatable. The same session found a defect exactly there: the summary
printed "9 module(s), all linked" while the gate was failing on linkage. A gate that stops
refusing reports green.

## What it would take
`scripts/check-shared-instructions.test.mjs` over a temp fixture tree, red first for each refusal:
a chain under its byte reserve, a core over `MODULAR_WORKFLOW_LINE_LIMITS`, an orphan module, a
dangling module link, a common path over budget, and one clean tree that passes. Gates are
discovered from their headers, so no build-line edit.

## Evidence
`scripts/check-shared-instructions.mjs:442` (`MODULAR_WORKFLOW_LINE_LIMITS`); the sibling pattern
in `scripts/check-docs-index.test.mjs`.
