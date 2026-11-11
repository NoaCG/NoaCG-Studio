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
