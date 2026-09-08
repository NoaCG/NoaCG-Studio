# model/saved-documents-live-indexeddb-behind-synchronous

Rule: `model/saved-documents-live-indexeddb-behind-synchronous`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

From the hand-written `src/model/AGENTS.md`, the bullet this rule was extracted from:

> durableStore.ts - WHERE THE SAVED DOCUMENTS LIVE, and the one place that decides it: IndexedDB behind a synchronous in-memory mirror. It replaced localStorage, whose ~5 MB origin quota filled after about ten graphics (base64 +33% x UTF-16 x2 x the duplicated Reset baseline: a 150 KB logo cost ~820 KB); a desktop profile now reports gigabytes. It does NOT replace the Supabase backend - that is the server layer an account unlocks, and the product wants both. `DURABLE_KEYS` is the explicit list of what moved (graphics, shows, both working slots, saved videos, looks, the retired packet store).

The measurement and the localStorage history are why the module exists; they are evidence, so they live here rather than in the rule.
