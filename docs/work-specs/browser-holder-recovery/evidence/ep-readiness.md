# EP readiness evidence - 2026-09-14

Initial context: assigned task; root AGENTS.md; browser-holder-recovery/spec.md and work.json; work-specs/README.md; [docs/backlog/e2e-webserver-hang-blocks-the-machine.md](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/e2e-webserver-hang-blocks-the-machine.md); e2e/AGENTS.md; orchestrator/specs.md; check and queue-merge adapters/workflows. Dedicated clean branch codex/ep-browser-readiness at a24bfce0, worktree C:/Users/ahonemi/.codex/worktrees/pilot-ep/NoaCG-Studio. Local npm ci completed before browser execution; allocated port 5242.

## Reproduction before changes

Temporary config imported the production offline Playwright config and replaced only the owned server with a Node HTTP fixture, readiness cap 3000 ms and fixture safety globalTimeout 15000 ms. Commands ran through npm run queue, each with outer cap 2 minutes.

- j-1066: server accepts HTTP without responding. Existing webServer cap correctly failed: `Timed out waiting 3000ms from config.webServer.` This does not reproduce the historical missing-timeout claim.
- j-1067: fixture answered the first readiness GET, then left subsequent GET pending. Server PID 20912 started at 1789406866387; request 1 at 1789406866411; request 2 at 1789406868118. Actual blocking phase: offline globalSetup fetch, after successful webServer readiness. Fixture safety reported `Timed out waiting 15s for the global setup to run` and `Timed out waiting 15s for the teardown for plugin setup to run`. PID 20912 was absent afterwards. No production readiness edits preceded this measurement.

AC-3, AC-4 and AC-5 remain open and assigned to successors. This evidence is neither authenticated coverage nor reproduction of the historical 126-minute incident. No acceptance ledger edited.

## Recovery and implementation

A usage-limit interruption ended the native turn after the initial edits. Resumed the SAME task identity and owned worktree, retained all seven changed files, and confirmed no fixture process or listener at 5242/5243 before continuing. No duplicate worktree/worker was launched.

Offline and catalog now start Vite with `--host 127.0.0.1`; configured/live does the same while retaining its explicit port and strictPort. Their base/readiness URLs and offline guard use 127.0.0.1 with the existing allocated port. The two e2e origin filters that depended on localhost were updated; agent/relay loopbacks and hostname-classification fixtures are unrelated and remain unchanged. Normal Vite developer defaults, port allocation and dual-stack occupied-port detection are untouched. All three normal webServer caps remain 60000 ms.

The real missing wait was the offline guard, which runs after webServer readiness. Both its readiness GET and AI configuration GET now have a 10000 ms abort signal. The latter covers JSON body consumption as well as response headers and reports its own phase. The existing browser `finally` closes the guard browser on rejection. There is no scheduler, process-kill or job-state change.

## Queued acceptance and focused verification

The committed `scripts/e2e-readiness.config.mjs` imports the normal offline config/globalSetup and replaces only the server with `scripts/e2e-readiness-fixture.mjs`, a 3000 ms fixture webServer cap and a 45000 ms fixture safety globalTimeout. Production guard timeout is not overridden. Invoking this via `npx playwright test` is recognized by the existing command matcher (`invokesE2e` returned true), so no unregistered browser-driving route was added. All acceptance jobs used the existing `npm run queue`, in this same worktree, with outer caps of two minutes for expected failures and five minutes for passing smokes.

- j-1068: root guard probe failed with `Offline guard readiness probe timed out after 10000ms`. Fixture PID 33912. No safety-globalTimeout diagnostic.
- j-1069: following same-worktree offline editor smoke passed, 1 test, Playwright 16.6 s. It loads and edits Monaco while external CDN requests are blocked, exercising the new origin filter.
- j-1073: AI response-headers fixture failed with `Offline guard AI configuration probe timed out after 10000ms`. Fixture PID 27724. No safety-globalTimeout diagnostic.
- j-1074: incomplete JSON response-body fixture failed with the same phase-specific 10000 ms timeout. Fixture PID 3776. No safety-globalTimeout diagnostic.
- j-1075: following same-worktree export package regression passed, 1 test, Playwright 12.0 s. It exercises the other updated origin filter.
- `node --test scripts/e2e-readiness.test.mjs`: 4/4 passed. Loads all three actual configs, checks address/port agreement, retained 60-second caps/reuse behavior, offline pin consistency and configured environment separation.

Discarded batch: j-1070/1071/1072 were incorrectly given explicit cost 0.5, which allowed overlap under the existing budget policy. j-1070 collided at bind; j-1072 adopted the fixture and reset when it ended. None is acceptance evidence. All exited naturally; both ports were checked free before the corrected full-cost serialized j-1073/1074/1075 sequence. This was an execution mistake, not a scheduler defect or authorization to change its policy.

After the corrected sequence, `node scripts/port-probe.mjs 5242 5243` returned both false. A fresh Win32_Process query found no matching fixture, Playwright or Vite Node processes for this worktree; only the normal shared jobs runner remained. Fixture PID identity is tied to its startup timestamp in the retained logs, not to an indefinitely trusted PID. No process was manually terminated. The root failure occurs before Chromium launches, so the j-1068/j-1069 release scenario has no unobserved fixture browser descendants.

The shared runner polls every 5000 ms. Recorded queue delay is reported separately from job runtime in ep-readiness-jobs.json; wall runtime includes npm/Playwright startup, guard queue checks and teardown. The original j-1067 printed both 15-second setup and teardown messages, but its recorded total runtime was 16.708 s: those messages must NOT be summed into an invented 30-second measurement. j-1069 briefly waited for the normal 4 GB RAM allowance before starting; none of the accepted failures reached its outer queue cap.

## Parent boundary

`node scripts/work-spec.mjs status docs/work-specs/browser-holder-recovery/work.json` returned `status: open`, 5 open criteria and `convergence review missing`. This worker writes evidence only, never either acceptance ledger. AC-1/AC-2 have direct slice evidence; the independent parent review still has to accept it. AC-3/AC-4 are unimplemented here; AC-5 still requires actual post-landing work-spec/wave-tick observations, EQ dispatch and independent integrated review. The coordinator owns those observations after this slice lands.

Configured endpoint wiring is checked, but no authenticated/configured backend suite ran. No production/auth/account or owner-acceptance claim follows from offline tests. The historical 126-minute incident remains unreproduced.

Cleanup snapshot, read from the live machine at 2026-09-14T17:37:58.576Z (Node process commands matched fixture names or this worktree's Playwright/Vite, excluding the probe itself; isPortBusy checks both loopback families):

```json
{"fixtureOrBrowserRunnerMatches":[],"ports":{"5242":false,"5243":false}}
```

## Check workflow scope and modes

`node scripts/review-request.mjs` resolved codex/ep-browser-readiness against a24bfce0aeb058807017c21fa308e1cb7b7d7da6 and exactly 13 changed files: the three Playwright configs; offline guard; the offline and public-service specs; three new e2e-readiness scripts; this evidence receipt and its jobs JSON/log; the dated owner-queue item. Compared against `git diff --name-only` plus `git status --porcelain=v1`; scope matched. All changes were reviewed in this worktree.

- review: inline. No dedicated review capability was exposed in the native tool inventory, so the documented inline path covered correctness, timeout/error propagation, ownership, configuration/environment separation, and the assigned AC-1/AC-2 outcome. No remaining code defect found.
- simplify: inline. No dedicated simplify capability was exposed. Existing port allocation, queue and Playwright ownership are reused. No new abstraction or scheduler path was needed. Clarified that body abort error names can vary; the signal determines timeout identity.
- taste: not applicable. No graphic rendering, UI layout or product visual output changed.
- `node scripts/relay.mjs read --branch codex/ep-browser-readiness`: no relay.
- `node scripts/owner-receipts.mjs --serves codex/ep-browser-readiness`: owns no receipt and changes none. The original backlog ask remains open for parent completion; this slice does not delete it.

- verify: inline, passed. `npm run build > build.log 2>&1` completed with its own exit code 0, recovered from original execution session 26364 after the second usage-limit pause on 2026-09-15. The build ran 116 test files / 1638 tests: 1637 passed, 0 failed, 1 skipped, then TypeScript, ESLint, dependency checks, Vite bundle, 502 prerendered pages, client secret scan and after-build line-ending checks. The four new endpoint tests ran in that build. The build stamp identifies this worktree/branch; code was still uncommitted at a24bfce0ae when built. No code changed after that build, and no passing test was repeated on recovery. Existing bundle-size advisory remained non-fatal.

Second recovery again retained the same native identity and worktree. A fresh process query found no matching owned Node process. The coordinator owns landing observation and the subsequent diagnostic slice; readiness completion does not promote parent acceptance.
