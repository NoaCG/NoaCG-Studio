# Two gate names can share one measurement receipt, and the blind-gate check would never know

**Filed:** 2026-09-08. **Source:** review of `claude/l-panel-that-never-grows`, on code that
landed the same night from `claude/f-gates-that-measure-nothing`.

## Why

`scripts/gates.mjs:447` names each check's receipt file
`check.name.replace(/[^A-Za-z0-9]+/g, '-')`, and `measured()` APPENDS to it. Two check names that
differ only in punctuation collapse to one file: `package.json` already carries
`test:e2e:affected` and `test:e2e-affected`, which both become `test-e2e-affected.tsv`. Today only
one of them is a runnable check in a tier, so nothing is broken. The day two colliding names sit in
the same tier, the second check inherits the first's receipts and `measurementProblem` can never
see that it measured nothing - which is the single hole the whole mechanism exists to close, open
in the mechanism itself.

## What it would take

Key the receipt file by the check's index in the tier, or by a hash of its name. One line, plus a
case in `scripts/gates.test.mjs` that runs two checks whose names sanitize identically and asserts
each one's receipt is read separately.

## Evidence

`scripts/gates.mjs:441-460` (the temp dir and the receipt path), `scripts/measured.mjs` (appends),
and the two names in `package.json`.
