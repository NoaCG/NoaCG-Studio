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

No preview tool appeared dynamically in that ongoing turn, and the native MCP Apps
surface had no tab. App reload/fresh turn remains necessary before the actual host
check. Received native message/image, displayed panel and
native before/after source-edit receipts are not yet recorded.

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
  no terminal passing job verdict. The browser-priced retry remains queued for
  enough free memory. The final test adds host-style CSP enforcement and a
  retained screenshot, so it still needs that retry or the focused CI job.
- Focused CI: `.github/workflows/preview-trial.yml` installs the pinned trial,
  builds it, runs its unit/MCP tests, then only its browser protocol journey.
  Artifact `preview-trial-browser-stub` contains `dist/browser-stub.png` on success.
  CI has not run at the time of this local receipt.
- Actual Codex desktop AC-1/AC-2: **not checked**. Installation is not host proof.
- Later AC-3/AC-4/AC-5 and owner visual judgment: **not checked**; outside phase 1.

## Next actual host check

Follow `cli/plugin-preview/README.md`. Record the app version, reviewed source
commit, exact before/after fixture revisions, selected target or region, native
message text and actual image receipt, normal file edits, validation/screenshot
tools and refreshed displayed result. If the host does not load the UI or cannot
route the image-bearing request into the active native task, keep phase 1 open
and stop expansion. No browser simulation can replace that gate.
