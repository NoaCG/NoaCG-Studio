# Step 6 settled cloud views

Captured in the owned `codex/codebase-lean-step6` worktree after merging main
`c417eadb4ba031239007f651e6191452303902e2`. The manifest records capture provenance and
SHA-256 hashes. The application source matches the reviewed cleanup; the cold-open test
repair and source-header comment deletion do not change these views.

Repository policy deliberately ignores screenshots under docs. The eight PNGs are retained
on this cloud worker at `/workspace/worktrees/codebase-lean-step6/step6-evidence.local/`
and packaged as `/workspace/scratch/step6-settled-views.zip`; they are not committed or
claimed to transfer with Git. This record retains the inspection results and hashes.

The existing Playwright queue started this worktree's offline-pinned Vite server on port
5246. All browser-driving jobs used the detected two-worker ceiling and five-minute cap.
The temporary capture spec is retained in the cloud worktree's ignored
`step6-evidence.local/capture.spec.ts`; no temporary case is added to the maintained suite.

| View | Desktop | Laptop | Mobile |
|---|---|---|---|
| Loaded wizard fields and settled graphic | `wizard-1366.png` | `wizard-1093.png` | `wizard-390.png` |
| Current editor and rendered graphic | `editor-1366.png` | `editor-1093.png` | `editor-390.png` |
| Video guides/backing and loaded code | `video-code-1366.png` | — | `video-code-390.png` |

All eight images were opened and inspected. The wizard waits for its field controls,
rendered text, ancestor opacity and completed GSAP motion. Video waits for its loaded
player revision, actual countdown content and Monaco's rendered source lines. The
mobile code image includes its expanded code section in the complete scrollable page.
Editor chrome, graphic, properties and timeline remain styled; the mobile editor retains
its existing dense layout. This is preservation evidence, not a new responsive redesign.

`wizard-editor-*.json` and `video-*.json` cover console and network events in every capture
context, including frame events. The final observations contain no console errors or HTTP
errors. Some requests were cancelled by navigation and video logs retain the existing
Remotion license notice. These are recorded rather than silently discarded.

The initial mobile video capture j-0001 emitted two negative SVG outline dimensions during
subpixel layout. `baseline-subpixel-guides.json` reproduces those exact errors from unchanged
main in j-0010: CanvasGuides subtracts one pixel from a positive dimension smaller than one.
This is tracked in [#1527](https://github.com/NoaCG/NoaCG-Studio/issues/1527). The final
settled video capture j-0011 passes its unchanged empty-error assertions; it does not prove
that pre-existing transient problem repaired. Earlier loading/entrance captures are excluded.

Maintained browser checks: j-0007, all 37 import/editor/brand/video cases passed in 1.4 minutes;
j-0014, all 18 wizard-shell cases passed in 44.1 seconds. The original import failures and
CI cold-load failure remain in the spec and the existing PR repair receipt. No assertions,
cases, retries, limits or baselines were weakened to obtain these results.
