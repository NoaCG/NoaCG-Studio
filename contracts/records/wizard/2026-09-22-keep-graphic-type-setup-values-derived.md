# wizard/keep-graphic-type-setup-values-derived

Rule: `wizard/keep-graphic-type-setup-values-derived`. Recorded 2026-09-22 on `claude/u-quiz-live-consistency` at 6f5855d94.

The quiz Reveal now carries the answer key as payload so a key corrected on air lights without an Update (measured 2026-09-22: every catalog quiz and the imported docs quiz revealed the OLD key). Under the old rule that payload would have removed Correct answer from the wizard setup, which e2e/quiz-show.spec.ts and e2e/wizard-setup-fields.spec.ts pin. The nominee reveal's winner rides its path event the same way and now joins setup too.
