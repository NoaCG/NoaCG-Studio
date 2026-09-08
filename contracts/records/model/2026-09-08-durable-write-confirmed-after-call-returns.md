# model/durable-write-confirmed-after-call-returns

Rule: `model/durable-write-confirmed-after-call-returns`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md`, which described the claim protocol in these words: a write is confirmed after the call returns, so a refusal is not that call's return value; a caller that branches on it awaits `commitDurableWrites()`, which CLAIMS the message (awaiting the chain resumes on a microtask, the generic announcement is scheduled as a macrotask, so a claimer always wins) and reports it in its own words; unclaimed failures reach App.tsx as `spx-storage-error`.
