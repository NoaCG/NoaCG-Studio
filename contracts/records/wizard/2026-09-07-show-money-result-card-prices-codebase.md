# wizard/show-money-result-card-prices-codebase

Rule: `wizard/show-money-result-card-prices-codebase`. Recorded 2026-09-07 on `claude/wizard-rules` at 32e60266.

Re-picking an alternative costs nothing, so charging it to the display would invent spend.

## Recorded 2026-10-14 on `claude/plan-wizard-ai-p5-build` at 15b26a6c9.

wizard-ai A5 rule pass (docs/work-specs/wizard-ai/spec.md D4): the quarantined Pro result card in src/components/wizard/ai/ProPanel.tsx still prints the run's dollar cost after the model name (costUsd to four decimals). It never renders while the Pro door is closed (proMode is always false), and A3 moved it unchanged because AC-14 preserves the Pro code as a move. The invariant stands as worded; the line is the code's debt, not the rule's: whoever reopens the Pro door removes the dollar figure from that card in the same change. No rule change.
