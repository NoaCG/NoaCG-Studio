# Independent landed interaction check

**PASS for the bounded Phase 1 task.** The checker did not build PR #1121 and changed no product code. [Scope and acceptance](spec.md). Broader comfort and owner acceptance remain open.

## Revisions and execution

Fetched current main `2ea888ed16911d579cfcc0e52a1956ebf03b984a`, PR #1121's merge at 2026-10-13T17:17:47Z. The final fetch still returned that exact revision. Both disposable probe revisions have the same product tree as main; [fresh provenance](provenance.json). The checker used only its own `plan-editor-p1-check` worktree. The probe branch was never opened as a PR or queued.

The first-party builder cumulative/reference recipes were independently read and rerun with new documents; their earlier verdicts are not counted. A new checker-authored nested-group task adds Shift-constrained Alt-copy, rename input ownership, draft source/history equality, exact Escape and stable one-undo/redo identity. The existing marquee/multi-object case is executed separately because the inherited maintained list omitted it.

| Fresh run | Observed result |
| --- | --- |
| [38439749727](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38439749727), `24346119d94e68fa0de894de975f5f2505017ad5` | 22 unchanged maintained regressions passed in 4.6m; four cumulative/nested tasks passed in 1.9m; three reference tasks passed in 24.2s. [Metadata](complete-run.json), [executed lines](complete-checks.txt). |
| [38440268217](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38440268217), `72c26af585fb050fa678f049e9f80cc6ddc8b494` | The unchanged B02 marquee/multi-object/cancel case passed in 12.5s. Other task steps deliberately skipped. [Metadata](selection-run.json), [executed lines](selection-checks.txt). |

All browser runs used Chromium, one worker and zero retries. Both passed on their first execution; there was no failed assertion or driver correction. Local scheduler job `j-4380` was held at 2.4GB free RAM against the unchanged 4GB floor and cancelled before launch. No local browser process was started. Reference sources remained isolated in this checker's ignored directory; reference server processes ended with their CI tasks.

Current-main [CI 38437501762](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38437501762) and [configured suite 38437502114](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38437502114) completed successfully on the exact checked main revision. [CI jobs](main-ci.json), [configured jobs](main-configured.json). The pre-existing hosted-latency alarm #987 is outside this phase and is not newly attributed to it.

## Acceptance evidence

1. **Selection, keyboard/context and ownership pass.** Fresh maintained cases exercise canvas additive selection, row Shift ranges, label rename/eye, selected-set context operations, Delete, Ctrl+D, Ctrl+A, undo/redo, and text/numeric/header ownership. The separately executed B02 case covers canvas marquee and multi-object movement/cancel. The new nested task also checks Ctrl+A/Ctrl+D inside a rename draft followed by Escape, retaining source, selection and history.
2. **Copy transaction passes.** Maintained cases inspect the visible held copy, populated text, original geometry, multi-root and animated group copying, pointer cancellation, exact Escape, stale source/selection refusal and unsupported mixed-selection atomicity. The new task creates `#group-2` containing `#group-1` and three rectangles, previews a copy 53 screen pixels to the right with Shift retaining Y, cancels exactly, repeats and commits once, then undo/redo restores stable `#group-2-copy-1` and descendant IDs. [Nested receipt](nested-copy.json). Alt-click cycling and existing handle constraints remain covered by the maintained cases.
3. **Property discovery passes.** A/P/S/R/T reveal existing controls; U reveals animated property rows. Previous/next Position X key navigation seeks 0.4/0.92s in the fresh cumulative task without changing source/history. Existing unkeyed and static Anchor behavior remains intact. Source inspection confirms distinct accessible names/tooltips and seek-only navigation.
4. **Required rendering passes its bounded allocation.** Three fresh cumulative tasks and seven inspected captures retain controls and full selection/rotation/anchor handle containment. Detailed observations below; no broader comfort verdict.
5. **Pinned comparison executed and traced.** Fresh Studio and Eyevinn runtime tasks passed. [Independent UI-to-mutation-to-preview/test trace](source-review.md), [source hashes](provenance.json), [Studio keyboard/copy](studio-interactions.json), [Studio cumulative](reference.json), [Eyevinn](eyevinn-interactions.json). Deliberate differences remain explicit below.
6. **Cumulative editing and outputs pass.** The visible import journey edits Nadia Laurent, label, numeric transforms and animation; copies/deletes, cancels, saves/reopens exact source, then downloads and executes SPX, CasparCG and OGraf packages. All nine output receipts have no runtime errors. Original fields, assets, masks and configuration survive. [Desktop](desktop.json), [laptop](laptop.json), [native 125%](actual-125.json). The unchanged transform, CLI round-trip, layer/property and short-height tests also pass; earlier receipts/specifications were not edited.

## Rendering and reference differences

Inspected fresh desktop 1920x1080, laptop 1366x768, native 125%, nested-copy, Studio copy, Studio reopened and Eyevinn captures. [Capture hashes/dimensions/paths](captures.json), [CI artifact provenance](artifacts.json). Pictures stay local/ignored under #992; no image or reference code/binary is committed.

Desktop has a 1640x534.2 canvas and 334.8px timeline; laptop has a 1086x317 canvas and 240px timeline. Properties is 280px wide. The native headed Chromium outer window is 1366x768 with measured browser zoom 1.25 at both ends, 1093x545 CSS content, DPR 1.25 and visualViewport scale 1. Canvas is 812.8x196, timeline 180px, Properties 280px wide, and document scroll/client width both 1093. [Zoom](zoom.json). The 1366x681 screenshot is physical web-content pixels, excluding browser chrome. Deliberate 200% Fit and pan (31,-13) survive real outer-window resize and return without source/history changes. [Camera receipt](native-camera.json).

The artboard stays visible and handles are reachable. Desktop exposes several layer rows; the native small-height view shows one row and requires vertical timeline/inspector scrolling. Fit artwork and imported text remain small, especially at 125%. This preserves the approved trade-off, not a finding of broad editing comfort or owner acceptance.

Fresh Studio execution duplicates by Ctrl+D, restores the same IDs through undo/redo, selects all, protects input focus and opens canvas Duplicate. Alt-drag moves X 100 to 167 while the layer count stays two. Its row Shift click replaces selection; label rename retains IDs; eye hides rendering; explicit Delete/Undo/Redo works across its 500ms history burst. Numeric deltas are +13/+130/+1 with Alt fine adjustment; active-drag Escape retains 261 instead of returning to 244. Leila Moreno and X tracks at frames 0/12/24 survive native `.ogs` download/input reopen. The native OS picker itself is not exercised.

Fresh Eyevinn execution protects the numeric input from Delete, changes X to 300, observes no Ctrl+D copy, and Alt-drags the same rectangle to X 393.913. It has no canvas context action; reload preserves both elements. Its laptop property panel requires scrolling. Neither reference supplies NoaCG's exact modifier-copy or SPX/CasparCG task, so those contracts are verified directly. Preserve NoaCG's Shift ranges, row context/rename, fractional fine adjustment, separate Scale/box size, one gesture per undo and exact Escape.

## Check, limits and next task

Documentation review and simplification run inline because no callable review/simplify execution capability is available. The review checks scope, exact main/probe trees, actual executed CI steps, receipt/capture correspondence, stated reference omissions and preserved earlier evidence. No product fix or simplification is required. Five affected documentation gates passed (contract freshness/citations, docs index, client secrets and copy), as did whitespace and probe-patch applicability. Receipt validation checked all 16 JSON files, seven capture hashes/dimensions, nine output runs, native zoom, current-main successes, relative links and unchanged product/tests/workflows. A final whitespace check caught an extra blank line at EOF introduced while updating this receipt; it was removed before the final stamp. Review: inline, zero product findings; simplify: inline, no changes; verify: inline, passed.

No local full build/suite, upstream unit-suite execution, native macOS/device qualification, performance-distribution measurement, fresh served-production task, real receiving host, paired MCP or owner acceptance is claimed. The main deployment and full CI remain independently owned prerequisites; browser package execution is not receiving-host acceptance.

Next: the separately scoped leave-editor lifecycle correction, followed by shared cloud-status reliability under their existing ownership. Carry this receipt into the next phase notes. Do not proceed into loops, R1.5/default switch, R2/R3 or broader workspace redesign from this bounded PASS.

To reproduce, apply [ci-probe.patch](ci-probe.patch) to the checked main revision on a new disposable branch, then dispatch `deploy-verify.yml` with `scope=complete` and separately `scope=selection`. Never queue or merge that branch.
