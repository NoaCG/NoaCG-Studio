# Local Codex preview trial

Opt-in phase 1 infrastructure for [the preview plan](../../docs/work-specs/codex-graphic-preview/spec.md).
One local lower third, a live isolated frame, element/region selection and an
explicit image-bearing request to the active native task. No model API, editor,
account, database, delivery or on-air output is used.

## Prepare and install

Use Node 24 and a system Chrome/Edge, or set `NOACG_BROWSER` to a Chromium
executable. From the repository's feature worktree:

```powershell
npm ci --prefix cli/plugin-preview
npm run build --prefix cli/plugin-preview
npm test --prefix cli/plugin-preview
codex plugin marketplace add "$PWD/cli/plugin-preview"
codex plugin add noacg-preview-trial@noacg-preview-local
git worktree lock --reason "Installed noacg-preview-trial runtime; unlock after uninstall" "$PWD"
```

Build prepares an ignored local marketplace and `runtime.local.json`. Codex copies
the plugin into its cache. The cached `launch.mjs` deliberately starts the pinned
runtime in this original worktree, including its `node_modules` and built UI.
Keep this worktree locked and those files until uninstalling the trial so automatic
post-landing cleanup cannot remove the installed runtime. This is an explicit
local development dependency, not a portable distribution. The build never
modifies the installed `noacg` skill or the public marketplace. The trial is excluded
from the CLI npm `files` list and toolkit generator.

The current conversation may need an app restart or a fresh turn to discover
the plugin. Installation alone does not establish MCP App support. Open the thread
panel entry, or ask the native task to call `noacg_preview`. If the tool is absent,
reload before trying again. If the host lacks the `openai/message` capability,
the panel leaves sending disabled and reports that limitation.
The UI resource advertises inline and fullscreen display modes and prefers
fullscreen through the documented OpenAI resource metadata. This lets a supporting
desktop host open its inspectable app panel instead of defaulting to an inline card.
If an installed tool returns `Transport closed`, restart the desktop app, reopen
this task, then call `noacg_preview` again. Supported removal/reinstallation and a
new trial version did not replace the closed connection in the existing session.
Until the reopened task completes the real selection/image/edit/refresh journey,
phase 1 remains open in [#1314](https://github.com/NoaCG/NoaCG-Studio/issues/1314).

## Try the native round trip

1. Call `noacg_preview`. Confirm the panel renders the lower third and its local
   source details name this worktree, not the plugin cache.
2. Click the name, enter a change such as "Make the name 66 px", then select
   **Send change to this task**. The active native conversation must receive the
   request, selected `f0`, absolute source root, exact `files-sha256` revision and
   a PNG image. Record what the task actually receives.
3. Have that same native task edit `cli/plugin-preview/fixture/graphic.css` with
   its normal file tools, run NoaCG validation/screenshots on a ZIP snapshot and
   inspect the result. A directory validation rewrites the CLI package layout,
   so use the ZIP below to preserve the fixed fixture paths. Call `noacg_preview`,
   or use **Refresh source**. Confirm the panel
   displays the larger name and new revision. Refresh clears selection.
4. Choose **Region**, drag a rectangle, and submit another explicit request.
   The rectangle uses 1920 × 1080 graphic coordinates and should stay aligned
   when resizing the panel. A source edit before submission must be refused
   until refresh and reselection.

Source is always the four files in `cli/plugin-preview/fixture/`. No tool here
writes them. File edits persist across reopening; selection is intentionally
ephemeral. Returning a file to its earlier contents restores its prior revision.
Use ordinary file tools to restore only the intended change.

## Boundary and data

The local server reads only the fixed HTML, CSS, JS and SVG fixture files plus its
own app resources. The preview tool sends their source identity and an actual
PNG to the task. HTML and hit regions are app-only tool metadata. Clicking Send
adds the requested text/context and that PNG to the active conversation through
MCP Apps `ui/message`, with OpenAI `target: active` and `send: true`. There is no
clipboard route or separate agent. There is no background request submission.

The graphic runs in a nested iframe with `sandbox="allow-scripts"` only, on an
opaque origin. Its CSP denies networking, frames, forms and objects; the one
relative SVG, stylesheet and script are inlined. It receives no bridge or key.
The server captures with the CLI's contained browser helper, a fresh credential-free
context and a hard timeout. This static fixture has no animations; generic package
loading, fonts, field controls and rehearsal belong to later phases.

## Verify and remove

```powershell
node --test scripts/codex-preview-trial.test.mjs
npm test --prefix cli/plugin-preview
npm run queue -- "npm run test:browser --prefix cli/plugin-preview"
Compress-Archive -Path cli/plugin-preview/fixture/* -DestinationPath cli/plugin-preview/dist/fixture-after.zip -Force
npm run queue -- "npx --yes @noacg/cli@0.12.2 validate cli/plugin-preview/dist/fixture-after.zip --screenshots cli/plugin-preview/dist/validation-after --json"
```

The browser test uses real source, PNG capture and MCP tools with a simulated
message host. It checks isolation, click/region selection, stale refusal and
refresh. It cannot pass desktop AC-1 or AC-2. Record browser, actual host and owner
judgment separately in the [phase receipt](../../docs/work-specs/codex-graphic-preview/phase-1.md).

Use `codex plugin remove noacg-preview-trial@noacg-preview-local`, then
`codex plugin marketplace remove noacg-preview-local`. To keep it installed but
disabled, set `[plugins."noacg-preview-trial@noacg-preview-local"] enabled = false`
in the applicable Codex configuration. Restart the app if the current session
retains the tools. Rebuild UI changes in the original worktree; reinstall if the
manifest, launcher or local runtime location changes. Restart its MCP connection
after server-code changes; rebuilding does not reload code in a running Node process.
After uninstalling, unlock this worktree with `git worktree unlock <worktree-path>`
before normal cleanup. Preserve any wanted fixture edits first.

## Contracts checked

Checked 2026-10-16 against official [MCP App UI guidance](https://developers.openai.com/plugins/build/chatgpt-ui),
[extensions](https://developers.openai.com/plugins/build/extensions) and
[local packaging](https://developers.openai.com/plugins/build/plugins), and the
linked [OpenAI SDK source](https://github.com/openai/mcp-extensions/tree/main/typescript).
Pinned: MCP SDK 1.30.0, MCP Apps 1.7.5, OpenAI extensions 0.2.0. The OpenAI SDK's
declared compatible MCP Apps version is used rather than the incompatible 2.x
major. Current documentation defines a thread tool entrypoint and image content
in `ui/message`; actual compatibility remains a host check.
