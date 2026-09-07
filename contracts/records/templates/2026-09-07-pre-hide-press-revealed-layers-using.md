# templates/pre-hide-press-revealed-layers-using

Rule: `templates/pre-hide-press-revealed-layers-using`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 264-269.   simulator, wizard thumbnails, control engine, and every export work unchanged. It pre-hides   press-revealed layers (their reveal step's first keyframe values; plain opacity 0 fallback),   shows/hides the CSS-hidden root, fades press-revealed layers OUTSIDE the root with the exit   (unless the Out step animates them itself), runs a `loops` track in its own repeating   sub-timeline (repeat/yoyo/repeatDelay - the ambient breath), and divides every duration and   keyframe time by `speed`. `emitAnimRegion` emits the full marked region (data header + literal +
