# A sync pull still fetches every record that has assets one request at a time

**Filed:** 2026-09-26. **Source:** measurement while fixing issue #382 (pull request #442), and
review of that change.

## Why

A fresh sign-in pulls everything the account holds. Since #442, a record whose body has no
Storage reference is applied as `list()` returned it. A record that does hold one (a look with a
custom font, a graphic with images) still takes `remote.get()`, which in
`src/backend/supabaseProvider.ts` selects the row `list()` already returned and then downloads
each asset in turn, one record after another. So the defect #442 fixed for plain records is still
there for records with assets: about 130 of them at a 200 ms round trip is about 30 seconds on
every new device, and the sync indicator stays on "Syncing" the whole time.

## What it would take

- Rehydrate the listed body instead of fetching the row again, for example a provider method that
  runs `rehydrateAssets` on a record `list()` returned (a no-op for the local provider).
- Download each storage key once per pass, and hydrate records with small bounded concurrency
  rather than strictly in sequence.
- Extend test 18 in `e2e/sync.spec.ts` to pin it, and compare per-spec durations against staging
  (`gh workflow run hosted-latency.yml --ref <branch>`) with run 36257424221.

## Evidence

- Hosted-latency run 36252087565: 129 sequential look fetches, 29 s, seven specs unclean. Run
  36254048383, same code plus #442: the suite went from 26.4 to 8.2 minutes.
- The looks on the staging test account carry no Storage reference, so the staging suite does
  not exercise this path today.
