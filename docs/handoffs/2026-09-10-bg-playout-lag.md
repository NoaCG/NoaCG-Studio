# 2026-09-10 - row BG, the operator's playout lag

Branch `claude/bg-playout-lag`. Three commits, build green, `/check` passed with review delegated
and simplify inline. Queued for landing.

## What the row was asked and what came back

The question was whether the lag follows SELECTION or the verbs, and the row's own plan said that
if it followed selection, the preview rebuild was the answer and a preview that survives a
selection should be landed. **It follows neither, and no product code changed.** On the app we
ship, every gesture on the production dashboard paints in about 30 ms and the page never drops a
frame. On the dev server, at the owner's own memory conditions, the same gestures take 85-91 ms and
drop three to four frames every time.

The full tables and the reasoning are in `docs/backlog/playout-lag-when-working-the-queue.md`. The
owner's copy, with the route, is `docs/acceptance/owner-queue/2026-09-10-take-is-instant-on-the-built-app.md`.

## What is left, and why

**The published path is untested, and it is now the strongest candidate.** Everything measured here
is the OFFLINE path. `runVerb` in `src/components/home/ProductionPage.tsx` takes a different road
when `hostedSlug` is set: it awaits `sendHostedControlBatch` (a Supabase RPC) and deliberately
applies NOTHING locally, because the log follower brings the row back and applying twice would
double every write. So on a published production the operator's own PROGRAM monitor does not move
until a server round trip plus a Realtime fan-out has completed. On a venue's wifi that is exactly
"it didn't play out immediately".

It could not be measured here: this checkout has no backend (`.env` absent, `.env.bench` blank), so
it needs a real Supabase project and a published production - `needs: account`, recorded on the
receipt. The instrument works unchanged against it; point `--measure` at a configured server.

If that round trip IS the cost, the obvious fix is a trap: applying locally as well as sending
double-applies, and a duplicate `play` is the one renderer fault that leaves NO trace on screen
(that is why `PayloadStage` counts `data-plays` at all). Read that counter's comment before
touching it.

## Traps that exist in no repo file

**Every latency number anyone has quoted about this app came from the dev server, and the dev
server is not the product.** React's development JSX runtime (`jsxDEV`, a stack capture per
element) plus StrictMode's double render are the top frame in every CPU profile of the production
dashboard - including one taken with nothing pressed, where it still costs 71 ms per second and a
half. That is why `dev-worktree.mjs` grew `--preview`. There was previously NO sanctioned way to
run the built app in a worktree: `npm run preview` is refused by the guard hook and
`preview_start {name}` cannot reach a linked worktree.

**`--preview` serves no `/api`, and it fails silently.** All six API plugins implement
`configureServer` only, so `vite preview` never installs them, and Vite's SPA fallback answers
`/api/render` or `/api/me/entitlement` with `index.html` and a **200** - not a 404. A caller that
degrades on error (`myEntitlement.ts` does) then reports its default as though the server had said
so. The mode prints that warning on every start. If a future session needs both the built bundle
and the API surface, the fix is `configurePreviewServer` on those six plugins; it was left undone
deliberately, as a change to dev tooling this row had no evidence to justify.

**A two-click Playwright gesture cannot be timed from its first click.** This cost me a wrong
conclusion that had already been written into the backlog and the owner-queue file: between
`clickCue(...)` and `getByTestId('verb-take').click()` Playwright resolves a locator, runs
actionability checks and makes a CDP hop, and that gap measured 34-85 ms. Timed from the cue click,
a Take "after a selection" looked 33 ms slower than one on a settled selection, and I attributed it
to React re-rendering `ProductionPage`. Timed from the verb's own click there is no difference at
all. The bench now prints the driver's gap in its own column so it can never be read as the app's.

**A `srcdocReplaced: 0` needs a liveness flag beside it.** The preview subtree is conditionally
rendered, so a remounted iframe would carry no observer and read as "not rebuilt". The bench
re-arms before every gesture and reports `observing`. The composed-once-per-template conclusion
rests entirely on that zero.

**The backlog cited `importedDesign/drawnState.ts`, which has never existed.** Fixed to
`svg.ts` (declares `svgFitDue`/`fitSvgText`) and `behaviourRuntime.ts:664` (calls it).

## Method notes for whoever runs this next

- The bench is two-phase because the fixture is built through the app's own module graph, which a
  production bundle does not expose. `--seed` runs against the dev server and saves the browser
  profile (localStorage AND IndexedDB, via Playwright's `storageState({ indexedDB: true })`);
  `--measure` restores it against whatever is on the same port. Same port means same origin, which
  is what makes the profile portable between the two.
- Families are INTERLEAVED, not run in blocks. The first pass ran them in blocks and the last block
  was three times slower than the first - on a machine whose free memory fell from 2.2 GB to 0.8 GB
  while it ran, so block order and machine drift were the same axis and the numbers could not tell
  them apart.
- Free memory is recorded per gesture. The built app is remarkably insensitive to it: at 1 GB free
  a Take still painted in 37 ms.
- The raw records are in `playout-lag-out/` (gitignored): `prod-healthy` (the built app, 4.25 GB
  free, the corrected instrument), `dev-corrected` (the dev server, 3.67 GB free, same instrument),
  `prod-pool8` (eight graphics, sixteen cues) and `prod-pressured`/`dev-server` (earlier runs on the
  first-click timing - do not quote those).

## Anything that needs the owner

One thing, and it is in the owner-queue file: **run the 2026-09-12 rehearsal off a built app**
(`npm run build`, then `npm run dev:worktree -- --preview`), not off `npm run dev`. That is the
whole fix for what he reported, and it needs no code.

If Friday is going to be a PUBLISHED production rather than a local one, the round-trip measurement
above should happen before then, and it needs a backend he owns.

## Pointers

- `scripts/playout-lag-bench.mjs` - the instrument, with the method in its header
- `scripts/dev-worktree.mjs` - `--preview`, and why measuring the dev server is worthless
- `docs/backlog/playout-lag-when-working-the-queue.md` - the tables, the three answers, the open half
- `docs/acceptance/owner-queue/2026-09-10-take-is-instant-on-the-built-app.md` - the owner's route
- `src/components/home/ProductionPage.tsx` §preview (the memoisation that was vindicated) and
  `runVerb` (the published path that was not tested)
