# H4 evidence: the exam reservation

Phase 5 of `docs/work-specs/noacg-harness/spec.md` (AC-5, sections 5.2, 5.3, 5.5), built
2026-10-15 on `origin/main` `55369d924`. $0: no session created, no credit spent, no `claude -p`
call. Everything below is computed from H3's ledger entries and the raw events of H3's two Opus
sessions (`%TEMP%\noacg-harness\H3-2026-10-14T23-05-03` and `H3-2026-10-14T23-09-31` on this
machine; the committed `evidence/phase-3/*/trace.json` keep only each session's largest request).

## Outcome

**The exam fits, and the run continues to H5.** Three $15 rounds fit beside the reserve (two
are required), and the measured time is under the pass rule. No `needs: decision`.

| | value | from |
|---|---|---|
| `m`, one real graphic on Opus 5.5 | $1.49 (**one sample**) | ledger, H3 `graphic`, `sesn_01YNuBgof1beHZkofTWJLb1G` |
| `B = round-up(1.5 m)` | round-up($2.235) = **$2.24** (224 cents) | 5.2 |
| `o`, one model request at the session's largest context | **$0.22** (22 cents), decided below | the largest of H3's 52 Opus requests |
| critic's share | $0 now; set in H6 if the critic stays | 3.4 |
| `R = 20 (B + o)` | 20 x ($2.24 + $0.22) = **$49.20** | 5.2 |
| ledger spent | $2.66 | ledger, H3's six sessions |
| `T = 100 - spent - R` | $100.00 - $2.66 - $49.20 = **$48.14** | 5.2 |
| rounds at $15 | floor($48.14 / $15) = **3** ($3.14 left over) | 5.2 fit rule |
| rounds at $9 | floor($48.14 / $9) = 5 | not needed: at least two fit at $15 |
| time | 471 s + 32 s = **503 s**, under 600 s | 4.5, below |

## The evidence for `o`

All 52 model requests of the two Opus sessions, priced at `lib/trace.mjs`'s list rates. The token
sums, $1.4853 and $1.0816, plus each session's running time at $0.08 an hour come to $1.4943 and
$1.0852, the figures H3's check gave, and reproduce the sessions' `usage.list_cost` of 149 and 109
cents:

- **The largest request cost $0.2162** (the defect session's third: 41,856 tokens written to the
  cache in one request, the planted package's printed sources, a 79k-character script with its
  HTML and CSS; `phase-3.md` calls these "new frames", which they were not). The real graphic's
  largest was $0.1402 (6,364 output tokens at a 54k context). Only that one of the 52 cost more
  than $0.15; the real graphic's 36 averaged $0.041.
- **A request at the largest context cost $0.04 to $0.11**: $0.1095 at 149,012 tokens (the defect
  session's last), $0.0425 at 116,485 (the graphic's last). With the cache warm, 150k tokens of
  context are $0.03 of cache reads; what makes a request large is what it writes and outputs.
- **No cache lapse in 50 follow-on requests**: each read at least 99.93% of the previous
  request's context from the cache. Every cache write was a 5-minute one (`ephemeral_5m`
  111,216 and 149,010 tokens, 1-hour 0). The longest gap between one request's end and the next
  one's start was 23.3 s in each session (a tool call: the install, `validate --screenshots` or
  `coverage`), against the cache's 300 s lifetime. A lapse needs one tool call of over five
  minutes inside a session told to finish in ten.
- **What a lapse would cost**: the same request with nothing cached, $0.76 at 149k tokens and
  $0.60 at 116k.
- **Where an overshoot happens.** The platform checks the budget before each request, and the one
  that crosses it completes (managed-agents/budgets), so a session overshoots by at most one
  request. A session reaches $2.24 only after half as much again as H3's graphic, at a context
  near 160k (H3's graphic grew about 3k tokens a request at about $0.05 a request near its end).
  A warm request there with the largest write and the largest output measured, together, would
  be $0.37; that pairing did not occur in 52 requests (the largest write came with 228 output
  tokens, the largest output with 417 written).

## The decision on `o`

DECIDED: `o` = **$0.22**, the largest request H3 measured, for both the exam reserve and the wall's
per-session margin. Not the $0.50 default of 5.2, not the $0.76 lapsed-cache bound.

Why, on the three things that settle it:

1. **What the largest request cost.** $0.22 is the most any of 52 requests cost, and twice what a
   request at the largest context cost. The $0.50 default was 5.2's estimate before any request
   was measured; 5.2 says `o` is estimated from H3's trace.
2. **How often a cache lapses.** Never in 50 follow-on requests, with the longest gap at 8% of the
   lifetime. For a lapse to set the overshoot it must also fall on the one request that crosses
   the budget. The $0.76 bound prices that coincidence on every one of the 20 exam sessions.
3. **What each wrong choice costs.**
   - *Too small* (the real overshoots average more than $0.22): `R` runs short only if most of the
     20 exam sessions reach `B` and overshoot it. A session at its budget hands in "checked, and
     not ready" (3.3), and 4.5 fails an exam with any accepted graphic over the budget, so the
     exam has failed on its own numbers before its money runs short. Even then the shortfall is
     at most 20 x ($0.76 - $0.22) = $10.80 with a lapse on every session, about $3 with the cache
     warm ($0.37), and it comes first out of what the tuning rounds leave unspent (a round of five
     Opus graphics at `m` spends about $7.45 of its $15). The bench workspace's own limit is the
     hard backstop. In the wall, the same `o` means a round can end past its ceiling by at most
     one request's excess over $0.22.
   - *Too large* ($0.50 or $0.76): $5.60 or $10.80 moves into a reserve the evidence says will not
     be spent, and either leaves two $15 rounds instead of three (`T` $42.54 or $37.34). The third
     round is the one decision 5 needs if H5 delivers a basic defect or a missing action, which
     is likely (in August, four of 25 graphics lacked an operator action): H6 then measures the
     critic, and only H7 can measure Sonnet 5.5. Without H7 the winner is Opus by default, at
     about twice Sonnet's price for every student graphic.

   The asymmetry decides it: a small `o` costs money only in an exam that has already failed; a
   large one costs a tuning round for certain.

Made checkable, so a wrong call is caught before it costs: H5 reports each session's largest
request and any request whose cache read falls short of the previous context. If any H5 request
costs more than $0.22, or a lapse shows, `o` becomes the largest measured and the reserve is
revised before H6 spends (below).

## The three candidates, side by side

`B` = $2.24 and $2.66 spent in each row (the arithmetic is pinned in `scripts/harness-bench.test.mjs`):

| `o` | `R = 20 (B + o)` | `T` | rounds at $15 | rounds at $9 |
|---|---|---|---|---|
| **$0.22 measured (decided)** | **$49.20** | **$48.14** | **3** | 5 |
| $0.50, the 5.2 default | $54.80 | $42.54 | 2 | 4 |
| $0.76, the lapsed-cache bound | $60.00 | $37.34 | 2 | 4 |

## The round ceiling and the brief count

DECIDED: H5, H6 and H7 each have a **$15 ceiling and 5 briefs**. The 5.2 fit rule picks $15
because at least two rounds fit there. A round's worst case is 5 x (`B` + `o`) = $12.30, so it
holds its five briefs even if every session reaches its budget, with $2.70 to spare for a raised
`B` (a sixth brief would fit at $14.76 and leave nothing). H7 spends only if the ladder of 5.1
needs it. The tuning bank has 15 library briefs (`tuning/briefs.json` without the OGraf one).

## The session budget default

DECIDED: **224 cents**, in `agents/noacg-harness/agent.md` as `metadata.session_budget_cents`.
Metadata is bookkeeping on the agent, never shown to the model, and the field of the agent's
create body made for it, so the file stays what `ant apply` reads (D1). `--build` takes it as the
default `--budget-cents` for briefs (a proof keeps its own), and a test pins it to H4's reserve. The change is a
new agent version: `harness-agent-sync --workspace bench` planned `agent update` with the
environment and skill kept, `--apply` made **v3** (free), and a second dry run keeps all three. A
free read of v2 and v3 on the bench key shows the same system prompt, model (`claude-opus-5-5`,
`high`), tools and skill version; only the metadata differs. The system prompt still says the
session has a hard cap without naming it: what the prompt says about money is a behaviour change,
which is tuning's to measure, not this phase's.

## Time

The bench measured 471 s for the real graphic, from before the session's create call to after its
downloads and cleanup (the session itself went idle 408.6 s after its creation),
with its cold start inside it (bridge reachable at 27.9 s). 5.2 adds the cold start: 471 s plus
the slowest measured, 32.1 s (the tarball path), is **503 s, under the ten-minute median of 4.5**
with 97 s to spare. That counts the cold start twice and includes the bench's own downloads. The
bench's capture of the delivered package (about 35 s) runs after the session and is not a
student's wait. One sample: a session with the critic adds a thread, so H6 measures time too.

## `m` is one sample

`m` = $1.49 is one graphic on one brief. The defect repair ($1.09) is a smaller job, not a second
sample of `m`; counting it would give $1.29 and `B` = $1.94, and is not done, which is the cautious
side.

What a second sample does: H5's five Opus graphics make six. When H5 closes, `m` is the mean list
cost of H3's and H5's Opus graphic sessions (a session that reached its budget counts at its list
cost and is named, since its true cost is higher), and the reserve is revised before H6 spends
with `B` = round-up(1.5 m) as the exam's forecast. The sessions' own budget in `agent.md` stays at
224 cents until H7 sets it for the winner (3.3), so H5 and H6 compare at one budget (one variable
a round, AC-6); if H5's sessions reach that budget, that is H5's finding to report, not a number
to move quietly. Every $0.10 on the mean is $0.15 on `B` and $3.00 on `R`. With H5's own
five sessions at that mean, what is left after H5 still holds the following (H5's sessions are
capped at $2.24 plus one request, so a mean near that is a floor, and the last rows are rough):

| Opus mean after H5 | `B` | `R` | left for H6 and H7 |
|---|---|---|---|
| up to $1.79 | up to $2.69 | up to $58.20 | two $15 rounds |
| up to $1.96 | up to $2.94 | up to $63.20 | one $15 and one $9 |
| up to $2.14 | up to $3.21 | up to $68.60 | two $9 rounds |
| up to $2.39 | up to $3.59 | up to $76.20 | one $9 round, the model ladder only |

Past that the exam no longer leaves a tuning round, and the run stops with `needs: decision` and
5.2's recommendations in order.

## How `R` is revised

`node scripts/harness-bench.mjs --reserve --by <H#> --budget-cents <B> --overshoot-cents <o>
[--critic-cents <c>]` recomputes `R`, `T` and the rounds and records the reserve. Every term is
named, `B` included, so a revision never inherits a budget it did not state. It refuses, writing
nothing, if `R` no longer fits in what is left, and it says so when no round fits even at $9:
both are the stop for the owner.

- **H5:** `B` from the six-sample mean, and a new `o` if a larger request or a lapse showed.
- **H6, if the critic is on** (3.4): its sessions run with `--critic-cents 22` on `--build` (one
  more request per running thread, the author's `o` until the critic's own is measured). If the
  critic stays, its sessions run two threads under one budget, so `m` is re-measured on them (both
  threads' list cost), `B` = round-up(1.5 m), and the critic thread's largest request is the
  critic share: `R = 20 (B + o + critic)`. The wall reads the share from the reserve, so every
  later session's margin follows.
- **H7:** `B` and `o` for the winning model (3.3), in `agent.md` (re-synced) and the reserve alike,
  the last revision before H8.
- **H8:** `--build H8` is refused until H5, H6 and H7 are closed (H7 closed as not needed if it
  spends nothing), and runs with `--ceiling-cents` equal to the reserve. Before it spends, H8
  confirms that `agent.md`'s budget is the reserve's `B`.

## What changed

- `benchmarks/harness/ledger.json`: `reserve` (H8, set by H4, 20 x (224 + 22 + 0) = 4,920 cents)
  and H4's `completed` entry at $0. No H4 session exists.
- `benchmarks/harness/lib/ledger.mjs`: the wall's `remaining` leaves out what the exam has not yet
  spent of its reserve, for every phase but the exam's and nothing once the exam is closed
  (`heldCents`); `reservation()` is 5.2's arithmetic; a reserve whose figure is not its own
  arithmetic does not read; a phase id has one spelling (`H4`, never `H04`).
- `scripts/harness-bench.mjs`: `--build` refuses the $0 phases (H0, H1, H2, H4: "H4 spends nothing
  (5.1): it creates no session", exit 2), tuning before a reserve exists, and the exam before
  tuning is closed; its budget defaults to `agent.md`'s and its margin to the reserve's `o` and
  critic share, with `--critic-cents` for H6; `--reserve`; the ledger line names the hold.
- `agents/noacg-harness/agent.md` and `claude-lock.bench.json`: the budget default, agent v3.

## Checks run

`node --test scripts/harness-bench.test.mjs` 30 of 30, three of them new: the reserve's arithmetic
for all three candidates and the wall refusing a tuning session that would eat into it while the
exam may use it; `--reserve` writing beside the entries, refusing a missing or empty term and
writing nothing when the exam no longer fits, and the wall's margin following the reserve; and
the committed reserve against H3's measurement, `agent.md` and H4's $0 close.
`node scripts/harness-bench.mjs --build H4 ...` refused before reading a key. `harness-agent-sync
--workspace bench` keeps all three after the sync. Not checked: the Console's usage page (H3's
glance, asked in PR #1234; H4 adds no spend to compare).
