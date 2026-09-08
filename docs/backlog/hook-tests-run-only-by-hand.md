# Two hook test files are in no gate, so hooks that DENY tool calls land unwatched

**Filed:** 2026-09-08. **Source:** the 2026-09-05 mistake-triggers session (handoff since drained)

## Why
`scripts/hooks/guard-preview.test.mjs` and `scripts/hooks/guard-agent-launch.test.mjs` appear in no
`npm run` entry and in no workflow, so a regression in either hook lands green. Both hooks DENY a
tool call machine-wide: the launch guard's first cut refused a legitimate launch on a READ line
naming a doc with a parenthesis in it, which is a machine-wide outage, and the must-not-fire cases
that stop it are exactly what these files pin. `package.json` was held by another live session the
day they were written; that is the only reason the line is missing.

## What it would take
Two `test:*` entries in `package.json` beside `test:spawn-task-guard`, `test:question-guard` and
`test:frozen-branch` (lines 73-75), on the same gate those three already run on. The whole hook
suite is 111 green today under `node --test scripts/hooks/*.test.mjs`.

## Evidence
Neither test file is named in `package.json` or in `.github/workflows/`; the three wired sibling
suites are `package.json:73-75`.
