# templates/let-optional-wall-clock-start-time

Rule: `templates/let-optional-wall-clock-start-time`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 296-299.   An optional THIRD field id opts a design into a wall-clock START TIME ("19:30"): filled in it   wins over the duration, empty it is ignored. That is the difference between "count five minutes   from whenever the operator hit play" and "count to when the show actually starts" - only the   second survives a re-take.
