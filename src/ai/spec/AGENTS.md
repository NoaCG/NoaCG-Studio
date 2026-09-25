# src/ai/spec - the structured setup behind "More control"

## The structured setup (`spec/` - the "More control" panel)

**LIVE.** The panel authors a `GenerationSpec` (schema in `src/model/generationSpec.ts` - MODEL layer,
because SavedProject/GraphicDoc persist it as `aiSpec`) that rides `GenerateContext.spec` as TYPED data,
never flattened into prose early. An empty spec injects nothing - the prompt-only flow is byte-identical.

- `spec/categories.ts` - the 20-entry AI CATEGORY registry: each entry links an `AssemblerId` and,
  where one models it, a `GraphicType` id (fields/machine/controls come from the type), plus suggested
  fields, workflow rules, and a machine hint. **Adding a category = one entry here + its id in the model
  union**; nothing else enumerates categories.
- `spec/specPrompt.ts` - deterministic prompt sections. Appended by `contextText`, so every path -
  including raw - reads the user's own decisions.
- `spec/specDesign.ts` - the pinning: `narrowedSpecTool` collapses the design-stage tool schema to the
  pinned category; `applySpecLocks` overwrites the model-emitted DesignSpec with the user's decisions and
  re-picks a chassis that can CARRY the user's line count; `applySpecOutPreset` applies an explicit exit
  preset as a real keyframe swap.
- `spec/specValidate.ts` - requested-field-present (ERROR, driving the coder's repair loop; demoted to a
  warning on grounded assemblies, where a fixed-contract category legitimately can't carry it and no loop
  exists), uploaded-font-used (warning = the honest fallback report), and `ensureSpecFonts` (uploaded
  fonts ALWAYS land as embedded assets + a visible `@font-face`, model or no model).

