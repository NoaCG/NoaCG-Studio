# Optional WebGPU effects: vgpu assessment

Research date: 2026-09-19. Decision: retain HTML/SVG/CSS/data-driven graphics as the default;
add a conditional **P-GPU** investigation after the core editor, templates, animation, data
and playout are working. vgpu is the leading spike candidate, not an adopted dependency.
This document records architectural direction, not measured GPU compatibility or performance.
No package, shader, MCP server, runtime hook or persisted format is installed by this work.

## Recommendation and user benefit

A creator should add a Particle field or Procedural background preset, adjust brand colors,
density, speed and direction, and animate its exposed values with the usual timeline. The
result remains one selectable layer with normal placement, opacity, parent and span behavior.
The operator still edits ordinary text/data fields. Shader knowledge is not required.

This can add motion that is awkward or expensive to express as thousands of DOM elements.
Use CSS/SVG for ordinary gradients, shadows and small effects. Start with a seeded particle
field and procedural background, then consider local glow/distortion and self-contained 3D.
A full 3D authoring system and whole-document GPU compositor need separate evidence/scope.
Do not assume a shader can consume arbitrary HTML/SVG behind it: GPU texture APIs accept
specific image/canvas/video resources, not a general live DOM subtree. A distortion over
an image texture is bounded; capturing dynamic text, fonts, masks and HTML into a texture
without losing fidelity is a different feature. Keep core text/logos/data in the DOM.

## vgpu maturity, suitability and cost boundaries

As checked in the GitHub release API, **0.5.0 was published 2026-09-14**, following 0.4.0 on
September 3 and 0.4.1 on September 8. The 0.5 release includes breaking texture/binding API
changes and migration guidance. The stable channel is still pre-1.0: suitable for a pinned,
bounded experiment, not evidence of a stable broadcast dependency [S1].

The library is TypeScript, has WGSL/Vite integration and explicit GPU contexts/frames [S2].
That fits NoaCG's TypeScript/browser build without requiring React, Vercel hosting or a vgpu
scene graph. Published 0.5.0 has separate browser, node and mock exports; Three is an optional
peer. Its npm dependency graph also includes development/Node/MCP packages [S3]. Therefore
measure the emitted browser bundle, do not equate npm install size with exported runtime
size, and prove Node/Dawn/MCP/Three code stays out unless explicitly needed. Pin exact matching
public package versions at the spike; recheck releases then. Package compilation must happen
at build/export time, not require users to run npm or fetch shader modules on a playout host.

The pinned root/package licence is MIT [S4], a promising fit for app/CLI/export distribution
with notices retained. Audit the actual bundled dependency and example-asset licences before
shipping. MIT on the engine does not establish rights to every example/model/image. Native
Swift/Metal tooling remains beta and does not solve browser/CEF compatibility [S1].

Verdict: strong technical fit; API churn, real output compatibility and NoaCG-specific runtime
integration remain risks. Benchmark vgpu first. If it fails, compare a minimal native WebGPU
adapter for these bounded effects; evaluate Three's renderer separately if a later real 3D
workflow warrants its scene/assets tooling. Do not build multiple engines preemptively.

## Compatibility: source evidence, not host qualification

| Target | Verified upstream evidence | NoaCG decision |
|---|---|---|
| Desktop browsers | GPUWeb's August 2026 matrix lists Chrome/Edge on Windows/macOS, Firefox Windows/Apple Silicon and Safari 26; Linux/mobile support remains platform-specific [S5]. | Realistic on supported GPUs/drivers; runtime probe still required. |
| Editor preview and NoaCG browser output | Current preview uses sandboxed srcdoc, while exports/render documents have other composers. WebGPU needs a secure context [S6]. | Probe the actual iframe/origin, not just the parent tab. LAN HTTP is not equivalent to HTTPS/localhost. Preserve the sandbox. |
| OBS | Latest release checked: 32.2.2, August 14. Its CMakePresets pin CEF distribution 6533; browser submodule is 3f0a2cdf378939ebe3c6f9ab36d4ea100c25aac2 [S7]. Browser flags/shared-texture behavior differ from Chrome [S8]. | Conditional and unverified. Test Browser Source, local-file and URL paths, hardware acceleration, hide/show and source reload in each supported OS/build. Desktop Chrome success is insufficient. |
| Current CasparCG | Latest checked: 2.5.1-stable, September 16. 2.5 introduced CEF 142; 2.5.1 fixes missing Windows WebGPU libraries [S9]. Pinned html.cpp defaults configuration.html.enable-gpu to false and appends disable-gpu/disable-gpu-compositing when off [S10]. | Plausible with GPU enabled on a qualified machine. Default configuration is not a WebGPU guarantee; 2.5.0 Windows packaging is specifically suspect. |
| Older CasparCG and other CEF builds | 2.4 release notes identify CEF 117; installed fleets need not track latest [S9]. | Probe named builds individually. No blanket support claim or automatic host-setting change. |
| Headless harness | vgpu/node uses Dawn, supports Node 22+, and Linux needs appropriate Vulkan/software-renderer dependencies [S11]. | Useful separate rendering lane; not a substitute for embedded-browser or broadcast-output proof. |

Capability means: secure context, API present, adapter/device acquired, required features and
limits satisfied, shader compiled, and a first transparent frame presented. Record OS, CPU/GPU,
driver, browser/CEF/build, origin/scheme, acceleration/backend configuration and output path.
Feature detection beats user-agent/version checks. A usable adapter still says nothing about
sustained playout frame pacing, alpha correctness or competition with OBS encoding.

CasparCG test requirements include offscreen composition and actual fill/key or relevant output
capture, channel cadence and GPU contention. Probe enable-gpu=false and true; retain a working
fallback for the former. Existing permissive host flags are not a recommendation to relax
NoaCG's iframe isolation or ship unsafe browser flags as the solution. Actual YLE host/version
qualification remains separate. No OBS/CasparCG hardware test was performed for this research.

## Fit with the source and layer model

The code inspected at planning baseline 39adb2ed already provides useful boundaries:
- src/model/types.ts: SpxTemplate owns html/css/js, fields and relative assets. TemplateLayer
  is metadata (currently text/image/container/rect), not an independent scene document.
- src/preview/composeDocument.ts and src/components/PreviewFrame.tsx: in-document runtime,
  sandboxed iframe and message protocols; local js/css tags are stripped for inline preview.
- src/render/composeRenderDocument.ts and src/render/runtimeScript.ts: separate render composer
  and deterministic virtual-clock capture. Virtual rAF alone does not prove GPU work completed.
- src/export/targets/ograf.ts and the other target adapters package the graphic's runtime/assets.
- R1's operation registry, document revisions and source-derived identities supply editor seams.

At P-GPU, emit a real source-owned container/canvas with stable layer ID, fallback content,
readable versioned effect configuration and local runtime/shader assets. The future descriptor
should cover preset/version, validated parameters, seed, resource references, requirements and
fallback policy. This is a design sketch, not a schema committed ahead of fixtures. Derive
inspector/timeline metadata from it. Unknown effects retain their source and fall back or become
read-only. Follow persisted-format migration rules when the actual schema is introduced.

Expose bounded, typed parameters with units/ranges/defaults: color, density, emission rate,
speed, direction, intensity, texture and seed as applicable. Reuse normal selection, grouping,
span/visibility, transforms, undo and registry operations. Outer HTML transforms own placement;
the shader owns its internal pixels. Distinguish layer size from backing-buffer resolution and
keep output resolution independent of editor zoom/DPR. Future 3D internals stay inside the layer.

Animation samples and validated data updates feed the same parameter resolver. Establish one
owner per parameter (base, animation or binding) using the existing binding contract. Operator
fields expose only the chosen safe parameters. Reusing runtime update input needs no new feed
or credentials system. R3 data semantics must remain consistent, including recorded replay.

## One runtime, different host adapters

Yes, preview and live output can share effect implementation. Build one portable effect module
and bundle the same bytes/shaders with the graphic; only lifecycle/transport/resource resolution
adapters differ. Editor, render capture, NoaCG output, OGraf, SPX and CasparCG must all consume it.
Do not implement an editor-only React shader and approximate it in exports. Preview composition
must explicitly inject the module because existing local-tag stripping would remove a script
reference. Bundle relative resources and resolved WGSL with no CDN/runtime compiler dependency.

NoaCG owns time and lifecycle. A future effect adapter needs initialization/readiness, parameter
updates, render-at-time, reset/seek, resize and disposal semantics. Reuse the existing clock and
play/next/stop contracts. Entering a hold freezes entrance progression; an explicitly looping
ambient effect may continue on its defined loop clock. Out terminates emission or fades the
layer according to the preset; it does not replay In. Completion releases resources.

Start with analytic time-plus-seed effects so reverse scrubbing/replay is practical. Stateful
particle simulation needs fixed steps and deterministic reset/replay or bounded checkpoints;
it cannot seek backwards by applying negative delta time. Record timestamped data for replay.
Stable input does not promise bit-identical floating-point pixels across GPUs, so declare visual
tolerances. Capture must wait for initialization, submitted GPU work and presentation/readback
at the requested frame; a virtual-clock seek acknowledgement alone is not a capture barrier.

Device loss, allocation failure, late initialization and shader errors must switch only the effect
to its approved fallback and report through existing diagnostics [S12]. No broadcast error text
or blank full-frame canvas. Stale initialization results must be disposed after document changes.
Prewarm before taking a graphic on air, release resources on unload, and measure multiple live
layers/documents, memory and resize. Do not hide an unbounded retry or expensive readback per frame.

## Fallback and export policy

vgpu is a WebGPU library, not an automatic WebGL compatibility layer. Node software rendering
also does not provide a browser fallback. Every shipped preset must name a tested fallback:
- A CSS/SVG/Canvas2D approximation that retains the relevant parameters and data behavior.
- A packaged static poster or authored loop for decorative, non-data-bearing motion. A baked
  loop cannot preserve arbitrary interactive/data-reactive effects; label that limitation.
- A declared optional decoration may be omitted if the approved alternative composition stays
  complete. Essential information must never disappear silently.

Preview the target profile's fallback as well as the GPU result. Preflight warns about changed
appearance; block publishing/installation for a required effect with neither qualified GPU
support nor an acceptable fallback. Runtime probes can still fail later, so qualification does
not remove the packaged fallback requirement. Do not expand video authoring to implement a
fallback: use supported image/sequence formats when available, or a simpler static/DOM variant.

## Agent and harness value

vgpu's WGSL diagnostics, typed imports, versioned CLI documentation and example discovery can
reduce guessed APIs and shorten shader iteration. The hosted MCP is read-only docs/examples;
it is not NoaCG's document-editing bridge. Prefer package-matched local docs when pinned, since
the hosted service follows latest stable. Local MCP example downloads are unavailable on
Windows in 0.5.0; read-only access remains available [S13]. No MCP installation is needed now.

Use three evidence lanes later: mock tests for resource/command lifecycle; real Dawn/browser
renders for shader/pixel correctness; named OBS/CasparCG host/output runs for playout. Mocks do
not execute shaders. Fixed time, seed, dimensions, data and DPR make visual comparisons useful;
measure tolerated pixel differences and alpha over contrasting backgrounds [S14]. Keep our
existing queued graphics harness as the owner, with optional GPU-capable jobs and explicit
unsupported/skipped results. A software-renderer pass is not hardware performance evidence.

## Roadmap and minimal decisions now

**P-GPU.0 qualification spike** follows accepted R1 plus working R2.2 effects and R3.1 data/
playout contracts. It is optional and does not gate those releases or consume their critical
path. Pin the then-current vgpu version. Build two disposable fixture effects (procedural
background and seeded particles) with exposed parameters, shared source and fallbacks. Recheck
browser/OBS/CasparCG versions; measure the real host matrix below before deciding adoption.

**P-GPU.1 bounded presets** is conditional on that evidence: source-backed editable layers,
normal timeline/data operations, common runtime packaging, target-profile preview and tested
fallbacks. Extend to GPU-local glow/distortion/3D only after separate fixtures justify them.
The library remains replaceable behind that small effect boundary; vgpu's scene model is not
NoaCG's document. No new user-facing rendering-mode choice for ordinary graphics is needed.

Decisions for current implementation are documentation only: retain source-owned IDs and
operation/history seams, host-owned time, revision-aware asynchronous readiness and per-document
cleanup; keep unknown source intact and compositors modular. These are existing R1 mechanisms.
Do not add a generic renderer registry, GPU layer enum/schema, dependency, device manager or
browser policy change now. Actual async GPU completion and packaging integration are P-GPU work.

### B20 closing evidence (optional P-GPU, all unverified)

1. Version/licence and clean-bundle inspection: exact shipped JS/WGSL hashes, notices, offline
   package run, zero GPU dependency cost on graphics without effects.
2. Host matrix: supported Chrome/Edge, Firefox and Safari platform samples; OBS 32.2.2 or actual
   target release; CasparCG 2.5.1 and installed older deployment; acceleration off/on and real
   output capture. Record unsupported profiles rather than replacing them with desktop Chrome.
3. Repeated same-time render, backwards seek, data replay, In/hold/Next/Out, Out during In and
   looping motion, save/reopen/undo and exported-package parity. Wait for GPU completion.
4. Forced no API/no adapter/device loss/compile failure/budget failure: approved fallback keeps
   text/data/alpha and playout usable; required unsupported content blocks before on-air use.
5. At representative 1080p25/50 and 1080p60, record cold/warm readiness, p50/p95/p99 frame time,
   missed output frames, peak memory and concurrent layer/source load during encoding/output.
   Whole-output budget is 40/20/16.67 ms respectively; allocate effect headroom from measured
   baseline, not that entire budget. A 30-minute loop/reload/resize soak has no growing resources
   or device-loss crash. If targets fail, reduce preset scope or retain fallback-only support.

## Primary sources checked

S1. [vgpu 0.5.0 release](https://github.com/vercel-labs/vgpu/releases/tag/v0.5.0) and [release history](https://github.com/vercel-labs/vgpu/releases).
S2. [Pinned API README](https://github.com/vercel-labs/vgpu/blob/v0.5.0/packages/vgpu-api/README.md) and [WGSL integration](https://github.com/vercel-labs/vgpu/blob/v0.5.0/packages/wgsl/README.md).
S3. [Published package metadata](https://registry.npmjs.org/vgpu/0.5.0).
S4. [Pinned MIT licence](https://github.com/vercel-labs/vgpu/blob/v0.5.0/LICENSE).
S5. [GPUWeb implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status).
S6. [WebGPU API/security requirements](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) and [texture input boundary](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/importExternalTexture).
S7. [OBS 32.2.2 release](https://github.com/obsproject/obs-studio/releases/tag/32.2.2) and [CEF build pin](https://github.com/obsproject/obs-studio/blob/32.2.2/CMakePresets.json).
S8. [Release-pinned OBS browser flags](https://github.com/obsproject/obs-browser/blob/3f0a2cdf378939ebe3c6f9ab36d4ea100c25aac2/browser-app.cpp). [Older OBS adapter-failure report](https://github.com/obsproject/obs-studio/issues/11745) is historical, not proof about 32.2.2.
S9. [CasparCG 2.5.1 release](https://github.com/CasparCG/server/releases/tag/v2.5.1-stable) and [release history](https://github.com/CasparCG/server/releases).
S10. [CasparCG 2.5.1 HTML configuration source](https://github.com/CasparCG/server/blob/v2.5.1-stable/src/modules/html/html.cpp).
S11. [Pinned Dawn adapter requirements](https://github.com/vercel-labs/vgpu/blob/v0.5.0/packages/adapter-node/README.md).
S12. [WebGPU device-loss behavior](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost).
S13. [Pinned vgpu MCP guide](https://github.com/vercel-labs/vgpu/blob/v0.5.0/apps/docs/content/docs/mcp.md).
S14. [Pinned browser testing](https://github.com/vercel-labs/vgpu/blob/v0.5.0/apps/docs/content/docs/guides/browser-testing.md), [mock adapter](https://github.com/vercel-labs/vgpu/blob/v0.5.0/packages/adapter-mock/README.md) and [production checklist](https://github.com/vercel-labs/vgpu/blob/v0.5.0/apps/docs/content/docs/guides/shipping-to-production.md).
