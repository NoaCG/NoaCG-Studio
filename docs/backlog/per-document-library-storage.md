---
v: 2
source: owner
kind: ask
raised: 2026-09-30
state: unstarted
asked: "I hope we have a long-term solution for this ... Let's start with 'Bringing your library to this browser' now, and a spec for per-document storage later, after the bridge connection."
serves: NOW
size: large
touches: src/model/durableStore.ts, src/model/library.ts, src/model/shows.ts, src/backend/storage.ts, src/backend/sync.ts
needs-owner: none
---

# Store each graphic and production as its own record (spec first)

## Why

The browser keeps each kind of document as one list under one key, so every save of one graphic
rewrites the whole graphics list (about 18 MB for the owner's 138 graphics, mostly embedded images
and fonts), and a first sync holds the whole library in memory at once. #574 fixed the Chrome crash
on first sign-in (a whole-library rewrite per pulled record, back to back) but not this limit: a
library several times bigger would again need gigabytes, and every edit already pays the full
rewrite.

## What it would take

A spec before code: each document as its own IndexedDB record; migration on read from the list
keys; the durable store's synchronous-mirror contract (`model/durableStore.ts`,
`docs/SAVED_CONTENT_MODEL.md`); sync putting and pulling per record; cross-tab adoption per record;
and measurements before and after on a library of the owner's shape (the 2026-09-30 crash
investigation's seed and measure scripts are the method: fresh profile, sign-in, renderer memory
over time, IndexedDB writes).
