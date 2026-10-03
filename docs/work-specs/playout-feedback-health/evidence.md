# Verification: relevant playout health

Product/test revision: `4e2c4e6a30238a52c5c35f8542a0267f23e79a4b`.

## Acceptance evidence

- Browser-only history with stale paired settings omits Bridge and slot faults. A missing browser output retains its existing output warning. The readiness helper skips the irrelevant connection.
- Successful Put on air at either existing action door records the addressed server/slot. Disconnection and reload retain the warning even beside an OBS output. Successful Take off clears intent; an older `/state` reply cannot restore it.
- Browser graphics with server media require Bridge health but omit the unused graphics-slot fault. Mixed browser/CasparCG engines and expected CasparCG names retain both signals.
- Publishing still snapshots the same payload and assets and sends the same preparation request. The panel explains automatic host asset checks and safe version movement, with the optional Check readiness action describing command delivery checks.

## Checks

- `node --test scripts/playout-status.test.mjs scripts/prepare-live.test.mjs scripts/readiness.test.mjs`: 32 passed.
- Final product build, queued job `j-3104`: exit 0; 2,419 Node tests, 2,416 passed, three existing skips; TypeScript, ESLint, dependency rules, Vite/prerender and bundle checks passed.
- First preservation run `j-3095`: 50 existing Bridge/output readiness/output preparation cases passed. The new fixture initially failed because backend configuration was absent; it now uses a network-only backend stand-in. No production backend data was touched.
- Corrected regression `j-3100`: passed. It exercises both existing air actions, disconnect/reload, mixed media, narrow-screen overflow and the stale-read race.
- Mutation `j-3102`: removing only the synchronous stale-read guard produced the intended failure, "an older slot reply must not restore intent after Take off". The received value was the old CasparCG target. Production source was not mutated; network fixture injection supplies the timing window.
- Local `test:e2e:affected` selected 1,904 tests and sprint-focus selected 817. Jobs `j-3103` and `j-3107` were cancelled to keep local verification proportional; neither is claimed as a pass. Final focused preservation run `j-3111`: all 51 cases passed (1.5 minutes), including on-air version isolation, failed preparation, automatic version movement, command ping and image-load faults.
- Backend/publish/Presence verification uses the existing configured workflow on a disposable local Supabase stack: [run 37150640019](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37150640019). The run stores its verdict, report and configured screenshots as artifacts. At record time, stack/schema/account setup passed and the suite was running. Local Docker was unavailable; the configured workflow provisioned and authenticated its throwaway account successfully.

## Review and simplify

The initial delegated review found two confirmed races: remembering settings from an earlier render rather than the actual air command, and an in-flight slot read restoring intent after Take off. Both were fixed. An expanded 15-file delegated pass was clean. Final exact-scope review is inline after test-fixture additions; no further product defect found. The reviewer follow-up could not run because the native agent-thread limit was reached.

Simplify ran inline over the same diff: one target helper and one successful-action handler serve both existing action doors; no new mode or output protocol was introduced. Published/on-air isolation code is untouched.

## Limits

Actual CasparCG 2.3/2.5 hardware and a real studio deployment were unavailable. Bridge behavior here is simulated. Configured backend coverage is reported separately from real playout hardware. These checks do not claim production or owner acceptance.

## Rendered result

Inspected [desktop](evidence/browser-health-desktop.png) and [390px phone](evidence/browser-health-phone.png) captures from final job j-3111. Publish/asset/version copy and the secondary readiness action are readable; buttons remain aligned and within the narrow panel. The phone assertion found no horizontal overflow. Setup starts folded for browser-only health. The existing consent banner is visible behind the panel; it is outside this change.

