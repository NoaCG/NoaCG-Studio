# editor-keys canvas drags fail under memory pressure

**Filed:** 2026-09-30. **Source:** measurement, while verifying step authoring (R1.2a.4).

## Why

A session verifying an editor change can spend an hour deciding whether a red editor-keys test is
its own regression. On 2026-09-30 three loaded runs each failed one canvas drag in
`e2e/editor-keys.spec.ts` while the machine had under 4 GB free, and the failures pointed at no
code the branch had changed.

## What it would take

Find the race the failures share. Both are canvas drags right after a seek and `ready()`: "armed
scale handles key both axes..." ended with the stage error "Wait for the preview to reach this
playhead and revision before editing" (`requireCurrentPose` refusing at gesture begin), and
"mixed multi-selection keys only armed channels..." timed out with `data-pending` never returning
to `false` after the drag. A plausible cause is `ready()` passing on `data-pending` before the
parts the gesture reads have caught up, so a test could wait on the pose (`data-pose-time`,
revision) the way `e2e/editor-steps.spec.ts`'s `ready()` does.

## Evidence

- Failures: jobs j-2605 and j-2620 (scale handle), j-2626 (mixed selection), all on
  `claude/editor-r1-2a-4-steps`.
- The file run 15 times at 4 workers with memory free passed 210 of 210 on both the fork point
  `26488f9d0` and that branch's tip (j-2627, j-2628); 70 of 70 and 69 of 70 at 5 repeats with
  under 4 GB free (j-2625, j-2626).
