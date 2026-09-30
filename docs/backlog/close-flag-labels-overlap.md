# Close flag labels overlap on the new editor's ruler

**Filed:** 2026-09-30. **Source:** measurement, while verifying cross-cue moves (R1.2a.5).

## Why

The ruler is where an author reads which cue is which. Since R1.2a.5, Set Out inside a Step is
allowed, so a Step cue a frame or two long is an ordinary result of one click, and its flag label
then draws over the Out flag's label ("StepOut · hold"). Flags a frame apart were already allowed
since R1.2a.4, so this was possible before and is now common.

## What it would take

Give the flag labels in `src/components/editorFoundation/StepFlag.tsx` a room rule: a label that
does not fit before the next flag shortens (clipped with an ellipsis to that room, say) while its
full name stays in the accessible name and a tooltip, and flags stay draggable and focusable as
now. Check at 1920 and 1366 wide, then run `e2e/editor-steps.spec.ts`,
`e2e/editor-out-step.spec.ts` and `e2e/editor-cross-cue.spec.ts`. Small and contained.

## Evidence

Clean Steps from the template search, playhead at 2.6 s (inside the last Step's reveal), Set Out
at playhead: Step 5 becomes 0.05 s long and the two labels overlap. Seen in the real-UI route of
the [R1.2a.5 receipt](../research/editor-r1-2a-5/README.md) (job j-2701, frame
`4-out-inside-last-step`).
