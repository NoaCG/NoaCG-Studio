# ai/treat-regex-screen-obvious-constructs-containment

Rule: `ai/treat-regex-screen-obvious-constructs-containment`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 53 (zero-based blank-line inventory). Checked against code: unsafeJsConstructs uses textual patterns; runtimeBench creates an unsandboxed srcdoc iframe and accesses contentDocument. Source prose (historical evidence; only the rule above is authoritative): Honest limit: a regex screen refuses the obvious, not the determined (`window['fetc'+'h']`). The containment that would actually hold is denying the preview iframe the app's origin.
