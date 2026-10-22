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
