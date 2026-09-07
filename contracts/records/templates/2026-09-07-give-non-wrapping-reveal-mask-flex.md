# templates/give-non-wrapping-reveal-mask-flex

Rule: `templates/give-non-wrapping-reveal-mask-flex`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 634-639. - **A REVEAL MASK IN A FLEX ROW IS A LINE THAT CAN BE SQUEEZED TO NOTHING.** A flex item normally   refuses to shrink below its own content (`min-width: auto`), and that protection is switched OFF   for an item whose overflow is not visible - which every `.{prefix}-mask` is. So a masked line in   a flex row has no floor: ls07's label may not wrap (`white-space: nowrap`) and was squeezed under   its own width and CUT - "COMMENTARY" aired as "COMMENTAR" at text size L. A masked line that   cannot wrap states `flex: none`, and the lines that CAN wrap absorb the row instead.
