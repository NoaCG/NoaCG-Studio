# model/reads-durable-store-synchronous-they-come

Rule: `model/reads-durable-store-synchronous-they-come`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md`: `Reads are synchronous` (the mirror), so no signature in this directory changed; the ONE async step is boot, and `src/main.tsx` must hydrate BEFORE importing App, because store/templateStore.ts reads the autosaved project at module scope.
