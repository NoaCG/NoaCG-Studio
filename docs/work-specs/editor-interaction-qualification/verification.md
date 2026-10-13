# Builder verification

## Scope and method

Started from fetched main `dba61b8e16719f4e42d5479b7c921b45193084a6`, containing merged #999.
Product implementation ends at `a52b3de50`; later commits record evidence.
No existing transform/layer property behavior was rebuilt. The protected hashes in
`provenance.json` verify unchanged earlier specifications and receipts, with the original
six layer/property tests preserved as an exact prefix.

Local browser job j-4374 remained held below the unchanged 4GB free-RAM floor and was cancelled
before launch. Free RAM remained about 1.8GB. All browser evidence below ran on disposable
GitHub Actions runners, Chromium, one worker, zero retries. No probe branch enters the queue.

## Results

| Acceptance | Evidence and result |
| --- | --- |
| Selection and keyboard/context ownership | Four added interaction cases pass in [38430997159](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38430997159). Ctrl+D creates one undo, Ctrl+A selects current group scope, Shift+F10 opens the shared canvas menu, text/numeric/header focus retains ownership. Earlier row range/rename/eye/context/Delete tests pass unchanged. Direct Alt-click cycling is separately checked in the final focused run. |
| Copy transaction | The same maintained tests check live copy geometry, unchanged source/history during preview, original geometry, stable undo/redo IDs, Escape and pointer cancellation, stale selection refusal, several roots, groups, armed animation, populated field text and atomic container refusal. |
| Property discovery | A/P/S/R/T expose existing controls in the viewport; U exposes and scrolls to animated rows. Previous/next X keys seek 0.4/0.8 without source/history changes. Existing unkeyed controls and named/tooltipped key actions remain covered. |
| Cumulative and rendering | Three tasks passed in [38429868053](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38429868053), although that run's separate maintained step failed on a new test's wrong refusal text. Each task imports Riverlight, changes label/text/numbers, creates and transforms artwork, duplicates/deletes, keys X, cancels a transient gesture, saves/reopens, and executes SPX/CasparCG/OGraf packages. All nine output receipts have no runtime errors. |
| References | Three tasks passed in [38429040294](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38429040294). See the exact pin/release/source trace and deliberate differences in `reference.md`. |
| Negative control | [38430992127](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38430992127) deliberately removed the root input guard only in the disposable runner. Input Ctrl+A changed selection and removed the expected numeric Rotation control, so the ownership test failed waiting for its next input. The unmutated test passed. The mutation never enters the product branch. |

Complete run [38431318592](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38431318592) passed all 22 maintained cases, three cumulative tasks and three reference tasks. Alt-click focused run [38431994060](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38431994060) passed all four appended cases. Final lifecycle repair run [38433441799](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38433441799) passed all 22 maintained cases, three cumulative/native-125 tasks and three pinned-reference tasks on product `a52b3de50`, one worker and zero retries.

## Reproduction and corrections

- Main reproduction [38425103564](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38425103564): three intended failures, before implementation.
- Initial fix [38426065048](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38426065048): three tests passed for commit/cancel, keyboard and property navigation. That version did not yet assert a copy in the held preview.
- Stronger preview assertions in [38426832216](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38426832216) exposed the missing structural preview. Diagnostic run [38429012906](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38429012906) recorded valid pointer events and two proposed operations; the bridge only sent CSS, motion and existing SVG geometry. The correction renders temporary clones through the same correlated preview path.
- Final inline review found that CSS/key-only source acceptance could retain temporary clone DOM and draft motion. [38433040316](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38433040316) reproduced it: the authoritative CSS changed, but `#f2` still existed. `a52b3de50` excludes active or queued structural/motion drafts from fast frame reuse; the existing full load clears DOM, CSS and animation together. The added assertion also checks that the refused stale gesture retains the latest source/history.
- New driver corrections: an expected stale-context refusal cannot use the helper that asserts no error; a group must be dragged by visible member artwork, not the DOM box of its zero-size wrapper; a composition container reports the existing container refusal, not the guessed stable-ID refusal. Eyevinn Custom already contains one text item. No prior test or product refusal was weakened.
- The first mutation dispatch failed before testing because its output directory did not exist. The second text-only test survived removal of the root guard because the text editor itself stops propagation. Numeric/header ownership coverage was added; the final mutation is detected.
- The provenance check caught an overbroad text replacement adding new assertions inside an earlier test. Its original bytes were restored before final qualification; only appended cases remain in the diff.

## Rendered inspection

The builder opened the desktop, laptop and native-125 captures from the successful cumulative
step and both fresh reference interaction captures. `workspace-runtime.json` retains dimensions,
console/network/output results, physical-zoom measurements and capture hashes. Pictures stay in
CI artifacts and ignored local evidence under the existing #992 policy.

Desktop 1920x1080: canvas 1640x534.2, timeline 334.8px, inspector 280px wide. Laptop 1366x768:
canvas 1086x317, timeline 240px, inspector 280px. The transform/key controls align and remain
reachable; the extra previous/next controls make the inspector taller, so property reveal
shortcuts reduce scrolling but do not eliminate it.

Native headed Chromium used viewport:null, an outer 1366x768 window and browser
chrome.tabs.setZoom/getZoom=1.25 at both ends. CSS content is 1093x545, DPR 1.25 and
visualViewport.scale 1. Canvas remains 812.8x196, timeline 180px, inspector 280x268.8, with no
horizontal document overflow. The direct CDP capture confirms actual zoom, not a Fit proxy.
The small Fit artwork and single visible timeline track remain comfort limits. Deliberate
200% Fit and pan (31,-13) survive native resize with source/history unchanged.

## Check and limits

Review and simplify are inline: no callable code-review or simplification tool was available.
Review covers the exact merge-base diff, operation atomicity, transient clone cleanup,
selection/time/source invalidation, input and group scope, key navigation and the folder rules.
Review found and fixed one final lifecycle defect, with a red regression before repair. Document changes already replace the keyed iframe; disposal cancels callbacks, listeners and monitoring. No remaining confirmed defect; simplify retains existing operations and helpers without adding
another state model. The React checklist found no additional required change.

Targeted ESLint on changed source files and `tsc --noEmit -p tsconfig.json` passed. Seven affected
cheap gates passed: contract freshness, citations, docs index, client secrets, neutral copy,
copy baseline and preview serialization. Final stamp and merge reconciliation are recorded on
the PR. Full build and affected browser suites belong to PR and merge-group CI. The existing
hosted-latency alarm #987 predates this phase and is not a new interaction regression.

No native macOS modifier/device execution, physical receiving hosts, production deployment,
paired MCP, broad usability/owner acceptance or performance-distribution qualification is
claimed. Leave-editor and cloud-status follow separately. This is builder evidence; the plan
still requires a fresh checker after green landing.

## Repeat

Apply `ci-probe.patch` to the final build branch on a disposable branch and dispatch
`deploy-verify.yml` with scope=complete. Scope=changed runs the four appended cases;
references and cumulative select those respective tasks. Scope=mutation removes the input
guard only inside its runner and expects the ownership test to fail. The workflow has
contents:read, no deploy step, and checks the official Studio executable hash. Do not queue it.
