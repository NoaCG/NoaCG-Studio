# ai/let-preselect-only-require-user-choose

Rule: `ai/let-preselect-only-require-user-choose`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 59 (zero-based blank-line inventory). Checked against code: guessPurpose returns only asset or mood, including SVG marks and probe-failure fallback; splitByPurpose preserves explicit user intent. Source prose (historical evidence; only the rule above is authoritative): The last three ride `GenerateContext.references` as `{asset, use}` and are vision-only. `attachmentSections` builds ONE numbered manifest plus a block per purpose present, and `imageBlocks` sends the pictures in that order, so "attachment 3" means the same picture in the text and the vision blocks. `modifyContent` reuses the same function. The preselect only ever guesses `asset` vs `mood`; `layout` and `plate` are intents no pixel reveals.
