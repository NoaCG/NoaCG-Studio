# cf21: Review stopping rules

Phase 14 of the cicd-followup run (#1967), added by the owner's decision of 2026-11-07
([owner-decision-2026-11-07-cf21.md](owner-decision-2026-11-07-cf21.md)). Status: built, landing.

## Acceptance, verbatim

(a) plan-run.md, known-traps.md, so.md and check.md state the above without contradicting each
other. (b) cf20 reports review rounds per PR, the share passing after one round, and cf03's "M1
from ready" for rows before and after cf21, with sample sizes and cf03's spread rule, and makes no
improvement claim without enough rows. (c) The guardrail: cf20 also reports reverts and
post-landing failures for the same rows, and a rise counts against the change rather than as a
saving. (d) No check, test, limit, gate or budget is weakened.

## 1. (a) The six changes, and where each is written

`docs/plan-runs/known-traps.md` "Review checkpoints" is the one full statement; the other three
files say their part and point to it.

| Change | known-traps.md Review checkpoints | plan-run.md | so.md | check.md |
| --- | --- | --- | --- | --- |
| 1 Delta re-review | the Delta re-review row (replaces Narrow delta and extends it to repair heads) | Review stopping rules bullet | In a plan run: Delta re-review | |
| 2 Round cap | Round cap bullet; the Repeated family row names it | Review stopping rules bullet | | section 5 |
| 3 Converging findings | Converge bullet | Review stopping rules bullet | In a plan run: Name the class | section 2: every instance of a class in one pass |
| 4 Risk-scaled review | Ordinary row (no `/so`); Risky row lists the never-Ordinary paths and keeps the final `/so` | the gates line and the bullet | In a plan run: when a `/so` runs | section 5 |
| 5 Codex review guidelines | | | | |
| 6 Pre-existing findings | Pre-existing findings bullet | Review stopping rules bullet | In a plan run: Pre-existing | section 2 |

Change 5 is the rule `root/codex-review-guidelines-real-defect-product`, written by
`npm run learn`, compiled into `src/AGENTS.md` (and `.claude/rules/` for the other folders).
The brief templates (`docs/plan-runs/templates/{build,fix,repair}.tmpl`) were changed for
consistency: they named Narrow delta and required a `/so` on every row.

The Codex copies of the templates and the plan-run reference
(`.agents/skills/plan-run/references/templates/{build,fix,repair}.tmpl`, `codex.md`) were changed
the same way. Searched for conflicting wording after the change: `Narrow delta` appears only in
the owner's decision and this file;
`Repeated family`, the repair limits bullet and every `/so` gate read as above.

## 2. (d) Nothing weakened

- **Repair limits, CI, the Codex request per head, the configured gate, the checker:** unchanged.
  The round cap is a warning that comes before a patch, not an attempt.
- **`/so` on Ordinary rows:** dropped, as change 4 authorizes. Every path the owner named as never
  Ordinary is in the Risky row and keeps the Rules-first `/so` and the final `/so`.
- **Delta re-review** keeps every reason for a full `/so` the owner listed, plus Narrow delta's.
- **Pre-existing findings** are defects in code the PR did not change that already exist on the
  base. A defect the PR causes,
  in changed code or not, still blocks. `check.md` used to say to report a problem outside the
  diff; now that problem does not block the branch when it is already on the base, and it gets an
  issue link when it is not fixed.
- **Every row that is not Ordinary** keeps its final `/so`. The receipt names the row's class, and
  the coordinator checks the diff against the Risky paths before stamping a row with no `/so`.
- **The root `AGENTS.md` byte ceiling** (3,072, `KERNEL_MAX_BYTES`) was not raised. The
  guidelines rule scoped to `**` would make the file 3,447 bytes, so it is scoped to `src/**`,
  `api/**`, `e2e/**` and `supabase/**`. Of those, only `src/AGENTS.md` is compiled; the other three
  folder contracts are hand-written, so a reviewer of a change only there does not read it. The
  owner's list of real defects (state rules, playout, export, data loss) is product code, mostly
  under `src/`. `scripts/`, `.github/` and `docs/`, where most cicd-followup rows land, are not
  covered, so cf20 should not expect the rule to change those rows' Codex rounds.

## 3. (b) and (c): the method cf20 uses

`phase-cf21-review.mjs` collects, derives and reports. Each `collect` pass makes at most 100
GitHub REST calls and caches every immutable read. A commit's run list is read again on every pass
until it is non-empty, finished and read at least two days after the merge, so late runs and re-runs
are seen. No log, signed URL or credential is read or stored.

- **Rows.** Merged PRs whose branch is a build, repair or re-run of a phase, or an owner-requested
  fix, of any plan run (`ROW`: `<tool>/plan-<plan>-<phase>-<build|repair|rerun>` or `-fix-<n>`).
  Every plan run works under the same Review checkpoints, and the after side needs every row it can
  get. Spec and check branches are not rows.
- **Sides.** Before: merged before cf21's `merged_at`. After: PR created after cf21's `merged_at`
  (built under the new rules) and merged before the next landing that changes the review rules
  again. A PR opened before and merged after is on neither side and is listed (`straddling`).
  A landing changes the review rules when it changes `so.md`, `check.md` or the Review checkpoints
  section of `known-traps.md` (`ruleLandings`). Other edits to `known-traps.md` do not end a side.
- **A review round** is a reviewer result that carried findings: a Codex review (from
  `chatgpt-codex-connector[bot]`) with at least one inline comment, or a review by any other person
  that requests changes or has inline comments. Reviews by the agents' account and bots are
  replies, not rounds. Clean results (Codex's receipt, a thumbs-up) are not rounds. Only results
  before the merge count. `/so` and checker verdicts are not on GitHub per round, so they are not
  counted, on either side.
- **Passing after one round:** zero rounds, so the PR's first review result was clean.
  `reviews_to_pass` is rounds + 1, the measure in the owner's reference (mean reviews to pass, and
  the share needing five or more).
- **M1 from ready**, cf03's definition unchanged (phase-cf03.md section 2): from the PR's last
  `ready_for_review` event, or its creation, to the first successful `CI gate` job of the final
  head's ci.yml PR or dispatch runs, any attempt. Each row also gets cf03's group (section 4.1).
- **Post-landing failure:** a run on the merge commit from the push to main or its deployment whose
  latest attempt failed, timed out or did not start, or that was run again.
- **Revert:** a commit on main within 7 days after the row's merge whose subject starts with
  "Revert" and that names the PR or its merge SHA, or removes lines the PR added to a file both
  changed. A row merged less than 7 days before the read has no revert result yet and is left out
  of the share (`revert_known`), so older rows are not favoured.
- **cf03's spread rule** (phase-cf03.md section 5.2), with the before rows as the reference: the
  robust standard deviation (1.4826 times the median absolute deviation), also over the longest
  stretch of rows with no review-rule landing, the larger one being the spread; the minimum n per
  side by cf03's resampling test (2,000 draws, seed 3, floors 8 and 20). The statistics are copied
  unchanged from `phase-cf03-baseline.mjs`.
- **One departure from cf03: the reference is all rows, not one group.** cf03 groups by offline
  shard count and configured jobs, because they decide which CI chain is critical. M1 from ready
  is mostly review and repair time (before median 27.8 minutes against cf03's CI-only M1 of 5 to 15),
  and only `cap+cfg` has enough rows for a per-group minimum. The report prints M1 from ready per
  group, so cf20 can see a shift in the group mix.
- **Claims** (`report --cf21 <merged_at>`). An improvement must hold over all rows **and** within
  the plan with the most after rows, so a change in the plan mix cannot make one alone (before,
  passed after one round: cicd-followup 12 of 18, jev-svg-import 22 of 41).
  - M1 from ready: both sides reach the minimum n, and the after median is lower by more than the
    spread.
  - Rounds per PR have a spread of 0 (most rows have none), so cf03's test cannot size them. The
    share passing after one round is compared with cf03's share test instead: one-sided Fisher
    exact, p below 0.05, at least 8 rows a side.
  - Reverts and post-landing failures: any higher rate on the after side, compared on the exact
    counts, is reported as counting against the change, with its Fisher p, never as a saving.

## 4. The before side

Window: merges from 2026-10-31T11:40:05Z (ci02, #1852, which made Review checkpoints the one rule
set for plan-run reviews) to the read at 2026-11-10T12:44:21Z. Rows merged after the read and
before cf21 lands are before rows too: cf20 collects up to cf21's `merged_at`. Records:
[phase-cf21-records.json](phase-cf21-records.json). Collection used passes of at most 100 calls
(some stopped early on a GitHub 502 and were run again; cached reads are not repeated).

| Measure | Before (n = 88) |
| --- | --- |
| Rows by plan | jev-svg-import 41, cicd-followup 18, cicd-improvement 17, interaction 7, codebase-health 3, editor 1, vmix 1 |
| Review rounds per PR | median 0, p95 6; 0: 54, 1: 15, 2: 5, 3: 3, 4: 3, 5: 2, 6: 3, 7: 1, 10: 1, 26: 1 (#1880, ci18) |
| Passing after one round | 54 of 88 (0.61) |
| Five or more reviews to pass | 11 of 88 (0.13) |
| M1 from ready, minutes | median 27.8, p95 151.8 (n 88) |
| M1 from ready by cf03 group | cap+cfg 46 rows, median 40.9; none 16, 14.2; small 9, 18.1; cap 6, 24.5; small+cfg 6, 21.8; none+cfg 5, 20.5 |
| Reverted within 7 days | 0 of 58 rows with a full window (#2237's revert, 900ce353, is inside its window, but #2237 merged under 7 days before the read) |
| Post-landing failure | 11 of 88 |

**Spread and minimum n (cf03 section 5.2).** M1 from ready: whole 20.6, clean stretch 20.7 over
67 rows, spread 20.7 minutes; minimum 25 rows a side for the median, over 120 for the p95 (compared
by median only). Rounds: spread 0, compared through the share passing after one round. One
review-rule landing fell in the window (2026-11-03T20:51:56Z).

Two rows are long by holding, not by review: #2261 (4,328 minutes, cf13's re-run held for days by
design) and #2171 (783). The median is the compared statistic, so they do not move a claim.

**No improvement claim is made here.** cf21 has no after rows yet. cf20 runs `report --cf21
<cf21 merged_at>` and claims nothing unless both sides reach the minimum n it prints (25 on today's
before side; it is recomputed from the before side cf20 reads); with fewer it reports the sample
sizes. Only six cicd-followup phases remain before cf20, so the after side depends on the
other plan runs' rows (interaction is active); cf20 may well report "not enough rows".

## 5. Verification

- `node docs/work-specs/cicd-followup/evidence/phase-cf21-review.mjs report --records docs/work-specs/cicd-followup/evidence/phase-cf21-records.json`
  reproduces section 4 from the records alone, with no API call.
- Spot checks against GitHub: #1888 has 4 rounds, as phase-ci17.md's AC-2 table counts 4 review
  requests; #2261 has 0 (four clean receipts); #2237's revert is 900ce353.
- `npm run contracts:compile` leaves the tree unchanged; the root `AGENTS.md` stays under its
  ceiling.

## 6. Phase notes

- **Previous verified main SHA:** 7c16e66a (PR #2343), merged into this branch; its CI gate passed.
- **Revert:** `git revert -m 1 <this merge's SHA>`. It restores the earlier review wording and
  removes the guidelines rule; run `npm run contracts:compile` after, so the compiled files match.
- **Decisions.**
  - known-traps.md holds the full rules; the other files say their part and link to it, so one
    change cannot drift between four copies.
  - Paths the owner named as never Ordinary are listed in the Risky row, so they keep both `/so`
    reviews, as the brief asks.
  - The guidelines rule is scoped to the product folders, not `**`, because the root contract is
    at its byte ceiling and a ceiling is not raised (acceptance d).
  - Rounds count reviewer results with findings on GitHub, the one record both sides share.
  - Rows from every plan run, with the claim required within the dominant plan too, because a
    two-plan frame would leave the after side too small and open to a mix effect.
  - Reverts count within 7 days of the merge, so every row has the same time to be reverted.
  - Delta re-review applies to every row, Risky included. Change 1 extends Narrow delta, which
    already applied to Risky rows, and the owner did not limit it. The reviewer goes back to a full
    `/so` for any effect beyond the delta. The stricter reading (a full `/so` for every repair on a
    Risky row) was not taken.
  - This PR reached the new round cap itself: a Codex round and two `/so` rounds (grade B, both
    AGREE WITH CORRECTIONS). The reassessment before the third patch found the approach sound and
    the remaining findings one class (rule text not carried to every copy and case: the Codex
    template copies, the receipt's third class, the pre-existing condition), fixed together.
  - The before window starts at ci02, when today's review rule set began.
- **Traps.** `gh api` with `head_sha` needs the full SHA. A merged PR's commit list says nothing
  about reverts that do not name it (900ce353 names no PR), so reverts are also found by the lines
  they remove.
- **Follow-up, 2026-11-10.** Change 5 now applies to every PR: the rule's scope is `**`, so it
  compiles into the root AGENTS.md, and the root ceiling is 3480 bytes
  (owner-decision-2026-11-10-codex-root.md).
