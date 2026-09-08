# `ARCHITECTURE.md` §5 is wrong in both directions, because it never says what it counts

**Filed:** 2026-09-08. **Source:** weekly quality review (measurement).

## Why

§5 "UI thinness" carries the grandfathered offenders a session is meant to consult before deciding
whether it is already touching a row worth paying off:

> `CanvasInteraction.tsx` (13 inline `applyTemplate` sites), `StepTimeline.tsx:375` and `:388`,
> `Inspector.tsx:280`, and `components/wizard/draft/`

Measured on 2026-09-08, counting the shape §5 itself names as the violation - the component
assembling document coherence inline rather than committing a helper's result:

| file | §5 says | actual |
|---|---|---|
| `CanvasInteraction.tsx` | 13 sites | **5** (14 `applyTemplate` calls in total, 9 of them committing a helper's result) |
| `StepTimeline.tsx` | two sites, `:375` and `:388` | **6** (the two named ones are now `:372` and `:385`) |
| `Inspector.tsx` | one site, `:280` | **4** (the named one is now `:294`) |

Both directions, which is the failure that matters. The row a session is most likely to volunteer
for - Canvas, at "13" - has already been paid down to 5, so the list steers work at the offender
that shrank. The two rows that read as nearly closed are four and six sites deep, so a session that
"fixes `Inspector.tsx:280`" deletes the row and leaves three violations behind it.

The mechanism failed in a way that was guaranteed. **§5 anchors by line number**, and all three
anchors have drifted; and it never states its counting rule, so "13 sites" cannot be re-derived - it
matches neither the assembly-site count (5) nor quite the total call count (14). A number nobody can
reproduce cannot be checked, so it was never checked.

`components/wizard/draft/` is the row that is still exactly true, and it is the row written without
a number.

## What it would take

Under a session, and it is a doc change plus, optionally, a script.

1. **Say what the row counts, in §5, once,** with the grep that produces it beside it, so the next
   reader re-derives rather than trusts. Matching on `applyTemplate({ ...template` reproduces every
   number in the table above.
2. **Re-record the three numbers** and drop the line-number anchors. A line number in a doc is stale
   on the next edit to the file; the file plus the count is stable and is what the reader needs
   anyway.
3. **Consider gating it.** `scripts/check-contract-freshness.mjs` already extracts backticked tokens
   from a contract and checks each path and symbol against the tree. A count is that idea one step
   further: fail the build when a §5 row's recorded number is above the measured one (the debt was
   paid, delete the row) or below it (the debt grew, and §6 says these are shrink-only). That turns
   the row from a claim into a ratchet. A build gate lands alone, so step 3 is its own branch.

**What could break:** step 3 makes every branch that adds an inline-assembly site fail the build,
which is the point, but it must fail with the §5 row quoted in the message or it will read as
mysterious. Proof steps 1 and 2 are right: the greps printed in §5 reproduce the recorded numbers on
a clean checkout of main.

## Evidence

- `docs/ARCHITECTURE.md` §5, quoted above; §6's shrink-only rule for the sibling table.
- Measured 2026-09-08 on `main` at `a04b5c68` - inline-assembly sites: CanvasInteraction 5,
  StepTimeline 6, Inspector 4; all `applyTemplate(` calls: 14, 6, 9; `replaceDefinitionInHtml`
  mentions: 0, 3, 0.
- `docs/backlog/draft-ts-out-of-components.md` - the same defect on the §5 row next door, filed
  2026-08-28 when the doc recorded 430 lines against 1,049 real ones, and which noted the Canvas
  overstatement in passing as "not worth a branch of its own". Eleven days on it is uncorrected, and
  two more rows are wrong in the other direction. This is not a one-off.

## Trend

- 2026-09-08: 3 of 4 §5 rows misstate their own size (2 understate, 1 overstates); 3 of 3 line
  anchors stale.
