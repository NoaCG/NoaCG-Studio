# Laptop helper receipts

Non-gating checks the laptop helper runs on the owner's Windows laptop (spec.md §9.1), each on
the exact merge SHA of the phase whose `extensions.md` row names it. Speed bench output is in
`../perf/`. A regression is reported as an issue titled
`production-page run: <phase> <check> regression`, never only here.

| Receipt | Row | Merge SHA | Result |
|---|---|---|---|
| [channel-test.md](channel-test.md) | - | - | test receipt |
| [../perf/phase-1-baselines.md](../perf/phase-1-baselines.md) | 3 | `0ca774269` | two speed baselines, local and published; they agree within §7 |
| [c7-casparcg-obs-walk.md](c7-casparcg-obs-walk.md) | 14 | `44bfa8955` | ticker, schedule, standings and credits through CasparCG/Bridge and OBS; one older defect filed (#1618) |
| [../perf/phase-11-repeat.md](../perf/phase-11-repeat.md) | 22 | `08389cfc1` | speed repeat after the liveCue move; every gesture within §7 against baseline 1 |
| [h0-1-companion.md](h0-1-companion.md) | 2 | `995272d56` | Companion guide on Windows in about 30 s; Take and Out on CasparCG, OBS and vMix; AC-8 p50 243 ms, over 192, not attributed |
| [../perf/phase-13b-repeat.md](../perf/phase-13b-repeat.md) | 24 | `a56e14119` | speed repeat after the cue draft move; every gesture within §7 after the 24-round rerun of the published Take RPC |
| [../perf/phase-14-final-repeat.md](../perf/phase-14-final-repeat.md) | 25 | `dda88db51` | final speed repeat; every gesture within §7 against baseline 1 |
| [row-25-casparcg-obs-walk.md](row-25-casparcg-obs-walk.md) | 25 | `dda88db51` | C7's four boards again through CasparCG/Bridge and OBS, same result; #1618 still reproduces; the Bridge slot recovers after a Bridge restart, not after a CasparCG restart (Empty, Load) |
