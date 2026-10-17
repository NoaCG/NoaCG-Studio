# The held-out exam (H8): report

`docs/work-specs/noacg-harness/spec.md` sections 4.4 to 4.6, AC-7. Agent v7 as tuned (Opus 5.5 at
effort `high`, no critic, a 194-cent session budget, the skill of `@noacg/cli` 0.11.0) against
Claude Code with the published plugin on the same model, on the 20 sealed briefs. The sessions ran
on 2026-10-15; the frozen judge answered 26 calls that day and the last 31 on 2026-10-17, after
the subscription's Fable cap was reset. How every figure is counted was fixed before the first
session (`evidence/phase-8.md`); the per-session figures are there too.

## Verdict: MISSED

**The harness did not pass 4.5.** Two of the four lines fail:

| 4.5 line | holds | figure |
|---|---|---|
| usable delivery within one graphic of Claude Code's | **no** (yes by the gate alone) | harness 12 of 20; Claude Code 15 of 20 (10 by the gate alone) |
| zero basic visible mistakes and zero missing operator actions in the delivered graphics | yes | 0 of the harness's 12 delivered graphics with a basic visible mistake or a missing action |
| Claude Code preferred in no more than 10 of the 20 pairs, ties not preferred | **no** | Claude Code 13, harness 6, tie 1 |
| median wall at most 10 minutes, no accepted graphic over the session budget | yes | median 527 s; no accepted graphic over 194 cents |
| more than 5 order-flip ties makes it inconclusive | no | 1 flip tie (the Spanish flood alert) |

Line 3 fails either way, so the verdict does not turn on a reading. Line 1 turns on one: by the
missing-action gate alone Claude Code has 10 usable graphics and the line holds; with the six
readings of `exam/action-readings.json` (actions Claude Code's graphics offer under other names,
which the judge did not call missing, the ruling in `evidence/phase-8.md`) it has 15 and the line
fails. Both figures are given throughout.

**The cause is the session budget, not the model.** Both arms ran Opus 5.5 on the same skill. On
the 12 briefs where both delivered, the judge preferred the harness 6 times, Claude Code 5 times,
with 1 tie, and every one of the harness's 12 delivered graphics was judged airable with no basic
mistake and no missing action. The miss comes from the other 8: those sessions reached the
194-cent budget while still revising and handed in records marked not ready, so each of those
pairs went to Claude Code by delivery. 8 of Claude Code's 13 preferences are those.

**The run stops here (5.5).** H9 does not start, and the plan does not ship a harness that failed.
What a next plan changes first, and when to try again, is under "What a retry needs" below.

## The numbers (4.4)

Out of 20 requests each, Wilson 95% intervals.

| | harness | Claude Code |
|---|---|---|
| delivered | 12 (39% to 78%) | 20 (84% to 100%) |
| not ready at the session budget | 8 | none (no budget) |
| usable | 12 (39% to 78%) | 15 (53% to 89%); 10 (30% to 70%) by the gate alone |
| delivered with a basic visual defect | 0 of 12 (0% to 24%) | 3 of 20 (5% to 36%): 8 defects (matchup 4, community bug 3, auction board 1) |
| judged not airable | 0 of 12 | 5 of 20: matchup, community bug, auction board, quiz board, ski timing tower |
| delivered with a functional failure | 1 of 12 (2% to 35%): one event that did not move the machine | 3 of 20 (5% to 36%): 3 unmoved events; by the gate alone 8 of 20 (22% to 61%), 6 of them with 8 missing actions |
| validator errors | 0 | 0 |
| preferred in its pair | 6 (14% to 52%) | 13 (43% to 82%), 8 of them by delivery |
| tie (order flip) | 1 (1% to 24%) | |
| cost per usable graphic | $33.34 credit over 12 usable: $2.78 (capped sessions included) | $45.22 notional over 15 usable: $3.01 ($4.52 over 10 by the gate alone) |
| wall time, median / 90th percentile | 527 s / 744 s; 7 of 20 over ten minutes | 453.5 s / 595 s; 2 of 20 over ten minutes |

The three unmoved events (both award reveals' `settle`, Claude Code's auction `sold` and its
podiums' `resume`; the harness's volleyball `undo` was in a not-ready session) are the state
rule's blind spot: the judge saw each change the picture (`evidence/instruments.md` entry 19).
They stay counted as fixed before the run.

### Per brief

| brief | type | harness | Claude Code | pair |
|---|---|---|---|---|
| alumni-hall-of-fame-reveal | award-reveal | usable; `settle` unmoved | usable; `settle` unmoved | harness |
| borga-bilingual-notice | public-notice | usable | usable; `lang1`/`lang2` offered as `holdFi`/`holdSv` | harness |
| boxing-night-matchup | matchup | not ready (budget) | not airable, 4 basic mistakes; `select` offered as `winRed`/`winBlue` | Claude Code, by delivery |
| charity-stream-alerts | event-notification | usable | usable | Claude Code |
| collegiate-cs2-scorebug | esports-score | not ready (budget) | usable | Claude Code, by delivery |
| community-tv-station-bug | station-bug | usable | not airable, 3 basic mistakes | harness |
| film-fest-nominee-reveal | nominee-reveal | usable | usable | Claude Code |
| fun-run-sponsor-rotation | sponsor-rotator | usable | usable | Claude Code |
| hockey-club-match-board | match-board | not ready (budget) | usable | Claude Code, by delivery |
| library-conference-now-next | now-next | usable | usable | harness |
| parish-prayer-request | community-request | usable | usable | harness |
| school-auction-board | typeless | not ready (budget) | not airable, 1 basic mistake; `sold` unmoved | Claude Code, by delivery |
| school-quiz-secret-pick | quiz-board | usable | not airable | Claude Code |
| school-table-tennis-bracket | bracket | not ready (budget) | usable; `advance` offered as the round buttons | Claude Code, by delivery |
| ski-sprint-timing-tower | timing-tower | usable | not airable | harness |
| spanish-news-flood-alert | alert-level | usable | usable | tie (order flip) |
| volleyball-set-board | typeless | not ready (budget) | usable; `undoPoint`/`endSet` offered as `undoA`/`undoB`, `setA`/`setB` | Claude Code, by delivery |
| welsh-chapel-reading | statement-card | usable | usable | Claude Code |
| womens-derby-head-to-head | head-to-head | not ready (budget) | usable; `highlight` offered as `leadA`/`leadB` | Claude Code, by delivery |
| youth-game-show-podiums | podium-score | not ready (budget) | usable; `spotlight` offered as `spot1` to `spot4`; `resume` unmoved | Claude Code, by delivery |

By the gate alone, Claude Code's notice, bracket, volleyball board, head-to-head and podiums are
not usable (the matchup is not usable either way).

### What the judge's answers say about the judge

- **One order flip in 12 judged pairs**, against the more than 5 that would make the exam
  inconclusive.
- **The single and the pair can disagree on airability.** In two pairs Claude Code won (the
  charity alert and the quiz board), the judge called the harness's graphic not airable in one
  of the two orders (the donor message shown only with the long values; the question line cut by
  its mask for one frame of the Take), where its single had called the same graphic airable. In
  the quiz pair it preferred Claude Code's board, which its single had called not airable (the
  pick reveal shows the tick before the answer is judged). The counting fixed before the run takes
  airability from the single and preference from the pair, so neither changes a figure; it says
  how firm one judgement is, from a judge calibrated on stills.
- Every answer carries the frozen fingerprint `60bfb08e18a4`; the judge's files still hash to
  `judge.lock.json`.

### What the budget stops say

The reserve's `B` (194 cents, 1.5 times H5's mean on the five v1 briefs) sat 5 cents above the
dearest tuning graphic. On the exam's briefs, several with 8 to 12 fields and up to 16 buttons,
the twelve delivered sessions cost $0.92 to $1.87, and the eight capped ones were still revising
when they reached the cap. Each handed in a validator-clean interim record; they were stopped by
money, not by an error. All eight are boards an operator drives (two to five actions each, up to
16 buttons); the four briefs with no operator action all delivered.

## What a retry needs

- **Change first: the per-graphic budget**, set from briefs as dense as the exam's rather than
  from the five v1 briefs, and checked against the dearest dense brief before the exam's reserve
  is computed (5.2). On the judged pairs the loop already matches Claude Code on one model.
- **When to retry (section 9).** This miss has a cause on the host's side (the session budget the
  harness runs under), not the model's. That is the section's condition for a next attempt: a
  next plan with the budget changed, or the fallback path (our own loop) on the same kind of
  exam. A cheaper arm that passes the same exam at a lower cost per accepted graphic is the other.
- **New sealed briefs.** These twenty have now been read and judged; a retry is examined on a new
  held-out set written the same way (4.1), with this exam's counting rules.

## Spend (4.4's last line)

From `benchmarks/harness/ledger.json`, list price, credit:

| stage | model | sessions | credit |
|---|---|---|---|
| H3 feasibility | Haiku 5.5, Opus 5.5 | 6 | $2.66 |
| H5 tuning round 1 | Opus 5.5 | 5 | $6.24 |
| H6 tuning round 2 (critic, control) | Opus 5.5 | 4 | $10.08 |
| H7 tuning round 3 | Sonnet 5.5 | 5 | $2.36 |
| H8 exam | Opus 5.5 | 20 | $33.34 |
| **total** | | 40 | **$54.68** of $100 |

The exam spent $33.34 of its $46.60 reserve. Closing H8 releases the $13.26 it did not spend, so
$45.32 of the $100 is unspent. Per usable harness graphic: $2.78 in the exam, $4.56 across the
whole plan ($54.68 over 12). Subscription, notional, no credit: the exam's reference arm $45.22;
its judge $259.10 over 57 answered calls (26 on 2026-10-15, one of them void, and 31 on
2026-10-17).

## The owner gallery (4.6)

Ten pairs, chosen by the rule fixed before the run (the flip tie, then the pairs Claude Code won,
judged before by delivery, each in brief order): the Spanish flood alert; the charity alert, film
festival, fun run, quiz board and chapel reading; then the matchup, esports scorebug, hockey board
and auction board, where the harness's side is its not-ready interim record. On this machine at
`C:\claude\noacg-bench-archive\harness-exam-2026-10-15\owner-gallery\review.html`, never
committed, arms hidden, `key.json` beside it, `notes.md` for a verdict. The owner's verdict
overrides the judge's; the exam stops either way.

## What twenty briefs can show

This is a pilot: a 10 of 20 split carries an interval of roughly 30% to 70%. On the judged pairs
the two hosts are close to even; what the miss measures is the loop under a 194-cent budget on
dense briefs.
