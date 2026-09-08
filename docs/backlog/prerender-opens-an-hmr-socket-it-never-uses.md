# The prerender step opens an HMR websocket it never uses

**Filed:** 2026-09-08. **Source:** the 2026-09-04 gate-covers-what-it-claims session (handoff since
drained)

## Why
`loadCatalogEntries` starts Vite in middleware mode purely to walk the module graph, but does not
disable HMR, so each run still binds an HMR websocket port. Two builds at once - ordinary on this
machine, where several worktrees build in parallel - and every build prints a port-in-use error.
It is noise on a green build, which is the kind of noise that trains people to skip build output.

## What it would take
`server: { middlewareMode: true, hmr: false }` in `scripts/prerender.mjs`. The comment above that
line already says the step wants the module graph and never a listening port, so the fix makes the
code match its own stated intent.

## Evidence
`scripts/prerender.mjs:222-231`. Measured 2026-09-04 while running two builds concurrently; left
alone then because it was outside that row's files.
