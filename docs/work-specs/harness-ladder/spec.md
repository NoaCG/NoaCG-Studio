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
- **D9. Money, fixed in L0 before any credit is spent:** the exam reserve $30.00 and the
  confirmation ceiling $8.00 held in the ledger; $7.32 stays unallocated. The exam's session budget
  `B = round-up(1.5 m)` from the winner's confirmed mean `m` on Managed Agents, at most 130 cents,
  overshoot `o` 20 cents, `R = 20 (B + o)` at most $30. A winner whose `B` would exceed 130 cents
  cannot meet the target, and the plan stops before the exam. Revert: a new reservation before the
  confirmation's first session.
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
