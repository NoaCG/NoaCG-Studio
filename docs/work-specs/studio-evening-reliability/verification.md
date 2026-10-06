# Studio evening reliability verification

Development branch: `codex/studio-evening-reliability`, based on
`5b34aefb477c246b50180ad2357877dd5b040c42`, later reconciled with `origin/main` at `7878a4ef4`.
The owner authorized the feature-branch push and existing test workflows on 2026-10-06.
Corrected product commit `bdab14b66` is published; the branch is not merged or deployed.
This work executed no hosted database migration, studio server restart, studio configuration
change or CasparCG upgrade. Checks use isolated local development servers, mocked backend data,
an in-memory SQL engine and a disposable Docker Supabase stack with the limitations below.

Automated verification is complete on `bdab14b66`: first-attempt CI, the full guarded backend
suite, the local affected browser/catalog suite and the clean build pass. Review and
simplification ran inline; all 25 confirmed findings are fixed. Release verification remains
held for the actual media, recorded program audio and cross-device rehearsal. The receipts
below preserve earlier failures as well as their final passing replacements.

## Review and simplification

Review: inline over the scope printed by `scripts/review-request.mjs`. The supplied studio
photo was read as evidence and is excluded from the implementation commit.

Confirmed corrections during review:

1. Cue-only publication advances the adopted version even when its graphic digest stays equal.
2. A session change during tombstone cleanup cannot leave a stale cloud-saved claim.
3. A failed account-library flush/reload is returned as failure rather than an unhandled rejection.
4. Sequence-stop diagnostics retain the folder name after moving outside the cue list.
5. Rundown choices refresh after a library save while the production page remains open.
6. Picker refresh does not replace the library identity used by running monitor frames.
7. Expiry after an already confirmed cloud load preserves the recoverable view without showing
   an endless first-load state.
8. The phone header uses a compact preparation label so All out remains reachable.
9. Deferred cue/folder text flushes before account authoring pauses; folder settings, clipboard
   writes and a drag already in progress cannot continue account editing after expiry.
10. Imported runtime code beside the SPX definition is validated without rewriting its HTML;
    the same safety checks cover it, and the UTF-8 code budget counts it once.
11. Cue menus suppress assigned cue keys while preserving existing transport-key behavior.
12. The combined publish/check action opens its status results, including partial-save failures.
13. Persisted shortcuts accept Shift with letters only, matching the assignment UI.
14. Inline module scripts meet the same JavaScript safety screen; only classic scripts supply
    the SPX runtime globals. A fixture first reproduced the module-screen gap.
15. Packs and wizard sets use the complete publication preflight before creating any rundown.
    The oversized-pack regression first failed because installation returned no error.
16. Pre-publish guidance distinguishes browser graphics from native CasparCG cues. The video
    regression rendered a completed Take through the fake Bridge beside the incorrect promise
    that Takes stayed on this page. Corrected the displayed scope without changing transport.
17. The save notice no longer covers wizard, consent or recovery controls. Its measured height
    reserves space on desktop and phone, including wrapped recovery actions.
18. Configured playout, timed-cue and teammate tests use the unified readiness button instead
    of the removed Publish button.
19. Cue-field metadata preserves the readiness stamp and adopts its version without navigating
    the output; the configured acceptance test now requires that behavior.
20. The anonymous expiry test requires no automatic modal and an explicit, usable sign-in door.
21. An unpublished production no longer supplies its old version to the combined action.
    The new network-owned regression first reproduced refusal to publish again without reloading.
22. The configured publish wording test checks the combined action's accessible name.
23. Mock-account seeds wait for their cold library-rebinding boot before interaction assertions.
24. An active check waits for metadata version adoption even when the prepared graphic digest
    matches. Otherwise its Presence request could disappear before the renderer received it.
25. Cloud confirmations flush only an unsaved cue draft, then release it after a successful
    write. Repeated confirmations cannot advance publication timestamps or replace landed
    teammate values. A refused write retains the draft; same-tick edits are visible to the flush.

Simplification: inline. Kept existing playout adapters, durable storage, team compare-and-swap,
production eligibility, shared keyboard transport and capability-protected panel relay. Removed
the duplicate check-again action, avoided model-to-validation dependencies, and retained the
stable rendering library separately from fresh picker choices. The 512 KB limit is unchanged.

## Acceptance evidence

| Criterion | Development evidence | Remaining sign-off |
|---|---|---|
| Pending cloud state and expiry | Browser rehearsal covers pending debounce, paused authoring, retained working edits and durable team outbox across reload/account switch. | Student's actual account, home browser and time window have not been provided; historical writes are not reconstructed. |
| Fresh cloud reconciliation | Configured backend mocks and account-library tests cover first-load state and isolated account scopes. | Two actual devices and test accounts during controlled rehearsal. |
| Timing and Space/Out | Pure timing tests and existing clip/folder browser flows cover frozen/invalid positions, fades, Space modes and Bridge restart. Explicit clearing is independent of ownership. | The problematic original and two working originals are still missing. No file-specific cause or physical fix is claimed. |
| Stable diagnostics | Browser rehearsal compares every row ID/top/height before and after an unidentified producer; explicit slot CLEAR removes it and its queued media. | Real Bridge/server rehearsal. |
| Attached and independent audio | Existing browser sound tests plus shared-cue rehearsal; independent native effects use their own slot and leave video/selection intact. | Recorded ATEM program audio from the installed HTML producer, channels 1 and 2. Host support remains unverified until recorded. |
| SVG and eligibility | Browser rehearsal preserves painted definitions, strips oversized non-rendering metadata, flags off-canvas text, and refuses an oversized rundown draft. Existing import/export tests exercise the shared gate. | Actual corrected Illustrator delivery artwork review. Known quiz cause is not reopened. |
| Unified readiness | Readiness tests and browser flow cover publishing/checking, cue-only adoption and deferred asset preparation while on air. | Actual receiving output and controlled studio rehearsal. |
| Direct cue shortcuts | V/F restart independent effects with the next question selected; typing, duplicates, reserved keys, removed bindings and held-key repeats stay quiet. Companion module tests cover the same fixed cue-ID verb; isolated SQL/API/Realtime delivery passes. | Actual Companion panel rehearsal and receiving host. |
| Stronger cue colors | Windows and Linux desktop baselines at 1920×1080 and 1366×768 were rendered and inspected; rehearsal screenshots show full-row colors, route badges and V/F bindings. | Operator judgment on the actual studio display. |

## Checks

- Focused pure checks: `node --test scripts/readiness.test.mjs scripts/studio-reliability.test.mjs`,
  18 passed. Earlier focused playout/panel/audio/preparation checks also passed.
- Inline-script validation, graphic sound, readiness and studio reliability pure checks: all
  25 passed. TypeScript and focused ESLint checks passed after the compatibility corrections.
- Companion: 30 tests passed, TypeScript build passed, lint passed. No module publication.
- Mutation proof: removing the hotkey repeat guard only in the test's intercepted module response
  made the held V test fail with 7 effect takes instead of 1. The unmutated test passes.
- Focused browser recovery run `j-3392`: 159 passed, 48 skipped, 2 failed. Both failures were
  reproduced and corrected (a stale picker and an incomplete published-output test fixture).
- The initial broad run `j-3385` failed (94 failures); product files changed during that run.
  It is not a passing verdict and is superseded only by final checks on frozen sources.
- Windows baseline update `j-3395`: all 6 passed; every changed frame was inspected.
- Final picker/quiz/phone/geometry regression run `j-3400`: all 33 passed. The account-paused,
  diagnostic-panel and phone screenshots were inspected and retained in `built/`.
- Expiry/folder regression run `j-3402`: 73 passed and the new transport test failed because
  hash-only navigation had not run its fake Bridge init script. After correcting the fixture,
  `j-3407` passed all 9 studio rehearsals, including pending cue/folder text and Space/Out while
  authoring is paused. Bridge settings are device-local; the fixture failure was not account scoping.
- Build `j-3393`: 2,448 active gate tests passed, TypeScript/lint/Vite/architecture passed;
  its final line-ending check failed on a test-generated reference artifact. Restored those
  generated references before the final build.
- Frozen broad run `j-3408`: 1,428 passed, 542 skipped and 5 failed; all 35 catalog checks passed.
  Three failures exposed the import/menu/result compatibility gaps above; two used the removed
  republish test selector. After correcting behavior and updating those assertions, `j-3409`
  passed all 61 active import, rail, production, output-setup and studio tests (21 skipped).
- Stopped `j-3410` and `j-3411` deliberately during final review rather than change sources
  under their browser runs. They are not verdicts. The oversized-pack reproducer `j-3412`
  failed as expected; after the shared preflight correction, all 32 studio/kit/pack browser
  checks in `j-3413` passed. TypeScript and focused ESLint also passed.
- Frozen final affected browser run `j-3414`: all 1,433 active tests passed, 542 skipped (33.9 minutes).
  All 35 separate catalog checks also passed (5.0 minutes). Catalog emission remained identical
  for all 528 designs against 528 baseline entries.
- Rendered sweep wrapper `j-3415` failed before running a sweep: its IPv4 readiness probe could
  not reach the local dev server, which answered on localhost via IPv6. Read-only probes confirmed
  localhost returned HTTP 200 and IPv4 refused the connection. Corrected the temporary wrapper;
  no application source changed for this correction.
- Replacement rendered battery `j-3418`: text floor (526), overflow (528), field coverage (526)
  and numeral stability (349 applicable designs) reported PASS; catalog browser checks passed
  35/35 and render-baseline checks 4/4; factory passed 317/317. Field coverage retains its stated
  exemptions and undriven field types. The queue reaped the wrapper as dead with no final exit
  code during cleanup, so the job itself is not recorded as green. The local server was confirmed
  closed afterwards. Its dependent `j-3419` never ran; final guard proof was queued independently.
- Final menu-guard proof `j-3422`: removing only the custom cue-key menu guard failed the backward
  assertion with 4 effect takes instead of 3. Restored the exact original keyboard source bytes
  and SHA-256, then all 15 studio/output-setup rehearsals passed (44.8 seconds); wrapper exit 0.
  The final shortcut dialog and readiness-result screenshots were retained and inspected. The
  latter visibly distinguishes successful publication from an account-default save failure.
- Clean build `j-3423`: exit 0. All 2,452 active gate tests passed, 3 skipped (2,455 total),
  along with TypeScript, full ESLint, architecture, Vite, prerender, client-secret scan and
  the final line-ending check. Only verification-result prose and a trailing blank line in
  the unexecuted SQL file were adjusted afterwards; executable code was unchanged.

SQL migration 0077 was statically reviewed and checked by repository migration-tool tests.
The overnight preparation also executed the exact file in an in-memory PostgreSQL engine;
see the limited evidence below. It has not been executed against a hosted database. Browser
mocks and the local dependency fixtures do not prove the real Supabase relay.

## Overnight preparation, 2026-10-05

- Fetched current `origin/main` (`7878a4ef4`) and merged it locally without conflicts at
  `20715d255`. The new editor work shares no changed product file with this reliability patch.
  Combined-state integration `j-3431` passed: 1,202 active tests, 416 skipped (33.8 minutes),
  plus all 35 catalog checks (3.1 minutes). Its six Windows baselines and all nine new studio
  regressions passed. Four fresh studio frames were inspected before the catalog phase cleared
  its output directory. The dependent build `j-3432` was cancelled while waiting to allow
  generated research captures to be retained separately and restored first.
- Corrected the pre-publish wording after that rendered review. Existing status tests passed
  9/9 and focused browser run `j-3438` passed 15/15 (37.1 seconds). The updated diagnostic frame
  was inspected and retained in `built/`; rundown geometry remains unchanged. Focused ESLint
  passed. Final affected run on frozen sources `j-3441` passed: 1,202 active tests, 416 skipped
  (29.8 minutes), followed by all 35 catalog checks (3.1 minutes), wrapper exit 0. Generated
  research captures were preserved in the ignored evidence folder and their committed bytes
  restored, including a line-ending-only JSON change, before the clean build.
- Clean build `j-3446`: exit 0. All 2,457 active gate tests passed, 3 skipped (2,460 total);
  TypeScript, full ESLint, architecture, Vite, prerender, client-secret scan and final line-ending
  checks passed. The separate 321-test gate suite also passed. Three unrelated sound-demo frames
  generated by browser checks were retained separately and restored. Only result prose changed
  after this build; the tested executable sources stayed frozen.
- [Local relay runner](evidence/panel-relay-local.mjs): 14 behavior checks passed on each of
  PGlite 0.3.15 / PostgreSQL 17.5 and PGlite 0.5.8 / PostgreSQL 18.3. The unchanged 0073 and exact
  0077 files ran with their call self-checks. Logs: [Postgres 17](evidence/panel-relay-local-pg17.log),
  [Postgres 18](evidence/panel-relay-local.log).
  Before 0077, the direct-cue verb was refused; afterwards, anon can relay it, legacy take-cue
  still works, private helper/table privileges stay closed, only permitted fields are forwarded,
  invalid/foreign presses are refused without sends, unknown/revoked keys and unavailable pages
  are refused, and the burst cap/re-execution checks pass. No hosted connection or ledger write.
  The first run stopped on a 15-character page-ID fixture; correcting it to the required length
  made the runner pass. No product SQL was changed.
- This SQL evidence uses a minimal prerequisite schema, controlled feature/crypto dependencies
  and captured `realtime.send` calls. It does not establish full deployed-schema compatibility,
  PostgREST authorization, real Realtime delivery, production Postgres-version compatibility or
  concurrent lock behavior. The real isolated Supabase backend requirement remains open.
- [Read-only deployed-schema metadata](evidence/backend-schema-readonly.json) confirms PostgreSQL
  17.6, the expected relay prerequisites, the existing definer/search-path/grant boundary and
  that the deployed relay does not yet accept trigger-cue. No application rows were read or
  written. Migration SHA-256: `E2EC1AFF70D572FDCD931BEA51AF88ED126C443FE8A0F1FAFB011F11D7476C6B`.
- Local infrastructure inventory: only a stopped Docker Desktop WSL distro, no usable Linux or
  native Postgres runtime, no saved local Vercel Sandbox credentials, and no existing Supabase
  preview branch. No local database/container services were started. Inspection found the repository's
  opt-in preview guard and disposable local Supabase workflow provide a CI-only test path.
  The guard returned skip for this non-main branch without its preview opt-in marker. The
  production migration/release/issue side effects are main/tag guarded. Configured relay coverage
  now tests actual delivery of both trigger-cue and legacy take-cue. CI/stack/Linux checks are
  pending until their receipts are recorded below. Automatic approval review rejected the
  first feature-branch push before execution, citing source export/external CI without explicit
  authorization. After the owner explicitly approved this branch and its test workflows, the
  direct origin push succeeded and the workflows were dispatched on `cc2d27fb1`. No indirect
  upload was attempted. The original three media files remain missing.
- Static migration privilege/collision checks: 15 passed after the SQL fixture/default grants
  were aligned with the read-only deployed catalog. Focused ESLint and Node syntax checks pass.
- Local Companion prerelease package: tools 3.1.1 bundled the already verified compiled module
  for Node 22, with manifest validation and license policy intact. Archive paths and bundled JS
  syntax pass; it is not installed or published and has not run in Companion. The first attempt
  met an esbuild sandbox parent-directory read denial; the permitted local retry exited 0.
  Local ignored archive: `companion-module/noacg-studio-rehearsal-b76d238.tgz`, 81,189 bytes,
  SHA-256 `B7124D78628A1DA81D2F1D359B99089D9A7E7EA2409DE701A931F6F756642FCD`.
- Prepared [tomorrow's rehearsal checklist](rehearsal-checklist.md), with database, expiry,
  malformed/stale-command and Linux work assigned to the agent. User steps require the supplied
  isolated test build, original files, two devices and the off-air studio/ATEM route.
- Linux screenshot workflow [37387085907](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37387085907)
  passed all 6 captures (32.8 seconds) on `cc2d27fb1`, using the same Ubuntu/Chromium setup as CI.
  All six downloaded frames were inspected before replacing the Linux baselines: graphics-only,
  mixed and folders at 1366×768 and 1920×1080. Whole-row colors, route/state badges, selected
  folders, transport controls and editor layout remain legible at both sizes. The pink blocks
  deliberately mask moving monitor content and clocks. No Windows frame was relabelled as Linux.
- Initial branch CI [37387066039](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37387066039)
  completed on `cc2d27fb1`: 1,196 browser tests passed, 416 skipped, and exactly 6 failed on the
  old Linux playout baselines. All other browser checks passed, including the nine studio
  regressions. Build passed with 2,452 active gate tests / 8 platform skips and 231 active CLI
  tests / 18 skips;
  factory passed 317/317 and catalog calibration passed 35/35. The six inspected replacement
  baselines are recorded in the next verification phase; check that phase's CI gate before landing.
  Vercel's actual commit status says "Canceled by Ignored Build Step". No preview was deployed.

## Additional authenticated verification and UI correction

- Replacement Linux CI [37391651702](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37391651702)
  passed on `ff6bcf7a1`: all ten browser shards, Build, Factory and catalog calibration completed.
  The six recorded Linux baselines pass. This predates the notice layout correction below.
- Initial real isolated Supabase run
  [37387084551](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37387084551) applied all 77
  migrations and passed schema/grant/publication assertions and seven relay delivery tests.
  It hit the 40-minute cap before completing the full suite. API/Realtime relay behavior was
  observed, but the complete guarded backend verdict is still required on the corrected tip.
- Focused [37391668621](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37391668621) completed
  on the same product/test code: 9 passed, 6 failed, 2 skipped. Two anonymous clicks were blocked
  by the full-width save notice. Four failures were stale expectations for the removed expiry
  modal, removed Publish button (two tests) and cue fields invalidating prepared readiness.
  The subset deliberately fails the unchanged full-suite minimum. Its temporary trace command
  was restored exactly before the final normal run; timeout and skip/count gates stay intact.
- Local notice reproductions `j-3459` failed on the same two intercepted clicks. The fix reserves
  the notice's measured wrapped height, including on phone scroll pages and the full-screen
  wizard. Analytics/storage notices sit above that space. Recovery remains outside the account
  authoring gate, readable and operable. Desktop and phone frames were inspected. `j-3463`
  passes 11/11, including actual clicked export/consent controls, measured separation, cloud
  acknowledgement removing the reservation, and phone recovery controls above the strip.
- Configured tests now use Publish & check readiness, require cue-only readiness to remain valid
  and require v2 adoption without an output navigation. Their later receipts below distinguish
  the actual adoption defect from these corrected expectations.

## Corrected product verification

- CI [37393800289](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37393800289) passed on
  `82e1f69ad`. All ten browser shards, the combined report and CI gate passed. Build passed
  with 2,452 active gate tests / 8 platform skips, the separate 321/321 suite and 231 active
  CLI checks / 18 skips. Factory passed 317/317 and catalog calibration passed 35/35.
- Local affected run `j-3464` completed with exit 0: 1,460 browser tests passed, 542 skipped,
  plus catalog calibration 35/35. The wider stylesheet scope selected 2,002 browser tests.
  Its 25 generated research/sound captures were retained in the ignored evidence folder and
  restored before the clean build; a Windows line-ending metadata false positive was cleared
  while proving the indexed geometry content still matches HEAD.
- Clean local build `j-3465` completed with exit 0: 2,457 active gate tests, 3 skips and the
  separate 321/321 suite; TypeScript, full lint, architecture, bundle, prerender, secret scan
  and final line-ending checks passed. Product and test sources were unchanged during it.
- The normal full backend run
  [37393801898](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37393801898) hit its unchanged
  40-minute cap on `82e1f69ad`. Account/settings flows, phone consent/export, library arrival,
  readiness faults, seven real private relay cases and ordinary playout status passed. Four
  tests failed before the cap: live preparation, persistent production links, timed-cue recovery
  and signed-in publish wording. This partial run is not a clean backend verdict. Focused
  diagnosis on unchanged product/test sources is collecting their exact assertions; its subset
  must fail the unchanged full-suite minimum.
- Local republish reproduction `j-3466` failed with the production still unpublished after the
  second press. The corrected regression passed in `j-3467`, alongside 16 other checks. That
  run and an unchanged rerun `j-3468` exposed short mock-account cold-boot waits on different
  startup pages. The bounded boot wait is now 30 seconds; interaction assertions stay unchanged.
  Final focused run `j-3469` passed all 18 checks in 40.8 seconds. No failing run is recorded
  as a passing suite.
- Focused backend diagnosis
  [37397674432](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37397674432) completed on
  unchanged `82e1f69ad` product/test sources: four failed, two skipped, zero passed. It confirms
  the republish defect, removed timed-cue selector, old publish wording and v2 being stamped while
  the renderer still held v1. The last condition was reproduced by the new pure adoption test
  before correcting `outputSettled`. All 34 focused readiness/version checks then passed.
  The workflow command is restored exactly; the next run uses the full normal suite and guard.
- Correction `9ae6c5037` is published. Full configured run
  [37398871977](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37398871977), CI
  [37398866012](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37398866012) and local affected
  run `j-3470` used these frozen executable sources.
  CI Build has passed: 2,453 active gate checks / 8 platform skips, separate 321/321 checks,
  and 231 active CLI checks / 18 skips. Factory and catalog jobs passed. Shard 1 failed in
  the unchanged editor-pen fixture while seeding a template: its execution context disappeared
  during page navigation, before the editing assertions. That exact test passed locally in
  `j-3470`. All other nine shards passed. Branch CI does not automatically retry shards;
  `gh run rerun 37398866012 --failed` started attempt 2 on the identical commit. GitHub reran
  all ten shards and their prerequisites; all passed, including Build, Factory, catalog,
  combined report and CI gate. Vercel confirms "Canceled by Ignored Build Step".
- Local `j-3470` passed with exit 0: 1,461 browser checks / 542 skips, plus catalog 35/35.
  All eleven studio regressions and seven publication/setup checks passed. Its 25 generated
  captures were retained under the ignored evidence directory and restored afterwards.
- Full backend `37398871977` completed its unchanged guard: 76 passed, two failed, zero flaky,
  ten allowed skips (78 executed, above the unchanged minimum 71). Republish, timed recovery,
  publish wording and v2 metadata adoption now pass their earlier failure points. The remaining
  live-prepare failure saw an unexpected v4 on rechecking unchanged v3; its retry saw the
  production's timestamp move after a library-only edit. The three-member team test twice saw
  Cleo's open page retain the earlier text while the database held Ben's update. The downloaded
  traces confirm Cleo continued polling heads, so this is not explained by a hidden tab.
  These are failures, not a clean backend verdict.
- Local `j-3471` reproduced the repeated clean-draft write: the confirmation changed the already
  saved cue's timestamp. Clearing accepted drafts made all 19 focused checks pass in `j-3472`.
  Further regressions force two confirmation flushes in one tick and refuse/recover a browser
  write. `j-3473` passed all 20 studio/publication checks in 45.8 seconds. The correction keeps
  a dirty draft for same-tick Take and for retry after refusal, but clears it after acceptance.
  ProductionPage also stays mounted on the Data tab, explaining how a retained draft can
  continue interfering with team reconciliation. Full corrected backend verification is required.
- Final fault-clock fixture `j-3474` passed after preserving/restoring Date's descriptor in the
  isolated test realm; TypeScript and focused lint passed. Correction `bdab14b66` is published.
  CI [37402512539](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37402512539) passed on the
  first attempt: all ten browser shards, combined report, CI gate, Build, Factory and catalog.
  Build passes 2,453 active gate checks / 8 platform skips, the separate 321/321 suite and
  231 active CLI checks / 18 skips. No retry job ran; Vercel confirms its ignored-build cancellation.
  Full backend [37402521872](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37402521872)
  passed on the same commit: 78 passed, zero failed, zero flaky and ten allowed skips (18.7 minutes).
  The normal guard passed with its unchanged minimum of 71 executed tests and unchanged skip
  allowlist. All migrations, schema/grant/auth checks and seven private relay cases passed in
  the disposable Supabase stack. Both the live preparation and three-member reconciliation
  failures pass after the dirty-draft correction. No hosted database was touched.
  Local affected run `j-3475` passed with exit 0 on these frozen executable sources: 1,463
  active browser tests / 542 skips (29.2 minutes), then catalog 35/35 (3.1 minutes). All thirteen
  studio regressions and seven publication/setup checks passed. Its 25 generated captures
  were retained under the ignored evidence directory and their committed bytes restored.
  The successful full backend report was also downloaded and retained there.
- Final clean local build `j-3476` passed, exit 0: 2,458 active gate tests / three skips (2,461
  total), TypeScript, full lint, architecture, Vite, prerender, client-secret scan and final
  line-ending checks. Executable sources were unchanged from `bdab14b66`; only verification
  result prose was updated afterwards. The refreshed review scope is the same 124 files against
  current `origin/main` at `7878a4ef4`, including the uncommitted supplied photo as read-only evidence.

## Rollout hold

Do not queue-merge: landing runs production migrations/deployment automatically. Complete the
receiving-host/copied-production and cross-device rehearsals in the existing owner queue, and
compare the three originals first. The full guarded isolated-backend suite and recorded Linux
baselines pass. Retain the working application, Bridge and studio configuration for rollback.

Release verification remains incomplete. Record a failing check stamp until the
actual-media/receiving-host/cross-device gates pass.
Passing development checks do not authorize the production deployment path.
