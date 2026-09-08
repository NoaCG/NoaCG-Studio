# model/holds-small-device-level-workflow-defaults

Rule: `model/holds-small-device-level-workflow-defaults`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md` and checked against the code: `UserPrefs` carries exactly `defaultExportTarget`, `timelineCollapsed`, `renderSettings`, `commentVisibility`, `advancedMode` and `libraryView`, under 'spx-gfx-prefs'. `commentVisibility` is read by `src/editor/CommentVisibilityControl.tsx`, `advancedMode` by `src/components/useAdvancedMode.ts`, and `libraryView` by `src/components/home/sections/GraphicsSection.tsx`. The advanced switch is docs/GOALS_ARCHIVE.md, Student release step 4.
