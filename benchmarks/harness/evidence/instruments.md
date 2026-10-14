# Instruments against the picture

Section 3.5 of `docs/work-specs/noacg-harness/spec.md`: every time an instrument fires on a graphic
the critic, the judge or the owner called clean, or stays silent on one they called broken, the
disagreement is logged here with its frame and its resolution. Newest first. Frames live outside
the repository (named by their calibration id; `benchmarks/harness/judge/calibration.mjs render`
rebuilds them at zero cost).

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
