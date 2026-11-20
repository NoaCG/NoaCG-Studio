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
  its images and fonts replaced by Storage references (`withoutAssets`, with the same key choice
  the whole save makes today, so no new asset path is used).
- **Design name.** SHA-256 of the design's `jsonb` text as the database stores it, 64 lowercase hex
  characters, computed by the server (pgcrypto `digest`). The page never computes one; it learns
  names from the server's answers.
- **Split record.** A team record in which some graphics carry `designRef: <design name>` in place of
  `template`. Everything else in the record is as today.
- **Whole record.** Today's record: every graphic carries its `template`.
- **Record form.** A new column `team_productions.doc_form smallint`: null means a whole record (every
  row today), 1 means a split record. It is the version of the stored form
  (`root/version-every-persisted-format-ship-breaking`) and is set only by the server, by the
  function that wrote the record. The `Show` format in memory does not change: `version` stays 2.
- **Designs mark.** The header `x-noacg-team-designs: 1`, which a page built with this fix adds to
  its REST API requests beside G1's `x-noacg-production-copies: 1` (same place, `answeredFetch`).
- **New and old pages.** A page built with this fix (it sends the designs mark), or before it. The
  server-side connector tools (`api/_lib/me/connectorTools.ts`) are deployed with the app and read
  with the service role.
- **The switch.** A `system_settings` row, key `team_designs`, value `{"on": true}`. Absent or
  anything else is off. Read by pages through `team_designs_state()` and by the server functions.

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

Scope is the production, not the team: a design is readable only by whoever can read the record
that names it, and nothing crosses productions. A design used by two productions is stored twice.

## 2. The server

All new functions are `security definer`, `set search_path = ''`, and open with the checks
`team_production_save` makes today: signed in, not suspended, the production exists, the caller is
a member of its team. Each is granted to `authenticated` only, and recorded as a meant definer grant
in `supabase/advisor-baseline.json`.

| Function | Does | Answers |
|---|---|---|
| `team_designs_put(p_id, p_bodies jsonb)` | Stores each body (a JSON object, at most 40 MB as text) under the name it computes, `on conflict do nothing`. | The names, in the order sent. |
| `team_designs_read(p_id, p_names text[])` | Reads named designs of that production. | `[{name, body}]` for those stored. |
| `team_production_store(p_id, p_expected, p_doc)` | The compare-and-swap of `team_production_save` for a split record, under the row lock. Order: lock the row; switch off: answer `off`; stale token: answer the record; a `designRef` naming no stored design of `p_id`: answer `missing`; else write `p_doc`, `doc_form = 1`. | `{saved: true, updated_at, updated_by, rev}`; `{saved: false, off: true, ...}`; `{saved: false, updated_at, updated_by, rev, doc, doc_form}`; `{saved: false, missing: [names], ...}`. Only the first writes. |
| `team_designs_state()` | Nothing. | `{installed: true, mark, on}`. |
| `team_production_unsplit(p_id)` | Service role only, for the revert (section 7): the whole record rebuilt from the split one, written like a save (the token and `rev` advance), `doc_form` null. | Whether it changed the row. |

**Two existing functions, same signatures and answer shapes**, each now locking the row before any
check (0119's `for no key update`), so a form or token read cannot change under them:

- `team_production_save` (whole records). Unmarked request on a split row: raises
  `Reload this page to edit` (SQLSTATE `P0001`, the 0115 words and hint), before the token check,
  so no answer carries a split record to an old page. Marked request: as today, and the record it
  writes is whole, so it sets `doc_form` null. That is how a new page with the switch off, or a
  revert, turns a split record whole again.
- `team_production_patch` (the `partial_writes` path). Unmarked request on a split row: the same
  refusal, before the token check. Marked request: patches only a row whose form is the one the
  switch calls for (split while on, whole while off); any other row answers `replaced`, writing
  nothing, and the page then stores whole or split. On a split row the patched record's every
  `designRef` must name a stored design, else `replaced`. The unit map it keeps describes the stored
  form, so on a split record a cue edit patches kilobytes.

**The read policy.** One restrictive policy on `team_productions`, `for select to authenticated`:

```
using (doc_form is null or public.team_record_readable(team_id))
```

`team_record_readable` (definer, EXECUTE granted to `authenticated`, because a policy expression
runs with the querying role's privileges) returns true for a marked request or a statement that is
not an API request (`request.headers` unset: migrations, cron), false for a row of a team the caller
is not in (the permissive policy hides it anyway), and otherwise raises `Reload this page to edit`.
Every statement an old page makes that reads a split row (the heads poll, the record fetch,
`readTeamBase`, `storedRevision`, any update or delete with a WHERE clause) fails that way, as a
whole, so an old page is never handed a split record. Definer functions (`control_record_rev`,
0118, and those above) are not subject to it because their owner owns the table, which has no
`force row level security`; the service role bypasses row security.

**The publish guard (live-path).** A `before` trigger on `control_shows`, firing on the events and
columns of 0115's `control_shows_production_authoring_guard` (insert, delete, update of `output`,
`panel`, `title`, `profile`, `bindings`, `sources`, `collections`, a Pause or Resume passing), refuses
with `Reload this page to edit` an authenticated, unmarked API write for a production whose team
record is split. So an old page, which can no longer read the record it would publish from and
would publish without `ver.r`, cannot replace a newer publication, unpublish, or delete it. Every
other write passes: Takes, reports, heartbeats, data writes (`control_events`, `control_heads`, the
`control_*` RPCs), new pages, the service role. It reads one `smallint` by primary key.

The migration sets its own timeouts, carries the `live-path:` header (the trigger on
`control_shows`), and self-checks by calling every function on a throwaway production: put, read,
store missing, store, stale token, switch off, the old-page refusals with and without the mark, the
policy on a split row, the publish guard, unsplit.

## 3. The new page

The `Show` in memory, the outbox, the three-way merge, Undo, publishing and the editor are
unchanged: they hold whole records. Only the trip to and from `team_productions` changes, in
`src/backend/teamProductions.ts`.

**Reading is decided by the data.** Every record a new page receives (the fetch, a refusal's
`doc`) is made whole before anything else sees it: each graphic with a `designRef` gets `template`
from the page's design cache (per production, name to body), and the names the cache lacks are read
with `team_designs_read`, one call per fetch. Then the assets are put back as today (`withAssets`).
A graphic with `template` and no `designRef` is read as it is. A name the server does not answer,
or `team_designs_read` failing, fails the read as a read error does today: the page keeps what it
shows and says why. So a new page never holds a graphic without its design, whatever it knows about
the switch.

**Saving.** The page reads `team_designs_state()` when team sync starts and every 30 s with the
`partial_writes` state it already reads. Until a read answers, and while it answers off, saves are
whole through `team_production_save` (today's path; on a split row it makes the record whole). Once
it answers installed and on, the page keeps that until a later read answers off. Splitting a save:

1. Each graphic's design is taken out with `withoutAssets` and looked up by its canonical JSON
   (keys sorted, the same function as G4's unit digests) in the page's known names for that
   production. Names are learned from reads (the canonical JSON of each body read) and from puts.
2. Designs with no known name go up through `team_designs_put` in batches of at most 1 MB of JSON
   (one design per call when a design alone is larger); the answers fill the known names. A design
   unchanged since the last save or read is never sent again.
3. The split record goes up: through `team_production_patch` when `partial_writes` is on and a base
   map for the split record exists (G4), else `team_production_store`.
4. `missing`: those names are forgotten and the save repeats from step 2, once. `off`: the switch
   went off; the save goes whole. `replaced`: as G4. A stale token: today's conflict; the answer's
   record is made whole (above) and merged as today.

A new page's first split save of a whole record puts every design and is the one save that
converts it. Records nobody saves again stay whole and keep loading.

**Moves.** Moving a personal production into a team inserts the whole record, as today; its next
split save converts it. Moving it back to personal deletes the row (designs go with it) and writes
the whole record the page holds, as today.

**Connector tools.** `connectorTools.ts` reads a team production's graphics with the service role.
For graphics with a `designRef` it reads those designs' `fields` from `team_production_designs` in
the same request, so `noacg_library` answers what it answers today.

**Test helpers.** Configured specs and helpers that read `team_productions.doc` directly
(`e2e/configured/teams.spec.ts`, `_five.ts`, `publish-guard.spec.ts`) send the designs mark and
resolve designs, or read through the page, so none goes blind on a split row.

## 4. Old and new pages at once

| Situation | What happens |
|---|---|
| Migration applied, switch off | Nothing visible changes. No row is split; the policy, the refusals and the publish guard never act. Old and new pages save and read whole. |
| Switch on, new page saves | The record becomes split. |
| Old page reads heads or records while a split row of its teams exists | The read fails: "Reload this page to edit". The page keeps the records it holds and shows the note (`refreshOnce` keeps what is on screen on a read error). It no longer receives teammates' edits until it reloads. |
| Old page saves or patches a split record | Refused, "Reload this page to edit", nothing written. The edit stays on that page and in its device outbox; after a reload the new page restores and saves it, merged as today. |
| Old page publishes, unpublishes or deletes a production whose record is split | Refused by the publish guard, "Reload this page to edit", nothing written. Its delete stops at the first statement (`control_shows`), so nothing is half deleted. |
| Old page Takes, reports, heartbeats, writes data | As today: the live path is untouched for these writes. The cue text it sends is the one it holds. |
| Old page saves, publishes or deletes a whole record | As today. |
| New page reads either form, or a refusal carrying either form | Made whole on read (section 3). |
| New page saves with the switch off | Whole; a split record becomes whole again. |
| New and new, switch on | Kilobyte records; a refusal hands back the split record, made whole by reading only missing designs. |
| Connector tool reads either form | Same answer as today. |

Every route that hands an old page a record (a table read, a refusal answer of
`team_production_save` or `team_production_patch`) raises on a split row before it returns, and every
route by which an old page writes the production's record or publication is refused on a split
row. That is G1's rule (old pages only play out) applied to reads as well: the other choice hands
an old page a record without designs.

## 5. Rules

Observable lines, each checked by a test named in section 8.

- **R1** Reading a record a new page stored gives the page exactly the whole record it stored: for
  every record r, read(store(r)) equals r after `withAssets`, split or whole.
- **R2** A whole record (`doc_form` null) is read exactly as today, by new and old pages.
- **R3** No stored split record names a design its production does not hold:
  `team_production_store` and `team_production_patch` check every `designRef` under the row lock
  and write nothing otherwise, and designs are deleted only with their production.
- **R4** A design's name is computed by the server from the stored body; a name always means one
  body. Designs are only added, never changed.
- **R5** A record becomes split only through a marked `team_production_store` with the switch on;
  only the function that writes a record sets its `doc_form`, to the form it wrote; no migration
  rewrites a stored record.
- **R6** An old page is never handed a split record: every table read that includes one, and every
  `team_production_save` or `team_production_patch` call on one, raises "Reload this page to edit"
  before answering, and writes nothing.
- **R7** An old page cannot write a split production's record or its publication: saves, patches,
  publishes, unpublishes and deletes are refused with the same words; its Takes, reports,
  heartbeats and data writes pass.
- **R8** A new page sends a design only when no name for it is known from this production's reads
  and puts: after a reload, a cue edit sends no design.
- **R9** The compare-and-swap is unchanged: a store lands only on the expected token under the row
  lock, the token advances strictly, and a stale token writes nothing and answers the current record
  in its stored form, with `doc_form` and the token.
- **R10** With the switch off, or before the page has read it on, a new page saves whole through
  today's path, and that save makes a split record whole.
- **R11** A new page never holds a graphic without its design: a read that cannot resolve every
  `designRef` changes nothing on the page and reports a read error.
- **R12** Clients have no privilege on `team_production_designs`; only members of the production's
  team read or add its designs, through the functions; a suspended account does neither.
- **R13** Every guard and trigger a whole save meets today (0115 guard, 0117 revision, the
  membership and suspension checks) acts on a split save the same way.
- **R14** The live path changes only by the publish guard, which refuses nothing but an unmarked
  authenticated write of a split production's publication; every Take, report, heartbeat, data
  write, output read and renderer path is unchanged.
- **R15** A design put carries at most 1 MB of JSON, or one design.

## 6. Decisions and limits

- **Content names by the server, not the page.** The page never hashes a design, so a page without
  Web Crypto (G4 R24) splits too, and a member cannot store a body under another body's name.
- **Per production, not per team.** Simpler access and cleanup, at the cost of storing a design
  once per production that uses it.
- **A switch, off until the coordinator turns it on** (section 7), as G1 and G4 did. Off is also the
  instant back-out: no new record is split, and every new save makes its record whole again.
- **Old pages stop reading split productions** and say "Reload this page to edit"; their Takes keep
  working with the text they hold. This extends G1's "old pages only play out" to reads; asked of the
  coordinator for the owner (run issue #2361). Pages are only old across a deploy, and the switch
  goes on only in a quiet window after the release.
- **No pruning in this fix.** A design no record names any more stays until its production is
  deleted. It grows by one design per design change (85 to 146 KB), the bytes one whole save writes
  today. A prune, like 0120's for parts, is filed as a follow-up issue with the measured growth.
- **Refusals still carry the record**, now kilobytes. Issue #2615 changes refusals to the token only;
  whichever lands second takes the other's form, through the coordinator.
- **The conversion save is as large as today's whole save**, split into puts of at most 1 MB, then a
  kilobyte store. Each put is its own short statement, so the 8 s limit is met per put.

## 7. Migration, release, switch and revert

**Migration** `supabase/migrations/NNNN_team_designs.sql`, the next free number at the final rebase
(0121 if nothing else lands first). Additive: one table, one nullable column with no default (no
table rewrite), one restrictive policy that passes every row while `doc_form` is null (every row
today), one trigger on `control_shows` that refuses nothing while no record is split, new
functions, and the bodies of `team_production_save` and `team_production_patch` replaced with the
same signatures and answers plus the checks above. It rewrites no stored data. **Live-path** (the
trigger on `control_shows`): the coordinator applies it in a quiet window. It sets
`lock_timeout = '2s'` and `statement_timeout = '30s'`.

**Order.**

1. Before the code PR lands: a CORS preflight (`OPTIONS`, no data, no key) to the production REST
   address naming `x-noacg-team-designs` answers it allowed (G1 section 6 step 1), and the
   configured spec shows a marked browser request reaching the local stack's database. If either
   fails, the app does not land.
2. The code PR lands; the app is released. It works without the migration: until
   `team_designs_state()` answers on, it saves whole, and it reads either form.
3. The migration is applied in a quiet window (post-land holds a live-path file until one).
4. The switch is turned on by the coordinator after a new page on production reports the mark
   through `team_designs_state()`, in a quiet window: `insert into system_settings (key, value)
   values ('team_designs', '{"on": true}') on conflict (key) do update set value = excluded.value`.

**Back out**, instantly: set the switch off. New pages read it within 30 s, stop splitting, and make
each record whole on its next save. Nothing is lost: split records stay readable by new pages.

**Revert**, by the coordinator, in this order:

1. Switch off (above), and wait 30 s for open pages to read it.
2. As the service role, one row per statement: `select public.team_production_unsplit(id)` for each
   `id` in `select id from public.team_productions where doc_form is not null`. Each is written
   whole like a save (the token advances, so a page holding the split token merges on its next
   save rather than act on a stale base).
3. Redeploy the previous app if wanted. Its pages read whole records as today.
4. A migration that first raises if any `doc_form` is not null, then drops the publish trigger and
   its function, the policy, the new functions, `team_production_designs` and `doc_form`, and
   restores 0117's `team_production_save` and 0119's `team_production_patch`.

Step 2 loses nothing: every split record names only stored designs (R3), and step 4 refuses to drop
anything while one is split.

## 8. How it is tested and measured

**Tests.**

- A reference-model test (`scripts/`, Node, pure): a small model written from section 4's table and
  R3, R5, R6, R9, R10 (row form, switch, page kind, operation, token) to the expected answer and
  stored state, run against the client's store protocol with a fake server built from the same
  model, over random sequences of saves, design changes, switch flips, refusals and old-page writes.
  It checks R1, R3, R5, R6, R8 (in the model), R9, R10, R11 and R15. The model does not reuse the
  production split, read or merge code.
- Round trip: split then read over the phase 8 fixtures and a 60-graphic record equals the whole
  record (R1, R2).
- The migration's self-check (section 2) and `scripts/db-push.test.mjs` for the live-path header.
- The configured suite, extended in `e2e/configured/teams.spec.ts`, against the real database with
  the switch on: two new pages edit one 6-graphic team production and each sees the other's cue
  edits; the stored record is split; after a reload a cue edit makes no `team_designs_put` call
  (R8); a request without the designs mark gets "Reload this page to edit" on reading, saving and
  publishing that production (R6, R7); a marked browser request reaches the database (section 7).

**Measured on the local stack, before and after**, with the phase 9 diagnosis instrument at 6 and
60 graphics: bytes sent per cue-edit save, bytes written to the database per save (WAL bytes), save
time p50 and p95 with one writer and seven writers, bytes returned by refusals, and the conversion
save. Also the phase 8 five-person scene and the seven-typist scene with no lost edit. Recorded in
`../evidence/fix-2614.md`. The hosted staging run (`hosted-latency.yml` with the same instrument)
is the coordinator's, after the migration is on staging: this fix only measures locally.

**What an owner check should look for.** With the switch on, open a team production with many
graphics in two browsers and edit cues in both: each sees the other's edits within a poll, and the
saving note clears quickly. Update a graphic's design in one: the other shows the new design after
its next poll. A page left open from before the update says "Reload this page to edit".
