# Move `wizard/draft.ts` out of `components/` - the debt row that grew 2.4x

**Filed:** 2026-08-28. **Source:** weekly quality review (measurement)

## Why

**`docs/ARCHITECTURE.md` §5 records this debt at 430 lines. It is now 1,049.**

The row reads: "`components/wizard/draft.ts` (a 430-line logic module parked in the UI tree - move
it toward `blocks/`/`templates/` when next reworked)". It has since been reworked repeatedly - **30
edits in the month to 2026-08-28** - and grew to 1,049 lines without ever being moved. The
"when next reworked" clause was the mechanism, and it did not fire.

§5 states the rule it breaks without qualification: **"Logic files without JSX do not live under
`components/`."** This is not a stylistic preference - it is the boundary that keeps UI thin, and
a 1,049-line no-JSX module is the largest single counterexample in the tree.

Two costs, both real. It sits above the transform layer while behaving like part of it, so a
wizard change that belongs in `templates/` gets written here instead, where nothing can import it.
And the architecture doc now understates its own worst row by a factor of 2.4, which makes the
whole §5 list read as smaller than it is.

## What it would take

One session.

Move it to `blocks/` or `templates/` per the §4 table ("a deterministic edit to template code" ->
`blocks/`; "a new catalog template, variant, pack, or graphic type" -> `templates/`), split if it
turns out to serve both. Update importers. **Delete the §5 row in the same commit** - a debt row
that outlives its debt is the defect this review keeps finding.

**Risk: it drags a `components/` import along with it.** That inverts the graph and is the one way
this move makes things worse rather than better.

**Proof it did not break:** `npm run build` catches exactly that - eslint Stage A pins "nothing
imports `components/`" and `depcruise` is default-deny over the §3 edge table, so a bad edge fails
the gate rather than landing. Then the wizard e2e specs for behaviour.

## Evidence

- `wc -l src/components/wizard/draft/*.ts` -> 636 across three files. Wizard row 1
  (docs/WORKFLOW_ARCHITECTURE.md §5.5) split the 1,861-line `draft.ts` by capability into
  `draft/core.ts`, `draft/template.ts` and `draft/format.ts`, and left `draft.ts` as a nine-line
  re-export; row 2 then took the import slice into the capability's own folder.
  `docs/ARCHITECTURE.md` §5 said 430 when this item was written. The item stands as it
  was: the logic is still under `components/`.
- `git log --since="1 month ago" --name-only` -> 30 commits.
- `docs/ARCHITECTURE.md` §5: "Logic files without JSX do not live under `components/`."
- Checked in the same pass and moving the OTHER way: §5 also lists `CanvasInteraction.tsx` at
  "13 inline `applyTemplate` sites". It has 16 `applyTemplate` calls of which **5** are inline
  `{...template, ...}` assembly. That row improved and the doc overstates it - worth correcting
  when §5 is next edited, but not worth a branch of its own.

## Trend

- 2026-08-28: 1,049 lines vs 430 recorded in `ARCHITECTURE.md` §5 (2.4x), 30 commits/month
