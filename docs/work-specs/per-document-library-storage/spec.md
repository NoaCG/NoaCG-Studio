# Store each graphic and production as its own record

## Problem and authority

The owner's ask of 2026-09-30 (docs/backlog/per-document-library-storage.md): "I hope we have a
long-term solution for this ... a spec for per-document storage later, after the bridge
connection." This is that spec. It changes no code.

The browser keeps each kind of library document as ONE JSON string under one key
(`src/model/durableStore.ts`: the IndexedDB object store `kv`, one value per key in `DURABLE_KEYS`).
So every save of one graphic stringifies and writes the whole graphics list, every read of the
library parses all of it, and a first sync holds the whole library in memory while it applies it.
On the owner's library (138 graphics, 16.3 MB; 13 productions, 9.4 MB) that is:

- one graphic edit: about 16 MB stringified and written to IndexedDB;
- the first sign-in on a new browser before #574: 2.3 GB written and about 5.25 GB parsed in 51 s,
  peak renderer 2.5 to 3.1 GB, and a crashed tab; after #574 and 39ea4bb76: 4 writes, 25.7 MB, peak
  renderer 555 MB (measurements from the 2026-09-30 investigation, method below);
- two tabs editing DIFFERENT graphics can still put an old array back over each other's write in a
  short window, because a tab adopts another tab's write as a whole list (durableStore.ts, the
  cross-tab comment: removing that window "means writing through the DATABASE rather than the
  mirror ... a much larger change, and a separate one").

#574 removed the crash but not the grain: a library several times larger needs gigabytes again, and
every edit already pays for the whole library. docs/ERA5_PLAN.md already set the rule this breaks:
"Persistence grain: per-record ... never whole-key blobs".

## Behaviour

- **Storage grain.** Each graphic, production (personal shows), look, saved video and retired packet
  is its own IndexedDB value under its own key; the two working slots (`spx-gfx-project`,
  `spx-gfx-video-project`) are single records already and stay as they are.
- **The synchronous mirror stays.** Reads stay synchronous and no model signature changes: the
  mirror holds records per kind and id, and a list read assembles them. A record's parsed form is
  kept while its string is unchanged, so an unchanged library is not re-parsed on every read.
- **Writes carry only what changed.** A model save still hands the whole list to the store at first,
  so the roughly 75 whole-list writes in shows.ts, library.ts, packets.ts and videoProject.ts keep
  working; the store compares each record's string with the mirror's and writes only the records
  that differ, plus deletes for ids that left the list. Call sites move to per-record writes later,
  only where profiling says the diff costs anything.
- **Accept, then confirm, per record.** A write is still accepted at once and confirmed a moment
  later (`commitDurableWrites`); a refused write rolls back exactly the records it carried, never
  the whole list, and an earlier refusal still never blocks a later save.
- **Cross-tab per record.** The write announcement names the kind and the ids; another tab re-reads
  those records only. Two tabs editing different documents never overwrite each other; the same
  document edited in two tabs stays last write wins, as today.
- **Sync per record.** `LocalStorageProvider.list` reads records without a whole-list parse where it
  only needs `updatedAt` and `deleted`; a first sync applies each fetched batch (20 records) as it
  arrives, in one transaction per batch, instead of holding every fetched record until the end. The
  bookmark still moves only at the end of a completed pass, so a pass that dies midway re-derives
  what is left from the unchanged timestamps.
- **Accounts unchanged.** Every account keeps its own records under its own names
  (`model/accountScope.ts`); adopt, merge-through-cloud, switch and sign-out behave exactly as today.

Preserved: the localStorage fallback (no IndexedDB, open failed, hydration timeout) keeps whole-list
keys: its quota is about 5 MB, so per-record there buys nothing, and its code path stays as tested.
The cloud schema, the sync reconcile rules and every model function's signature stay as they are.

Non-goals: per-record storage for team productions (held outside the mirror), the working slots,
small preferences in localStorage, and changing what syncs.

## Derived decisions (the owner can overrule any of these)

1. **Same database, same object store, prefixed keys.** Records live in the existing `kv` store as
   `<list key>@<account>/<id>` (signed out: `<list key>/<id>`), not in a new object store, so
   `DB_VERSION` stays 1. A version bump would make any older build that opens the database fail with
   VersionError and fall back to an empty localStorage library. Prefixed keys are read with one key
   range per kind (`IDBKeyRange.bound(prefix, prefix + '￿')`).
2. **Migration on read, list key kept for one release.** At hydration, a list key found without its
   per-record marker is split into records in ONE transaction that also writes the marker. The list
   key itself is left in place, read-only and no longer written, for one release, so a rolled-back
   deployment shows the library as it was at migration rather than an empty one. The release after
   deletes the list keys. The storage cost is one extra copy of the library for that release, which
   is well inside a desktop quota (gigabytes).
3. **A diffing store first, call sites later.** Diffing whole lists inside the store gets the write
   volume down without touching those call sites; the stringify of each record remains, which the
   measurements decide whether to remove.
4. **Measurement method moves into the repo.** The 2026-09-30 seed and measure scripts (another
   session's scratchpad: `seed-lib.mjs`, `measure.mjs`; fresh Chromium profile, production build,
   preview branch, samples renderer memory, IndexedDB puts and bytes, `spx-data-changed`, large
   JSON parse and stringify) become `scripts/library-memory-bench.mjs`, run against a temporary
   Supabase preview branch and never production. Its profile path must stay short: a deep path
   exceeded MAX_PATH and the app silently ran on localStorage.

## Phases

1. The store: prefixed records, the per-kind mirror, the diffing write, per-record rollback,
   migration on read with the marker. No model or sync change. Lands with AC-1 to AC-5.
2. Cross-tab per record (AC-6).
3. Sync reads and applies per record, a batch at a time (AC-7).
4. Measure before and after on the owner's shape (AC-8), then decide whether any call site moves to
   per-record writes.

### AC-1: Saving one graphic writes one graphic

On a library of the owner's shape, renaming one graphic writes about that graphic's size to
IndexedDB (one put), not the library's; measured by the bench's put and byte counters.

### AC-2: An existing library opens complete after the migration

A browser holding the list keys of today opens with every graphic, production, look and saved video
of the library in use, for signed-out and for per-account libraries; the records and the marker are
written in one transaction; if that transaction fails, the app runs on the list keys as today and
tries again at the next start.

### AC-3: A rolled-back build still shows the library

After the migration, a build from before it opens the same profile and shows the library as it was
at migration, not an empty one.

### AC-4: A refused write rolls back only what it carried

With IndexedDB refusing puts (`e2e/_storage.ts` `armStorageFailure`), a failed save of one graphic
leaves every other graphic untouched in the mirror and on disk, the storage alert names what failed,
and the next save is still attempted (e2e/storage-full.spec.ts extended).

### AC-5: Accounts keep their own records

Adopting the signed-out workspace, switching accounts and signing out show exactly the libraries
they show today (e2e/account-library.spec.ts and e2e/configured/shared-lab-computer.spec.ts
unchanged and green).

### AC-6: Two tabs editing different documents keep both edits

Tab A renames graphic 1 while tab B renames graphic 2; a third tab opened afterwards shows both
names, including when the two writes land within the adoption window (fault-injected by delaying
the announcement).

### AC-7: A first sync never holds the whole library to apply it

On the owner's shape, a first sign-in applies the pull in batches: peak renderer memory during the
pass stays under half of today's post-#574 figure (555 MB), and the pass writes the library to
IndexedDB about once in total.

### AC-8: Before and after, on the owner's shape

The bench records, before phase 1 and after phase 3: peak renderer and total private memory during
a first sign-in, IndexedDB puts and bytes for the pass and for one edit, time to "Synced", and the
count of large JSON parses; the numbers go in this spec's evidence folder.

## Tests and tools that read the storage directly

`e2e/_storage.ts` `durableValue` reads `kv` by list key (ai, project and text-tools specs use it only
for working slots, which do not change); `scripts/editor-foundation-bench.mjs` reads
`kv`/`spx-gfx-project` (unchanged); `e2e/production-data.spec.ts` reads `localStorage['spx-gfx-shows']`,
which is not where shows live on the IndexedDB path today either, and should be fixed on its own.
