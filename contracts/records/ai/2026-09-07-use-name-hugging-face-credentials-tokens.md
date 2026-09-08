# ai/use-name-hugging-face-credentials-tokens

Rule: `ai/use-name-hugging-face-credentials-tokens`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 20 (zero-based blank-line inventory). Checked against code: AI_PROVIDERS has credential: token; credentialNoun returns token for that entry. Historical model ids and route counts are receipts, not defaults to pin. Source prose (historical evidence; only the rule above is authoritative): **Verified end to end on real customer credentials 2026-08-14:** Hugging Face (`Qwen/Qwen2.5-Coder-3B-Instruct`, 74 schema-capable routes listed for the token) and Google (`gemini-3.1-flash-lite`), both returning schema-valid objects through the real adapters. HF issues USER ACCESS TOKENS needing the **Inference Providers** permission, never API keys - hence `credentialNoun` and the `HF_TOKEN` variable name.
