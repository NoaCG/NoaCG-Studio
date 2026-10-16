# Phase 1 local trial receipt

Status: infrastructure prepared; phase 1 remains open. AC-1 and AC-2 require an
actual native Codex conversation round trip and are not passed by these checks.

The implementation is confined to `cli/plugin-preview` and its pure source/protocol
build-gate test. It uses one editable local lower third, a thread MCP App resource,
exact file revisions, the CLI's isolated browser helper and a real PNG. The app
submits the selected element/region, request and PNG through the supported
OpenAI extension to the active conversation. No separate reasoning service,
unfinished editor, account, database or production output is involved.

## Installation receipt, 2026-10-16

The coordinating native task installed/enabled
`noacg-preview-trial@noacg-preview-local` using supported CLI commands.
CLI version: `codex-cli 0.163.0-alpha.5`.
Desktop app package version: `26.1007.9446.0` (read by the coordinator from the
actual `ChatGPT.exe` package path).
Cache: `C:/Users/ahonemi/.codex/plugins/cache/noacg-preview-local/noacg-preview-trial/0.1.0`.
The cached launcher imports the explicitly prepared source worktree's runtime.
SDKs: MCP 1.30.0, MCP Apps 1.7.5, OpenAI MCP extensions 0.2.0.

The tool subsequently became available dynamically in the same native task.
Against source commit `0fb9ebae72a4fdb7cbee8212227651087563602c`, the coordinator
called `noacg_preview` and received/inspected a real, legible PNG, package ID
`noacg-preview-lower-third`, exact revision
`files-sha256:48496423f8fb86a74273ae42e8a12e8a01b4940f06f4a83dff6dbd73ab7d4032`
and the correct absolute fixture path in the phase-1 worktree. The actual MCP Apps
surface still reported no tab. Opening the panel, native selected request/image
receipt and native before/after source-edit refresh are not yet observed.
The owner subsequently reported the inline textbox and Send control visible.
The resource now advertises inline/fullscreen and prefers fullscreen with the
documented `openai/ui` metadata so the host can open an inspectable panel; that
metadata change still needs its own actual host observation.

The actual cached launcher also served both tools and the MCP App resource over
stdio in a separate protocol probe. This proves cached startup, not panel support.
The runtime worktree is locked with reason "Installed noacg-preview-trial runtime;
unlock after uninstall" to preserve its ignored dependencies and build outputs
through automatic post-landing cleanup.

## Evidence

- Source/protocol tests: exact image/context contract, stale/unknown target and
  invalid region refusal, coordinate selection, exact-byte source digest and
  asset containment, exclusion from npm/toolkit distribution.
- Local build and seven trial unit/MCP tests passed. Selected repository gates
  passed (12 tests across two files, plus relevant shape/docs/workflow checks),
  and ESLint passed for `scripts/codex-preview-trial.test.mjs`. Root dependencies
  were installed without lifecycle scripts; no full application build ran.
- MCP tests: thread entrypoint/resource registration, app-only request tool and
  request refusal before a matching preview exists.
- Local browser journey: queue job `j-4535` ran the complete assertion path and
  printed the PNG/before-after verification line, then was stopped and requeued
  when admission detected Chromium in a command priced as light work. There is
  no terminal passing job verdict. Its browser-priced retry was cancelled once
  focused CI started; no unowned local retry remains.
- Focused CI: `.github/workflows/preview-trial.yml` installs the pinned trial,
  builds it, runs its unit/MCP tests, then only its browser protocol journey.
  [Run 38955385716](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38955385716)
  passed all of those steps on `0fb9ebae72a4fdb7cbee8212227651087563602c`: seven
  unit/MCP tests and one actual Chromium journey under host-style CSP, including
  `frame-src 'none'`. Artifact `preview-trial-browser-stub` contains
  `dist/browser-stub.png`. Builder and coordinator inspected it: narrow panel
  controls are legible and unclipped; region stays aligned. This is explicitly a
  browser host stub, not actual desktop proof. A later fixture lifecycle fix
  starts it hidden until Take; the preview explicitly Takes its isolated copy.
- CLI npm dry run checked 13 included files with zero `plugin-preview` files.
- Actual Codex desktop AC-1/AC-2: **not checked**. Installation is not host proof.
- Later AC-3/AC-4/AC-5 and owner visual judgment: **not checked**; outside phase 1.

## Next actual host check

Follow `cli/plugin-preview/README.md`. Record the app version, reviewed source
commit, exact before/after fixture revisions, selected target or region, native
message text and actual image receipt, normal file edits, validation/screenshot
tools and refreshed displayed result. If the host does not load the UI or cannot
route the image-bearing request into the active native task, keep phase 1 open
and stop expansion. No browser simulation can replace that gate.
