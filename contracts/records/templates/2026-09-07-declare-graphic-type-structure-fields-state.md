# templates/declare-graphic-type-structure-fields-state

Rule: `templates/declare-graphic-type-structure-fields-state`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 327-334. A **type** declares what a graphic IS - structure contract, fields, state groups and default path, control events - independent of what it looks like; a **design** is one look. A type is a DECLARATION, not a second way to build a template: `variantsFromType` compiles one into ordinary TemplateVariants that go through the category assemblers, and **the rule is *persist a machine only when the derived one is wrong***. The full contract - the field-list limit, the field plan, `WizardOptions.content`, the timer trap and the neutral scaffold - moved to **`src/templates/types/AGENTS.md`** (with its thin `CLAUDE.md`), which loads when you work in that directory.
