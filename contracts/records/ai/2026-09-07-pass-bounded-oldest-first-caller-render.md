# ai/pass-bounded-oldest-first-caller-render

Rule: `ai/pass-bounded-oldest-first-caller-render`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 63 (zero-based blank-line inventory). Checked against code: AiStep bounds CONVERSATION_TURNS at 10; all three prompt functions render conversation, while only contextText renders seed. Source prose (historical evidence; only the rule above is authoritative): - **`conversation`** - the talk turns that led here, oldest first. A brief refined over three turns IS   all three. **The caller bounds this** (the AI step sends the last 10 turns); the provider never re-reads   a session. - **`seed`** - "three more like this": the design spec of a direction the user picked. The design stage   keeps its category, typographic voice and colour character and varies what is genuinely a choice. A   starting point, never a template to return three tints of.

## Citations checked against current code (2026-10-14)

The bound moved out of the step: `CONVERSATION_TURNS` (10) and `conversationOf`, which keeps the last turns oldest first, are in `src/ai/creation.ts`; the step in `src/components/wizard/ai/AiStep.tsx` builds its conversation through them.
