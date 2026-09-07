# templates/express-pixels-reference-1080p-resolution-preserve

Rule: `templates/express-pixels-reference-1080p-resolution-preserve`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 452-455. - **The mechanism.** A design declares `stageWidth` (px at 1080p). `stageBoxCss`   (shared/base.ts) emits the width, the `--stage-width` marker, `box-sizing` and where the slack   goes; `stageExtraJs` (shared/stageFit.ts) emits the runtime that holds each line - and the panel   itself - to the height it was drawn at. Omit it and the output is byte-identical to before.
