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

The change sets state rules (layer ownership, revision-to-content identity), so the rules came
first and a fresh read-only `/so` challenged them before any code (session
`session_017SdbwNvgUWXseJLdBP3NRF`, AGREE WITH CORRECTIONS on `54a209af`). Its corrections are
folded in below and listed after the rules. Each line is observable through
`validateSvgProposal(proposal, context)`.

A proposal has three parts: the `sourceRevision` it was made from, field decisions (one per text,
picture or outline layer it decides) and components (one per behaviour recipe it binds, with role
picks and intent). The caller passes the reader's inventory, the recipe role table (built from the
recipe declarations in `src/templates/behaviours`) and the capabilities it allows.

- **R1 Real layers, of the right kind.** Every layer id names an entry of the reader's inventory
  (`SvgImportResult`): a field decision names a text, picture or outline candidate; a role pick
  names a text candidate for a `text`-pool role and a group or shape for a `drawn`-pool role. An
  id the inventory does not hold refuses the whole proposal with `unknown-layer`; an id of the
  wrong kind with `wrong-layer-kind`. A role the recipe does not declare refuses with
  `unknown-role`; a per-row role needs a row index inside the recipe's row limit, a graphic-level
  role has none (`invalid-value`).
- **R2 Current revision.** A proposal carries the `sourceRevision` of the inventory it was made
  from: `sha256:` plus the SHA-256 of the sanitized markup. Validation computes the expected
  revision itself from `context.inventory.markup` (synchronously, `svgSourceRevision`) and never
  takes one from the caller. A different value refuses the whole proposal with `stale-revision`.
  The same markup always gives the same revision; any change to it, text included, gives another.
- **R3 One owner per layer.** One field decision per layer (`conflicting-ownership`). A layer is
  picked by at most one (component, role, row) (`conflicting-ownership`, naming both claims).
  The recipe's role kind says whether the layer may also be an operator field: a `field` role
  (the score's team and figure, the quiz's question and answers) is a field and may not carry a
  decision with `on: false`; a `layer` role on a text candidate (the vote's labels) is a display
  target and may not carry a decision with `on: true` (`conflicting-ownership`, the step's "two
  writers on one node"). At most one full recipe per graphic, as the existing one-full-recipe
  guard says, and at most one countdown field (`conflicting-ownership`). Component ids are unique
  (`duplicate-component`).
- **R4 Supported capabilities only.** A component's recipe and each specific intent value must be
  in `context.capabilities` (`quiz`, `quiz.lock:no-lock`); a `countdown` field needs a
  clock-shaped candidate and the `countdown` capability. Anything else refuses with
  `unsupported-capability`. A recipe the role table does not hold refuses the same way. The
  spec's unsupported pairs are refused whatever the caller allows: no-Lock with automatic reveal.
- **R5 Unresolved intent stays explicit.** Every intent key of a recipe is required. A missing
  key refuses with `missing-intent`; validation never fills one. `default` (the recipe's own
  declared defaults, which deterministic imports use today) and `unresolved` (nobody has decided)
  are distinct values, both always allowed where the key offers them. An accepted result lists
  every `unresolved` key, by component, in `unresolved`.
- **R6 SVG text is data.** A proposal carries no text content, markup, code, sample or free-form
  note: only ids, enumerated values, booleans, row indexes and an optional field title. A field
  decision carries `layer`, `on`, `kind` (`text` or `countdown`, text candidates only) and
  `title`; author-owned choices (`whenOff`, `align`, `keepNudge`) and anything else refuse with
  `unexpected-key`. A title longer than 60 characters, spanning lines or holding a control
  character refuses with `invalid-value`. Validation never reads the inventory's text, so two
  inventories that differ only in text give the same verdict for proposals carrying their own
  revisions.
- **R7 All or nothing, deterministic.** The verdict is either accepted, with a normalized copy of
  the proposal, or refused, with every error found and nothing usable. Inputs are never mutated;
  the same inputs give the same verdict; validating an accepted normalized proposal again gives
  an identical result.

Corrections taken from the rules review: the vocabulary is written out (it was missing from the
reviewed commit); ownership follows each recipe role's declared kind, so the score's mixed binding
passes and a vote layer that is also a field does not; role picks are checked against the role's
layer pool; `default` is separate from `unresolved`; field decisions carry only `on`, `kind` and
`title`; validation computes the revision itself, synchronously; the `<`/`>` ban on titles was
dropped as a product decision the spec never made.

Not in this row: applying a proposal to the draft, preserving user corrections and rollback
belong to row 5 (`apply.ts`), which the spec gives the rest of AC-4.

## Vocabulary

Intent keys per recipe, from the spec's product contracts. Recognition never implies a policy:
each key is a decision. Recipes not listed have no intent keys.

| Recipe | Intent keys and values |
| --- | --- |
| `quiz` | `lock`: `default`, `lock`, `no-lock`, `unresolved`; `reveal`: `default`, `manual`, `automatic`, `unresolved`. No-Lock with automatic reveal is unsupported. The correct answer is operator content and has no key |
| `credits` | `layout`: `default`, `role-above`, `role-beside`, `unresolved`; `playback`: `default`, `static`, `roll`, `cards`, `unresolved`. Cards advance on operator Next; a timed advance is a later profile value, not a proposal key |
| `clock` (the instanced recipe row 7 adds) | `mode`: `count-up`, `duration`, `target-time`, `unresolved`; no `default`, because the spec makes an absent clock intent a decision. No live mode switch and no count-up stop limit |

A capability id is a recipe id (`quiz`), a recipe value (`quiz.lock:no-lock`) or `countdown` for
a countdown field. Lower thirds, tickers and linked text need no component: field decisions
carry them. A layer the proposal does not name stays as the reader offered it.
