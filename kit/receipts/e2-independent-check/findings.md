Independent E2 check on actual merge `d8b18080bfacf2303a1d88e4ca1398fb263d9657`, first parent `fb04bbd9658857318e4b954611b6dd08a4815e9d`. Accepted worker `/root/editor_r15_e2_cloud_check`, native session `6af45f8f-6140-8191-8e0f-97a9d72a705b`. Fresh checker context; I did not build or repair E2. Product, tests, repository notes and supervisor state are unchanged.

**Disposition: **PASS for E2's two criteria**, with the preserved unrelated aggregate CI red accepted through the existing procedure in the [coordinator's recorded disposition](https://github.com/NoaCG/NoaCG-Studio/pull/2374#issuecomment-6796352748). No E2 product defect remains in this check.**

I read the immutable `f0f2e3fe:docs/work-specs/editor-r1-5/spec.md`, E2 phase notes and failure history, PR evidence/reviews, editor plan/register requirements B07/B13/B14, E11/E19, D02/G05, the current verification procedure and known traps. Both acceptance criteria have technical evidence in **BL: qualified browser preview and exported fixtures**. Criterion (a)'s loop authoring, ruler, boundary/lifecycle and preservation requirements and criterion (b)'s browser/export parity, state-exit stop, repeatable settle and supported live-speed continuity all passed at this merge. The CI exception is explicit rather than an assumed green.

Worker/window/network preflights passed after the required disposable workspace IO ran with approved shell permissions. This worker measured four CPUs/16 GiB and two browser workers; hidden cgroup ancestors remain explicitly unobserved. Dependencies were linked only after identical lock hashes (`62dd0fe872965d011d1b30433f28ee547475dd08bf1309bbd569b0733214df4c`). Browser work used the existing queue and five-minute caps; no full local suite or production build was run.

**Own exact-merge evidence**

- `node --test scripts/editor-loops.test.mjs scripts/ograf-timed-exit.test.mjs`: **33 passed, zero failed/skipped**. The 28 loop cases use bundled GSAP and explicit expected samples; the five manifest cases include canonical styled timing.
- **j-0005**, `npm run test:e2e -- e2e/editor-out-step.spec.ts`: **14/14 passed in 48 s**, two workers. This includes the pre-existing Out cases and all four loop journeys.
- **j-0008**, disposable independent probe: **PASS** in Chromium 149.0.7827.55. I chose unequal X/opacity key extents, range 0.2–0.9, phase 0.95 (already in the return pass), delay 0.15, and two extra yoyo passes. The expected values were calculated by hand, without the product sampler. UI checks ran at 1920×1080 and 1366×768; I inspected both captures. Each of SPX, CasparCG, OGraf and single HTML matched 13 forward plus 13 reverse samples; single HTML was opened over `file://`. No page errors or bad app network responses were recorded.

| Required loop subcriterion | Exact-merge observation |
| --- | --- |
| Property repeat | Node finite-property case held both sides of the delay/restart, extended the cue to 2.1 s and held its terminal X=100. |
| Property yoyo | j-0005 authored the property loop independently of opacity, sought it both ways and restored composition. |
| Layer repeat | j-0005 applied common settings to X/opacity with unequal key times in one undo; undo/redo and saved-source readback matched exactly. Flat siblings did not widen the selection. |
| Layer yoyo | j-0008 applied the independent odd-pass fixture through visible Whole layer controls. Both tracks kept their distinct key extents and reached [90,0.8] at the terminal sample. |
| Independent local ruler | In j-0008 local probes left composition at 0.400 s and unrelated score Y=40. Local zero was [90,0.8,40]; one 25-fps frame was [90,0.74,40]. |
| Composition restoration | Return to composition and closing Edit loop both restored [70,0.5,40]. j-0005 also checked Outline/Assistant handoff, Play parking, and atomic history/save/reopen. |
| Deterministic forward/backward seek | j-0008's 26 samples per export agreed, including preactivation 0/0.1999, the 0.95 seam and 0.9501 after it, and terminal hold. Node samples independently covered document speeds 0.5/1/2; the SVG browser case checked the effective frame nudge at speed two. |
| Activation and authored range | Before 0.2 the independent fixture held [10,0.2]; at activation its phased return pass painted [90,0.8]. Node checks refused invalid ranges, invalidating key writes, unsupported moving channels and unrepresentable timing without a partial write. |
| Phase and delay | The chosen 0.95 phase consumed the first pass and part of the return pass. Explicit delay samples [0.85,10,0.2] and [0.95,10,0.2] agreed forward/backward. Node coverage included finite phases after the first waveform. |
| Finite boundaries | Three passes minus phase produced a 1.65-s finite cue and 1.45-s local ruler; its terminal pose held after completion. Maintained coverage verified derived flags, unchanged next-cue local keys and mixed legacy/ranged endpoints. |
| Hold | j-0005's indefinite loop continued through finite entrance Hold; its finite sibling reached its endpoint. The timed overlay and both timed OGraf routes completed their subsequent Out. |
| Interruption and finite Out | j-0005 covered live-pose exit, unreached reveals, inherited loop ownership and public styled Stop. j-0008 exited from [40,0.35] with no dispatch jump, reached [-15,0.175] at the midpoint and hid the root at the finite 0.4-s exit end. |
| Repeated Out and replay | j-0008 retained the same active exit on repeated Stop, then replayed to [50,0.35]. Node/public browser cases retained advancing styled exits and restarted one-cue self-entry correctly. |
| State-exit writer retirement | j-0005 checked Next and old-writer non-interference in every browser route. Node cases checked direct/styled exits, both parallel-channel write orders, main Out ending shared dispatch, and old timer callbacks after replay. In j-0008 advancing the retired loop could not overwrite the Out midpoint. |
| Repeatable settling | j-0005 produced two identical snapshots [90,1,130] on all five routes. Node cases settled from different previous playheads to the same finite endpoint without arming timers. |
| Supported running speed continuity | j-0005 checked 2×; j-0008 checked a live 0.5× child using a fixed GSAP root origin. X stayed 30 at the change and became 40 after another physical 0.1 s, while independent opacity became 0.35. Node cases retained timer endpoints at 3.85 s/1.30 s for 0.5×/2× and the authored hide wall time. |
| Browser/export parity | j-0005 exercised simulator, SPX, CasparCG, OGraf and single HTML, plus timed overlay and real-time/offline OGraf. j-0008 independently repeated four exported routes with its different finite-yoyo fixture and identical expected results. |
| Preserved source and fields | j-0005 saved/reopened exact HTML/CSS/operator fields, original keys and source sentinel, with atomic undo/redo. j-0008 independently compared HTML/CSS/fields and its JS sentinel after the visible loop edit. |
| Legacy motion and exact interpreter ownership | Node checks matched the frozen E1 interpreter SHA-256 `141e1f264ab80a20acec26cc64e9563cf234d1dbc21ea278d9089a1b2a39035c`, composed group/anchor capabilities, left unrelated legacy source unchanged, retained keys after removal and refused custom interpreter bodies. Existing legacy Out cases passed in j-0005. |

**Exact-merge Actions**

All listed runs were read on this SHA and observed to terminal state in a background monitor; all are attempt one. No replacement branch dispatch or manual test rerun was used.

| Run | Conclusion |
| --- | --- |
| [43017886013](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43017886013), merge-group CI | Success; required CI gate passed. |
| [43020316776](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43020316776), push CI | **Failure retained**: shard 15's one debate-clock failure below. Build, Factory, Catalog, the other 14 shards, combined report and CI gate passed. Workflow-owned follow-up passed; it does not erase the red shard. |
| [43020316884](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43020316884), configured-suite | Success: all 64 selected specs across four stacks, 155 tests passed, zero failed/flaky; three skips accepted by the unchanged expected-run policy. The existing configured quarantine spec passed. |
| [43020316943](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43020316943), Post-landing | Success. Logs confirmed both databases already held all 112 migrations; nothing pushed. |
| [43020316849](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43020316849), Quarantine | Success; existing quarantine/release accounting retained. |
| [43020697824](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43020697824), deployed verification | Success; live version matched this merge and landing/editor routes answered; both deployed deep-link browser cases passed. |
| [43020316213](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43020316213), Push on main / CodeQL | Success for all three analyses. |

Deployment-status runs 43020398472, 43020335990, 43020336221, 43020335493 and 43020332177 were terminal **skipped** under the workflow's event filter. They are not counted as successful deployments; the actual Vercel deployment run above supplies that proof. Push CI's configured selection explicitly deferred full configured execution to `configured-suite.yml`, whose independent run is listed above.

**Preserved red and its reach**

Original failure: [job 130521736183](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43020316776/job/130521736183), `output-debate-clock.spec.ts:292`, helper `aThenB` line 140: expected clock B ≤260, received 302 after its unchanged 20-s bound. It failed **before the Snap action**, while preparing two backdated Switch rows. The exact first-parent control [43012236592/job/130494580107](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43012236592/job/130494580107) executed this case and passed all 200 shard cases. CI's own [130530591862 follow-up](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43020316776/job/130530591862) passed all 24 cases on the same merge, making this a recorded flake. After-gate job 130531951186 opened [quarantine PR #2382](https://github.com/NoaCG/NoaCG-Studio/pull/2382); no assertion, timeout, threshold, selection or exception was changed here.

I traced the actual path: `output/main.ts:854,907–936` applies `speakingClockRowEffect` before sending the event at `rowInstant`; `matchClockWire.ts:668–680` banks A and stamps B; `debateFloor.ts:108,232–252` consumes the event time. These output, wire and design files are unchanged. Transitive emitter/composer reach was checked separately, not assumed from unchanged callers:

- **j-0012** independently bundled exact parent and merge Git graphs, called the failing fixture's actual `catalog.variantById('dc01').create({})` route, then composed the output `liveControl:true` / program-sound document. The real main/floor/penalty machine was present.
- Actual HTML (5,409 bytes), CSS (13,436 bytes) and JS (135,457 bytes) were exactly equal. JS SHA-256: `e103ead49e65ffa7672bdfe31abaf151b639d3625f7cef27a535b92df9459b6e`.
- The composed `spx-template-js` scripts were exactly equal: 135,534 bytes, SHA-256 `21e42164d3315b35e21d1146e5954000c5e8ec3d827e7e62ef2ed502f7c79d4c`.
- The only different composed script was `spx-live-control`: one added `typeof win.noacgSettleCue === 'function'` branch before the unchanged finite-end fallback. Both actual documents observed `noacgSettleCue` and `noacgFiniteEnd` as undefined and carried no loops. That changed branch is inactive; the legacy fallback is identical. Parser/migration/emission differences therefore did not change this graphic's prepared runtime.

The [coordinator's disposition](https://github.com/NoaCG/NoaCG-Studio/pull/2374#issuecomment-6796352748) explicitly accepts the actual CI gate under known-traps' unrelated-red/quarantine route, while retaining aggregate CI **FAILURE**. The [canonical incident #2238 recurrence](https://github.com/NoaCG/NoaCG-Studio/issues/2238#issuecomment-6796353219) records the affected coverage gap and 2026-11-25 repair due date. [PR #2382's acknowledged repair owner](https://github.com/NoaCG/NoaCG-Studio/pull/2382#issuecomment-6796281993) is the active coordinator through its normal queue and terminal results. Mechanical quarantine remains pending at this check's last read; no quarantine pass is claimed to repair the clock defect or restore blocking coverage. This phase acceptance neither changes that duty nor awards another repair allowance.

**Failure history and scope**

My j-0006 disposable probe incorrectly treated a finite parent's shifted local clock as physical elapsed time after a child rate change. The fixed-root control reproduced X=40 with the original expected value unchanged. j-0007 then exposed an OGraf setup mistake: a second `playAction` advances an active graphic; the fresh rate measurement now explicitly Stops first. Both receipts and scripts remain retained. j-0011's scratch immutable-source loader refused a JSON module; its log is preserved and the corrected loader supplied j-0012. The earlier direct-design controls j-0009/j-0010 are not substituted for the catalog route.

All historical PR failures and allowances remain, including styled metadata 3/3. Nothing here retries or weakens a maintained failed test. Raw evidence and captures are in `/workspace/scratch/e2-check-1111/` for the coordinator's existing kit. Prior source-head review A, Codex, CI/configured and Cloud61/UI receipts were read critically and not substituted for the new merge probes.

This is E2 browser/fixture acceptance only. E1 and October's one-active-tab/single-device scope remains. Studio 0.17 j-5193 is source-specific comparison evidence, not whole-editor parity or device/host acceptance. Native zoom, first-user, receiving-host and owner-release decisions remain in their assigned phases. No product defect was found in E2's checked loop behavior; active coordinator retains the quarantine/PR repair duty.
