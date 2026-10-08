# Verification

Baseline and review merge base: b761d302fa59cb1fd9587f9cfee535c49faa86e0.
Branch: codex/persistent-drawing-tools, in its own managed feature worktree.
Research PR #723 is in the baseline; its receipts are not implementation proof.

## Check: review, simplify, verify

Review: inline, high effort. Read the changed product/test/doc files and all three
captures against the fetched merge base. Two findings in the cumulative test were
corrected: a seek could precede the rendered-pose acknowledgement, and its first
curve tangent was collinear. The task now uses the existing pose readiness check,
asserts no numeric-control error and draws a visible curve. Completed rectangles
are also kept separate in the rendered fixture. No product finding remains.
Review covered completion/cancellation, context switches, stale revision/asset/
playhead guards, source fidelity, undo/redo, field defaults and scope boundaries.

Scope: EDITOR_PLAN; the persistent-drawing owner route; this directory's README,
spec, check and desktop/laptop/laptop-125 captures; editor-arrangement, base-edits,
drawing-persistence, drawing-task, folders-bins, groups and pen browser specs;
Canvas, useArtworkGesture and usePenGesture. No engine/session/operation/output
implementation or save/sync code changed.

Simplify: inline. Removed an unused task helper/type import and kept the product
change in the three existing lifecycle seams. No new tool abstraction or registry.
Verify: inline; shared build/browser jobs only. Final tip is stamped after commit.

## Acceptance receipts

| Criterion | Result and evidence |
| --- | --- |
| Failure before fix | PASS: j-3713 ran the initial five direct tests on unchanged product code. All five failed at the explicit tool assertion, receiving Select instead of Rectangle/Ellipse/Text/Pen. |
| Repeated shapes and Text | PASS: j-3716 and j-3719 run the 14 direct checks. Select once, three objects, selection and bars, default fields/assets, Shift/default geometry, exact source through one undo per creation and redo, retained tool. |
| Successive Pen paths | PASS: direct open, closed and curved paths retain Pen; each whole path is one undo with stable identities and unchanged fields/assets. |
| Exact cancellation and guards | PASS: Escape, pointer cancellation/loss and explicit tool change preserve completed source/selection/history without draft IDs or fields. Source, assets, playhead and document-switch cases preserve existing guards. |
| Edit points and group navigation | PASS: switching into point editing cancels construction; Escape returns to Select; point edits undo once. Group entry cancels Pen, uses Select and forbids creation; Composition restores root access. Existing group/transform/keyboard suites also pass. |
| Cumulative task and outputs | PASS: j-3722, three tasks, at 1920x1080, 1366x768 and 1093x614. Wizard imports nested/masked SVG, excludes static text, constructs artwork, edits text, writes two keys and a Next cue, refuses stale/atomic invalid changes, saves/reopens exact source and executes SPX/CasparCG/OGraf In, Next and Out with matching path data. No console errors or failed requests. |
| Defaults and samples | PASS: live rehearsal sample survives authoring/cancellation; reopening resets rehearsal to the saved field default under the existing contract. Static text stays excluded, new Text gets its normal field, assets remain exact. |
| Rendered review | PASS: all three final captures inspected. j-3724 repeats the proxy task with existing 200% of Fit to enlarge the artboard, including after reopen: one passed. Canvas/timeline and controls remain reachable. |

Affected command: shared j-3719 ran npm run test:e2e:affected with one worker.
339 passed; its sole failure was the new proxy task typing before rendered-pose
acknowledgement. Only that test file changed afterward. j-3722 reran all three
corrected cumulative tasks: three passed. The 340 unique selected tests therefore
have passing results on the unchanged final product code. The existing quarantined
editor-foundation spec is excluded by the repository planner. No assertion or gate
was weakened. The final CI gate also runs the affected set on the committed tip.
Historical generated research captures/JSON were restored; this slice adds only
its own three captures.

## Setup and harness corrections

j-3710 was cancelled while waiting; j-3711 failed before tests because the new
worktree lacked dependencies. j-3712 installed locked dependencies and built the
existing player-host. j-3714 had five direct passes before the task stopped on a
wizard candidate-selector assumption. j-3716 had 14 passes and three task failures
at a requested time beyond the fixture's 1.25 s extent. j-3717 then exposed the
existing reopen sample reset; j-3718 passed the corrected desktop task. None was
reported as a passing cumulative run. j-3720 printed a plan only, with no tests.
j-3715 ran 2,538 native tests, zero failures, then failed lint on the unused task
helper; the helper was removed. j-3725 stopped before native tests because the
new owner route lacked its required route heading; the heading was added. The full build j-3727 passed (exit 0): 2,536 native passes, two existing platform
skips, zero failures; type checks, lint, dependency checks, bundle, 526-page
prerender, client-secret scan and after-build gates passed. The committed-tip
build and final stamp are recorded by the landing PR and final report.

## Limits and continuation

1093x614 is the documented 125% viewport proxy, not actual browser/OS zoom.
Default Fit leaves a small artboard at this height; existing zoom makes the task
possible. Layout polish stays outside this slice. No first-time-user/owner
acceptance, authenticated cloud-save flow or physical receiving-host test.
The owner route asks only for workflow judgment, not mechanical verification.
Shared command discovery/runtime schemas and a deterministic human/agent task
remain next at R1.3b. Paired live MCP remains R3.2; whole-row acceptance stays open.
