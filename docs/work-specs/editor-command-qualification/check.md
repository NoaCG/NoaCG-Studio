# Verification

Baseline: fetched main 7c187050188339990bab7349f3a57b34cda7fcc2,
containing #820 / 018c03d307647f05982148dab2087e36e2ef2abb.
Implementation branch: codex/editor-command-qualification, in its own managed
worktree. Earlier research and drawing receipts are not proof of this slice.

## Direct and cumulative task

Shared job j-3777 completed with exit 0: **9 passed** (2.8 minutes).

```
npx playwright test e2e/editor-commands.spec.ts e2e/editor-command-task.spec.ts --workers=1
```

| Criterion | Observed result |
|---|---|
| Discovery and runtime schemas | Six stable command IDs; generated JSON schemas compile; malformed types, extra properties, nonfinite/bounded values, unknown operations and empty/oversized batches refuse without writes. Paginated inspection is bounded. |
| Capabilities and refusals | Plain public/static text and qualified parent-pixel position work. Styled text, unnamed/duplicate IDs, arbitrary selectors and unsupported targets preserve source with reasons. |
| Context and atomicity | Source/assets revision, away-and-back view, independently stale history head, active gesture and closed/remounted command-binding guards refuse. A valid creation followed by a source-handler failure changes no source/history. Duplicate committed transactions refuse. |
| Commit versus preview | Commit receipt is immediately separate from readiness. Ready requires matching revision, generation, request and time/cue acknowledgement, with the existing drawing-space matrix. Drafts cannot acknowledge committed source. |
| Shared task at three viewports | Fresh UI and semantic copies import nested/masked SVG, retain one public field and excluded static text, create rectangle/ellipse/text, edit defaults/static wording, author two position keys, Next and Out, cancel a draft and refuse stale/unsupported/mixed batches. |
| Source, history and persistence | All 12 phase snapshots match exactly, including source patches, identities, fields/assets and 11 committed history entries. Undo/redo restores exact source. Samples survive default edits and history; save/reopen retains source, masks and exclusions. |
| Rehearsal and outputs | UI In/Next/Out rehearsal reaches both held positions and clears on Out. Reopened source validates and executes 18 SPX/CasparCG/OGraf browser packages, with play/next/stop endpoints and no console/network errors. |

Semantic source writes use the catalog and existing session handlers. No authoring
clicks or raw store setters substitute for semantic source edits. The wizard,
save and rehearsal use existing services. Sample setup is test input. Semantic
cancellation stages a patch through session.begin/preview and cancels through the
same session; real UI cancellation also verifies the rendered Pen draft.

Creation geometry is measured from the UI's shared-handler arguments, including
parent-space and subpixel text coordinates, then replayed through the catalog.
This qualifies handler equivalence, not independent composition conversion. At a
Step flag, authoring Play replays the arriving cue; the task explicitly inspects
Next and plays from its first frame. Exported Next starts at the boundary.
Reopen resets samples to saved defaults by the existing contract.

## Rendered review

All six cumulative captures were inspected. Canvas, tool controls, inspector and
In/Next/Out timeline remain accessible. The proxy keeps graphic text small even
at 200% canvas fit; this is recorded as a limitation, with no usability polish in
this slice. Semantic and UI artwork/held poses agree; all three complete PNG
  pairs also have equal SHA-256 hashes.

| Viewport | UI | Semantic | Exact parity receipt |
|---|---|---|---|
| 1920x1080 | [capture](desktop-ui.png) | [capture](desktop-semantic.png) | [source/history hashes and pose](desktop-parity.json) |
| 1366x768 | [capture](laptop-ui.png) | [capture](laptop-semantic.png) | [source/history hashes and pose](laptop-parity.json) |
| 1093x614 | [capture](laptop-125-ui.png) | [capture](laptop-125-semantic.png) | [source/history hashes and pose](laptop-125-parity.json) |

1093x614 is the documented 125% laptop viewport proxy, not browser/OS zoom.

## Check and landing

Review: inline, high effort, against the verified main merge base. Fixed the
semantic cancellation test's UI dependency, isolated the history-head test and
fixed/reproduced the command lifetime gap across UI remount. Simplify: inline; removed duplicate
schema decoding and a redundant preview guard. Verify: inline, with shared jobs.

The implementation-phase build j-3759 passed: TypeScript, lint, instruction/doc
and native gates, player build, Vite/prerender and afterbuild. The native gate had
2459 tests: 2457 passed, two existing platform skips, no failures. Final affected
browser job j-3783 completed at the verified base with three workers: **537 passed,
66 existing skips, no failures**, `AFFECTED_NATIVE_EXIT=0`, shared job exit 0
(14.8 minutes). It selected 36 specs and retained the existing editor-foundation
quarantine exclusion. All nine new checks ran. No assertions, timeouts or
quarantine entries changed. The committed-tip build runs after the evidence
commit; its verdict is recorded in the check stamp, PR and final session report.

Earlier failing task attempts exposed test assumptions about parent coordinates
and Play at cue flags; the final fixture uses the existing contracts. j-3768 was
cancelled after editing a module during the run reset the Vite command seam.
The fresh server j-3771 then passed all eight checks. A later independent
remount check j-3774 reproduced a stale binding request being accepted; j-3777
passed all nine after giving each command binding a lifetime ID. No failing/cancelled run is
counted as an acceptance pass. j-3772 printed 536 passed/66 skipped but the runner
lost its exit status; it is unjudged. j-3778 exited 1 with one existing Pen startup
wait timeout after 536 passes and 66 skips. The snapshot showed a mounted editor;
the unchanged isolated case j-3781 passed with tracing (3.6 seconds). The startup
timeout was not reproduced in isolation. The full controlled rerun changes only
worker concurrency, with an explicit native exit receipt. No timeout, assertion
or quarantine was weakened. The first affected run selected unrelated main
changes from an older base; final verification names the actual starting commit.

Landing must still reconcile current main, build/check the committed tip and use
queue-merge. This file does not claim a merge or deployment; actual status belongs
to the PR and final session report.

## Acceptance boundary

This is deterministic Chromium/DOM engineering qualification. Node-pure, real
model, owner workflow, physical receiving hosts, WebMCP, public control ports,
paired live MCP and full R1.3b acceptance remain unverified. No model, engine,
geometry, usability or save/sync scope was added. Paired live MCP stays R3.2.
