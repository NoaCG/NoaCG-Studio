# templates/keep-state-wording-editable-data-fields

Rule: `templates/keep-state-wording-editable-data-fields`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 547-553. - **A state's WORD is a field; the state is not.** An operator event carries state, not copy -   the machine says the graphic is live, the broadcaster says what "live" is called. The pattern   is hidden word sources the runtime reads (`cornerBug/statusParts.ts`, the esports phase chip,   the alert severity flag), so nothing about the wording lives in the machine. - **A word source the operator can edit must repaint on `update()`**, not only when its state   is next entered. An operator who retypes a word, sees nothing happen, and concludes the field   is dead is the failure this costs one line to avoid (`paintPhase()` in the esports runtime).
