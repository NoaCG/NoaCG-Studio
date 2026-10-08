# Reviewed editor proposals

2026-10-08. R1.3b bounded model editing. Baseline: fetched main
5c8d7b8f9aad65eaf5260c6825e4b4d148af1308, containing #825 / aa2717b3.
Branch: codex/editor-model-proposals, fresh isolated managed worktree.

## Why and goal

Turn a request about the current graphic into a grounded, validated command batch
that the user can inspect, Apply or Cancel. Apply uses the six qualified commands
and their existing source/session pipeline, with one undo entry per batch.

## Prerequisites and decisions

- The foundation has no grounded help/chat implementation. The legacy AIPromptPanel
  rewrites template code and is unsuitable. Supply only bounded proposal context.
- Reuse modelGateway, settings, consent, account gating, server credentials,
  routing, structured validation and gateway ledger. No new endpoint, task funding,
  credential storage, model picker or automatic retry.
- Capture catalog/schema version, source-owned IDs, capabilities/refusals,
  public defaults/static wording, position values and cue timing, document/binding
  revision, view/sample context token and history head before the call. Bound the
  snapshot and refuse targets outside it. Source content is data, not instructions.
- Validate response shape, grounded targets/capabilities and the entire source patch
  before review. Preparation is read-only. Apply rechecks every guard synchronously.
- Cancel invalidates request ownership. Ignore cancelled/unmounted late replies.
  Manual edits remain usable during requests/failures. Stale proposals refuse.
- Show exact command values and targets independently of model prose. Report
  committed source separately from matching preview acknowledgement.
- Use configured providers. Record real calls separately from deterministic stubs.

## Non-goals

Full CLI round-trip, broader E23/B17/B18 acceptance, funding/provider expansion,
WebMCP, paired live MCP (R3.2), public ports, engine replacement, new geometry,
UI redesign, unrelated usability polish and save/sync changes.

## Observable acceptance

1. Requests carry catalog and inspected context. Malformed, unsupported,
   uninspected and mixed invalid batches preserve source/history.
2. Review lists exact edits/targets. Apply commits once through EditorCommands;
   Cancel and late replies commit nothing. Preview readiness is separate.
3. Revision/assets, binding/session, selection/playhead/sample, history and
   active-gesture guards survive delay and human interleaving.
4. Network/quota/provider failures retain manual/offline authoring. Remount
   cannot show or apply a response from a previous binding.
5. Extend the nested/masked SVG task with reviewed public-default, excluded static
   text and position/cue proposals. Verify samples, history, save/reopen, rehearsal
   and executable SPX/CasparCG/OGraf outputs.
6. Inspect rendering at 1920x1080, 1366x768 and 1093x614 viewport proxy. Run
   focused/affected/browser/build jobs, check and queue-merge.
7. Run a working-reference task; record pins, interactions, undo/cancel and
   rendered evidence. No subjective usability or whole-editor parity claim.

## Reference comparison

Use existing Crafting Apps research first: VectorCraft native text/position
commands and undo, EffectCraft text/key behavior. Check released references for
reviewed model proposals. If none exists, compare shared text/position/undo and
verify review/concurrency against NoaCG's contract. Copy no third-party code/assets.

## Evaluation boundary

At most six real requests and USD 0.50 estimated spend on an already configured
route. Stop if pricing cannot bound spend or credentials are unavailable; record
the attempted prerequisite. Stubs never establish model quality.
