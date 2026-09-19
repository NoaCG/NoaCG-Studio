# e2e/push-branch-pre-check-before-queueing

Rule: `e2e/push-branch-pre-check-before-queueing`. Recorded 2026-09-19 on `claude/game-show-kit-sets` at e8131029.

2026-09-19, PR #332: pinning 'Archivo-Bold' artwork to weight 700 turned e2e/import-svg.spec.ts 'growth is symmetrical' red on CI at a 63px gap against a 50px inset while it passed on Windows at 50.5px. The size search accepted the first size that fitted; fitSvgText now walks a one-line block back up to its budget. Fault-injected with a 3% undershoot: green with the walk, red at 96px without it.
