# Verification

Baseline: fetched main 5c8d7b8f9aad65eaf5260c6825e4b4d148af1308, containing
#825 / aa2717b3. Fresh branch codex/editor-model-proposals. Earlier command and
persistent-drawing receipts are starting evidence, not proof of these proposals.

## Deterministic review and cumulative task

Shared job j-3822 passed **21 tests** in 3.8 minutes. It exercised grounded review,
Apply/Cancel, no writes before Apply, mixed invalid batches, human source/assets,
view/sample/history/gesture interleaving, delayed responses/remounts, provider,
quota and network failures, and the cumulative imported SVG task at three sizes.
Shared job j-3831 passed **24 tests** in 3.7 minutes, including the
readable review values, settled preview feedback and added empty/offline/out-of-order
regressions. All three cumulative viewport and executable-output tasks ran.

The cumulative task compares UI authoring with reviewed deterministic model
proposals. It verifies public defaults, excluded static wording, created shapes
and text, base position, runtime X keys, Next/Out, cancellation, exact phase source,
history and pose parity, preserved rehearsal samples, save/reopen and In/Next/Out.
It builds and executes 18 SPX/CasparCG/OGraf browser packages with no console or
network errors. Store setters only seed fixtures/sample input; proposal edits use
EditorCommands.apply and existing session handlers. Deterministic responses are
not model-quality evidence.

## Paid requests

[Six full request contexts](model-requests.json) and [normalized outcomes](model-evaluation.json), shared job
j-3824, used the existing configured Anthropic/claude-sonnet-5 gateway route and
credentials. One attempt per request, no route expansion or additional billing
setup. Token-priced estimated spend: **USD 0.180402**, against USD 0.50 and six
requests maximum. Before each call the benchmark reserved its conservative
maximum output plus input allowance; it stopped at six. Pricing came from the
[gateway model catalog](https://ai-gateway.vercel.sh/v1/models), at USD 2/10 per
million input/output tokens. This is an estimate, not an invoice.

The payload used the public tracked fidelity-nested.svg fixture plus original
synthetic test shapes/wording. It contained the catalog and bounded inspection,
with no raw source, assets, credentials, user projects or sample values. Actual
requests: saved headline default, excluded static wording, base position,
two runtime X keys, Next cue and an unsupported path/field conversion. The five
supported command batches match the requested exact IDs/values. The unsupported
request returned no commands. Its explanation incorrectly called static-note
not excluded despite fieldId=null.
Commands and rendered effects remain independently validated. This small sample
does not establish general model reliability or usability.

The paid requests use independently captured synthetic task snapshots. The
cumulative sequence uses deterministic replies. Paid output replay through the
actual review UI/shared handlers passed **6 tests** in shared job j-3845 (40.5s),
recorded in [model-replay.json](model-replay.json). Exact positions/key values and
Next/Out times agree; source review is read-only, supported batches have one undo,
undo/redo restores exact source, and samples/assets remain intact. The empty
refusal has no Apply action. See the [paid headline review](paid-public-review.png).
Replay makes no further paid calls. These adapter
calls do not independently qualify endpoint account authentication or the
production ledger; product requests reuse those unchanged services.

## Runtime reference comparison

Executed VectorCraft v0.4.0 Windows x64 portable, release commit
[a26aa5b203c901979eb447d28e34e7357138c789](https://github.com/storytold/vectorcraft/releases/tag/v0.4.0).
Archive SHA-256 FA8D7DC5590EBF1ADB93D040DD7420441A2E55DB2971F33C05C0C0E5EDDE0FEC.
Research source pin: 5cacbe36b33608c8803e03f25a1178354218f9a0. Relevant paths:
apps/vectorcraft/src/control_server.rs and crates/ui-egui/src/control.rs for
native UI event/control ownership; crates/engine/src/cmd/typecmd.rs,
object.rs and edit.rs own text.setText, object.transform and edit.undo/redo.
The released text.create catalog entry seeds the reference fixture. The executed CLI reports vectorcraft-cli 0.4.0. Cargo.toml declares MIT OR Apache-2.0, with LICENSE-MIT and LICENSE-APACHE.
No third-party code or assets were copied into the NoaCG product;
brand/app-icon assets were not reused.
Existing source/release license boundaries remain unchanged.

Shared job j-3832 recorded [21 settled control calls](reference-ui.json). Native
1366x768 UI: create Morning report, change to Evening report, move +70/+30,
keyboard undo and redo, pointer-select/drag +30/+15, then keyboard undo. Inspection
waits for history transitions, rather than treating accepted input as completed.
Selection stays on object 2; undo restores x=120 then redo x=190; pointer movement
reaches x=220 then undo restores x=190. Editable text remains Evening report.
See [native UI](reference-ui.png) and [rendered artwork](reference-artwork.png).
Machine-local image paths in the receipt are normalized to repository-relative paths.
An earlier capture inspected before the frame consumed keyboard input and is
not used as an undo verdict; the final run waits for the observed state.

No equivalent reviewed command-proposal interaction was found in the released
reference controls and inspected catalog. NoaCG's review/lifetime/concurrency
behavior is therefore tested against its own explicit contract. Both editors
keep canvas selection and existing undo ownership for text/position edits;
NoaCG intentionally also preserves public/default/static-field distinctions,
rehearsal samples and broadcast cues, and commits a reviewed batch as one undo.
Reference control events verify a running native editor, not physical-keyboard
usability, pixel parity or whole-editor feature parity. Native 1366x768 rendering
was inspected; cross-viewport responsiveness is checked in NoaCG, not claimed
for the reference.

## Rendered results and boundaries

Cumulative captures at 1920x1080, 1366x768 and the documented 1093x614 viewport
proxy show the nested masks, editable title, static wording and created artwork,
with accessible canvas, retained Pen tool and In/Next/Out timeline. Proposal
values/targets are scrollable within the existing inspector column. The smallest
proxy keeps artwork small even at 200% fit; no unrelated layout redesign is made.
1093x614 is a viewport proxy, not actual browser/OS zoom.

| Viewport | UI task | Proposal review | Exact source/history/pose |
|---|---|---|---|
| 1920x1080 | [capture](desktop-ui.png) | [capture](desktop-proposal.png) | [receipt](desktop-parity.json) |
| 1366x768 | [capture](laptop-ui.png) | [capture](laptop-proposal.png) | [receipt](laptop-parity.json) |
| 1093x614 | [capture](laptop-125-ui.png) | [capture](laptop-125-proposal.png) | [receipt](laptop-125-parity.json) |

No full CLI, WebMCP/paired MCP, broad B17/B18/E23, funding/BYOK, owner acceptance,
physical receiving-host or general help claim. Paired live MCP remains R3.2.

## Check and landing

Review, simplify and verify ran inline. The exact review base is
8d7087bc78151d36e22164cdce6caf7f0e61c65c, after reconciling with current main.
The 35-file scope below is the review-request output; every listed source, test,
contract, document and receipt was inspected, including rendered PNGs.

Four review findings were fixed: raw command JSON needed exact readable edit
values; malformed output needed a concise refusal; preview polling needed to stop
at acknowledgement; creation labels needed to reflect shared text semantics.
Point text ignores width/height, text boxes use both, and the box flag has no
shape effect. The new regression checks review against the actual saved source,
read-only preparation and one undo. Simplify removes unused patch-file/model
metadata from the pending review object. No unresolved finding remains.

Shared job j-3846 removed the cancelled-generation installation guard temporarily.
The out-of-order test failed at its stood-down-handler assertion (expected zero
review regions, received one), exit 1; the wrapper restored the original source
and exited 0. [Mutation receipt](mutation.json). The same test passed with the
guard in j-3831 and integration. This proves the assertion is active.

Required integration job j-3847 passed **674 tests**, with **121 existing skips**,
in 16.1 minutes. It planned 53 affected specs, 52 blocking; the existing
editor-foundation quarantine was unchanged. Older evidence images/JSON written
incidentally by existing tests were restored, keeping those archived receipts
intact. No skip, baseline or gate was weakened.

After the creation-label change, j-3849 passed the existing **24 focused tests**,
including all three cumulative viewport and 18 executable export tasks. The new
point-text regression failed because it exposed that overflow text also ignores
width. The label was corrected to promise only point position, and j-3854 passed
that new regression. These are 25 focused cases across the two final runs.
An intervening quoted-filter job found no tests; it is not acceptance evidence.
Final captures were inspected again at all three viewports.

The committed-tip build and check stamp are recorded by the shared queue before
landing. Merge and post-land deployment status belong to the PR and final session
report. Physical receiving-host, subjective usability, broad model quality,
endpoint authentication and production-ledger behavior were not independently
qualified by this slice.

Reviewed files:

- `.claude/rules/docs-work-specs-editor-5u4g.md`
- `contracts/index.md`
- `contracts/records/editor/2026-10-08-each-meaningful-editor-step-run-comparable.md`
- `contracts/rules/editor/each-meaningful-editor-step-run-comparable.md`
- `docs/EDITOR_PLAN.md`
- `docs/research/editor-acceptance-register-2026-09-17.md`
- `docs/work-specs/editor-model-proposals/README.md`
- `docs/work-specs/editor-model-proposals/check.md`
- `docs/work-specs/editor-model-proposals/desktop-parity.json`
- `docs/work-specs/editor-model-proposals/desktop-proposal.png`
- `docs/work-specs/editor-model-proposals/desktop-ui.png`
- `docs/work-specs/editor-model-proposals/laptop-125-parity.json`
- `docs/work-specs/editor-model-proposals/laptop-125-proposal.png`
- `docs/work-specs/editor-model-proposals/laptop-125-ui.png`
- `docs/work-specs/editor-model-proposals/laptop-parity.json`
- `docs/work-specs/editor-model-proposals/laptop-proposal.png`
- `docs/work-specs/editor-model-proposals/laptop-ui.png`
- `docs/work-specs/editor-model-proposals/model-evaluation.json`
- `docs/work-specs/editor-model-proposals/model-replay.json`
- `docs/work-specs/editor-model-proposals/model-requests.json`
- `docs/work-specs/editor-model-proposals/mutation.json`
- `docs/work-specs/editor-model-proposals/paid-public-review.png`
- `docs/work-specs/editor-model-proposals/reference-artwork.png`
- `docs/work-specs/editor-model-proposals/reference-ui.json`
- `docs/work-specs/editor-model-proposals/reference-ui.png`
- `docs/work-specs/editor-model-proposals/spec.md`
- `e2e/editor-model-proposals.spec.ts`
- `e2e/editor-proposal-task.spec.ts`
- `src/ai/editorProposals.ts`
- `src/components/AGENTS.md`
- `src/components/editorFoundation/EditorFoundation.tsx`
- `src/components/editorFoundation/ProposalPanel.tsx`
- `src/components/editorFoundation/commands.ts`
- `src/components/editorFoundation/foundation.css`
- `src/components/editorFoundation/proposals.ts`
