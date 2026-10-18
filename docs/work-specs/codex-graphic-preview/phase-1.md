# Phase 1 native preview receipt

Status: the installed 0.1.3 native journey passed AC-1 and AC-2 on 2026-10-18.
The independent landed-main phase verdict is recorded in
[issue #1314](https://github.com/NoaCG/NoaCG-Studio/issues/1314).
Phase 2 requires that verdict to pass and separate owner authorization.

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

AC-1/AC-2: passed on installed 0.1.1. Final 0.1.3 native recheck pending.
AC-3/AC-4/AC-5: outside phase 1, not checked. AC-6: local install/restart, source
persistence and isolation observed; final 0.1.3 native loop and independent phase check pending.
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

## Final adapter verification, 2026-10-17

[Focused run 39066690174](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39066690174)
on fef7a5593a8e54145c1e3e3152a25881672d47e6 passed all 12 unit/protocol tests,
the Chromium host journey including Enter activation, and the pinned NoaCG
validator on the exact edited CDE revision above. Static and runtime checks had
zero errors; the same three editor warnings remain. The coordinator inspected
browser-stub.png plus off.png, onair.png and stress.png from this run. The graphic
is unchanged, the longer text fits, and Region mode hides the element buttons.

The independent source review covered the exact branch, base a1c9efb564fe6057f3f4af5669bda8d6eebb5267
and all 25 changed paths: zero findings, no simplification needed. Targeted local
repository gates passed 12 tests across two files and all selected cheap checks.
The earlier red PR job was only Reviewed waiting for the queue stamp, not a
product/test failure. No full production build ran locally.

A fresh checking agent discovered `mcp__noacg_graphic_preview__noacg_preview` and
received the actual baseline PNG, four-file identity and before revision from
the new runtime. The owner reopened that updated panel. CUA selected its named
Name button and filled the final request with the baseline revision visible.
Sending was refused by Codex with: `direct app-server input is not allowed for
multi-agent v2 sub-agents`. No native message was delivered by this attempt and
no source edit was performed for it. The panel belonged to the checking-agent
context. This original root task still exposes only its old closed connection;
its direct preview call again returned Transport closed.

This is verified trial infrastructure, not a completed final-adapter journey.
Issue #1314 remains open. Continue the native test from a fresh ordinary local
Codex task, using its own preview tool and panel, never a sub-agent-owned panel.
It must receive the real selected request and PNG, edit 52px to 66px using normal
file tools, bind NoaCG validation/screenshots to that exact source, and refresh
its own panel. Then an independent checker must verify the landed phase before
phase 2 starts. Do not repeat generic window restarts or treat connectivity-only
or simulated-host checks as the missing proof. The installed runtime stays locked.

## Final ordinary-task native journey, 2026-10-18

PR #1413 landed through the merge queue as
`1c88e2e728be378efb3ae82240e2287724f0f788`, with its applicable PR, merge-group,
main and post-landing checks passing. Its repair ownership concluded without
repairs. This continuation did not duplicate that branch or repair owner.

The installed runtime directory was initially missing despite its retained
locked Git registration. The same worktree was reconstructed from
`3c8387e289a2210d18ad280ab05fa1e849f3556d`, retaining its branch and lock. Its
tracked source was clean and the four LF fixture files matched the baseline
revision before the native test. Pinned dependencies and only the private preview
assets were restored there; no build ran in the checkout holding main.

The ordinary task `01a14e76-1ac6-7d43-aae3-cd085735fac5` initially retained a failed
MCP initialization. A separate SDK probe of the actual cached launcher could
list the tools, but was recorded only as connectivity evidence. Later, this
ordinary task's own `mcp__noacg_graphic_preview__noacg_preview` became available
and returned the real baseline PNG and source identity. No sub-agent received
the final native request or operated its panel.

- App: OpenAI.Codex Windows package 26.1013.4894.0.
- Desktop CLI: 0.163.0-alpha.10.2.
- Installed private plugin: noacg-preview-trial@noacg-preview-local 0.1.3.
- Runtime SDKs: MCP 1.30.0, MCP Apps 1.7.5, OpenAI extensions 0.2.0.
- Runtime: C:/Users/ahonemi/.codex/worktrees/graphic-preview-resume/NoaCG-Studio.

The owner expanded this task's preview into its side panel. CUA inspected that
actual panel's source details and confirmed the runtime path and baseline
revision from the table above. It clicked the named **Select Name** button,
entered the same 66px request quoted in the earlier journey, and clicked
**Send change to this task**. The panel acknowledged sending; that acknowledgement
was recorded separately from receipt by the task.

After the turn ended, this ordinary task received the actual PNG and selected
request. Image receipt ID: `c10999c1-9b8d-4fbc-a018-aa19547f0ba8`. Text receipt ID:
`session:d7a78c66-7b3a-4ac8-9af5-d99f82973726`. The received context identified
package noacg-preview-lower-third, baseline revision, all four source files and
the absolute fixture path; element f0, Name; 1920 x 1080; Alex Morgan and Studio
correspondent; settled fixture; and bounds x252, y828.203125, width312.0625,
height59.796875. The owner's phase-1 instruction supplied authority; this MCP
payload supplied the selected data and image.

Ordinary file tools changed only `#f0` font-size from 52px to 66px in the real
runtime's graphic.css. The task asserted the exact before and after revisions
from the table above, then copied and rechecked all four edited files before
creating a ZIP. The installed runtime retains that edit. No stock fixture was
restored, and no frozen queued worktree was edited.

### Validation bound to the native edit

Local queue job `j-4590` initially waited for memory, then started under the
existing guard and passed with exit 0:

```text
npx --yes @noacg/cli@0.12.2 validate cli/plugin-preview/dist/native-evidence/edited-source.zip --screenshots cli/plugin-preview/dist/native-evidence/validation-after --json
```

The static and runtime checks had zero errors, benchSkipped was null, and the
normalized digest was
`sha256:a09aa53f9a7b99a7e8bcf98632bcc6a22fc9d0928a66138f1844e1862c44597e`.
The same three editor-contract warnings listed above remain outside this spike's
scope. Fields, lifecycle, layout, legibility, doubled-text stress and export
readiness passed. The ZIP snapshot's four-file revision was the exact CDE after
revision; validation did not rewrite the runtime source.

The task inspected off.png, onair.png and stress.png. Off is empty; the larger
name is aligned with the role and badge; doubled names and roles fit within the
graphic and safe frame. No assertion, memory floor or test limit was changed.
A focused CI run, 39141124944, was dispatched while the local job appeared held,
then cancelled once the local pass was discovered. No pass is claimed for that
redundant run. The historical browser-stub passes remain protocol evidence only.

### Same-panel refresh and preservation

CUA clicked **Refresh source** in the same actual panel. It returned Ready,
displayed the exact CDE revision and showed f0 with computed font-size 66px.
The selection changed to **Select part of the graphic**, and Send was disabled.
The native preview tool independently returned the edited PNG and same revision.
Its before/after PNG hashes match the two native-tool hashes recorded above.

The edited draft, ZIP, raw per-file hashes, validation JSON, three validation
frames, native before/after PNGs and receipt.json are preserved outside Git at:

```text
C:/Users/ahonemi/.codex/visualizations/2026/10/18/01a14e76-1ac6-7d43-aae3-cd085735fac5/noacg-native-phase1-013
```

This is the final installed 0.1.3 native loop, separate from the earlier browser
stub and connectivity probe. AC-1 and AC-2 passed; installation, isolation and
draft preservation cover the phase-1 portion of AC-6. AC-3 through AC-5 and the
later delivery/reopening work remain outside phase 1. The final independent
checker must assess this receipt on landed main before #1314 closes. No later
phase, automation, account write, model API or production operation was started.
Keep the locked installed runtime and its edited draft available while installed.
