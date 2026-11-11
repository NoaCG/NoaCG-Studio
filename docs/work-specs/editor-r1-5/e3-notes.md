# E3: assisted editing and CLI round-trip

Phase E3 of the immutable editor-r1-5 plan at
`f0f2e3fe0c2cc14e23b171957b6f8d18905fd434`. Previous independently verified
main/product source: `d8b18080bfacf2303a1d88e4ca1398fb263d9657` (E2). Owned branch
`codex/plan-editor-r1-5-e3-build`. This phase does not grant release approval.

## Reproduction and decision

The current Assistant only offers “Describe an edit” and “Propose edits”.
`ProposalPanel.tsx`, `proposals.ts` and `ai/editorProposals.ts` have no help mode
or grounded editor instructions. Historical command/proposal/CLI receipts explicitly
leave general help, access qualification and broader real-model quality open.
Reproduce in the current browser before product changes. Reuse the same gateway,
consent, account guard, bounded inspection and session handlers for help. No new
provider/model, funded route, billing policy, endpoint, credential storage or retry.

Required acceptance is the E3 row in spec.md, including B17/B18 R1 core,
E22/E23 and the consuming E12 preservation safeguards. Paired live MCP, WebMCP,
R2/R3, receiving applications and later owner/participant/device gates stay separate.

## Rules stated before implementation (Risky)

1. Asking for help is read-only: the entire source, assets, fields, samples,
   selection/playhead and undo/redo history remain identical after an answer.
   Help has no Apply action, even if a model returns commands.
2. Both help and proposed edits capture the active document binding, source/assets
   revision, selection/playhead/sample context and history before the call.
   Returned answers are accepted only while that exact context is still current
   and no gesture is active. Away-and-back selection is stale too.
3. Cancel, mode change, close, document switch or unmount invalidates the request.
   An invalidated late success or failure neither displays nor writes. A newer
   request alone owns its reply. Cancellation does not claim provider rollback.
4. A proposal is prepared read-only. Apply rechecks the captured context through
   the existing command/session handler immediately before one atomic commit.
   Unsupported/invalid/mixed/stale requests change no source or history.
5. One accepted proposal batch is one undo. Undo restores exact source/fields/
   assets; redo restores the batch. Source commit and correlated preview readiness
   are distinct facts. Pending/failed/unknown preview is never reported ready.
6. Help is grounded in maintained editor controls/instructions plus bounded current
   inspection/capabilities. Graphic labels/text and the question are untrusted data;
   no source execution, raw assets, secret values or user samples enter grounding.
7. Existing configured managed/free and BYOK authorization, consent, route,
   credentials, quota/timeout/fallback policy remain authoritative. A failure leaves
   manual authoring usable offline. No silent route/provider change or retry.
8. CLI-generated source, stable IDs, public defaults, operator field keys, excluded
   static text, inert data, unknown source and asset bytes survive supported visual
   edit, save/reopen, internal rehearsal and SPX/CasparCG/OGraf browser exports.

A fresh read-only Rules-first second opinion must challenge these rules before code.
Any rule discovered after implementation is recorded separately below. Verify
transitions using a small independently derived oracle, not a production algorithm copy.

## Verification (pending)

Retain baseline, failures and source/environment applicability. New source-specific
receipts must cover every E3 subcriterion in the inventory. Deterministic shared
command parity is separate from real configured-model quality and live access.
The initial sandboxed worker preflight failed disposable IO; reviewed escalation
passed at 2026-11-11T13:01:52Z. Git and Actions network reads passed. Runtime is
Codex Cloud Linux, 4 visible CPUs, 16 GiB, measured selector 2 browser workers.
Native child launch/wake-after-host-loss are unqualified; this is an active worker.

## Rollback

After landing, use a fresh owned feature worktree and `git revert -m 1 <E3_MERGE_SHA>`;
verify and land the revert only through `/queue-merge`. Replace the placeholder with
this PR's actual merge SHA in the independent landing receipt. No migration planned.

## Additional rule stated before the protocol correction

Native metadata on 2026-11-11 identifies `claude-sonnet-5-5` as **Claude Sonnet
5.5**, active, created 2026-09-28. The configured dotted `claude-sonnet-5.5` is a
Gateway slug, not a valid native Anthropic ID. Only the isolated verification
process uses the verified native ID for that same intended model, by coordinator
instruction. Global settings, defaults, keys, provider, funding and fallbacks stay
unchanged; arbitrary IDs are never silently normalized.

The native-ID request then failed. One explicitly authorized diagnostic retained
only HTTP 400 / `invalid_request_error` / `tool_choice: type "tool" and "any"
are not supported for this model.` The existing adapter always forces `tool`.
Before correcting that reproduced compatibility defect, the additional observable
rule is: **only the exact verified adaptive-only native Sonnet 5.5 route uses
`tool_choice: {type: 'auto'}` for structured requests. All other routes keep their
existing request. The command schema, response parsing/validation, accepted output,
route/model identity, key, cost accounting, attempt budget and timeout remain the
same. A response without the requested valid tool output refuses; it cannot become
an editor write or an unvalidated answer.** No additional model call or automatic
fallback is added. Fresh Rules-first review precedes the adapter edit.

## First real-quality finding and bounded correction

The first six served calls at `e2393159a6a73d903cd2189f5f2bf763748b25b0`
used the same intended Sonnet 5.5 with its native ID. All returned validated tools
on one attempt; five self-hosted managed calls and one normal sealed-key BYOK call.
The token-price estimate was USD 0.104124, not an invoice. Their runner's PASS
means execution/source/history assertions only. Fresh independent assessor
`/root/editor_r15_e3_builder/e3_model_quality` found **five quality passes and one
failure**: help-out invented a “Rehearse control” and implied an editor Next button.
The full original sample and this failure remain retained, not retroactively passed.

This is quality-review round 1, family **grounded control guidance**, class product
instruction defect. The guide now names actual Layers & Timeline controls and
supplies a distinct editorControls list, separating cue labels/command IDs from
buttons. A deterministic assertion checks these names against the visible UI.
No state or funding rule changes.

Before any further paid call, the coordinator explicitly confirmed the existing
first bounded quality repair/recheck: **one help-out task only**, using the original
question and the same selected original Riverlight title, after pinning the corrected
source. Expected quality: identify the current selection/existing Out accurately;
use Go to beginning/Play for entrance preview, Out for exit preview, Edit Out for
inspection and Set Out at playhead with Yes, reverse / No, author manually when
applicable. Do not invent Rehearse or Next buttons. The answer must leave source,
samples, view and history unchanged and offer no Apply action.

The original six-call sample cap is unchanged; successful tasks are not rerun.
This separate recheck has a one-call/one-attempt/no-fallback limit and the same
cumulative USD 2 conservative ceiling (previous served estimate USD 0.104124).
Only that verification process sets AI_RETRY_LIMIT=0 to enforce the explicitly
required one attempt; product/default retries are unchanged. No additional paid
recheck is authorized if the same guidance family fails again: reassess and stop.
An independent quality assessment must judge the actual returned answer.

## Consumed recheck, independent diagnosis and final protocol rule

The one-task recheck j-0028 on `b08176a144de3ff8d8d3656f819de5c5d5d22f4c`
returned HTTP 502 / malformed_response / “The model did not return the expected
structured result.” It returned no usable answer or usage. The quality assessor
kept corrected Help **unverified** and classified this as structured delivery failure,
not another hallucinated answer. USD 0.104124 remains only the known six-success
estimate; the failed recheck is not asserted free.

Fresh independent diagnose `/root/editor_r15_e3_builder/e3_diagnose` (native
`6af471e3-aedc-8191-950c-c17627c20064`) recommended **one final scoped repair**.
The installed, already pinned direct dependency @anthropic-ai/sdk 0.133.0 documents
that auto tool choice lets the model choose whether to emit a tool, while
output_config.format supports native JSON-schema output. Thus optional tool
emission is mismatched with a required-tool parser; the native model itself is
not shown unsuitable. The coordinator explicitly authorized that final repair
and, only after deterministic checks and a conservative cumulative cost-bound
review, exactly one final Help verification (one call/attempt, no fallback,
unchanged cumulative USD 2 ceiling). Every prior failure and consumed limit remains.
Any subsequent failure stops this same run; no further patch or paid call.

**This observable rule explicitly replaces the earlier auto-tool rule, before code:**

- Only structured requests for the exact native Anthropic claude-sonnet-5-5 ID
  use output_config.format JSON schema. Use the installed public SDK
  jsonSchemaOutputFormat helper to lower its supported wire representation; add
  no dependency or provider/default/model-ID alias. Non-object root schemas
  refuse explicitly rather than being silently coerced.
- The helper deep-clones the schema. Provider-unsupported string/numeric/array
  constraints and literal values may become wire descriptions, while strict
  object structure and unions remain represented. The original neutral schema
  remains unchanged for gateway validation, and the existing frontend Zod
  contract still governs Help/proposals. No accepted edit/answer shape widens.
- Normalize a native served response's usage before parsing; existing servedParse
  carries it through malformed JSON, wrong shape, absent output and truncation.
  The existing executor/ledger accumulates that usage without capturing content.
  Never turn arbitrary prose, tool-only output or a truncated result into success.
- Other Anthropic IDs and unstructured requests retain their existing wire and
  result behavior. Route, credentials, funding, effort, timeout, defaults and
  fallback policies remain unchanged. Final verification alone has the explicitly
  authorized one-attempt limit; it does not alter product retry policy.

A fresh Rules-first challenge of schema lowering, full caller validation and
served-usage accounting is required before this final adapter edit. The original
six-task sample and first quality repair are not rerun or retroactively passed.
