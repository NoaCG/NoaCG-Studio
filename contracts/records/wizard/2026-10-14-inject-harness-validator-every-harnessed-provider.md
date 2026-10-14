# wizard/inject-harness-validator-every-harnessed-provider

Rule: `wizard/inject-harness-validator-every-harnessed-provider`. Recorded 2026-10-14 on `claude/plan-wizard-ai-p5-build` at 15b26a6c9.

wizard-ai A5 rule pass (docs/work-specs/wizard-ai/spec.md D3). The raw route passes onProgress only to generateRaw, which validates itself, and its result is screened by screenChange in src/ai/creation.ts (validateTemplate merged through mergeSafety), as ai/wrap-injected-validator-findings-reach-repair already says. The convert, Lite, three-direction and refine routes forward the step's validator. Behaviour unchanged; only the wording now matches it.

Why a rule rather than a fix, a mechanism or a check: A rewording, not a new demand: the superseded text said every provider call, but the raw route (harness off) has never run the injected validator; it validates itself and is screened where its result is shown. The Node guard scripts/ai-creation.test.mjs pins the forwarding per route; this rule keeps the step's other three duties, which no check covers.
