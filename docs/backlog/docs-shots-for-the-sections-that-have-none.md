# Four /docs sections that need a screenshot and have none

**Filed:** 2026-09-08. **Source:** the 2026-09-02 docs-rewrite and 2026-09-05 live-vote-conventions
sessions (both handoffs since drained)

## Why
Only the SVG import guide carries pictures. The dashboard, the OBS browser-source setup and the
quiz run are each a sequence of named controls a reader has to find on an unfamiliar screen, and
prose alone makes them guess. The 2026-09-02 rewrite named this gap rather than inventing captions
for shots nobody had taken.

The fourth is `#svg-vote`, the one import section a designer reads without seeing the screen it
describes. Its material is layer names and spellings, which a picture carries better than a table.

## What it would take
`scripts/docs-shots.mjs` already drives the running app and has one block per shot (`svg-drop`,
`svg-fields`, `svg-behaviour`). Add a block per section, run it against a dev server, and pin the
`<img>` in `e2e/docs.spec.ts` the way the SVG guide's are. Voice and structure rules are in
`src/docs/AGENTS.md`. The vote shot is blocked in practice on
`docs/backlog/the-shipped-poll-sample-cannot-be-imported-as-a-live-vote.md`: there is no shippable
vote sample to drop yet, so do that one first.

## Evidence
`scripts/docs-shots.mjs:109,118,130` - three blocks, no dashboard, OBS, quiz or vote;
`docs/backlog/docs-guides-to-write.md` covers the guides, never the shots.
