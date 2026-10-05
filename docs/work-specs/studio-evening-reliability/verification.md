# Studio evening reliability verification

Development branch: `codex/studio-evening-reliability`, based on
`5b34aefb477c246b50180ad2357877dd5b040c42`. This branch has not been pushed or deployed.
This work executed no hosted database migration, studio server restart, studio configuration
change or CasparCG upgrade. Checks use isolated local development servers, mocked backend data
and an in-memory SQL engine with the limitations recorded below.

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
| Direct cue shortcuts | V/F restart independent effects with the next question selected; typing, duplicates, reserved keys, removed bindings and held-key repeats stay quiet. Companion module tests cover the same fixed cue-ID verb. | Companion relay migration executed only in an isolated test database before rollout; actual panel rehearsal. |
| Stronger cue colors | Windows desktop baselines at 1920×1080 and 1366×768 were rendered and inspected; rehearsal screenshots show full-row colors, route badges and V/F bindings. | Linux baseline recording on an isolated runner before landing. |

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
  still pending until their receipts are recorded. Automatic approval review rejected the
  feature-branch push before execution, citing source export/external CI without explicit
  authorization. No remote branch or CI run was created, and no indirect upload was attempted.
  The original three media files remain missing.
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

## Rollout hold

Do not queue-merge: landing runs production migrations/deployment automatically. Complete the
receiving-host and copied-production rehearsals in the existing owner queue, run the relay checks
against a real isolated Supabase stack, record Linux baselines, and compare the three originals
first. Retain the currently working application, Bridge and studio configuration for rollback.

Release verification remains incomplete. Record a failing check stamp until the real isolated
Supabase API/Realtime checks, Linux baselines and actual-media/receiving-host/cross-device gates pass.
Passing development checks do not authorize the production deployment path.
