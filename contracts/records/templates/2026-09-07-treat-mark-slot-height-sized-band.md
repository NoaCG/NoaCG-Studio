# templates/treat-mark-slot-height-sized-band

Rule: `templates/treat-mark-slot-height-sized-band`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 600-603.   - **A MARK IS NOT A PICTURE.** The slot is a BAND sized by height with its width free, carrying     no radius and no crop - `src/ai/assetIntegrity.ts` refuses both on a picture the user marked     "use it as it is". A slot holding CONTENT rather than a mark says so with     `TemplateVariant.imageSlot: 'picture'` (ls25's square release artwork).
