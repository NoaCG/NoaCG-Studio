# src/ai/spike - the bench-only taste and exemplar instruments

## The TASTE instrument (`spike/tasteCheck.ts`) - the owner's six rules as numbers

**EXPERIMENT, bench-only** (the same deletion condition as the four instruments beside it,
`spike/exemplars.ts`). Driven by `scripts/pro-taste-rejudge.mjs`, which is FREE: it mounts saved
code from finished rounds and measures it, so a rule written today can be tried against every
round already paid for at zero cost. The full account, with the numbers, is
`docs/NOACG_PRO_PLAN.md` §25.

The six rules are the owner's own, from the 2026-08-19 galleries: (1) a mark inside a container is
centred in it, (2) a mark between an accent line and text is optically balanced, (3) secondary
text has a floor too - measured as the SMALLEST INFORMATIONAL line, because read as "the second
line" it was null on every one-line graphic the owner used to state it, (4) weight and contrast
are part of legibility rather than separate from it, (5) a mark never eats primary real estate,
(6) a package's mark is on every piece or none.

Three properties are the ones to keep in mind before touching it:

- **It reports; three of the six additionally carry NO pass/fail, and all three are CLOSED
  questions rather than pending ones.** Rule 2 because the owner stated it is conditional
  ("sometimes it can work, and that's kind of the problem"); rule 3 because **the owner declined
  the floor on 2026-08-22** - the corpus's smallest secondary reading is 26px, so the only floor
  that could change anything sat above it, and a floor read off the catalog asserts that the
  catalog is right; rule 5 because placement has no rule. Inventing a threshold to settle any of
  the three would replace the measurement with the opinion the instrument exists to remove. **Do
  not re-open rule 3 with a better number** - the question was never the number.
- **Rule 1 asks each axis separately, and that is not a refinement - it is the rule.** Measuring
  both axes of the mark's smallest surface ancestor calls eight shipped catalog designs 0.84-0.96
  off centre, because a mark docked at one end of a strap is off-centre in the strap by
  construction; restricting the container to one holding the mark alone then loses the owner's
  actual case, the sponsor-bug tile that also carries "ON AIR". What is measured is the axis the
  FLOW did not decide, and flow peers are painted TEXT only - counting an accent bar as a peer
  suppressed the exact case the rule exists for.
- **A rule that fires on a shipped design is a question, not a threshold to move - and the owner
  answers it.** Rule 5 fired on Pro's sponsor bug across nearly the whole corpus, so it went to him
  rather than into a per-type override. He ruled the STACK legitimate (2026-08-20), the rule was
  rewritten around the horizontal question inside "it should be on the same row as the text", and
  the day after - when a countdown gained a mark and it fired on 12 of 18 - he ruled the whole
  question out: **"I cannot give you hard rules on where to place a logo. It depends on the
  design."** Rule 5 now mints NO finding, the third of the six to carry no pass/fail.
- **A THRESHOLD CAN BE PERFECTLY CALIBRATED AND STILL ASSERT SOMETHING ITS AUTHOR DOES NOT
  BELIEVE**, and the withdrawn rule 5 is the case to remember. It was read off the catalog, quiet
  on the whole corpus, mutation-checked, and it re-flagged nothing it should not have - and it was
  still wrong, because "a mark takes a row of its own only when the width leaves it no choice" is a
  placement rule. Measuring well is not the same as being entitled to judge. Before adding a
  threshold, ask whether the owner holds the RULE, not whether the number fits the data.
- **Rule 5 does NOT re-ask crowding either, and the first attempt at the rewrite is why.** Measured
  in the mark's own height it re-flagged `ls18` - the design `spacingCheck`'s own mark-gap
  recalibration had just cleared. `spacingCheck` owns the gap in the ratified unit; a second
  opinion here is a duplicate or a regression. What rule 5 contributes now is the ARRANGEMENT and
  the width that allowed it (`stacked`, `besideSlackPx`, `bandFill`) - the numbers a PLACEMENT
  decision reads. `scripts/spike-taste-rule5-reading.mjs` (free, one page) proves that geometry
  discriminates: same stack, +502px of room beside against -512px, and no finding on either.

Rule 4 reads its NUMBERS through `validation/readabilityCheck` rather than measuring weight or
contrast again, and compares them against **its own three owner-ratified floors** (2026-08-20):
contrast 3.25:1, weight 500, and 28px for a secondary line. It used to pair that instrument's
`text-under-weight-floor` and `text-low-contrast` FINDINGS, which are the ratified table's
verdicts - right while the table agreed with the owner, and silent on all four rows he named the
moment it did not. **The 28px is an eligibility floor, never a third axis to fire on**: every lower
third in the corpus sets its role line at 26px, so firing on it would light up all 36 rows, and a
rule that fires on everything reports nothing. One measurement, one place; only the threshold is
this file's.
