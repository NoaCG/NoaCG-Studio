# templates/declare-variant-build-capabilities-through-logo

Rule: `templates/declare-variant-build-capabilities-through-logo`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 116-127. - **contract.ts** - categories, variants, WizardOptions, palettes. A variant declares its   CAPABILITIES - `maxLines` (1-5 line capacity), `logo: 'none' | 'optional' | 'built-in'`,   `animationPresets`, `defaultSteps` - which drive the wizard's Fields/Animation options AND the   Template step's filter chips, so a new family inherits both automatically. `defaultSteps` is   what a graphic that is STEPPED BY CONSTRUCTION declares (a numbered process, a checklist): it   decides what an untouched `create({})` produces, so the wizard draft's steps flag is tri-state   (null = the design decides) rather than a boolean that would override it. Sizing is two knobs:   `sizeScale` (--scale, whole graphic) and `typeScale` (--type-scale, text only).   DISCOVERY metadata does NOT live on the variant: browse facets and search come from the one   taxonomy (model/taxonomy.ts + templateMeta.ts + search.ts). A variant carries only what it   needs to BUILD itself; a second discovery model on the variant would drift from the first the   moment either changed.
