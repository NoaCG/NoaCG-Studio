# Phase 25: Qualify Sheet delivery failures and native ticker continuity

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-14: "Sheet changes update declared imported credits, ticker and editable multiline-text fields
  through existing source/data bindings; adapter mapping, failure, empty data, pause/reconnect,
  closed-page delivery and each existing/selected playback update policy are proven. No AI per
  refresh."
- AC-24: "Use the existing ticker renderer and shared source bindings: replace/reorder/delete
  messages while moving, change speed only, empty then repopulate, and reopen/reconnect. Assert no
  unintended blank interval or entrance replay for nonempty updates; empty content intentionally
  clears. Qualify marquee continuity and flip handover at its existing item boundary using
  frame/time observations. A linked multiline SVG field updates without resetting unrelated
  motion. This row does not add a general imported-SVG ticker motion compiler; unsupported moving
  artwork remains an explicit limit."
- Row 25: "Use a local fake CSV endpoint for denial, timeout, malformed/empty rows and reconnect;
  exercise server takeover with every operator page closed in Actions. Add one controlled
  public-sheet probe and record actual cadence. Keep last-good data on failure. Cover imported
  credits, ticker rows and multiline text; verify content refresh preserves animation state and
  needs no model request. Native ticker qualification is test-only: replace/reorder/delete
  messages while moving, speed-only change, empty/repopulate and reopen/reconnect. Observe marquee
  continuity and flip item-boundary handover with no unintended blank/entrance replay. Existing
  ticker source is read-only; a failing reproduction returns to its owner or an explicitly
  reconciled narrow repair."

## Pinned main

Worktree from `8f7781d6653269a285e4be2b8f45346b59b4fdaa` (PR #1978, row 24). Previous verified
main: that SHA. CI (push and merge group), configured-suite, Post-landing, Quarantine and Push on
main all succeeded on it.

## What changed

Tests and one test fixture only. No product source changed: the Sheet reader, the server tick and
the ticker runtime are exactly main's.

- `e2e/fixtures/jev-sheet-server.mjs` (new): a local fake of Google's CSV export on loopback. It
  answers the two addresses the reader builds (export and published CSV) per Sheet and tab, with a
  mode per tab: `ok`, `deny` (403), `missing` (404), `error` (500), `signin` (an HTML sign-in page),
  `hang` (never answers) and `reset` (drops the connection). Malformed rows are the tab's own text.
  It counts every read. Node tests reach it through `fetchFor()`, browser specs through
  `routeTo()` (the page's request to Google's address is answered with what the fake answered),
  so the page, the tick and the Node reader read the same fake.
- `scripts/sheet-source.test.mjs`: three tests run the real reader on the real clock against the
  fake over HTTP, one per linked kind (a ticker's ordered lines, an imported credits list, a
  multiline value keyed by Field ID), and one env-gated probe of a controlled public Sheet.
- `scripts/data-tick.test.mjs`: one test runs the closed-page tick (built as Vercel builds it)
  against the fake over HTTP for all three kinds at once.
- `e2e/configured/production-data-key-tick.spec.ts`: a second test, on the configured stack's real
  database in Actions: every page closed, the tick meets each failure and the reconnect.
- `e2e/imported-text-live-data.spec.ts`, `e2e/imported-credits-live-data.spec.ts`: one failure walk
  each on the production page, through the fake.
- `e2e/ticker-linked-update.spec.ts` (new): native ticker continuity, judged from frame samples.

`scripts/ticker-speed.test.mjs`, `e2e/configured/production-data-key-sheet.spec.ts`: unchanged.
Their pins (speed-only change from that frame, flip boundary, marquee seam; the published Sheet
list through the operator door) already cover what this row would have added there.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Local fake endpoint: denial | Node reader (three kinds), tick, configured tick, text and credits browser walks: a 403 is said "can’t read it (not shared)" with its fix, writes nothing |
| Timeout | Same five: a read that never answers is cut (10 s in the browser and on the configured stack; the Node runs shorten the timer) and said "Google did not answer in 10 seconds" |
| Dropped connection, sign-in page, 500, 404 | Node reader: each said with its own error and fix, writes nothing. Tick and browser walks: reset and sign-in |
| Malformed rows | Node reader: a read cut inside a quoted cell writes its whole rows in order (the parser's documented tolerance); a credits role waiting for names stays in the native grammar; a keyed row without a usable Field ID is reported and writes nothing, and the field keeps its value. A sign-in page in place of cells is a failure (above) |
| Empty rows | Node reader and tick: an empty ticker tab, a credits tab with only its header row and an empty Value each write "" (clears); filled again, the rows return |
| Keep last-good data on failure | Every failure above: the written value, the row's tree (tick), the field on air (text), the prepared rows (credits) and the strip are the last good read's |
| Stale | Node reader and tick: three misses in a row and more mark the line stale with the time failing began; the next good read clears it |
| Reconnect | Node reader and tick: newer rows (reordered, one replaced, one removed) are written once, then nothing while unchanged. Browser: the newest lines reach the field on air (text) and the prepared rows, then the Take (credits). Pause/Resume: ticker spec 2, and row 24's text and credits journeys |
| Server takeover with every operator page closed, in Actions | `e2e/configured/production-data-key-tick.spec.ts` test 2, on the configured stack's real database (selected in this PR's CI): every page closed and the lease lapsed, the tick meets deny, hang, reset and sign-in, writes no update row, the row's status says why and goes stale; the next good read writes the newest lines once (then `unchanged`), and the reopened page shows a good read. Node tick test: the same for the three kinds, with a page holding every lease first (`leased`, nothing fetched) |
| Imported credits, ticker rows, multiline text | Each failure walk covers the three: Node reader and tick (adapters `credits`, `lines`, keyed values), browser text and credits walks, ticker spec |
| Content refresh preserves animation state | Text walk: the drawing's own motion keeps turning through every failure and the reconnect, `data-plays` stays 1. Credits: row 24's snapshot rules are unchanged (6/6 on this branch). Ticker spec below |
| No model request | Node reader: every request is the tab's export address. Tick: nothing but the three export addresses is fetched. Browser text and credits walks: no request to `/api/ai` or a model provider on any refresh |
| One controlled public-sheet probe, actual cadence | Below |
| Ticker: replace/reorder/delete while moving | `ticker-linked-update` 1 (marquee) and 3 (flip) |
| Speed-only change | Marquee: Scroll speed 200% through Update doubles the pace from that frame (ratio within 1.8 to 2.2), the items' nodes are not rendered again, no jump. Flip: the story on screen stays, the whole turns after it are under 0.65 of the measured turn |
| Empty then repopulate | Marquee and flip: an emptied tab clears the strip (no items); filled again it moves (marquee) or rotates (flip) without a Take, `data-plays` 1 |
| Reopen/reconnect | Ticker spec 2: Pause holds the strip, Resume reaches the running strip with the newest lines. Page closed, Sheet changed, page reopened: the reader catches up in the preview before anything airs; the Take airs the newest lines; a change after that reaches the running strip without another entrance |
| No unintended blank interval or entrance replay; empty intentionally clears | Marquee: in every frame of every window the strip holds items; `data-plays` stays 1. Flip: the longest gap with no story showing after each edit is no longer than the flip's own gap before any edit (+120 ms, about seven frames); never two stories at once; `data-plays` 1 |
| Marquee continuity (frame/time) | Each frame's x against the last: never further left than the pace allows (×1.25 plus 2 px), and back only by whole one-set widths (the seamless loop point, and the handover onto the new track at the same offset into a set); it keeps moving |
| Flip handover at its item boundary (frame/time) | The story whose turn was under way when an edit landed shows on for its whole measured turn (within 120 ms); a story still flipping in plays its whole turn too; the next story is from the new list; no story twice in a row |
| Linked multiline SVG field without resetting motion | Row 24's journey (unchanged) and the text failure walk |
| No imported-SVG ticker motion compiler | None added. A drawn ticker's message field shows the ordered rows as text (row 17); moving imported artwork stays a stated limit |

### The controlled public-sheet probe

`NOACG_SHEET_PROBE=1 node --test --test-name-pattern=probe scripts/sheet-source.test.mjs`, on this
cloud worker, 2026-11-02, against the first controlled synthetic Sheet named in the readiness file
(service-account access; "Anyone with the link" view, confirmed by its export answering signed out
for all six). The account added a temporary tab, edited one cell ten times and deleted the tab;
the probe confirmed it gone. Reads went through Google's public export address, as the page reads:

| Measure | Run 1: min / median / max | Run 2: min / median / max | n each |
|---|---|---|---|
| Edit to visible in the public export (100 ms poll) | 184 / 213 / 252 ms | 169 / 203 / 261 ms | 10 |
| The reader's interval between reads | 5000 / 5000 / 5002 ms | 4996 / 5001 / 5009 ms | 10 |
| Edit to written by the reader | 3541 / 4820 / 5577 ms | 4581 / 4829 / 4918 ms | 10 |

Both runs deleted their temporary tab and confirmed it gone; the second run (after the review
fixes) finds the tab by its title for the cleanup.

Each edit was made just after the reader's previous read (the probe waited for that read's
write), so edit-to-write sits near its worst case, one interval plus the export's lag. It is
inside the documented "about 5.9 s at worst" (`src/control/sheetSource.ts` header), and the
export's lag is shorter than the 441 to 1,011 ms measured on 2026-10-16.

## Mutations

Each applied to the source on this worker, run, and restored (tree clean after each):

- The reader's sign-in-page check removed (`sheetSource.ts`, a sign-in page read as cells): the
  three Node reader tests and the tick test fail; restored, they pass. The first version of the
  reader tests missed it (a sign-in failure's text matched the previous step's), so each step now
  waits for two reads under its own failure and matches the exact error.
- The marquee handover starting from the top of the new track (`tickerMarqueeHandover`,
  `into = 0`): marquee tests 1 and 2 fail ("back only by whole set widths", 608.9 px on a 937.5 px
  set).
- The flip handover dropping the story on screen (`tickerFlipHandover`, `showing = null`): the flip
  test fails at its first edit ("the story on screen kept its turn"). An earlier version caught it
  only at the third edit, because it took the landing time from its poll, after the story had
  gone; it now finds the landing frame in the samples.

## Verification on this worker

- `node --test scripts/sheet-source.test.mjs`: 44 pass, the probe skipped by default.
  `scripts/data-tick.test.mjs`: 14/14. The probe: above.
- Browser, through the job queue, on the final code: `e2e/imported-text-live-data.spec.ts` 2/2,
  `e2e/imported-credits-live-data.spec.ts` 7/7 and `e2e/ticker-linked-update.spec.ts` 3/3 in one
  run (j-0017). Before the simplify pass: the ticker spec 6/6 over two repeats (j-0015), the flip
  test alone 3/3 (j-0011).
- `npm run gates -- run --changed origin/main`: pass. `node scripts/check-e2e-protection.mjs
  --changed origin/main`: OK. `npx tsc --noEmit -p .` and `npx eslint` on the changed files: pass.
- `e2e/configured/production-data-key-tick.spec.ts` needs the configured stack: it runs in this
  PR's CI (configured selection), not here.

## Review rounds

- `/check` code review (delegated, 10 findings; 8 fixed, 2 kept):
  - Fixed: a sub-pixel move back no longer fails the marquee rule; the marquee rule also requires
    the window covered (x within one set) and no stall of a quarter second; the configured tick
    test's last step judged a page that could read the fake itself, so it now reads the row's
    status the tick wrote; the fixture answers a fault with a 500 instead of throwing in its
    handler, and `fetchFor` takes a `Request`; the Node walk writes the tab before its reader
    starts; the probe finds its tab by title for the cleanup; polls read the last frame or a
    window, not the whole history; the two live-data specs use the fixture's `csvOf`.
  - Kept: the connect steps repeated in four specs, and the failure table in two. A shared helper
    would be a new file outside this row's files; each copy is a few lines.
- `/simplify` (delegated, three reviewers: reuse, simplification, efficiency and altitude):
  - Applied: the fixture answers its canned failures from one table and drops two unused returns;
    it owns the page's Sheet route (`route(context)`, which also covers the published address), the
    page failure table and the model-request pattern, so the four specs stop copying them; the
    frame recorder reads opacity only for the flip; the configured tick test reads a tick's outcome
    through one helper and types its failure table; the Node tick test iterates its three kinds and
    holds the page as one flag; the Node walk waits for three reads instead of a sleep.
  - Skipped: a shared connect helper (a new file outside the row); building the HTTP reader on the
    fake-clock `tab()` helper and the HTTP tick on `world()` (each would bend a helper the older
    tests rely on); the probe reusing `production-page-keys.mjs`'s sign-in (not exported, outside
    the row); `serializeCsv` for the fixture (it writes CRLF and would bring a `src` import into a
    fixture the tick test loads without the TypeScript loader); moving the configured spec's first
    test onto the fake (that test is unchanged on purpose); the fixed observation windows in the
    ticker spec (they are how long the strip is watched, not waits for a state).
- Two checks added in that round met the browser's own timing: the marquee was judged during its
  entrance (it now waits until it travels), and a late frame split one flip turn in two (a turn
  now ends on a blank or another story, never on time).

## Decisions

- **Tests only.** Every criterion held on main's code; no failing reproduction was found, so no
  source owner was asked for a repair.
- **One fake for every reader.** The page, the Node reader and the tick read the same fake, so a
  failure means the same thing on each road. The browser specs route Google's address to it rather
  than pointing the app at another host: the reader builds the address itself and never fetches a
  pasted link.
- **Short intervals in Node, the real ones in the browser and Actions.** The 5-second cadence, the
  10-second cut and three-miss staleness are pinned on the fake clock already; the HTTP tests prove
  the failures over a real socket in seconds.
- **Reopen means the page closed.** An unpublished production's air is the page's own and ends with
  it (the header says "To: this page only"). The ticker's reopen therefore checks that the reader
  catches up before anything airs, that the Take airs the newest lines, and that updates after it
  keep continuity. A published output carrying on across a closed page is the output's own road,
  covered by the configured tick spec (data) and `hosted-control-recovery` (no duplicate play).
- **Speed-only through Update.** The operator's Scroll speed / Item speed field is not a Sheet
  value; Update with only that field changed is the speed-only change a running strip receives.
- **The probe is opt-in and prints no id.** It needs a credential no CI job carries, edits a
  controlled Sheet, and must never run unattended.

## Known limits

- A keyed row shorter than its header (no Value cell at all) reads as an empty Value and clears its
  field. Google's export pads every row to the tab's width, so only a hand-made CSV at a published
  address meets it; not pinned here.
- The flip's blank-gap bound is relative to its own measured gap (+120 ms), so a design whose flip
  leaves a longer gap is judged against itself.
- A drawn ticker still has no motion engine (rows 17 and 24); moving imported artwork stays out
  of scope.

## Traps met

- Editing a source file while a browser job runs against the same worktree's dev server reloads
  the page; on an unpublished production that ends the page's air, and every spec in flight fails
  with "Nothing on air". Run mutations only between browser jobs.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-25-build')"

Tests and a fixture only: a revert changes no product behaviour.
