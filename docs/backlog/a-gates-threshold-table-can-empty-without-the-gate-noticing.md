# A gate's THRESHOLD table can empty without the gate noticing

**Filed:** 2026-09-08. **Source:** the gate enumeration in `docs/metrics/2026-09-08-gates-that-measure-nothing.md`

## Why

`measured(n, subject)` now makes every gate say how big the SET it looked at was, and refuses zero.
That closes one of the two halves of the 2026-09-08 defect. The other half is the one that actually
broke: `type-floor.mjs` had plenty of subjects - 502 variants - and its THRESHOLD resolved to
`undefined`, so `px < undefined` was false for every element and the gate would have passed over all
of them. Counting subjects would not have caught it. `if (!(FLOOR.default > 0))` did.

Three gates in the tree still have a threshold that can silently empty:

- **`scripts/check-preview-serialization.mjs`**: `bound = moduleScopeNames(text)` is a table built by
  three `^`-anchored regexes over source text, and it is consulted as `if (!bound.has(name)) continue`.
  An incomplete table therefore skips real violations rather than reporting them, and a formatting
  change is enough to shrink it - a declaration behind a decorator, an indented one, or an
  `export { x }` re-export drops out while the hazard it guards stays in the file.
- **`scripts/check-vercel-config.mjs`**: `internalHtmlDestinations` opens `if (!config.cleanUrls)
  return [];`. One boolean decides whether the second half of the gate measures anything at all.
- **`src/model/designRules.ts`**, from the validator half of the same audit: an unknown
  `target.profile` makes `PROFILE_MULTIPLIER[profile]` undefined and every size comparison false.
  That one is filed separately in `validators-that-are-silent-when-they-measure-nothing.md`.

## What it would take

The same shape `type-floor.mjs` already uses, and the same shape `measured` uses one level up:
assert the threshold is usable before comparing against it, and name what was expected when it is
not. `measured(bound.size, 'module-scope names')` covers the first; the second wants a positive
assertion that `cleanUrls` is still the flag deciding how pages are served, not a silent early
return. Neither is more than a few lines, and both want a reader who can say what the honest
non-empty value is - which is why they were not done blind in the row that filed this.

`scripts/check-shared-instructions.mjs` had a fourth instance of the same family - four tables keyed
by workflow NAME, consulted as `TABLE.get(name)`, so renaming a workflow dropped its markers and its
byte budgets in one edit - and that one IS fixed on the branch that filed this: every key of those
tables must now name a workflow that exists.

## Evidence

`docs/metrics/2026-09-08-gates-that-measure-nothing.md`, the check-entry-file table.
`docs/handoffs/2026-09-08-b-red-alarms.md` for the original `px < undefined`.
