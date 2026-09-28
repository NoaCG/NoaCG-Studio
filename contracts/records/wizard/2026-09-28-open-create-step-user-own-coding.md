# wizard/open-create-step-user-own-coding

Rule: `wizard/open-create-step-user-own-coding`. Recorded 2026-09-28 on `claude/b-simpler-create-with-ai` at 8d753149.

Owner judged the Create with AI step to carry too much information: the agent card, a Built-in section with a testing note, the format picker, viewing controls, drop zone and composer all showed at once. On branch claude/b-simpler-create-with-ai the step now shows the agent card and a 'No, I want to try the NoaCG agent' button with the warning 'The NoaCG agent's results are not yet proven to be consistently good.'; the generator mounts behind it. A design-consult (Fable) recommended stacking the warning under the button in body text, dropping the Recommended tag, keeping the card open after the choice, and honouring a drop made before the choice so the no-AI template import is not hidden behind an AI button. e2e/ai.spec.ts and e2e/ai-tiers.spec.ts pin it.

Why a rule rather than a fix, a mechanism or a check: Which route leads and what competes with it on arrival is a product decision no check can derive; the specs pin the arrival state, and the rule stops a later session from surfacing the generator's controls beside the card again.
