# A tab that writes before it has adopted another tab's write puts the old record back

**Filed:** 2026-10-03. **Source:** reproduction while fixing the `e2e/cross-tab.spec.ts` flake
(merge-group run 37118664889).

## Why

Two tabs on one production can still lose work. Every model mutator is a read-modify-whole-record
write against the tab's own in-memory mirror (`src/model/durableStore.ts`). A landed write is
announced over a `BroadcastChannel` and the other tabs re-read that key, but the re-read is
asynchronous. A tab that writes the same record between the announcement and its re-read writes
its stale copy back, and the other tab's change is gone from the database. `durableStore.ts`
already names this window and accepts it for one person editing in one tab at a time. It stops
being rare when a tab is busy: a slow machine, a tab in the background, or a long render on the
main thread all widen it, and the operator gets no sign that anything was lost.

## What it would take

Close the window at write time rather than narrowing it: before a whole-record write, check that
the stored record is the one the mirror was read from (a per-key revision kept beside the value,
compared inside the same IndexedDB transaction), and re-read and re-apply the change when it is
not. The larger shape, records stored per document instead of whole arrays, is
`docs/backlog/per-document-library-storage.md`, which would also shrink what a stale write can
destroy. A cheaper partial step is to apply a pending adoption before any write of the same key.

## Evidence

- Reproduced deterministically on 2026-10-03: the first test of `e2e/cross-tab.spec.ts`, with tab
  A's `BroadcastChannel` deliveries delayed by 300 ms through an init script (standing in for a
  busy tab), loses tab B's table 5 times out of 5: the fresh third tab reads `datasets` 0, the
  same failure as run 37118664889. With the spec waiting until tab A has adopted the table before
  it writes, 5 out of 5 pass.
- On CI the spec hit the window with no injected delay: it was the first test of its shard, on a
  cold dev server, and it writes from tab A within milliseconds of tab B's write landing.
- The spec now waits for the adoption, because it tests the invalidation, not this window. Nothing
  in the suite covers this window now; a test for the fix would be the delayed-delivery script
  above, with no wait.
