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

Checks before the first session, on this branch: `NOACG_URL=https://noacg.studio node
scripts/harness-bench.mjs --control`, run directly after building `cli/`: CONTROL PASSED at $0.
`node --test scripts/harness-bench.test.mjs` 48 of 48. `--build H8 --dry --arms
managed-agents,claude-code --model claude-opus-5-5`: the sealed briefs opened and verified, the
`skill:` line naming the lock's bundle from `2128d984d`, the `agent:` line v7 read back from the
server, the reference's subscription `oauth_token`; nothing created, $0.
