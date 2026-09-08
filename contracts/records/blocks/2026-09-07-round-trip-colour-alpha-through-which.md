# blocks/round-trip-colour-alpha-through-which

Rule: `blocks/round-trip-colour-alpha-through-which`. Recorded 2026-09-07 on `claude/migrate-agents-contract-rules-5ab9fc` at 39835021.

`--panel-shadow: 0 8px 24px rgba(0,0,0,.4)` came to render as a colour row whose swatch replaced the entire shadow, and editing `--panel-bg` through a swatch silently turned a translucent panel opaque.
