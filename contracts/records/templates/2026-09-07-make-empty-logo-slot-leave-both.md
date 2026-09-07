# templates/make-empty-logo-slot-leave-both

Rule: `templates/make-empty-logo-slot-leave-both`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 604-606.   - An EMPTY slot changes nothing in either arrangement: the hidden `<img>` stops being a grid     item and takes its margin - which is where the clear space lives, deliberately, rather than     in a track gap - with it. Pinned by `e2e/wizard-logo.spec.ts`.
