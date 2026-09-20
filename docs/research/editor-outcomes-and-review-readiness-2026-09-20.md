# Editor outcomes and review readiness

Updated 2026-09-20. This is the user-outcome companion to [EDITOR_PLAN.md](../EDITOR_PLAN.md),
not a second release sequence. Engineering slices stay small; owner review is organized around
usable tasks. The implementation session owns the specific R1.1a fixes already reported to it.

## Why this correction exists

The owner reports that R1.1a adds text/rectangle/ellipse buttons but cannot change text or
colours. That report is product feedback, not an independently reproduced bug in this planning
task. The written plan contributed: it assigned creation to R1.1a and content/typography/colour
largely to R1.2b. A slice could meet that narrow checklist without delivering usable authoring.
Keep verified component evidence, but do not treat it as acceptance of the static graphic task.

A user should make a useful graphic without source editing or assistance from the developer.
Agents own discovering and implementing ordinary interaction details needed to complete that
task, inspecting the rendered result and catching routine defects. Ask the owner about genuine
workflow or creative choices; do not make them enumerate every expected inspector control.

## What ready means

Report three separate facts, with a named capability rather than an unqualified "done":
- **Engineering verified:** bounded implementation and its automated/integration checks passed.
  State what it enables and what still prevents a useful task. This can merge behind the Alpha
  route without becoming a request for owner testing.
- **Ready for workflow review:** the team has completed the whole declared user task in the
  actual UI, including correction/undo, persistence and its destination, without code or hidden
  setup. Provide the tested route/commit and evidence. Essential missing controls block this
  claim even when they were absent from the original implementation checklist.
- **Owner accepted:** the owner has actually reviewed that task and given feedback/acceptance.
  Record separately from engineering evidence. A demonstration-ready graphic is not proof that
  every template, export host or the full editor is ready.

Earlier visual/prototype feedback is welcome when requested or volunteered. Do not automatically
ask the owner to inspect every internal slice or use owner acceptance as a gate on unrelated
engineering progress. Product-visible work still gets its required owner-queue record; label
partial records "engineering progress - workflow not ready" and link the remaining outcome.

## Delivery and asynchronous owner feedback

Owner direction, 2026-09-20: finished, verified engineering slices go promptly through the
repository merge queue to main and the normal live deployment. Do not park them locally or
wait for owner review, a full workflow milestone or the next planning session. Push and queue
from the owning implementation session after its required checks/review; CI gates the landing.
Confirm the deployed revision and give a live URL with a short statement of what is available.
Retain the public Alpha entry and phone access so the owner can inspect progress while away.

Workflow-review readiness controls when to request the owner's time, not when to merge.
Owner feedback is asynchronous; a fresh session can continue from updated main and the durable
handoff without waiting for a response. Record known limits and the next concrete task.
Keep incomplete editor work on its intended Alpha route until the planned default-switch gate;
that does not stop it reaching the live site. Correct regressions promptly or use the normal
revert path. Required verification and truthful readiness claims still apply.

## Usable outcomes and what to check

These are cumulative review checkpoints, not new phase numbers or extra product scope.
Existing E/B acceptance IDs remain the detailed evidence owners.

| Checkpoint | Useful result and reason | Team proves before inviting review | Owner focus | Coverage |
|---|---|---|---|---|
| Static graphic, R1.1a completion follow-up | Make a simple title card/lower third; authoring must change content and appearance, not only insert placeholders. | Create text and a rectangle/ellipse; edit wording, text colour, font family from available fonts and size, shape fill and basic opacity; position/size objects; correct a mistake with undo/redo; save/reopen through the existing save path with the same appearance and operator field. Exercise supported imported/catalog targets as well as new layers; clearly identify unsupported source. | Does making a simple graphic feel clear and usable? | B01/B03/B04 core; basic E05 content/type/colour now belongs here. |
| Animate that graphic, R1.1b/c | Author an entrance and exit, hold until triggered, and rehearse locally; this is the first small broadcast-animation workflow. | Start from the saved customized graphic; enable position/opacity animation, create two keys by moving playhead and artwork, scrub, move layer bars, Set Out/reverse or manual exit, hold/Out including mid-In interruption; save/reopen and compare simulator/export. | Can timing be understood and adjusted naturally on the timeline? | B05/B13 core and B07 early Out; broader easing/Next still follows in R1.2a. |
| Refine real imported artwork, R1.1d | Illustrator/wizard designs survive useful edits, so users do not need to redraw them. | Repeat basic edits/animation on nested SVG and catalog fixtures; preserve fields, quiz/timer/custom actions and unknown source; trim bars; stable IDs and round-trip; planned first-time-user checks. | Is the existing import workflow intact and the supported editing useful? | B01-B05/B11/B13 applicable portions. |
| Everyday animation and organization, R1.2a-c | Build and revise richer graphics without layer/keyframe chaos. | Full 2D/easing/multi-key/Step/Next tasks, assets, long-title fit, duplicate/delete/reorder/alignment, groups and local loops; separately report each complete task rather than waiting for one giant review. | Familiar controls, clarity and speed on realistic graphics. | B02-B07/B13/B14 local-loop portion; advanced B04 tools remain here. |
| Reusable graphics into production, R1.4a-d | A student chooses a starter, customizes it and runs it from a rundown. | Choose a real starter/brand, change content/logo/type/colours, save multiple graphics, reopen from Home, add selected graphics to a rundown, update operator text and run In/Out in NoaCG; retry failures without duplication. | Can a student finish this route without developer help? | B08-B10/B19; may proceed in parallel from R1.1c registry. |
| Assisted editing, R1.3a/b | Help and bounded edits reduce effort without changing the wrong graphic. | Grounded answer, requested edit, preview, accept/cancel/undo and stale selection handling, with real-model tests and a working manual path. | Are assistance and edits useful and trustworthy? | B17/B18; does not gate basic manual authoring. |
| Replacement editor, R1.5 | Adopt a reliable editor for the required R1 tasks. | Required cumulative journeys, comparative quality/performance, relevant real output host and first-time-user evidence, no unresolved critical task blockers. | Explicit default-switch acceptance. | Required R1 portions, not full R2/R3 parity. |

## Scope and verification consequences

Basic text content, available font family/size, text colour, shape fill and basic opacity move
forward from the broad R1.2b bucket to the static-authoring completion checkpoint. Rich typography,
fit algorithms, assets/Pen, grouping and the rest of R1.2b stay there. Do not fold the entire future
toolset into this correction. Animation slices must exercise the usable static graphic, not a
fixture users cannot create or customize themselves. Additional ordinary controls necessary to
finish the declared task belong to that task; unsupported documents must fail honestly.

The implementing session reproduces the reported gaps on its actual branch/deployment before
fixing them, uses the shared operations/source/history path, and supplies a fresh closing receipt.
This document records a changed completion criterion, not a claim that those fixes are built.
Keep existing measured passes; B04 core and the usable static-authoring outcome remain open
until that receipt exists.

Each review handoff says, in this order:
1. What the user can now accomplish, in one sentence.
2. Engineering status, workflow-review status and owner-acceptance status separately.
3. One route/fixture and a short walkthrough with visible expected results.
4. Team evidence for that task, exact commit/deployment, and material remaining limits.
5. The next useful outcome. Request owner time only when there is something usable to assess.

For the September 25 teaching session, choose an actually rehearsed student workflow and a
separately labelled editor demonstration from these outcomes. Do not promise the full rebuild by
that date. The team rehearses the selected route on the intended deployment and records blockers
before asking the owner to use it with students; a known working wizard/production route can
remain the teaching path while editor authoring progresses.
