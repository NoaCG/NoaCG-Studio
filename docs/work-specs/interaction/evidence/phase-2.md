# Phase 2 evidence: joining and a basic Join card

Spec: `docs/work-specs/interaction/spec.md`, phase 2 (AC-5, AC-6, AC-11). Base:
`afbe5cb0ce9aa3bc2da579ac9a42b60c9a6d1a38`. Branch: `claude/plan-interaction-2-build`. The PR,
its reviewed head, the CI run and the merge sha are in the PR description and the receipt to the
coordinator; this file holds what was checked and how.

## Per criterion

| AC | Result | Evidence |
| --- | --- | --- |
| AC-5 | pass (local); configured in CI | Node: `scripts/join-path.test.mjs` (the path parser: `/j/<name>`, `/join/<name>`, `/join?p=<slug>`, bad names refused, the short link on the page origin), `scripts/app-clean-url.test.mjs` (dev and preview routing of the three doors), `scripts/check-vercel-config.test.mjs` (`/j/:name` rewrite and its noindex header, production). Blank page: `e2e/production-audience.spec.ts` "the studio QR code decodes to the short link, as SVG and as PNG" (read from pixels with jsQR). Journey, offline: `e2e/production-audience.spec.ts` "the public join page answers honestly on an offline build" opens `/j/<name>` in dev. Configured: `e2e/configured/audience-live.spec.ts` first test (Interaction's QR decodes to `<origin>/j/<name>`, Copy puts it on the clipboard, the PNG and SVG downloads decode to it, all three doors open the page) and "the built join page shows the live question within 3 seconds..." (the join entry built and served by Vite's preview server, all three doors in preview, then 5 cold loads at the spec's profile, median asserted under 3 s). |
| AC-6 | pass (local); configured in CI | Blank page, `e2e/production-audience.spec.ts` "the phone page carries the production look" over `mountJoinSurface`: colours, the bundled face (loaded, not only named), logo, title and waiting text appear; no look shows the production name and the default text; three low-contrast palettes (dark on dark, light on light, a mid grey) meet 4.5:1 for every text and 3:1 for every edge, with no question, an Open one (focused field included) and a Multiple choice one with a pick; a 404 logo shows the title and is never painted; a failing custom face falls back to the system font with no sideways scroll and every option at least 44 px; a replaced logo and a removed one take effect on the next read. Journey, offline: "the page settings reach the phone preview" (title and waiting text, saved, reload, emptied back to defaults). Configured: page settings reach a phone with no publish; the look's logo is published to `join-logos/<user>/<production>/<sha-256>.png`, shows on the phone, a new logo shows at a new path, removing it shows none. |
| AC-11 | pass (local); configured in CI | Blank page, `e2e/audience-pack.spec.ts` "the Join card draws its QR from its Join link": the card rendered as the studio's monitors load it decodes to its Join link, follows an `update()`, and an empty link draws nothing; the single-file export opened in an offline context with every request aborted draws a code that decodes to the same link, and fetches nothing. Journey, offline: "a Join card cue takes its place and size from the cue editor" (Place top-left and Larger move and scale it on PREVIEW; PROGRAM untouched). Configured: Add Join card to rundown adds exactly one Join card cue per press, its Join link the production's link. |

## Cold load (AC-5 baseline)

Measured on this machine with the join entry built and served by Vite's preview server, against a
mock that answers the join read like the local stack (CORS and a preflight), at the spec's profile
(1.6 Mbps down, 750 kbps up, 563 ms, 390 x 844, a new context each run), from navigation start to
the question's text visible:

- Before this phase (the read through supabase-js): 2668, 2653, 2652, 2653, 2665 ms; median 2653.
- After (the read is one plain request; supabase-js loads only when the phone sends): 1821, 1820,
  1835, 1821, 1820 ms; median 1821. Three requests: the page, one script, the read.
- In CI against the local stack (run 42652474854, configured shard 1, head `2e20660`): 1803, 1818,
  1803, 1803, 1871 ms; median 1803.
- The suite's dev server is not a measure of what phones get: it served about 2.5 MB (Vite's
  client, React refresh, unbundled supabase-js) and took 5.7 s offline. The configured test
  therefore builds the join entry and measures that; its five numbers are printed in the CI log
  and attached to the test as an annotation.

## Migration 0112

- Scratch Postgres 16 with stand-ins for Supabase's `auth.uid()`, `storage.buckets`,
  `storage.objects` and `storage.foldername`, plus 0039's quota table and restrictive policy:
  0112 applied twice from the top (idempotent), the self-check passed, and as `authenticated` the
  insert policy admitted only the user's own folder with a 64-hex name and a raster extension
  (refused: another user's folder, a non-hash name, an `.svg`, a path with no production folder,
  another bucket).
- `scripts/db-push.test.mjs`: 0112 sets its timeouts and is not live-path. It adds no function, so
  `supabase/advisor-baseline.json` is unchanged (`scripts/advisor-baseline-grants.test.mjs` passes).

## Catalog (the Join card, `jc01`)

- `node scripts/check-catalog-emit.mjs`: only `jc01` added; every existing design byte-identical
  (the queue card's hidden-source comment moved into its form and emits the same bytes).
- Scoped to `jc01`: field coverage, type floor, numerals, overflow (no baseline rows needed) and
  `node scripts/catalog-specs.mjs --only jc01`: pass. `node scripts/factory.mjs`: 318/318.
- `catalog-sameness`: every first page still 100% distinct. `palette-freedom audience`: `jc01`
  reports the same kicker contrast under a foreign palette as its house siblings (19 of 21 audience
  designs report it; a report, not a gate).
- Taste frames (`taste-frame-review --only jc01`): the long-text frame grows the card downward,
  the code stays square and inside the frame.
- `e2e/catalog-render-baseline.json` is recorded on Windows and compared only there, so `jc01` is
  not in it: issue #2319.

## Codex review of `2e20660`

Two findings, one family (keeping phones in step between publishes): a change made just before
leaving the tab never reached phones, and a slow logo upload could land after a newer change. The
rules P1 to P4 (phase notes) were written first; `src/control/joinPageSync.ts` implements them and
`scripts/join-page-sync.test.mjs` drives it with a fake server and production (no send when phones
match, a change sent with nobody left to ask, several changes send the last one once, a superseded
slow upload is never sent, a logo that cannot be published keeps the one phones have while the
words still go, nothing is sent when neither what phones have nor the logo can be had, phones
with no page yet still get the words when the logo fails, a known
logo is not uploaded again, and publish waits for the queue and ends on the latest saved page).
Mutation: removing the superseded-work check before sending fails the slow-upload test.

## Checks run on this machine

- `npm run gates -- run --changed origin/main`: 424 tests, 0 failed.
- `npx tsc --noEmit -p tsconfig.json` and eslint on the changed files: clean.
- Browser, local queue: `e2e/production-audience.spec.ts` and `e2e/audience-pack.spec.ts`, 40
  passed (the phone page look, the studio QR, the Join card QR live and exported, page settings,
  Join card placement, the offline join page, the viewer preview, and both files' earlier tests);
  `e2e/catalog-baseline.spec.ts` emitted-code baseline recorded and passing.
- Not run here: the configured suite (no local Supabase stack on this machine); it runs in the PR's
  CI gate.

## Repair 1 (independent check checker-2-2-c-3487, AC-6)

The check found that low-contrast looks could render below AA once `css()` rounded the colours
to whole RGB (for example look `#cc3333` / `#dd4444` / `#bb3333`: option and field edges 3.0011:1
before rounding, 2.9936:1 as rendered).

- Reproduced on `d521e01`: `node --test scripts/join-colours.test.mjs` fails both sweeps: the four
  named looks, and 2748 of 100,000 seeded random looks below AA on at least one pair (worst kinds:
  card muted text 4.498:1, option and field edge 2.997:1, page muted text 4.491:1).
- Fix: `over()` and `mix()` in `src/audience/joinColours.ts` round to whole channels, so every
  check judges the exact colour the page renders.
- After: the same test passes (3 of 3, about 2.8 s), also on a second seed (run by hand, not kept).
- Mutation: removing `Math.round` from `over()` and `mix()` (the code on `d521e01`) turns the test
  red as above.
- Browser, local queue: the six AC-6 tests in `e2e/production-audience.spec.ts` (look, defaults,
  low-contrast palettes, broken logo, failing font, logo replace and remove) pass.
- No E2E test added: the regression test is a Node test.
