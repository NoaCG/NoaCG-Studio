# root/read-which-jobs-ran-before-believing

Rule: `root/read-which-jobs-ran-before-believing`. Recorded 2026-09-07 on `claude/root-contract-migration` at 39835021.

An ordinary push plans from the PREVIOUS PUSH and a new push cancels the run in flight, so a small second push can skip every shard while the run that covered the real change never finished. `gh workflow run ci.yml --ref <branch>` asks for the full suite.
