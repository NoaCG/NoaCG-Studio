# Transform interaction study, 2026-09-18

Supporting design evidence under [EDITOR_PLAN.md](../../EDITOR_PLAN.md) and the
[Adobe/SVG comparison](../editor-adobe-svg-contract-2026-09-18.md). No application changes.
Open `editor-transform-study-preview.html` locally; its sibling fragment is the editable study.

This focused detail supplements the [whole-workspace proposal](../editor-consolidated-proposal-2026-09-17/README.md).
The gallery, brands, collection-to-rundown, AI, loops and optional code remain in the master
plan. Their absence from this focused study does not remove them from the editor.

## Demonstrated interactions

All five transform groups, numeric entry and horizontal value scrubbing, linked/unlinked
scale, revolutions/degrees, compensated centering/dragging of the anchor, stopwatch and
diamond controls, previous/next key navigation, sampled linear keys and one-gesture undo.
The canvas stays visible. + Step exposes name, insertion cue and duration; Edit Out exposes
the existing exit; Wizard Finish shows direct production and optional Open in editor.

## Limits

Illustrative SVG only, not actual wizard output. No product source patch, import, export,
save or production installation runs. Interpolation is linear; graph/easing tools, grouped
versus separate Position conversion, transform hotkeys, redo and drag-retiming keys are not
implemented in this study. The production contract specifies them where applicable.
The flat sample clock is not the production step-local interpreter. Next reveals the sample
reporter at a fixed boundary. Additional step markers demonstrate insertion, not arbitrary
compiled reveal behavior. The optional Reveal selected layer choice only records intent.
Out is a sample fade; auto-Out settings are displayed but no live timer is simulated.
Panel width changes the example rectangle; this does not validate real text fitting/followers.
Anchor compensation is demonstrated at the parked pose, not an entire animated trajectory.
No B task passes because a mockup interaction works. Full wizard/quiz/timer regression and
OGraf/YLE receiving-host acceptance remain assigned implementation evidence.

## Verification

Queued browser job j-1342 exited 0: 37 checks passed, with no runtime errors.
Queued repository build j-1339 exited 0: 121 test files, 1798 passed / 1 skipped, then
TypeScript, lint, dependency checks, bundle, prerender and post-build checks completed. Screenshots cover desktop,
laptop, narrow fallback, light/dark, Add step and Finish. Desktop is the authoring target;
320 px stacking is a presentation fallback, not a mobile editor acceptance claim.

Earlier j-1338 exposed a harness mistake (the Size/Layout disclosure was not opened).
j-1340 exposed blocked native form submission inside the sandbox; local action handling
fixed it. j-1341 passed before the final checkbox-width correction; j-1342 includes that
correction and checks field opt-out/undo. Final desktop, laptop, light and detail screenshots
were inspected. The master plan and product source are unaffected by those prototype fixes.

`verification-summary.json` records final fragment/preview hashes, scope and document-link
checks. The build checked the updated planning contracts; final evidence/receipt files were
added afterward. No product implementation, commit, merge or queue-merge declaration occurred.

Later owner correction on 2026-09-18: cue creation forms and categorical no-cross-cue rules
are superseded by [timeline-first editing](../editor-timeline-first-2026-09-18.md).
Use that contract and study for Add Step/Add Out, duration bars and reverse entrances.
