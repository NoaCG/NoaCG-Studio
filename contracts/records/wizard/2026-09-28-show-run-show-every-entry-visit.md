# wizard/show-run-show-every-entry-visit

Rule: `wizard/show-run-show-every-entry-visit`. Recorded 2026-09-28 on `claude/j-run-the-show-card` at 02c0a9eee.

The owner found Run the show, a text row with two small buttons, broke a screen where every other door is a card you press, and asked for it to open the latest rundown. e2e/wizard-entry-fit.spec.ts pins the card, its copy, its hover and keyboard stops and the fit.

Why a rule rather than a fix, a mechanism or a check: Both behaviours are pinned by e2e/wizard-entry-fit.spec.ts; the rule records why the card is unconditional while the Home row is not, and supersedes the two-button row it replaces.
