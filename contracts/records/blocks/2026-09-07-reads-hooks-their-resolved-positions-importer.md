# blocks/reads-hooks-their-resolved-positions-importer

Rule: `blocks/reads-hooks-their-resolved-positions-importer`. Recorded 2026-09-07 on `claude/migrate-agents-contract-rules-5ab9fc` at 39835021.

parsePhase walks tweens and calls in one document-ordered pass. A DOM-measured loop such as a marquee's `x:-scrollWidth`, or a nested-timeline loop written inline, fails the phase's `loopsConvertible` gate and the whole template stays legacy.
