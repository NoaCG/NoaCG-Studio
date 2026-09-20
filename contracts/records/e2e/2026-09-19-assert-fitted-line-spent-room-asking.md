# e2e/assert-fitted-line-spent-room-asking

Rule: `e2e/assert-fitted-line-spent-room-asking`. Recorded 2026-09-19 on `claude/game-show-kit-sets` at 4012fde7.

2026-09-19 to 2026-09-20, PR #332: once 'Archivo-Bold' artwork rendered in Bold, 'growth is symmetrical' went red on CI at a 63px gap against a 50px inset and passed on Windows at 50.5px. Two explanations were acted on and both were wrong: a size search that undershot (a walk was added and removed), then painted width differing from computed length. The numbers in the expect message settled it: 2465 wide at 54px and 1507 at 33.3px is exactly 2465 x 33/54, and 34px gives 1552 against a 1520 room, so 33.3px was already the largest size that fits. Three CI runs were spent because the first failure carried no measurements.
