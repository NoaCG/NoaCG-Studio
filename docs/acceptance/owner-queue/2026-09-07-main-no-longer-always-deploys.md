---
kind: behaviour
date: 2026-09-07
---
# `main` no longer deploys on every landing

Vercel now skips the production build when a landing changes only documentation,
contracts, workflow tooling or tests. Half of them do.

**Route, under a minute.** Open <https://noacg.studio/version.json> and compare `commit`
against the tip of `main`. After a docs-only landing these will now DIFFER, and that is
correct - the site is byte-identical, so nothing was rebuilt. After any landing touching
`src/`, `api/`, `public/`, `packs/`, `render-worker/` or a root `.html`, they should match
within a few minutes.

**What to look at.** That the lag never appears after a real change, and that the
"Production drift" alarm stays quiet through a run of docs-only landings. That alarm is the
thing most likely to be wrong: it now expects production to serve the newest
*deploy-affecting* commit rather than the newest commit, reading the same list the skip
reads (`scripts/deploy-affecting-paths.mjs`).

**Why it was done.** The 2026-08-08..2026-09-07 cycle spent $32.39 of a $20 credit on build
CPU minutes across 719 production builds, 48% of which rebuilt an identical site. Replaying
the cycle through the filter leaves 371 builds. Combined with the build machine moving from
Elastic to Basic on 2026-09-07, the modelled cycle cost drops from about $31 to about $8-11.
