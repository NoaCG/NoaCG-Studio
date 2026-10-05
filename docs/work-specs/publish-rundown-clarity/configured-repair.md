# Configured fixture repair after Publish setup

Why: post-merge configured run 37248006050 reported four failures while the full main CI, merge group and deployment verification passed. The panel fixture presses first Publish without answering its chooser on a fresh account. The signed-out team assertion treats the generic card menu as a team door, although it now also serves local duplication.

Goal: bring the existing configured walks through the approved setup flow and assert the actual team boundary.

Non-goals: no runtime playback, panel protocol, auth policy, routing or production data changes; no skipped assertions or reduced checks.

Decisions: reuse the shared publish helper. Signed-out menus may offer Duplicate production but must offer neither Share with a team nor team membership controls. Update comments explaining that boundary.

Acceptance:

1. With no remembered default, the panel fixture completes first Publish, pairs and answers the real panel relay, and retains duplicate/stale press and clip-clock assertions.
2. With a remembered default, the same helper publishes without requiring a chooser.
3. Signed-out users can open the generic card menu and see Duplicate production; Share with a team, member controls and Join a team remain absent. Signed-in team checks remain intact.
4. Build, affected browser coverage and the configured failure set pass, then the complete configured CI suite is green.

Reproduction: j-3359 reproduced the signed-out menu count mismatch. Panel walks passed in j-3358 against the throwaway account with a remembered default; an uncommitted Auth GET response override removes only that default to reproduce the fresh-account chooser without changing account metadata.

Verification: j-3360 reproduced the CI panel failure with the exact Not started/data-started=false signature under the temporary empty-default response. j-3361 passed all four failure cases with that response and the repaired helper. The temporary response override was then removed; it is not part of the landed change.

Final local verification: j-3362 passed all four cases against the real throwaway account with no response override. j-3363 (`npm run test:e2e:affected`) passed 1,424 browser tests, with 542 existing skips and zero failures, plus all 35 catalog checks. The shared helper change conservatively selects the complete browser suite.

Inline review found no further defects. Simplification reuses the existing Publish helper and changes no runtime behavior. The complete configured CI verdict and exact-tip build are recorded in the follow-up pull request before queueing. Physical receiving-host checks remain on the existing studio rehearsal item.

Browser fixture follow-up: branch-push CI 37252166043 failed once while `seed` was returning from its combined model-write/navigation evaluate. Its trace contains one document load, no Vite reload, and the production already rendered. Playwright rewrites non-JavaScript protocol errors into the navigation diagnosis, so the underlying CDP cause remains unproven. The queue was withdrawn rather than accepting the rerun as a repair. j-3365 passed the isolated case; j-3366 passed all six scenarios twice with tracing and no retries, without reproducing it.

Supporting decision: return the persisted production ID before changing pages, then open its URL through Playwright. This keeps renderer mounting outside the data-setup evaluate and verifies the saved production through a fresh page. No protocol-error catch, duplicate mutation retry, timeout increase or assertion removal is introduced. Acceptance: all six setup/compatibility/color scenarios still pass, including shared-route cancellation and badge independence; the CI browser gate must pass before queueing again.

Authenticated CI 37252169470 passed at 7fa5bcee: 78 passed, zero failures or flakes, 10 existing allowlisted skips. This used a fresh isolated Supabase stack and both test accounts. Its configured fixtures are unchanged by the later offline setup refinement. The predecessor PR CI 37253586140 also passed all gates independently, but is not used as proof of the later fixture change.

Changed-fixture verification: j-3367 passed all six scenarios three times (18 checks) with tracing, one worker and zero retries. All existing assertions remain. The exact final build and fresh browser CI verdict are required before requeueing and are recorded in the PR.
