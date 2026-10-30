# The harness ladder: usable graphics for about $1

Authority: owner, 2026-10-17 (see `work.json` and section 1). Parent:
`docs/work-specs/noacg-harness/spec.md`, whose bench, judge, ledger and counting rules this plan
reuses. Plan for `/plan-run harness-ladder`: five sequential phases, each built by one fresh
session and checked by another on `main`. Phase notes go under `## Phase notes` here.

## Why

The noacg-harness exam (H8, `benchmarks/harness/exam/REPORT.md`) showed that the harness, Opus 5.5
at effort `high` on Claude Managed Agents, makes graphics as good as Claude Code's: on the 12
briefs both delivered, the judge preferred the harness 6 times, Claude Code 5, with 1 tie, and all
12 were airable with no mistake. It missed because 8 dense boards hit the $1.94 session budget
while still working. Raising the budget fixes delivery but not the product's problem: Opus costs
$0.92 to $1.87 for a simple graphic and an estimated $2.50 to $4 for a dense board, and the
owner's monthly budget allows only a few dollars per student graphic. A built-in Create with AI
that only works while the API credit lasts is temporary.

The open question is how low on model and effort the loop can go and still deliver graphics the
owner would air. H7 gave the first data point: Sonnet 5.5 at `high` delivered 5 of 5 on the tuning
briefs for $0.47 a graphic, but 3 had a basic visible mistake, and its traces show it opened 0 to
6 of its coverage frames and missed defects that were in frames it had. The cheap models' failure
was not looking, which a forced look addresses without paying for a stronger model.

The harness is the Claude Code recipe on another host: the same models, the `noacg` CLI and the
`noacg-graphic` skill. So the search and the teaching run in Claude Code on the subscription,
where they cost no credit and can run as often as they need; the credit, which is small, pays
only to confirm the winner on the real host and for the exam.

## Goal

Find the cheapest model and effort whose graphics are usable at about $1 per usable graphic,
teach it with the skill and CLI until it is, confirm it on Managed Agents, and prove it on a newly
sealed held-out exam. A pass reopens the parent plan's product half (H9 to H11) with that
configuration; a miss reports the cost and quality of each rung tried, which is the answer to
"how low can we go".

## Non-goals

- Re-running the 8 capped H8 boards at a higher budget (owner, 2026-10-17: skip).
- OpenAI, open-weight models or our own loop: the parent spec's section 9 fallback, a plan of its
  own. Everything taught here lives in the CLI and skill, so it carries to any host.
- Matching Claude Code's preference rate. How often the judge prefers Claude Code is reported, not
  a pass line (owner, 2026-10-17).
- Product code outside `cli/` and its skill: the server, the step and the switch stay H9 to H11.
- Changing the exam's judge. The exam is judged by the frozen, calibrated judge of the parent's H2.

## 1. Decisions

### 1.1 Owner decisions (2026-10-17)

1. Cheaper models with a forced look at every frame, instead of more money for Opus.
2. Target: about $1 per usable graphic, capped and failed sessions included.
3. Rungs from cheapest to dearest; the first rung that meets the bar wins.
4. Tuned on tuning briefs only; examined on held-out briefs.
5. Within the credit left: $45.32 (the parent's ledger at $54.68 of $100).
6. The bar is "usable is enough": at least 17 of 20 delivered and usable, at most $1.20 per
   usable graphic; preference against Claude Code is reported only.
7. Search and teach on the subscription, in Claude Code, as much as is useful; spend credit only
   to confirm what the subscription found.

### 1.2 Derived decisions (revertible; each says how)

- **D1. The forced look is a hand-in gate in the CLI.** `noacg coverage` also writes
  `review.json`: every frame it produced, by id, with an empty verdict, and the source digest.
  `noacg record --review <file>` refuses (exit 1, a finding) unless every frame of the current
  digest has a verdict (`ok`, or `fixed: <what>` after a fix and a fresh coverage) and none is left
  open. The skill tells the agent to open each frame before writing its verdict. A gate cannot
  prove the model looked, so the bench also counts, from each trace, the coverage frames the agent
  actually opened (D6's look line). Revert: drop the flag from the skill and the system prompt;
  `record` without `--review` behaves as today.
- **D2. The subscription arm.** `claude -p` with the local CLI build and the skill as a plugin,
  `--model` and `--effort` per rung, no web tools, in the parent's section 5.4 isolation
  (`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, a bare home): the
  parent's reference-arm runner, with the harness's hand-in steps (validate, record, coverage,
  review) on local paths so the loop matches the real host. A session stops at 20 minutes. Its cost is Claude Code's notional `total_cost_usd`, an estimate:
  Claude Code's own prompt and caching differ from Managed Agents', which L3 measures. Revert: run
  a rung on Managed Agents instead, from the credit.
- **D3. One variable per rung: model and effort.** The skill, instructions, tools and forced look
  are the same on every rung of a round; a teaching round changes only the skill or CLI.
- **D4. The ladder set: 8 briefs from the closed H8 exam**, read from the sealed file with the
  passphrase in the main checkout's `docs/private/harness-exam/`, never committed in plain text:
  `boxing-night-matchup`, `collegiate-cs2-scorebug`, `hockey-club-match-board`,
  `volleyball-set-board` (four of the dense boards that capped Opus), and
  `charity-stream-alerts`, `film-fest-nominee-reveal`, `school-quiz-secret-pick`,
  `ski-sprint-timing-tower`. H8 is closed and judged, so these are tuning briefs now; they are as
  dense as an exam, which the parent's tuning briefs were not (the cause of H8's miss), and they
  come with Claude Code and Opus cells already judged. Teaching rounds also use the 16 briefs of
  `benchmarks/harness/tuning/briefs.json` to check that a skill change does not overfit the
  eight. Revert: name other briefs before the first ladder session.
- **D5. Rungs, in order:** Haiku 5.5 `high`; Sonnet 5.5 `medium`; Sonnet 5.5 `high`; Opus 5.5
  `low`; Opus 5.5 `medium`. Each rung's first four briefs are a screen (two dense boards, two
  others): three not usable, or an estimated cost per usable already over $2.00, ends the rung
  there. The ladder stops at the first matching rung.
- **D6. A rung matches** when, on its 8 briefs: at least 7 delivered and usable (the parent's H8
  counting: delivered, airable in the judge's single, no basic visible mistake, no missing
  operator action, with its action-reading rule), an estimated cost of at most $1.00 per usable
  graphic, median wall at most 10 minutes, and the agent opened every frame it gave a verdict for
  in at least 7 sessions. The first matching rung is the winner. Revert: a different rule,
  committed before the rung's first session.
  **Amended 2026-10-17 by the owner, for a taught rung (L2) only; L1's ladder stays as counted:**
  the cost line is an estimated $1.35 or less per usable graphic ("if a taught setup meets the
  quality bar and its subscription estimate is at most $1.35 per usable, confirm it on Managed
  Agents from the $8; the real-host check still needs at most $1.00 per usable"). The other three
  lines are unchanged, and AC-5's line (at most $1.00 per usable, measured on Managed Agents)
  stays the real test. Why: H8 measured Claude Code's notional at about 1.35 times Managed Agents'
  real cost ($2.26 against $1.67 a session). Revert: the cost line back to $1.00 estimated
  (`TAUGHT_RULE` in `lib/ladder.mjs`).
- **D7. Teaching.** Taught is the cheapest rung below the winner (or of all rungs, when none
  matched) with at least 4 of 8 usable, or 2 of its first 4 when the screen ended it: up to five
  rounds, each with its hypothesis (which failure, which skill or CLI change, what
  should move) committed before its first session, each re-measured on the 8 briefs and on the
  16 tuning briefs. A round that moves nothing is reverted. If the taught rung matches, it is the
  winner. Without an L1 winner, if no rung qualifies or five rounds end without a match, the plan
  stops with the curve; with one, L1's winner stands. The parent's AC-16 holds: improvements go into the CLI or the skill, never an
  Anthropic-only prompt.
- **D8. Judging.** The exam is judged by the frozen Fable judge (`judge.lock.json`, fingerprint
  `60bfb08e18a4`): 20 singles and 20 pairs against Claude Code, each pair in one order with the
  arms' positions alternated by brief (40 calls), because pairs are reported, not a pass line. The
  ladder and teaching rounds judge in singles only, by a second judge: L0 calibrates Opus 5.5 on
  the parent's H2 calibration set with H2's bar; if it passes, it is frozen as the ladder judge,
  so Fable's weekly cap is kept for the exam; if it fails, the ladder uses Fable and waits for its
  resets. Every judge call is on the subscription; a capped judge waits, it never moves to the
  credit. Revert: Fable for the ladder too, or both pair orders in the exam (60 calls).
  **Amended 2026-10-17, after L1's check (ladder and teaching only; the exam's Fable judging is
  unchanged):** the frozen Opus ladder judge judges each delivered ladder or teaching graphic as a
  single three times. A graphic is usable when at least 2 of its 3 readings are airable with no
  basic visible mistake, and it has no missing operator action under H8's counting (the gate's
  flags after the readings of the operator surface). A graphic with fewer than three readings is
  not yet judged. Every tally reports each graphic's agreement (3/3 or 2/3) and the judge's
  repeatability (the share of graphics at 3/3). Why: L1's check re-asked two singles and both
  flipped, and D7's choice of the rung to teach sits on the 4-of-8 line. Revert: one reading per
  graphic (`SINGLE_READINGS` in `lib/ladder.mjs` back to one of one), with the first reading of
  each graphic as its single.
- **D9. Money, fixed in L0 before any credit is spent:** the exam reserve $30.00 and the
  confirmation ceiling $8.00 held in the ledger; $7.32 stays unallocated. The exam's session budget
  `B = min(round-up(1.5 m), 130 cents)` from the winner's confirmed mean `m` on Managed Agents,
  overshoot `o` 20 cents, so `R = 20 (B + o)` is at most $30. The 130 cents is a session cap, not
  a test of the winner: whether the winner can meet the target is AC-5's measured cost per usable
  graphic, and only a failed confirmation stops the plan before the exam. Revert: a new
  reservation before the confirmation's first session.
- **D10. The reference arm** for the exam is Claude Code with the published plugin on Opus 5.5 on
  the subscription, as in H8, for the reported comparison.

## 2. The exam

20 new briefs sealed in L0 the way the parent's H0 sealed its exam (its section 4.1: a `claude -p`
child on the subscription with only the permitted inputs; the L0 builder writes no brief), with
ids that appear in no earlier brief file, at least eight types, two typeless, and at least six
boards an operator drives with three or more actions. The harness runs on Managed Agents from the
credit. Pass, fixed now, all of:

1. at least 17 of 20 delivered and usable;
2. at most $1.20 of credit per usable graphic, every exam session's cost counted;
3. median wall at most 10 minutes.

Reported, not pass lines: delivered, usable and defect counts with Wilson 95% intervals, Claude
Code's usable count, pairs (Claude Code, harness), the frames-opened count, cost and wall per
session, and judge single-versus-pair disagreements. The owner gallery holds about ten graphics,
the exam's failures first, arms hidden; the owner's verdict overrides the judge's.

## 3. Spending

Credit only for Managed Agents sessions (L3 and L4); the briefs, the ladder, the teaching, the
reference arm and every judge run on the subscription. The ledger
(`benchmarks/harness/ledger.json`) refuses a session that would pass the phase's ceiling or $100
in total. Every Managed Agents session is deleted after capture and the workspace's file list is
empty at each paid phase's end. Subscription runs are recorded with their notional cost and never
touch the ledger's credit.

### AC-1: The forced look gates every hand-in

`noacg record --review` refuses a review that misses a frame of the current digest, names a stale
digest, or leaves a verdict open, and accepts a complete one (Node tests in `cli/`). The skill and
the harness's system prompt use it, the system prompt stays within the parent's AC-16 limit, and
the bench's `--control` run passes at $0 with the fake arm handing in a reviewed record.

### AC-2: The new exam is sealed before any tuning

The sealed file decrypts to its committed hash, holds 20 briefs meeting section 2's mix, shares no
id with any earlier brief file, and was committed before the first ladder session. A leak scan of
the repository finds none of its stress values.

### AC-3: The money is reserved and the ladder judge settled before any tuning

Before the first ladder session the ledger holds the exam reserve and the confirmation ceiling and
refuses a credit session past either, and the ladder judge's calibration result (Opus 5.5 frozen,
or Fable kept) is committed with its figures. The subscription arm runs one brief end to end with
the forced look at $0 credit.

### AC-4: The ladder and the teaching find the cheapest usable rung, or show there is none

Each rung's and round's hypothesis, briefs and match rule are committed before its first session.
Rungs run cheapest first. Per rung and round the evidence gives delivered, usable, estimated cost
per usable, median wall, frames opened against frames reviewed, and each judge single. The winner,
or "no rung matched" with the per-rung curve, is recorded in the phase notes. No credit is spent.

### AC-5: The winner is confirmed on the real host

On Managed Agents from the credit, the winner (its model, effort and taught skill as a new synced
agent version) runs 4 of the ladder briefs, two of them dense boards: at least 3 usable and a
measured cost of at most $1.00 per usable. The phase notes compare each session's measured cost
with its subscription estimate and set the exam's `B`. A failed confirmation stops the plan with
the measured figures.

### AC-6: The exam ran on the winner and reported against section 2

Every figure in `benchmarks/harness/ladder/REPORT.md` reproduces from the committed evidence with
the bench's tally; the verdict is PASS or MISSED by section 2's lines; the gallery is built and
blind; `docs/AI_ATTEMPTS.md` has the entry; the owner is notified with the gallery path.

### AC-7: A pass reopens the parent's product half, a miss does not

After a PASS, `node scripts/harness-bench.mjs --build H9 --dry` is admitted and names the winning
model and effort; after a MISS, or with no exam, it still refuses.

### AC-8: Spend stays inside the credit left

The plan's credit total is at most $45.32 and the ledger never passes $100; no judge, reference,
ladder or teaching cost is on the credit.

## Phases

1. **L0. The forced look, the sealed exam, the reservation and the ladder judge** (AC-1, AC-2,
   AC-3; $0). Files: `cli/src/commands/coverage.ts`, `cli/src/commands/record.ts` and tests,
   `cli/skill/noacg-graphic`, `agents/noacg-harness/agent.md`, `scripts/harness-bench.mjs` and
   tests (the subscription arm, phases L1 to L4, the frames-opened count, the reservation), the
   sealed exam beside the parent's, the ladder judge's lock, `benchmarks/harness/ladder/` evidence.
2. **L1. The ladder** (AC-4, AC-8; $0 credit). Rungs per D5 on the subscription, stopping at the
   first match per D6.
3. **L2. Teaching** (AC-4, AC-8; $0 credit). Rounds per D7. If L1 found no winner and no rung is
   taught to a match, the plan stops after this phase's check, with the curve as its report. If
   L1's winner is the cheapest rung, or no cheaper rung qualifies, this phase's build only records
   "not needed" in the phase notes, and its check confirms that nothing ran.
4. **L3. Confirmation on Managed Agents** (AC-5, AC-8; at most $8.00). The winner as a synced
   agent version on the bench workspace, 4 ladder briefs, the exam's `B` set.
5. **L4. The exam** (AC-6, AC-7, AC-8; at most $30.00): run, judge, tally, report, gallery,
   `docs/AI_ATTEMPTS.md`, close with its verdict, notify the owner. A miss stops the plan; the
   report lands either way, naming its cause and whether a retry has a cause outside the model
   (the parent's section 9).

## Execution settings

Local plan run: the sealed briefs' passphrase, the subscription `claude -p` for briefs, the
ladder, the teaching, the reference arm and the judges, and Chrome for the gallery are on the
owner's machine. A subscription usage cap can pause a phase; the run then waits for the reset.
The owner starts it with `/plan-run harness-ladder until <time>`.

## Phase notes

Each phase's pull request adds its notes here, newest first: the last check's findings, what the
next phase must allow for, decisions, traps, spend, shas and the revert.

### L2. Teaching (built 2026-10-29: no match)

- **Check's findings (L1's second check, PASS on `905fabec1`):** three Opus readings a graphic
  (usable at 2 of 3), repeatability 19 of 21 at 3/3; no rung matched D6; D7 as written teaches
  Sonnet 5.5 `high` (2 of its first 4 usable, $3.75 per usable notional; Opus `low` was cheaper per
  session, $1.65 against $1.88, but D7 ranks by D5's order). Sonnet `medium` is 3 of 8 under 2 of
  3 and does not qualify. L1's failure patterns: empty defaults, so on-air frames show nothing;
  actions that pass the gate but change nothing on screen; design defects missed after opening
  every frame (a faint crest, an ogonek collision); rubber stamps (a script sets every verdict `ok`
  after opening 3 of 57 or 8 of 40 frames); NOT READY at the review. Whether a verdict is honest
  is the judge's call, not the review's: an `ok` proves only that a verdict was written. Minor: the
  ledger's L1 close note still said Sonnet `medium` 4 of 8 at $2.74; a correcting entry now follows
  it (the note itself stays, the ledger being append-only).
- **Outcome: no match.** Four rounds ran (1, 3 and 4 kept, 2 reverted); none met D6 on the eight.
  The best round, round 4, has 5 of 8 usable at $2.15 a usable and $1.35 a session; the look line
  never passed 6 of 8 and was 4 of 8 in the last three rounds. The cost per session on the eight
  fell from $2.04 to $1.35, and the cost per usable from $8.15 to $2.15. Every figure, hypothesis
  and decision is in `benchmarks/harness/ladder/evidence/phase-L2.md`; every tally reproduces with
  `--tally benchmarks/harness/ladder/L2/<round>` (and `--order tuning`). The curve, Sonnet 5.5
  `high`, three Opus readings a graphic, notional cost on the subscription:

  | round | change | the eight: usable, per session, per usable, median wall, all frames opened | 15 tuning briefs: usable, per session, per usable | decision |
  |---|---|---|---|---|
  | baseline | the skill and CLI as L1 ran them | 2, $2.04, $8.15, 527 s, 6 | 8, $1.25, $2.35 | - |
  | 1 | an action that draws nothing is a coverage finding | 4, $2.04, $4.08, 600.5 s, 5 | 8, $1.40, $2.62 | kept |
  | 2 | each timeline one picture (strips) | 5, $1.26, $2.02, 463 s, 4 | 5, $0.98, $2.94 | reverted (tuning fell by 3) |
  | 3 | strips again, with carried verdicts | 4, $1.45, $2.90, 511 s, 4 | 7, $0.91, $1.95 | kept (refuted: no verdict was ever carried) |
  | 4 | a look at the same picture counts; logos without tiles | 5, $1.35, $2.15, 565 s, 4 | 10, $0.93, $1.40 | kept (refuted on the look line; the logo change held on two of four) |

  D6 on the eight needs 7 usable, at most $1.35 a usable, a median wall of 10 minutes and every
  frame opened in 7 sessions. No round came near the usable line or the look line; the strips
  brought the cost per session to $1.26 to $1.45, so 7 usable at that cost would have met the
  cost line. Only the tuning briefs came close on cost ($1.40 a usable in round 4), and they have
  no match line of their own.
- **What the next phase must allow for:**
  - D7: five rounds were allowed; four ran, the usage limit cutting the window twice, and round 4
    was finished on 2026-10-29 with no round 5. Without an L1 winner and without a match, the plan
    stops with this curve (D7, phase 3); L3 and L4 do not run unless the owner decides otherwise.
    The check confirms that. L2 is closed in the ledger (`--close L2`).
  - A round 5 would take the design failures the judge names on the eight in every round: logos
    that air as empty placeholders or as text at the brief's own values (the collegiate scorebug,
    the matchup), text that moves or shrinks with long values (the timing tower, the live vote),
    and the youth summit bug's doubled "DAY" (#1435). The look line will not move by counting:
    agents set every verdict at the end with a script; a gate that cannot see reads cannot force
    them.
  - The noise between two measurements of the same configuration (rounds 2 and 3) is 1 usable on
    the eight and 2 on the tuning briefs; a round's change smaller than that cannot be read. Round
    4's gain on the eight (4 to 5) is within it; its gain on the tuning briefs (7 to 10) is not.
- **Decisions** (each revertible):
  - DECIDED: the baseline on the eight reuses L1's four Sonnet `high` screen cells and their three
    readings, since `cli/skill` and `cli/src` had not changed since; only the other four ran.
    Revert: run the four again under the stage.
  - DECIDED: the tuning set is the bank's 15 library briefs; the bench refuses the OGraf one.
  - DECIDED: round 1 is the action that draws nothing, not the cost. Revert: run strips as round 1.
  - DECIDED: a press counts as drawn when any moment from 20 ms to 10 s differs by about 40 pixels
    or more. Revert: `NO_CHANGE_SHARE` in `cli/src/commands/coverage.ts`.
  - DECIDED: strips are coverage's default, `--frames` keeps a frame per moment and the bench's
    capture passes it (the session's hand-in line spells the command out without flags, so a flag
    only the skill names reaches some agents and not others). Revert: `strips` back to
    `flagBool(args, 'strips', false)` and the capture without `--frames`.
  - DECIDED: rounds 3 and 4 each changed two things, said in their hypotheses, because the window
    had room for one more round each time. Revert: none needed; the evidence names each change's
    own failure.
  - DECIDED: `--lanes` takes up to 3; the rounds ran at 2 because free memory never reached 3 GB at
    a start, and round 4's last three sessions at 1 (about 1.2 GB free).
  - DECIDED: round 4's `summary.json` is rebuilt over all 23 cells, since each `--build` writes
    only its own cells (the last one, the volleyball rerun, held one). Revert: none needed; the
    tallies read the cells, not the summary.
  - OWNER, 2026-10-17: D6's cost line for a taught rung is $1.35 estimated (D6 above); AC-5's
    real-host line stays $1.00.
- **Traps:**
  - The usage limit cut a session without printing a result (round 4's volleyball board): the
    bench recorded it `failed` and would not rerun it under the stage; it reran as
    `round-4-rerun` (#1469). A session the bench must run again after a discarded start needs
    another stage name too: the ledger is append-only (round 2's `round-2-rerun`).
  - The youth summit event bug's positional stress keys put the logo's description into a text
    field when the agent splits day and room; it fails every round for it (#1435).
  - Pass `--phase L2` to `--judge` and `--tally` while a run is going (no `summary.json` yet); the
    bench refuses to judge a run whose phase it cannot tell rather than guess the exam's judge.
  - CI checks out a shallow history, so a test that reads git history (the seal's commit time)
    must accept the recorded time when the oldest commit has no parent (`sealCommittedAt`).
  - The browser-work guard counts a running bench, so judging beside a session needs
    `NOACG_ALLOW_PARALLEL_E2E=1`; the judge drives no browser.
- **Spend:** $0 credit; the ledger at 5,468 cents spent with $30.00 held for L4 and $8.00 for L3.
  Subscription, notional: $580.23 (117 ledger sessions $143.28, discarded, paused and failed
  starts included; 324 ladder-judge readings $431.63; the one stray Fable reading $5.32).
  **Shas:** built on `905fabec1`; D6's amendment `ba0a39a0d`; round 1 `05ca783bb` and
  `8d4fa88a0`; round 2 `62753ce6a`, `7dc3d70e9`, `3634414a6`, `d6fa22b8a`; round 3 `7925a6884`
  and `f59965f8f`; round 4 `d4993df07` (its hypothesis), `d2f11b46d` and `759061291`.
  **Revert:** each round's commits revert on their own; the plan's L3 and L4 do not start.

### L1's second check (PASS on `905fabec1`, 2026-10-17)

- **Verdict: PASS.** AC-4's ladder half and AC-8 hold on three readings; L2 may build, teaching
  Sonnet 5.5 `high`.
- **What was re-derived:**
  - The amendment's branch was created at `850cdcff9` at 15:16:29Z (GitHub's activity log). The
    earliest of the 42 new readings started at 15:21:07Z (its answer time minus its duration) and
    answered at 15:22:38Z.
  - The 21 delivered L1 graphics have three readings each, all 63 under lock `9fa9d7e3ac9b`.
  - `--tally` on scratch copies of the five rung folders rewrote all five `tally.json` files
    identically.
  - By hand under the 2-of-3 rule: Sonnet `medium` is 3 of 8 (the alerts, the nominee reveal and
    the ski tower), $10.96 / 3 = $3.65. Its screen passes (2 not usable, $2.73 / 2 = $1.36). The
    hockey board and the quiz split 2/3, both not usable. Sonnet `high` is 2 of 4 (the alerts and
    the nominee reveal, both 3/3), $7.50 / 2 = $3.75, so the screen ends it on cost.
  - D6: no rung matches. D7 as written: Haiku has 1 of its first 4. The screen did not end Sonnet
    `medium`, so it needs 4 of 8 and has 3. Sonnet `high`, ended by the screen, has 2 of its first
    4 and so qualifies. It is the next rung in D5's order, and owner decision 3 says that order
    runs from cheapest to dearest. Opus `low` cost less per session ($1.65 against $1.88), but D7
    does not rank rungs by measured cost.
  - The two readings this check was allowed went to Sonnet `high`'s alerts. If that graphic
    flipped, Sonnet `high` would stop qualifying. Both readings passed with no mistake, so it now
    passes 5 of 5 ($3.88 notional, in scratch, not committed).
  - The tests: `scripts/harness-ladder.test.mjs` passes 17 of 17. With `usableMin: 1` the new test
    fails: the 1-of-3 graphic counts as usable. The edited assertions only repeat each fixture
    reading three times; every expected value is unchanged.
  - The revert path works: with `SINGLE_READINGS` set to `{ count: 1, usableMin: 1 }`, `--tally`
    gives the pre-repair figures again (Sonnet `medium` 4 of 8, $2.74).
  - The ledger: 5,468 cents spent, L4 $30.00 and L3 $8.00 held, 0 credit cents on any L entry. It
    is unchanged since L1's build.
  - Privacy: the repair adds no brief, prompt or stress file. In its added lines, no prompt opening
    and no prompt sentence of 40 characters or more appears. Eight stress values of 8 to 24
    characters do appear, as short names and labels quoted in the judge's reasons, the kind L1's
    decision allows.
- **What L2 must baseline first:** Sonnet `high` ran only the screen's four. Before the first
  round's change, run it unchanged on the other four ladder briefs (the hockey board, the
  volleyball board, the quiz and the ski tower) and on the 16 tuning briefs, each delivered graphic
  judged three times. The skill and CLI are unchanged since L1's base (`3f6cd2687`), so this
  baseline matches L1's conditions. `tallyRung` still needs `order` set to the tuning ids for the
  16 briefs. At L1's rates the baseline costs about $38 notional for its 20 sessions and up to $95
  for the readings, all on the subscription.
- **Minor, not blocking:** the ledger's L1 close note still says Sonnet `medium` 4 of 8 at $2.74.
  The ledger is append-only, so L2 can add a note that points at the re-tally.
- **Spend:** $0 credit. Subscription: two judge readings, $3.88 notional.

### L1 repair: the judge's repeatability (built 2026-10-17)

- **Check's findings (L1's check, FAIL on `bd60100a3`):** the frozen Opus ladder judge did not
  reproduce either of two re-asked Sonnet `medium` singles: `school-quiz-secret-pick` went airable
  to not airable (three empty-or-broken mistakes: after Select nothing changes, after Lock then
  Reveal choice all four tiles stay faded; the capture never runs Select before Reveal choice, a
  borderline action reading); `hockey-club-match-board` went not airable (crest contrast) to
  airable (the white crest on its near-white disc is faint, borderline). Net still 4 of 8, but D7's
  choice of the rung to teach sits on the 4-of-8 line and L2 measures what moved by single
  answers. Everything else held (pre-registration, screen, match and D7 application, tallies,
  traces, ledger, seal-order repair, no private content).
- **Status: AC-4's ladder half and AC-8 hold, on three readings.** D8 amended (ladder and teaching
  only) and pushed as `850cdcff9` at 15:16:29Z, before the first new answer at 15:21:47Z. Every
  one of the 21 delivered L1 graphics now has three readings by the same lock (`9fa9d7e3ac9b`); the
  check's two re-asks were not recorded under the lock in the run's files, so 42 fresh ones were
  asked. Every rung's `tally.json` reproduces with `--tally` from the committed files
  (`benchmarks/harness/ladder/evidence/phase-L1.md`, "The judge's repeatability").

  | rung | verdict | usable | notional per usable | judge agreement (3/3 of judged) | qualifies for L2 (D7) |
  |---|---|---|---|---|---|
  | Haiku 5.5 `high` | screened out: not usable | 1 of 4 | $2.13 | 3 of 3 | no |
  | Sonnet 5.5 `medium` | no match | **3 of 8** (was 4) | **$3.65** (was $2.74) | 6 of 8 | **no** (was yes) |
  | Sonnet 5.5 `high` | screened out: cost | 2 of 4 | $3.75 | 4 of 4 | **yes, taught** |
  | Opus 5.5 `low` | screened out: cost | 2 of 4 | $3.30 | 3 of 3 | yes |
  | Opus 5.5 `medium` | screened out: cost | 2 of 4 | $5.49 | 3 of 3 | yes |

  **Repeatability: 19 of 21 graphics (90%) at 3/3.** The two at 2/3 are the two the check re-asked;
  the quiz is now not usable (pass, not airable, not airable), the hockey board stays not usable.
  No winner, as before. **L2's rung changed: Sonnet 5.5 `high`, not `medium`.**
- **What L2 must allow for:**
  - **Taught is Sonnet 5.5 `high`** (2 of its first 4, the next rung in D5's order). By measured
    notional Opus `low` was cheaper ($1.65 a session against $1.88; $3.30 per usable against
    $3.75), but D7 reads D5's order. The L1 notes' failure analysis (empty sample state, actions
    that change nothing, design calls the look does not make, rubber stamps) still holds; Sonnet
    `high` opened every frame it reviewed, so its failures are the design calls, not the look.
    Sonnet `high` ran only the screen's four: L2's first round needs its baseline on the other
    four ladder briefs and on the 16 tuning briefs before its change.
  - `--judge` on an L1 or L2 run now asks each delivered graphic until it has three readings (a
    re-run asks only what is missing); `--tally` counts a graphic with fewer as not judged. A
    reading costs about $1.60 notional, so judging a round costs three times what L1's did.
  - 90% is above the 75% line, so the counts can steer L2, with one limit: a round's gain that
    rests on a graphic at 2/3 is not a gain to claim. Proposed for the owner, not decided:
    a capture that runs the operator's actions in the brief's order (both splits were about what
    the frames do not show); a rubric line making "an action that shows no change" a basic
    mistake (it changes the frozen judge, so it needs H2's calibration again); two more readings
    only when the first three split.
- **Decisions** (each revertible):
  - DECIDED: the readings are the first three a graphic has under the lock, in file order; a fourth
    is not counted. Each reading has its own folder (`judge/single/<cell>.reading-<n>`). Revert:
    `SINGLE_READINGS` to `{ count: 1, usableMin: 1 }`.
  - DECIDED: the graphic's mistakes, confidence and rubber-stamp count come from a reading of its
    majority, and the gate's flags are read against what any reading named.
  - DECIDED: D7's "cheapest" is D5's order, as written, not the measured notional.
- **Traps:** the judge records the same cell id for every reading; only the `reading` field and
  the order tell them apart. A Windows checkout writes the committed `judgements.jsonl` with CRLF
  and the archive's has LF: compare the readings, not the bytes.
- **Spend:** $0 credit; the ledger still at 5,468 cents spent with $30.00 held for L4 and $8.00 for
  L3. Subscription, notional: $67.21 (42 readings). **Shas:** built on `9259a2051`; the amendment
  `850cdcff9`. **Revert:** `git revert -m 1` the merge; that drops the three-reading rule, the 42
  readings and the re-tallies, and L2's rung goes back to Sonnet `medium`.

### L1. The ladder (built 2026-10-17)

- **Check's findings (L0's check, PASS on `3f6cd2687`):** the `record --review` gate refuses
  incomplete, open, stale and untouched reviews and accepts a complete one; `--control` passed at
  $0; the sealed exam `0a81eda9a14b` with 20 briefs, its seal pushed before any session; holds L3
  $8 and L4 $30, credit 5,468 cents; the Opus 5.5 ladder judge re-derived 38/41, 16/16 pairs, 0
  flips, its lock pushed before its first answer; the subscription arm on Haiku `high`
  (`futsal-cup-winner-card`) delivered in 427 s at $0.52 notional with 52/52 reviewed frames
  opened. Carried: that Haiku set all 52 verdicts to `ok` in one script; the gate cannot tell a
  look from a rubber stamp (D1), so a rung whose verdicts say `ok` on frames the judge fails is a
  finding, counted per rung below.
- **Status: AC-4's ladder half and AC-8 hold for L1. No rung matched.**
  (`benchmarks/harness/ladder/evidence/phase-L1.md`, the cells and singles in
  `benchmarks/harness/ladder/L1/<rung>/`). Every rung's hypothesis, briefs and the match rule were
  pushed before its first session (`10d92bd46` 12:37:52Z before rung 1 at 12:38Z; `723a3a799`
  12:58:11Z before rung 2; `e7a5f4d80` 13:29:36Z before rung 3; `9f791d3a9` 13:51:36Z before
  rung 4; `98182bd5a` 14:06:40Z before rung 5).

  | rung | verdict | delivered | usable | notional per usable | median wall | opened / reviewed (every one) | all ok, judge failed |
  |---|---|---|---|---|---|---|---|
  | Haiku 5.5 `high` | screened out: not usable | 3 of 4 | 1 | $2.13 | 502.5 s | 119/161 (1) | 2 |
  | Sonnet 5.5 `medium` | ran all eight, no match | 8 of 8 | 4 | $2.74 | 318 s | 363/507 (4) | 4 |
  | Sonnet 5.5 `high` | screened out: cost | 4 of 4 | 2 | $3.75 | 457 s | 242/242 (4) | 2 |
  | Opus 5.5 `low` | screened out: cost | 3 of 4 | 2 | $3.30 | 245 s | 81/230 (1) | 1 |
  | Opus 5.5 `medium` | screened out: cost | 3 of 4 | 2 | $5.49 | 336.5 s | 173/173 (3) | 1 |

  Each single is in the evidence file's per-rung tables. The nominee reveal was usable on every
  rung and the alerts on all but Haiku; the matchup and the scorebug on none. The hypotheses held
  for rungs 1, 2, 3 and 5; rung 4 (Opus `low`) was predicted to pass the screen and ended on cost.
  L1 is closed in the ledger (`--close L1`).

- **What L2 must allow for:**
  - (Superseded by the L1 repair above: on three readings Sonnet `medium` has 3 of 8 and L2
    teaches Sonnet `high`.)
    **Taught is Sonnet 5.5 `medium`**, the cheapest rung that qualifies under D7 (4 of 8 usable).
    Haiku `high` does not qualify (1 of its first 4). Sonnet `high` and Opus `low` qualify on 2 of
    their first 4 but are dearer, and so does Opus `medium`. With no winner, D7 stops the plan
    after L2 if five rounds do not make Sonnet `medium` match.
  - **What the judge failed**, for the teaching rounds' hypotheses:
    - *Empty sample state.* On the matchup three rungs handed in a graphic whose own defaults are
      empty, so the on-air frames show no boxer at all (H8's Claude Code cell failed the same way);
      the scorebug's empty logo slots read as broken. The skill never says the graphic's defaults
      are what airs first and what the judge sees as "the brief's own values".
    - *Actions that change nothing on screen.* `select` and `lock` on the matchup passed the
      bench's action gate (it reads the operator surface, not pixels) and the agents' own `ok`,
      and showed nothing.
    - *Design calls the look does not make.* Sonnet opened every frame of the hockey board (81 of
      81) and of the volleyball board (69 of 69) and passed a near-invisible crest and a wrapped
      Polish name whose ogonek runs into the next line. Looking is not judging: a forced look
      without a question to ask of each frame becomes a stamp.
    - *Rubber stamps:* 10 delivered graphics the judge failed had every verdict `ok` (Haiku 2,
      Sonnet `medium` 4, Sonnet `high` 2, Opus `low` 1, Opus `medium` 1). The reverse also
      happened three times: Haiku and Opus `low` on the scorebug and Opus `medium` on the matchup
      said NOT READY, the last two because they had not opened every frame, and stopped rather
      than finish the look (Opus `medium` after 6 minutes and $2.28). The hand-in reference does
      not say that an unfinished review is to be finished, not reported.
  - **The cost is the hard line.** A usable simple graphic cost $0.39 to $2.92 notional; the
    boards Sonnet `medium` made usable cost $1.83 and $1.84 each; a dense board that cost under
    $0.50 was one the agent barely opened (3 and 13 frames). To match, Sonnet `medium` needs 7 of 8
    usable for at most $7.00 in all, against $10.96 for its 4. A round that only adds looking
    will raise the cost; one that wins must also cut work (fewer frames to open, fewer re-covers,
    a stronger first draft).
  - The bench now gives a rung's whole tally: `--tally <rung dir>` (D5's screen, D6's lines, the
    stamps, and gate flags the judge did not name), and `--lanes 2` runs two sessions at once. A
    round is `--build L2 ... --stage <round>`, its own `--out`; L1 is closed, so L2 may build.
    `--tally` counts the ladder eight in `RUNG_ORDER`; a round's run on the 16 tuning briefs needs
    `tallyRung`'s `order` set to those ids (the CLI does not do that yet).
    The 16 tuning briefs D7 re-measures on have no committed Sonnet `medium` baseline yet: L2's
    first round needs one before its change, or it cannot show what moved there.
- **Decisions** (each revertible):
  - DECIDED: every rung runs the eight in one order (`RUNG_ORDER`), the screen first: the matchup,
    the scorebug, the alerts, the nominee reveal. Revert: another order, before a rung's first
    session only.
  - DECIDED: the screen's cost line is read once its four are judged; the not-usable line as soon
    as three are known. A rung that passed the screen ran all eight even when it could no longer
    match (Sonnet `medium`), since D7's teaching rule counts usable of all eight. Revert:
    `tallyRung` in `lib/ladder.mjs`.
  - DECIDED: a gate flag the judge did not name is read against the operator surface only when it
    could change "usable"; on a graphic the single already fails, it is listed, not read.
  - DECIDED: the judge saw only delivered graphics (`--delivered-only`), as H8 judged.
  - DECIDED: each rung's `cell.json` and the judge's answers are committed, as H8 committed its
    cells; no brief, prompt or stress file is. The judge's reasons quote a few short values (a
    name, a label) the way H8's committed answers do; a scan of the L1 evidence for every ladder
    brief's prompt opening and stress value of eight characters or more finds no prompt and only
    such fragments. Revert: drop the `judgements.jsonl` files and keep the tallies.
- **Traps:**
  - The one-bench-per-machine guard blocks `--judge` while a rung runs; the judge drives no
    browser, so `NOACG_ALLOW_PARALLEL_E2E=1` lets it judge finished cells during the run.
  - The judge records a single under the cell's id (`<brief>.<model>-<effort>`), not
    `<brief>.subscription`; the rung tally finds it by brief.
- **Spend:** $0 credit; the ledger still at 5,468 cents spent with $30.00 held for L4 and $8.00
  for L3. Subscription, notional: $71.72 (24 sessions $38.16; the ladder judge's 21 singles
  $33.56).
  **Shas:** built on `3f6cd2687`. **Revert:** `git revert -m 1` the merge; that drops the rung
  tally, `--lanes`, the L1 evidence and the ledger's L1 entries (all notional, no credit).

### L0. The forced look, the sealed exam, the reservation and the ladder judge (built 2026-10-17)

- **Check's findings:** none; this is the plan's first phase. Context: the parent's H8 exam closed
  MISSED (PR #1365, `benchmarks/harness/exam/REPORT.md`), so the parent's bench refuses H9 and later.
- **Status: AC-1, AC-2 and AC-3 hold** (`benchmarks/harness/ladder/evidence/phase-L0.md`).
  - AC-1: `noacg coverage` writes `review.json`; `noacg record --review` refuses a review that
    misses a frame, is stale or leaves a verdict open, and accepts a complete one (cli tests, 297
    pass); `references/hand-in.md` in the skill and the system prompt (15 lines) hand in that way;
    `--control` CONTROL PASSED at $0 with the fake arm's records reviewed and every frame opened.
  - AC-2: 20 briefs by a `claude -p` child (session `3fcd81b3`) from the permitted inputs only,
    sealed in `benchmarks/harness/ladder/exam/` under a new passphrase in the main checkout's
    `docs/private/harness-ladder-exam/`; 18 registered types and 2 typeless, 12 boards with three or
    more actions; no id of any of 9 earlier brief files; committed first (`6c8a1954a`); leak scan
    clean of prompts, judge lines and values of four words or more.
  - AC-3: the ledger holds $30.00 for L4 and $8.00 for L3 and the wall refuses past either;
    Opus 5.5 passed H2's bar on the held-back part (agreement 38 of 41, no basic FAIL aired, pairs
    16 of 16, no flip) and is frozen as the ladder judge; the subscription arm delivered one tuning
    brief on Haiku 5.5 `high` end to end with all 23 reviewed frames opened, $0 credit.
- **What L1 must allow for:**
  - Run a rung: `node scripts/harness-bench.mjs --build L1 --arms subscription --model <exact id>
    --effort <level> --briefs <ids> --stage <rung>`. The ladder eight are `LADDER_SET` in
    `benchmarks/harness/lib/ladder.mjs`, the four dense boards first (D5's screen takes two of
    them and two others). They open in memory from H8's sealed file with its passphrase; the
    bench prints only ids and types. Commit each rung's hypothesis, briefs and match rule before
    its first session (AC-4); the bench does not check that order, the checker does.
  - Judge: `--judge <runDir> --phase L1` uses the Opus ladder judge (`ladder/judge.lock.json`),
    singles only, on the subscription. A usage-limit pause waits; nothing moves to the credit.
  - D6's look line is in every `cell.json` as `look` (reviewed, opened, unopened), counting only
    reads after the session's last coverage that did not fail; a ladder hand-in without a review
    is counted `not-ready`, so "delivered" already means reviewed. The match rule still has to
    count usable from the judge's singles, as H8 counted.
  - `--effort` is required with the subscription arm, and `--judge` takes the run's phase from its
    `summary.json` when `--phase` is not given. The 20-minute stop ends the session's whole process
    tree on Windows (`taskkill /T`), not only `claude`.
  - The cost per usable graphic is `notionalUsd` (Claude Code's own `total_cost_usd`; for a
    session stopped at 20 minutes, its transcript's usage at list prices, marked
    `notionalFrom: transcript`). It is an estimate (D2); L3 measures the real one.
  - Sessions read the skill from the worktree's `cli/plugin` (regenerated by `npm run build` in
    `cli/`): build the CLI in L1's own worktree first, or the bench refuses (`ensureCli`).
  - Haiku 5.5 took `--effort high` and answered as `claude-haiku-5-5` only. On a 5-minute lower
    third it made 76 turns, read the hand-in reference and opened every frame: the dense boards
    are the real test of the look, and of the 20-minute stop.
  - L1 starts only with L0 closed in the ledger (it is), and L2, L3 and L4 only in order.
- **For L3 and L4:** `agents/noacg-harness/agent.md` changed (the reviewed hand-in), so the
  bench's lock no longer matches it; L3 sets the winner's model and effort there and syncs a new
  agent version before its first session. L3's sessions are walled at the $8.00 hold and L4's at
  $30.00 whatever `--ceiling-cents` says; L3 may lower L4's hold to `R = 20 (B + o)` with `--hold
  L4 --kind exam --cents <R> --by L3`. The ladder exam opens only in L4 (`ladderBriefs`); L4
  still has to build its exam path (40 judge calls, section 2's tally, `--close L4 --verdict`) and
  AC-7's link from H9 to the ladder's verdict.
- **Decisions** (each revertible as said):
  - DECIDED: every hand-in is reviewed; the H plan's interim record after each clean validate is
    gone from the system prompt, since an unreviewed record is what D1 forbids. Revert: put the
    line back in `agent.md`; `record` without `--review` still works.
  - DECIDED: a verdict is `ok` or `fixed: <what>`; anything else is open. A new coverage writes a
    new review with every verdict empty, and crops are not listed (D1 names frames). Revert:
    `cli/src/review.ts`.
  - DECIDED: a frame counts as opened when the trace reads a file of its name (Managed Agents
    `read` steps that succeeded; Claude Code `Read` calls in the transcript). A shell command that
    touches the file is not a look. Revert: `framesOpened` in `lib/trace.mjs`.
  - DECIDED: the holds are a new `holds` list in the ledger, not the parent's `reserve`, which is
    H8's and closed; rewriting it would rewrite that plan's record. Revert: drop `holds`.
  - DECIDED: the ladder's phases run strictly in order and L0 to L2 refuse every arm but
    `subscription`. Revert: `LADDER_ARMS` and `refuseLadderBuild` in `lib/ladder.mjs`.
  - DECIDED: the brief writer was H0's runner and prompt builder with section 2's mix in the
    instructions and H0's stress minimums; two follow-ups in the same session (a taken id and a
    stray stress key; then a public text two briefs quoted word for word). Revert: a new child and
    a new seal, before L1's first session only.
  - DECIDED: the arm proof ran on the cheapest rung (Haiku 5.5 `high`) and a tuning brief outside
    the ladder eight. Revert: nothing to revert; it is evidence only.
- **Traps:**
  - A worktree-isolated session cannot write into the main checkout with Write or Edit: the
    private folder was written with `cp` from a scratch folder.
  - The commit-message hook blocks "Claude" in a message; a commit that is about the AI bench
    itself needs `ALLOW_AI_MENTION=1`.
  - The leak scan found a 212-character public text in a committed H8 cell that a new brief
    quoted; scan before sealing, not after.
  - `claude -p` children get their transcript under the child's `CLAUDE_CONFIG_DIR`; the arm
    reads it there, so do not add `--no-session-persistence` to the subscription arm.
- **Follow-up:** #1388, a CLI release so the published plugin's pinned CLI carries `--review`
  (the plugin already ships `hand-in.md`; only a host asking for a record reaches it).
- **Spend:** $0 credit; the ledger at 5,468 cents with $38.00 held and $7.32 unallocated.
  Subscription, notional: $9.81 (brief writer $1.30, judge calibration $7.91, arm proof $0.60).
  **Shas:** built on `6d66070e1`; the seal `6c8a1954a`, the judge lock `d0d29f5dd`; the merge sha
  is the one the queue records. **Revert:** `git revert -m 1` the merge; that drops the holds, the
  L0 entries and the seal from the repository (the private folder can stay; it is gitignored), and
  the ladder judge with them.
