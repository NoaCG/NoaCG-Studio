# Phase 1 native preview receipt

Status: the installed 0.1.1 native compatibility journey passed AC-1 and AC-2.
The recovered 0.1.2 source adds two reviewed host compatibility fixes. Its native
reload/recheck and independent landed-main check remain pending; do not begin
phase 2 until those gates are recorded here and in issue #1314.

## Actual Windows journey, 2026-10-17

- App: Codex Windows package 26.1013.4894.0. CLI: 0.163.0-alpha.5.
- Installed plugin: noacg-preview-trial@noacg-preview-local 0.1.1.
- SDKs: MCP 1.30.0, MCP Apps 1.7.5, OpenAI extensions 0.2.0.
- Runtime source: ea98f7d1593c3663a537fb6302163e0b1693c848, followed by the
  selected CSS edit committed as 3df52b05906d0ccb06242d7e7f8eb697bd782b87.
- Preserved runtime: C:/Users/ahonemi/.codex/worktrees/codex-graphic-preview-p1/NoaCG-Studio.
  It remains locked temporarily to preserve the earlier draft; 0.1.1 has now been uninstalled.

The restarted native tool returned the actual lower-third PNG and its source
identity. The owner opened the conversation side-panel entry and clicked Alex
Morgan. CUA then observed the actual panel's Name selection, filled the request
and clicked Send. The active native task received the request, context and PNG
in the following turn, without a second model service or another manual message.
The host queues this submission behind a running turn; a panel acknowledgement
alone was not used as evidence of model receipt.

The actual received request was: "Make the selected name 66 px. This is the phase
1 native preview test: edit the real fixture source, validate it with NoaCG, and
refresh this panel."

Context received: package noacg-preview-lower-third; selection element f0, Name;
1920 x 1080; Name Alex Morgan and Role Studio correspondent; settled fixture;
the absolute runtime fixture source root and all four source filenames. Selected
bounds were x252, y828.203125, width312.0625, height59.796875. The MCP App text
receipt source ID was session:f7f597ce-c3ee-4456-bb61-b9cd4da15d74; the actual
PNG arrived in the same native input. Owner authorization remains the explicit
phase-1 request; the app payload supplies data, not new authority.

The task used ordinary file tools to change only #f0 font-size from 52px to 66px.

| State | Exact four-file revision |
| --- | --- |
| Before | files-sha256:8dde8a7398c3d3a09d8bf499bdee9643d931a759ee7af28de7e34d5bf4db086f |
| After | files-sha256:cde50027ff28af1a3e7a0b5861de719e282997fc37ce8f99e213e111560ac5ac |

CUA clicked the real Refresh source button. The actual panel returned Ready,
showed the after revision, rendered f0 as 66px and cleared the selection. The
native preview tool also returned the edited PNG and same after revision.
The actual native-tool PNGs are retained locally, outside Git, in
C:/Users/ahonemi/.codex/visualizations/2026/10/16/01a14564-a79b-7982-a535-8dfd8de6adcf/noacg-native-phase1:

- before.png SHA256 f386f4e33bdc90db1efed67691c507be95209058b4bcddb34b58047f83e455dc
- after.png SHA256 b7941b8d5a0799d57f5f651dd50c2842ba972e8bc2ccc36f1e5eda1aa9154336

They are native-tool PNGs, not screenshots of a simulated host or the whole
Codex window. The installed local draft retains the edit.

## NoaCG validation and visual inspection

Local browser job j-4579 was queued with browser pricing, then cancelled before
it started because the laptop had about 0.7 GB free and needed 3.5 GB. No local
validation pass is claimed and no limits were changed.

[Focused CI run 39064556389](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39064556389)
on b79ec150cfa585b5ac24cec20f4423956f63cd9d independently reconstructed the exact
four edited files and asserted the after files-sha256 above before invoking:

```text
npx --yes @noacg/cli@0.12.2 validate dist/native-edited-fixture.zip --screenshots dist/validation-after --json
```

The normal static gate and runtime bench passed with zero errors; benchSkipped
was null. Fields, lifecycle, layout, legibility, stress and export readiness
passed. The CLI's normalized digest was
sha256:a09aa53f9a7b99a7e8bcf98632bcc6a22fc9d0928a66138f1844e1862c44597e.
This is distinct from the exact source-file revision.

Three bench-editability warnings remain: no editor structure spine, no timeline
animation data/interpreter, and incomplete editor style variables. These belong
to the unfinished editor, which the agreed spike explicitly does not depend on.
The fixed trial is not a production-ready editable-template claim.

The coordinator downloaded and inspected off.png, onair.png and stress.png.
Off is transparent; on-air matches the larger-name composition; doubled names
and roles remain within the panel and safe frame. Artifact preview-trial-browser-stub
contains those frames, native-edited-source.json and noacg-validation.json.
The same run passed 11 unit/protocol tests and the Chromium host-stub journey.
The browser stub is protocol evidence, never the actual native-host receipt.

## Recovery and remaining gate

PR #1311 was removed by the batch rollback #1338 after an unrelated thumbnail
expectation failed. That behavior was repaired in #1337 and re-landed in #1343.
Recovery PR #1413 restores only the preview paths on current main and fixes both
unresolved #1311 findings: preserve host-qualified tool names, and disable Send
without serverTools. Focused regression tests failed before those fixes and
passed afterward. The private version and UI cache URI advance to 0.1.2 so an
existing installation cannot silently retain old assets. This updated adapter
has not yet been claimed as native-tested.

Version 0.1.2 is now installed/enabled from the locked runtime
C:/Users/ahonemi/.codex/worktrees/graphic-preview-resume/NoaCG-Studio at
f150845b0c519dfba4f0a8655f7d2ae56ea1abe6. Its baseline fixture is normalized to
LF bytes and has the recorded before revision. The supported CLI rejected a
same-version cache backup while Windows held its directory; after verifying the
trial's unique cached launch.mjs and its child process identities, only those
trial Node servers and their owned headless renderer were stopped. Supported
remove, marketplace replacement and install then succeeded. This task's tool
still returned Transport closed after the update, so a final app restart/reopen
was requested. No other app or browser was stopped.

Independent review on f150845b0 matched all 25 changed paths and reported zero
findings, with no simplification needed. Selected local gates passed after
installing the worktree's locked development dependencies: 12 tests across two
files and all affected checks, including workflow validation; ESLint also passed.
[Corrected-adapter CI run 39064907042](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39064907042)
passed the 11 unit/protocol tests, a Chromium host that refuses unqualified tool
names, and the same exact-revision NoaCG validation. These checks do not replace
the pending 0.1.2 native recheck.

The trial remains excluded from CLI npm/toolkit distribution. Source is the four
fixture files; graphic code runs in an opaque-origin allow-scripts iframe without
a trusted bridge, credentials or networking. No account, database, editor,
production delivery or on-air operation was used.

AC-1/AC-2: passed on installed 0.1.1. Final 0.1.2 native recheck pending.
AC-3/AC-4/AC-5: outside phase 1, not checked. AC-6: local install/restart, source
persistence and isolation observed; final 0.1.2 reload and independent check pending.
Owner taste judgment covers the simple initial prototype only. No cloud run or
automation has started. The plan and eight-hour gated prompt remain in #1309/#1311.
## Approved private connection recovery

The owner approved both a fresh private connection identity and keyboard-accessible
element selection on 2026-10-17. Version 0.1.3 changes the MCP server key to
`noacg_graphic_preview` and versions its UI resource. The access and fixed four-file
boundary stay the same. Transparent named buttons cover the existing element hit
areas, use the same bounds and selection, and hide in Region mode. A keyboard
focus outline appears only during keyboard use.

Twelve targeted unit/protocol tests pass, including named selection, refresh
replacement and Region-mode exclusion. The browser journey now exercises Enter
activation before the existing pointer journey. This is not a native completion
claim; the installed 0.1.3 recheck is still pending.
