# Post-landing transform verification

PR [#949](https://github.com/NoaCG/NoaCG-Studio/pull/949) merged through GitHub's queue on 2026-10-10 at 07:12:11 UTC as `0c355905f5f059a454daa802fdce221d32ac7616`. Issue #910 closed for its bounded transform qualification. This receipt is by the implementation session; it is not the required independent reference/main comparison.

## Observed results

| Check | Actual run | Verdict |
| --- | --- | --- |
| Final PR CI | [38032516408](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38032516408) | Passed, including all nine selected browser shards |
| Merge-group CI | [38033082368](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38033082368) | Passed; actual queue entry recorded at 07:03:04 UTC |
| Full main CI | [38033607115](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38033607115) | Passed, all ten full browser shards and catalog calibration |
| Configured suite | [38033607143](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38033607143) | Passed, authenticated local-backend suite and configured-quarantine job |
| Post-landing | [38033607164](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38033607164) | Passed |
| Deployment verification | [38033742486](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38033742486) | Passed, live revision and deployed-bundle route |
| Actual anonymous production transform task | [38034009971](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38034009971) | One named test ran, one passed, zero retries; 5.8 seconds |

The actual production task imported `riverlight.zip` through New graphic, created a rectangle through the canvas tool, unlinked Scale to set 150%/75%, relinked and typed 180%, then dragged the side. Result: 207.778%/103.889%, ratio 2:1. Undo returned 180%; Redo restored the exact visible value. It created a text box, applied a wrapping sentence, widened its side without changing the 48px font or 100% Scale, scaled its corner, typed 30 degrees and rotated another 30 with the knob. Save and reload retained the selected `#f2` and 60-degree rotation. The probe uses the normal No thanks control if optional analytics is offered. No development imports, seeded state, account or hosted records were used.

[Production task values](production-task.json) and [inspected render](production-task.png) record zero console/page errors and zero failed requests. The test asserted the live commit before and after the journey. Production reported `0c355905`, built at `2026-10-10T07:12:39.361Z`, with the same last deploy-affecting commit.

The local post-landing browser repeats (j-4180/j-4181) never started because the shared scheduler required 4 GB of free memory. They were cancelled rather than counted or run around the guard. The production task therefore ran on a temporary, non-landing branch `codex/editor-transform-production-probe`, probe commit `2a59ecfd7`, through a manual invocation of the existing deploy-verify workflow. That branch changed only the scoped probe/config/workflow, and never changed production or the permanent workflow. Read the job log: its inherited job title says "Deep link on the deployed bundle", but its actual command ran the bounded transform spec above. The deployment-status verification job was correctly skipped for manual dispatch; its distinct actual deployment verdict is in run 38033742486. The [exact probe patch](production-probe.patch) retains its executed source/config/workflow for reproduction on a fresh branch at the checked revision, with no credentials. The probe changes are not part of the receipt landing.

[Exact local job receipts](jobs.json) retain the earlier 24 existing canvas/typography/CLI cases, four final qualification cases, the ordinary dev-route task, static checks and native reference execution. Job j-4174 has a lost scheduler exit and is explicitly not counted; j-4178 repeated the affected gates successfully with exit 0.

## Still separate

[Issue #950](https://github.com/NoaCG/NoaCG-Studio/issues/950) tracks the required post-landing checker who did not implement the change. That checker must repeat the bounded task on fetched main and the pinned reference, recording matches, shortfalls and deliberate differences. No such independent verdict is claimed here. Paired live MCP, R1.5/default-switch and broader editor or receiving-host acceptance remain open in EDITOR_PLAN.md.
