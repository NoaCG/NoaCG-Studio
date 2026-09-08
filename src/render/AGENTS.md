# src/render - deterministic video/image rendering

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this directory's CLAUDE.md import; Codex reads it directly). Keep it accurate.

The contract layer for the Remotion exporter (render-worker/ is the renderer, api/ the
service). The core promise: **manifest + frame number = exact pixels** - a frame never
depends on rAF timing, CPU speed, or the wall clock.

**Manifest v2 is a discriminated union on `kind`:** 'html' (the SPX document path - the
timing/schedule/measurement machinery below applies to it ONLY), 'remotion' (the AI
video editor's authored composition: compiledJs + inputProps + fixed durationInFrames;
rendered by the worker's composition `noacg-user` via a require shim identical to
the live preview's player host, so preview and render run the same code), and
'hyperframes' (the video editor's HyperFrames engine: a COMPOSED self-contained document
- src/video/hyperframes/compose.ts in 'render' mode - + fixed durationInFrames; rendered
by the worker's `noacg-hyperframes` host, which drives the injected driver's
__noacgHfRender one seek per frame - the NoaCGGraphic pattern minus schedule/measurement;
HYPERFRAMES_RUNTIME_VERSION is its handshake).
`buildVideoManifest.ts` (PURE) builds the remotion and hyperframes kinds (the caller
composes the document - composition is browser-only); the UI is
components/video/VideoRenderPanel (shares RenderFormatPicker + RenderJobSection with the
SPX RenderPanel). Assets ride as data URLs inside inputProps against the 4 MB manifest
cap - the panel shows a budget meter; the composition's editable inputs ride alongside them
as `inputProps.fields` (the same `{key: value}` bag the live preview passes), so a render
reproduces exactly what previews. `durationInFrames()` and `ManifestSummary` take
either kind.

## Purity rule (load-bearing)

`manifest.ts`, `schedule.ts`, and `limits.ts` are PURE - no DOM, no `?raw`, no
`import.meta`. The Remotion composition in render-worker/ imports them relatively and
webpack-compiles them, and the api/ functions import them under Node. Vite-isms in these
three files break the renderer build. Lint-enforced: the purity-trio block in
eslint.config.js (docs/ARCHITECTURE.md §3, invariant 2) fails the build on DOM globals,
query-suffix imports, and `import.meta` in these files. Browser-only modules (composeRenderDocument,
measure, buildManifest, config) may use anything the app uses.

- **manifest.ts** - RenderManifest (the versioned job contract), RENDER_FORMATS metadata,
  MeasuredDurations, RenderCue/Segment/Schedule, durationInFrames. `width`/`height` are the
  AUTHORED template resolution - output sizing goes through `scale`, never by resizing the
  document (marquee widths, credit-roll heights, and --scale depend on layout at the
  authored size). UI labels must keep "Project format (authored)" separate from "Output
  settings" and explain every non-1 output scale as scaling, not layout reauthoring.
- **schedule.ts** - computeSchedule: the duration/HOLD model. User picks TOTAL duration;
  measured animation durations are preserved; the remainder splits EQUALLY across hold
  slots (after IN + after each played step, never after OUT). total < fixed = hard error.
  Continuous phases (repeat:-1, duration >= 1e7 s) cost 0 fixed time. Cues snap to the
  frame grid. Imported templates without builder globals only render with outMode 'none'.
- **limits.ts** - RENDER_LIMITS tiers (anonymous/free/paid) + RENDER_CONFIG: every
  configurable number lives here; UI checks are UX, api/ re-validates authoritatively.
  `resolveTier()` is the single seam a plan row's `render_tier` enters through; the `paid` name
  is a cap table for grants, not a product - NoaCG sells nothing (`docs/OWNER_RULINGS.md`). Every tier number is
  PER PRINCIPAL and is only checked once a request is parsed; the flood guards in front of
  them are `RENDER_CONFIG.startRateLimit` (the burst gate, api/_lib/rateLimit.ts) and
  `RENDER_CONFIG.globalConcurrency` (the fleet ceiling, api/_lib/admission.ts), both with
  env overrides read in the api module - docs/RENDER.md.
- **runtimeScript.ts** - RENDER_RUNTIME_JS: the virtual clock (Date/performance/timers/rAF
  virtualized, network stubbed) + `__noacgRender` { prepare, setSchedule, seek, vNow,
  getErrors }. The graphic executes its REAL cue lifecycle (update -> play -> next -> stop)
  against virtual time; GSAP is driven by gsap.updateRoot(t) after GSAP_DETACH_JS removes
  its ticker hook. Injection order (composeRenderDocument owns it): runtime FIRST, then
  GSAP, then the detach snippet, then styles, then template JS. Seeks are monotonic - the
  host hard-resets (fresh iframe) for backward seeks. Measurement reset is
  SNAPSHOT/RESTORE of every element's inline style attribute, NOT gsap clearProps -
  clearProps wipes AUTHORED inline styles once a probe touched the element, un-hiding
  the display:none data holders (the quiz's correct-answer div aired as a stray "B"
  until this bit).
- **composeRenderDocument.ts** - the render document: preview-style inlining + bundled
  fonts fetched from /fonts as data URLs + polling blocks (LIVE DATA / SHOW CHAT / REMOTE
  CONTROL) stripped. color-scheme must MATCH the Remotion host page (default light) or
  Chromium paints the iframe opaque and kills alpha.
- **measure.ts** - the client estimate pass: hidden iframe AT TEMPLATE RESOLUTION ->
  prepare() -> MeasuredDurations. The renderer re-measures in its own page; those numbers
  are authoritative. Both feed the same computeSchedule.
- **buildManifest.ts** - template + sampleData + user options -> RenderManifest (stamps
  epochMs; snapshots data).
- **config.ts** - isRenderConfigured() (VITE_RENDER_API) - the ONE feature-detection
  point; unset = zero render UI (offline posture, same as backend/config.ts).
- **types.ts** - job-state/DTO wire contract between the UI and api/render (PURE, like
  manifest/schedule/limits).
- **client.ts** - startRender/fetchStatus/cancelRender/downloadHref: the backend-agnostic
  seam (attaches the Supabase JWT; the server resolves tiers). The UI never knows WHAT
  renders - local executor or Vercel Sandbox.
- **renderJobStore.ts** - the active job's zustand slice: serialized polling, terminal
  stop, sessionStorage resume across reloads. One job per session.

The service lives in `api/render/*` (fetch-style handlers, also mounted on the dev server
by scripts/renderDevPlugin.mjs) with seams in `api/_lib` (JobStore: memory | Supabase
render_jobs; RenderExecutor: local child process | Vercel Sandbox via @remotion/vercel).
The renderer is `render-worker/` (own pinned package - the Remotion dependency never
enters the app bundle). Full architecture + ops: docs/RENDER.md. Verify render changes
with `node scripts/render-smoke.mjs` (dev server running) - the real local full loop -
plus `render-smoke-video.mjs` (remotion kind) and `render-smoke-hyperframes.mjs`
(hyperframes kind), both pixel-checked.
