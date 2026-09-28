# wizard/pay-any-growth-entry-step-out

Rule: `wizard/pay-any-growth-entry-step-out`. Recorded 2026-09-28 on `claude/p3-wizard-entry-followups` at f2fef4928.

The trap it replaces still said the cards share one column after PR 488 put the four start cards in one row and added the Playout row under them; the landing review on 488 flagged it. The height budget itself is unchanged and e2e/wizard-entry-fit.spec.ts still measures it at 1366x768.

Why a rule rather than a fix, a mechanism or a check: Rewords an existing trap to the current layout; the spec measures the budget, the trap says why it binds to whoever edits the step.
