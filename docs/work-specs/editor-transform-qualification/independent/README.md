# Independent transform comparison (#950)

This receipt belongs to a fresh checker session that did not implement #949. The task is [issue #950](https://github.com/NoaCG/NoaCG-Studio/issues/950); [spec](spec.md) defines its bounded acceptance. Implementation [#949](https://github.com/NoaCG/NoaCG-Studio/pull/949) and receipt [#952](https://github.com/NoaCG/NoaCG-Studio/pull/952) were context only. Their verdicts are not counted as this check's evidence.

## Executed revisions and provenance

Fetched `C:/claude/NoaCG-Studio` main on 2026-10-10, then created a new managed worktree and branch `codex/editor-transform-independent` at `a67891ae9ddcfffd4cd56558cb683387d6ca0fc9`. This contains the landed implementation `0c355905f5f059a454daa802fdce221d32ac7616`. No product code changes are part of this receipt.

Independently downloaded the official VectorCraft v0.4.0 portable archive and `SHA256SUMS.txt`, and resolved the release tag through GitHub to `a26aa5b203c901979eb447d28e34e7357138c789`. [Fresh provenance](reference-provenance.json) retains published asset digests and local hashes. Archive SHA-256 is `fa8d7dc5590ebf1adb93d040dd7420441a2e55db2971f33c05c0c0e5edde0fec`; executed `vectorcraft.exe` SHA-256 is `19d93588ae034e38084be17e626a7f2174bd626059723c93d4681e752a72ffba`. The archive agrees with the freshly downloaded checksum and GitHub's release digest. No upstream source or runtime enters the product, CLI or emitted graphics.

## Independent reference execution

Scheduler j-4196 executed a fresh app child with the official loopback `--control` server, a [new SVG input](reference-input.svg), dynamic returned node IDs and a new native document path. [Calls, responses, source hashes and observations](reference-task.json) retain the actual task. The driver sent `ui.pointer` through the reference selection tool and `ui.key` through its keyboard route. Numeric comparisons invoked the exact engine commands used by its Transform panel; the numeric widgets themselves were not driven.

- Unequal numeric scaling changed 300x120 to 480x96. Proportional width 600 retained its current ratio, producing 600x120. Independent numeric width 360 retained height 120; proportional width 360 produced height 144.
- Shift-side and Shift-corner drags produced 375x150; an unmodified side produced 375x120. The side held its opposite side midpoint, while the corner held its opposite corner. Each completed pointer scale was one history entry. Keyboard Undo/Redo restored the bounds.
- Pointer rotation and numeric -30 degrees agreed in rotation and bounds within 1e-9 pixels. The observed values were -30.000000000000004 and -29.999999999999996 degrees.
- Area-text side changed 300x120 to 380x120. Its corner changed the frame to approximately 420x150. The reopened UI reports 32pt text, confirming frame resizing retained the text size.
- Escape during an area side drag did not cancel: width 380 became 430 on release. Undo restored 380 before saving. This is an observed reference shortfall, not a NoaCG requirement to copy.
- Native save and reopen retained every node ID, kind, name, bounds and text exactly. The reopened area was 380x120.

Inspected the [proportional panel](reference-linked.png), [rotated panel](reference-rotated.png), [reopened artboard](reference-reopened.png) and [actual UI](reference-ui.png). The artboard render is complete and text wraps. At Actual Size the UI canvas clips the left portion of the text and the lower note; the Properties panel remains visible. This is sparse transform artwork, not a broadcast taste or whole-editor comparison.

The initial j-4194/j-4195 harness attempts rejected exact equality at about 1e-13 pixels, first on rotated width and then on corner frame width. The final driver uses a 1e-9 pixel geometric comparison there, while native reopen and source identities remain exact. These failed driver attempts are recorded, not counted as passing reference runs. No maintained regression assertion was changed.

## Source paths inspected

Read the pinned upstream files independently before execution, including their selection/bounding-box tests. The task JSON retains SHA-256 hashes of the fetched exact files:

- `crates/tools/src/select.rs`: handle hit, `Action::Begin`, draft `object.transform` preview, pointer-up commit and area-type `typeAreas` behavior.
- `crates/tools/src/bbox.rs`: local axes, opposite pivot, Shift proportional scaling and 45-degree rotation snapping.
- `crates/ui-egui/src/panels/transform.rs`: numeric link preference, `object.setBounds` and absolute `object.rotate` commands.
- `crates/engine/src/cmd/object.rs`: proportional/independent bounds, rotation direction and `resize_type_area`.
- `crates/engine/src/cmd/typecmd.rs`: native area options, reflow and text sizing.
- `apps/vectorcraft/src/control_server.rs` and `crates/ui-egui/src/control.rs`: loopback JSON-lines transport, pointer/key routing, inspection and native save/open.

NoaCG inspection covered `src/components/editorFoundation/useArtworkGesture.ts`, `transformGestures.ts`, `AnimationProperties.tsx`, `animationAuthoring.ts`, `session.ts`, and `src/blocks/baseEdits.ts`. Numeric edits and gestures share authored operations/session history. Sides branch to text-box geometry before scale; ordinary sides and corners use `linked !== shiftKey`. Rotation accumulates sweeps and snaps at 15 degrees. Session cancellation restores the view without committing the transient source; version and current-pose guards reject stale contexts.

## NoaCG execution and comparison

The browser jobs j-4190/j-4191 were cancelled before starting because available memory stayed below the scheduler's 4 GB browser floor. They are not passing checks. Native work used the established half-suite cost and completed through the same scheduler. No browser memory guard or user application was changed.

A temporary, non-landing branch `codex/editor-transform-independent-probe` at `09b8ba79d3c8ca155a80d9a33d84a8270a254f35` executes the unchanged four maintained specs and a separately authored normal-route task in [CI run 38055552628](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38055552628). [Exact probe patch](ci-probe.patch) retains the test, config and temporary manual-only workflow. Its parent is the fresh-main spec commit, so product source is exactly the fetched main. The temporary workflow has no deployment or issue-writing job and is not part of the receipt landing.

The independent task uses ordinary New graphic -> ZIP import -> Edit artwork -> Rectangle/Text tools and visible Properties controls. Source reads are assertions only; it does not seed a template or invoke a mutation through dev modules. It starts at 160%:80%, relinks and types 200%, checks both pointer handle types, unlinked axes and Shift inversion, exact one-gesture Undo/Redo and Escape, text-side frame geometry, corner appearance scale, typed 25 degrees plus pointer 35 degrees, and durable Save/reload. Imported JavaScript, assets and fields plus the complete saved template are checked.

**Bounded comparison passed.** CI ran **28/28 maintained cases** (4.8 minutes), then the separate normal-route task **1/1** (20.8 seconds, 26.9 seconds including startup), with one worker and zero retries. All six `editor-cli-round-trip` cases are retained unchanged. [Run metadata](ci-run.json), [task values](main-task.json) and [job receipts](jobs.json) distinguish executed checks from cancelled local jobs.

The fresh ordinary task recorded typed 200%:100%, linked corner 240%:120%, linked side 224%:112%, and independent or linked+Shift side 224%:100%. Text side widened the 533.597px frame to 683.004px while retaining 48px type and 100% Scale. Its corner retained frame width and set both scales to 114.546%. Typed 25 degrees plus a 35-degree pointer sweep produced 60 degrees; typing the resulting value produced identical CSS. Escape preserved exact source/history. Save/reload retained the complete template apart from the requested saved name, along with imported JavaScript, assets and fields. Console/page errors and failed requests were both empty.

| Task | Independent comparison | Difference or limit |
| --- | --- | --- |
| Linked scale and unequal current ratio | Both editors preserve the ratio for numeric and proportional pointer edits | NoaCG Link applies to side/corner gestures; Shift inverts Link. Reference numeric Link is separate from pointer Shift |
| Independent scale | Both change the requested axis without scaling the other | NoaCG unlinked or linked+Shift corresponds to the reference's unmodified side |
| Text-box side | Both change frame geometry and reflow without stretching the text | NoaCG width is separate from Scale and font size |
| Text-box corner | Both perform their specified operation | Deliberate difference: NoaCG scales the whole layer, preserving frame geometry; the reference resizes its area frame. NoaCG follows the owner's side-versus-corner contract |
| Rotation | Pointer and numeric results agree within each editor | NoaCG positive clockwise degrees versus reference counter-clockwise command/display; visible knob versus outside-corner hit zone. Source inspection records 15-degree versus 45-degree Shift snapping; no new reference snapping or multi-turn runtime claim |
| History/cancel | Both restore completed edits through Undo/Redo | NoaCG Escape preserves source/history; the reference control run committed after Escape. Pointer cancellation, zero-axis recovery, stale contexts, armed channels and turns remain covered by the unchanged NoaCG specs |
| Reopen | Each editor retained its edited document through its native persistence route | Reference has no broadcast source-ID/field/asset/channel or CLI-package equivalent. Those are NoaCG regressions, not reference parity |

Inspected [1920x1080](main-desktop.png), [1366x768](main-laptop.png) and [1093x614](main-zoom-proxy.png) normal-task captures after reopen. The rotated selection, edge/corner handles and rotation knob are visible in all three. Desktop shows the full artboard and six timeline layers. Laptop Fit makes the artwork small, shows only the upper timeline rows and requires timeline/Properties scrolling. At 1093x614 the canvas is 813x163px, the artboard clips vertically, Properties needs scrolling and the document tab/name is hidden by the existing responsive layout; the selected transform handles remain visible. This is **200% of Fit**, not physical browser zoom. These limits remain explicit; the task does not pass broader responsive usability or owner acceptance.

No product defect was found in this bounded comparison. No broader editor acceptance, R1.5/default-switch, production redeployment/task, receiving-host or paired live MCP verdict is claimed. Production's earlier implementation receipt remains separate.

## Repeat

Apply `ci-probe.patch` on a disposable branch at the stated main revision (or its spec-only child), push it and dispatch the existing `deploy-verify.yml` workflow on that branch. It runs the named four specs with one worker, then the independent task, and uploads `independent-transform-comparison`. Do not merge the probe workflow. Local equivalents are the j-4190/j-4191 commands in the job receipt, when the scheduler admits browser work.

For VectorCraft, verify the official archive/checksum and EXE hashes, launch a fresh child with `--control <free-loopback-port>`, and send newline-delimited `{id,method,params}` requests using [reference-task.json](reference-task.json). Replace input/output/native paths and use IDs from the new `document.inspect` results. Set Actual Size before document-coordinate pointer calls. Poll after keyboard history actions, and await the native file and empty `ui.inspect.background` before reopen. Compare snapshots as described above and inspect both UI and artboard captures. Stop only the child started for the repeat.


