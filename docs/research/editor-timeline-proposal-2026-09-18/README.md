# Timeline-first interaction study

2026-09-18. Planning only under [EDITOR_PLAN.md](../../EDITOR_PLAN.md).
This supersedes the preceding study's cue creation forms. Full transforms, SVG wizard,
templates, brands, AI, loops and other accepted scope remain in the master plan.

Open `editor-timeline-first-preview.html`. The study starts with two layers and linear
entrance keys, playhead at frame 25. Add Out and choose reverse, then Play In holds at Out.
Out exits. Reset, Add Step, add text, animate it, move to frame 50 and Add Out to explore
Next. Drag a layer bar body or edge; expand property rows to move keys. Canvas dragging
creates a Position X key when animation is enabled. The grey pasteboard remains visible.

## Scope and limitations

All behavior is local illustrative JavaScript, not application source/exports. No production
or filesystem mutations occur. Fixed four-second ruler, linear X/opacity tracks and two
default layers demonstrate the core mechanics. The full five transform groups remain in
the previous transform study and production plan. Canvas vertical movement here edits a
base Y value only; production grouped/separated Position must key affected channels.
Groups/precompositions are planned, not simulated here. Bar/flag/key gestures are pointer
demonstrations; complete keyboard equivalents, zoom, timeline growth and accessibility are
implementation requirements. Flag moves in this linear flat study do not prove correct
source step-local repartition or curve splitting. No automatic timing forms are present.
Reverse covers the sample linear entrance tracks, including a later animated layer; it
does not validate custom easing, changed-endpoint rebasing, nesting or legacy wizard logic.
Out rehearsal here starts at its authored boundary; interrupting mid-In without jumping is
a production acceptance requirement, not a demonstrated capability of this study.
No product B task passes because a mockup passes browser checks.

## Verification

Final queued Chromium job j-1345 passed 34 checks with no runtime errors. It includes
flag placement/dragging, reverse/manual keys, indefinite hold, Next/reveal ordering, later
and static layer exit coverage, layer move/trim, canvas-key creation and undo. No horizontal
overflow at 1920/1366/1024/320; canvas remains above the timeline. Desktop and hold-state
screenshots inspected. Earlier j-1343 passed before the static-layer exit refinement.

Queued build j-1344 exited 0: 121 test files, 1798 passed and 1 skipped, followed by
TypeScript, lint, dependency, bundle, prerender and after-build checks. Build log retained.
Final documentation clarifications and evidence files were recorded during/after the build;
no application files changed. `verification-summary.json` records file hashes and scope.
