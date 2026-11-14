# Phase 7 evidence: only what changed, each image once

Design: `designs/G4.md` (graded A by an independent /so; PR #2525). Acceptance: the design's grade,
and AC-5. Everything else below is measured and reported, not phase 7 acceptance.

## Judging rules, fixed before any result was read

- **AC-5** (G4 section 11): on the automatic path, a 2 kB cue edit's save and publish together send
  and receive under 20 kB in the counted families (preflights included), the same image is never
  uploaded twice, a design update sends one part, and the parts path leaves the row, the record and
  every output exactly as the whole path would (R23). The configured check asserts each.
- **AC-4 on the large fixture (reported):** the same rule phase 6 used on the typical fixture. The
  pooled p95 difference of Take timing (automatic updates on minus off) over all pairs, interleaved
  on then off, passes at 50 ms or less. Bootstrap range, per-pair values and slow-Take counts are
  reported beside it. Production build with the harness hooks, local stack, test `autopublish`,
  `MEASURE_EDIT=cues`, 5 s edit pace, one output, unthrottled, parts on for both sides.
- **The loop where every edit changes content (reported):** the same pairs with `MEASURE_EDIT=labels`,
  so every save changes what the outputs show and every publish sends a new head.
- **#2509 (reported):** the large fixture at a 1 s edit pace, parts on: publishes made, the newest
  save published at the end or not, and Take p95.
- **D1 (reported):** a Take of a brand-new graphic on the large fixture, throttled (`MEASURE_NET=slow`),
  edit to output holding it, against the 5 s ceiling; phase 6 read 30 to 33 s whole.

Everything below ran on the cloud worker (4 CPUs, 13.4 GiB) against the local Supabase stack
(127.0.0.1, accounts `e2e-s1@noacg.local` and its teammate) with 0119 and 0120 applied on top of
`main`. Measurements use a production build made with the harness hooks (`VITE_MEASURE_HOOKS=1`).

## What was built

- `supabase/migrations/0119_record_patches.sql` (ordinary): unit maps beside each production record
  (`documents.body_units`, `team_productions.doc_units`), the patch apply (`unit_patch_apply`,
  revision-checked, a shape it cannot take refused), `documents_show_patch` (invoker),
  `team_production_patch` (definer, the checks of `team_production_save`), the map setters,
  `partial_writes_on` and `partial_writes_state`.
- `supabase/migrations/0120_publication_parts.sql` (live-path): `published_head` and
  `published_units` on `control_shows`; `control_parts` and `control_assets` (no client privilege);
  `control_publish_parts` (invoker, its one write the final `UPDATE`); the image, part and panel-entry
  functions; the output reads `control_output_head`, `control_output_parts`, `control_output_assets`;
  the daily prune.
- Page: `src/backend/unitPatch.ts` (units, digests, the diff and the apply), `src/backend/partialWrites.ts`
  (the switch, the pace, the revision a save answered), saves as patches in
  `supabaseProvider.ts` and `teamProductions.ts`, images by content name, `src/control/publishParts.ts`
  (the publish in parts and its answers), `publishRevision.ts` and `hostedControl.ts` on it.
- Output: `src/output/payloadReader.ts` reads the head, then only the parts and images it lacks, in
  its worker, keeping two versions; `&wholeread=1` reads whole for the harness.

## AC-5

**Pass.** Judged on the automatic path (coordinator, recorded on #2361), on a personal production,
by the rule above.

### Large fixture, production build (`e2e/configured/measure/baseline.measure.ts`, test `parts`)

60 graphics, 10 MB of images, 42 cues. Counted bytes are the families G4 section 11 names, both
ways, headers and CORS preflights included, plus the WebSocket frames the page sent. The page's
fixed-period reads (the team refresh, the audience list, `panel_list`, the log tail, the switch
reads, the renderer heartbeat and the publisher's 30 s revision check) are reported, not counted.
Final code (job j-0133):

| Edit | Counted | Everything the page sent and received | What the publish sent |
|---|---|---|---|
| A 2 kB cue text edit | **14.5 kB** | 44.9 kB | the cue (2.6 kB) |
| The first edit after a reload | **17.5 kB** | 76 kB | the cue and 4 cues whose measured box was not ready yet |
| A graphic removed | **9.4 kB** | 85 kB | the removals |
| A design update | 191 kB | 245 kB | that graphic once as a part (86 kB) and in the record patch (86 kB); no image |
| A graphic added, new image | 535 kB | 593 kB | the image once (put), the graphic, its panel entry (76 kB) |
| A graphic added, same image | 262 kB | 338 kB | no image put; the graphic and its panel entry |
| The first publish after the fixture's own press | 32 kB | 78 kB | 38 cues gaining their measured `adjust.box`, which the fixture's press did not wait for (a real change, once) |

Before the fixes this phase made while measuring, the cue edit counted 23.7 kB (the sync listing of
every document, 12.7 kB, on every save) and the first edit after a reload 6.5 MB (the whole stored
panel, which carries every graphic's script). See "Departures" below.

### Configured check (`e2e/configured/publish-guard.spec.ts`, "only what changed is sent, each image once")

Passes (jobs j-0097, j-0130, j-0139, j-0146, and j-0161 with the final review's repairs). On a smaller personal production:

- a 2 kB cue edit, save and publish together: 13.3 kB counted, under 20 kB; the save is
  `documents_show_patch`, the publish `control_publish_parts`; the new output reads the head and no
  graphic;
- the same image again: no `control_asset_put`, no Storage upload; the output reads one new part and
  no image;
- a design update: the save carries that graphic only; the publish one part; the output reads that
  part and only its new image;
- R23 after the first publish, the cue edit, the same image again, the design update and the press:
  the row equals what the whole path writes (stamp included), the stored record equals the page's
  after rehydration, and the new output's payload, composed by the test from the head, parts and
  images, equals `control_output_resolve`'s (the reader's own composition is covered by
  `scripts/output-parts.test.mjs`); for the team production, the record only;
- issue #779 with parts on: a teammate publishes new saved entries for a graphic this page's library
  does not hold; this page's next automatic publish, whose own last publish is now stale, keeps
  theirs (with the restart removed, the step fails: job j-0162);
- a stale head written by an older page, then a Publish press: the press goes in parts and `output` is
  recomposed from the parts;
- a team production: saves go as `team_production_patch`, the record equals the page's, a publish
  (pressed) goes in parts; two edits and a publish counted 302 kB over 21 requests with every team read included (reported): 257 kB of it is one whole `team_production_save`, the first save after the production moved to the team, which has no unit map yet; the edits after it go as patches.

### The press path (reported)

Automatic updates off, the page reopened, a 2 kB cue edit, then Publish changes pressed:

| Fixture | Counted | Made of |
|---|---|---|
| Large (j-0153) | 20.4 kB | the edit's save (3.8 kB), the press's own bookkeeping save of `publishedAt` and `publishedRecord` (3.9 kB), the two sync listings those saves start (5.6 kB), the publish (6.0 kB), frames (1.1 kB) |
| Typical (j-0148) | 19.9 kB | the same requests |

The cost over the automatic path is the press's second save and its listing, about 6 kB. Removing it
means changing what a press records, which is not a small, safe change here; the press path stays
about at 20 kB.

The first Publish of a production creates its row and writes whole (G4 section 4). The first publish
in parts after it therefore uploads every graphic and image once (G4's one-time upload): 8.5 MB on the
typical fixture, 21 MB of images on the large one. Runs that measured a kind in that window show it
(typical job j-0148's cue edit); the judged rows above come after it.

## Measured and reported, not phase 7 acceptance

Rules fixed before results, as above.

- **AC-4 timing on the large fixture**, 10 interleaved pairs at 5 s edits, parts on both sides, 250
  Takes a side, no failed Take: on p50 106, p95 315, p99 686 ms; off p50 88, p95 191, p99 262 ms.
  **Pooled p95 difference +125 ms**, over the 50 ms rule (bootstrap 5 to 95 %: +39 to +349 ms).
  Per pair: +62, +490, -14, +120, +352, +39, +367, -87, +286, +36. Slow Takes (150 ms or more) 60
  against 30. Phase 6 read +334 ms on this fixture.
- **Every edit changes content** (`MEASURE_EDIT=labels`), 5 pairs: pooled p95 difference +48 ms
  (bootstrap -6 to +122 ms); per pair -6, +59, +387, +111, -99.
- **#2509, a 1 s edit loop on the large fixture**: 55 edits, no publish while editing continues,
  Take p95 219 ms, no failed Take. Unchanged by this phase: a publish waits for a pause in editing
  (owner decision (a), phase 6).
- **D1, a brand-new graphic on the large fixture, throttled**: published 7.0 s after the edit, an
  output reading parts holds it at 7.6 s, an output reading whole at 16.6 s (phase 6: 30 to 33 s). Over
  the 5 s ceiling.
- **Publish time**: a cue edit publishes 6.1 s after the edit on the large fixture, of which the
  sync pause is most.

## Checks

- Migrations on the local stack: 0119 and 0120 apply, and their self-checks pass, calling each
  function: a record patch on its base and on another, a refused shape, a team record's map, patch
  and refused patch (without the document back), a whole head, a patch over it, a stale head, a part
  name held for another body (`part_conflict`), the switch off, an image another production stored
  answered missing, panel entries of one graphic, and the prune removing an unused part and image and
  keeping the head's. A mutation of the team step fails the migration.
- Node tests: `unit-patch` (7), `output-parts` (5), `publication-parts-migration` (5),
  `publish-parts` (1, mutation-checked: without the fix a sound reference is put as an image),
  `supabase-provider-list` (7, the incremental listing over a changing table), the tests touching
  the changed modules (829 pass), `db-push.test.mjs` (64).
- Gates: `node scripts/gates.mjs run`, `tsc`, `eslint`, `depcruise` pass. `test:ai-gateway` failed once
  while measurements loaded the machine and passed alone (520). `svg-import-passes` fails 4 corpus
  records on this worker on `main` too.
- Output code: `scripts/check-output-reader.mjs` after a build: 27 modules parse on Chromium 71.
- `publish-guard.spec.ts`, the other tests, with `partial_writes` off as CI runs them: pass: the
  first seven in j-0131, "a page that may not publish" in j-0134, the OBS-scene test in j-0145 (twice)
  and "reverse order" in j-0154. The OBS-scene test and the AC-5 check each failed at an output's first load for
  about twenty minutes after a Chrome crash in a measurement on this worker (j-0136, j-0137, j-0141,
  j-0142), and passed in every run after (j-0139, j-0143 to j-0146); `main` passed it in the same
  window (j-0140). With it on, the race test that intercepts the whole-path `PATCH` sees no such write, by
  design; the parts path's race is covered by the AC-5 check.

## The final review's repairs (independent /so, B at 9ed8fd93)

- A part's images are read from its body on the server (`control_parts_put`), never from the
  caller's list: a part could otherwise name another account's image by its hash and read it through
  composition, and the prune could delete an image a body names. The self-check tries it.
- `control_parts` and `control_assets` are in the advisor baseline (deny-all, reached only through
  the functions).
- A publish whose stand-in (this page's own last publish) turned out stale starts again from a fresh
  read, so a teammate's newer saved entries are not replaced by this page's old copy (#779).
- The listing is read in pages of 1000 (the server's `max_rows`), so a large account loses no
  summary; a test runs 2100 rows.
- The 0120 self-check runs as the first account that may publish, and checks `control_may_publish`
  against the row policy's rule for an owner, a stranger and a team member.
- A whole save with parts off reads its body back exactly as before this phase (CI found a mocked
  backend that answered only `body`).

Not changed: a size cap on part bodies (images stay capped at 40 MB a put; an unnamed part is pruned
within about a day), and the account-wide `control_may_publish` search in the image checks.

## Departures from G4's wording

- **The sync listing is incremental with parts on** (coordinator's conditions, #2361): the cursor is
  the server's `updated_at` with a 60 s overlap; another page's edit, rename and soft delete show on
  the next pass; a row deleted outright is gone at the next full listing, at most 10 minutes later
  (and at once after this page's own purge or removal); a failed read drops the held rows and lists in
  full.
- **The publication's base is read when the page opens** (the stamp, its scenes, the panel entries a
  publisher lacks), as G4 already does for the maps, so the first edit after a reload reads nothing.
- **The stored panel is read as entries only** (`control_panel_entries`, added to 0120).
- **A press that names no saved revision reads the stored stamp**: its older-design check is judged
  against what is stored.
- **The publisher's 30 s revision check reads `rev` in a query of its own**, so the count tells it
  from a save's read.
- **The production page measures every graphic's box from the moment it opens**, not only inside a
  publish, so a reload does not drop boxes it published before (#2532 keeps them across reloads).

## Follow-ups

#2532 (boxes across a reload), #2533 (stop writing the inline output), #2534 (pull only changed
units), #2535 (a local order dependence of the AC-2 test, on `main` too); #2502 covers the team
production's automatic publish, which did not run in the AC-5 team step.
