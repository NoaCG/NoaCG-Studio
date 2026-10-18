# Phase 2 package preview and selection

Status: cloud implementation and focused browser evidence are available. **Phase 2
is incomplete** until rendered Windows Codex desktop AC-3 inspection and its
independent verdict are recorded in [#1491](https://github.com/NoaCG/NoaCG-Studio/issues/1491).
Do not unlock phase 3 from a browser-stub or CI pass.

Phase 1 is independently PASSED in
[#1314](https://github.com/NoaCG/NoaCG-Studio/issues/1314) after #1480/#1481. Credit
that result; do not repeat it. Its native proof covers the preserved installed
plugin 0.1.3 / MCP SDK 1.30.0 only. The phase-2 candidate is 0.1.4 / SDK 1.31.0,
with MCP Apps 1.7.5 and OpenAI extensions 0.2.0. This candidate has no native
compatibility or owner desktop taste verdict yet.

## Implementation and decisions

- Build config fixes one package root and HTML entry. No tool argument can expand
  filesystem access. The source closure supports the ordinary NoaCG/SPX layout,
  local CSS/imports, relative images/fonts and classic scripts, including defer.
  Sources and assets are exact-byte versioned; the phase-1 four-file digest stays
  unchanged. Generated siblings and unrelated files are not authoritative inputs.
- The existing importer evaluates definition literals. It is deliberately not
  invoked in Node on graphic code. Package execution and metadata extraction stay
  in the existing CLI contained browser. Shared format detection, fieldDescriptors,
  eventButtons/eventPayload, event legality and settleGraphic provide the existing
  package/control semantics. No EditorCommands, editor UI or new agent is required.
- Field controls, lifecycle and authored operator actions rehearse only in that
  isolated graphic. Each action captures current values, state, PNG and target
  bounds; replay never writes source. Refresh/reset and any rehearsal invalidate
  selection. A view identifier refuses an old panel's superseded rehearsal even
  when source bytes have not changed. This minimum safety does not implement the
  phase-3 validation, history, restoration or persistence features.
- Preview dimensions are authored dimensions. Known elements come from explicit
  data-preview-target IDs and declared field IDs; Region remains the fallback.
  Highlights use authored coordinates and percentages through panel resizing.
  Ready waits for a view-bound render acknowledgement from the graphic's own
  window. That receive-only message cannot call a tool or submit a conversation.
- The panel graphic remains an opaque-origin allow-scripts iframe. Early CSP,
  bounded dependency reads, symlink/traversal/special-file refusal, no networking,
  no credentials and no exposed bridge preserve the trust boundary. Resource and
  capture limits are described in the [trial README](../../../cli/plugin-preview/README.md).
- Candidate plugin/marketplace/MCP identities are separate from the installed
  0.1.3 trial. The preserved installed runtime and edited draft were never accessed
  or changed. No public release, model API, account operation, delivery or on-air
  control occurred.

Dynamic resource loading, async/ES-module entry scripts, third-party OGraf-only
components and remote dependencies remain outside this local source-package trial.
The bounded replay is not deterministic rendering for arbitrary clocks, randomness,
external data or long-running animation. Those cases need their own qualification.

## Cloud evidence and qualifications

The builder started from pinned source
`2c36ba0be224d464938538428d02b8b77c56b5b9`, clean, in its own feature worktree,
nonce `cgp-p2-20261018-181033-build`. It reconciled current main before review.
The actual environment was the same managed Linux x86_64 Codex environment, not
separate cloud resources. Its own execution profile reported four visible CPUs,
16 GiB machine memory and two browser workers; hidden controller ancestors meant
limitsObserved=false, so the existing detector used machine totals. Small browser
jobs stayed within five minutes and the existing one-browser-job queue.

| Evidence | What it establishes |
| --- | --- |
| Plugin unit/protocol/source tests | Host-qualified calls, app-only tools, fixed fixture digest, closure revision, traversal/symlink/size/cycle refusal and distribution exclusion |
| Existing browser journey | Actual before/after PNGs, native-source-style CSS edit, refresh, keyboard/click/region selection and superseded-view refusal in a simulated host |
| New square-package browser journey | Loaded relative SVG and Inter WOFF2 through nested CSS, 1080 × 1080 canvas, seven field kinds, Update/action/Out/Take/reset, source unchanged, current PNG/context and both selection modes at 800/460 px |
| Isolation probes | Parent DOM/cookie/storage denial, absent OpenAI/product bridge, blocked network/file fetches and ignored graphic-origin tool messages |
| Rendered frames inspected by builder | Initial/rehearsed source PNGs and wide/narrow panel screenshots; font, composition, text wrapping and selection alignment checked visually |
| Actual Windows Codex inspection | **Not checked**; required by #1491 |

The square fixture's exact source revision is
`files-sha256:74e412ac3adb66cd206f9e58bda291d6c363720755b6a0faf98d8527b2ae0416`.
The baseline phase-1 revision remains
`files-sha256:8dde8a7398c3d3a09d8bf499bdee9643d931a759ee7af28de7e34d5bf4db086f`.
The browser receipt records the actual tested implementation SHA, dirty paths,
candidate package/MCP dependency versions, package files, selected context and isolation results.
The PR records the exact reviewed tip, targeted commands and Actions job links.

Rendered evidence is outside Git at
`/workspace/attachments/codex-graphic-preview-run-20261018-phase2`.
The focused Actions artifact `preview-trial-browser-stub` also includes
`phase2/` with PNGs, receipt and the reconstructable `source-package/`; cloud
worktree/attachment paths alone are not a promise of durable storage. Never use
a historical receipt's temporary sourceRoot as the Windows package path.

Failed attempts remain recorded. j-0001/j-0002 had header-only failure logs under
the default restricted-network runner; no pass was credited. Relaunching the owned
idle runner with supported shell network permission and an existing Chromium path
allowed j-0003 to pass. j-0004 corrected an assertion that confused SVG intrinsic
size with its authored 68 px rendered size. j-0005 corrected Playwright's unscaled
nested-frame boundingBox assumption: the check now maps the actual inner DOM rect
through the iframe's rendered scale and compares it with the highlight. No baseline
or existing gate was weakened. j-0006 passed both journeys. j-0007 exposed the old
test's extra preview call superseding its displayed view and the product's premature
Ready before replay finished; both were fixed, and j-0008 passed both journeys.
Independent review then reproduced two defects on the immutable first candidate: viewport-dependent initialization captured 960 px instead of authored 540 px, and an image default over4000 characters was truncated/broken. The fix detects canvas size inside the browser before source execution and keeps image values as package asset keys while passing complete image bytes only inside the graphic. The square fixture now regresses both, including a filelist picker. A further independent actual-runtime probe found authored image action.set values still carried URLs instead of asset keys; normalizing those values fixes action→picker→Update agreement, now regressed with an alternate logo. Review evidence is preserved under review/.
j-0014 exposed the newly declared alternate-logo fixture action still being refused by its sample dispatch function; the fixture now implements that declared action, with the assertions unchanged.
Final exact-tip evidence supersedes these intermediate candidates. Logs retain all
observed failures and source changes; an old pass is not claimed for a newer tip.

A generic taste-frame catalog sweep is not applicable: no catalog design or shared
render recipe changed. The rendered test package demonstrates the controls and
selection; no production graphic delivery or on-air taste approval is claimed.

## Windows continuation prompt

Use this prompt in a normal root Codex Windows task with the checked-in README and
implementation PR available. The installed 0.1.3 runtime must remain untouched.

```text
Complete only the Windows native AC-3 inspection for NoaCG/NoaCG-Studio phase 2,
tracked in https://github.com/NoaCG/NoaCG-Studio/issues/1491. Read AGENTS.md,
docs/work-specs/codex-graphic-preview/{spec.md,phase-1.md,phase-2.md} and
cli/plugin-preview/README.md. Phase 1 independently passed #1314; do not repeat it.

Never access, modify, rebuild, delete or clean
C:/Users/ahonemi/.codex/worktrees/graphic-preview-resume/NoaCG-Studio.
Preserve its installed plugin 0.1.3 and edited draft. Create a NEW feature
worktree with command-local core.autocrlf=false from the exact implementation SHA recorded by the phase-2 PR. Use Node 24
and an existing Chrome/Edge; obey this Windows machine's current verification queue
and resource guards. No model API, account/credential changes, public release,
delivery, production or on-air action is authorized.

Follow README's concrete PowerShell commands: install this new worktree's locked
trial dependencies; reconstruct source-package with test/package-fixture.mjs or
copy the focused Actions artifact to a NEW local directory; assert its exact
files-sha256 revision; build with --package <NEW absolute path> --entry square.html;
run unit tests and the bounded queued browser selection. Install only
noacg-preview-phase2-trial@noacg-preview-phase2-local from this new runtime and lock
that worktree. Do not remove or replace the original plugin/marketplace/cache.

Discover the phase2 MCP connection and open its actual Codex conversation panel.
Record app/CLI versions, source SHA, plugin 0.1.4/SDK 1.31.0, actual runtime/package
paths and source digest. Inspect square aspect, SVG/font, all seven field kinds,
Update/Goal+1/Alternate logo/Out/Take/Next/reset, named keyboard/click selection and a Region at
wide and narrow panel sizes. Inspect actual alignment; verify source stays unchanged.
Send one explicit selection request and confirm the active native task receives
its matching PNG, package identity/revision, bounds, values and rehearsal state.
A panel acknowledgement alone is not a received native message. Inspect and retain
rendered evidence outside Git and link retrievable receipts to #1491.

If installation, discovery, host bridge or a native criterion is unavailable, record
the exact gap, preserve the new offline package/runtime and stop. Phase 2 stays
incomplete. Otherwise record the actual receipt and request a fresh independent
landed-main phase verdict. Do not start phase 3 from this task. Leave both installed
runtimes/drafts preserved and report how to disable/remove only the phase2 candidate.
```

The authorized cloud window ends 2026-10-19T02:10:33Z (05:10:33 Kyiv), with final
verification/handoff beginning 01:25:33Z. No durable wake/recovery is claimed;
the active coordinator remains the repair owner until an explicit handoff. An
unmet native gate stops advancement regardless of cloud time remaining.
