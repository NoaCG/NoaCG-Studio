# Independent second opinion: complete NoaCG editor rebuild

Review only. Do not implement product changes, edit the planning branch, submit it to the
merge queue or deploy. Return findings and proposed document corrections for the owner to
bring back to the planning session. You may use your own review worktree for report artifacts.

## Locate the exact package

Planning worktree:
C:/Users/ahonemi/.codex/worktrees/editor-baseline-design/NoaCG-Studio

Branch: codex/editor-baseline-design
Repository: https://github.com/NoaCG/NoaCG-Studio
The consolidated package started at commit 931a41ca. Read this branch's current HEAD, including
the subsequent review-request and owner-checkpoint clarification; report the exact SHA.
Do not review the older codex/editor-unified-roadmap worktree or main by mistake. Read the
applicable repository instructions. Do not change another session's checkout/branch.
Use absolute paths derived from the planning worktree for the relative paths below.

## Purpose and non-negotiable destination

The current editor is not good enough. We need a substantial makeover into a professional,
predictable broadcast graphics editor with familiar After Effects-style canvas and timeline
interaction. Zero Density OGraf Studio is the concrete benchmark. We want to match the required
editing capabilities and outperform the complete imported-artwork/template-to-branded-production
workflow, with evidence rather than a feature checklist. Quality, robustness and maintainability
matter more than minimizing implementation effort. Existing comparable editors establish useful
reference behavior, not proof that our proposed source/runtime architecture is already correct.

The owner wants to try every step when available and give feedback, but must not become the
only tester or need to explain standard editor behavior repeatedly. The plan should let a new
implementation session execute a bounded phase without guessing the intended user interaction.
Product implementation is explicitly on hold pending review and owner authorization.

## Read first

1. docs/EDITOR_PLAN.md - single authority for destination, sequence, scope and completion.
2. docs/research/editor-review-brief-2026-09-18.md - reading map and ordered sub-slices.
3. docs/EDITOR_REBUILD_PLAN.md - detailed source, canvas, transform, timeline and runtime contracts.
4. docs/STARTER_COLLECTIONS_PLAN.md - gallery, Home brands and production installation.
5. docs/research/editor-acceptance-register-2026-09-17.md - E/B evidence and unresolved checks.

Inspect the designs as well:
- docs/research/editor-canvas-review-2026-09-18/README.md and editor-review-canvas-preview.html
  in that directory - latest Add Out prompt placement, drawing tools, scale handles and timeline.
- docs/research/editor-consolidated-proposal-2026-09-17/README.md - complete workspace/gallery.
- docs/research/editor-transform-proposal-2026-09-18/README.md - all five transform groups.
- docs/research/editor-timeline-first-2026-09-18.md - authoritative correction to older cue forms.
- docs/research/editor-adobe-svg-contract-2026-09-18.md - reference interaction and code audit.
Read each mockup's limitations. Earlier forms/global modes do not supersede the current plan.
A mockup passing checks is not evidence that the replacement product has been built.

Then inspect actual current source where claims depend on it, using:
- docs/research/editor-baseline-2026-09-17.md
- docs/research/editor-design-review-2026-09-17/baseline-supplement.md
- docs/research/editor-design-review-2026-09-17/source-preview-contract.md
- docs/research/editor-consolidation-2026-09-17/README.md and its archived reference documents
- docs/research/editor-design-review-2026-09-17/studio-reuse-candidates.json
Use the code as evidence; archived plans are historical. Studio reference SHA is
3142fc7d02934494931eb14e7dc255393e4110d0. If consulting newer source, distinguish it explicitly.
Use primary sources for new external factual claims and identify any inaccessible evidence.

## Review questions

1. Whole product and scope
Does the plan lead to a useful complete editor rather than another narrow demo? Trace every
E01-E24 and B01-B18 requirement through R1-R3. Check permanent visible canvas, layers/selection,
typography and assets, animation, SVG, templates/brands, AI/CLI/MCP, live data, Lottie/effects,
save/reopen and all output targets. R1 is not full Studio parity. Node authoring is excluded,
but existing behavior/source/tests and node lessons must survive. Monaco is optional beside
the canvas. Identify contradictions, orphan requirements and stale authoritative statements.

2. Step-by-step execution
Can another session execute each slice with clear prerequisites, bounded outcome, affected
code seams, non-goals, reproducible fixture, acceptance checks and continuation record?
Identify slices that are too large, incorrectly ordered or defer essential proof too late.
Especially challenge R1.1a/b/c: the first text-and-box In/hold/Out must work end to end, but
transform/source correctness used there cannot wait for R1.1c. Propose concrete splits for
later broad phases as needed. Distinguish start blockers from decisions needed only before
a later slice. Do not require every later implementation detail before the first sound slice.

3. Familiar canvas and timeline
Check Select/Text/Rectangle/Ellipse/Image tools, drawing, canvas scaling versus box geometry,
Anchor X/Y, Position X/Y, linked Scale X/Y, turns/degrees Rotation and percentage Opacity.
Check per-property stopwatch/diamond, first key, automatic subsequent keys on an armed
property, numeric scrubbing and canvas drags, predictable undo/cancel and parent coordinates.
Layer bars must show existence, move with keys and trim without silently retiming animation.
Evaluate selection, zoom, snapping, multi-key editing, folders/bins and actual editable precomps.

4. Simple broadcast sequencing
At the playhead, Add Step/Add Out places a flag. Play stops at a flag and waits indefinitely;
Next plays the next segment; Out performs the exit. No duration forms in the basic flow.
Add Out offers reverse entrance beside the invoking button, or manual Out without invented keys.
Test the design mentally with simple In/Out, additive text reveal, multiple visible entrances,
static layers, custom exits, Out during entry/loop, repeated commands and restart. Challenge
cue-side sampling, frame boundaries, cross-cue bars/keys, reversed easing, current-pose continuity,
loop clock isolation and precomp cue ownership. Explain any case that could flash, jump,
disappear early or create an ambiguous edit. Timeline and production output must agree.

5. Keep/rewrite and source architecture
Is the proposed reuse/rewrite boundary defensible against actual code? SpxTemplate/NOACG_ANIM
remains canonical readable source; visual controls and AI share deterministic revision-checked
operations, not a second persistent scene truth. Check derived identities, unknown code
preservation, preview protocol, stale acknowledgements, undo, migrations and rollback.
Challenge architecture that would make familiar editing unnecessarily fragile or restrictive.
Recommend exact changes with evidence, not a blanket rewrite or an assumption all legacy code is good.

6. Existing SVG wizard and fields
The wizard remains an all-inclusive direct-to-production route. Optional Open in editor must
use its finished output without repeating setup, losing quiz/timer/layout behavior, regenerating
over edits or rasterizing SVG. Check nested Illustrator transforms, groups, clips/gradients,
fonts/assets and outlined versus live text. New text should be editable in playout by default,
while preserving intentional exclusions, driven fields and stable manifest/schema keys.
Required nominated fixtures cannot be rejected just because an adapter has not been built.

7. Templates, brands and production
Verify visible gallery, coordinated starter graphics, individual templates, existing Home
brand looks, logo/font/colour application, local overrides and selected-set rundown installation.
Check retry/recovery, duplicate prevention, later edits, asset bundling and deliberate on-air
revision changes. Users should be able to personalize and run a package without animating it.

8. AI, live data and portability
Check basic grounded helper, budgeted free service, BYOK, existing external CLI and later paired
MCP all fit shared operations with undo/conflicts and real-model quality evaluation. Subscription
agent login is a separate feasibility issue, not assumed access. Check structured GDD objects,
arrays/collections, binding/animation ownership, updates and replay. OGraf, SPX, CasparCG and
NoaCG production need named-host evidence; flag the unknown receiving-broadcaster environment and free-AI budget
at the correct gates. No silent scope removal because something is complex.

9. Studio/reference reuse
Independently challenge the current decision to write our own helpers informed by Studio.
What can be reused directly, adapted, used only as a behavioral reference, or retained from
NoaCG? Give exact repositories/files/commits and license/notice/dependency obligations for
concrete reuse proposals. Distinguish legal eligibility from architectural suitability.
Do not assume "open source" means no conditions, or invent a percentage we can safely copy.
If definitive legal review is needed, name the precise unresolved issue. No importing code now.

10. Evidence and owner participation
Do baseline evidence and fixtures test why the previous editor failed? Are performance targets,
1366/1920 layouts, 125% zoom, source/pixel parity, persistence, real output and first-time-user
tasks sufficient? Each phase should provide an exact runnable route, short walkthrough with
expected results, branch/commit, screenshots/recording, automated results and known limits.
Owner feedback and engineering verification remain separate statuses. The owner reviews when
available; ordinary defects must be caught independently. Scope/default-switch approval is
explicit. Explain how handoffs and the live ledger prevent drift across sessions.

## Required response

- Give a clear verdict: ready to start R1.1 after owner authorization, ready with named
  corrections, or not ready. Give separate judgments for destination, architecture and sequencing.
- List prioritized findings with file/line references, concrete failure examples, impact,
  proposed correction and the acceptance test that would close each finding.
- Separate blockers before first implementation from later-slice gates and optional preferences.
- Provide a corrected ordered slice table where needed: dependencies, outcome, demo/test,
  owner review route and stop condition. Preserve the complete R1-R3 destination.
- Provide a short keep/rewrite/reference/direct-reuse matrix and its licensing caveats.
- Identify missing evidence honestly; do not treat unmeasured work as passed.
- Finish with a concise hand-back prompt the owner can paste into the planning session.
  Do not execute that prompt or start implementation.
