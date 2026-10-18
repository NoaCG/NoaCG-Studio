# L2 evidence: teaching Sonnet 5.5 `high`

Phase 3 of `docs/work-specs/harness-ladder/spec.md` (AC-4, AC-8). Subscription only; no credit.
No brief text is in this file or beside it: the eight ladder briefs open in memory from H8's
sealed file, the 16 tuning briefs are the committed bank, and only ids, types and the judge's
answers are committed.

## Fixed before the baseline's first session

- **The taught rung** (D7 as applied by the L1 repair): Sonnet 5.5 `high` (`claude-sonnet-5-5`,
  `--effort high`), 2 of its first 4 usable in L1.
- **The baseline is the skill and CLI as L1 ran them**: nothing in `cli/skill` or `cli/src` has
  changed since L1's Sonnet `high` rung (`git log e7a5f4d80..905fabec1 -- cli/skill cli/src` is
  empty). So the baseline on the eight is L1's four screen cells, with their three readings each,
  plus the other four run now: `hockey-club-match-board`, `volleyball-set-board`,
  `school-quiz-secret-pick`, `ski-sprint-timing-tower`. On the 16 tuning briefs it is all 16, in
  the bank's order.
- **The counting** is L1's, with D8 as amended: three readings a delivered graphic by the frozen
  Opus ladder judge (lock `9fa9d7e3ac9b`), usable on at least 2 of 3 airable readings with no basic
  visible mistake and no missing operator action after the readings; the cost is Claude Code's
  notional `total_cost_usd` of every session that ran, per usable graphic.
- **What decides**: D6's four lines on the eight (at least 7 usable, at most $1.00 per usable,
  median wall at most 600 s, every reviewed frame opened in at least 7 sessions). The 16 tuning
  briefs are reported with the same figures; they check that a round's change does not overfit the
  eight, and have no match line of their own.
- **How it runs**: `--build L2 --arms subscription --model claude-sonnet-5-5 --effort high
  --stage baseline --lanes 2 --out C:/claude/noacg-bench-archive/harness-ladder-L2/baseline`, the
  four ladder briefs first and then the 16 tuning briefs, judged with `--judge <dir>
  --delivered-only --concurrency 2`. L1's four screen cells and their readings are copied into the
  same directory, so `--tally <dir>` gives the eight and `--tally <dir> --order tuning` the 16.
  The committed evidence is `benchmarks/harness/ladder/L2/baseline/`.
- **Expected**, from L1: about half usable on the eight, at about $1.90 a session notional and
  about $3.75 per usable, every reviewed frame opened; the failures are design calls the look did
  not make (empty sample state, actions that change nothing on screen, faint or colliding text)
  and rubber stamps.

## Baseline result

Sessions 16:33Z to 17:31Z, two at a time, after the pre-registration was pushed (`ebd94dbb9` at
16:30:31Z); the ladder judge's readings 16:46Z to 17:41Z. Evidence: `benchmarks/harness/ladder/
L2/baseline/` (the 19 new cells and L1's four screen cells, every reading, `tally.json` and
`tally-tuning.json`); both tallies reproduce with `--tally benchmarks/harness/ladder/L2/baseline`
and `--tally benchmarks/harness/ladder/L2/baseline --order tuning`.

| set | delivered | usable | notional | per session | per usable | median wall | every frame opened | all ok, judge failed |
|---|---|---|---|---|---|---|---|---|
| the eight | 7 of 8 | **2 of 8** | $16.30 | $2.04 | **$8.15** | 527 s | 6 of 8 | 5 |
| 15 tuning briefs | 15 of 15 | **8 of 15** | $18.82 | $1.25 | **$2.35** | 249 s | 12 of 15 | 7 |

The judge agreed with itself on 20 of 22 judged graphics (3/3); the two at 2/3 are tuning briefs
(the sponsor strip, not usable, and the choir vote, usable). D6 on the eight: 2 of 8 usable (needs
7), $8.15 per usable (needs $1.00), median wall 527 s (holds), every frame opened in 6 of 8 (needs
7). `--tally` prints "screened out (the screen: cost)" because the first four cost $3.75 per usable;
that is D5's line for a rung, and a teaching round runs and counts all eight whatever it says.

Departures from the pre-registration: the bench refuses the bank's OGraf brief
(`third-party-ograf`, not a library graphic, its section 4.2), so the tuning set is 15 briefs, not
16 (`tuningOrder`). The first judge pass ran before the run had written `summary.json`, so the bench
took the exam's Fable judge for one reading of the hockey board ($5.32 notional, subscription); the
tally counts only the ladder judge's readings, and `--judge` now refuses a run whose phase it
cannot tell.

**What failed, on the eight** (the six not usable):

- *An action that draws nothing* (4): the matchup's Select and Lock and the scorebug's Next map
  (L1's screen), the quiz's Select and Reveal choice, the timing tower's Focus ("pixel-identical to
  the whole-field state"). Every one of those reviews said `ok` to those frames.
- *A design call* (1): the hockey board's crests on plates of their own, one nearly lost on its
  plate, and a goals-by-period strip with no team labels. The agent had opened 68 of its 81 frames.
- *Not ready* (1): the volleyball board ended `NOT READY` naming two problems it knew of (Undo
  below zero shows -1; sets kept inside the graphic, not on the panel) and fixed neither.

**On the tuning briefs** (the seven not usable): an entrance still running at 1.5 s that leaves
the debate clock's digits cut and a box empty; a font without the Vietnamese letters the market
reporter's name needs; text over text on the basketball scorebug ($3.36, 765 s, 117 frames); Undo
below zero and a Final that only pulses on the darts board; clipped text and an empty box on the
event bug; two design calls (the sponsor strip, 2/3; the winner card, which opened 12 of its 52
frames). Six of the seven reviews said `ok` to every frame.

**Cost.** In the sessions measured (the hockey board here; the scorebug and the nominee reveal in
L1) the frames the agent opened were 72 to 79% of its context's growth, about 2,860 tokens a
frame, 45 to 125 frames read a session; and about three in four reviewed frames are moments of a
timeline (20 ms to 10 s after the Take, an action, Next, the
update or Out). That is the cost lever for a later round (`coverage --strips`, held back on this
branch as `a6ea09595`, reverted by `b45c19a24`).

## Round 1: an action that draws nothing is a finding

**Hypothesis**, committed and pushed before the round's first session.

- **Which failure.** On the eight, the most common reason a Sonnet `high` graphic is not usable is
  an operator action that moves the graphic's machine but changes nothing on screen: the matchup's
  Select and Lock, the scorebug's Next map (L1), the quiz's Select and Reveal choice, the timing
  tower's Focus (this baseline; the judge calls the Focus frames pixel-identical to the whole-field
  state). The bench's action gate passes them
  (the button is on the operator surface) and so did every agent's review, which set `ok` on each
  of those frames: a frame that shows nothing new looks fine on its own. No look at one frame at a
  time can see it; it is a difference between two frames.
- **Which change** (CLI and skill only): `noacg coverage` now compares, moment by moment from
  20 ms to 10 s, each action's frames with the same moments without the press, from the settled
  Take and then after each other action that moved the machine (Reveal may need a Pick first).
  An action that moves the machine and changes fewer than about 40 pixels of a full-HD frame
  (0.002%) at every moment from every start is a finding, "shows no change on screen" (exit 1).
  The same moment rendered twice differs by none; a stopped clock's last digit by about 300. A
  change that shows and fades again (the darts board's Final, a pulse) counts as drawn: the
  check finds an action that draws nothing at all, not one that draws too little. The renders that decide it are
  compared, not kept, so the frames the review lists and the bench's capture (what the judge sees)
  do not change; only the capture's findings list can grow. `references/hand-in.md` says to fix a
  coverage finding and run coverage again before the review. Commit: the round's CLI commit on this
  branch, after this hypothesis. Tried on the baseline's own handed-in packages before any round
  session: it finds the tower's Focus (and Whole field, which has no focus to clear) and the
  quiz's Select, Reveal choice and Audience result, all with no pixel changed; on the hockey board
  and the darts board it finds nothing, the hockey Stop clock changing about 300 to 500 pixels.
- **What should move.** On the eight: the graphics failed for an action that draws nothing go
  from 4 (the matchup and scorebug in L1's screen, the quiz and the tower here) to at most 1, and
  usable from 2 to at least 4 of 8. On the 15 tuning briefs: usable does not fall. Cost: a session that gets the finding spends a fix and a second coverage,
  so the notional per session rises by up to a fifth on the boards, while the cost per usable
  falls because more of them are usable. This round does not try to reach D6's $1.00 per usable:
  at about $2 a session on the eight that needs a cheaper look as well (the held-back
  `coverage --strips`, the next round's candidate).
- **Refuted** if usable on the eight rises by fewer than 2, or if two or more of the graphics
  above still fail for an action that draws nothing. **Reverted** (D7) if it moves nothing: usable
  on the eight and on the tuning briefs unchanged and the cost per usable not lower.
- **How it runs**: build the CLI in this worktree, then `--build L2 --arms subscription --model
  claude-sonnet-5-5 --effort high --stage round-1 --lanes 2 --out
  C:/claude/noacg-bench-archive/harness-ladder-L2/round-1` on the eight in `RUNG_ORDER` and the
  15 tuning briefs, judged three times a graphic with `--judge <dir> --phase L2 --delivered-only`,
  counted with `--tally <dir>` and `--tally <dir> --order tuning`, as the baseline.

### Round 1 result on the eight (the 15 tuning briefs not yet run)

Sessions 17:44Z to 18:25Z, after the hypothesis (`05ca783bb`) and the change (`8d4fa88a0`) were
pushed; readings 17:57Z to 18:27Z. Evidence: `benchmarks/harness/ladder/L2/round-1/` (cells,
readings, `readings.json`, `tally.json`); `--tally benchmarks/harness/ladder/L2/round-1`
reproduces it.

| the eight | delivered | usable | notional | per session | per usable | median wall | every frame opened | all ok, judge failed |
|---|---|---|---|---|---|---|---|---|
| baseline | 7 | 2 | $16.30 | $2.04 | $8.15 | 527 s | 6 of 8 | 5 |
| round 1 | 7 | **4** | $16.32 | $2.04 | **$4.08** | 600.5 s | 5 of 8 | 3 |

- Usable went from 2 to 4 of 8: the alerts and the nominee reveal as before, and now the
  volleyball board (3/3; the gate's `undoPoint` read as offered by its `undo` button, which all
  three readings name as working, `readings.json`) and the timing tower (**at 2/3**, so by L1's
  rule not a gain to claim on its own). The cost per session did not move; the cost per usable
  halved. The median wall rose to 600.5 s, half a second over D6's line.
- The new finding reached three sessions (the matchup, the quiz, the tower; in their
  transcripts); the scorebug and the volleyball board also had a coverage exit 1, for other
  findings. Each of the five ran coverage again until it passed.
- What still failed: the matchup handed its record into the wrong folder (`../outputs` from the
  work folder) and counts as failed, though its Select is now drawn; the scorebug clips the
  descenders of a long name and opened 8 of its 69 frames (a stamp); the hockey board's Interval
  and Final now draw only a colour change, too little to read as a state ("draws too little",
  which the check by design does not catch); the quiz's last coverage passed, yet the bench's
  capture, with the brief's stress values, still finds Select and Reveal choice drawing nothing.
- Against the hypothesis: usable rose by 2 (refutation line: fewer than 2), with one of the two at
  2/3; the action-draws-nothing failures went from 4 to 1 on the eight (the quiz). Not refuted so
  far; the round's keep-or-revert waits for its 15 tuning briefs.
- Spend: $0 credit; 8 sessions $16.32 notional, 21 readings $36.61 notional.

A scan of `benchmarks/harness/ladder/L2/` and this file for every ladder brief's prompt opening
and stress values of eight characters or more finds no prompt; as in L1, the judge's reasons and
the cells' command traces quote a few short values (a name, a label), which L1 decided to keep.

### Round 1 result on the 15 tuning briefs, and the decision

Sessions 19:46Z to 20:13Z on 10-17 (six; two more were paused by the subscription's usage limit)
and 04:20Z to 05:00Z on 10-18 (the other nine, the two paused ones run again from the start); the
readings 04:21Z to 05:04Z. Evidence: the 15 cells beside the eight in
`benchmarks/harness/ladder/L2/round-1/`, `judgements.jsonl` and `tally-tuning.json`;
`--tally benchmarks/harness/ladder/L2/round-1 --order tuning` reproduces it.

| 15 tuning briefs | delivered | usable | notional | per session | per usable | median wall | every frame opened | all ok, judge failed |
|---|---|---|---|---|---|---|---|---|
| baseline | 15 | 8 | $18.82 | $1.25 | $2.35 | 249 s | 12 of 15 | 7 |
| round 1 | 15 | **8** | $20.93 | $1.40 | **$2.62** | 261 s | 11 of 15 | 7 |

- Usable on the tuning briefs did not move in count: the debate clock (its entrance now settles
  in time) and the basketball scorebug joined; the live vote (a wrapped option label over the next
  one after the update) and the cross-country clock (the brief's race name not shown at the sample
  values) left. The judge agreed with itself on 14 of 15.
- The new finding reached none of the tuning graphics' failures: none of them is an action that
  draws nothing. What fails there is design and content: the sample values air empty (the futsal
  winner card names no champion and shows 0-0; the cross-country plate shows only the time), text
  over text after the long update (the live vote), Undo below zero (the darts duel), a fallback
  font for the Vietnamese letters (the market reporter), logos each on a plate of another colour
  (the sponsor strip), and the event bug (below).
- **Decision: round 1 is kept.** It moved the eight (usable 2 to 4, cost per usable $8.15 to
  $4.08) and did not lower usable on the tuning briefs (8 to 8), the hypothesis's line for them;
  the tuning set's cost per usable rose 11%, inside the fifth the hypothesis allowed for a session
  that gets a finding. The round's refutation lines held: usable on the eight rose by 2, and one
  of the four action-draws-nothing failures is left (the quiz).
- **A bench artefact the tuning set carries in every round:** the youth summit event bug's stress
  keys are positional (`f2` is the logo), and the agent split day and room into two text fields,
  so the capture writes the logo's description ("dark: a dark green leaf ...") into the room text,
  where it overflows. The baseline's event bug failed the same way. It is the same in every round,
  so a round's change still reads against the last; fixing it now would move the tuning figures
  between rounds for a reason that is not the round. It is left for after L2 (an issue).
- Spend: $0 credit; 15 sessions $20.93 notional, 45 readings $52.71 notional.

## Round 2: a timeline is one picture

**Hypothesis**, committed and pushed before the round's first session, on round 1's base (kept).
D6's cost line for L2 is now at most $1.35 estimated per usable (owner, 2026-10-17; spec D6).

- **Which failure.** Cost. On the eight round 1 spent $2.04 a session, so even 8 of 8 usable
  would be $2.04 per usable, over D6's $1.35. A matching round must cut what a session costs by a
  third or more and keep what it delivers. The measured lever is the frames the agent reads: 72
  to 79% of a session's context growth (the baseline, above), each full-HD frame about 2,800
  tokens, and three in four of them moments of a timeline (the Take, an action, Next, the update,
  Out, at 20 ms to 10 s). Each frame opened is also a turn, and each turn re-reads the context so
  far.
- **Which change** (CLI and skill only): `noacg coverage --strips` draws each timeline as one
  picture of its moments, three across, each a third of the frame with its time under it (the
  held-back `a6ea09595`, brought back). New beside it: the state an action, a step or the update
  settles in is shown by no other frame, so its last moment stays a full frame of its own; the
  Take settles in the sample frame and Out in nothing, so theirs are not repeated. Static frames
  and the field crops at native pixels stay as they are. `references/hand-in.md` asks for
  `--strips` and says what a strip shows. The bench's own capture, what the judge sees, does not
  pass the flag and does not change. On round 1's hockey board this is 33 pictures to open
  instead of 81 (12 strips, 10 settled frames, 11 static frames).
- **What should move.** On the eight: notional per session from $2.04 to $1.45 or less, frames
  reviewed per session down by half or more, median wall down; usable not below round 1's 4. On
  the 15 tuning briefs: notional per session down by a quarter or more and usable not down by
  more than one. The cost per usable falls on both sets.
- **Refuted** if the notional per session falls by less than 15% on the eight, or usable on the
  eight falls below 3 (a third-size moment hiding what a full frame showed). **Reverted** (D7) if
  it moves nothing (cost per session down by less than 10% on both sets), or if usable falls by 2
  or more on either set: a cheaper look that misses defects is not a gain.
- **How it runs**: as round 1, with `--stage round-2 --lanes 2 --out
  C:/claude/noacg-bench-archive/harness-ladder-L2/round-2`, the eight in `RUNG_ORDER` and then the
  15 tuning briefs, judged three times a graphic with `--phase L2 --delivered-only`, counted with
  `--tally <dir>` (D6 as amended) and `--tally <dir> --order tuning`.
- **Amended before the round's counted sessions (05:20Z).** The round's first start (05:07Z) was
  stopped after five minutes, its two sessions discarded and its folder emptied: the session's
  prompt, like the real host's system prompt (`agents/noacg-harness/agent.md`), spells the
  coverage command out without flags, so one of the two ran coverage without `--strips` and the
  other with it. A flag the skill asks for does not reach an agent that follows its host's
  command line. So the strips are now `noacg coverage`'s default (CLI only, as D3 asks), with
  `--frames` for a frame per moment; the bench's capture passes `--frames`, so what the judge
  sees still does not change. Everything else in this hypothesis stands.
