# templates/measure-stage-reserves-layout-dimensions-never

Rule: `templates/measure-stage-reserves-layout-dimensions-never`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 460-467. - **THE RESERVE IS A LAYOUT NUMBER, AND IT IS SHIPPED** - the runtime writes it into the template as   an inline `height` / `min-height` that stays there, so a reserve measured wrong is what the graphic   puts on air. The three measurement-of-the-moment failures are recorded in   `docs/FOOTPRINT_STABILITY.md`, section "The reserve is a LAYOUT number, and three things kept   making it a measurement of the moment". **A rect   is the visual box - never measure a reserve with one.** The gate is   `e2e/stage-fit-determinism.spec.ts` (default suite, platform-free, mutation-tested): a reserve must   come back the same across recalibrations and whatever the webfonts do.
