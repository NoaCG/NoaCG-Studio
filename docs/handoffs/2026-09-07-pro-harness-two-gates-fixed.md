# The two unclearable Pro Harness findings, measured and fixed

Branch `claude/noacg-pro-harness-continue-3583ad`, from `main` at `39835021`. Four commits, build
green (`[write-version] dist/version.json -> claude/noacg-pro-harness-continue-3583ad@8e419a07`),
`npx tsc --noEmit`, `eslint`, `depcruise` and `node --test scripts/pro-harness.test.mjs` (25 tests)
all clean. **No model spend here.** The €3 authorization still stands at $1.85 spent.

## What the two refusals actually were

Nine of the 2026-09-06 bank's 21 cells - three whole types - carried a finding the gate could never
pass. Both were reproduced against the shipped catalog before anything was changed, and in both
cases the first diagnosis in the record was close but not right.

**`bench-field-unpainted` is not about the class being ignored.** The check requires the sentinel to
appear VERBATIM, and a value a runtime computes with never survives verbatim. Measured on `gt01`:
`900001` minutes paints **`15000:00:58`**. A credits scroll speed is worse - it changes no visible
text at any value, only motion. So the check refused **all 6 shipped `game-timer` designs** and
**7 of the 12 shipped `end-credits` designs**.

The class alone cannot clear it: a quiz board's audience percentages live in a `noacg-data-source`
holder and ARE painted, so excluding by class silenced the standing mutation test in
`e2e/lite-field-paint.spec.ts` - correctly. **The pair that settles it is the class AND
`ftype: "number"`.** All **72** numeric holders in the catalog are a duration, a speed, a
percentage, a 1-based index or a goal; none is a string meant to be echoed. Asked at report time, so
a holder whose value IS painted still has to prove it.

**`step-contract` pressed `next()` once per operator action the BRIEF listed.** All 12 shipped quiz
boards answer exactly one press (`spxSteps` 2 - the reveal is a lifecycle call on the middle step,
and Out is reached by `stop()`), and the `podium-score` spine answers none, so a brief listing three
reveals refused every quiz cell at press 2 and would have refused the catalog too. The press count
now comes from the graphic's own default path (`spxSteps - 1`); `process-steps`, at `spxSteps` 5,
answers exactly 4 and confirms the rule. The half a model can act on survives as a separate finding,
raised only where the model owns the region.

## The bridge door, which was the same fault one lane over

`bridgeApi.normalize` still told an author its region "could not be converted (no markers, or GSAP
the converter cannot read: DOM measurement, nested timelines, conditionals)" - the sentence the
harness stopped using after it cost a correct timeline four rounds. `animationBreach` moved to
`src/blocks/animationRegion.ts`, beside the importer it explains, and both doors read it. Verified
live on this checkout's `/bridge`: a region missing one ease declaration comes back with *"the
region has no `var easeIn = 'expo.out';` - both `easeIn` and `easeOut` must be declared"*. Queued
for a human read in `docs/acceptance/owner-queue/2026-09-07-refused-animation-region-says-why.md`.

## The re-run answered it: 0 of 9 became 4 of 9

Nine cells, $0.714, out `pro-harness-out-rerun` (the €3 authorization now stands at $2.56 spent).
Neither fixed finding appears as a false positive anywhere in the ledger.

| | delivered | cost |
|---|---|---|
| the nine cells, as measured | 4 of 9 | $0.714, $0.0794 per attempt |
| the eight that reached a design verdict | 4 of 8 | $0.169 per delivered |
| the same nine, this morning | **0 of 9** | - |

`pd-grandfinal` hit the cost ceiling rather than a verdict, which is why the second row drops it.
Its last round did carry a TRUE `bench-field-unpainted` - it declared "Player 4" (f7) and drew it
nowhere - so the narrowed check is still sharp.

The refusals: `qz-primetime` (40px) and `qz-campus` (47px) on the size floor ALONE, nothing else
blocking in any round; `cd-launch` on `proportion-type-ratio-thin`, worked 0.15 -> 0.17 against 0.18
over three rounds and ran out; `pd-medal` on `bench-stress`, the known negative result.

**The human half is worse than 4 of 9 sounds.** `qz-arena` is a board worth airing. `cd-results` and
`cd-show` are competent and nearly identical to each other, from briefs reading "newsroom-severe"
and "playful, warm ... family show". `pd-seats` delivered CLEAN and is visibly wrong - about 60% of
its panel empty, every name and score jammed into a right-hand column. The deliver-signal leak
§23.1 drove to zero on lower thirds is back on the dense types.

`pro-harness-out-rerun/review.html` is the blind sheet (9 cells, frames all shot under the
entrance-derived settle), with `notes.md` to fill in before `key.json` is opened.

## Verified, and the one gate that did NOT run here

Green after taking `origin/main` in (fork point `39835021`, merged clean, no conflicts):
`npm run build`, `npx tsc --noEmit`, `eslint`, `depcruise`, `node --test
scripts/pro-harness.test.mjs` (25 of 25), `node --test scripts/e2e-affected.test.mjs` (46), and
`npx playwright test e2e/bridge.spec.ts e2e/lite-field-paint.spec.ts` (14 passed, re-run against the
merged tree). The free `--control` run is green end to end.

**The local integration plan did not run, and this is why.** `--integration --focus` from the fork
point plans **104 specs plus the catalog gate** - a full local suite. The job queue could not
schedule it: a `land-watch` on pull request 102 holds 0.15 of the machine's single suite-equivalent
while that pull request cannot land (`check:tree-shape` refuses three unlisted root entries, filed
in `docs/backlog/community-files-landing-is-stuck-on-tree-shape.md`), and a 1.0-weight job never
fits beside it. The watcher caps at an hour and re-arms, so the starvation outlives any one wait.
The queued job was cancelled rather than left to run unattended and report to nobody.

**So CI is the gate for this branch**, which the root contract already says it should be: it does
strictly more, in about ten minutes, on a clean checkout. **Read WHICH JOBS RAN** on the merge
queue's run before trusting a green - an ordinary push plans from the previous push.

## The blind read of the 2026-09-06 bank is gone

`pro-harness-out-gemini-v3` - 21 cells of code, frames and results, $1.444 of measurement - went
with the comparison worktree and was not archived (`C:/claude/noacg-archives/worktree-cleanup/
2026-09-07` holds one unrelated folder). `pro-harness-out*/` is NOT on the cleanup script's
rebuildable list, so the mechanism was right and is not what removed it. Only the re-run's cells can
be read blind now, and the rest costs $1.444 to have again.

## The owner question, and it is now the deciding one

`needs: alignment`. The 50px primary floor is the last wall in front of this type. Measured today,
through the instrument itself rather than from the CSS:

- **all 12 shipped quiz boards are refused by it** - 36-40px primary against a 49.68px floor, not
  one passes;
- the platform's own neutral lower-third spine is refused at 48px, and the harness control run
  excuses it in its own words ("bar the owner size table");
- two of this round's nine cells carried it as their ONLY blocking finding, and three of the last
  round's did.

The mechanism is `roleFor` in `readabilityCheck.ts`: the LARGEST informational text is "primary", so
on a dense type the primary element is the one carrying the most words and therefore having the
least room. §23.1 already measured the floor failing 312 of 489 shipped designs.

Should it block, warn, or become type-aware - a floor on a short strap line rather than on the
largest text of a dense board? Five cells across two rounds turn on the answer.
