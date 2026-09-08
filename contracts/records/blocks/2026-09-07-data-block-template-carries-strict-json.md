# blocks/data-block-template-carries-strict-json

Rule: `blocks/data-block-template-carries-strict-json`. Recorded 2026-09-07 on `claude/migrate-agents-contract-rules-5ab9fc` at 39835021.

There is no second scene model: the literal IS the graphic's motion, so any editor logic that diverges from the interpreter shows as a preview that disagrees with the strip.

Scoped to the whole directory rather than to a list of engine modules. Thirteen of the twenty-three files here read or write that literal - `animData`, `animEdit`, `animEval`, `animImport`, `animMachine`, `filterTrack`, `layerTimeline`, `machineEdit`, `motionPresets`, `presetApply`, `stepAssign`, `timelineLens`, `timelineModel` - and any shorter list is an arbitrary cut through them. The premise costs every session in the directory a few hundred bytes; naming three of the thirteen would have let a session open `animEval.ts` without it.
