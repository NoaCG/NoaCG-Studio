# root/run-only-targeted-checks-machine-leave

Rule: `root/run-only-targeted-checks-machine-leave`. Recorded 2026-10-09 on `claude/b-test-on-github` at bbc2c19e5.

2026-10-08 night wave: a row's local whole-suite run took free memory to 0.6 GB (node 4.0 GB plus headless browsers 3.8 GB) and Docker Desktop could not start for another row (ERROR_NO_SYSTEM_RESOURCES). Owner ruling 2026-10-09 on #805: full browser and E2E suites run on GitHub Actions, not on the laptop; fast targeted local tests stay available; keeping the laptop responsive comes first, especially while several agents run, so let GitHub Actions do as much of the work as possible. CI already runs the full build and the affected e2e on every pull request and again on the merge group (from the fork point), so local runs only catch mistakes early.

Why a rule rather than a fix, a mechanism or a check: The job queue and the affected planner now refuse a whole-suite run, which carries the browser half mechanically. The rest (targeted checks, no local full build, CI as the pre-merge gate) is practice no script can observe, and every session verifies, so it replaces the always-loaded verify rule instead of adding a second one.
