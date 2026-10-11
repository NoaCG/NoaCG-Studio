# root/verify-against-spec-acceptance-criteria-proportion

Rule: `root/verify-against-spec-acceptance-criteria-proportion`. Recorded 2026-10-09 on `claude/f-lifecycle-rules` at 30e7a3696.

Owner ruling 2026-10-09 (docs/work-specs/agent-lifecycle/spec.md, points 7 to 9, AC-5): decisions are asked in the session at once, never filed as needs-owner issues, because agents filed far too many and the owner's queue filled with notes to read later. An attended session asks one question with a recommendation; unattended work (a wave row or a plan run) decides and records it in its pull request; only a reserved decision stops that item while the coordinator asks him in its own session with a phone notification. The targeted-checks text of root/run-only-targeted-checks-machine-leave (#852) is kept unchanged in meaning; existing needs-owner issues stay for /walk, and production migration refusals keep their own route.

Why a rule rather than a fix, a mechanism or a check: No script can observe whether a session asks a decision or files it for later, and every session verifies, so the always-loaded verify rule is replaced rather than a second rule added; the procedure itself lives in .agent-workflows/verify.md step 5.
