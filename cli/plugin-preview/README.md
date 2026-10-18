# Local Codex package preview trial

Opt-in phase 2 implementation for [the preview plan](../../docs/work-specs/codex-graphic-preview/spec.md):
one local source package, an isolated live frame, generated sample fields,
lifecycle/operator rehearsal and element/region selection. Explicit Send attaches
the captured PNG and current rehearsal context to the active native task. Source
files remain authoritative. No model API, editor, account, delivery or output is used.

Phase 1 independently passed in [#1314](https://github.com/NoaCG/NoaCG-Studio/issues/1314)
for installed plugin 0.1.3 / MCP SDK 1.30.0. This candidate is 0.1.4 / SDK 1.31.0;
its native Windows compatibility and rendered AC-3 inspection are **unverified**.
Cloud browser tests cannot pass that gate. Continue in
[#1491](https://github.com/NoaCG/NoaCG-Studio/issues/1491), then obtain the independent
phase verdict before phase 3.

## Prepare a separate runtime

Use Node 24 and an existing Chrome/Edge, or set `NOACG_BROWSER` to an existing
Chromium executable. Work in a NEW feature worktree at the implementation SHA
recorded by the PR. Never access, rebuild, modify or clean the preserved installed
runtime at `C:/Users/ahonemi/.codex/worktrees/graphic-preview-resume/NoaCG-Studio`.
Do not remove its plugin or original marketplace.

From the new worktree in PowerShell:

```powershell
npm ci --prefix cli/plugin-preview
# Reconstruct the same source package as the focused browser evidence.
node --input-type=module -e "import { writePackage } from './cli/plugin-preview/test/package-fixture.mjs'; await writePackage('./cli/plugin-preview/dist/native-phase2-package');"
$Phase2Package = Join-Path (Get-Location) 'cli/plugin-preview/dist/native-phase2-package'
npm run build --prefix cli/plugin-preview -- --package "$Phase2Package" --entry square.html
npm test --prefix cli/plugin-preview
npm run queue -- "npm run test:browser --prefix cli/plugin-preview" --cap 5
```

Alternatively copy the focused CI artifact's `phase2/source-package/` to a NEW
local directory and use that directory as `--package`. The cloud receipt's `/tmp`
sourceRoot is historical; configure the actual new Windows path. To preview another
source package, set its directory and relative HTML entry explicitly. Running build
without arguments selects the unchanged phase-1 fixture; it does not retain a previous
package selection. Rebuilding server/UI code requires restarting its MCP connection.

Build writes ignored bundles, a local marketplace and `runtime.local.json` in this
new worktree only. The package root and entry are fixed there, not accepted from
an untrusted tool argument. All runtime/package files must remain available while
installed. The cached launcher starts this exact runtime, rather than its cached copy.

## Install and discover this candidate

This candidate uses a separate plugin, marketplace, MCP server key and UI URI so
it can coexist with the preserved 0.1.3 installation:

```powershell
git worktree lock --reason 'Installed noacg-preview-phase2-trial runtime' "$PWD"
codex plugin marketplace add "$PWD/cli/plugin-preview"
codex plugin add noacg-preview-phase2-trial@noacg-preview-phase2-local
```

Restart/reopen Codex if needed. Discover the **phase2** connection's `noacg_preview`
tool (normally `mcp__noacg_graphic_preview_phase2__noacg_preview`) and open its
actual conversation panel. The heading is **NoaCG package preview trial**. Check
Local source names the NEW runtime/package directory and the expected digest.
Do not replace the old connection to repair a missing new one. Absent discovery,
closed transport, missing host message support or a rejected install remains a
qualification gap, not a successful native test.

The tool resource requests inline/fullscreen display and prefers fullscreen. A host
without serverTools or OpenAI message support leaves dependent actions disabled.
Sending uses the host-qualified tool name and MCP Apps `ui/message` with OpenAI
`target: active`, `send: true`. There is no clipboard or second-agent route.

## Inspect AC-3 on Windows

1. Confirm the real panel is square (1080 × 1080), with the relative badge and bundled
   Inter font rendered. Inspect the graphic and controls at wide and narrow panel sizes.
2. Edit Headline, Score, Edition, Show badge, Accent and Notes; press **Update preview**.
   Use **Goal +1**, **Out**, **Take**, **Next** and **Reset rehearsal**. The graphic and
   inputs must agree; Out disables an action the current state cannot accept.
3. Select **Headline** by click or its named keyboard button. Resize the panel and
   inspect the outline against the actual rendered text. In **Region** mode drag an
   unmapped area; inspect that rectangle after another resize.
4. Enter one explicit request and press **Send change to this task**. Confirm the active
   native task actually receives its PNG, source digest, package path, selected bounds,
   sample values and rehearsal state. A panel acknowledgement alone is not receipt.
5. Record app/CLI/plugin/SDK versions, exact implementation SHA, source digest, screenshots,
   received content and owner inspection. Confirm rehearsal did not change package files.
   Keep #1491 open if any desktop criterion is missing. Do not start phase 3 yet.

Refresh resets rehearsal and clears selection. Rehearsal also clears selection because
sample content may have changed the layout. A current-view identifier refuses a request
from another panel's superseded rehearsal, even when source bytes are unchanged. Source
edits before submission are refused until refresh and reselection. These are safeguards,
not the full phase-3 validation/history/restoration workflow.

## Package and containment boundary

The supported input is the ordinary SPX/NoaCG source layout: a chosen HTML entry,
relative classic JavaScript (including defer), stylesheets/imports, images and fonts.
The exact-byte digest covers its sorted dependency closure; unrelated files are not read.
Relative markup, CSS URLs and literal image/font paths in classic JS are embedded as data.
Authored dimensions come from the product's existing format detector, not a fixed 16:9 box.
ES-module/async entry scripts, dynamic resource loading, remote dependencies and third-party
OGraf-only web components are not supported by this trial. Missing resources fail explicitly.

Only the configured directory is readable. Traversal, hidden paths, symlinks, special files
and external resource paths are refused. Limits: 128 dependencies, 4 MiB per file, 16 MiB
source bytes, 24 MiB expanded document and a 4096 px maximum canvas dimension. These bound
the local trial; they do not change repository test/resource limits.

All package execution and metadata extraction occur in the CLI's contained, fresh browser
context with no credentials, permissions, downloads or service workers, a request allowlist,
WebSocket blocking and a ten-second capture deadline. The Node server never evaluates an
SPX definition. Shared fieldDescriptors, eventButtons, eventPayload, event legality, format
detection and settleGraphic supply the existing product control semantics, without editor UI.

The panel's graphic is a separate `sandbox="allow-scripts"` iframe with an opaque origin.
Its early CSP blocks networking, frames, forms and objects; it receives no trusted bridge,
keys or filesystem access. The app never handles graphic-origin tool messages. Each rehearsal
replays at most 24 local operations, captures a fresh PNG and target bounds, and rebuilds the
isolated document. This is bounded rehearsal, not frame-accurate replay for arbitrary clocks,
randomness, long animations or external data. Such graphics need further qualification.

## Verify, evidence and remove

```powershell
npm test --prefix cli/plugin-preview
npm run queue -- "npm run test:browser --prefix cli/plugin-preview" --cap 5
```

The browser tests cover the original source-edit journey and a square source package with
nested CSS, a local font, six field kinds, a custom action and both selection modes at two
sizes. They inspect actual PNGs, source bytes, sandbox access and blocked network/file reads.
The host is simulated. Focused Actions artifact `preview-trial-browser-stub` retains the
phase2 frames, receipt and reconstructable source package alongside phase-1 evidence.
See [phase notes](../../docs/work-specs/codex-graphic-preview/phase-2.md) for verdicts and gaps.
No public CLI/npm/toolkit distribution includes this private trial.

Remove only this candidate with `codex plugin remove noacg-preview-phase2-trial@noacg-preview-phase2-local`,
then `codex plugin marketplace remove noacg-preview-phase2-local`. To disable it instead, set
`[plugins."noacg-preview-phase2-trial@noacg-preview-phase2-local"] enabled = false` in the applicable
Codex configuration. Restart if the session retains tools. Preserve wanted package edits;
unlock only this NEW candidate worktree after uninstall. Leave the preserved 0.1.3 runtime alone.
