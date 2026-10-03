# Live-safe updates: nothing NoaCG ships interrupts a show

Answers the owner's decisions of 2026-10-02 and 2026-10-03 in
[`backlog/migrations-while-productions-are-live.md`](../../backlog/migrations-while-productions-are-live.md),
and, once built, settles
[`backlog/live-path-quiet-window-never-comes.md`](../../backlog/live-path-quiet-window-never-comes.md)
and
[`backlog/vite-assets-without-skew-protection.md`](../../backlog/vite-assets-without-skew-protection.md).
Serves `docs/GOALS.md` outcome 5 (production and playout, rank 1) and its reliability bar. It
replaces derived decision D7 of
[`playout-runtime-reliability`](../playout-runtime-reliability/spec.md) (the heartbeat quiet window)
and keeps that spec's D6 (old and new functions side by side) and AC-17 (old pages and outputs keep
working). Design only: nothing here is built yet.

It began as a spec for database migrations and was widened on 2026-10-03 to every update NoaCG
ships: a migration, a web deploy, and a Bridge, CLI or Companion module release. The folder keeps
its name because migration 0075, `docs/RUNDOWN_AUTOMATION_PLAN.md` and a handoff cite the path. What
platform behaviour is not settled by a primary source is filed in
[`backlog/live-safe-updates-open-platform-questions.md`](../../backlog/live-safe-updates-open-platform-questions.md).

## Problem

Production starts the week of 2026-10-05. From then on an update that interrupts playout is a
broken show. Today's mechanism (`scripts/db-push.mjs`, `supabase/AGENTS.md` "Live-path migrations
wait for a quiet window") has five gaps, each found while writing this spec at `fa0347180`:

1. **The quiet window never comes.** Quiet means no `control_shows.output_seen_at` in ten minutes,
   and a renderer left open heartbeats every 60 s around the clock. 0068 was held three times on
   2026-09-30; 0072 was applied by hand with `--live` on 2026-10-01 with a production still live.
   On 2026-10-03 at 07:01 UTC post-land run 37104930020 held 0074 on production for one
   renderer heartbeat (production `49d26e78-...`) while staging applied the same file in under a
   second. A heartbeat says a page is open, not that anybody is operating, and any wait for quiet
   makes a person the real gate.
2. **One hold blocks everything after it.** `liveHold` holds the first live-path file "and
   everything after it, because the ledger has no gaps", so a file that waits also stops every
   later feature migration.
3. **`lock_timeout` bounds the wait, not the hold.** Each file is one transaction, so the
   strongest lock it takes on `control_events`, `control_shows` or `realtime.messages` is held
   until the file commits, under a 30 s `statement_timeout`. A table rewrite, a non-concurrent
   index, a constraint validation, or the self-check `do` block `supabase/AGENTS.md` asks for,
   placed after that lock, stalls every Take for as long as it runs. And while the file waits for
   the lock, every conflicting request queues behind it, so a Take can lose the wait and the hold
   together.
4. **The live path is a name prefix, not what clients call.** `LIVE_PATH_PREFIX = 'control_'`.
   The Companion module calls `panel_hello`, `panel_pair_finish` and `panel_press` during a show
   (`companion-module/src/relay.ts`), and the production page calls `panel_release`; a later
   `create or replace function panel_press` would not be live-path. 0073 was only classed live
   because it also added foreign keys to `control_shows`.
5. **"Additive" is judged on statements, not on what old clients see.** A drop and re-create of a
   function in one file counts as safe, so a changed signature or return shape passes the loss
   guard. A new overload of an existing RPC name adds and removes nothing, yet PostgREST then
   answers an old caller's named-argument call with an ambiguity error (PGRST203). Applied to
   `control_output_seen`, that would silence every old renderer's heartbeat.

Widening to every update adds three more, found on 2026-10-03 at `358cb5035`:

6. **An open page's next asset after a deploy is a 404.** Vercel Skew Protection is active on the
   project, but the Vite build never sends the deployment id, so an old deployment's hashed chunk
   answers 404 on `noacg.studio` and 200 with `?dpl=<id>` (`docs/PLAYOUT_ISOLATION_RESEARCH.md`
   §5.5, measured 2026-09-29; 7 production deploys went live that day). The output renderer loads
   supabase-js as a lazy chunk (`src/backend/supabase.ts:35`), the App loads `import('./App')` and
   several editor chunks, and nothing pins any of them.
7. **The newest deploy answers every unhashed request, whatever build asks.** `/fonts/*` (fetched
   by every graphic frame, `src/model/fonts.ts`), `/panel.json` (read by the Companion module,
   `companion-module/src/relay.ts:43-55`) and the `/api` routes an open production page calls
   (`/api/events`, `/api/data/state`, `/api/data/patch`) come from whichever deployment is current.
   A deploy that renames a font file or changes a route's request shape breaks an older open page.
8. **A deploy can cut off a running Bridge.** The page refuses a Bridge older than `MIN_PLAYOUT_V`
   as "outdated" (`src/control/playoutLink.ts:54,444-452`), and `MIN_PLAYOUT_V = PLAYOUT_V`, so
   every protocol bump in a deploy disconnects every older Bridge at an operator page's next load,
   mid-show.

## Owner requirements (binding)

From the owner's decision of 2026-10-02 (the backlog item's "Decision" section):

- Automatic, with no approval in the normal case. Updating NoaCG must not be able to interrupt
  anybody using Playout, and the owner never coordinates a maintenance window.
- A normal deployment applies, by itself, only migrations that are safe on a live production
  database and compatible with the code and the outputs running at that moment.
- Removing or renaming anything happens only in a later cleanup migration, once no current code or
  output version depends on it.
- A manual emergency override exists and is never the normal path.
- Neither "additive is always safe" nor "no output reporting means safe to remove" may be the only
  guarantee.

From the owner's ruling of 2026-10-03, which replaces the 2026-10-02 rule that a cleanup also
waits for verified quiet: "Perfect if we don't have to wait for a quiet moment ... Half a second
lag I'm sure anyone can handle. But this matters for all website/db updates. Nothing should ruin a
show." So:

- No update waits for a quiet moment, and no user ever presses a rehearsal or live button.
- Safety comes from the update itself: an update may delay a live action by at most half a
  second (a lower limit is allowed, a higher one is not), and retries later when it cannot stay
  inside that.
- Removals wait only for the proof that nothing running still depends on them, never for quiet.
- The same holds for web deploys and client updates, not only the database.

## Derived decisions (revertible; each says how to revert)

### The database

- **L1. The live surface is what live clients call, and it only grows until a cleanup.** It is
  every RPC, table, column and Realtime topic prefix referenced from the code the live pages run
  (the output renderer, the production page, the hosted control page, the Bridge's `/bridge`
  page) and from the Companion module, plus the server-side objects those reach, including the
  tables and RPCs the `/api` routes of L11 use: today's `LIVE_PATH_PREFIX`, `LIVE_PATH_TABLES`
  and `LIVE_PATH_FUNCTIONS` stay as that server half. The build derives the client half from
  source over `main`'s history, not from the head alone, so a name a new build stopped calling
  stays in the surface while older clients may still call it, and leaves only through a
  *cleanup*. A new call joins without anyone editing `db-push`. Revert: back to the prefix lists
  alone.
- **L2. Every migration touching the surface declares one of three kinds**, in its header:
  `-- live-path add: <what>`, `-- live-path change: <what>` or
  `-- live-path cleanup: <what>; unused since <commit>`.
  - *add*: only new names no running client can call (a new function name, table, column, topic
    prefix or permissive policy on a new topic). A foreign key from a new table to a surface table
    is an *add* only when it is `on delete cascade` or `on delete set null` and references a key no
    client updates (the primary key): it installs action triggers on the referenced table, and
    with `no action` or `restrict` an old client's delete of a referenced row would start failing,
    which makes it a *change*. An *add* applies on landing.
  - *change*: anything that alters what an existing surface object does or answers: a `create or
    replace` or drop and re-create of an existing function, a new trigger, constraint, default or
    policy on an existing surface table, an overload of an existing RPC name. It can queue only once
    its old-build leg has passed against every distinct build, Bridge and Companion version the
    registry saw in the last 14 days (L4, L5), and it applies on landing. It waits for proof, never
    for a client to reload: a renderer moves to a new build only through Prepare for Live with
    nothing on air, and a *change* that waited for that would be waiting on a person and a quiet
    moment. A client that resumes after a closed lid or an offline night is what the long window is
    for.
  - *cleanup*: anything that removes, renames or narrows (drop, revoke, rename, a tighter policy).
    It applies once the dependency proof (L5) passes.
  No kind waits for quiet or for anybody (L6). A changed or narrowed policy on an existing
  Realtime topic is a *cleanup* whatever it says: Realtime checks a private channel's policies
  when a client joins and keeps the answer for that connection, so the change bites at each
  client's next rejoin, which can be any network blip in a show, and only the dependency proof
  can protect it. A new topic prefix beside the old one is the *add* for that.
  The recommended shape stays D6: put the new beside the old (an *add*), move clients, and remove
  the old later (a *cleanup*); a *change* is for fixes. A rename of a surface object is refused in
  every kind; it is an *add* of the new name and a later *cleanup* of the old. Files 0068 to 0074
  keep their headers; the kind is required from 0075 on. Revert: one kind, as today.
- **L3. An update may delay a live action by at most 500 ms, and nothing may fail or be lost.**
  A Take, Update, Out, automatic cue, report, heartbeat or broadcast that meets a migration waits
  for the migration's lock wait plus its hold, and a request through PostgREST then also for the
  schema-cache reload the migration causes. Each is bounded, by the file itself where it can be,
  and checked by the build:
  - *Below the live functions' own timeouts.* The live functions set short lock timeouts of their
    own: `control_send_seq` and `control_output_report_seq` insert into `control_events` under
    250 ms, and the frame trigger sends on `realtime.messages` under 250 ms, swallowing a timeout,
    so the frame is lost (0071). A migration that made one of them wait 250 ms would fail a Take or
    drop a broadcast, so the half second is not the bound on locks: a file's wait plus hold on a
    table stays at least 50 ms below the smallest lock timeout a live function sets for that
    table. The build reads those timeouts from the migrations, so a later, shorter one tightens
    the rule by itself. The tightest today is 250 ms (the `control_events` insert, the head row
    and `realtime.messages`; `control_shows` is taken at KEY SHARE under 1000 ms and the panel
    tables have none), so every surface file gets 200 ms, spent as below.
  - *The tail.* The *tail* is everything from the first statement that locks a surface table
    more strongly than an ordinary write does (any mode that conflicts with ROW EXCLUSIVE, ROW SHARE
    or ACCESS SHARE) to the commit. A client request that conflicts with it waits at most for the
    tail, since it queues behind the tail's first statement while that statement waits and then
    behind the hold. Every lock wait happens inside some statement's `statement_timeout`, so the
    bound is the sum of the `statement_timeout`s the tail's statements run under, the CLI's ledger
    insert included: at most 200 ms. The commit's own time is the 50 ms margin and is measured
    (AC-3).
  - *The settings.* The file sets `lock_timeout` (at most 100 ms) and `statement_timeout`
    immediately before the tail, because a function a self-check called can leave its own
    `set_config(..., true)` in force until the commit, and the build checks the settings in force
    at each tail statement, not the ones at the top. A `set` inside the tail is allowed (it takes no
    lock), which is how the ledger insert gets its own shorter timeout. The first tail statement's
    `statement_timeout` is above its `lock_timeout`, so a lock it cannot get fails as a lock
    timeout (55P03), not as a cancelled statement; db-push still treats a 57014 in a tail as
    "waiting for its lock". The tail holds only catalog statements: never a `do` block, a backfill
    or a self-check, which go before it or in their own file. The build knows
    the lock mode of each statement form it accepts and counts a form it does not know as ACCESS
    EXCLUSIVE, so a new form can only hold.
  - *No row a client uses is locked.* Before the tail, a statement may lock only rows the same file
    inserted: an `update`, `delete`, upsert, locking read (`for update`, `for share`, `for no key
    update`, `for key share`) or call of a surface function must work on the file's own throwaway
    rows, as 0075's self-check does on its own throwaway production. The rule holds inside a
    subtransaction too, since a lock taken there is held until the rollback. A self-check may run
    in a subtransaction it rolls back on purpose (a block that raises a known exception at its end
    and catches it) to clean up after itself: PostgreSQL releases the locks taken after a savepoint
    when it is rolled back, and the rows and settings go with them.
  - *Slow work never holds.* On an existing surface table the build refuses a statement whose cost
    grows with the table (a rewrite, a type change, a volatile default, a plain `create index`, an
    immediately validated constraint, `set not null` without a valid check constraint already in
    place, an `insert ... select` from a surface table). An index is built with `create index
    concurrently` in 0074's retry-safe shape, with its leftover `drop index if exists` held to the
    100 ms rules above; only the concurrent build's own statement may set a longer
    `lock_timeout` and `statement_timeout`, since its SHARE UPDATE EXCLUSIVE conflicts with no lock
    a client takes. A constraint is added `not valid` and validated in a later file. A backfill
    goes through the batch route: the file adds (as an *add*) an idempotent function that changes
    at most 1,000 rows per call and answers how many remain, names it in a
    `-- live-path batch: <function>` header line, and db-push calls it in separate transactions
    under the same timeouts, with a pause between calls, until it answers zero. Code that needs the
    backfilled values reads with a fallback until the batch reports done.
  - *The schema-cache reload, from every file.* Every DDL statement fires Supabase's
    `pgrst_ddl_watch` event trigger, which makes PostgREST rebuild its schema cache. PostgREST's
    documentation says requests wait for the reload; a report on Supabase's own tracker
    (supabase/supabase#50043, 2026-09-05) shows hosted PostgREST answering 503 PGRST002 at once
    instead, for 20 to 25 s per reload on that project. Which one this project sees, and for how
    long, decides whether any migration can meet the half second, so the reload counts inside it:
    wait plus hold plus reload is at most 500 ms for a request through PostgREST, which leaves
    300 ms for the reload. AC-3 measures it on staging and records production's figure, a live
    send already resends a 503 (`src/control/failedSends.ts`), and if the reload alone takes more
    than the 300 ms, AC-3 fails and says so: that is the owner's to weigh, never a reason to wait
    for a quiet moment. db-push leaves at least 2 s between files that contain DDL, so one action
    meets at most one file's stall; a concurrent-index file triggers a reload per step and is
    measured as one stall.
  - *Retry, never force.* A file that cannot get its lock within its tail's timeouts changes
    nothing (one
    transaction, or 0074's retry-safe steps). db-push tries it at most three times per run, at
    least 10 s apart so no single request meets two attempts, then leaves it held as "waiting for
    its lock" (L7, L8) for the next run. It never raises the timeouts to get through.
  The half second is the owner's ("half a second lag"); a file may always set less than these
  figures. Revert: a one-second budget with a 500 ms `lock_timeout`.
- **L4. Proof before landing, then staging before production.** An *add* or *change* runs a CI
  compatibility check before it can queue: the surface snapshot (signatures with argument names
  and defaults, result columns, grants, policies, triggers and columns of surface tables) before
  and after the branch's migrations must match the declared kind, and the live-path end-to-end
  subset runs against the new schema with the build production serves (its `version.json`
  commit) and with each other distinct build L5's floor read lists for the window, and the
  branch's build runs against the old schema. The old-build leg includes the Companion module and
  Bridge versions the floor read lists, sends the old build's `/api` requests to the branch's
  routes (L11), and joins and broadcasts on each topic prefix as an old client. After landing, a
  surface file goes to staging first; db-push compares staging's real surface diff with the
  declared kind, measures the stall (L3), calls each surface RPC with the argument shapes recorded
  per live protocol, and joins each topic prefix. Any failure holds that file on production with
  the reason. Staging can then run ahead of production by the files production holds; L7's
  chained hold keeps every later file that touches their objects with them, which is what lets a
  later proof on staging stand for production. Ordinary files keep today's order (production,
  then staging). Revert: drop the CI legs and push production first again.
- **L5. Running clients are known durably, and absence must be shown, not assumed.** A client
  registry (`control_clients`) records each renderer, operator page, hosted control page, Bridge
  and paired panel by instance, with its role, build (or Bridge or module version), live protocol,
  first and last seen. Renderers write it every 60 s through a new heartbeat RPC that also updates
  `output_seen_at` (the unpublish sweeps 0061 and 0067 read it), and stop calling
  `control_output_seen`; pages write it every five minutes, and an operator page writes the
  version of the Bridge it is linked to. A paired panel's row is written on the server side, by
  `panel_hello` on every connect and by `panel_press` at most once a minute (a *change* to each),
  because the released Companion module sends no version (`companion-module/src/relay.ts:94-98`):
  a panel without a version counts as the oldest released module, whose calls are known from the
  module's source history. Only builds from before the registry still call
  `control_output_seen`, so it also stamps a separate `legacy_seen_at`; a recent one means a
  renderer of unknown build is on that production, whatever newer renderers sit beside it. A
  cleanup's dependency proof is four independent checks, and each one alone can hold it:
  1. *Build, now*: no live-client source at the branch head references what it removes.
  2. *Build, history*: its `unused since <commit>` is on `main`, and no live-client source at that
     commit or after it references the removed names (a plain string match, so a false positive
     can only hold).
  3. *Runtime, registry*: every client seen in the last 14 days (D6's window) runs a build that
     descends from that commit, or a Companion or Bridge version at or above the one it names.
     Unknown, `dev` and unrecognised builds, and a recent `legacy_seen_at`, depend on everything.
  4. *Runtime, registry health*: every production with commands in the window has registry rows,
     and every sender build stamped on those commands (`snd.b`, already in `control_events`) is
     cleared by check 3. A registry that went silent is not evidence of absence.
  The registry also answers one anonymous read, the *floor*: every distinct build, Bridge and
  Companion version seen in the window, the oldest of each, and whether checks 3 and 4 would
  pass. It carries commit ids and version numbers only, which the public repository already shows.
  CI reads it for a cleanup that lives in code rather than in a migration (L11), since a code change
  deploys the moment it lands and db-push never sees it.
  One case stays blind, and is named rather than called covered: an operator page opened before
  the registry existed that never sends and never reloads leaves no durable trace, and its next
  send to a removed name fails. Revert: the cleanup applies on checks 1 and 2 alone.
- **L6. No gate reads activity.** Verified quiet is retired, by the owner's ruling of 2026-10-03.
  No db-push decision reads heartbeats, commands, what is on air or what is due, and no person is
  asked to say when. An *add* applies on landing; a *change* or *cleanup* applies when its proof
  passes, whatever is on air; every one of them is bounded by L3 instead. The quiet read and its
  24 h alarm leave `db-push` in the same build that puts L3's checks in force, never before, so
  there is no landing at which neither guard stands. Revert: the heartbeat window.
- **L7. A waiting file does not block the files after it, unless they touch what it touches.** A
  held file (waiting for its lock, its proof or staging) is held together with every later file
  that names an object it touches (a chained hold, reported as one), and every other later file
  applies past it. db-push already pushes from a staged copy that leaves held files out; a held
  file that applies after a later one goes out of order, which `supabase db push` allows only with
  `--include-all`, and the drift check learns that a held file is an expected gap. Holding is
  runtime state, so this is db-push's decision, not the offline build's. Files naming disjoint
  objects commute, so the order cannot change the result. Held files are retried on every landing
  and every 30 minutes on a schedule, so a lock that was busy or a proof that has since cleared is
  found without a landing. Revert: hold everything after the first hold.
- **L8. Waiting is visible and never red.** A held file costs nothing (its code already works
  without it), so a hold never fails post-land. The post-land summary and
  `scripts/migration-drift.mjs` list each held file with its age and what holds it (its lock, a
  failed staging check, or the client and build that still depend). A hold older than seven days
  opens one rolling issue, in the weekly-audit pattern. Today's 24 h red alarm goes. Revert:
  restore the alarm.
- **L9. The override is per file, with a reason, and recorded where every later run sees it.**
  `npm run db:push -- --live NNNN --reason "<why>"` from a maintainer machine, or the post-land
  workflow dispatched with the same two inputs, applies NNNN past the dependency and staging gates
  after printing what it bypasses (which clients depend). It never bypasses the statement guard
  (`--allow` stays separate), the stall rules of L3, or the timeouts in the file. Each use writes a
  row (version, time, reason, what it bypassed) to a small override table the build adds, and
  every later db-push and drift report shows it. No normal update needs it. Revert: today's
  `--live`, unrecorded.

### Web deploys and clients

Sources for each platform claim are listed under "Sources" below, with the date they were read.

- **L10. An open page keeps loading its own build.** Every asset a page loads after its HTML (the
  entry script, every chunk, CSS) carries the deployment id that built it, as Vercel documents for
  frameworks it does not support natively (`?dpl=<VERCEL_DEPLOYMENT_ID>`, used only when
  `VERCEL_SKEW_PROTECTION_ENABLED` is `1`). Skew Protection is a Pro and Enterprise feature and
  answers 200 for `?dpl=` on this project (research §5.5), so it is available. Its maximum age
  defaults to one day from the deployment's creation, and a pinned request to an older or deleted
  deployment answers 404, so the project's maximum age is set to its production deployment
  retention (one year by default on Pro; the current production deployment is never removed by
  retention), and a check reads the setting. On top of that, the output renderer loads no chunk
  after boot: supabase-js is bundled into its entry, so an open output depends on no deployment
  at all once it runs, however long it stays open. Vercel serves the newest deployment to a
  document navigation, which is what a reload should get. This settles
  `backlog/vite-assets-without-skew-protection.md`. Revert: unpinned assets.
- **L11. What the newest deploy answers for any build is surface too.** Unhashed paths an older open
  client fetches (`/fonts/*`, `/panel.json`, `/version.json`, the `/output` and `/bridge` pages) and
  the `/api` routes a live page calls during a show (today `/api/events`, `/api/data/state` and
  `/api/data/patch`) follow L2's kinds: a path or route only grows, a request an older live build
  sends is answered as before, and a removal or rename is a code cleanup that CI refuses until L5's
  floor descends from its `unused since` commit. A file under `/fonts/` is never removed or renamed
  at all: a frame already on air fetches its font when the text first uses it, so it is a permanent
  path. `/api` requests are not pinned to the old deployment: Vercel applies an environment variable
  change only to new deployments, so a pinned old route would keep a rotated secret and keep calling
  the database surface for as long as the deployment lives. The build derives the paths and routes
  the live-client source fetches, as L1 does for RPCs. Revert: no route rule.
- **L12. No update makes an output reload, and an output never reloads itself on air.** No live page
  checks for a new deploy. The output renderer reloads itself in exactly two cases: at boot, before
  it has shown anything, after three failed resolves (`src/output/main.ts:135-188`), and for Prepare
  for Live, only when every changed graphic prepared and nothing is on air
  (`src/output/prepare.ts:144-149`). That guard is stale today: it reads `onAir()` and then awaits
  `fetch(location.href)` in `reloadIfServed` (`src/output/main.ts:138-149`) before reloading, so a
  Take that lands during the fetch is cut by the reload. The guard is read again after the fetch,
  immediately before the reload (filed as
  [`backlog/prepare-for-live-reload-can-cut-a-take.md`](../../backlog/prepare-for-live-reload-can-cut-a-take.md)).
  A new reload or navigation in the renderer's code is refused by the build unless it is one of
  those two or carries the same on-air guard. Operator pages never reload because of a deploy
  either. An output open across many deploys keeps running the build it loaded (L10) against a
  surface that only grows (L1, L11). Revert: no gate.
- **L13. A Bridge, CLI or Companion update is only ever its user's own install, and a deploy never
  cuts one off.** Neither the Bridge nor the CLI updates, restarts or exits itself because a newer
  version exists (true at `358cb5035`: no auto-update, no update check outside `noacg doctor`),
  and the build keeps it so. The page-to-Bridge protocol follows L2's kinds: a new page keeps
  answering an older Bridge, and a new Bridge keeps answering an older page. The oldest Bridge
  protocol a page accepts stops being a code constant that follows `PLAYOUT_V` and becomes a
  value the database serves, so a protocol bump in a deploy raises nothing, and raising the
  minimum is a migration *cleanup* that waits for L5's proof that no Bridge below it was seen in
  the window. The build refuses page code that drops its handling of a protocol at or above the
  minimum the migrations set, which is what keeps the code from racing ahead of the proof. The
  Companion module is installed by its user through Companion; what it calls is surface (L1,
  L11). Revert: `MIN_PLAYOUT_V` raised freely.
- **L14. A rollback cannot reach past a cleanup.** Vercel's Instant Rollback serves an older
  deployment against the current database. After a cleanup applies, a deployment from before its
  `unused since` commit could call what it removed, so the post-land summary and the drift report
  name the oldest commit production may be rolled back to. Revert: no floor.

### What 0075 must change

Row DB's `0075_cue_arms.sql` (branch `claude/db-timed-cues-2`) is a valid *add* as written: new
names only, a foreign key `on delete cascade` from the new table `control_cue_arms` to
`control_shows`'s primary key, added last, and a self-check before it that touches only its own
throwaway production. Its only strong lock is that foreign key's SHARE ROW EXCLUSIVE on
`control_shows`, its whole tail. Under L3 two things change. Immediately before the
`alter table public.control_cue_arms add constraint control_cue_arms_show_fk ...` statement it
sets its tail's timeouts, and shortens the timeout again after it for the CLI's ledger insert:

```sql
set lock_timeout = '100ms';
set statement_timeout = '150ms';
alter table public.control_cue_arms
  add constraint control_cue_arms_show_fk foreign key (show_id)
  references public.control_shows (id) on delete cascade;
set statement_timeout = '50ms';
```

A request that conflicts with the foreign key's lock (an update of a `control_shows` row) then
waits at most 200 ms, wait and hold together, and a lock it cannot get in 100 ms fails as a lock
timeout that db-push retries. And the `set lock_timeout = '500ms'` at its top becomes `'100ms'`,
since the build refuses any `lock_timeout` above 100 ms. That top line does not govern the foreign
key in any case: the self-check calls `control_send_seq` and `control_cue_arm`, which leave their
own `set_config('lock_timeout', ..., true)` in force until the commit, which is why the settings go
right before the tail. Separately, the self-check leaves a
`control_show_identity` row behind on production; harmless, and a rolled-back subtransaction (L3)
would avoid it. Until the L3 checks are built nothing refuses the current form, so this is the
author's to apply; it lands under today's quiet hold either way.

## Behaviour

No criterion below waits for a quiet moment or needs a person to act for an update to apply or
stay safe. AC-11 tests the emergency tool itself.

### AC-1: The live surface is what live clients call

The build prints the surface. `panel_press`, `panel_hello`, `panel_release`, `control_send_many`,
`control_output_seen`, the `control_shows` columns the production page writes, and the `cmd-`,
`log-`, `live-`, `seq-`, `pnp-` and `pfb-` topics are in it; `community_list` and `audience_vote`
are not. A branch that adds an `rpc('control_example')` call to the output renderer makes a
migration touching `control_example` a surface migration with no edit to `db-push`; a branch that
then deletes that call leaves `control_example` in the surface; and a migration that replaces
`panel_press` without a header fails the build.

### AC-2: Every surface migration declares a kind, and the build checks it

Fixture migrations in `scripts/db-push.test.mjs`: a new function name declared *add* passes; a new
table with an `on delete cascade` foreign key to `control_shows` declared *add* passes, and the
same key with `on delete no action` fails, naming it as a *change*; a `create or replace` of
`control_send_many` declared *add* fails, naming it as a *change*; a drop and re-create of
`control_show_by_slug` with a different return type declared *add* fails; an overload of
`control_output_seen` declared *add* fails; a `drop` or `revoke` on a surface object declared
anything but *cleanup* fails; a changed policy on `realtime.messages` for the `live-` topic
declared *change* fails, naming it as a *cleanup*; a `rename` of a surface object fails in every
kind; a *cleanup* without `unused since <commit>` fails.

### AC-3: An update cannot delay a live action by more than half a second

The build refuses a surface file with a `lock_timeout` above 100 ms, outside a concurrent index
build's own statement; one whose tail statements (ledger insert included) run under
`statement_timeout`s that sum to more than 200 ms, judged by the settings in force at each; one
whose first tail statement's `statement_timeout` is not above its `lock_timeout`; one whose tail
bound on a table is not at least 50 ms below the shortest lock timeout a live function sets for
that table, read from the migrations; one with a `do` block, a self-check or a
backfill in its tail; one that locks, before its tail, a row it did not insert, inside a
subtransaction or not; each slow statement listed in L3 on an existing surface table; and a
backfill outside the batch route. A fixture with a statement form the build does not know is
counted as ACCESS EXCLUSIVE, and a fixture live function with a 120 ms lock timeout makes a file
with a 200 ms tail fail.

On staging, while a page sends every 50 ms and a renderer applies, each surface file of the build's
own landings, one concurrent index build, one batch backfill, and two DDL files applied back to back
apply with zero failed and zero missing sends and zero lost frames (a send that PostgREST answered
503 and the page resent counts as delayed, by its time to air). Each runs three times: with no other
session, with a blocker session holding, for 90 ms, a lock that conflicts with the file's but with
no client's (an open read against ACCESS EXCLUSIVE, an uncommitted ordinary write to a throwaway row
against SHARE ROW EXCLUSIVE; the file waits and gets through), and with one holding it for 300 ms
(the file gives up, changes nothing, and is retried 10 s later). The receipt records, per run, the
lock wait and hold on each surface table (sampled from `pg_locks`), the longest press-to-applied
delay with the update, at most 500 ms above the longest without it, and PostgREST's schema-cache
reload time and whether requests waited or got 503 during it. One ordinary non-surface DDL file is
measured the same way. The first real surface landing on production records its lock wait and hold
(from `pg_locks` sampling or `log_lock_waits`) and PostgREST's reload time from its log, as its own
evidence rung.

### AC-4: An add or a change is proven against old and new code before it queues

A branch with a surface migration runs the CI compatibility legs (L4). Seeded failures show each
leg holds: a fixture *add* that is really an overload fails the snapshot comparison; a fixture
*change* that drops a result column the production build reads fails the old-build leg; a fixture
that narrows `panel_hello`'s answer fails the released Companion leg; a fixture policy that
refuses an old client's join on `log-` fails the join check; branch code that needs its own new
RPC to exist fails the old-schema leg; a fixture *change* that an older build listed by the floor
read cannot use, but the production build can, fails the old-build leg for that build. A branch
with no surface migration does not run the legs.

### AC-5: Staging goes first for a surface file, and a failure there holds production

After a landing, a surface file is applied to staging and checked before production. With a
fixture whose real surface diff on staging differs from its declared kind, production holds that
file, post-land says why, and staging keeps it applied. An ordinary file still goes to production
first.

### AC-6: Every running client is known, and a silent registry is not absence

With a renderer, a production page, a hosted control page, a Bridge and a paired Companion module
open on a staging production, the registry lists each with its role, build or version, protocol and
a last-seen time no older than its write interval plus one minute. A renderer from the build before
the registry, open beside a new one on the same production, shows as present with an unknown build.
Removing the registry writes for one production that keeps sending makes the dependency proof report
that production's registry as unhealthy.

### AC-7: A cleanup applies only when nothing running depends on it, and by itself when nothing does

On staging, with a fixture cleanup removing a function that an open renderer from an older build
still calls, db-push holds the cleanup and names the renderer, its production and its build. Once
that renderer is gone (the test closes it, as an operator closing a browser source would) and the
window holds no older client, the next scheduled run applies the cleanup with no landing and nobody
acting, while a newer renderer has a graphic on air and a page is sending. Each of the four checks
in L5, failed alone in a fixture, holds the cleanup by itself and names which check held it. After
it applies, the post-land summary names the oldest commit production may be rolled back to (L14).

### AC-8: No update waits for quiet or for a person

`scripts/db-push.mjs` reads no heartbeat, command, on-air or due-cue state to decide anything, and
the `--live` flag is not part of any normal path. On staging, with a renderer heartbeating, a
graphic on air and a page sending every 50 ms, a fixture *add* applies on the landing run, inside
AC-3's figures. A fixture whose lock is held by another session for longer than 200 ms changes
nothing, is tried three times at least 10 s apart, is reported held as "waiting for its lock", and
applies at the first later run that gets the lock, with no landing and nobody acting.

### AC-9: A held file holds only the files that touch what it touches

With a *cleanup* held, a later *add* and a later ordinary migration on other objects both apply on
the same run, and a later file naming an object the held file touches is held with it and reported
as one chained hold. When the held file's proof clears, it applies at the next scheduled run with
no landing in between, and its chain applies after it in number order. Afterwards production's
surface snapshot equals that of a fresh local `supabase db reset`, which applied the files in
number order.

### AC-10: A hold is visible, never red, and escalates after seven days

A held file leaves post-land green, and its summary and the drift report give the file, its age
and what holds it. A hold dated eight days old opens the rolling issue once and does not open a
second one on the next run.

### AC-11: The emergency override applies one file now and leaves a record

`--live NNNN` without `--reason` refuses and changes nothing. With a reason, it prints which
clients depend, applies NNNN alone, and writes an override row that the next db-push and the drift
report show. A file with a dangerous statement still needs `--allow NNNN` as well, and a file that
breaks L3 is refused with or without it. The workflow-dispatch form behaves the same and its run
log carries the reason.

### AC-12: The rules are written where the next author reads them

`supabase/AGENTS.md` replaces "Live-path migrations wait for a quiet window" with the three kinds,
the stall budget, the batch route, the dependency proof and the override; `docs/CLOUD_PLAYOUT.md`
names the client registry and no longer says migrations wait for a quiet window; the web and
client rules (L10 to L14) are written where a deploy, Bridge or route author reads them
(`docs/DEPLOYMENT.md`, `docs/BRIDGE.md`); the backlog items above point at this spec and close
when it converges.

### AC-13: An open page keeps loading its own build across deploys

The built HTML and every built import carry `?dpl=<deployment id>`. On production, a page loaded
from deployment A loads a chunk it had not loaded yet after deployment B went live, and gets 200
from A. A check reads the project's Skew Protection maximum age and fails when it is below the
production retention. An output loaded before a deploy, given no network access to `noacg.studio`
after boot except `/fonts/*`, keeps taking, updating and clearing graphics.

### AC-14: Paths and routes an older live build uses keep answering

The build prints the unhashed paths and `/api` routes the live-client source fetches. A branch that
deletes or renames a file under `public/fonts/` fails. A branch that removes `/panel.json` or stops
accepting a field a live page sends to `/api/data/patch` fails unless it is a declared cleanup, and
its CI refuses it while the floor read (L5) names a build older than its `unused since` commit. The
old-build leg (AC-4) sends the production build's `/api` requests to the branch's routes and gets
the same answers.

### AC-15: No deploy reloads an output, and an output never reloads itself on air

The build lists every reload and navigation call in the output renderer's code and fails on one
outside L12's two cases. On staging, an output with a graphic on air meets a deploy and then a
Prepare for Live request with changed graphics (sent by the test, as a publish would): it keeps its
picture, reports "waiting" and does not reload. The same request with a Take sent while the output's
reload probe is in flight leaves the Take on air and the output unreloaded. A deploy with no changed
graphics reloads no output at all. With nothing on air, the same request reloads it onto the new
deploy.

### AC-16: A deploy never cuts off a running Bridge

A fixture branch that bumps `PLAYOUT_V` leaves the minimum where it was, and an older Bridge stays
linked to a page from that build. A fixture migration that raises the minimum is refused unless
declared a cleanup, and the dependency proof holds it while the registry shows a Bridge below the
new minimum in the window. Page code that drops handling for a protocol at or above the minimum
fails the build. The released Bridge versions in the window pass the old-build leg against the
branch's page. Neither the Bridge nor the CLI contains an update check that restarts, exits or
replaces the process.

## Preserved behaviour

- The statement guard: refusals, `--allow NNNN`, fail-closed on unknown statements, the
  before/after diff, the drifted-ledger refusal, the advisors after every push, the timeouts rule
  for every file from 0068, the lock-timeout retries (now spaced and bounded by L3).
- Both hosted projects get every migration, and post-land stays the only normal route.
- Ordinary (non-surface) migrations apply on landing exactly as today, unless AC-3's reload figure
  puts them under L3.
- AC-17 of `playout-runtime-reliability`: old pages and old outputs keep working on the new schema.
- The landed app works without its own surface migration, as the held class already requires: a
  web deploy and post-land run at the same time, and an *add* can wait for its lock.
- Prepare for Live stays the way an output moves to a new deploy and new graphics, at a moment
  with nothing on air.

## Non-goals

- Telling old clients to reload (a server-side minimum protocol). Prepare for Live already moves
  renderers at a safe moment; a stuck cleanup only costs dead weight, and L8 names who holds it.
- Supabase's or Vercel's own maintenance (a Postgres upgrade, a PostgREST or Realtime restart, a
  CDN incident). NoaCG does not ship those; what is known about them is in the open-questions item.
- A reload the user's playout software makes by itself (a browser source set to refresh when its
  scene becomes active, for example); L10 makes such a reload land on a working build.
- Supabase preview branches or any new paid service; staging and CI are free.
- Changing a migration that is already applied, or re-classing 0068 to 0074.
- Exported packages: `src/export` makes no database call at `fa0347180`. If an export ever
  embeds one, what it calls is a permanent surface object, never cleaned up, because an exported
  file is never updated.
- Anything in the editor, library or community paths; they are not the live surface. Their lazy
  chunks are still pinned by L10.

## Verification

- Offline gates in `npm run build`: AC-1, AC-2, the static half of AC-3, AC-8's first sentence,
  AC-9's hold and chain decisions as pure functions over fixture plans, AC-14's path and route
  checks, AC-15's call-site list and AC-16's static half.
- CI legs on the branch for AC-4, AC-14's route leg and AC-16's Bridge leg, with the seeded
  failures in the receipt.
- Staging only, never production, for AC-3's measurement, AC-5 to AC-9, AC-11 and AC-15; the
  receipt gives run ids and the figures. Production evidence is the first real surface landing
  after the build, recorded as its own rung, and AC-13's chunk request across a real deploy.
- Never touch the owner's studio setup, deck, Bridge or Companion: AC-6 and AC-16 use a separate
  staging production and a separate Bridge and Companion instance started for the test.

## Sources

Platform behaviour this spec relies on, read on 2026-10-03:

- Vercel, Skew Protection (`https://vercel.com/docs/skew-protection`, updated 2026-09-16):
  available on Pro and Enterprise; supported frameworks attach the deployment id, others append
  `VERCEL_DEPLOYMENT_ID` as `?dpl=`, `x-deployment-id` or the `__vdpl` cookie when
  `VERCEL_SKEW_PROTECTION_ENABLED` is `1`; custom `fetch()` calls are not pinned automatically;
  document navigations get the latest production deployment; maximum age defaults to one day from
  deployment creation and can be raised up to the retention limit; a request for a deployment that
  no longer exists or is older than the maximum age returns 404; deleted deployments are not
  reachable through Skew Protection.
- Vercel, Deployment Retention (`https://vercel.com/docs/deployment-retention`, updated
  2026-09-16): Pro default retention is one year for production deployments; a deployment with a
  production alias, and the last 20 ready production deployments on Pro, are kept regardless.
- Vercel, Environment variables (`https://vercel.com/docs/environment-variables`, updated
  2026-09-17): a change applies only to new deployments, never to previous ones.
- PostgREST, Schema Cache (`https://docs.postgrest.org/en/v13/references/schema_cache.html`, and
  the same sentence in v12): requests wait until a schema cache reload is done; automatic reload
  on DDL is an event trigger that sends `NOTIFY pgrst`.
- Supabase issue tracker, supabase/supabase#50043 (opened 2026-09-05, open when read; a user
  report, not documentation): hosted `pgrst_ddl_watch` fires on DDL, and on that project each
  reload answered 503 PGRST002 for 20 to 25 s.
- PostgreSQL 17, Explicit Locking and Client Connection Defaults
  (`https://www.postgresql.org/docs/17/explicit-locking.html`,
  `https://www.postgresql.org/docs/17/runtime-config-client.html`): ROW EXCLUSIVE conflicts with
  SHARE, SHARE ROW EXCLUSIVE, EXCLUSIVE and ACCESS EXCLUSIVE; `create index concurrently` takes
  SHARE UPDATE EXCLUSIVE; `lock_timeout` applies to each lock acquisition separately;
  `statement_timeout` applies to each statement; a lock acquired after a savepoint is released
  when the savepoint is rolled back to.
- This project, measured: `docs/PLAYOUT_ISOLATION_RESEARCH.md` §5.5 (an old chunk 404 without
  `?dpl=`, 200 with it; seven production deploys in one day; schema reload effectively immediate on
  a preview branch).

## Decisions for the owner

None open now. The ruling of 2026-10-03 settled the one question the previous version left
(whether a graphic left on air holds a cleanup): nothing waits for activity. Two derived choices
sit closest to his intent:

- L3 holds a migration's locks to 200 ms in all, below the half second, because the live
  functions' own 250 ms lock timeouts would otherwise fail a Take; a smaller budget only means
  more files retry.
- One question may come back from the build: if AC-3 finds that PostgREST's schema-cache reload
  on this project takes longer than the 300 ms left of the half second, no migration can meet the
  ruling as stated, and the choice between accepting that pause and engineering around it goes to
  him with the measured figure. It is not asked now, because the figure does not exist yet.
