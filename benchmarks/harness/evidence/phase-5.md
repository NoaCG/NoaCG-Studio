# H5 evidence: tuning round 1, the August reproduction

Phase 6 of `docs/work-specs/noacg-harness/spec.md` (AC-6, AC-16, AC-17, sections 3.8, 5.1, 5.5),
built 2026-10-15 on `origin/main` `7b25eb2a8`, on the bench workspace's key.

## Before the first session

Written and committed before any H5 session was created (5.1, AC-6).

- **Configuration.** Agent `agent_0183yBA1miijGFNvm5bkMv6B` v3 as synced (Opus 5.5, effort
  `high`, the 15-line plumbing prompt, the `noacg-graphic` skill as published at
  `skver_01X2F1VAisMcvT5tj1ZDFHpj`, no critic, web tools off), the CLI tarball of this checkout
  (with `coverage` and `record`), the session budget 224 cents from `agent.md`, the wall's margin
  the reserve's `o` of 22 cents. One session at a time.
- **Briefs.** The five library briefs of `benchmarks/agent/v1/briefs.json`, as
  `tuning/briefs.json` carries them: `news-lower-third`, `school-scoreboard`,
  `lecture-countdown`, `live-vote`, `debate-clock` (`third-party-ograf` stays out, 4.2).
- **Reference.** The August round's arm A cells of the same five briefs
  (`agent-round-2026-08-22/cells/<brief>.A`), re-captured at $0 by the bench's new `august` arm
  through the same record, coverage, validate and inspect as the harness's cells. DECIDED: arm A
  (contract-only skill, free design) because it is the configuration the August verdict kept as
  the skill's default, and one reference cell a brief keeps the subscription judging to 5 pairs.
  Revert: `--build H5 --arms august --august-config <B..E>` into the same run directory and
  judge again ($0 credit; B ran 3 of the 5 briefs, C 4, D and E 5).
- **Hypothesis.** Reproduced in the container, the August loop on Opus 5.5 delivers all five
  graphics validator-clean within the session budget, and the frozen judge does not prefer the
  August Claude Code graphic on more than half of the five briefs. Expected from August and H3:
  the missing-action fault line repeats on at least one typed-action brief.
- **Ceiling.** $15 (1,500 cents) of credit for the round, by the ledger's `usage.list_cost` sum,
  passed as `--ceiling-cents 1500`. Worst case 5 x (224 + 22) = $12.30. The wall keeps the $49.20
  exam reserve out of reach. Never topped up.
- **Signal, and how each figure is counted (fixed now, before any result):**
  - per harness cell: outcome (delivered, not ready, failed), the validator's errors, list cost,
    the bench's wall seconds, model requests, images read, the largest single request, and any
    request whose cache read falls short of the previous request's context (a lapse);
  - **missing actions**: the mechanical gate of 3.6 on `noacg inspect`'s buttons, with H1's alias
    trap handled first: an action is offered by an event of its name (any case), an
    `expect.aliases` name (`school-scoreboard`: the type's `goal` press is the brief's `flag`), or
    an event holding the action's words whole (`switchSpeaker` offers `switch`), and an event that
    is exactly another needed action counts only for that one (`clearFlag` is not a flag).
    Pinned in `scripts/harness-bench.test.mjs`; the same rule counts the reference;
  - **basic visual defects**: the frozen judge's single judgement of each delivered graphic, its
    `basicMistakes` other than `missing-action` (counted mechanically above). A defect the judge
    places only in a count-up frame shot before it settled is checked against the settled frame
    and logged in `instruments.md` (entry 1) before it is counted;
  - **the verdict against the reference**: the frozen judge, pairwise, harness against August A on
    each brief, in both orders; an answer that flips with the order is a tie. Reported as
    harness preferred, tie, August preferred;
  - **accepted** = delivered, validator clean, no missing action, judged airable alone with no
    basic visual defect; **cost per accepted graphic** = the round's credit over accepted ones;
  - **median wall time** of the five sessions against 600 s;
  - **the contact sheets** (H3's carry): whether each agent read coverage frames one by one or as
    sheets it built, and whether the judge found a defect in a frame the agent saw only on a sheet.
- **What the signal decides.** H6's variable, by 3.8's rule: **the critic** on the same briefs and
  model if any harness graphic has a basic visual defect or a missing action; **else Sonnet 5.5**
  on this configuration. Before H6 spends, `--reserve --by H5` with `m` the mean of H3's and H5's
  Opus graphic sessions and `o` raised to the largest request if any exceeds 22 cents or a lapse
  shows. The stop rule of 5.5 (two rounds in a row without progress) cannot fire on the first
  round; H5 is the baseline H6 is measured against. The round stops where it is if the ledger
  refuses a session, and a session that fails is read for its cause before it is counted
  against the model.

## Outcome

**The round ran within its ceiling and the signal is there.** Five Opus 5.5 sessions delivered
five validator-clean graphics for **$6.24** of the $15 ceiling, none near the 224-cent budget,
median **337 s**. Against the August A cells the frozen judge preferred **the harness on 2 briefs,
August on 2, and tied 1** (an order flip). The harness delivered **one basic visual defect** (the
live vote) and **no missing action**; August A had 2 graphics missing actions. By 3.8's rule,
**H6 tests the critic** on the same five briefs and model.

The hypothesis, part by part: all five delivered validator-clean within budget (held); the judge
did not prefer August on more than half (held, 2 of 5); the missing-action fault line repeated
(did not hold for the harness: every needed action was on its surface, the scoreboard through the
type's own machine; it held for August A, as in August).

## The sessions

All through `scripts/harness-bench.mjs --build H5 --arms managed-agents,august --briefs
news-lower-third,school-scoreboard,lecture-countdown,live-vote,debate-clock --ceiling-cents 1500`,
agent v3, budget 224 cents, one at a time. The first session was created at 06:05:34Z, after the
section above was committed (06:05:11Z, `1b6f5db84`). Figures from each session's own events
(`benchmarks/harness/lib/trace.mjs`; `evidence/phase-5/<cell>/trace.json` and `cell.json`).

| brief | session | list cost | wall | requests | tool calls | images | largest request | min cache read | longest gap | bridge ready |
|---|---|---|---|---|---|---|---|---|---|---|
| news-lower-third | `sesn_01Bdfon5TofqgoadjBP2yviF` | $0.99 | 327 s | 21 | 33 | 10 | $0.0879 | 99.927% | 25.8 s | 35.1 s |
| school-scoreboard | `sesn_012cqXgdV6GJEXu9QACA4MXn` | $1.33 | 351 s | 16 | 29 | 10 | **$0.3899** | 99.927% | 23.2 s | 31.0 s |
| lecture-countdown | `sesn_01HK8Fozkm8Qj9ovfXw3TNvt` | $0.88 | 273 s | 19 | 31 | 11 | $0.1078 | 99.927% | 38.5 s | 34.9 s |
| live-vote | `sesn_018nwamEC8XfGadYzsUpaQW4` | $1.15 | 337 s | 31 | 40 | 16 | $0.1096 | 99.927% | 24.4 s | 34.5 s |
| debate-clock | `sesn_01XWmNthaz7GVVQ2SkALNhXD` | $1.89 | 537 s | 42 | 58 | 23 | $0.1232 | 99.928% | 32.9 s | 29.7 s |

Total $6.24, mean $1.25, median wall 337 s (the bench's figure, create to cleanup), slowest 537 s.
Each session's `usage.list_cost` equals the list-price sum of its requests and running time, to the
cent. Cleanup: every session and its outputs gone (`cleanup gone` in each cell).

- **Largest request: $0.39**, over H4's `o` of $0.22. The scoreboard agent wrote its whole design
  in one turn after reading three scaffold files: 6,569 output tokens and 50,457 tokens written to
  a warm cache at an 81k context. This is the pairing H4 said had not occurred in 52 requests (a
  large write with a large output); it is not a lapse.
- **No cache lapse**: in all 124 follow-on requests each read at least 99.927% of the previous
  request's context from the cache; the longest gap between requests was 38.5 s.

## The reference

The August round's arm A cells re-captured at $0 by the new `august` arm. Delivered as archived,
validator clean; their operator surfaces as in August (`RESULTS.md`): no buttons on the scoreboard
or the countdown, `switch`, `penalty`, `reset` on the debate clock. Their `cell.json` digest checks
read as two versions, for two reasons that touch no verdict: the first `validate` regenerates an
August package's generated files, so the version reviewed before it differs from the one recorded
(fixed: the arm now validates twice; re-checked at $0, `school-scoreboard` is one version), and
`news-lower-third.A` carries a stray second HTML file (`news-lower-third.html` beside
`news_lower_third.html`), which the zip and the folder read differently. The captured version is
the recorded one in every cell.

## The verdict

Frozen judge `claude-fable-5-1` (fingerprint `60bfb08e18a4`), on the subscription, every cell's full
coverage matrix (23 to 69 frames plus crops) with its operator surface. Answers in
`evidence/phase-5/judgements.jsonl`.

| brief | harness alone | August A alone | pair (both orders) |
|---|---|---|---|
| news-lower-third | airable | airable | **tie** (each order preferred the second graphic shown: a flip) |
| school-scoreboard | airable | not airable (no flag, clear or final; a long name broken mid-word) | **harness**, high, both orders |
| lecture-countdown | airable | not airable (no pause or resume) | **harness**, high, both orders |
| live-vote | **not airable**: text over text after an Update to long options | airable | **August**, high, both orders |
| debate-clock | airable | airable | **August**, medium, both orders |

- **Basic visual defects**: harness **1 graphic** (the live vote, `text-over-text` in the Update
  strip at 600 and 1,500 ms: the first option wraps to four lines in a row that did not grow and
  covers the second; I looked at `update-01500ms.jpg` and it does). August A: 1 (`empty-or-broken`
  on the scoreboard, which is its missing actions seen as pictures: no flag or final ever appears).
- **Missing actions** (the mechanical gate, with the alias rule above): harness **0**; August A
  **2 graphics** (the scoreboard lacks `flag`, `clearFlag`, `final`; the countdown `pause`,
  `resume`). The judge's own `missingActions` agreed on every cell.
- **Accepted**: harness **4 of 5** (all but the live vote); August A 3 of 5. **Cost per accepted
  harness graphic: $1.56** ($6.24 / 4), the baseline H6 and H7 are measured against.
- **Order flips**: 1 of 5 pairs.
- **The debate clock's two readings differ**: judged alone, airable (medium); in both pair orders,
  not airable, because after the Take no speaker is active, so the coverage's Penalty press changes
  nothing and its effect is never shown. The judge calls it "operational rather than visual". Not a
  basic mistake and not a missing action, so it counts in neither; it is what a critic could raise.

**Judging cost**: 24 answered `claude -p` calls (14 single, 10 pair orders), $79.03 notional on the
subscription, no usage pause, $0 credit. A single judgement took 39 to 169 s, a pair 177 to 392 s.
Four of the singles ($9.95) were judged on frames whose stress landed on the wrong fields, then
judged again (below); they are kept in `judgements.positional-stress.jsonl` and count for nothing.
One pair order was stopped unanswered when that was found.

## The instrument fault found on the way

`instruments.md` entry 6. The bench's capture maps a brief's `f0`, `f1`... stress values by
position, and the v1 briefs' order matched neither arm's authored package on `live-vote` and
`debate-clock` (the question went into a kicker or the options field, a speaker's name into a round
label). The first live-vote judgement failed the harness on four mistakes that came only from that,
and passed August A, whose frame was just as wrong. Fixed in the bench before any verdict was
counted: a brief may key stress by the words of a field's label, the two briefs are re-keyed (and
the live vote's options value written in the `Answer | number` lines both packages read), the four
cells re-captured at $0 and re-judged, and every pair judged on the corrected frames only. Checked
field by field, the other three briefs mapped correctly in both arms. Re-judged, the live vote
still fails, on the real defect above.

## What H6 must allow for

- **The critic cannot see this round's defect unless the frames show it.** The agent's own
  coverage in the container has no brief stress values, and the CLI lengthens a `Label | value`
  lines field by growing its number column (`52 Yes`), so no frame the agent (or a critic reading
  the same matrix) saw had a long option label (`instruments.md` entry 8, issue #1246). Measured
  with and without the critic on this configuration, a critic that misses the live vote says more
  about the matrix than about the critic. Not changed here: changing the CLI between H5 and H6
  would be a second variable.
- **Contact sheets**: all five agents read the coverage as contact sheets they built (0 or 1
  coverage frames read one by one). The judge found nothing in a frame the agent saw only on a
  sheet; the one defect was in no frame the agent had.
- **The reserve is revised** (`--reserve --by H5`): `m` = mean of six Opus graphics (H3's $1.49 and
  these five) = $1.29, `B` = round-up(1.5 m) = **$1.94**, `o` = **$0.39**, `R` = 20 x $2.33 =
  **$46.60**, `T` = $100 - $8.90 - $46.60 = **$44.50**: **two $15 rounds** (four at $9). `agent.md`
  keeps 224 cents until H7, so H5 and H6 run at one budget.
- The stop rule (5.5) does not apply to round 1. H6's progress is measured against this baseline:
  cost per accepted graphic $1.56 and the verdict 2-1-2 against August A.

## What changed in the repository

- `benchmarks/harness/lib/arms.mjs`: the `august` reference arm (`archivedArm`), validating twice.
- `benchmarks/harness/lib/pipeline.mjs`: the operability gate reads a brief's words against a
  package's event names (`expect.aliases`, whole words, an exact match claims only its own action);
  `stressFile` keys stress by label words and writes `stress.json` per cell.
- `benchmarks/harness/tuning/briefs.json`: `school-scoreboard` `expect.aliases`; `live-vote` and
  `debate-clock` stress keyed by label words; the notes say so.
- `scripts/harness-bench.mjs`: `--arms august [--august-config <letter>]`.
- `benchmarks/harness/ledger.json`: five sessions ($6.24), five $0 reference entries, the revised
  reserve, H5 closed.
- `evidence/phase-5/`: each cell's `cell.json`, `trace.json` and `stress.json`, and the judge's
  answers. Frames, packages and raw events stay in `%TEMP%\noacg-harness\H5-round1` on this machine.
- No `cli/`, `cli/skill/` or `agents/` change: nothing in this round earned one (AC-16).

## Checks run

`node --test scripts/harness-bench.test.mjs` 32 of 32 (new: the alias and word rule, the archived
arm at $0, the label-keyed stress); eslint clean on the four changed scripts;
`NOACG_URL=https://noacg.studio node scripts/harness-bench.mjs --control` before the first session:
CONTROL PASSED at $0 (the fake scoreboard now reads `actions ok` where H1's gate said `MISSING
flag`); `harness-agent-sync --workspace bench`: keep x3. Not checked: the Console's workspace usage
against the ledger's $8.90 (the owner's glance, asked in the pull request).
