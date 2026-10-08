# Shared command qualification

2026-10-08. Start of R1.3b, before model editing. Baseline: fetched main
7c187050188339990bab7349f3a57b34cda7fcc2, containing #820
018c03d307647f05982148dab2087e36e2ef2abb. Branch
codex/editor-command-qualification in an isolated managed worktree.

## Why and goal

Existing UI operations lack discoverable runtime argument contracts. Qualify a
bounded command catalog over those handlers so a deterministic caller can inspect
capabilities and author the same saved source, identities, history and poses.
Earlier drawing and research receipts do not verify this implementation.

## Non-goals

No model, WebMCP, paired live MCP (R3.2), public control port, engine replacement,
new geometry, usability polish, save/sync change or whole R1.3b acceptance.
No Node-pure, model parity, owner or physical-host acceptance claim.

## Decisions

- Keep operations, EditorSession, active document adapter, source readers and
  PreviewController. Catalog schemas decode only the task's proven subset:
  layer.create, text.set, base.set (position), animation.key (position set),
  step.add and out.set. Other existing UI operations remain internal.
- Use source-owned IDs mapped to existing selectors. Inspection never mints IDs.
  Unnamed/ambiguous targets retain source and actionable refusal guidance.
- Strict schemas generate discovery and validate unknown inputs. Existing source
  handlers still enforce ownership, values and dependencies for the entire batch.
- Inspection is bounded and includes session instance, source/assets revision,
  selection/playhead/sample context, history head and target capabilities.
  Every apply/history request checks that context and session liveness immediately
  before writing, and refuses while a human gesture is active. No stale undo.
- Source commit receipts include transaction, revision, patch, identities and history.
  Preview receipts require the existing correlated pose acknowledgement. Pending,
  failed and superseded previews never become visible-success receipts.
- Deterministic browser calls import the same catalog/session modules. No public
  transport or raw store setters for semantic authoring. UI controls keep calling
  existing handlers. Test setup may supply rehearsal samples separately.

## Observable acceptance

1. Direct discovery/schema tests cover stable IDs, strict argument types, finite
   values, extra keys, bounds, unsupported commands and actionable refusals.
2. Closed/reopened sessions, stale source/assets/view/history, active gestures and
   mixed valid/invalid batches preserve source, identities, samples and history.
   Cancelled drafts leave no source/history entry. History travel matches UI undo.
3. Run the nested/masked text-and-box SVG through the wizard with one public text
   and one excluded static text. On fresh copies, UI and semantic paths create two
   shapes/new text, edit public defaults without samples and excluded static wording,
   author two position keys, Next and Out. Compare exact patches, IDs and history,
   and rendered poses at matched revision/time/cue.
4. Save/reopen both results using existing UI, rehearse In/Next/Out, validate and
   execute existing SPX/CasparCG/OGraf packages. Preserve masks, assets, exclusions.
5. Inspect cumulative captures at 1920x1080, 1366x768 and 1093x614 (documented 125%
   laptop viewport proxy, not actual browser/OS zoom; use existing zoom if needed).
6. Shared jobs run focused checks, affected browser tests and full build. Check,
   commit verified phases, stamp and queue-merge. Record actual merge/deployment;
   leave broader release, real model and owner acceptance open.
