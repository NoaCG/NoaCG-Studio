# G5: The team record without its designs

Design for issue #2614, a fix in the live-publishing plan run (run issue #2361). Cause 1 of the
phase 9 load diagnosis (`../evidence/phase-9-load-diagnosis.md`): a team production's record
carries every graphic's full template, so every save sends and rewrites megabytes. Written against
`main` at ea9af89 (migrations to 0120), on top of G1 (old pages only play out), G3 (the saved
revision `rev`), G4 (patches, content-named parts). Nothing here is built yet; the build is the
next pull request.

## Today

- A team record (`team_productions.doc`) holds the production's pool, each graphic with its
  `template`: about 85 KB for a lower third, 146 KB for the score, after images and fonts have left
  it for Storage (`withoutAssets`, migration 0106). Cues and settings add about 12 KB in all.
  6 graphics: 0.58 MB; 60: 5.12 MB (2.1 MB stored after compression).
- Every save sends the whole record (`team_production_save`), or a patch that the server applies to
  the whole stored value and writes back whole (`team_production_patch`, 0119). The row triggers
  (`production_revision_next`, `production_authoring_guard`) copy the whole row.
- A refused save answers the whole stored record; the page merges and saves the whole record again,
  up to four times.
- Every open page reads the heads every 15 s and then the whole record of any production a teammate
  saved.
- Cost, linear in size: 57 ms (6) to 296 ms (60) per save on the local stack; 0.6 to 7.2 s on
  hosted staging, past the 8 s statement limit with two writers at 60 graphics.

What changes per save is almost never a design: a cue's text, its order, a setting. A design
changes when someone updates or adds a graphic.

## Terms

- **Design.** A graphic's `template` member as the team record stores it today: the object with
  its images and fonts already replaced by Storage references (`withoutAssets` with strong keys).
- **Design name.** SHA-256 of the design's `jsonb` text as the database stores it, 64 lowercase hex
  characters, computed by the server (pgcrypto `digest`). The page never computes one: it learns
  names from the server's answers.
- **Split record.** A team record whose pool graphics carry `designRef: <design name>` in place of
  `template`. Everything else in the record is as today.
- **Whole record.** Today's record: every graphic carries its `template`.
- **Record form.** A new column `team_productions.doc_form smallint`: null means a whole record (every
  row today), 1 means a split record. It is the version of the stored form
  (`root/version-every-persisted-format-ship-breaking`). The `Show` format in memory does not
  change: `version` stays 2.
- **New and old pages.** A page built with this fix, or before it. A new page adds the header
  `x-noacg-team-designs: 1` to its REST API requests (the **designs mark**), beside G1's
  `x-noacg-production-copies: 1`. Old pages send no designs mark. The server-side connector tools
  (`api/_lib/me/connectorTools.ts`) are deployed with the app and count as new.

## 1. What is stored

```
team_production_designs
  production_id  uuid  references team_productions(id) on delete cascade
  name           text  (design name)
  body           jsonb (the design)
  bytes          int
  created_at     timestamptz
  primary key (production_id, name)
```

One row per distinct design per production, written once and never updated. Row level security on,
no policy, no privilege for `anon` or `authenticated`: every read and write goes through the
functions below, which run with the owner's rights and check the caller first, as 0120 does for
`control_parts`. Deleting a production (owner delete, move back to personal, a team delete) removes
its designs by the cascade.

Scope is the production, not the team, so a design is only ever readable by whoever can read the
record that names it, and nothing crosses productions. A design used by two productions is stored
twice; that is 85 KB per production, against today's 85 KB per save.

## 2. The server

All functions are `security definer`, `set search_path = ''`, and open with the checks
`team_production_save` makes today: signed in, not suspended, the production exists, the caller is
a member of its team (`is_team_member`). Each is granted to `authenticated` only.

| Function | Does | Answers |
|---|---|---|
| `team_designs_put(p_id, p_bodies jsonb)` | Stores each body (a JSON object, at most 40 MB as text) under the name it computes, `on conflict do nothing`. | The names, in the order sent. |
| `team_designs_read(p_id, p_names text[])` | Reads the named designs of that production. | `[{name, body}]` for those stored; a name not stored is left out. |
| `team_production_store(p_id, p_expected, p_doc)` | The compare-and-swap of `team_production_save` for a split record. Before writing, every `designRef` in `p_doc.graphics` must name a stored design of `p_id`. Sets `doc_form = 1`. | Accepted: `{saved: true, updated_at, updated_by, rev}`. Stale token: `{saved: false, updated_at, updated_by, rev, doc, doc_form}`. A name not stored: `{saved: false, missing: [names], updated_at, rev}`, nothing written. |
| `team_designs_state()` | Nothing. | `{installed: true, mark: <designs mark present>}`. A page that cannot call it treats the fix as not installed. |
| `team_production_unsplit(p_id)` | Service role only, for the revert (section 7): writes the whole record back from the split one and sets `doc_form` null. | Whether it changed the row. |

Two existing functions get one check each, same signatures, same answers otherwise:

- `team_production_save`: on a row whose `doc_form` is not null it raises
  `Reload this page to edit` (SQLSTATE `P0001`, the 0115 words and hint) and writes nothing. Only
  old pages call it on such a row: a new page with the fix installed saves through
  `team_production_store`.
- `team_production_patch` (the `partial_writes` path): on a split row, an unmarked request is
  refused the same way. On a whole row, a marked request answers `replaced` and writes nothing, so a
  new page converts a record only with a whole `team_production_store`. On a split row, a marked
  patch is applied as today and then every `designRef` of the result must name a stored design;
  otherwise it answers `replaced` and writes nothing. The unit map it keeps describes the split
  record, so a cue edit patches kilobytes.

And one restrictive row policy on `team_productions` for `select`:

```
using (doc_form is null or public.team_record_readable(team_id))
```

`team_record_readable` returns true when the request carries the designs mark or is not an API
request (`request.headers` unset: migrations, cron, definer callers), false when the caller is not
a member of the row's team (the permissive policy hides that row anyway), and otherwise raises
`Reload this page to edit` (`P0001`). So an old page's read that would include a split row fails as
a whole instead of handing the page a record without designs, and every old-page statement that
reads such a row (the heads poll, the record fetch, `readTeamBase`, a delete with `returning`)
fails the same way. `rev` readers that run as definer (`control_record_rev`, 0118) are unaffected.

Nothing here names a `control_*` object, `realtime.messages`, or changes `is_suspended`,
`feature_denied`, `is_team_member`, `set_updated_at` or `production_authoring_guard`: the migration
is not live-path. It sets its own timeouts and self-checks by calling every function on a throwaway
production, then deletes it.

## 3. The new page

The `Show` in memory, the outbox, the three-way merge, Undo, publishing and the editor are
unchanged: they hold whole records. Only the trip to and from `team_productions` changes, in
`src/backend/teamProductions.ts`.

**Installed or not.** The page calls `team_designs_state()` when team sync starts and on each 30 s
state read it already makes for `partial_writes`. Not installed: today's whole saves and reads,
exactly. The migration lands before or with the app (section 7), and the page works with either.

**Reading.** With the fix installed the fetch also selects `doc_form`. A whole record (`doc_form`
null) reads as today. A split record (`doc_form` 1) is made whole on read: each `designRef` is
looked up in the page's design cache (per production, name to body) and only the names it lacks are
read with `team_designs_read`, in one call per fetch. Each graphic gets `template` from that body
and loses `designRef`; then the assets are put back as today (`withAssets`). Any other `doc_form`,
or a name the server does not answer, fails the read as a read error does today: the page keeps
what it shows and says why. A graphic that still carries `template` and no `designRef` is read as it
is, so a record is never refused for being partly whole.

**Saving.** With the fix installed every save of a team production is split:

1. Each graphic's design is taken out with `withoutAssets` (strong keys), as today, and looked up
   by its canonical JSON text in the page's known names for that production (filled by reads and by
   earlier puts).
2. Designs with no known name go up in one `team_designs_put`; the answer fills the known names.
   A design that is unchanged since the last save or read is never sent again.
3. The split record goes up: through `team_production_patch` when `partial_writes` is on and a base
   map for the split record exists (G4), else through `team_production_store`.
4. `missing` (a design the server does not hold for this production) forgets those known names and
   repeats from step 2, once. A stale token is today's conflict: the answer's record is made whole
   (step 'Reading') and merged as today.

A new page's first save of a whole record is a `team_production_store` with every design put: the
one save that converts the record. Records that are never saved again stay whole and keep loading.

**Unchanged design, other representation.** If the database's text of a design differs from the
page's canonical JSON (for example a number written differently), the page does not recognise it
and puts it again; the server names it the same and stores nothing new. The cost is bytes, never a
wrong design.

**Moves.** Moving a personal production into a team inserts the whole record, as today (a design
row needs its production row first); its next save splits it. Moving it back to personal deletes
the row (designs go with it) and writes the whole record the page holds, as today.

**Connector tools.** `connectorTools.ts` reads a team production's graphics with the service role
(no row policy). For a split record it reads the named designs' `fields` from
`team_production_designs` in the same request, so `noacg_library` answers what it answers today.

## 4. Old and new pages at once

| Situation | What happens |
|---|---|
| Migration applied, every page old | Nothing visible changes. No row is split, so the new policy and checks never act. Old pages save and read as today. |
| New page saves a whole record | It becomes split. Old pages that can read it see the next row (below). |
| Old page reads heads or records while a split row of its team exists | The read fails with "Reload this page to edit". The page keeps the records it holds and shows that note (`refreshOnce` keeps what is on screen on a read error). Takes, reports and data writes go to `control_*` and keep working. |
| Old page saves or patches a split record | Refused, "Reload this page to edit", nothing written. The edit stays on that page and in its device outbox; after a reload the new page restores and saves it, merged as today. |
| Old page saves a whole record | As today. |
| Old page publishes | As today: it publishes from the whole record it holds. G3's guard (0118) keeps a publication from going back to an older saved revision. |
| New page reads a whole record an old page saved | Read as today; the next new save splits it again. |
| New and new | As today, with kilobyte records. A refusal hands back the split record, made whole by reading only missing designs. |
| Connector tool reads either form | Same answer as today. |

An old page is never given a split record: every route that hands an old page a record (the table
read, a refusal answer of `team_production_save` or `team_production_patch`) either raises on a
split row or never reaches one. That is how this fix keeps G1's rule: an old page only plays out,
and never shows, saves or publishes a production without its designs.

## 5. Rules

Observable lines, each checked by a test named in section 8.

- **R1** A split record names each graphic's design by `designRef`; reading it gives the page exactly
  the whole record the same save would have stored today: for every record r a page saves,
  read(store(r)) equals r after `withAssets`.
- **R2** A whole record (`doc_form` null) is read exactly as today, by new and old pages.
- **R3** The server never stores a split record naming a design it does not hold for that
  production: `team_production_store` and `team_production_patch` check every `designRef` and write
  nothing otherwise.
- **R4** A design's name is computed by the server from the stored body; a name always means one
  body. Designs are only ever added, never changed; they go only with their production.
- **R5** A record becomes split only through a marked `team_production_store`; nothing else sets
  `doc_form`, and no migration rewrites a stored record.
- **R6** An old page (no designs mark) is never handed a split record: its table reads that include
  one fail with "Reload this page to edit", and its save and patch of one are refused with the same
  words, writing nothing.
- **R7** An old page keeps saving, patching and reading whole records as today while no split row of
  its teams exists.
- **R8** A new page sends a design only when no name for it is known from this production's reads
  and puts; a cue edit sends no design.
- **R9** The compare-and-swap is unchanged: a store lands only on the expected token, the token
  advances strictly, and a stale token writes nothing and answers the current record in its stored
  form, with `doc_form` and the token.
- **R10** A new page with the fix not installed saves and reads exactly as today.
- **R11** A read that cannot make the record whole (unknown `doc_form`, a name not answered) changes
  nothing on the page and reports a read error; the page never holds a graphic without its design.
- **R12** Clients have no privilege on `team_production_designs`; only members of the production's
  team read or add its designs, through the functions, and a suspended account does neither.
- **R13** Every guard and trigger a whole save meets today (0115 guard, 0117 revision, the
  membership and suspension checks) acts on a split save the same way.
- **R14** Nothing on the live path changes: no `control_*` object, output, renderer or Take path is
  touched.

## 6. Decisions and limits

- **Content names by the server, not the page.** The page never hashes a design, so a page without
  Web Crypto (G4 R24) splits too, and a member cannot store a body under another body's name.
- **Per production, not per team.** Simpler access and cleanup, at the cost of storing a design
  once per production that uses it.
- **No pruning in this fix.** A design no record names any more stays until its production is
  deleted. It grows by one design per design change (85 to 146 KB), the bytes one whole save writes
  today. A prune, like 0120's for parts, is filed as a follow-up issue with the measured growth.
- **No new switch.** The fix acts once the migration and the app are both in, as G4's patches act
  once installed. Turning it back is section 7. The switches `auto_publish`, `partial_writes` and
  `production_copies` are not touched.
- **An old page stops seeing teammates' edits** on its teams' productions once one of them is split,
  and says "Reload this page to edit". This is G1's rule (old pages only play out, section 4 of G1)
  applied to reads as well: the other choice hands it a record without designs. Pages are only old
  across a deploy.
- **Refusals still carry the record**, now kilobytes. Issue #2615 changes refusals to the token only;
  whichever lands second takes the other's form, through the coordinator.
- **Measured, not promised.** The goal is kilobytes per cue edit at 6 and 60 graphics; section 8
  says how it is measured.

## 7. Migration, release and revert

**Migration** `supabase/migrations/NNNN_team_designs.sql`, the next free number at the final rebase
(0121 if nothing else lands first). Additive: one table, one nullable column with no default (no
table rewrite), one restrictive policy that passes every row while `doc_form` is null (every row
today), five new functions, and two existing function bodies replaced with the same signatures and
answers plus one check each. It rewrites no existing data. Not live-path. It sets
`lock_timeout = '2s'` and `statement_timeout = '30s'`.

**Order.** The migration applies before the app relies on it. The app built for this works without
it (R10): until `team_designs_state()` answers, it saves and reads as today. So the code PR carries
the migration, the landing applies it to production through `post-land.yml`, and pages start
splitting records once both are in. The coordinator applies it (`npm run db:push`, or post-land),
never the builder.

**Revert**, in this order, by the coordinator:

1. Redeploy the previous app build. Its pages are old: on teams with a split record they show
   "Reload this page to edit" until step 2.
2. For every split row, `select public.team_production_unsplit(id) from public.team_productions
   where doc_form is not null` as the service role. Each record is written back whole (a write the
   revision trigger numbers, like any save), `doc_form` null. Old pages read and save it as today.
3. Then, in a migration: drop the policy, the five new functions, `team_production_designs` and
   the column `doc_form`, and restore 0119's `team_production_patch` and 0117's
   `team_production_save`.

Step 2 loses nothing: every split record names only stored designs (R3). Doing step 2 before step 1
also works, but a new page may split a record again between the two.

## 8. How it is tested and measured

**Tests.**

- A reference-model test (`scripts/`, Node, pure): a small model written from section 4's table and
  R3, R5, R6, R9 (row form, page kind, operation, token) to the expected answer and stored state,
  run against the client's store protocol with a fake server built from the same model, over random
  sequences of saves, design changes, refusals and old-page writes. It checks R1, R3, R5, R6, R8,
  R9 and R11. The model does not reuse the production split or merge code.
- Round trip: split then read over the phase 8 fixtures and a 60-graphic record equals the whole
  record (R1, R2).
- The migration's self-check calls every function on a throwaway production: put, read, store with
  a missing name, store, stale token, the old-page refusals with and without the mark, the policy on
  a split row, unsplit (R3 to R7, R9, R12, R13).
- The configured suite, extended in `e2e/configured/teams.spec.ts`: two new pages edit one 6-graphic
  team production and each sees the other's cue edits; the stored record is split; a request
  without the designs mark gets "Reload this page to edit" on read and save of that row.

**Measured on the local stack, before and after**, with the instrument of the phase 9 diagnosis at
6 and 60 graphics: bytes sent per cue-edit save, bytes stored, save time p50 and p95 with one writer
and seven writers, bytes returned by refusals. Also the phase 8 five-person scene and the
seven-typist scene, with no lost edit. Recorded in `../evidence/fix-2614.md`.

**What an owner check should look for.** Open a team production with many graphics in two browsers,
edit cues in both: each sees the other's edits within a poll, and the saving note clears quickly.
Update a graphic's design in one: the other shows the new design after its next poll.
