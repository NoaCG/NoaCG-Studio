---
v: 1
scope: src/blocks/presetRegistry.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-way-emit-preset-region-template-structure.md
---
`emitPresetRegion(template, presetId, opts?)` is the ONE way to emit a preset's region for a template, with the structure facts read off its HTML, and `presetsForType`/`anyPresetById` are the one lookup for every category's presets. Three callers share that one shape: `presetApply` derives a preset's keyframes by emitting a region and converting it through the importer, `LegacyTimeline`'s start-over writes it converted over an unconvertible region, and `ai/claudeProvider.ts`'s `exampleWithAuthoringRegion` emits it into the model's worked example.
