# H2 evidence: the frozen judge

Phase 3 of `docs/work-specs/noacg-harness/spec.md` (AC-3, section 4.3), built 2026-10-14 on
`origin/main` `e349156e6`. Credit spent: $0. Every judgement ran as a `claude -p` child on the
owner's subscription in the 5.4 environment (`benchmarks/harness/lib/subscription.mjs`: built from
scratch, `claude auth status` reported `loggedIn: true`, `authMethod: oauth_token` before each
run). Notional subscription cost $143.56. No usage-limit pause happened, so the ledger holds no
`paused` entry.

**Result: PASS.** On the held-back 30%, read once by the frozen judge: airability agreement with
the owner 38 of 41 (92.7%, Wilson 95% interval 80.6% to 97.5%) with no basic-defect FAIL called
airable (16 of 16 rejected); pairwise good-versus-bad 15 of 16 (93.8%, interval 71.7% to 98.9%),
the one miss an order flip counted as an error.

## What exists now

| Piece | Where | What it does |
|---|---|---|
| The prompt | `benchmarks/harness/judge/prompt.md` | The judge's whole system prompt: the basic mistakes, what is not one, the designer's checks that also keep a graphic off air, the pairwise rule. |
| The rubric | `benchmarks/harness/judge/rubric.json` | The basic-mistake kinds and the strict JSON schema of each task (`single`, `pairwise`), passed to `claude -p --json-schema`. |
| The lock | `benchmarks/harness/judge/judge.lock.json` | sha256 of `prompt.md` (`3060b854...`) and `rubric.json` (`82311f0d...`), model `claude-fable-5-1`, effort `high`, Claude Code `2.1.296`, the held-back membership hashes. Committed in `851f23255` before the held-back part was read. |
| The judge runner | `benchmarks/harness/lib/judge.mjs` | `loadJudge` (refuses a changed file), `judgeSingle`, `judgePair` (both orders, a flip is a tie), `coverageFrames` (a cell's coverage matrix with captions). One `claude -p` per judgement: the frozen prompt as `--system-prompt`, `--tools Read`, `--strict-mcp-config`, `--no-session-persistence`, the rubric schema; the frames copied into an empty directory as `A-1.png`, `B-3.png` and so on. An answer whose `modelUsage` lacks the pinned id is an error, not a judgement. |
| The exam's judge | `scripts/harness-bench.mjs --judge <runDir> [--phase H#]` | Judges every cell with coverage frames alone and every two arms on one brief as a pair, with each cell's operator surface. Refuses before anything starts when the judge's files differ from the lock. |
| The calibration | `benchmarks/harness/judge/calibration.mjs` | `set`, `split`, `render`, `run --part dev|heldout`, `score`, `freeze`. `run --part heldout` refuses an unfrozen judge, and refuses a second judge on a held-back part another judge already read. |
| The set and split | `benchmarks/harness/judge/calibration-set.json`, `split.json` | The labels, briefs and frame paths; the seed and membership. Frames stay in the archives and the work directory, never in the repository. |
| Planted defects | `benchmarks/harness/judge/plant.mjs` | The injection and a PNG reader that measures what a plant changed. |
| Tests | `scripts/harness-bench.test.mjs` | Five new: the committed lock pins a model id and refuses a changed prompt or rubric (line endings are not a change); the invocation; both orders and the flip; `--judge` refusing a tampered judge with no call made; the split reproduced from its seed, held back by brief, scored against the fixed thresholds (an approve-everything judge, an all-flip judge and a silent judge fail). |

## The model

`claude -p --model fable` and `--model opus` both answer on the subscription. The run's
`modelUsage` names them `claude-fable-5-1` and `claude-opus-5-5`. Fable 5.1 is the stronger (D6
ranks it above Opus 5.5), so the judge is pinned to `claude-fable-5-1` by that exact id, at effort
`high`. The probe with `--tools ""` also listed `claude-opus-4-8` beside Fable in `modelUsage`;
every judgement run listed only `claude-fable-5-1`.

## The calibration set

132 items, 51 pairs (`calibration.mjs set`):

| Source | Items | Owner verdict | Frames |
|---|---|---|---|
| August agent round, `noacg-bench-archive/agent-round-2026-08-22` | 25 good | all airable (`benchmarks/agent/rounds/2026-08-22/VERDICT.md`) | re-rendered from the saved sources with this CLI over the video plate: the Take, the CLI's stress values and up to three event states |
| Rules re-read, `rules-reread-blind-final-2026-08-19-2026-08-18` | 21 good | the 21 gemini cells, all AIR or OK* | archived hold, stress and step stills |
| Type sweep, `typesweep-blind-final-2026-08-18` | 29 bad | every TWEAKS and FAIL: 18 minimax, 11 gemini | archived hold, stress and step stills |
| Free-form coder round, `freeform-coder-pro-freeform-blind-final-2026-08-17` | 30 bad | the coder cells rated "not okay" or empty (8 minimax, 7 grok, 7 gemini, 8 opus) | archived hold and stress |
| Instruments round, `pro-instruments-round-READ-2026-08-14` | 5 bad | B-11, B-13, B-14, B-15, B-20 | archived hold and stress |
| Planted defects on the 22 library graphics of the August round | 22 bad | text over text (8), a clipped title (7), grey on grey (7) | rendered exactly as their originals |

A bad item is tagged with a basic mistake only where the owner's note names one: text over text or
a rule through text, unreadable contrast, clipped or escaping text, a graphic that shows nothing.
51 bad items carry one (14 type sweep, 12 free-form, 3 instruments, 22 planted). Pairs are within
one brief: each rules re-read cell against the type sweep's rejected cells of the same brief (29),
each August cell against its planted variant (22).

**Planting.** `plant.mjs` appends an ES5 script to the copied graphic's `js/template.js` that finds
the most prominent live text (font size times width, visible, on the frame) every 40 ms and
applies the defect: moves the second text's branch onto the first, clips the right 40% of the
first, or turns every text `#7d7d7d` and every painted surface `#737373` (1.15:1). Each plant is
measured against its original frame by frame: the smallest changed 0.02% of the picture (a clipped
"HOME"), the largest 99.9% (a full-frame countdown turned grey). The first selection rule (largest
font size) picked an invisible duplicate digit and changed nothing on one scoreboard; it was
replaced before any plant was judged.

## The split

`calibration.mjs split --seed 20261014`, made and committed (`c5cc0367e`) before the prompt existed.
A group is one brief (its good and bad items and the pairs between them); within each stratum and
sub-stratum (type sweep by graphic type, August by brief, free-form by model, instruments), a seeded
shuffle holds back round(30%) of the groups: 25 of 81 groups.

| Part | Items | Good | Bad | With a basic mistake | Planted | Pairs |
|---|---|---|---|---|---|---|
| Development (70%) | 91 | 31 | 60 | 35 | 15 | 35 |
| Held back (30%) | 41 | 15 | 26 | 16 | 7 | 16 |

Held-back membership sha256: items `e0eef5460b705bb52c8767572cd95345a655f0f2356371a3cf97a094576d7c8c`,
pairs `01a30d0da4679dabffe5f14d1799c704f437d5fea05f42bc87c1e95302083f8a`, groups
`8e6511bcd8b090960bb6a823ace7550348cddbf765a30dd2a216f248f29a2606`. The test redraws the split
from the seed and compares these.

**What the builder saw.** To transcribe the labels the builder read every round's `notes.md`,
held-back items included; the verdicts themselves are the labels, so this cannot be avoided. The
builder never opened a held-back item's frames, renders or judge answers before the lock was
committed: the planted variants of held-back cells were checked by the pixel measurement above,
not by eye, and the runner refuses the held-back part to an unfrozen judge. The prompt names only
defect classes the owner names across many rounds.

## Writing the prompt on the development part

| Draft | Judge fingerprint | Development result | What changed next, and why |
|---|---|---|---|
| v1 | `ff53a39f7021` | 45 of 59 archived items (76%); renders not yet judged | A clean ellipsis on an overlong stress value was read as clipping (5 aired re-read cells refused); a board showing only its title before the first step was read as empty; a panel not filling a full-screen frame was refused; logo plates, decorative blocks and floating logos were waved through as nits. v2 says what is not a basic mistake and names the designer's faults that do keep a graphic off air. |
| v2 | `4e1122e9c04a` | 83 of 91 (91.2%); pairs 34 of 35; no flip; no basic-defect FAIL aired | Two aired podiums refused because their stress values were never shown in a frame. v3: judge what the frames show, never what they do not. |
| v3 (frozen) | `60bfb08e18a4` | 84 of 91 (92.3%); pairs 34 of 35; no flip; no basic-defect FAIL aired | Frozen. The seven remaining development misses are design calls (a sun band, a weight mismatch, a widened card), not a pattern the prompt could name without fitting to them. |

Development by source for v3: August 16 of 17, re-read 13 of 14, type sweep 17 of 20, free-form
20 of 22, instruments 3 of 3, planted 15 of 15; pairs: planted 15 of 15, type sweep 19 of 20.

## The held-back part (frozen judge, read once)

`calibration.mjs run --part heldout` then `score --part heldout`:

| Measure | Result | Threshold (4.3) |
|---|---|---|
| Airability agreement | 38 of 41, 92.7% (80.6% to 97.5%) | at least 85% |
| Basic-defect FAIL called airable | 0 (16 of 16 rejected) | none |
| Approves everything | no: 14 of 15 good aired, 24 of 26 bad rejected | fails if so |
| Pairwise, good preferred, flips as errors | 15 of 16, 93.8% (71.7% to 98.9%) | at least 90% |
| Order flips | 1 (`rr:X-07` against `ts:X-10`) | counted as an error |
| Pairs wrong in both orders | 0 | |

By source: August 7 of 8, re-read 7 of 7, type sweep 8 of 9, free-form 7 of 8, instruments 2 of 2,
planted 7 of 7; pairs: planted 7 of 7, type sweep 8 of 9.

The three disagreements, read after the run:

- `aug:live-vote.C` (owner: airable; judge: not, high confidence). The re-rendered Take shows every
  percentage at `0%` beside bars of different lengths; the owner's 2026-08-22 frame shows 47, 28, 17
  and 8. `validate --screenshots` caught a count-up before it settled. The judge read the picture
  it was given correctly; the capture differs from what the owner aired
  (`evidence/instruments.md`, entry 1). Counted as an error all the same.
- `ff:X-55` (owner: the diagonal stroke too wide, almost on the logo; judge: airable).
- `ts:X-10` (owner TWEAKS: the red accent looks like a mistake; judge: airable). The same graphic
  is the pair whose preference flipped with the order.

No rejected graphic was approved with high confidence. 29 of the 41 answers were high confidence,
12 medium.

## Limits

- **Stills, not the matrix.** The archived frames are 2 to 5 stills per graphic; the exam judges
  `noacg coverage`'s full matrix (57 frames for a scoreboard, crops, motion strips). Motion was not
  calibrated at all.
- **Operator actions are not calibrated.** The owner judged frames, not operator surfaces, so the
  calibration passes no surface and `missingActions` is never exercised. A missing action stays the
  mechanical gate of 3.6; the judge's reading of it is covered by a unit test only.
- **The re-renders are not the frames the owner saw**: this CLI, the video plate, and in one case
  (above) an unsettled count-up. Archived items sit on flat grey, re-renders on the blurred plate;
  both kinds occur among good and bad items, and the two graphics of a pair always share a ground.
- **Planted defects are coarse.** They are unmistakable by construction; real defects are subtler.
- **Small numbers, one owner.** 41 items and 16 pairs: the lower ends of the intervals (80.6%,
  71.7%) sit below the thresholds the spec fixed on point estimates.

## Spend

| Run | Judge | Judgements (`claude -p` calls) | Notional |
|---|---|---|---|
| Model probes | - | 2 | $0.17 |
| v1, development (archived items) | `ff53a39f7021` | 59 | $13.11 |
| v2, development | `4e1122e9c04a` | 91 single, 35 pairs (161) | $54.75 |
| v3, development | `60bfb08e18a4` | 91 single, 35 pairs (161) | $54.45 |
| v3, held back | `60bfb08e18a4` | 41 single, 16 pairs (73) | $21.08 |
| Total | | 456 | $143.56 notional, $0 credit |

A single judgement took a median 22 s. The ledger holds H2 as completed with the notional figure.

## Reproduce

```
node benchmarks/harness/judge/calibration.mjs set                       # writes the same set
node benchmarks/harness/judge/calibration.mjs render                    # the August cells and plants, $0
node benchmarks/harness/judge/calibration.mjs run --part dev --model claude-fable-5-1 --effort high
node benchmarks/harness/judge/calibration.mjs score --part dev
```

The held-back part has been read; a re-pin (4.3) needs a new held-back set rather than this one
again, and the runner refuses a second judge on it from the same work directory.
