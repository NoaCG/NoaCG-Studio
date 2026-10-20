# E2 — Generated typed OGraf forms, steps and action targets

Status: agreed planning scope, 19 October 2026; implementation and acceptance unstarted.
Reconciled against main `4e067b65674a9bf0a7632430b5dd0772c03a0331`.

## Shared execution contract

Parent: [production-page](../production-page-refactor/spec.md). The
[extension contract and exact sequence](../production-page-refactor/extensions.md) are normative:
file ownership, compatibility, evidence reuse, environment routing, stop/rollback and final
acceptance apply here. All phases below are product/qualification work, not refactor-only moves.
Paths named as new are planned files, not claims that implementation already exists. Use the
existing `/check`, targeted verification and `/queue-merge` procedures when execution starts.
Each phase must pass its listed ACs before the next dependent phase. `work.json` records intent
and acceptance, never worker progress. No implementation or run starts from this document.

## Scope, dependencies and ownership

After E1.2. Extend the existing generated controls/profile rather than introduce a form designer.
Owned seams: `ografContract.ts`, control descriptors/profile arrangement, extracted cue editor
and action bar, `ografCallFor`, `ografHost.ts`, foreign host target dispatch and related tests.
Retain ARRANGE, More, pinning and the complete generated fallback. No panel scripts/macros,
node workspace or invented state graph for foreign packages.

## Contract

Type-matched scalar/nested/collection controls and action forms preserve E1 types. Required and
invalid values are obvious before Update/Take; defaults apply according to the pinned schema,
not whenever a form reopens. Enum identity remains typed. Treat generic URI as a URI; use image
preview only for declared image semantics. Audit `hidden` against the pinned EBU label/display-name
meaning; intentional profile hiding is separate and controls remain reachable through More.

Actions visibly target preview or program instance; replacing that instance invalidates pending
actions. Step controls include relative forward/backward and Goto against the runtime's current
step count, plus supported animation options. Native snap is not automatically foreign Goto or
skip-animation. Unknown legality stays unknown; rejected actions surface without fabricating
state. Step position is distinct from animation time and arbitrary machine state. A running loop
at a held step must not lock the panel. Action completion does not prove a monitor is fresh.

## Acceptance

### AC-1: Typed forms preserve all supported input shapes
Use E1 fixtures with nested arrays/objects, typed enums and action arguments. Edit, save, reload
and dispatch while inspecting actual typed payloads and visible result. Required/invalid values
block the relevant action without erasing drafts; unsupported schema shapes give precise notes.
URI and hidden fixtures match the pinned semantics; profile recovery keeps bindings and values.

### AC-2: Steps operate the intended instance
Exercise dynamic count changes, backward/relative steps, Goto, held-step loops and supported
animation options. Out-of-range or unsupported operations give an explicit refusal. Switch
preview/program and replace an instance with an action in flight: no cross-target application.
Native Snap remains available only where defined; no invented equivalence for foreign packages.

### AC-3: Operator feedback reflects what is known
A rejected action, timeout or disconnected renderer is not displayed as successful/on-air.
Selected, staged, preview, pending and last-confirmed state are distinguishable with text/icons,
including on narrow panels. Unknown foreign legality does not appear as native confirmed legality.

### AC-4: Native controls and profile recovery remain intact
Sports score, quiz reveal and independent clock still use their declared behavior; E6 buttons
remain compatible. Full generated form stays reachable. Order/groups/pinning change presentation
only and do not add behavior or new state ownership.

## Phases and verification

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| E2.1 | Typed forms/arguments and schema semantics; AC-1/4 | Cloud: OGraf contract Node tests and new `e2e/ograf-controls.spec.ts`, including narrow panels and persistence. |
| E2.2 | Runtime step/target controls and truthful feedback; AC-2–4 | Cloud actual browser-rendered fixture with held/rejected/late action promises; local operator comprehension is repeated at E8. |

Rollback: disable only the unsupported foreign capability/control and preserve cue data and full
form recovery. Never map an unknown action to Next or silently discard its typed arguments.
