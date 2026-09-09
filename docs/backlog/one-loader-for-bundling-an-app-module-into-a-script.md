# Five scripts each carry their own copy of "bundle an app module and run it here"

**Filed:** 2026-09-09. **Source:** the reuse review of `claude/c-vote-notice-plates`, which added
the fifth.

## Why

A script that wants to measure or test real application code has to get a TypeScript module out of
the Vite graph and into either Node or a blank Chromium page. Rolldown does it in six lines, and
those six lines now exist five times:

- `scripts/svg-samples-check.mjs` - `bundleImporter()`, iife onto `window.NOACG_SVG`
- `scripts/svg-plate-share-spike.mjs` - `bundleForPage()`, the same thing for two modules
- `scripts/catalog-emit.mjs` - the same for the catalog
- `scripts/ticker-speed.test.mjs` - `load()`, esm through a base64 data URL
- `scripts/field-auto-map.test.mjs` - `load()`, a verbatim copy of the one above, JSDoc included

The `?raw` plugin they all need was already carved out for exactly this reason:
`scripts/rolldown-raw.mjs` opens "It lives here because two of them do". The loader around it was
not, so each new script copies whichever neighbour it found. That is the failure mode the plugin
file was created to stop, one level up.

It has already cost something: `field-auto-map.test.mjs` was written without `rawSuffix`, failed to
resolve `src/assets/OFL.txt?raw` through `src/model/fonts.ts`, and had to be fixed by copying the
line from the neighbour that had already learned it. The next script learns it the same way, or
does not.

`flag()` - the three-line `--name value` argv reader - is a smaller instance of the same thing, in
`svg-samples-check.mjs`, `svg-import-sweep.mjs` and `svg-plate-share-spike.mjs`.

## What it would take

Two exports beside the plugin in `scripts/rolldown-raw.mjs` (or a `scripts/app-module.mjs` if that
file's charter should stay narrow): one that returns an imported ESM module for Node, one that
returns iife source for `page.addScriptTag`. Both apply `rawSuffix`. Then update the five callers.
Every one of them is covered by `npm run build` (the two `.test.mjs` files run in its gates) or by
a queued browser job, so the change is verifiable end to end.

Small, but it touches five files and none of them belong to the change that noticed it.

## Evidence

- `scripts/ticker-speed.test.mjs:33-41` and `scripts/field-auto-map.test.mjs:31-36` - identical,
  down to the JSDoc line "One TypeScript module of the app's graph, importable here."
- `scripts/svg-samples-check.mjs:60-66` and `scripts/svg-plate-share-spike.mjs:61-66` - the same
  rolldown call with the global name parameterised.
- `scripts/rolldown-raw.mjs` - the header that already states the shared-home rule.
