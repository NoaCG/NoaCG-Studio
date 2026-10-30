# orchestrator/write-trap-every-plan-run-worker

Rule: `orchestrator/write-trap-every-plan-run-worker`. Recorded 2026-10-29 on `claude/plan-create-skill` at 571803605.

Production-page plan run retro (issue 1553, comment 6496870487, item 11): the known-flakes list, the Playwright symlink trap, the GraphQL-refused note and the pending-slot rule were pasted into every one of about fifty briefs and drifted between them. The traps now live in docs/plan-runs/known-traps.md, which the base templates in docs/plan-runs/templates link; scripts/plan-kit.mjs renders briefs from them.

Why a rule rather than a fix, a mechanism or a check: Whether a sentence in a brief is a shared trap or phase-specific text is a judgement no check can make; the templates link the file, and this keeps the next edit from pasting traps back.
