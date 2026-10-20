# E6 — Native declared graphic actions through Companion

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

After E7.2; requires H0 and baseline verb/dispatch extraction. Add declared native graphic
capabilities to Companion: score +1/-1, quiz reveal and graphic clock start/pause/resume/reset.
Reuse the control model, profile, machine legality and single dispatcher. This is not a macro
language, panel-owned state or a new authoring bridge. Clip transport remains its own action.
Foreign typed actions are integrated only after E1–E3 and qualified in E8.

Owned seams: `src/control/controlModel.ts`, extracted verb dispatch/view, `panelFeedback.ts`,
`panelRelay.ts`, module actions/variables/presets and the existing relay protocol/backend
validation. Additive protocol version/capability negotiation is required; no arbitrary JS,
unvalidated data-key writes or bypass of the normal authority/target checks.

## Contract

Advertise stable declared capability IDs, operator labels, argument descriptors, target kind,
allowed/unknown state and feedback revision. An invocation contains protocol version, unique
press ID, capability ID, validated arguments, target reference, lease epoch and snapshot revision.
A selected-target button resolves only if the selection/instance still matches its advertised
snapshot; a fixed-cue/instance button remains fixed through list reordering. Stale capability,
wrong production, replacement instance, lease or state is refused with a useful reason.

Native arguments use the declared types. Do not infer clock/quiz semantics from labels; expose
only capabilities the graphic actually declares. Data-connected score adjustment follows the
same override policy as the UI; read-only candidate fields from E7 cannot become writable through
hardware. Clock commands operate clock state/time origin, not a durable command every tick.
One press has one logical effect. A lost acknowledgement does not justify replaying a +1 action;
deduplicate by press ID and report uncertain completion where the existing route cannot prove it.
Old modules keep their existing verbs; unsupported new actions stay unavailable.

## Acceptance

### AC-1: Discovery and invocation match the generated panel
A sports and quiz graphic expose their declared actions and argument forms. Companion targets,
labels, legal actions and feedback match the UI. Unknown/missing capability references after a
package edit are visible and disabled; saved buttons are never rebound by label or row position.

### AC-2: A press has the same authority and single effect as the UI
Mouse, keyboard where supported and Companion invoke the same dispatcher. +1/-1 updates one
score; quiz reveal leaves an independent running clock intact; clock transport preserves time
origin across a controller reconnect. Duplicate, delayed, out-of-order, wrong-target, stale-state
and revoked presses are refused or correlated without a second effect. An on-air replacement
between press and processing is not accidentally controlled.

### AC-3: Protocol compatibility and credentials remain bounded
Old module/new app and new module/old app negotiate known actions and reject unknown ones.
Typed payloads, field limits and capability IDs are validated at both relay and answering-page
boundaries. No capability allows a module key to write directly to another production or run
script. No unacknowledged retry or second command log. Source bindings obey the UI's policy.

### AC-4: Physical custom buttons are usable on required outputs
A real Stream Deck runs score, reveal and clock buttons with rendered CasparCG/Bridge and
OBS/browser evidence; feedback distinguishes accepted, applied, unknown and failed outcomes.
An unfamiliar operator follows the guide without Windows command scripting. H0 transport
buttons still work. Record actual latency without replacing existing hardware acceptance limits.

## Phases and verification

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| E6.1 | Capability/argument protocol, guarded shared dispatch and feedback; AC-1–3 | Cloud: extend panel-feedback/control-model Node tests, new `e2e/configured/panel-graphic-actions.spec.ts`, relay validation and module protocol tests. |
| E6.2 | Module discovery/actions/presets, guide and physical proof; AC-1–4 | Module lint/test/package; local Windows/Companion/deck and required outputs. Reuse H0 unchanged evidence with explicit dependency review. |

Rollback: disable negotiated graphic actions and restore prior module while retaining known
transport verbs. Never replay ambiguous non-idempotent presses during downgrade or reconnect.
