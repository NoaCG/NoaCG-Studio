# Instruments against the picture

Section 3.5 of `docs/work-specs/noacg-harness/spec.md`: every time an instrument fires on a graphic
the critic, the judge or the owner called clean, or stays silent on one they called broken, the
disagreement is logged here with its frame and its resolution. Newest first. Frames live outside
the repository (named by their calibration id; `benchmarks/harness/judge/calibration.mjs render`
rebuilds them at zero cost).

## H6 (2026-10-15): tuning round 2

Instruments run: the bench's `noacg coverage --stress` capture, `noacg validate` and `noacg inspect`
on the four harness cells and three August A cells (`%TEMP%\noacg-harness\H6-round2\cells\`), the
agents' own coverage in the container, and the critic's answers. Pictures: the frozen judge, the
critic, and my own look at the frames named.

10. **`noacg coverage` never showed a long label in a `Label | value` lines field** (entry 8, issue
    #1246). Resolution: fixed in the CLI before the round (`cli/src/coverage.ts` `longer`): such a
    line grows its label, to at least 32 characters, and keeps its value. Seen in the container: both
    H6 live-vote authors' own Update frames show every option wrapping (`outputs/all/update-01500ms.jpg`:
    `Live on TV Live on TV Live on TV`, `Yes, keep the late kick-off Yes, keep the late`), where H5's
    read `52 Yes`. Neither delivered H5's overlap. No other cell of either round has such a field, so
    the fix changed no other brief's matrix.
11. **The Update strip drove different fields again on `live-vote`** (entry 9's check, done before
    any pair was judged). August A's Update sets its kicker; the harness's two cells set their
    options. Re-shot each way at 1,500 ms over video: August A with the brief's long options
    (`H6-round2\reshoot-live-vote.august-A-options-update-01500ms.png`: rows grow, nothing
    overlaps), and both harness cells with a doubled kicker (`reshoot-...managed-agents-kicker-...`,
    `reshoot-...managed-agents-v3-kicker-...`: the chip grows, nothing overlaps). No defect hides
    in the state either arm was not put in, so the pairs stand as captured. `news-lower-third` and
    `school-scoreboard` updated the same kind of field (a name) in both arms.

## H5 (2026-10-15): tuning round 1

Instruments run: the bench's `noacg coverage --stress` capture, `noacg validate` and `noacg inspect`
on the five harness cells and the five August A cells (`%TEMP%\noacg-harness\H5-round1\cells\`),
the agents' own validates in their traces, and the H2 entries re-measured at this sha
(`%TEMP%\noacg-harness\H5-instruments\`). Pictures: the frozen judge, and my own look at the frames
named.

6. **The bench's stress capture put brief values on the wrong fields.** `noacg coverage --stress`
   maps a brief's `f0`, `f1`... by position among the package's fields; the v1 briefs key them in
   one order and authored packages choose their own. On `live-vote` the harness's `long-video.jpg`
   showed the question as the only option row and the options as a raw `a|b|Third` string in the
   question slot; the judge called it not airable with four basic mistakes, all from that. The
   August A cell got the same swap (`long-video.jpg`: the question in its kicker, the pipe string as
   its question) and the judge passed it. `debate-clock` was swapped for both arms too (a speaker's
   name in the round label, `180` in a name slot; the judge noticed it on August A). Resolution:
   fixed in the bench. A brief may key stress by the words of a field's label
   (`benchmarks/harness/lib/pipeline.mjs` `stressFile`, written per cell as `stress.json` from
   `noacg inspect`); `live-vote` and `debate-clock` are re-keyed in `tuning/briefs.json`, and
   `live-vote`'s options value is now in the `Answer | number` lines both arms' packages read. The
   four cells were re-captured at $0 (the first frames kept as `frames.v1-positional`) and
   re-judged; the first answers are kept in `judgements.positional-stress.jsonl` and count for
   nothing. The other three briefs mapped onto the right fields in both arms (checked field by
   field). Re-judged, the harness's live vote still fails, now on a real defect: after an Update to
   the long options the first row wraps to four lines without growing and lands on the second
   (`update-01500ms.jpg`, seen). **For H8:** the sealed briefs key stress by position; read each
   cell's `stress.json` against its fields before the judge reads, and re-key or re-capture a
   wrong one for both arms alike.
7. **`bench-field-unpainted` fires on all four shipped poll designs.** `noacg scaffold --type poll
   --design ig02|ig11|ig12|ig13`, then `noacg validate`: "Field Bars (f0) ... reaches no pixels in
   ANY of the graphic's states" on every one, while their frames show the bars. The sentinel
   (`src/validation/fieldPaint.ts` `sentinelFor`) turns the number column of a `Label | 47` line
   into a text tag and the poll runtime skips a line without a number. The H5 live-vote agent
   checked the warning on the untouched scaffold, then changed its runtime partly to quiet it
   (lines without a number now show with an empty bar: harmless here, but the warning steered
   it). Resolution: a warning, it blocks nothing; the fix (keep a numeric cell numeric) is issue
   #1244, deferred past H7 because changing the validator between H5 and H6 adds a second variable.
8. **Did the contact sheets miss anything?** (H3's carry, not an instrument disagreement.) All five
   agents read their coverage as contact sheets they built with Pillow (0 or 1 coverage frames
   read singly; sheets of four at half size, or crops of the graphic's corner). The one basic
   defect the judge found (entry 6, the live vote's update overlap) is in a state the agent's own
   coverage never drove: in the container the agent runs `noacg coverage` without the brief's
   stress values, and the CLI lengthens a lines field by doubling the whole string, so its own
   update frame showed three short rows reading `52 Yes`, `33 No`, `15 Not sure`
   (`outputs/all/update-01500ms.jpg`, seen), never a long option. One graphic: not evidence that
   sheets miss what single frames show, nor that they do not. It is evidence that the agent's
   matrix (and so a critic reading it) does not exercise a long value in a lines field.

Entries 1 to 4 below, re-measured at H5's sha:

- **1 (count-up before it settles): closed for the exam.** The coverage of `aug:live-vote.C`
  shows 47, 28, 17 and 8 in every settled frame (1.5 s and the 10 s Take); only the Take strip,
  captioned with its milliseconds, shows the count in progress (`take-00600ms.jpg`: 30, 9, 17, 8).
  The judge reads coverage, so the H2 contradiction cannot recur there. Whether `validate
  --screenshots` should wait for a count-up stays a CLI question no H5 graphic raised (none counts).
- **2 (`bench-field-unpainted` on a reformatted value): stands, folded into #1244.** `debate-clock.B`
  still warns on Time A and Time B; it is entry 7's class (the runtime paints `180` as `3:00`). No
  H5 cell of either arm fires it.
- **3 (flag words only a flag state shows): not settled, no action.** No H5 cell carries the flag as
  fields with the warning: the August A board carries it as fields and fires nothing, the
  harness's board carries `goalA`, `goalB`, `clearFlag` and `final` as events.
- **4 (`bench-stress` on a line the stress frame shows whole): narrowed, folded into #1244.**
  Reproduced on `school-scoreboard.B`: the warning says the league line is cut by its mask, and
  `stress.png` shows it wrapped onto two whole lines. The shipped corpus is silent: `sb01` to
  `sb04` and the neutral scoreboard scaffold validate with no `bench-stress`. Limited to an authored
  mask; no H5 cell fires it.

## H2 (2026-10-14): the judge's calibration

Instruments run: `noacg validate --screenshots` (the capture of the August cells and their planted
variants), and `noacg validate --json` on the same 47 packages. Pictures: the owner's 2026-08-22
verdict (all airable), the planted defects (all broken by construction), the frozen judge.

1. **The capture showed a count-up before it settled.** `aug:live-vote.C`, `onair.png`: every
   percentage reads `0%` beside bars of different lengths; the owner's frame of the same sources
   (`agent-round-2026-08-22/cells/live-vote.C/final-shots/onair.png`) reads 47, 28, 17, 8. The judge
   refused it for the contradiction, correctly for the frame it was given. Resolution: open, owned by
   H5. The exam judges `noacg coverage`, whose Take is also shot 10 s later; before H5 counts a
   defect a judge found on a counting graphic, check the 10 s frame. Whether `validate
   --screenshots` should wait for a count-up is a CLI question for that round, with its
   measurement.
2. **`bench-field-unpainted` (warning) on a field that is painted.** `aug:debate-clock.B`, fields
   `Time A` (f1) and `Time B` (f3): "its value reaches no pixels in ANY of the graphic's states".
   `onair.png` shows both clocks painted as `3:00`: the runtime formats the seconds it is given, so
   the value never appears verbatim. This is the computed-value class of the 2026-09-07 entry in
   `docs/AI_ATTEMPTS.md`, which exempted a `noacg-data-source` holder with `ftype: "number"`; this
   agent-authored graphic declares neither. The owner aired it. Resolution: open, owned by H5. A
   warning, so it rules over nothing; an agent may still read it as a finding and "fix" a working
   field. Check the exemption against the shipped corpus and the August cells before changing it.
3. **`bench-field-unpainted` (warning) on words only a flag state shows.** `aug:school-scoreboard.D`
   (f8 "Full-time word", f10 "Goal word") and `aug:school-scoreboard.E` (f7 "Goal word"). These two
   cells carry the flag as fields rather than events (the August verdict's "three scoreboards with
   no buttons"), so no state the validator reaches may show the words, and these frames have no
   flag state to settle it either way. Resolution: not settled by the picture; recorded so H5 reads
   it before counting the warning.
4. **`bench-stress` (warning) on a line the stress frame shows whole.** `aug:school-scoreboard.B`:
   "#f0 is cut off by its mask .scoreboard-mask once every text value is doubled". `stress.png` shows
   the doubled league line on two whole lines, nothing cut. The owner aired it. Resolution: open,
   owned by H5: the bench's stress measurement and the screenshot's stress may not be the same
   moment or the same values.
5. **`legibility-contrast` warns, nothing blocks, at 1.15:1.** All 7 grey-on-grey plants
   (`plant:*:contrast`): the warning fires on every text ("reads at 1.15:1 against the surface
   behind it - under the 3:1 we recommend"), and `validate` reports them clean. The instrument agrees
   with the picture; only its weight differs from the rubric, where unreadable contrast is a basic
   mistake. The overlap and clipped plants are validator errors (`bench-overlap`, `bench-overflow`,
   `bench-stress`) in all 15. Resolution: no change in H2; the exam's basic-defect count comes from
   the judge, and a contrast-only finding at exam time is read from the picture.
