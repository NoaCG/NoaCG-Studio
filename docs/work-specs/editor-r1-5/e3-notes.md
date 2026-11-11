# E3: assisted editing and CLI round-trip

The Assistant now offers read-only grounded **Help**, separately reviewed **Edit**,
and an offline Editing guide. Help captures the selected document/context, names
actual editor controls and refuses stale, cancelled or invalid replies. Reviewed
edits continue through the existing atomic preparation/apply/history handlers.
Only structured requests to the exact native Anthropic `claude-sonnet-5-5` route
use supported native JSON-schema output; other routes retain their wire behavior.
Served native usage survives malformed responses. No migration or dependency change.

This is phase E3 of the immutable plan at
`f0f2e3fe0c2cc14e23b171957b6f8d18905fd434`. Previous independently verified main is
`d8b18080bfacf2303a1d88e4ca1398fb263d9657` (E2). Product verification below is pinned
to `fda2cfdf9de35055d57299f0eeae90eff3f7ed70`; later receipt-only commits do not
relabel earlier executions. These are bounded engineering receipts. Final full-diff
review, exact-head CI/Codex and independent exact-merge acceptance remain required.

## Evidence and limits

- [Inventory](e3-inventory.md) maps B17/B18 R1 core, E22/E23 and E12 safeguards.
  [Qualification](e3/qualification.json) retains source/environment pins and failures.
  Maintained assistant/shared-command checks passed 46/46; corrected-guide checks
  passed 40/40; final gateway checks passed 533/533, all zero skips. An independent
  ownership oracle caught the deliberately removed request invalidation.
- [Final actual Help](e3/help-final.json) on the pinned product source returned native
  JSON HTTP 200, one call/attempt, 7515 tokens, read-only/no Apply. A fresh
  [quality assessor](e3/quality-review.json) passed the actual control guidance and
  explicitly accepted bounded reuse of five original successful tasks from
  `e2393159a...` auto-tool mode. [Deterministic replay](e3/native-schema-replay.json)
  proves current encoding preserves their original neutral schemas/outputs; it
  does not claim five new native generations or broad reliability. Original 5/6
  quality and the consumed malformed recheck remain failures at their own scope.
- CLI 0.12.4 scaffold/validate/inspect and actual stdio MCP inspection preceded a
  fresh package import, visual wording/+40 px edit, exact undo/redo, durable save
  and reopen. JS, field keys and font bytes stayed intact. All three fresh
  SPX/CasparCG/OGraf exports executed operator data, held Play and finite Out in
  Chromium without errors. Existing scoreboard/Riverlight cases retain static
  exclusions, inert JSON, unknown CSS, font/logo bytes and machine actions.
- [Executed comparable Studio task](e3/reference.json) uses official Linux Studio
  0.17.0, actual source `a1e9776...`, binary SHA256
  `9ba1de317cdc8380c38a694f1d201964d7b805833597419111dab9eea9a02681`.
  Its product source matches required pin `3142fc7...` (only release workflow
  differs). Text and X+40/undo/redo passed after respecting its 500 ms history
  burst. This is a comparable functional task, not whole-editor/device parity.
- Access evidence separates real self-hosted managed/BYOK and normal sealed-key
  endpoints from isolated simulated hosted-auth/ledger/rate/timeout fixtures.
  Generic assistant free/basic policy uses the existing per-IP burst, optional
  sign-in, bounded context/output and existing routing/fallback policy. No hosted
  account, Lite/Pro daily allowance or receiving-application qualification is claimed.
- Growth remains WARN/STOP under unchanged ceilings: the coordinator's current
  weekly job report shows backend STOP at 188%. No exception, selection dodge or
  headroom claim. Normal fresh PR capacity and CI checks remain authoritative.
- An unchanged older-model tool parser loses served usage on malformed responses.
  An isolated [probe](e3/legacy-accounting-probe.json) confirms byte-identical base
  code; tracked separately as [P2 #2385](https://github.com/NoaCG/NoaCG-Studio/issues/2385).

Initial sandbox disposable IO failed; reviewed escalation passed preflight at
2026-11-11T13:01:52Z. Git/Actions network reads passed. Environment: Codex Cloud
Linux, 4 CPUs, 16 GiB, 2 measured browser workers, isolated fixtures. Hosted staging
was not accessed. Production credentials/data were not accessed. No local build
was run: the scheduler rejected an unnecessary CLI build, so published CLI 0.12.4
was used; full CI remains authoritative. Physical receiving hosts, paired live MCP,
WebMCP, R2/R3, device/participant/owner release gates retain their assigned phases.

## Rule chronology and independent challenges

Pre-code rules `aeb3ef946...`: fresh Rules-first A, native
`6af467e1-77dc-8191-8433-62d6aadfa069`. Initial auto-tool compatibility rule
`b0a22d53...`: fresh A, native `6af46d9c-88a8-8191-8a0f-ceb52bcf505f`.
Fresh diagnose native `6af471e3-aedc-8191-950c-c17627c20064` recommended the final
exact-native JSON repair. Superseding rule `f7d537ad...`: fresh Rules-first A,
native `6af473d2-96f4-8191-bd02-bd0aa32f104e`; it explicitly challenged SDK lowering
and client validation boundaries. Final task-quality assessor native
`6af476d8-c350-8191-a251-e9d2e9f70075` passed the final Help and bounded historical
source applicability. These are distinct reviews; none is the final full-diff so.

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
served-usage accounting preceded this final adapter edit. The original
six-task sample and first quality repair are not rerun or retroactively passed.

## Final protocol verification and source applicability before the last call

Final Rules-first reviewer `/root/editor_r15_e3_builder/e3_final_protocol_rules`
returned AGREE/A at `f7d537adfb85408dd93a68d6d817e5b11adf9135`. It explicitly
noted SDK lowering of const/exclusive bounds and that the gateway does not validate
every JSON Schema keyword. Command/action literals and positive geometry still owe
the unchanged strict frontend Zod checks. No global validator change was made.

Targeted ESLint/API TypeScript passed. Gateway tests passed **533/533**, zero
skips/failures, including native JSON encoding, unchanged older/unstructured
routes, non-object refusal before fetch, strict union/bounds validation and
served usage for malformed/prose/missing/tool-only/truncated results. One local
uncommitted test-closure narrowing error (TS18048) was authoring feedback before
that acceptance run and is retained separately; no behavioral/policy failure was
hidden. Inline review found no further source defect; simplification reuses the
installed SDK helper, parseStructured and servedParse rather than another schema
or parsing implementation.

The original five successful quality outputs were generated at `e2393159a...`
using **auto tool use**, not the final JSON wire. Their exact original prompts,
inspection and complete neutral schemas were replayed with injected native JSON
responses: [five deterministic adapter replays](e3/native-schema-replay.json)
returned identical neutral outputs and unchanged schemas. No real provider call
occurred in those replays. Frontend review/apply/context/history handlers and
neutral output contracts are unchanged; Help grounding alone gained accurate
control names. Original real edit/data/refusal quality remains source/protocol
specific, and this replay does not claim final-protocol model generation quality.
The fresh independent quality assessor accepted that bounded applicability; the
final full-diff reviewer and exact-merge checker still judge their own gates.

[The conservative bound](e3/final-cost-bound.json) reserves all four prior
unknown-usage inference attempts at their full sent caps, six known successes at
the highest already observed regional token prices (USD 2.2/11 per million), and
the prospective final call. It uses one input token per serialized UTF-8 request
byte plus 4096 framing tokens, full output caps and no cache discount. Its upper
**estimate is USD 1.7426464**, below the unchanged USD 2 ceiling, not an invoice or
an assertion that unknown prior usage was zero. Metadata GETs and mocked fixtures
are not inference calls. The coordinator read and approved this table before dispatch.

The sole final intent is nonce **e3-final-help-1111**, with a distinct exclusive
intent/result path in the worker's scratch receipts. Pin the verified source and
persist intent/source/bound before queue dispatch; an unknown acknowledgement is
consumed/unknown until reconciled, never an automatic resubmit. Exactly one
help-out request/attempt, no fallback, successful tasks not rerun. Any subsequent
behavioral/model failure stops this same run with the missing receipt explicit.

## Final call disposition and rollback

[Persisted intent](e3/final-call-intent.json) nonce `e3-final-help-1111` preceded
dispatch. The actual payload's conservative cumulative upper estimate was
USD 1.742653, below the unchanged USD 2 ceiling, with unknown prior attempts
reserved at full sent caps; this is an estimate, not an invoice. The sole final
call completed successfully. No further paid calls are authorized or needed.

After landing, use a fresh owned feature worktree and
`git revert -m 1 <E3_MERGE_SHA>`; verify and land through `/queue-merge`. The
independent landing receipt replaces this placeholder with the actual merge SHA.
No migration. Coordinator owns review stamp, queue and repair responsibility.
