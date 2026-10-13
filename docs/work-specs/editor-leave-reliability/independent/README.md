# Independent leave-editor check

**FAIL product: a refused Discard erases the editor's Undo history.** Phase 3 must wait for a bounded repair and a fresh independent check. This checker changed no product code and opened no pull request.

## Reproduced defect

On merged PR #1131, product revision `1bfc1248cda50bdd91e880cc9e451b740cb1d974`, use the normal ZIP-import wizard, draw a rectangle, Save, and draw a second rectangle. Refuse the next IndexedDB write to `spx-gfx-project` with `QuotaExceededError`, then choose Home and Discard changes. The editor correctly stays mounted, Home stays absent, and the exact edited source is restored. However, command history changes from `{undo:1, redo:0}` to `{undo:0, redo:0}`. The user cannot undo the last edit after the refusal.

[Independent run 38472743447](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38472743447), disposable commit `6b8dbeb43abe45d8c8c145f8af66b440fca0121f`, fails `e2e/leave-checker.spec.ts:61` in the case beginning at line 53. [Exact failure](discard-failure.txt); the artifact retains the screenshot and Playwright trace. The failed assertion is retained unchanged in [ci-probe.patch](ci-probe.patch). The subsequent retry assertions did not execute because the history assertion failed.

Source cause: `discardCurrentGraphic` in `src/store/saveActions.ts` calls `openGraphicDoc` or applies a default before awaiting `commitDurableWrites`. `EditorSession.sync` clears its private command history on those foreign source writes; `activeEditorSession` also replaces a session when its baseline changes. Restoring the Zustand snapshot on failure does not restore that session history. Make discard transactional across the working slot and editor session, preserving source, history, selection and playhead on refusal. Keep successful discard and its cleared history unchanged. No repair was attempted by this checker.

## Evidence matrix

| Bounded criterion | Fresh result |
| --- | --- |
| Home/Open decision over editor; pristine editor; Cancel/Escape; cancelled naming; no delayed destination question | Pass in unchanged new-graphic-guard and independent cancelled-naming/different-destination case. |
| First/linked Save, durable reopen, duplicate-submit protection, library and production-copy preservation | Pass, including independent linked-save refusal, Escape, Undo/Redo, retry, same record ID and unchanged production snapshot. |
| Discard leaves no saved experiment; linked copy and reload preserved | Pass for successful discard, including signed-in account. Failed-discard history preservation fails as above. |
| Browser Back/hash and wizard navigation | Pass, including observed preview-frame first Back, actual top-level Back, Finish restoration, separate wizard regeneration notice, and mid-walk start-over then Back. |
| Signed-in cloud/source and saved-record separation | Pass in corrected run 38473741858. Exact hydrated cloud/source equality and raw saved-account record equality remain asserted. Cancelled naming keeps the experiment; discarding it creates no graphic record; reload has no delayed guard. |
| Pinned references | Two fresh lifecycle tasks pass. Studio native-source save/New/reopen and Eyevinn auto-save/switch/explicit Delete were executed. |
| Cumulative edit/text/animation/history/save/reopen/output and viewports | Four tasks pass, including desktop, laptop, real native 125% and nested interaction. Nine SPX/CasparCG/OGraf browser outputs execute with empty error lists. |
| Two sequential graphic exports | Pass in supplemental run 38474889496: the unchanged OGraf two-different-graphics case passes (11.9 seconds). The lifecycle failure stood down its original workflow step, so it ran separately. |

The main browser selection ran 73 cases: 64 passed, one failed, eight unchanged legacy-editor cases skipped (seven library cases and the old project-autosave case). No maintained spec, assertion, skip or timeout changed; no test-maintenance or budget exception was added. The two reference cases and four cumulative cases are separate passing steps in that same run. Browser tasks used one worker and zero retries.

## Account test correction and cleanup

[Passing account run 38473741858](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38473741858), disposable commit `6852d5d37`, ran one case in 35.1 seconds on ephemeral localhost Supabase and a synthetic account. The driver refuses a non-local backend. Teardown ran `supabase stop --no-backup` and confirmed shutdown at 21:56:38 UTC. No hosted account, backend, migration or security boundary changed.

The first account run, 38472748048, passed the preceding lifecycle assertions but failed the checker's final count because it counted every document kind, including the separately synced working-project slot. The correction filters `kind=graphic`, retaining the exact saved-record equality and the no-added-graphic assertion. It changes the checker commit, not the product. The first run also confirmed stack shutdown, at 21:51:06 UTC. The later cancellation request found that run already completed; it cancelled nothing.

## Rendering and comparison

Fresh desktop 1920x1080, laptop 1366x768, native-125, all three leave dialogs, the account dialog, both reference editors and the failure capture were inspected. Save, Discard and Cancel remain legible over the editor. Native browser zoom measured 1.25 before and after the task, with outer window 1366x768, content 1093x545, DPR 1.25, canvas 196px, timeline 180px and Properties 280px. Use `native-125.png` for the complete native content capture; Playwright's ordinary native-zoom screenshot is cropped. Fit artwork remains small and the inspector/timeline scroll; functional completion does not settle comfort.

[Source review](source-review.md) and [exact hashes](reference.json) record fresh Studio `3142fc7d02934494931eb14e7dc255393e4110d0` and Eyevinn `616841bd949e3a21137579451123f66c292543f0` clones. Studio's ten inspected files are byte-identical to official v0.17 source `a1e9776120fa19d9f3f9d40ab4b10ae1be034347`; CI hash-verifies the executed official Linux binary. Studio's New confirmation and separate autosave differ from NoaCG's inline Save/Discard/Cancel and named library. Direct Studio Open lacks the same dirty decision. Eyevinn saves creation/edits automatically, so removing an experiment is explicit Delete. No upstream AGPL implementation was copied. Upstream unit suites were read, not executed.

## Revision and verification limits

The disposable probes execute the exact product tree of `1bfc1248`; their only changes are test drivers and CI recipes. While they ran, unrelated SVG-runtime extraction PR #1136 advanced main to `4e4eb8b0c`. The docs-only checker branch was fetched and fast-forwarded to that main. The failing save/session/router files are byte-identical across those revisions. The fresh runtime receipts above describe `1bfc1248`, not an unrun claim for the later tree.

PR #1131 has all 11 E2E shards and every applicable check green. Its landed revision's configured, quarantine, Post-landing and deploy-verify runs passed; main CI status and the latest-main snapshot are recorded below. The pre-existing hosted-latency alarm #987 is separate from this new defect. No local browser, server, full build or full suite ran: measured free RAM was 2.10 GB, below the unchanged 4 GB browser floor. No checker-owned local test/server process remains. Pictures stay in the ignored local artifact directory; [hashes](captures.json) and CI artifacts make them checkable.

This is engineering evidence only. Owner acceptance, broader comfort, physical SPX/CasparCG/OGraf receiving hosts, hosted cloud-status behavior, loops, full projects, R2/R3 and the default switch remain outside the verdict.

Next task: repair refused Discard without invalidating the active editor session; prove the retained failure assertion and successful retry, rerun the bounded regressions, land through the queue, then launch the second independent check before Phase 3.

## Final check receipt

[Supplemental export run](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38474889496) at disposable commit `08822bf89` passes the unchanged `ograf-conformance.spec.ts:386` two-graphic case. [Run metadata](export-run.json).

At 01:06 Helsinki on October 14, [landed-main CI](landed-main-ci.json) still had full-suite shards running, with Build, Factory and catalog gates green. [Configured CI](landed-main-configured.json), quarantine, Post-landing and deployment checks for `1bfc1248` passed. Latest main `4e4eb8b0c` had green Post-landing/deployment checks, pending CI, and configured/quarantine checks running ([snapshot](main-snapshot.json)). This is a FAIL product verdict, not a green-main or phase-completion claim. Current jobs reported only the pre-existing #987 rolling alarm.

The docs-only review and simplification ran inline because the available review connector only reads CI and offers no review execution. Review cross-checked the fixed product SHA, probe diffs, every receipt, explicit skips and the failed assertion; simplification kept the repair instruction bounded. Targeted contract freshness/citations, docs index, client-secret and copy gates passed, as did whitespace validation. Verification remains FAIL for the observed product defect. No full local build/browser suite ran.

For reproduction, apply the recipe on a fresh disposable branch with `git apply --unidiff-zero docs/work-specs/editor-leave-reliability/independent/ci-probe.patch`. Dispatch `deploy-verify.yml` with `scope=focused` for the three independent adversarial cases, `complete` for the full bounded selection, or `export` for the two-graphic regression. Dispatch `configured-suite.yml` for the localhost account task. Never queue or merge this recipe.
