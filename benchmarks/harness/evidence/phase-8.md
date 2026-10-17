# H8 evidence: the held-out exam

Phase 9 of `docs/work-specs/noacg-harness/spec.md` (AC-7, sections 4.1 to 4.6, 5.2, 5.5), built
2026-10-15 on `origin/main` `c7c5ae224`, on the bench workspace's key and the owner's
subscription. The report is `benchmarks/harness/exam/REPORT.md`.

## Before the first session

Written and committed before any H8 session was created (5.1). Nothing here changes after a
result is seen.

- **What is examined: agent v7 as tuned.** `agent_0183yBA1miijGFNvm5bkMv6B` v7 (lock hash
  `b1cf0534...`): Opus 5.5 at effort `high`, no critic (`multiagent` null), the 15-line plumbing
  prompt, `session_budget_cents` 194, skill `skver_01KXt4Xf4msx422tocc44dmh` (bundle
  `7f130e3e...`, the bytes of `2128d984d` and of the published `@noacg/cli` 0.11.0), environment
  `env_01PFiXgBUuDv5aFgEwHXayiY`. No `--model` override, `--effort` or `--agent-version`: the run
  refuses them in the exam, and it reads v7 back from the server before it uploads anything. The
  container installs this checkout's CLI (`npm pack` of `cli/`); `cli/src` is unchanged since
  H7's base `1d3aade23` (`git diff --stat 1d3aade23 HEAD -- cli/src` is empty), and the
  agent-delivery plan's phase 2 (login, save, pack, whoami in `cli/src`) has not landed.
- **The reference arm (4.2): Claude Code on the subscription.** One fresh `claude -p` per brief,
  `--model claude-opus-5-5`, in an empty directory under the run directory (outside the
  repository), the plugin `cli/plugin` with the lock's skill copied in (as the H7 repair built
  it), this checkout's built CLI on PATH behind the ledgering shim, `NOACG_URL`
  `https://noacg.studio`, no save, 25 minutes at most. DECIDED: Opus 5.5 for the reference, the
  model the harness runs, so the exam compares the two hosts of one loop on one model and one
  skill, not two models. Revert: run the reference arm again with another `--model` into the
  same run directory and judge again (no credit).
- **The briefs: the 20 sealed ones**, opened in memory by `benchmarks/harness/lib/exam.mjs` with
  the passphrase in the main checkout's private folder, verified against
  `exam/briefs.sha256` before anything else, refused in every phase but the exam's window. The
  dry run did it at 17:32Z: 20 briefs, the hash matching, 18 registered types and 2 typeless. No
  brief text is written into the repository; each cell keeps its brief in the run directory.
- **Stress on the right field** (instruments.md entry 6). The sealed briefs key stress by
  position. Fixed before any session, for both arms alike: each `fN` is named by the label of
  field N of the brief's type (`noacg types`) or of its typeless `fields` string, then lands on
  the package field whose label is exactly those words, else the first that holds them whole,
  each field taking one value; with no such field it keeps its position. Each cell writes where
  every value went (`stress.json`'s `stressMap`). Before the judge reads, every cell's map is
  read against its fields; a value on a wrong field is re-keyed and both arms of that brief are
  re-captured alike at $0.
- **Ceiling: the reserve.** `--ceiling-cents 4660`, `R` = 20 x ($1.94 + $0.39). The wall admits a
  session only while the ceiling less what H8 spent covers 194 + 39 cents, so twenty sessions at
  their cap fit exactly and a twenty-first never starts.
- **How it runs.** Each arm in its own lane, side by side: the credit arm one session at a time
  (the wall's concurrency of 1), the reference beside it on the subscription; a reference cell
  the usage limit pauses waits for the reset and runs again, never on the credit. The first
  brief runs alone first, and its harness trace is read for the certificate import (`</dev/null`,
  new in v7 and not yet run on Opus: rc 0, the bridge ready near 35 s) before the other nineteen
  start.
- **Hypothesis (AC-7).** The harness passes 4.5 on the sealed briefs: usable delivery within one
  graphic of Claude Code's, no basic visible mistake and no missing operator action in its
  delivered graphics, Claude Code preferred in at most 10 of 20 pairs, a median wall of at most
  ten minutes and no accepted graphic over 194 cents. Expected from tuning: about $1.30 a session
  (H5's mean over six Opus graphics), a median near 340 s, and the 194-cent cap close to the
  dearest Opus graphic so far ($1.89): a harder brief can stop at it.

### How every figure is counted (fixed now, as the tuning rounds counted)

`node scripts/harness-bench.mjs --tally <runDir>` (`tallyExam` in `lib/exam.mjs`, with its
tests) computes all of it from the cells and the judge's answers:

- **delivered**: the harness session idled at `end_turn` with the record and zip handed in and a
  last message that does not call it not ready (`not-ready`, a budget stop or the agent's own
  not-ready verdict, is not delivered; `failed` is no record or the hard time cap); the reference
  handed in `outputs/record.json` within its 25 minutes.
- **usable** (the rounds' "accepted"): delivered, the bench's validator clean, the save door's
  shape check passed, no missing action (the mechanical gate with the alias and word rule), and
  the frozen judge's single judgement airable with no basic visual defect.
- **basic visual defect**: a `basicMistakes` entry of the single judgement other than
  `missing-action` (text over text, unreadable contrast, clipped or escaping text, empty or
  broken).
- **functional failure** (4.4): a validator error, a missing action, or a coverage finding that an
  event did not move the machine. An unmoved event is reported and looked at in its frames; it
  does not change "usable", as in tuning, where a data event (a point) can change values without
  changing the machine's state.
- **pairs**: judged in both orders by the frozen judge (`claude-fable-5-1`, fingerprint
  `60bfb08e18a4`) when both arms delivered; an answer that flips with the order is a tie. When
  only one arm delivered, the pair is that arm's without judging; when neither did, a tie that is
  no flip. Only delivered graphics are judged (`--judge --delivered-only`).
- **the verdict**: 4.5's four lines exactly as written; **MISSED** if any fails; if all hold and
  more than 5 pairs tied on an order flip, **INCONCLUSIVE** ("judge unreliable on this set");
  else **PASSED**. The wall is the bench's (create to cleanup), median over the twenty harness
  sessions; the budget line is an accepted harness graphic whose list cost is over 194 cents.
- **Wilson intervals** (95%) on every rate, out of 20 requests, or out of the delivered graphics
  for defect and failure rates.
- **cost**: the H8 credit over the usable harness graphics, failed and capped sessions included;
  the reference's notional `total_cost_usd` over its usable graphics.
- **Before any pair**: each pair's Update op is compared (`coverage.json`); where the two arms
  updated different kinds of field, both are re-shot with the other's Update and that frame
  decides a defect there (instruments.md entries 9, 11). A list brief's verdict covers only the
  item count its stress gives (#1251). The validator misses a line its mask cuts vertically at
  rest (#1259), so a judge finding there is not an instrument disagreement to resolve.
- **The owner gallery (4.6)**: ten pairs, chosen after the tally by a rule fixed now: the pairs
  that tied on a flip, then those Claude Code won, then those with the lowest judge confidence,
  then brief order. `benchmarks/harness/exam/gallery/review.html`, never committed.

A miss is a finished phase: the report lands either way, the run stops (5.5), and H9 does not
start.

### Two rulings made during the run, before the tally

Written while the sessions ran, after 9 of the 20 briefs were captured and before any figure was
added up. Each applies to both arms alike.

- **A missing-action flag the judge did not confirm is read against the operator surface** (3.5,
  binding on every phase: an instrument that fires on a graphic the judge called clean never
  rules over the picture; AC-17). On a typeless or free-named brief the mechanical gate's word
  rule can miss an action offered under another name: Claude Code's volleyball board offers
  `undoA`/`undoB` and `setA`/`setB` where the brief says `undoPoint` and `endSet`, and its
  bilingual notice offers `holdFi`/`holdSv` ("Suomi", "Svenska") for `lang1`/`lang2`; the
  judge's single on the notice named no missing action. (Corrected 2026-10-17: this first said
  the judge named nothing missing on either; the volleyball single was the call the usage limit
  refused, unanswered when this was written.) So a flag stands when the judge's
  single also names the action missing, or when no button's event and label do what the action
  says; otherwise it is an instrument disagreement, logged in `instruments.md` with the buttons,
  and the action counts as offered. Each reading is listed in `exam/action-readings.json`, which
  `--tally` applies; the report gives both figures, as counted by the gate alone and with the
  readings. DECIDED, revert: drop the file and tally again.
- **A stress value with no field of its own is shown nowhere.** Where the label rule put a value
  on a field written for something else (Claude Code's quiz: the audience results on its question
  number), it is moved to the right field or, when the package has none, dropped
  (`exam/rekey.json`), and both arms of that brief are captured again before the judge reads
  them (`--recapture`).

## The run (2026-10-15): every session ran; the judge paused

**Status on 2026-10-15 (the verdict came on 2026-10-17, below).** All 40 sessions ran and every graphic is captured, but the
frozen judge (`claude-fable-5-1`) stopped after 26 answered calls: the subscription's own Fable
cap (`rate_limit_event` `seven_day_overage_included`, utilization 1.0, extra usage disabled for
the organization) refuses it until **2026-10-20T05:00Z**, when that seven-day window resets. 19
single judgements and 6 pairs (31 calls) wait. The judge is frozen (4.3), so no other model
judges, and nothing moves to the credit (decision 12, 5.4). The verdict is decided only when
they are answered, by the rule above.

Through `scripts/harness-bench.mjs --build H8 --arms managed-agents,claude-code --model
claude-opus-5-5 --ceiling-cents 4660`, the first brief alone first (its trace: the certificate
import `</dev/null` returned at once and the bridge was ready at 36 s), then the other nineteen,
each arm in its own lane. The configuration and counting rules above were committed in
`2e981a9ae` (17:35:39Z) and on GitHub in draft PR #1268 by 17:35:58Z; the first session was
created at 17:36:26Z.

| brief | type | harness session | outcome | list cost | wall | requests | images | largest request | Claude Code | notional | wall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| alumni-hall-of-fame-reveal | award-reveal | `sesn_01VHrAFUaqs1DPMYvx6oauWQ` | delivered | $1.87 | 788 s | 42 | 16 | $0.1227 | delivered | $2.46 | 425 s |
| borga-bilingual-notice | public-notice | `sesn_019HbBsQFWJSUDfjrPtNhW2a` | delivered | $1.76 | 471 s | 41 | 16 | $0.0912 | delivered | $1.71 | 385 s |
| boxing-night-matchup | matchup | `sesn_01NFcJLZd5MwUg59qzKJP96M` | not-ready (budget) | $1.96 | 682 s | 40 | 18 | $0.1427 | delivered | $3.00 | 573 s |
| charity-stream-alerts | event-notification | `sesn_01FqBSjobKQCUDKYaLsrg8zj` | delivered | $1.57 | 536 s | 32 | 17 | $0.1538 | delivered | $2.03 | 455 s |
| collegiate-cs2-scorebug | esports-score | `sesn_01QyB85puZWi9CMVRuxdU56X` | not-ready (budget) | $1.95 | 782 s | 37 | 12 | $0.1512 | delivered | $2.73 | 575 s |
| community-tv-station-bug | station-bug | `sesn_018nwapoeNcpBKr89zNdG9NH` | delivered | $0.92 | 293 s | 20 | 15 | $0.1200 | delivered | $1.92 | 332 s |
| film-fest-nominee-reveal | nominee-reveal | `sesn_01Drb2YeRgrf4urtkkDqKrnD` | delivered | $1.13 | 452 s | 25 | 15 | $0.1917 | delivered | $2.23 | 477 s |
| fun-run-sponsor-rotation | sponsor-rotator | `sesn_01BdfoqVXn4DWsM9xxsb4cuF` | delivered | $1.12 | 461 s | 28 | 8 | $0.0930 | delivered | $2.48 | 475 s |
| hockey-club-match-board | match-board | `sesn_017oeNj9CRUynogg3WXwdz5G` | not-ready (budget) | $1.96 | 629 s | 36 | 10 | $0.1672 | delivered | $2.39 | 470 s |
| library-conference-now-next | now-next | `sesn_017ZKaDcxDveT5HtGnqsbrSS` | delivered | $1.42 | 349 s | 26 | 31 | $0.1215 | delivered | $1.58 | 217 s |
| parish-prayer-request | community-request | `sesn_01AmY11kkiszhf27dnCkZafi` | delivered | $1.84 | 518 s | 42 | 14 | $0.1275 | delivered | $1.46 | 374 s |
| school-auction-board | typeless | `sesn_01URiMR3mbN1cnSF21cNQCdw` | not-ready (budget) | $2.00 | 717 s | 42 | 5 | $0.1218 | delivered | $3.96 | 792 s |
| school-quiz-secret-pick | quiz-board | `sesn_015ajA2A7xxS4a8bSC9nshjj` | delivered | $1.70 | 458 s | 35 | 16 | $0.1304 | delivered | $2.05 | 331 s |
| school-table-tennis-bracket | bracket | `sesn_01KQt5KxuEXzpBu9qHtR4EYD` | not-ready (budget) | $1.95 | 744 s | 34 | 20 | $0.2003 | delivered | $3.04 | 595 s |
| ski-sprint-timing-tower | timing-tower | `sesn_01565Yydbjp2JSZpZfZD8oJz` | delivered | $1.67 | 558 s | 31 | 25 | $0.1194 | delivered | $2.44 | 462 s |
| spanish-news-flood-alert | alert-level | `sesn_019HbBsMsgaiZNJRWzLxkhzN` | delivered | $1.48 | 495 s | 35 | 22 | $0.1319 | delivered | $1.77 | 397 s |
| volleyball-set-board | typeless | `sesn_015LQMW3Y5XXYX2BBv1euKnA` | not-ready (budget) | $1.95 | 553 s | 37 | 12 | $0.2362 | delivered | $2.48 | 615 s |
| welsh-chapel-reading | statement-card | `sesn_01J46fSouQFW7J3yre5wQruD` | delivered | $1.11 | 340 s | 31 | 8 | $0.0890 | delivered | $2.00 | 452 s |
| womens-derby-head-to-head | head-to-head | `sesn_011dYKfG7dSe9fF5rHNxRAHb` | not-ready (budget) | $2.01 | 449 s | 32 | 48 | $0.1360 | delivered | $1.81 | 370 s |
| youth-game-show-podiums | podium-score | `sesn_01HK8Ft15Crhy2wemskD7v6o` | not-ready (budget) | $1.97 | 693 s | 39 | 28 | $0.1408 | delivered | $1.68 | 310 s |

- **The harness: 12 of 20 delivered; 8 stopped at the 194-cent budget** (`budget_reached`, each
  handed in an interim record marked not ready, a delivery miss in 4.5). $33.34 of the $46.60
  reserve, a mean of $1.67 a session against H5's $1.29 on the v1 briefs: the exam's briefs are
  denser (up to 12 fields and 16 buttons) and the eight capped sessions were still working. The
  delivered twelve cost $0.92 to $1.87. The largest single request was $0.2362, the largest
  overshoot past the cap 7 cents, inside the 39-cent margin. Median wall 527 s, 90th percentile
  744 s, 7 sessions over ten minutes (the bench's wall, create to cleanup).
- **Claude Code: 20 of 20 delivered**, $45.22 notional on the subscription, median 453.5 s.
- **Cleanup:** every one of the 20 sessions answers 404 on a free read after the run, and the
  bench workspace's file list is empty. The CLI upload was deleted by the run.
- **The ledger:** 20 credit entries summing to 3,334 cents, 20 reference entries at $0, and the
  judge's paused entry. Spent $54.68 of $100 (2,134 + 3,334), $13.26 of the reserve unspent and
  still held for H8, $32.06 left for everything else. The wall never refused: the last session
  started with $14.68 under the ceiling, against the $2.33 it books.
- **The judge so far** (`judgements.jsonl`, 26 calls, $124.62 notional): 14 singles, 6 pairs, one single now void (below). Every
  delivered harness graphic it has read was airable with no basic visual defect (6 of 12 read);
  Claude Code's community bug and ski timing tower were judged not airable. Pairs: Claude Code 2
  (fun run, film festival), the harness 3 (bilingual notice, ski timing tower, community bug),
  1 tie on an order flip (Spanish flood alert).
- **What the verdict now turns on** (by 4.5 as written, without the 31 calls):
  - Claude Code is already preferred in 10 of 20 pairs: 2 judged, and 8 where only it delivered.
    One more Claude Code win among the 6 unjudged pairs fails line 3.
  - The harness can reach at most 12 usable graphics, so line 1 holds only if Claude Code has at
    most 13: it has 5 judged usable, 2 judged not, and 13 delivered graphics not yet judged, so at
    least 5 of those 13 must fail.
  - Lines 2 and 4 hold on what is read: no basic visible mistake in the six judged harness
    graphics and no missing action in any of its twelve delivered ones, median 527 s, no accepted
    graphic over 194 cents.
- **One answer void (review of PR #1268).** Of the 26 answers, one was given on frames later
  replaced: Claude Code's esports scorebug single (18:22Z), judged before its brief was re-captured
  for the harness arm's map field (Claude Code's own stress did not change, so its frames are the
  same, but no answer on replaced frames counts). It is moved to `judgements.void.jsonl` and asked
  again on resume; no other recorded answer concerns a re-captured brief. `--recapture` now voids a
  brief's earlier answers itself, `--tally` gives no verdict on fewer than the exam's 20 distinct
  briefs, and a lane that stops lets the other finish only its running cell.
- **Traps found:** the bench read "You've reached your Fable limit" as an error, not a pause
  (fixed in `subscription.mjs` with a test; the one refused call is in `judgements.jsonl` as an
  error and is judged again on resume). The guard counts `--judge` as browser work: during a
  build it needs `NOACG_ALLOW_PARALLEL_E2E=1` (it drives no browser). The run directory moved to
  `C:\claude\noacg-bench-archive\harness-exam-2026-10-15` so it outlives `%TEMP%`.

Checks after the run, on this branch: `--control` run directly against `https://noacg.studio`:
CONTROL PASSED at $0 (the wall refused before any session). `node --test
scripts/harness-bench.test.mjs` 49 of 49. Every judgement so far was answered by the frozen judge
(fingerprint `60bfb08e18a4`, the files hashing to `judge.lock.json`).

## Judged to the end (2026-10-17): MISSED

The owner reported the subscription's Fable cap reset on 2026-10-17, three days before the window
the refusal named. The frozen judge resumed on the same model, on the subscription only:

```sh
node scripts/harness-bench.mjs --judge C:\claude\noacg-bench-archive\harness-exam-2026-10-15 --phase H8 --delivered-only --concurrency 2
node scripts/harness-bench.mjs --tally C:\claude\noacg-bench-archive\harness-exam-2026-10-15
```

- **The judge:** the 31 waiting calls answered from 07:03Z to 07:36Z (19 singles, the void
  esports single and the refused volleyball single among them, and 6 pairs in both orders), no
  pause, no error, every answer fingerprint `60bfb08e18a4`, $134.48 notional. The exam's judge in
  all: 57 answered calls, $259.10 notional, $0 credit. `prompt.md` and `rubric.json` hash to
  `judge.lock.json` (the hash `loadJudge` takes, line endings normalised).
- **The readings, before the tally** (`instruments.md` entries 18 and 19): on Claude Code's
  volleyball board, matchup, head-to-head, podiums and bracket the judge's single named no missing
  action and a button does each flagged action, so all five are read as offered in
  `exam/action-readings.json`, as the ruling above says. They can only raise Claude Code's count.
  The unmoved events were each seen to change the picture; they stay counted as functional
  failures, as fixed.
- **The tally: MISSED.** Line 1 fails with the readings (harness 12 usable, Claude Code 15) and
  holds by the gate alone (Claude Code 10). Line 3 fails either way: Claude Code preferred in 13
  of 20 pairs (5 judged, 8 by delivery), harness 6, 1 tie on an order flip. Lines 2 and 4 hold:
  no basic mistake and no missing action in the harness's 12 delivered graphics, median wall
  527 s, no accepted graphic over 194 cents. On the 12 judged pairs the harness won 6, Claude
  Code 5, 1 tie: the miss is the 8 budget stops. The committed `cell.json` files and
  `phase-8/judgements.jsonl` reproduce the same tally through `tallyExam`.
- **The gallery:** ten pairs by the rule above (the flip tie, then Claude Code's wins, judged
  before by delivery, each in brief order), built into `benchmarks/harness/exam/gallery/` and,
  to outlive the worktree, into `C:\claude\noacg-bench-archive\harness-exam-2026-10-15\owner-gallery\`
  (`review.html`, `key.json`, `notes.md`); never committed.
- **Closed:** `--close H8` recorded the phase as completed, which ends the bench's freeze and
  releases the $13.26 of the reserve the exam did not spend: $54.68 spent, $45.32 left. The run
  stops (5.5); H9 does not start. The report, `docs/AI_ATTEMPTS.md` and the spec's phase notes
  say what a retry needs.

Checks after the verdict: `node --test scripts/harness-bench.test.mjs` 49 of 49.

Checks before the first session, on this branch: `NOACG_URL=https://noacg.studio node
scripts/harness-bench.mjs --control`, run directly after building `cli/`: CONTROL PASSED at $0.
`node --test scripts/harness-bench.test.mjs` 48 of 48. `--build H8 --dry --arms
managed-agents,claude-code --model claude-opus-5-5`: the sealed briefs opened and verified, the
`skill:` line naming the lock's bundle from `2128d984d`, the `agent:` line v7 read back from the
server, the reference's subscription `oauth_token`; nothing created, $0.
