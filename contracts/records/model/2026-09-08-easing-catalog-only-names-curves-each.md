# model/easing-catalog-only-names-curves-each

Rule: `model/easing-catalog-only-names-curves-each`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md`. The blocks rule `blocks/easing-offer-rule-over-motion-own` is the consumer: `motionPresets.ts` filters this catalog on `needs === 'time'` unless the motion animates an unclamped transform channel, which is how an overshooting easing is kept off a motion that cannot express it.
