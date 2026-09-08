# Re-measured 2026-09-07, after the four module rows of phase 2a landed

Taken on `origin/main` at `38dc3286`. The rows below are the ones the module work moves; the rest
of the table is unchanged from the section above.

| Metric | Baseline | Now | Reading |
|---|---|---|---|
| Files the map escalates to the full suite | 141 by `CORE`, 153 unmapped | 145 by `CORE`, 153 unmapped | +4: `src/templates/contract.ts` and the three files the debts row moved into `src/model/`. The template contract is one file that legitimately reaches everything; what leaves `CORE` is the 617 designs around it, and only once selection is derived from the graph (phase 3) |
| Specs planned for an Import-graphic file | 38 | 13 | the capability's own nine, plus the four that assert on testids only its components render |
| Direct importers of `src/model/wizard.ts` | 621 | 619, all through the one-landing shim | the file is a fifteen-line re-export; the second half of domain row 1 rewrites the importers and deletes it |
| Import-only commits forced into a wizard giant | 40% (54 of 134) | 40% (54 of 134) | unchanged, and it cannot change yet: this reads sixty days of history, and every commit in that window predates the split. The first honest reading is sixty days of commits made under the new layout |

**The co-change rows are the ones to watch, and the trap in them.** They are what justifies the
remaining wizard rows, and they measure the PAST. A reading taken this week says nothing about
whether the split worked; a reading in October does. The buckets name the old paths beside the new
ones for exactly that reason, so the window keeps measuring one capability across the move - if a
later session prunes the old paths from `scripts/metrics/cochange.mjs`, the number falls for a
reason that is bookkeeping rather than modularity.
