# Codex graphic preview: select, request, verify

## Why and goal

An agent can make a broadcast graphic, but a chat alone makes it hard to point at
what should change or see whether the change worked. Show the actual graphic
beside the active Codex conversation. The person selects an element or marks a
region, describes a change, and Codex edits and verifies the package source.

Owner authority, 2026-10-16: "Yes, write and land the codex-graphic-preview plan
and run phase 1 locally. Then give me the prompt to run the remaining phases in
the cloud overnight." Earlier corrections explicitly remove a dependency on the
unfinished NoaCG editor and require the existing Codex harness.

## Decisions

- The active Codex task owns reasoning, source edits, tools and verification.
  The plugin supplies preview, selections and context. No model API, replacement
  agent, built-in NoaCG AI gateway or API key is introduced.
- One active graphic package in a local trial. Source files remain authoritative;
  a preview and its selection identify the exact source revision they describe.
- Start with click selection and a rectangular region fallback. Dragging to edit,
  a scene model and full visual editing are outside this prototype.
- Reuse the CLI's package, validation, screenshot, digest and delivery seams and
  small existing preview/control helpers. Do not depend on EditorCommands or
  finish the editor as a prerequisite. References guide editable source output.
- Reuse the product MCP endpoint's authentication and delivery where needed.
  Never expose Supabase administration or database credentials to graphic code.
  Phase 1 needs no account or remote database write.
- Draft work stays outside the user's saved library and productions until an
  explicit delivery. Rehearsal never operates an on-air output.
- The trial is opt-in and absent from public listings, the published toolkit,
  npm release and production site. Local discovery/install instructions are part
  of the trial. Packaging must not replace the installed noacg skill.
- Generated graphic code runs separately from the trusted plugin UI and bridge.
  Use existing containment where possible; no credentials, tool bridge or
  unrestricted filesystem capability reaches a graphic.
- MCP Apps plus OpenAI extensions is the intended host integration. An ordinary
  webpage, simulated host, clipboard-only request or screenshot shown only to
  the person cannot establish actual Codex compatibility.

## Non-goals

No full editor, free dragging, catalog/gallery, multi-document system, production
redesign, hosted rendering service, new AI provider, public submission, output
hardware integration or changes to live production. Do not relax existing gates.

## Acceptance

### AC-1: Actual desktop conversation and image context

On the owner's Windows Codex desktop app, open a real graphic beside the active
Codex conversation. Select an element or region and submit an explicit change
request. The native Codex task receives the selected target/region, package and
revision identity, request and an actual image of that revision. Record app
version, plugin/SDK versions, source commit and what the task received.

Layer: actual desktop integration receipt. Browser host stubs test the protocol
but never pass this criterion. A missing install, reload, permission or supported
host bridge leaves AC-1 unverified and stops advancement beyond phase 1.

### AC-2: Native source edit refreshes the preview

For the phase-1 graphic, Codex changes its source using the normal task's file
tools, invokes existing NoaCG validation/screenshots, inspects the result, and the
panel displays the edited revision. No second model service performs the edit.
The refreshed frame agrees with the changed source. Record before/after revision,
tool runs, received image and displayed result.

Layer: actual desktop journey plus targeted package/bridge checks. Source commit,
preview acknowledgement and verification are reported separately.

### AC-3: Real package preview, selection and rehearsal

A real package loads its relative assets and fonts, renders at the intended
aspect ratio, and shows the generated editable fields and rehearsal controls.
Selection identifies a known element when available; a rectangular annotation
works otherwise. The highlight/region remains accurate when the panel is resized.
Graphic code cannot access the trusted bridge or credentials.

Layer: focused browser checks over source loading, scaling, selection and isolated
rehearsal; rendered desktop inspection. Reuse existing fixtures and control seams.

### AC-4: Context and checks remain current through changes

A request carries package identity, source revision, selected element or region,
sample values and rehearsal state. An old selection is invalidated or explicitly
refused after source changes. Validation and frames identify their source digest;
editing invalidates checked status. Failed checks remain visible. A preceding
source version can be restored without losing unrelated files.

Layer: targeted revision/context tests and a browser change/reload journey.

### AC-5: Draft survives reopening and verified delivery

Exercise an unfamiliar brief with a reference asset, multiple editable fields and
custom operator actions. Reopen the draft with its edits intact, verify its
controls, and explicitly save through existing NoaCG staging delivery. Read back
the saved result and record its destination and revision. No background save,
production replacement or publish is introduced.

Layer: realistic native Codex and staging journey. If credentials or staging are
unavailable, preserve the package and offline handoff; live delivery remains
unverified and the phase does not pass.

### AC-6: Trial is reversible and its evidence is honest

Document installation, enable/disable, local runtime prerequisites, what is read
or sent, and a short try-out. Restart/reopen retains the appropriate draft state.
The release/distribution checks show the trial is not shipped. Record browser
tests, actual host tests and owner taste judgment separately, including omissions.

Layer: package/config checks, restart receipt and documented owner try-out.

## Phases

1. **Local compatibility spike (AC-1, AC-2; installation/isolation part of AC-6).**
   Build the smallest loadable trial around one real graphic. Prove the actual
   panel, selection/image/request, native source edit and refreshed preview. This
   is the prerequisite to cloud expansion. If host verification is unavailable,
   land only independently verified trial infrastructure and a truthful receipt;
   the phase remains open. Do not substitute a browser simulation for the gate.
2. **Package preview and selection (AC-3).** Cloud implementation and targeted
   browser checks. Expand the proven host adapter to the real package/control
   seams, assets, fonts, responsive selection and region fallback.
3. **Source change and verification loop (AC-4).** Cloud implementation and
   targeted checks. Add current context, digest-bound results, source refresh,
   failures and restoration. Reconfirm the native task route locally when the
   host adapter changes.
4. **Realistic delivery and try-out (AC-5, remaining AC-6).** Cloud/staging checks
   and a final local desktop walk. Native host and account outcomes remain open
   until actually observed; a cloud browser suite does not establish them.

## Execution and gates

This plan is registered as `codex-graphic-preview` in the canonical plan-run
workflow. The current authorization covers landing the plan and phase 1 locally;
later execution needs the owner's overnight prompt/window. Do not infer a window
or start an automation from this plan.

Each verified phase uses its own feature worktree, /check and /queue-merge, then
an independent checker against current origin/main before the next phase. Use
fresh native Codex builders/checkers. Follow the executing environment's current
verification policy; keep Windows checks targeted and authoritative CI intact.
Keep exactly one repair owner through each landing and its post-land results.

Use the existing wave/plan/job records for progress and recovery, not work.json.
An overnight coordinator must reconcile phase receipts first, record an explicit
end time with UTC offset, and prove its supported wake/continuation before
claiming unattended recovery. It stops at the window or a real unmet gate.
Cloud work cannot assume access to localhost on the owner's laptop or private
reference files; use repository fixtures until the explicit local check.

## References

- [OpenAI extension surfaces](https://developers.openai.com/plugins/build/extensions)
- [MCP App UI and context](https://developers.openai.com/plugins/build/chatgpt-ui)
- [Local plugin packaging](https://developers.openai.com/plugins/build/plugins)
- `cli/src/mcp.ts`, `cli/src/digest.ts`, `src/preview/canvasControlProtocol.ts`
- `cli/skill/noacg-graphic/references/control.md`, `api/_lib/me/mcp.ts`

## Phase notes

- Plan intake: the existing local noacg MCP supplies creation/check/delivery
  verbs and image content; the product remote MCP supplies catalog/library/send.
  Neither currently registers an MCP App preview resource or conversation panel.
- Local installation is host work. Record actual installation/reload outcomes
  before treating the platform documentation as proof of this user's app.

- Phase 2 carry/decisions: the private candidate loads a configured source-package
  closure with assets/fonts, derives fields/actions from the existing control
  seams in the contained browser and keeps responsive element/region selection
  bound to the rehearsal frame. It uses separate plugin/marketplace/MCP identities
  to preserve the installed 0.1.3 runtime. Details and the standalone Windows
  continuation prompt are in [phase-2.md](phase-2.md).
- Phase 2 remains incomplete until actual Windows rendered AC-3 inspection and an
  independent verdict in [#1491](https://github.com/NoaCG/NoaCG-Studio/issues/1491).
  Phase 1 is already independently passed in #1314; its installed 0.1.3 / SDK 1.30.0
  proof does not establish candidate 0.1.4 / SDK 1.31.0 native compatibility. Do not
  repeat phase 1, treat a browser stub as the native gate, touch the preserved
  installed runtime/draft, or unlock phase 3 from cloud evidence alone.
