# e2e/assert-what-imported-line-fit-spent

Rule: `e2e/assert-what-imported-line-fit-spent`. Recorded 2026-09-19 on `claude/game-show-kit-sets` at f6833d2b.

2026-09-19, PR #332: once 'Archivo-Bold' artwork rendered in Bold, 'growth is symmetrical' went red on CI at a 63px painted gap against a 50px inset and passed on Windows at 50.5px. The message added to the expect showed the fit had chosen 33.3px on Linux against 33.44px on Windows, so it had landed on its 1520 budget by computed length while the painted line was 1507 wide. A size-search change made on the first guess fixed nothing and was removed. The rewritten bounds fail at 45.9 unspent under an injected 3% undershoot.
