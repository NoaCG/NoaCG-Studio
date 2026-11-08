# Codebase health closeout, 2026-11-08

Stop the standalone trend receipt. Keep naming the behavior owner and its existing proof in
ordinary reviews when there is a concrete placement or coverage question. The useful review
actions came from reading diffs and tests. The counts helped locate and interpret changes, but
did not identify a repair or change an ownership decision by themselves.

## Pinned changes

The [October snapshot](../work-specs/codebase-health/evidence/measurements.json) stays at
`50ce0911d9f37f5d1116e51a1cb34541ed03aef5`. The 30-day window at that pin had 743 first-parent
integrations. The original size, frequency and net-growth rows reproduce, including the AI step's
move-adjusted 2,133 → 1,659 lines (−474, nine integrations). The October and November windows
overlap. Neither is a before-and-after control for the other.

The November pin is `df5767458230558e9fdee158e663e9367e58f8e3`. Its window is
`(2026-10-09T11:37:21Z, 2026-11-08T11:37:21Z]`, with 917 first-parent integrations.
The 14-day window starts at `2026-10-25T11:37:21Z` (exclusive), with 303 integrations.
The 30-day starting tree is `5c6269073b3da058683cf6dc7313392cd765d99b` at 11:09:00 UTC
on October 9. Times are Git committer times. This is a selected set of paths from the October
report and the S8 move, with physical lines and distinct integrations touching each row.

| Path under `src/` | Start → end lines | Net | Integrations, 30d / 14d |
| --- | ---: | ---: | ---: |
| `components/home/ProductionPage.tsx` | 5,655 → 4,512 | −1,143 | 64 / 34 |
| `styles/playout-dashboard.css` | 2,768 → 2,997 | +229 | 17 / 14 |
| `components/HostedControlPage.tsx` | 2,153 → 2,709 | +556 | 18 / 13 |
| `control/hostedControl.ts` | 2,085 → 2,495 | +410 | 24 / 14 |
| `model/shows.ts` | 1,914 → 2,800 | +886 | 22 / 8 |
| `components/wizard/CreationWizard.tsx` | 2,592 → 1,419 | −1,173 | 23 / 6 |
| `components/wizard/{steps,ai}/AiStep.tsx` | 2,152 → 1,657 | −495 | 6 / 1 |
| `components/wizard/{,template/}kitPlan.ts` | 288 → 288 | 0 | 1 / 0 |
| `components/wizard/{,template/}KitTray.tsx` | 93 → 93 | 0 | 1 / 0 |

The S8 path additions of 288 and 93 lines were moves with import edits. For AiStep the new path
alone appears as +1,657 across three integrations. Following both paths counts the move once and
includes the later shim removal. The production-page reduction likewise mixes extraction and
ordinary work. In #1620 the page changes by +24/−473 while the new `ProductionShell.tsx` and
`CueActions.tsx` contain 308 and 223 lines. In #2259 a later ordinary fix adds one page line and
27 watcher lines. The reductions and the growth describe different changes, and this sample
does not classify every integration. [Production extraction](https://github.com/NoaCG/NoaCG-Studio/pull/1620) · [Phase 2 sample](../work-specs/codebase-health/evidence/maintenance-review.md)

## What the reviews showed

- **Bridge reload handoff.** Phase 2 identified the useful review: check the same-leader,
  hidden-tab and idle-reload guards after the wait query in `bridgeWatch.ts`, and check the
  same-key lookup in `webLockLead.ts` against the two existing tests. The page supplies
  visibility to the watcher. Reflow of nearby Bridge documentation was avoidable. The studio
  follow-up leaves background-tab throttling on real hardware unexercised.
  [Studio follow-up](https://github.com/NoaCG/NoaCG-Studio/issues/1553#issuecomment-6693921888)
- **Wizard Finish and S8.** The ordinary Finish fix leaves the clock logic in the import
  capability and replaces one shell line to show the resolved target. Phase 2 found no further
  placement change. The independent S8 reading clarified that `useKit.openGraphic` prepares
  and dispatches the selection and the `walkState` reducer owns the update to `current`.
  The S8 move also required edits to four runtime importers, test loaders and rule scopes. Browser
  assertions stayed in place, and the existing dependency check rejected a cross-capability
  import in the recorded probe. These are concrete costs and proof of the move.
  [Phase 2 independent check](https://github.com/NoaCG/NoaCG-Studio/pull/2288#issuecomment-6721248732) · [S8 receipt](../work-specs/wizard-structure/evidence/phase-s8.md)
- **Local file source.** A PR review caught that a tab unable to read the file could hold the
  shared reader lease. The repair put the eligibility check at that existing lease and added a
  two-reader regression. The diff uses one live value writer, `productionDataSession.applySourcePatch`,
  and keeps authored configuration on the existing `shows.ts` path. Phase 2 found no
  independent defect warranting another model seam or an avoidable collateral edit in this
  sample. The landed design avoids a parallel lease or persistence owner. The later receipt
  confirms that separation, with no evidence that the trend report caused the repair.
  [Review finding](https://github.com/NoaCG/NoaCG-Studio/pull/2197#discussion_r4479920131) · [Repair receipt](https://github.com/NoaCG/NoaCG-Studio/pull/2197#discussion_r4479998125) · [Phase 2 sample](../work-specs/codebase-health/evidence/maintenance-review.md)

## Budget friction and wizard revisit

At the November pin the shell is 1,419 of 1,419 lines and AiStep is 1,657 of 1,659. In the 650
first-parent integrations after the October pin, eight touched a budgeted path and none changed
the budget definitions. Replaying the eight resulting states plus the October starting tree found
no missing file or overage on main. There is a recorded cost: #2101 says it moved the library
adapter into `shell/walkLibrary.ts` to stay inside the shell budget. Its ordinary reimport fix
added the 20-line adapter shared by the save and editor doors, and the shell went from 1,419 to
1,412. This is observed refactoring work linked to the budget. A rejected branch, delay, hours
spent or harmful workaround was not established. Landed trees cannot settle those questions.
Keep the two budgets under the owner's existing decision. [Reimport PR](https://github.com/NoaCG/NoaCG-Studio/pull/2101)

The existing S9 revisit is [#1241](https://github.com/NoaCG/NoaCG-Studio/issues/1241). It was open
with no comments when checked, and the pinned wizard spec, metrics history and PR search yielded
no completed revisit receipt. The [S8 check](https://github.com/NoaCG/NoaCG-Studio/pull/1245)
and [wizard metrics](2026-10-14-wizard-shell.md#co-change-ac-8) give the move and proof context.
Their co-change windows mostly predate the split and use a different commit population. One
Finish fix and the budget-driven adapter move do not settle post-split coupling or the case for
S9. Leave the existing S9 decision with its issue.

The cases show where normal review adds value. They do not measure how often the ownership map
changes a patch, engineering time saved, defect rates or production behavior. See the
[reproduction and scope receipt](../work-specs/codebase-health/evidence/phase-3.md).
