# Phase 4: SVG proposal contract

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset: AC-4, as this row's
verification line states it: reject unknown element IDs, conflicting field ownership,
unsupported capabilities, stale revisions and injected instructions; unresolved behaviour intent
stays explicit. Builder: Claude Code cloud worker created by coordinator
`session_017SdbwQ6d3pRaakjohGfCcC`, environment `env_017nuiDZBW9smUNLdWVQK8cf`. No product
behaviour changes, no model call, no spend. The holdout was not read.

## Pinned main

Worktree created from `99c461b8ed30c2a03dfc87a002573263473a2425` (PR #1854) after a fresh fetch.

## Rules (written before code)

The change sets state rules (layer ownership, revision-to-content identity), so the rules come
first. Each line is observable through `validateSvgProposal(proposal, context)`.

- **R1 Real layers.** Every layer id a proposal names is an entry of the reader's inventory
  (`SvgImportResult`) of a fitting kind: a text field names a text candidate, a picture field an
  image candidate, an outline field an outline candidate; a component member names any inventory
  entry. Any other id refuses the whole proposal with `unknown-layer` naming that id.
- **R2 Current revision.** A proposal carries the `sourceRevision` of the inventory it was made
  from: `sha256:` plus the SHA-256 of the sanitized markup (`svgSourceRevision`). If it differs
  from the revision of the inventory it is validated against, the whole proposal is refused with
  `stale-revision`. The same markup always gives the same revision; any change to the markup,
  including its text, gives a different one.
- **R3 One owner per layer.** A layer has at most one claim in a proposal: one field decision per
  layer id, and at most one component holding it, whether as a member or through a field's
  `component`. A second claim refuses with `conflicting-ownership` naming the layer and both
  claimants. Component ids are unique (`duplicate-component`), and a field's `component` names
  a component of the same proposal (`unknown-component`).
- **R4 Supported capabilities only.** A component's family and each intent value come from the
  contract vocabulary and from the capability set the caller allows (`context.capabilities`).
  Anything else refuses with `unsupported-capability`. `unresolved` is always allowed.
- **R5 Unresolved intent stays explicit.** Every intent key of a family is required. A missing
  key refuses with `missing-intent`; validation never fills a default. An accepted result lists
  every intent key whose value is `unresolved`, by component, in `unresolved`.
- **R6 SVG text is data.** A proposal carries no text content, markup, code or free-form note:
  only ids, enumerated values and an optional field title. Any key outside the schema refuses
  with `unexpected-key`; a title longer than 60 characters, spanning lines, or holding `<`, `>`
  or a control character refuses with `invalid-value`. Validation never reads the inventory's
  text, so two inventories that differ only in text give the same verdict for proposals with
  their own matching revisions.
- **R7 All or nothing, deterministic.** The verdict is either accepted, with a normalized copy of
  the proposal, or refused, with every error found and nothing usable. Inputs are never mutated;
  the same inputs give the same verdict; validating an accepted normalized proposal again gives
  an identical result.

Not in this row: applying a proposal to the draft, preserving user corrections and rollback
belong to row 5 (`apply.ts`), which the spec gives the rest of AC-4.
