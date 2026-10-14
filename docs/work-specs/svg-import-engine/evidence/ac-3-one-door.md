# AC-3: one door from the wizard

**Verdict: pass.**

- **Built in phase 2** (https://github.com/NoaCG/NoaCG-Studio/pull/1125, merge `cb3d9557f`).
  `svgDraftFromImport` and `svgDraftCleared` in `import/draft.ts` replaced the inline assembly in
  `CreationWizard.tsx`, and `driven-clock.mjs`'s `__importDraft` calls the bundled function.
- **Phase 2 check, PASS** (carried in the phase 3 notes).
  - It replayed the old `onSvg` and `onClearSvg` against main over 48 files, 5 frames,
    6 previous drafts and 3 brands: 4,320 drops and 8,640 clears, 0 differences.
  - The §5 command then printed the six names as code references.
- **On current main the seam is narrower still.** Commit `af03e34c6` (wizard-structure plan,
  phase S2) moved the shell's drop handlers into `import/drop.ts`. `CreationWizard.tsx` now
  reaches `svgDropPatch` and `clearSvgPatch` through `import/index.ts`, and those call
  `svgDraftFromImport` and `svgDraftCleared`.
- **The §5 command, run on `20bda8867` for this review**, prints `SvgImportDraft`,
  `svgDesignOptions`, `withSvgImportPasses` and `behaviourSummary` as code references. It also
  prints `armTimerClock` and `DesignFieldSpec`, which appear only in comments. The two drop
  functions no longer appear outside `import/`, because the door moved inside it.
- `CreationWizard.tsx` holds no import-draft assembly: no `importSvgMarkup`,
  `proposeSvgBehaviour` or `armTimerClock`.
- **ARCHITECTURE §5 still carries the command.** Its prose ("five functions and one type")
  predates `af03e34c6`. The wizard-structure plan owns its rewrite (that spec, phase S7 and
  AC-11), so this close leaves it alone.
