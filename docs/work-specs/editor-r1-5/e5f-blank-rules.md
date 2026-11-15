# Blank authoring and starter previews: Rules and source-family amendment

This is the documentation checkpoint for the serial E5F blank/previews correction. The source-family amendment below was clarified after coding and records failed candidate evidence; it contains no further product implementation or new execution result. The [owner decision](owner-decision-2026-11-13-hosted-feedback.md) remains binding, including the complete second Acceptance paragraph:

> Blank project/graphic creation opens usable authoring directly with the existing unsaved-work guard, durable save/reopen and independent graphic identities. Starter selection remains available with meaningful names and previews.

The original Rules-first opinion supported the seven-path direction but returned Rules A− because the new Blank graphic continuation could override a later departure. The first amendment subsequently received Rules A/approach A before implementation. Candidate j231 then returned six passes and two failures: empty neutral source refused its first text creation, and Escape over the shared confirmation also closed Entry. The source-family opinion recommends approach A with corrections; the concrete Rules below need the same reviewer’s A/A+ before any further code. The original A−, first amended A and every failed attempt remain historical; this amendment does not retroactively make them pre-code proof or engineering/full-phase acceptance.

## Scope and existing authority

The planned product scope is limited to these seven paths:

| Path | Responsibility |
|---|---|
| `src/components/editorFoundation/startBlankGraphic.ts` | New guarded blank action and its local pending lifetime. |
| `src/components/editorFoundation/ProjectStarter.tsx` | Blank project default, optional existing starters and practical labels/previews. |
| `src/components/editorFoundation/projects.css` | Starter-card preview presentation. |
| `src/components/wizard/CreationWizard.tsx` | Thin Entry/header/Escape wiring. |
| `src/components/wizard/steps/EntryStep.tsx` | Blank graphic door and local busy eligibility. |
| `src/styles/wizard-entry.css` | Door layout. |
| `src/templates/blank.ts` | Additive dedicated authoring factory; legacy factory unchanged. |

Preserve the final retained legacy-factory compatibility boundary, not the historical global replacement of `createBlankTemplate`. The dedicated new factory follows the after-coding source-family rule in B3. No panel, whole-graphic, geometry, sourceContracts, shared-base, copy-baseline, runtime, assistant or E4 ownership/recovery edits belong here. Do not import mixed retained commits wholesale. Current notes and assistant/quiz history are preserved rather than replaced.

Both doors use existing `requestSwitch`, SaveDialogs and confirmed `createAuthoringProject` behavior. That operation already allocates independent project/document identities, confirms workspace receipts, protects newer source/owner state and only then restores the new document. Explicit Save remains responsible for the library record. Existing installation snapshots and conditional newer-write refusals remain authoritative. No schema, migration, collaboration, identity or retry framework is needed.

## B1. Requested, accepted and settled creation

### Requested: the shared guard still owns its question

A press on the new wizard Blank graphic door creates a local request lifetime; it does not itself mean a blank write was accepted. An existing confirm/save dialog keeps its first destination and cannot be replaced by another press. The existing Save/Discard/Cancel and name-dialog behavior remains authoritative.

The queued Blank continuation belongs to one initiating Entry lifetime, not a route string. Cancel, an accepted close/navigation/other walk, unmount or document-lifetime departure irrevocably revokes it. Returning to the same path cannot restore ownership. Before starting creation, the continuation must still own that Entry request. An approved Save can still save the original document through existing machinery after departure; that does not authorize the obsolete Blank request to create or open a new document.

The shared guard's own Cancel remains usable under its existing rules. While either `confirmSwitch` or `saveDialog` is present, the new helper must yield underlying wizard Escape/leave handling to that shared dialog. Its existing handler exclusively decides cancellation, including a busy Save dialog whose Escape deliberately does nothing; Entry must stay open. This is local helper eligibility, without changing SaveDialogs, wizard confirmation policy or authoring core. Do not install the new creating gate or disable that shared cancellation merely because a guard was requested. A closed name dialog drops its continuation; a later valid Blank press can acquire a fresh local lifetime.

### Accepted: a bounded local busy operation

When the shared guard allows a still-current request, mark that one Blank operation creating and synchronously install its navigation gate before calling the existing asynchronous creation seam. The local pending ref must reject repeat/keyboard dispatch before React has painted disabled controls; a later passive effect alone is insufficient.

During that accepted creation:

- Busy-disable the initiating wizard's Blank/repeat action, ×/Escape, Home and other Entry walk choices. New graphic is already the current non-button on Entry. Do not offer an enabled Cancel that promises to keep the current project after creation was accepted. Use the existing busy-control convention, without turning this explanation into interface copy.
- Browser Back/Forward and direct same-document route requests meet the existing router gate and are declined. They are not accepted departures, do not become a second queued navigation and are not replayed after completion. Preserve the router's existing history-restoration semantics.
- Scrolling and unrelated non-navigation feedback/account controls keep their existing behavior. This is not an application-wide feature lock. Library/account changes retain existing owner checks. A full document departure or unmount revokes the local lifetime; it is not transactional cancellation.

Already accepted durable work or staged intent may remain. Never claim that suppressing a UI continuation cancels the write, deletes the new project, rolls storage back or necessarily preserves the old active bundle after accepted creation.

### Settled: only the current local owner may present its result

Keep the accepted lease through the creation core's expected `galleryOpen:false` restore. That owned successful restore occurs before the helper's Promise completion and must not be mistaken for an accepted user close. The pending route gate prevents the app's automatic wizard-close rewind from winning during that completion interval.

On success, only the still-owned creating lifetime can close the wizard and open the intended editor. Settle local ownership and release its gate before that intentional navigation, in the same synchronous continuation. Introduce no extra wait, yield or retry. On failure, release only its own gate/busy state and use existing error reporting; stay on the initiating Entry if it is still current.

Revocation is irreversible. An old completion cannot close/navigate, clear a newer local pending operation or remove another router owner's gate. Cleanup on failure, unmount, page departure or replacement affects only its own lifetime/guard. Path equality never grants ownership again. Pending duration remains bounded by the existing durability/error/timeout path, with no new deadline or indefinite wait.

The existing ProjectStarter close/late-navigation analogue is pre-existing and nonblocking under the original opinion. This new-door correction does not silently repair it, alter core recovery or relabel it as a newly introduced E4 defect. Both doors still retain their existing unsaved-work and confirmed-creation authority.

## B2. Independent documents and confirmed durability

Each successful blank has independent project/document identities, its own source/baseline and empty history/future, and no borrowed library graphic ID or rehearsal data. Confirmed authoring-workspace persistence precedes the successful close/navigation. Explicit Save confirms its own library write; creation must not falsely announce that a library graphic was saved.

Save/reload/reopen preserves the authored source. Creating or editing the next blank cannot alter the first saved/retained graphic or installed/on-air copies. Existing pending-creation retry identities stay authoritative. A failed creation can retain staged intent under the existing transaction; distinguish it from replacing the visible current document. Existing current-bundle, owner/generation and newer-write protections remain unchanged.

## B3. Empty, editable source and legacy compatibility — clarified after coding

Keep `createBlankTemplate` byte/emission compatible for all existing sound, layout, machine and project-format callers. Only `createAuthoringBlankTemplate`, serving the two new authoring doors, changes. The rejected neutral-spine candidate and its first-text refusal remain recorded; an empty field list alone did not prove usable blank authoring or transparent paint.

The dedicated factory must create zero authored fields, layers and art assets, with zero initial painted content both unbranded and after optional branding. Existing structural containers, runtime and derived registry rows are not authored artwork. First ordinary text and shape creation must work through the unchanged authoring handlers and existing source writers, including editing the text and exact Undo/Redo. Do not add a hidden field, fabricated capability marker or placeholder visible content to make a guard pass.

Use the existing placed-design constructor `IMPORTED_DESIGN.create`, which resolves its public options and calls `assembleImportedDesign` (`src/templates/importedDesign/shared.ts`). Its legitimate empty-art branch already emits the box/art structure required by the current placed-text writer. Supply explicit `lines: []`, `importedImages: []`, and `designArt` with empty `path` plus width/height equal to the requested frame. Preserve requested resolution/FPS and full-frame origin. Set `sizeScale` to the inverse of the existing resolution factor `min(width / 1920, height / 1080)`, so generated coordinates have unit scale rather than being scaled a second time. Use only the existing constructor option names and semantics; do not change its assembler, runtime or geometry helpers.

Set the resulting top-level template name to `Untitled graphic` using the established wizard naming convention (`wizard/draft/core.ts`); retain the constructor’s honest existing source/type contract. Preserve its existing bundled font/runtime behavior and ordinary future styling. No migration or rewrite of an existing saved graphic or production copy belongs here.

The empty art branch currently emits a known `background: var(--panel-bg)` stand-in. A transparent palette alone is insufficient: optional branding legitimately replaces `panel-bg`. Adjust only that declaration in this newly generated factory output to a nonpainting literal, independently of brand palette values. It remains an ordinary editable declaration. Do not append a permanent cascade override, suppress future styling, change global CSS or alter the shared constructor. If the known generated declaration cannot be qualified narrowly, stop instead of substituting a broader rewrite.

No shared writer, source-qualification, router, runtime, geometry, ownership or E4 correction is admitted by this source-family choice. Do not change core audio, remove fonts, alter the unchanged sound request-count oracle or reinterpret fixture failure as product success. Prior global-factory regression, exact-source controls and compatibility evidence retain their original scopes. All execution of this proposed factory correction remains unverified.

## B4. Useful optional starters

Blank requires no starter, model or settings selection. Existing starter collections remain available with recognizable purpose/type plus design name and real settled `MiniPreview` output. Keep decorative preview content out of the checkbox accessible name and tab sequence. Preserve collection/type keys, chosen branding and explicit production installation behavior; no catalog renaming or production migration.

Authoring remains distinct from finished Save/install, as in the existing wizard editor door. A production-origin blank authoring request must preserve production snapshots until explicit installation; no new automatic installation or synchronization is introduced.

## B5. Boundaries and readable implementation

Preserve keyboard reachability, Entry viewport/fit bounds and the unchanged Open editor focus chain after the added Blank door. No panel/whole-graphic or geometry fix may be imported to make a blank task pass. Preserve deployed assistant/quiz corrections and all older attempts, failures, WIP and SVG/E4 stops. Confirmed E4 attribution or a missing product decision stops for reassessment before editing that defect.

`CreationWizard.tsx` is already at its 1419-line ceiling. Keep local ticket/subscription/gate logic in the already-new Blank helper and the shell wiring thin. Any small line offset comes from revising now-inaccurate comments in the touched area or a separately verified behavior-preserving seam. No minification, packed statements, raised ceiling, baseline change or exception is permitted. No measured implementation fit is claimed here. Stop if readable wiring requires broader core/router changes or unrelated extraction.

## Concrete existing seams and remaining limits

Use the existing `guardNavigation` API; its returned release clears only the matching guard. The existing consumer is mounted EditorFoundation; the new route normally renders Home/null plus the wizard instead. Verify actual mount/cleanup timing through real routing. An old editor cleanup cannot remove the new gate, and a new Blank cleanup cannot remove a later owner's gate. No router API widening is proposed.

A synchronous `applyTemplate(resetSampleData:true)` alternative was considered: it gives a new identity/link/history but does not confirm retention of the departing complete authoring bundle. Existing unsaved-work comparison is narrower than that durability guarantee. No safe established synchronous full-bundle-confirmation seam was identified; do not weaken Rule4 to avoid a small local pending UI.

Local route subscriptions and accepted handler/lifetime changes supply irreversible request invalidation, not an invented document/view-generation write or persisted identity. Candidate runtime behavior, budget fit and the core-close/gate timing remain unverified. If the declared local policy fails in actual held-receipt evidence, stop rather than automatically broadening the architecture.

## Independent oracle and complete paragraph2 verification

Use maintained UI/router actions and isolated durable-receipt barriers. Derive expectations from these Rules rather than production callbacks; capture route/walk, active source/history/save binding, document, workspace and library identities and installed snapshots. Never simulate user navigation with arbitrary router-store mutation. Distinguish staged intent from live replacement.

| Held stage and action | Required outcome after release |
|---|---|
| Requested Blank; shared Cancel/×/Escape | Existing guard cancels; no blank project/document or editor navigation; original bundle follows existing preservation rules. |
| Requested Blank; Save-first receipt held; accepted browser Home/back-to-Entry | Request stays revoked despite the same path. The original Save may finish; obsolete Blank creates no project/document and performs no close/editor navigation. Use real Home→New history. If a move is refused, record refusal, not an accepted-away witness. |
| Accepted creation; ×/Escape/Home/another Entry walk/repeat Blank | Busy-disabled or declined; no accepted new walk, duplicate creation or later replay. Release permits only the current operation's declared result. |
| Accepted creation; Back/Forward/direct in-app route | Existing gate declines it, preserving route/walk/history behavior. Attempted away/back is not mislabeled accepted navigation; the requested-stage row supplies the actual accepted-away witness. |
| Accepted creation; durable success | One independent confirmed project/document with correct baseline/history/binding; own gate released before one intended editor navigation. |
| Accepted creation; refusal/newer edit/account change | Existing preservation/refusal semantics, no false success/navigation; only own gate/busy released. A later request cannot revive the older lifetime. |
| Actual surface/document departure or later legitimate gate owner | Old local continuation stays inert; cleanup cannot remove the newer owner's gate. Accepted storage is not claimed cancelled. |

Prove controls/navigation work again after settlement and Back/Forward is not left stuck. Preserve original Save/Discard/Cancel/newer-write tests, without limits, retries or oracle changes. Both shared Escape owners need focused coverage: the unsaved-work confirmation and the first-Save/name dialog, including a held busy Save whose own Escape refuses cancellation. The underlying Entry remains open in each case; shared cancellation never starts a Blank continuation.

After separate admission, first qualify the corrected generated source at representative 720p, 1080p and 2160p formats: requested dimensions/FPS and name, full-frame origin and unit coordinates, no authored fields/layers/art assets and actual zero initial paint unbranded and after a chosen brand. Verify ordinary first text creation, wording edits, shape drawing and exact Undo/Redo, then execute representative existing export paths from the same edited source and inspect rendered text/drawing. This is bounded functional evidence, not a new renderer or device campaign.

After separately admitted implementation, bounded checks must cover both actual doors and the exact `+ New graphic → Blank graphic` path: ordinary painted text/drawing, exact Undo/Redo, first Save/confirmed durable reload, a second independent blank and reopening the first exact source. Cover failed Save/creation intent versus active bundle, production-origin explicit-install independence, meaningful starter purpose/design/settled painted preview and accessibility, keyboard/Entry fit, legacy emission and unchanged sound oracle on the actual built candidate. No local build/full suite allowance is implied. Normal affected/static/catalog/capacity, fresh final full SO, exact-head CI/Codex/configured and queue/post-landing checks remain required.

Pinned reference evidence remains limited to equivalent same-machine blank/text/save/independent-scene/reopen behavior; it is not a new study or current-candidate execution. Owner verification uses the deployed website, with no downloaded build, credential disclosure or recruited study. Acceptance of the one hosted quiz task remains separate from blank/panels/whole and full E5F acceptance.
