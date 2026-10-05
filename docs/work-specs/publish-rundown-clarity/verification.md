# Verification: Publish setup and rundown clarity

Baseline: sound PR [#702](https://github.com/NoaCG/NoaCG-Studio/pull/702), origin/main ec70567a7e50705342890a32acf4a167ce9a5538. Its finished sound tip 44f17d94 is contained by main; the earlier playback phase alone was not used as the dependency.

## Acceptance evidence

| Criterion | Evidence and result |
|---|---|
| 1: Publish, cancellation, remember and failures | `publish-output-setup.spec.ts`: empty choice, disabled confirmation, unchecked remember, cancel with no writes; failed publication does not save a default; successful retry with failed metadata saving remains published, then Retry saves the default. Passed in j-3347. |
| 2: Account, origins and legacy preservation | The same spec checks account switching, duplicate inheritance including legacy absence, fresh import ignoring foreign setup, and legacy cue/content/capability equivalence across republish and restart. `configured/publish-output-default.spec.ts` passed against real Auth in two browser contexts in j-3348: SPX default, automatic next Publish, Settings Ask every time, then empty chooser/cancel. Test-only records and original preference were cleaned up. |
| 3: Named destinations and inert setup | Shared profiles use the existing output URL/SPX wrapper. Override checks leave publication writes, account default and Bridge playback actions unchanged. SPX offers Download SPX template. Actual capability URL unpublish/republish check passed in configured production-links (j-3346). |
| 4: Relevant diagnostics and complete readiness | Pure output/status/prepare tests passed (25/25). Renderer names/global studio config alone do not imply managed CasparCG. Selected managed output/native cues require diagnostics; orphan definitions cannot be ready; a ready browser cannot substitute for the managed server slot or the second destination. Untagged instances explicitly remain uncertain and playable. Real-backend live-prepare passed (j-3346). Legacy recorded activity/disconnect/restart coverage passed (j-3347). |
| 5: Consistent add actions and PNG | Footer and menu share definitions, help and disabled state; browser tests exercise library/new graphic/image/server/folder entries at desktop and phone sizes. PNG batch creation, reload and upload copy warning passed in focused production coverage (j-3340). Server transfer was not added. |
| 6: File routing and folders | Existing defaults are retained: configured media channel, still/movie layer 10, audio layer 5. Two-reference confirmation/cancel for channel and layer, Channel 1 change, and fresh reference without highlight passed (j-3347). Folder play-through route and existing playback commands passed in j-3341. No per-cue route migration. |
| 7: Presentation | Six Windows rundown snapshots were deliberately regenerated in j-3347 and all inspected: graphics/mixed/folders at 1366x768 and 1920x1080. Type uses a small second line inside the existing 34px row; route badge and accent are separate. ON AIR/PVW, selection and clashes remain dominant. Copy/paste/reorder/reset and narrow layouts passed (j-3347). CSS respects existing theme variables; emulated light/dark host preference was exercised. The application currently supplies one dark theme, so a separate light application theme is not claimed. |
| 8: Sound and quality chain | Focused sound/control/production sound cases passed in j-3340. Full affected browser coverage and unit/build gates passed, including the inherited sound cases. See the verified phases below. |

## Review and simplification

Inline review covered the review-request scope against the main merge base, including the Auth account/token boundary, pending versus absent output metadata, failure/retry state, duplicate capability removal, cue copies, additive payload/presence fields, destination and managed-server readiness, shared-route confirmation, effective folder badges, CSS state priority and changed browser fixtures.

Earlier review and rendered verification corrected captured account handling, profile comparison independent of diagnostic IDs, managed-slot readiness, orphan file diagnostics, Enter propagation in shared-route confirmation, imported first-cue highlights, modal autofocus/gating and type text competing with names. Simplification removed a redundant JSX wrapper only. Established playback paths were not consolidated.

The first broad browser run overlapped a build/source edits and produced HMR-related failures plus old fixture labels. Those results are not counted as a passing final suite. Focused repairs retained command/render assertions and did not add skips or loosen playback expectations. The configured default test initially used an obsolete Settings entry; its corrected rerun passed in j-3348. Existing historical/editor skips remain existing skips.

## Physical checks still required

Actual OBS/vMix/SPX receiving applications and CasparCG hardware were not rehearsed overnight. Before on-air use, rehearse a duplicate: Channel 1 graphics, Channel 2 stills/videos, transparent video on Channel 1, sound gain/loops, folders, All out, clear and reconnect. Do not use the original upcoming production as a test fixture.

Configured tests needing an admin key and the full historical configured suite were not run locally. The real-backend subset used only the configured throwaway account and public Auth seam. No SQL migration or Bridge update is part of this release.

## Verified feature and visual phases

- Feature commit c6cd6a6c4792f50e6c721a25310f19caebb5d7cf: npm run build exited 0. Unit gates: 2446 tests, 2443 passed, three existing skips; TypeScript, ESLint, dependency checks, Vite/prerender, client-secret and line-ending gates passed.
- Linux [screenshot run 37242702827](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37242702827) passed on that exact feature commit. All six images were opened and compared with the approved look before copying the Linux baseline set. Both operating systems keep the compact route/type/state layout.
- j-3349 was canceled after a Bridge fixture raced initial Home rendering. The fixture now awaits rendered Home and Production pages before restarting. Its isolated reproduction passed in j-3350.
- Final full affected run j-3351 passed: 1,424 browser checks, 542 existing skips, zero failures, plus all 35 catalog checks. Sound regression coverage remains green.
- Final focused run j-3355 passed all 12 checks: six rundown snapshots and six output/setup/legacy/routing/account scenarios. It follows the final dialog spacing change. Account-switch fixtures await the rendered Home page and actual account-library binding before exercising the expected isolation reload. An earlier fixture read crossed that reload; assertions were retained, with no production account-isolation change.
- Rendered checks found checkbox helper text concatenating with labels. A scoped output-dialog CSS rule separates those lines. The corrected chooser was inspected at desktop and 390px phone width, along with SPX remembering and combined browser/CasparCG override.
- Owned visual evidence: [empty chooser](built/publish-empty.png), [phone chooser](built/publish-empty-phone.png), [SPX remember](built/publish-spx-remember.png), [combined setup](built/combined-output.png), [rundown](built/rundown-dark.png), [host light preference](built/rundown-light.png), [phone rundown](built/rundown-phone.png).

- The final committed build exposed two previously untracked-file gate issues: the destination-specific SPX help needed an exact, justified client-neutral allowlist entry, and the studio owner item needed its standard route section. Both were corrected without changing runtime behavior or reducing a gate.
