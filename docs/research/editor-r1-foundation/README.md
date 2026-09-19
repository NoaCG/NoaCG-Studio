# R1.0 foundation review

2026-09-19. Implementation branch: `codex/editor-r1-foundation`, based on planning
commit `39adb2ed`. The owner's R1.0 request supersedes the earlier implementation hold.
This is the bounded foundation handback. R1.1a has not started.

## Run and walk

From this worktree, run `npm ci`, `npm run build`, then
`npm run dev:worktree -- --preview`. The reserved local route is
[the foundation](http://localhost:5284/app?editor=foundation#/editor-foundation).
Other checkouts use the port printed by `dev:worktree`.
The flag is a query parameter plus a hash route, so a static preview deployment can
serve it. Removing the flag leaves the existing application in charge.

1. Open the route. It uses the current working graphic and starts at the settled In pose.
2. Click a timeline layer or its artwork. Properties and the canvas share that selection.
   Shift/Ctrl/Cmd adds/removes a layer; Alt-click cycles overlapping bounds. Outline is
   the alternate inspector tab.
3. Drag the ruler forward and backward. Arrow keys move one frame, Shift ten. Switch
   Seconds/Frames. Escape cancels the active scrub. The permanent Out marker identifies
   the held In endpoint; R1.0 does not add flag editing or operator playback.
4. Fit the canvas, change zoom, or Space-drag to pan. At 1366x768 the Project dock collapses
   before the canvas or Properties. Project opens it as an overlay.
5. Save through the existing confirmed-save controls. Home and Existing editor remain
   available. For a second fixture, create Hairline or import
   `e2e/fixtures/illustrator-lower-third.svg` through the existing wizard, then return to
   the foundation URL. Optional wizard Finish -> Edit is R1.1a.

The captures below are actual product renders. They are separate from the planning mockups.

## Architecture

[Implementation brief and inventory](implementation.md) records keep/refactor/replace/retire
decisions and retirement slices. SpxTemplate remains canonical. Document ports own source,
selection and history; document-scoped sessions own revision/transaction identities,
gesture captures and view receipts. The preview controller owns generation, readiness and
requests. No persisted scene graph or document format was introduced.

The harness-only `key.set` operation updates existing supported numeric keys through the
existing deterministic writer. A batch validates fully before one source/history write.
Unknown data is refused rather than dropped. Preview/cancel writes no source. Undo/redo
restores source and selection/time; external writes invalidate gestures, and retired
sessions reject late operations.

Key-only source changes update runtime data in the existing frame. Structural, runtime,
sample-data and asset-byte changes rebuild. Every reply is checked against frame window,
document, source revision, asset revision, generation and request. Preview startup failures
are visible and recovery is tested. Scrub uses the bundled GSAP interpreter with callbacks,
measured dynamics and loops removed from the transient evaluator input.

## Verification

- `npm run build`: exit 0; TypeScript, full ESLint, dependency checks, build gates,
  production bundle, prerender and after-build checks. Infrastructure suite:
  1,798 passed, 1 documented skip, 0 failures (1,799 total).
- Foundation Playwright: 12/12 passed, one worker, no retries; queue job j-1405.
  Includes flag off/on, actual wizard SVG import, catalog selection/reverse seek,
  atomic batches, exact undo/redo, cancellation, external/stale/closed-session refusal,
  two isolated document ports, same-path asset pixels, hot key updates, unknown-data
  refusal, 25/30 fps at speeds 0.5/1/2, confirmed save/reopen, suppressed calls and
  runtime failure/recovery.
- The source tests write reproducible catalog, imported SVG and F4 fixtures in this folder.
  F4 has 30 content layers and 300 numeric keys, plus the source-derived root/panel rows.
- Production latency and preserved project/runtime regression receipts are recorded below.

The cold catalog and actual imported-SVG opening attempts displayed artwork. A separate
zero-time hot-key test reproduced stale pixels after a committed key change; the shared
runtime's forced zero-frame render fixes it and Undo is pixel-checked. A retired-session
test also reproduced a late-write acceptance; explicit disposal now refuses it.

The original owner-machine blank-stage report is not claimed universally resolved.
These are repeatable Chromium fixture observations on this machine.

## Production measurements and screenshots

Queue job j-1411 completed all nine built-app cases. Windows 10.0.19045, Ryzen 7 5800H,
16 GB RAM, Chromium 149.0.7827.55, Node 24.13.0. Each case collected 60 acknowledged
selections, 60 discrete scrubs, then 90 continuous pointer moves. Input stamps come from
the handler and end at a matching pose acknowledgement after two animation frames.
This includes React, messaging and a presentation opportunity; it is not physical
input-to-display photon timing. The 125% case uses 1093x614 CSS pixels at scale 1.25.

All times below are milliseconds. Selection and scrub columns are median / p95 / maximum.

| Fixture | Viewport | Selection | Scrub | Final pointer-up feedback |
|---|---|---|---|---|
| catalog | 1920 x 1080 | 47.4 / 48.8 / 49.0 | 41.4 / 49.6 / 50.0 | 30.5 |
| catalog | 1366 x 768 | 47.0 / 48.3 / 48.5 | 39.5 / 49.5 / 50.1 | 30.5 |
| catalog | 1093 x 614 / 125% | 46.9 / 48.3 / 49.0 | 41.8 / 49.0 / 51.5 | 32.8 |
| svg | 1920 x 1080 | 47.3 / 48.5 / 48.7 | 40.3 / 49.2 / 50.1 | 31.5 |
| svg | 1366 x 768 | 47.3 / 48.4 / 48.6 | 40.0 / 49.3 / 49.7 | 30.7 |
| svg | 1093 x 614 / 125% | 47.4 / 48.5 / 49.0 | 40.9 / 49.0 / 50.2 | 30.5 |
| f4 | 1920 x 1080 | 47.6 / 48.9 / 49.1 | 41.6 / 49.2 / 50.4 | 29.9 |
| f4 | 1366 x 768 | 47.6 / 48.7 / 48.7 | 40.2 / 49.5 / 50.2 | 29.3 |
| f4 | 1093 x 614 / 125% | 47.4 / 48.9 / 49.1 | 41.8 / 49.8 / 50.2 | 29.7 |

Both parent and iframe frame intervals had a maximum below 16.9 ms. No long tasks were
recorded in either context. The measured targets pass: selection <=100 ms, F4 feedback
>=30 Hz, no observed freeze >100 ms, final pointer-up feedback <=150 ms. The runner now
asserts these bounds, and the saved distributions were checked against the same bounds.
[Raw measurements and fixture hashes](latency-built.json) retain the per-request evidence.
An early run was discarded after a server collision; the accepted runner verifies the
built server's advertised readiness and exact version.json before measurement.

Existing project/runtime regression suite: 16/16 passed, one worker, no retries, j-1412.
This covers autosave/wizard routes, serializer fixed points, preset/interpreter parity,
clock callbacks, 3D transforms and measured-motion preservation in the existing editor.

Rendered inspection: canvas/inspector/timeline remain visible at all three sizes, layers
scroll independently, Properties and Outline use one dock, and laptop collapse preserves
stage space. Captures settle permanent will-change hints before taking the screenshot.

| Actual product capture | Desktop | Laptop | 125% equivalent |
|---|---|---|---|
| Catalog | [1920](catalog-built-1920.png) | [1366](catalog-built-1366.png) | [125%](catalog-built-1093.png) |
| Imported SVG | [1920](svg-built-1920.png) | [1366](svg-built-1366.png) | [125%](svg-built-1093.png) |
| F4 30 layers / 300 keys | [1920](f4-built-1920.png) | [1366](f4-built-1366.png) | [125%](f4-built-1093.png) |

### Reproduce engineering evidence

Run browser jobs serially through the machine queue. First enqueue
`node scripts/editor-foundation-bench.mjs --verify` with `npm run queue --`,
`--kind gate --cost 0.5` (one browser worker). After it passes, run `npm run build`.
Then enqueue `node scripts/editor-foundation-bench.mjs --measure` with the same cost.
After that job finishes, enqueue `npx playwright test e2e/project.spec.ts e2e/anim-engine.spec.ts --workers=1`.
Use the previous job ID with `--after` when scheduling in advance. The measure command
starts and stops only this checkout's built preview. Do not leave a manual server on its
port while running the source specs.

## Limits and slice boundary

- One active working graphic; document ports are isolated in the harness. Durable tabs,
  project manifests, brands/library orchestration and production handoff remain R1.4.
- Read-only layer bars derive current source/reveal/hide timing, including static layers.
  New optional span serialization, disjoint spans, bar moves and trimming close in R1.1b/d.
- Source-recognized catalog parts and named imported layers are selectable. Deep unnamed
  SVG identity/hierarchy and precise path picking remain R1.1d/R1.2b.
- No mutation UI, tools, key editor, Set Out, transport playback, easing or Monaco here.
  The numeric operation exists to prove the shared transaction boundary.
- Measured dynamics/local loops explicitly disable scrubbing. Custom/unsupported source
  stays intact and can be opened in the existing editor. This is not full simulator/export
  or interrupted-Out parity, which belongs to R1.1c/R1.2.
- Dock sizing is responsive and fixed in this slice; manual resizing and wider workspace
  preferences remain in the later E03 allocation. 125% evidence uses an equivalent CSS
  viewport and device scale, not a manual browser zoom session.
- No hosted deployment or owner/first-time-user acceptance is claimed. Review is pending.

## Exact next task: R1.1a

On a new bounded branch after this review, implement optional wizard Finish -> Edit,
source-backed Position/Layout offset, Text/Rectangle/Ellipse creation and basic scaling.
Extend the operation registry and transient preview path; each completed gesture is one
deterministic source patch and one undo step. No key authoring or bar moves yet.

Close B01/B03/B04 core and D03: +40 px Layout offset on a flow catalog line leaves siblings
and motion tracks unchanged; absolute/SVG targets use parent coordinates with inverse
runtime mapping, including translate(100,80)/rotate(30)/scale(2). Verify numeric/canvas
agreement, Escape, undo/redo, animation, save/reopen and relevant exports. Preserve wizard
fields and the direct production path. Repeat laptop/desktop/125% inspection and measure
actual drag feedback through this revision protocol.
