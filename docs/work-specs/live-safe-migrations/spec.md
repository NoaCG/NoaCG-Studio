# Live-safe migrations: updating NoaCG never interrupts Playout

Answers the owner's decision of 2026-10-02 in
[`backlog/migrations-while-productions-are-live.md`](../../backlog/migrations-while-productions-are-live.md),
and, once built, settles [`backlog/live-path-quiet-window-never-comes.md`](../../backlog/live-path-quiet-window-never-comes.md).
Serves `docs/GOALS.md` outcome 5 (production and playout, rank 1) and its reliability bar. It
replaces derived decision D7 of [`playout-runtime-reliability`](../playout-runtime-reliability/spec.md)
(the heartbeat quiet window) and keeps that spec's D6 (old and new functions side by side) and
AC-17 (old pages and outputs keep working). Design only: nothing here is built yet.

## Problem

Production starts the week of 2026-10-05. From then on a migration that interrupts playout is a
broken show. Today's mechanism (`scripts/db-push.mjs`, `supabase/AGENTS.md` "Live-path migrations
wait for a quiet window") has five gaps, each found while writing this spec at `fa0347180`:

1. **The quiet window never comes.** Quiet means no `control_shows.output_seen_at` in ten minutes,
   and a renderer left open heartbeats every 60 s around the clock. 0068 was held three times on
   2026-09-30; 0072 was applied by hand with `--live` on 2026-10-01 with a production still live.
   A heartbeat says a page is open, not that anybody is operating.
2. **One hold blocks everything after it.** `liveHold` holds the first live-path file "and
   everything after it, because the ledger has no gaps", so a file waiting for quiet also stops
   every later feature migration. A cleanup that waits for quiet would stop the project.
3. **`lock_timeout` bounds the wait, not the hold.** Each file is one transaction, so the
   strongest lock it takes on `control_events`, `control_shows` or `realtime.messages` is held
   until the file commits, under a 30 s `statement_timeout`. A table rewrite, a non-concurrent
   index, a constraint validation, or the self-check `do` block `supabase/AGENTS.md` asks for,
   placed after that lock, stalls every Take for as long as it runs.
4. **The live path is a name prefix, not what clients call.** `LIVE_PATH_PREFIX = 'control_'`.
   The Companion module calls `panel_hello`, `panel_pair_finish` and `panel_press` during a show
   (`companion-module/src/relay.ts`), and the production page calls `panel_release`; a later
   `create or replace function panel_press` would not be live-path. 0073 was only classed live
   because it also added foreign keys to `control_shows`.
5. **"Additive" is judged on statements, not on what old clients see.** A drop and re-create of a
   function in one file counts as safe, so a changed signature or return shape passes the loss
   guard (only the quiet window stood in front of it). A new overload of an existing RPC name adds
   and removes nothing, yet PostgREST then answers an old caller's named-argument call with an
   ambiguity error (PGRST203). Applied to `control_output_seen`, that would silence every old
   renderer's heartbeat, and a quiet window built on heartbeats would then read as quiet.

## Owner requirements (binding)

From the owner's decision of 2026-10-02 (the backlog item's "Decision" section):

- Automatic, with no approval in the normal case. Updating NoaCG must not be able to interrupt
  anybody using Playout, and the owner never coordinates a maintenance window.
- A normal deployment applies, by itself, only migrations that are safe on a live production
  database and compatible with the code and the outputs running at that moment.
- Removing or renaming anything happens only in a later cleanup migration, once no current code or
  output version depends on it.
- A cleanup that could still affect active playout also waits, by itself, for verified quiet.
- A manual emergency override exists and is never the normal path.
- Neither "additive is always safe" nor "no output reporting means safe to remove" may be the only
  guarantee.

## Derived decisions (revertible; each says how to revert)

- **L1. The live surface is what live clients call, and it only grows until a cleanup.** It is
  every RPC, table, column and Realtime topic prefix referenced from the code the live pages run
  (the output renderer, the production page, the hosted control page) and from the Companion
  module, plus the server-side objects those reach: today's `LIVE_PATH_PREFIX`,
  `LIVE_PATH_TABLES` and `LIVE_PATH_FUNCTIONS` stay as that server half. The build derives the
  client half from source over `main`'s history, not from the head alone, so a name a new build
  stopped calling stays in the surface while older renderers may still call it, and leaves only
  through a *cleanup*. A new call joins without anyone editing `db-push`. Revert: back to the
  prefix lists alone.
- **L2. Every migration touching the surface declares one of three kinds**, in its header:
  `-- live-path add: <what>`, `-- live-path change: <what>` or
  `-- live-path cleanup: <what>; unused since <commit>`.
  - *add*: only new names no running client can call (a new function name, table, column, topic
    prefix or permissive policy on a new topic). It never waits.
  - *change*: anything that alters what an existing surface object does or answers: a `create or
    replace` or drop and re-create of an existing function, a new trigger, constraint, default or
    policy on an existing surface table, an overload of an existing RPC name. It waits for
    verified quiet (L6), and until every client seen in the last 14 days runs a build at or after
    the production build its old-build leg was proven with, or a Companion version that leg
    covered (L4, L5). A client that resumes after a closed lid or an offline night is what the
    long window is for.
  - *cleanup*: anything that removes, renames or narrows (drop, revoke, rename, a tighter policy).
    It waits for the dependency proof (L5) and for verified quiet.
  A changed or narrowed policy on an existing Realtime topic is a *cleanup* whatever it says.
  Realtime checks a private channel's policies when a client joins and keeps the answer for that
  connection, so the change does nothing when it applies and bites at each client's next rejoin,
  which can be any network blip in a show: quiet cannot protect it and only the dependency proof
  can. A new topic prefix beside the old one is the *add* for that.
  The recommended shape stays D6: put the new beside the old (an *add*), move clients, and remove
  the old later (a *cleanup*); a *change* is for fixes. A rename of a surface object is refused in
  every kind; it is an *add* of the new name and a later *cleanup* of the old. Files 0068 to 0073
  keep their headers; the kind is required from the first file after this lands. Revert: one kind,
  as today.
- **L3. The Take stall budget is one second, and nothing may fail or be lost.** `lock_timeout`
  bounds a wait, not a hold: each file is one transaction, so a lock it takes on a surface table
  is held until the file commits. So a surface file sets `lock_timeout` of at most 500 ms and
  `statement_timeout` of at most one second (today: a 5 s cap on the lock and any finite
  statement timeout; files use 2 s and 30 s). After its first statement that locks a surface
  table more strongly than an ordinary write does, only other such statements may follow: never a
  `do` block, a backfill or a self-check, which go before it or in their own file. It may not
  contain a statement whose hold grows with table size on a surface table (a rewrite, a type
  change, a volatile default, a non-concurrent index, an immediately validated constraint, or
  `set not null` without a valid check constraint already in place). A constraint added
  `not valid` and validated in a later file is allowed, since validation does not block writes.
  An index on a surface table has no automatic route: `create index concurrently` cannot run in
  the transaction `supabase db push` wraps each file in, so until a separate route is specified
  it goes through the override (L9) at a moment a person picks. Each surface file's lock hold is
  measured on staging under a fast-sending page: no command fails or goes missing and none is
  delayed more than one second. The scale is
  the owner's own (an automatic action more than 5 s late is missed): one second is well inside it
  and is what any locking DDL costs. Revert: the 2 s timeouts and no measurement.
- **L4. Proof before landing, then staging before production.** An *add* or *change* runs a CI
  compatibility check before it can queue: the surface snapshot (signatures with argument names
  and defaults, result columns, grants, policies, triggers and columns of surface tables) before
  and after the branch's migrations must match the declared kind, and the live-path end-to-end
  subset runs twice, the build production serves (its `version.json` commit) against the new
  schema and the branch's build against the old one. The old-build leg includes the released
  Companion module versions, and joins and broadcasts on each topic prefix as an old client.
  After landing, a surface file goes to staging first; db-push compares staging's real surface
  diff with the declared kind, measures the lock hold (L3), calls each surface RPC with the
  argument shapes recorded per live protocol, and joins each topic prefix. Any failure holds that
  file on production with the reason. Staging can then run ahead of production by the files
  production holds; L7's chained hold keeps every later file that touches their objects with
  them, which is what lets a later proof on staging stand for production. Ordinary files keep
  today's order (production, then staging). Revert: drop the CI legs and push production first
  again.
- **L5. Running clients are known durably, and absence must be shown, not assumed.** A client
  registry (`control_clients`) records each renderer, operator page, hosted control page and
  paired panel by instance, with its role, build (or module version), live protocol, first and
  last seen. Renderers write it every 60 s through a new heartbeat RPC that also updates
  `output_seen_at` (the unpublish sweeps 0061 and 0067 read it), and stop calling
  `control_output_seen`; pages write it every five minutes. Only builds from before the registry
  still call `control_output_seen`, so it also stamps a separate `legacy_seen_at`; a recent one
  means a renderer of unknown build is on that production, whatever newer renderers sit beside
  it. A cleanup's dependency proof is four independent checks, and each one alone can hold it:
  1. *Build, now*: no live-client source at the branch head references what it removes.
  2. *Build, history*: its `unused since <commit>` is on `main`, and no live-client source at that
     commit or after it references the removed names (a plain string match, so a false positive
     can only hold).
  3. *Runtime, registry*: every client seen in the last 14 days (D6's window) runs a build that
     descends from that commit, or a Companion version at or above the one it names. Unknown,
     `dev` and unrecognised builds, and a recent `legacy_seen_at`, depend on everything.
  4. *Runtime, registry health*: every production with commands in the window has registry rows,
     and every sender build stamped on those commands (`snd.b`, already in `control_events`) is
     cleared by check 3. A registry that went silent is not evidence of absence.
  One case stays blind, and is named rather than called covered: an operator page opened before
  the registry existed that never sends and never reloads leaves no durable trace, and its next
  send to a removed name fails. Revert: the cleanup applies on checks 1 and 2 alone.
- **L6. Verified quiet means nobody is operating and nothing is on air, not that nothing is
  open.** The project is quiet when the read succeeds and shows, in every production: no command
  row in the last ten minutes other than pings; no graphic on air by the log's own head summary
  (`control_heads`), counting only productions with a renderer seen in the last ten minutes; and,
  once timed cues exist (`RUNDOWN_AUTOMATION_PLAN.md` build 1), no automatic action due in the
  next ten minutes. Renderer heartbeats, reports, Presence and pings never count. A renderer
  nobody is watching, with nothing on air, therefore counts in full as a client that can depend on
  something (L5) and not at all as activity. Locks are table-wide, so quiet is read across the
  project, not per production. A production that keeps a graphic on air around the clock keeps
  every *change* and *cleanup* waiting: that is the owner's rule 3 read literally, it costs only
  the waiting (L8 names the production), and the override is the way past it. Revert: the
  heartbeat window.
- **L7. A waiting file does not block the files after it, unless they touch what it touches.** A
  held *change* or *cleanup* is held together with every later file that names an object it
  touches (a chained hold, reported as one), and every other later file applies past it. db-push
  already pushes from a staged copy that leaves held files out; a held file that applies after a
  later one goes out of order, which `supabase db push` allows only with `--include-all`, and the
  drift check learns that a held file is an expected gap. Holding is runtime state, so this is
  db-push's decision, not the offline build's. Files naming disjoint objects commute, so the
  order cannot change the result. Held files are retried on every landing and every 30 minutes on
  a schedule, so a night-time lull is found without a landing. Revert: hold everything after the
  first hold.
- **L8. Waiting is visible and never red.** A held file costs nothing (its code already works
  without it), so a hold never fails post-land. The post-land summary and
  `scripts/migration-drift.mjs` list each held file with its age and what holds it (the
  productions sending, or the client and build that still depend). A hold older than seven days
  opens one rolling issue, in the weekly-audit pattern. Today's 24 h red alarm goes. Revert:
  restore the alarm.
- **L9. The override is per file, with a reason, and recorded where every later run sees it.**
  `npm run db:push -- --live NNNN --reason "<why>"` from a maintainer machine, or the post-land
  workflow dispatched with the same two inputs, applies NNNN past the quiet, dependency and
  staging gates after printing what it bypasses (who is sending, which clients depend). It never
  bypasses the statement guard (`--allow` stays separate) or the lock settings in the file. Each
  use writes a row (version, time, reason, what it bypassed) to a small override table the build
  adds, and every later db-push and drift report shows it. Revert: today's `--live`, unrecorded.

## Behaviour

### AC-1: The live surface is what live clients call

The build prints the surface. `panel_press`, `panel_hello`, `panel_release`, `control_send_many`,
`control_output_seen`, the `control_shows` columns the production page writes, and the `cmd-`,
`log-`, `live-`, `seq-`, `pnp-` and `pfb-` topics are in it; `community_list` and `audience_vote`
are not. A branch that adds an `rpc('control_example')` call to the output renderer makes a
migration touching `control_example` a surface migration with no edit to `db-push`; a branch that
then deletes that call leaves `control_example` in the surface; and a migration that replaces
`panel_press` without a header fails the build.

### AC-2: Every surface migration declares a kind, and the build checks it

Fixture migrations in `scripts/db-push.test.mjs`: a new function name declared *add* passes; a
`create or replace` of `control_send_many` declared *add* fails, naming it as a *change*; a drop
and re-create of `control_show_by_slug` with a different return type declared *add* fails; an
overload of `control_output_seen` declared *add* fails; a `drop` or `revoke` on a surface object
declared anything but *cleanup* fails; a changed policy on `realtime.messages` for the `live-`
topic declared *change* fails, naming it as a *cleanup*; a `rename` of a surface object fails in
every kind; a *cleanup* without `unused since <commit>` fails.

### AC-3: A surface migration cannot stall a Take past one second

The build refuses a surface file with `lock_timeout` above 500 ms or `statement_timeout` above one
second, one with a `do` block or a backfill after its first strong lock on a surface table, and
each size-dependent statement listed in L3 on a surface table. On staging, while a page sends
every 50 ms, each surface file of the build's own landings applies with zero failed and zero
missing sends, and the receipt records the file's measured lock hold on each surface table
(sampled from `pg_locks` while it applies) at no more than one second, beside the longest
press-to-applied delay with and without the migration. The first real surface landing on
production records the same lock-hold figure as its own evidence rung.

### AC-4: An add or a change is proven against old and new code before it queues

A branch with a surface migration runs the CI compatibility legs (L4). Seeded failures show each
leg holds: a fixture *add* that is really an overload fails the snapshot comparison; a fixture
*change* that drops a result column the production build reads fails the old-build leg; a fixture
that narrows `panel_hello`'s answer fails the released Companion leg; a fixture policy that
refuses an old client's join on `log-` fails the join check; branch code that needs its own new
RPC to exist fails the old-schema leg. A branch with no surface migration does not run the legs.

### AC-5: Staging goes first for a surface file, and a failure there holds production

After a landing, a surface file is applied to staging and checked before production. With a
fixture whose real surface diff on staging differs from its declared kind, production holds that
file, post-land says why, and staging keeps it applied. An ordinary file still goes to production
first.

### AC-6: Every running client is known, and a silent registry is not absence

With a renderer, a production page, a hosted control page and a paired Companion module open on a
staging production, the registry lists each with its role, build or module version, protocol and
a last-seen time under five minutes old. A renderer from the build before the registry, open
beside a new one on the same production, shows as present with an unknown build. Removing the registry writes for one production that keeps sending
makes the dependency proof report that production's registry as unhealthy.

### AC-7: A cleanup applies only when nothing running depends on it

On staging, with a fixture cleanup removing a function that an open renderer from an older build
still calls, db-push holds the cleanup and names the renderer, its production and its build. After
that renderer reloads onto a build after `unused since`, and the window holds no older client, the
cleanup applies. Each of the four checks in L5, failed alone in a fixture, holds the cleanup by
itself and names which check held it.

### AC-8: Verified quiet ignores idle renderers and counts operating and on air

Against fixtures for the quiet read: renderers heartbeating with nothing on air and no command for
ten minutes is quiet; one Take three minutes ago is not; a graphic on air with a renderer present
and no command for an hour is not; a graphic on air in a production with no renderer seen for an
hour is quiet; only pings in the window is quiet; a read that fails is not quiet. Once timed cues
exist, an automatic action due in five minutes is not quiet. A real staging run with an open
renderer, nothing on air and no commands applies a held fixture cleanup.

### AC-9: A held file holds only the files that touch what it touches

With a *cleanup* held, a later *add* and a later ordinary migration on other objects both apply on
the same run, and a later file naming an object the held file touches is held with it and reported
as one chained hold. A held file applies at the first scheduled run that finds quiet, with no
landing in between, and its chain applies after it in number order. Afterwards production's
surface snapshot equals that of a fresh local `supabase db reset`, which applied the files in
number order.

### AC-10: A hold is visible, never red, and escalates after seven days

A held file leaves post-land green, and its summary and the drift report give the file, its age
and what holds it. A hold dated eight days old opens the rolling issue once and does not open a
second one on the next run.

### AC-11: The emergency override applies one file now and leaves a record

`--live NNNN` without `--reason` refuses and changes nothing. With a reason, it prints who is
sending and which clients depend, applies NNNN alone, and writes an override row that the next
db-push and the drift report show. A file with a dangerous statement still needs `--allow NNNN`
as well. The workflow-dispatch form behaves the same and its run log carries the reason.

### AC-12: The rules are written where the next migration author reads them

`supabase/AGENTS.md` replaces "Live-path migrations wait for a quiet window" with the three kinds,
the stall budget, the dependency proof, verified quiet and the override; `docs/CLOUD_PLAYOUT.md`
names the client registry; both backlog items above point at this spec and close when it
converges.

## Preserved behaviour

- The statement guard: refusals, `--allow NNNN`, fail-closed on unknown statements, the
  before/after diff, the drifted-ledger refusal, the advisors after every push, the timeouts rule
  for every file from 0068, the lock-timeout retries.
- Both hosted projects get every migration, and post-land stays the only normal route.
- Ordinary (non-surface) migrations apply on landing exactly as today.
- AC-17 of `playout-runtime-reliability`: old pages and old outputs keep working on the new schema.
- The landed app works without its own surface migration, as the held class already requires.

## Non-goals

- Telling old clients to reload (a server-side minimum protocol). Prepare for Live already moves
  renderers at a safe moment; a stuck cleanup only costs dead weight, and L8 names who holds it.
- Supabase preview branches or any new paid service; staging and CI are free.
- Changing a migration that is already applied, or re-classing 0068 to 0073.
- Exported packages: `src/export` makes no database call at `fa0347180`. If an export ever
  embeds one, what it calls is a permanent surface object, never cleaned up, because an exported
  file is never updated.
- Anything in the editor, library or community paths; they are not the live surface.

## Verification

- Offline gates in `npm run build`: AC-1, AC-2, the static half of AC-3, and AC-9's hold and
  chain decisions as pure functions over fixture plans.
- CI legs on the branch for AC-4, with the seeded failures in the receipt.
- Staging only, never production, for AC-3's measurement, AC-5 to AC-9 and AC-11; the receipt
  gives run ids and the figures. Production evidence is the first real surface landing after the
  build, recorded as its own rung.
- Never touch the owner's studio setup, deck or Companion: AC-6 uses a separate staging
  production and a separate Companion instance started for the test.

## Decisions for the owner

None open. Two derived choices sit closest to his intent, and either is overruled with one line:

- L3: a Take delayed by at most one second, with nothing failed or lost, is not an interruption.
  A smaller budget means fewer *add* migrations qualify, and the rest wait for quiet.
- L6: a graphic on air with a renderer watching it counts as active playout, so a production that
  keeps a bug on air around the clock keeps every *change* and *cleanup* waiting until someone
  uses the override. Counting only operating (commands) instead would let them apply under a
  standing bug, protected by the dependency proof alone.
