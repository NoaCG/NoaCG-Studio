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

- **Design.** A graphic's `template` member as a split record stores it (put through
  `team_designs_put`), with its images and fonts replaced by Storage references (`withoutAssets`),
  always under their content names (`s256-` keys,
  G4 R20), whatever `partial_writes` says. So a design's body, and its name, never depend on a
  switch. The `s256-` path exists since G4; issue #2586 is a configured walk that pins the older key
  form, not a product fault.
- **Design name.** SHA-256 of the design's `jsonb` text as the database stores it, 64 lowercase hex
  characters, computed by the server:
  `encode(extensions.digest(convert_to(body::text, 'UTF8'), 'sha256'), 'hex')`. The page never computes one; it learns
  names from the server's answers.
- **Split record.** A team record in which some graphics carry `designRef: <design name>` in place of
  `template`. Everything else in the record is as today.
- **Whole record.** Today's record: every graphic carries its `template`.
- **Record form.** A new column `team_productions.doc_form smallint`: null means a whole record (every
  row today), 1 means a split record. It is the version of the stored form
  (`root/version-every-persisted-format-ship-breaking`). It follows from the content and nothing
  else: a `before insert or update of doc, doc_form` trigger on `team_productions` sets it to 1 exactly when
  the stored `doc` has a graphic with a `designRef`, else null, whatever the writer sent. The `Show`
  format in memory does not change: `version` stays 2.
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
`control_parts`. Deleting a production (the owner's delete, a team delete) removes its designs by the
cascade.

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
| `team_production_store(p_id, p_expected, p_doc)` | The compare-and-swap of `team_production_save` for a split record, marked requests only (an unmarked call raises `Reload this page to edit`), under the row lock. Order: lock the row; switch off: answer `off`; stale token: answer the record; a `designRef` naming no stored design of `p_id`: answer `missing` (the names, read before writing so the answer can list them); else write `p_doc` (the form trigger checks it again; any other form-trigger refusal, such as mixed content, raises and nothing is written). | `{saved: true, updated_at, updated_by, rev}`; `{saved: false, off: true, ...}`; `{saved: false, updated_at, updated_by, rev, doc, doc_form}`; `{saved: false, missing: [names], ...}`. Only the first writes. |
| `team_designs_state()` | Nothing. | `{installed: true, mark, on}`: `mark` is whether this request carried the designs mark, `on` the switch. |
| `team_production_unsplit(p_id)` | Service role only, for the revert (section 7): the whole record rebuilt from the split one, written like a save (the token and `rev` advance), `doc_form` null. | Whether it changed the row. |

**The form trigger is the one check of a split record's content.** `team_productions_doc_form`
(`before insert or update of doc, doc_form`, on every write route, service role and future
functions included; its function is `security definer`, so its probes of
`team_production_designs` work whoever writes) derives `doc_form` from the content (Terms). When the new `doc` has any
`designRef` it also requires that every graphic carries a `designRef`, none carries `template`, and
every name is a stored design of this production (at most one primary-key probe per graphic);
otherwise it raises `check_violation` and nothing is written. A new row has no designs yet (they
reference the row), so an insert, the move to a team included, can only be whole. Clients have no
UPDATE privilege on the table (0054). The functions below map that raise to their answers.

**Two existing functions, same signatures and answer shapes**, each now locking the row before any
check (0119's `for no key update`), so a form or token read cannot change under them:

- `team_production_save` (whole records). Unmarked request on a split row: raises
  `Reload this page to edit` (SQLSTATE `P0001`, the 0115 words and hint), before the token check,
  so no answer carries a split record to an old page. A `p_doc` with any `designRef` is refused
  (`check_violation`): this function writes whole records only. Marked request: as today, and the
  record it writes is whole (the trigger sets `doc_form` null). That is how a new page with the
  switch off turns a split record whole again.
- `team_production_patch` (the `partial_writes` path). Unmarked request on a split row: the same
  refusal, before the token check. It reads no switch. **A patch never changes a record's form:** for
  any request, a patched result whose form (by content: any `designRef` or none) differs from the
  stored row's answers `replaced` and writes nothing. A result the form trigger refuses (mixed
  content, a `template` in a split record, a name the production does not hold) answers `replaced`
  too. After `replaced` the page stores the record whole or split, as its reading of the switch
  says, so a page whose reading lags costs one extra round trip and nothing else.
- `team_production_units_set` (0119, the unit map after a whole or stored save): unchanged. It
  writes only at a matching `rev`; an old page never learns a split record's revision, and the map a
  new page sends for a split record is computed over the split form (section 3). The unit map it keeps describes the stored
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

**The publish guard (live-path).** A `before` trigger on `control_shows`, function
`control_shows_team_designs_guard()`, with its helpers named under the live-path prefix too
(`control_team_designs_marked()`, the mark; `control_team_record_split(uuid)`, the `doc_form`
probe), so any later change to the guard or its helpers is classified live-path by
`scripts/db-push.mjs` and waits for a quiet window. The trigger firing on the events and
columns of 0115's `control_shows_production_authoring_guard` (insert, delete, update of `output`,
`panel`, `title`, `profile`, `bindings`, `sources`, `collections`, a Pause or Resume passing) refuses
with `Reload this page to edit` an authenticated, unmarked API write for a production whose team
record is split. So an old page, which can no longer read the record it would publish from, cannot
replace a newer publication with what it holds, unpublish, or delete it. 0118 alone does not stop
this: its output guard drops a publish with an older `ver.r` silently, but lets a publish with no
`ver.r` land unless `auto_publish` is on (an old page's `storedRevision` read now fails, so its
`ver.r` can be missing), and an unpublish or delete carries no `ver` at all. Every
other write passes: Takes, reports, heartbeats, data writes (`control_events`, `control_heads`, the
`control_*` RPCs), new pages, the service role. It reads one `smallint` by primary key.

The migration sets its own timeouts, carries the `live-path:` header (the trigger on
`control_shows`), and self-checks by calling every route on a throwaway production (the list is in
section 8).

## 3. The new page

The `Show` in memory, the outbox, the three-way merge, Undo, publishing and the editor are
unchanged: they hold whole records. Only the trip to and from `team_productions` changes, in
`src/backend/teamProductions.ts`.

**Installed or not.** Team record fetches wait for the page's first `team_designs_state()` answer,
read when team sync starts. Only the answer that the function does not exist (PostgREST `PGRST202`,
HTTP 404) means "not installed"; any other failure is retried with the read backoff before team
fetches proceed. Once it has answered installed, the page remembers that for the session. Not
installed: the fetch selects today's columns, none new, so a page released before the migration is
applied (section 7) reads and saves team productions as today.

**Reading is decided by the data.** Once installed, the fetch also selects `doc_form`, and refusal
answers carry it. A value other than null or 1 is a later form: the read fails like a read error (R11) and
the page keeps its copy, read-only for that record until a build that knows the form
(`root/version-every-persisted-format-ship-breaking`). Whatever the page knows about installation or
the switch, every record it receives (the fetch, a refusal's `doc`) is made whole before anything
else sees it: each graphic with a `designRef` gets `template`
from the page's design cache (per production, name to body) and loses `designRef`, so the page
never holds both. The names the cache lacks are read with `team_designs_read`, per production, at
most 8 names per call (about 1.2 MB at the score's size), so a first load at 60 graphics is a few
short statements, not one 5 MB answer. Then the assets are put back as today (`withAssets`).
A graphic with `template` and no `designRef` is read as it is. A name the server does not answer,
or `team_designs_read` failing, fails the read as a read error does today: the page keeps what it
shows and says why. So a new page never holds a graphic without its design, whatever it knows about
the switch.

**Saving.** The page reads `team_designs_state()` when team sync starts and every 30 s with the
`partial_writes` state it already reads. Until a read answers, and while it answers off, saves are
whole through `team_production_save` (today's path; on a split row it makes the record whole). A
page without Web Crypto (`crypto.subtle` absent) always saves whole, as G4 R24 does for patches: it
cannot give images their content names, so it cannot make a design whose name is the same on every
page. Once
it answers installed and on, the page keeps that until a later read answers off. Splitting a save:

1. Each graphic's design is taken out with `withoutAssets` and looked up by its canonical JSON
   (keys sorted, the same function as G4's unit digests) in the page's known names for that
   production. Names are learned from reads (the canonical JSON of each body read) and from puts.
2. Designs with no known name go up through `team_designs_put` in batches of at most 1 MB of JSON
   (500 KB of UTF-8 since #2667; one design per call when a design alone is larger); the answers fill the known names. A design
   unchanged since the last save or read is never sent again.
3. The split record goes up: through `team_production_patch` when `partial_writes` is on and a base
   map for the split record exists (G4), else `team_production_store`. The unit map (G4) is always
   computed over the split record as sent, so a changed design patches in a graphic with a new
   `designRef`, never a `template`.
4. `missing`: those names are forgotten and the save repeats from step 2, once; a second `missing`
   saves whole. `off`: the switch
   went off; the save goes whole. `replaced`: as G4. A stale token: today's conflict; the answer's
   record is made whole (above) and merged as today.

A new page's first split save of a whole record puts every design and is the one save that
converts it. Records nobody saves again stay whole and keep loading.

**Moves and deletes.** Moving a personal production into a team inserts the whole record, as today
(the form trigger refuses anything else); its next split save converts it. The team owner's delete
removes the row and its designs by the cascade. (No verb moves a team production back to personal
today; one would delete the row the same way.)

**Connector tools.** `connectorTools.ts` reads a team production's graphics with the service role.
For graphics with a `designRef` it reads those designs' `fields` from `team_production_designs` in
the same request, so `noacg_library` answers what it answers today.

**Test helpers.** Configured specs and helpers that read or write `team_productions.doc` directly
(`e2e/configured/teams.spec.ts`, `_five.ts`, `publish-guard.spec.ts`, `connector-tools.spec.ts`) send the designs mark and
resolve designs, or read through the page, so none goes blind on a split row. Browser specs that mock
`/rest/v1/team_productions` (`e2e/sync-dot.spec.ts`, `e2e/rundown-history.spec.ts`) also answer
`rpc/team_designs_state`, with HTTP 404 `PGRST202` (not installed) or an installed answer, so the
fetch never waits on it.

## 4. Old and new pages at once

| Situation | What happens |
|---|---|
| Migration applied, switch off | Nothing visible changes. No row is split; the policy, the refusals and the publish guard never act. Old and new pages save and read whole. |
| Switch on, new page saves | The record becomes split. |
| Old page reads heads or records while a split row of its teams exists | The read fails: "Reload this page to edit". The heads poll is one query across all the account's teams, so one split row stops it for every team production on that page, split or not. The page keeps the records it holds and shows the note (`refreshOnce` keeps what is on screen on a read error). It receives no teammate's edit on any team production until it reloads. |
| Old page saves or patches a split record | Refused, "Reload this page to edit", nothing written. The edit stays on that page and in its device outbox; after a reload the new page restores and saves it, merged as today. |
| Old page publishes, unpublishes or deletes a production whose record is split | Refused, "Reload this page to edit", nothing written: a publish or unpublish, and the delete of a published production, by the publish guard on `control_shows` (the delete's first statement); the delete of a production never published, by the select policy on the `team_productions` delete (it filters with a WHERE and asks for the row back). Nothing is half deleted. |
| Old page Takes, reports, heartbeats, writes data | As today: the live path is untouched for these writes. The cue text it sends is the one it holds, so a cue a teammate edited on a new page airs with its older text from that old page until it reloads. |
| Old page saves or deletes a whole record | As today: a save that meets a teammate's newer whole save is refused and merged as today. With a split record in the same team, a by-id read or delete may still meet the split row's policy check and answer "Reload this page to edit" (section 8 records which). |
| Old page publishes a whole record a teammate has changed since the page last read it | Publish waits for the newer record (`confirmedRevision` answers `wait`), and the page cannot read it, so it says "Your latest change is still saving. Publish again in a moment." until it reloads. A whole record nobody changed since publishes as today. |
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
- **R3** No stored split record names a design its production does not hold: the form trigger
  checks every `designRef` on every write, and designs are deleted only with their production.
- **R4** A design's name is computed by the server from the stored body; a name always means one
  body. Designs are only added, never changed.
- **R5** `doc_form` is 1 exactly when the stored `doc` carries a `designRef`, on every write route
  (the form trigger). A record changes form only through `team_production_store` (to split: marked,
  switch on), `team_production_save` (to whole) or, for the revert, `team_production_unsplit` (to
  whole); a patch never changes a record's form. An insert, a
  `team_production_save` and a patch of a whole record never store a `designRef`. No migration
  rewrites a stored record.
- **R6** An old page is never handed a split record: every table read that includes one, and every
  `team_production_save` or `team_production_patch` call on one, raises "Reload this page to edit"
  before answering, and writes nothing.
- **R7** An old page cannot write a split production's record or its publication: saves, patches,
  publishes, unpublishes and deletes are refused with the same words; its Takes, reports,
  heartbeats and data writes pass.
- **R8** A new page sends a design only when no name for it is known from this production's reads
  and puts: after a reload, a cue edit sends no design, whatever `partial_writes` says (designs are
  keyed by content names always).
- **R9** The compare-and-swap is unchanged: a store lands only on the expected token under the row
  lock, the token advances strictly, and a stale token writes nothing and answers the current record
  in its stored form, with `doc_form` and the token.
- **R10** With the switch off, before the page has read it on, or without Web Crypto, a new page
  saves whole through today's path, and that save makes a split record whole.
- **R11** A new page never holds a graphic without its design, nor a record of a form it does not
  know: a read with `doc_form` other than null or 1, or that cannot resolve every
  `designRef` changes nothing on the page and reports a read error.
- **R12** Clients have no privilege on `team_production_designs`; only members of the production's
  team read or add its designs, through the functions; a suspended account does neither.
- **R13** Every guard and trigger a whole save meets today (0115 guard, 0117 revision, the
  membership and suspension checks) acts on a split save the same way.
- **R14** The live path changes only by the publish guard, which refuses nothing but an unmarked
  authenticated write of a split production's publication; every Take, report, heartbeat, data
  write, output read and renderer path is unchanged.
- **R15** The page puts at most 1 MB of JSON, or one design, per call, and reads at most 8 designs
  per call (a page rule; the server limits only a body to 40 MB). Since #2667 the page batches at
  most 500 KB, counted in UTF-8 bytes; a single larger design still goes alone, as before.
- **R16** In a stored split record every graphic carries a `designRef` and none a `template`, on
  every write route (the form trigger); so a design change on a split record keeps it split.

## 6. Decisions and limits

- **Content names by the server, not the page.** The server hashes the stored body, so a member
  cannot store a body under another body's name, and the page and server can never disagree on a
  name. (The page still needs Web Crypto for its images' content names: without it, it saves whole.)
- **Per production, not per team.** Simpler access and cleanup, at the cost of storing a design
  once per production that uses it.
- **A switch, off until the coordinator turns it on** (section 7), as G1 and G4 did. Off is also the
  instant back-out: no new record is split, and every new save makes its record whole again.
- **Old pages stop reading** every team production of the account's teams once one record of
  those teams is split, and say "Reload this page to edit". For the same reason they cannot publish
  a whole team production a teammate changed since they last read it (they say the change is still
  saving, until reload); their whole saves still merge as today. Their Takes keep working with the text
  they hold, so an old operator page left open can air a cue's older text after a teammate edits it
  on a new page. This extends G1's "old pages only play out" to reads; the coordinator accepted it
  for the owner (run issue #2361, 2026-11-20). There is no server-side check that no old page is
  open: request headers are not logged. So the owner turns the switch on only after asking
  operators to reload their pages, in a quiet window, and a page opened after the release is never
  old.
- **No pruning in this fix.** A design no record names any more stays until its production is
  deleted. It grows by one design per design change (85 to 146 KB), the bytes one whole save writes
  today; a graphic's rename changes `template.name` and so stores a new design too. A prune, like
  0120's for parts, is filed as a follow-up issue with the measured growth, together with a cap on a
  production's design bytes.
- **Refusals still carry the record**, now kilobytes. Issue #2615 changes refusals to the token only;
  whichever lands second takes the other's form, through the coordinator.
- **The conversion save is as large as today's whole save**, split into puts of at most 1 MB, then a
  kilobyte store. Each put is its own short statement, so the 8 s limit is met per put. While
  `partial_writes` is off, team images are stored under the older key form; a record's first split
  save uploads each of its images and fonts once more under its content name (`s256-`). That counts
  against the team's Storage quota (0106); an image that will not upload stays inline in its design,
  which then stays as large as today. Nothing is lost; the bytes are measured (section 8).

## 7. Migration, release, switch and revert

**Migration** `supabase/migrations/NNNN_team_designs.sql`, the next free number at the final rebase
(0121 if nothing else lands first). Additive: one table, one nullable column with no default (no
table rewrite), one restrictive policy that passes every row while `doc_form` is null (every row
today), one trigger on `control_shows` that refuses nothing while no record is split, new
functions, and the bodies of `team_production_save` and `team_production_patch` replaced with the
same signatures and answers plus the checks above. It rewrites no stored data. **Live-path** (the
trigger on `control_shows`): only the coordinator applies it, in a quiet window (post-land holds a
live-path file until then; the coordinator applies it with `npm run db:push -- --live NNNN` or lets
the next quiet post-land run apply it, as the coordinator decides). It sets
`lock_timeout = '2s'` and `statement_timeout = '30s'`.

**Order.**

1. Before the code PR lands: a CORS preflight (`OPTIONS`, no data, no key) to the production REST
   address naming `x-noacg-team-designs` answers it allowed (G1 section 6 step 1), and the
   configured spec shows a marked browser request reaching the local stack's database. If either
   fails, the app does not land.
2. The code PR lands; the app is released. It works without the migration: until
   `team_designs_state()` answers on, it saves whole, and it reads either form.
3. The coordinator applies the migration in a quiet window (above).
4. **Turning the switch on is the owner's step** in production (staging and local may turn it on
   for testing). Before it: a new page on production reports the mark through
   `team_designs_state()`, operators have reloaded their pages, and no production is on air. Then,
   as the service role: `insert into public.system_settings (key, value) values ('team_designs',
   '{"on": true}') on conflict (key) do update set value = excluded.value`.

   **What turning it on does.** Within 30 s each new page starts saving team productions split: the
   first save of each record puts its designs (in batches) and stores a kilobyte record; every later
   cue edit sends kilobytes. A page opened before the release then shows "Reload this page to edit"
   and stops receiving teammates' edits (section 4). Nothing else changes: personal productions,
   publishing, outputs and Takes are as before.

   **Turning it off**, instantly: `update public.system_settings set value = '{"on": false}' where
   key = 'team_designs'`. New pages read it within 30 s, stop splitting, and make each record whole
   on its next save. Split records stay readable by new pages; nothing is lost. Old pages stay
   locked out of a team until its last split record is whole again (step 2 of the revert does that
   at once).

**Revert**, by the coordinator, in this order:

1. Switch off (above), and wait 30 s for open pages to read it.
2. As the service role, one row per statement: `select public.team_production_unsplit(id)` for each
   `id` in `select id from public.team_productions where doc_form is not null`. Each is written
   whole like a save (the token advances, so a page holding the split token merges on its next
   save rather than act on a stale base).
3. Redeploy the previous app if wanted. Its pages read whole records as today.
4. A migration, applied by the coordinator in a quiet window with
   `npm run db:push -- --allow NNNN --live NNNN` (it drops, and it names `control_shows`), that first
   raises if any `doc_form` is not null, then drops the publish trigger and its functions, the
   policy, the form trigger, the new functions and `team_production_designs`, and restores 0117's `team_production_save` and 0119's `team_production_patch`.

It keeps the column `doc_form` (nullable, null in every row after step 2): pages opened before the
revert still select it, and dropping it would fail their reads. A later cleanup drops it once no
released page selects it.

Step 2 loses nothing: every split record names only stored designs (R3), and step 4 refuses to drop
anything while one is split.

## 8. How it is tested and measured

**Tests.**

- A reference-model test (`scripts/`, Node, pure) of the page's side: a small model written from
  section 3 and section 4's table (record form, switch, known names, operation, token) gives the
  expected requests and the page's resulting record, and a fake server answers as section 2 says,
  over random sequences of saves, design changes, switch flips, refusals and reads, including a
  state call that fails (other than "absent") while split records exist. It checks the page's
  rules: R1, R8, R10 (a page without Web Crypto included), R11 (an unknown `doc_form`
  included) and R15. It does not reuse the production split, read or merge
  code, and it proves nothing about the SQL: the server's rules (R3 to R7, R9, R12 to R14) are
  proven only by the self-check and the configured spec below.
- Round trip: split then read over the phase 8 fixtures and a 60-graphic record equals the whole
  record (R1, R2).
- The migration's self-check calls every route on a throwaway production, as a signed-in member,
  with and without the mark (claims and `request.headers` set), switch on and off, and undoes it:

  | Route | Asserted | Rule |
  |---|---|---|
  | `team_designs_put`, `team_designs_read` | names are the server's SHA-256; same body twice is one row; read answers only stored names | R4 |
  | privileges on `team_production_designs` | `anon` and `authenticated` hold none (absence asserted) | R12 |
  | each new function as a suspended account, and as a non-member | refused | R12 |
  | `team_production_store` | unmarked: refused; switch off: `off`; stale token: record and `doc_form`, nothing written; unknown name: `missing`, nothing written; on its token: written, `doc_form` 1, token and `rev` advance, the 0115 guard and 0117 trigger run | R3, R9, R13 |
  | `team_production_patch` | unmarked on split: refused; marked on a whole row with the switch on: `replaced`; result naming an unknown design: `replaced`; whole row turned wholly split (names stored), marked and unmarked: `replaced`; split row gaining a `template`: `replaced`; on its token: written | R3, R5, R6, R16 |
  | `team_production_units_set` | a split record's map kept only at its `rev` | R5 |
  | the form trigger directly (service role update) | split doc naming an unknown design, or one graphic with `template`: refused | R3, R16 |
  | `team_production_save` | unmarked on split: refused before the token check; a `p_doc` with `designRef`: refused; marked whole save of a split row: `doc_form` null | R5, R6, R10 |
  | insert into `team_productions` | a `doc` with `designRef`: refused; `doc_form` sent as 1: stored null | R5 |
  | the select policy | unmarked API read of a split row: refused; of a whole row: as today; marked: read | R6, R2 |
  | the publish guard | unmarked publish, unpublish, delete of a split production: refused; a Pause, a heartbeat (`output_seen_at`) and a live cue write: pass; marked: pass | R7, R14 |
  | `team_production_unsplit` | the whole record back, `doc_form` null, token advanced | revert |

- `scripts/db-push.test.mjs`: this migration is classified live-path, and so is a later file that
  only replaces `control_shows_team_designs_guard` or one of its `control_` helpers.
- A new page against a database without this migration reads and saves team productions as today
  (the model test, with `team_designs_state` absent; and the configured suite's existing team walks,
  which run before the switch is on).
- The connector tools: `e2e/configured/connector-tools.spec.ts` gains a split team record (designs
  stored through the functions), and `noacg_library` answers that production exactly as it answers
  the same record whole (names, fields, cues).
- The configured suite, extended in `e2e/configured/teams.spec.ts`, against the real database with
  the switch on: two new pages edit one 6-graphic team production and each sees the other's cue
  edits (R1); the stored record is split (R5); its graphics carry base64 images, so the image round
  trip through Storage is part of what R8 checks; after a reload a cue edit makes no
  `team_designs_put` call (R8); after a graphic's design changes, the stored graphic carries a new
  `designRef` and no `template` and the next cue edit makes no `team_designs_put` call (R16, R8);
  requests without the designs mark, as an old page makes them, get
  "Reload this page to edit" on the heads poll (including another team's whole production in the
  same query), the record read, save, patch, publish and delete of that production, and a Take
  from them lands (R6, R7, R14); with a split sibling present, an old page's by-id operations on a
  whole production are recorded as they behave (the planner may visit the split row first; either
  way the page says "Reload this page to edit", within the owner's decision); a marked browser request reaches the database (section 7).

**Measured on the local stack, before and after**, with the phase 9 diagnosis instrument at 6 and
60 graphics: bytes sent per cue-edit save, bytes written to the database per save (WAL bytes), save
time p50 and p95 with one writer and seven writers, bytes returned by refusals, and the conversion
save, with the asset bytes the conversion uploads and team Storage before and after. Also the
phase 8 five-person scene and the seven-typist scene with no lost edit. Recorded in
`../evidence/fix-2614.md`. The hosted staging run (`hosted-latency.yml` with the same instrument)
is the coordinator's, after the migration is on staging: this fix only measures locally.

**What an owner check should look for.** With the switch on, open a team production with many
graphics in two browsers and edit cues in both: each sees the other's edits within a poll, and the
saving note clears quickly. Update a graphic's design in one: the other shows the new design after
its next poll. A page left open from before the update says "Reload this page to edit".
