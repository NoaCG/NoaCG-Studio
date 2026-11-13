# OS5a: JSON source, evidence

Acceptance AC-9 (`docs/work-specs/obs-scenes/spec.md`). Rules R1 to R18 are in the spec's phase
notes. No OBS hardware is involved in this phase.

## Per clause

| Clause | Changed behaviour | Proof |
| --- | --- | --- |
| Reads at its set interval and never under 10 s, while a page holds the lease | `src/control/jsonSource.ts`: the Sheet reader with the source's interval, clamped to 10 s to an hour, renewing the lease at least every 20 s (R1, R5) | `scripts/json-source.test.mjs` "the interval is 10 s at least", "reads at its interval and never sooner" (60 s: no read at 59 s, a read at 60 s; 1 s reads every 10 s, not at 9.999 s); `e2e/production-api-mapping.spec.ts` third test: a 10 s source read by the page, line "every 10 s" |
| Without a lease, at the server tick | `api/_lib/dataTick.ts` reads a connector with `read` through the shared cache; migration 0116 lists it only once due (R10) | `scripts/data-tick.test.mjs` "a JSON source NoaCG reads": read, written once, a failure writes nothing, a connector without `read` is not read; 0116's self-check: never read is due, read 30 s ago with a 60 s interval is not, 50 s ago is, paused never |
| One cached server read per address serves every reader | `api/_lib/feedFetch.ts` `JSON_KIND` / `readCachedJson`: the feed reader's row and claim, its own key, a wait of 9 s from the read that asked, `max-age` not honoured, Retry-After honoured (R3 amended, R17) | `scripts/json-fetch.test.mjs`: nothing fetched at 8.999 s, a fetch at 9 s; a 4 s fetch does not push the next 10 s read back; two readers at once make one fetch; `max-age=900` does not hold it; a JSON and a feed read of one address keep two rows; Retry-After 120 holds 120 s |
| Two pages compete for the lease without double reads | The Sheet reader's lease (local, or the published row's), unchanged | `scripts/json-source.test.mjs` "two tabs share one lease": one reader's cadence only, the other shows "other", then takes over |
| A failed, malformed or late read writes nothing | A failure is a missed read; the route answers no payload on failure; the reader's 25 s timeout aborts (R7) | `scripts/json-source.test.mjs` "a failed or malformed read writes nothing", three misses stale, "a late read writes nothing, even when its answer arrives after", "after Stop"; `scripts/json-fetch.test.mjs` "not JSON, or cut off" keeps the last good payload; e2e third test: a 502 keeps the value and the line says why |
| Pause and resume, and closing the page, as for other sources | The Sheet reader's Pause, Resume poke, `release` on `pagehide`, unchanged (R8) | `scripts/json-source.test.mjs` "paused, nothing is read or written; Resume reads at once"; e2e third test: no read in 11 s paused, Resume reads at once |
| Checked and changed times are shown | `projectedState`: checked on every good read, changed only when the payload's canonical fingerprint moves (R9) | `scripts/json-source.test.mjs` "checked moves with every good read; changed moves only when the payload does"; e2e: `JSON: Guests · checked N s ago · changed N s ago` |
| The feed route's guards hold, in an address's words | `guardedFetch` with JSON's read: private answers refused before any request, redirects checked, 256 KiB after decompression, no credential (R3, R4) | `scripts/json-fetch.test.mjs`: private answer and metadata IP refused, redirect to a private address refused, 256 KiB read and one byte more refused, `accept: application/json`, no authorization, every guard sentence said of an address; the route refuses the 121st read a minute and takes GET only |
| No new Vercel function | `/api/data/json` inside `api/data/[...path].ts` | `npm run check:function-budget`: 12 functions under `api/` |
| One snapshot (spec behaviour) | `projectJson` evaluates the payload once with the connector's lists and recipe; every changed bound path in one write; typed fields and collections said, not written (R6, R14) | `scripts/json-source.test.mjs` "one write", "operator's value holds", "a missing leaf, … a typed field and a collection are said", "a list leaf goes through the list adapter" |
| Nothing new with the switch off (rule) | The review offers "Read by NoaCG" only with the OBS scenes switch on (R2) | e2e first test: switch off, no option, the saved config has no `read` |
| An agent never reads a NoaCG-read source (R12) | 0116 `read_by_noacg` | 0116's self-check; the route maps it to 409 with its words |
| `read` survives the review, never moves the revision (R13) | `connectorPlan` keeps the stored `read` unless the review changes it | `scripts/json-source.test.mjs` "the review keeps read unless the operator changes it" |

## Local runs

- `node --test`: json-source 15, json-fetch 13, data-tick 15, sheet-source 44, feed-source 10,
  feed-fetch 49, source-mapping 66, external-data-connector 64, file-source 16, connector-review 27,
  show-fixture-compat 16, db-push 64: all pass.
- `e2e/production-api-mapping.spec.ts` (4) and `e2e/production-data.spec.ts` (44): 48 passed.
- `npx tsc --noEmit` (root and api configs) and eslint on the changed files: clean.
- `check-e2e-protection`: OK; `e2e-capacity`: warnings only (suite-wide, not this change).

## Not checked here

- Migration 0116 was not applied to a database here; its self-check runs on CI's local stack and on
  apply. The published lease and tick path through the real database is the configured suite's.
- A real public JSON address over the network: the guard's connection is the feed reader's, pinned
  by `scripts/feed-fetch.test.mjs`.
